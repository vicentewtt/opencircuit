import type { ElementSpec } from '../model';
import { SQRT2, rms, terminal } from '../industrial';
import { display } from '../meters';
import { numberProp, stringProp, type PartDef } from '../types';

const PINS = [
  terminal('L1', -50, -50),
  terminal('L2', -30, -50),
  terminal('L3', -10, -50),
  terminal('24V', 20, -50, 'Salida de 24 V para las entradas', '24 V output for the inputs'),
  terminal('DI1', 30, -50, 'DI1: marcha adelante', 'DI1: run forward'),
  terminal('DI2', 40, -50, 'DI2: marcha atrás', 'DI2: run reverse'),
  terminal('U', -50, 50),
  terminal('V', -30, 50),
  terminal('W', -10, 50),
  terminal('10V', 20, 50, 'Salida de 10 V para el potenciómetro', '10 V output for the potentiometer'),
  terminal('AI', 30, 50, 'AI: referencia de 0 a 10 V', 'AI: 0 to 10 V reference'),
  terminal('COM', 40, 50, 'Común de control', 'Control common'),
];
const OUTPUTS = ['U', 'V', 'W'];
/** Rated output: 380 V between lines at 50 Hz. */
const RATED_VOLTS = 380;
const RATED_HERTZ = 50;
/** Voltage kept at low speed so the motor still has torque. */
const BOOST = 0.2;

/**
 * Variable frequency drive: takes three-phase mains and feeds the motor
 * with a frequency (and voltage) of its own, so the speed can be chosen
 * and changes smoothly. It runs while DI1 or DI2 receives 24 V.
 */
const vfd: PartDef = {
  type: 'vfd',
  category: 'industrial',
  name: { es: 'Variador de frecuencia', en: 'Variable frequency drive' },
  keywords: ['variador', 'vfd', 'frecuencia', 'frequency', 'drive', 'inversor', 'inverter', 'velocidad', 'speed', 'rampa', 'industrial'],
  refPrefix: 'U',
  bounds: { x: -60, y: -50, width: 110, height: 100 },
  pins: PINS,
  props: [
    {
      kind: 'select',
      key: 'reference',
      label: { es: 'Referencia de velocidad', en: 'Speed reference' },
      default: 'panel',
      options: [
        { value: 'panel', label: { es: 'Panel (frecuencia fija)', en: 'Panel (set frequency)' } },
        { value: 'analog', label: { es: 'Entrada analógica AI (0-10 V)', en: 'Analog input AI (0-10 V)' } },
      ],
    },
    { kind: 'number', key: 'frequency', label: { es: 'Frecuencia del panel', en: 'Panel frequency' }, unit: 'Hz', si: false, default: 50, min: 0, max: 100, slider: true },
    { kind: 'number', key: 'maxFrequency', label: { es: 'Frecuencia máxima', en: 'Maximum frequency' }, unit: 'Hz', si: false, default: 50, min: 10, max: 100 },
    { kind: 'number', key: 'ramp', label: { es: 'Tiempo de rampa', en: 'Ramp time' }, unit: 's', si: false, default: 2, min: 0.1, max: 60 },
  ],
  model: (ctx) => {
    const star = ctx.internal('star');
    const supply24 = ctx.internal('supply24');
    const supply10 = ctx.internal('supply10');
    return [
      { name: 'main', kind: 'resistor', a: ctx.pin('L1'), b: ctx.pin('L2'), ohms: 100e3 },
      { name: 'in:23', kind: 'resistor', a: ctx.pin('L2'), b: ctx.pin('L3'), ohms: 100e3 },
      { name: 'in:31', kind: 'resistor', a: ctx.pin('L3'), b: ctx.pin('L1'), ohms: 100e3 },
      ...OUTPUTS.flatMap((phase): ElementSpec[] => {
        const stage = ctx.internal(`stage:${phase}`);
        return [
          { name: `out:${phase}`, kind: 'source', p: stage, n: star },
          { name: `line:${phase}`, kind: 'resistor', a: stage, b: ctx.pin(phase), ohms: 0.5 },
        ];
      }),
      { name: 'p24', kind: 'source', p: supply24, n: ctx.pin('COM') },
      { name: 'r24', kind: 'resistor', a: supply24, b: ctx.pin('24V'), ohms: 100 },
      { name: 'p10', kind: 'source', p: supply10, n: ctx.pin('COM') },
      { name: 'r10', kind: 'resistor', a: supply10, b: ctx.pin('10V'), ohms: 100 },
      { name: 'di1', kind: 'resistor', a: ctx.pin('DI1'), b: ctx.pin('COM'), ohms: 10e3 },
      { name: 'di2', kind: 'resistor', a: ctx.pin('DI2'), b: ctx.pin('COM'), ohms: 10e3 },
      { name: 'ai', kind: 'resistor', a: ctx.pin('AI'), b: ctx.pin('COM'), ohms: 100e3 },
    ];
  },
  behavior: {
    init: () => ({ hertz: 0, angle: 0 }),
    update: (io, state) => {
      const powered = rms(state, 'input', io.v('L1', 'L2'), io.dt) > 0.8 * RATED_VOLTS;
      io.setSource('p24', powered ? 24 : 0);
      io.setSource('p10', powered ? 10 : 0);

      const limit = numberProp(io.props, 'maxFrequency', RATED_HERTZ);
      const direction = !powered ? 0 : io.v('DI1', 'COM') > 15 ? 1 : io.v('DI2', 'COM') > 15 ? -1 : 0;
      const reference =
        stringProp(io.props, 'reference') === 'analog'
          ? (Math.max(0, Math.min(10, io.v('AI', 'COM'))) / 10) * limit
          : Math.min(limit, numberProp(io.props, 'frequency', RATED_HERTZ));
      // The frequency moves towards the target along the ramp, also when reversing.
      const reach = (limit / numberProp(io.props, 'ramp', 2)) * io.dt;
      const target = direction * reference;
      const hertz = powered ? (state.hertz ?? 0) + Math.max(-reach, Math.min(reach, target - (state.hertz ?? 0))) : 0;
      state.hertz = hertz;
      const angle = ((state.angle ?? 0) + 2 * Math.PI * hertz * io.dt) % (2 * Math.PI);
      state.angle = angle;

      const ratio = Math.abs(hertz) < 0.5 ? 0 : Math.max(BOOST, Math.min(1, Math.abs(hertz) / RATED_HERTZ));
      const amplitude = (RATED_VOLTS / Math.sqrt(3)) * SQRT2 * ratio;
      OUTPUTS.forEach((phase, index) => {
        io.setSource(`out:${phase}`, amplitude * Math.sin(angle - (index * 2 * Math.PI) / 3));
      });
      io.aux('hertz', hertz);
      io.aux('on', powered ? 1 : 0);
    },
  },
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 700, cause: 'overvoltage', action: 'burn' },
  ],
  footprint: (_props, visual) => {
    const on = (visual?.aux?.on ?? 0) > 0;
    const hertz = visual?.aux?.hertz ?? 0;
    const screws = PINS.map(
      (pin) => `<path d="M${pin.x} ${pin.y}V${pin.y < 0 ? -42 : 42}" stroke="#9aa0a6" stroke-width="2.4" stroke-linecap="round"/>
        <text x="${pin.x}" y="${pin.y < 0 ? -34 : 38}" font-size="4.2" font-family="monospace" text-anchor="middle" fill="#30353a">${pin.id}</text>`,
    ).join('');
    return `
      <rect x="-60" y="-42" width="110" height="84" rx="4" fill="#d9dde1" stroke="#70777e"/>
      ${screws}
      <rect x="-40" y="-24" width="70" height="44" rx="3" fill="#30353a"/>
      <g transform="translate(-5 0)">${display([on ? `${hertz.toFixed(1)} Hz` : '----'], 54, -18)}</g>
      <circle cx="-28" cy="10" r="3" fill="${on && Math.abs(hertz) > 0.5 ? '#5fe07a' : '#2d5a37'}"/>
      <text x="0" y="13" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#c9cdd2">${hertz < -0.5 ? 'REV' : hertz > 0.5 ? 'FWD' : 'STOP'}</text>`;
  },
};

export default vfd;
