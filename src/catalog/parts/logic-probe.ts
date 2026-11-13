import { stringProp, type PartDef } from '../types';

/** Seconds a LED stays lit after its level was last seen, and after a change. */
const HOLD = 0.05;
const PULSE_HOLD = 0.2;

/**
 * Logic probe: clip it to the supply of the circuit and touch a point with
 * the tip. Red means high, green means low, yellow blinks when the level
 * changes; with no LED lit the point is floating or at an invalid level.
 */
const probe: PartDef = {
  type: 'logic-probe',
  category: 'instrument',
  name: { es: 'Punta lógica', en: 'Logic probe' },
  keywords: ['punta logica', 'logic probe', 'sonda', 'probe', 'ttl', 'cmos', 'nivel', 'level', 'digital'],
  refPrefix: 'LP',
  bounds: { x: -14, y: -50, width: 28, height: 100 },
  pins: [
    { id: 'TIP', name: { es: 'Punta', en: 'Tip' }, x: 0, y: -50 },
    { id: 'VCC', name: { es: 'Caimán rojo (+)', en: 'Red clip (+)' }, x: -10, y: 50 },
    { id: 'GND', name: { es: 'Caimán negro (−)', en: 'Black clip (−)' }, x: 10, y: 50 },
  ],
  props: [
    {
      kind: 'select',
      key: 'family',
      label: { es: 'Familia lógica', en: 'Logic family' },
      default: 'ttl',
      options: [
        { value: 'ttl', label: { es: 'TTL (bajo < 0,8 V, alto > 2,3 V)', en: 'TTL (low < 0.8 V, high > 2.3 V)' } },
        { value: 'cmos', label: { es: 'CMOS (30 % y 70 % de la fuente)', en: 'CMOS (30 % and 70 % of the supply)' } },
      ],
    },
  ],
  model: (ctx) => {
    const bias = ctx.internal('bias');
    return [
      { name: 'main', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('GND'), ohms: 2000 },
      // The tip rests at an in-between level, so a floating point lights nothing.
      { name: 'bias', kind: 'source', p: bias, n: ctx.pin('GND') },
      { name: 'input', kind: 'resistor', a: ctx.pin('TIP'), b: bias, ohms: 1e6 },
    ];
  },
  behavior: {
    init: () => ({ high: 1, low: 1, pulse: 1, last: 0 }),
    update: (io, state) => {
      const supply = io.v('VCC', 'GND');
      const powered = supply > 3;
      const ttl = stringProp(io.props, 'family') !== 'cmos';
      const lowLimit = ttl ? 0.8 : 0.3 * supply;
      const highLimit = ttl ? 2.3 : 0.7 * supply;
      io.setSource('bias', powered ? (lowLimit + highLimit) / 2 : 0);

      const volts = io.v('TIP', 'GND');
      const level = !powered ? 0 : volts > highLimit ? 1 : volts < lowLimit ? -1 : 0;
      // Each counter holds the time since that LED was last triggered.
      state.high = level === 1 ? 0 : (state.high ?? 1) + io.dt;
      state.low = level === -1 ? 0 : (state.low ?? 1) + io.dt;
      const changed = level !== 0 && state.last !== 0 && level !== state.last;
      state.pulse = changed ? 0 : (state.pulse ?? 1) + io.dt;
      if (level !== 0) state.last = level;
      if (!powered) state.last = 0;

      io.aux('high', powered && state.high < HOLD ? 1 : 0);
      io.aux('low', powered && state.low < HOLD ? 1 : 0);
      io.aux('pulse', powered && state.pulse < PULSE_HOLD ? 1 : 0);
    },
  },
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 20, cause: 'overvoltage', action: 'burn' },
    { element: 'main', quantity: 'reverse-voltage', max: 1, cause: 'reverse-polarity', action: 'burn' },
  ],
  footprint: (props, visual) => {
    const aux = visual?.burned ? undefined : visual?.aux;
    const led = (y: number, on: boolean, lit: string, dark: string, label: string): string =>
      `<circle cx="-3" cy="${y}" r="3.2" fill="${on ? lit : dark}" stroke="#00000055" stroke-width="0.5"/>
       <text x="6" y="${y + 1.8}" font-size="4.6" font-family="monospace" text-anchor="middle" fill="#e9f1fb">${label}</text>`;
    return `
      <path d="M-10 50V34" stroke="#d93025" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M10 50V34" stroke="#17191b" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M0 -50V-30" stroke="#9aa0a6" stroke-width="1.8" stroke-linecap="round"/>
      <path d="M-5 -30h10l5 10v52a4 4 0 0 1 -4 4h-12a4 4 0 0 1 -4 -4v-52z" fill="#2f6fbf" stroke="#1d4780"/>
      ${led(-12, (aux?.high ?? 0) > 0, '#ff3b30', '#5c1f1b', 'HI')}
      ${led(0, (aux?.low ?? 0) > 0, '#34d058', '#1f5a2d', 'LO')}
      ${led(12, (aux?.pulse ?? 0) > 0, '#ffd60a', '#6f6014', 'P')}
      <text x="0" y="28" font-size="4.6" font-family="monospace" text-anchor="middle" fill="#e9f1fb">${stringProp(props, 'family') === 'cmos' ? 'CMOS' : 'TTL'}</text>`;
  },
};

export default probe;
