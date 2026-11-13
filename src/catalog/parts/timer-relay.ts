import { COIL_PROP, coilElement, coilEnergized, coilFault, dinBody, terminal } from '../industrial';
import { numberProp, stringProp, type PartDef } from '../types';

const PINS = [
  terminal('A1', -20, -40, 'Alimentación A1', 'Supply A1'),
  terminal('15', 10, -40, 'Común 15', 'Common 15'),
  terminal('A2', -20, 40, 'Alimentación A2', 'Supply A2'),
  terminal('16', 0, 40, 'Normalmente cerrado 16', 'Normally closed 16'),
  terminal('18', 20, 40, 'Normalmente abierto 18', 'Normally open 18'),
];
const BOUNDS = { x: -30, y: -40, width: 60, height: 80 };

/**
 * Timer relay with a changeover contact (15 common, 16 NC, 18 NO).
 * On-delay: the contact switches some time after A1-A2 is powered.
 * Off-delay: it switches at once and returns some time after power is removed.
 */
const timer: PartDef = {
  type: 'timer-relay',
  category: 'industrial',
  name: { es: 'Temporizador (relé de tiempo)', en: 'Timer relay' },
  keywords: ['temporizador', 'timer', 'rele de tiempo', 'retardo', 'delay', 'ton', 'tof', 'conexion', 'desconexion', 'industrial'],
  refPrefix: 'KT',
  bounds: BOUNDS,
  pins: PINS,
  props: [
    {
      kind: 'select',
      key: 'mode',
      label: { es: 'Función', en: 'Function' },
      default: 'on-delay',
      options: [
        { value: 'on-delay', label: { es: 'Retardo a la conexión', en: 'On-delay' } },
        { value: 'off-delay', label: { es: 'Retardo a la desconexión', en: 'Off-delay' } },
      ],
    },
    { kind: 'number', key: 'delay', label: { es: 'Tiempo', en: 'Time' }, unit: 's', si: false, default: 3, min: 0.1, max: 600 },
    COIL_PROP,
  ],
  model: (ctx) => [
    coilElement(ctx),
    { name: 'no', kind: 'switch', a: ctx.pin('15'), b: ctx.pin('18'), ohms: 0.01 },
    { name: 'nc', kind: 'switch', a: ctx.pin('15'), b: ctx.pin('16'), ohms: 0.01 },
  ],
  behavior: {
    init: () => ({ on: 0, elapsed: 0, out: 0 }),
    update: (io, state) => {
      const powered = coilEnergized(io, state);
      const delay = numberProp(io.props, 'delay', 3);
      if (stringProp(io.props, 'mode') === 'off-delay') {
        // Counts from the moment power is removed.
        state.elapsed = powered ? 0 : (state.elapsed ?? 0) + io.dt;
        if (powered) state.out = 1;
        else if (state.elapsed >= delay) state.out = 0;
      } else {
        state.elapsed = powered ? (state.elapsed ?? 0) + io.dt : 0;
        state.out = powered && state.elapsed >= delay ? 1 : 0;
      }
      io.setSwitch('no', state.out === 1);
      io.setSwitch('nc', state.out !== 1);
      io.aux('out', state.out ?? 0);
      io.aux('left', Math.max(0, delay - (state.elapsed ?? 0)));
      io.aux('powered', powered ? 1 : 0);
    },
  },
  faults: (props) => [coilFault(props)],
  footprint: (props, visual) => {
    const out = (visual?.aux?.out ?? 0) > 0;
    const shown = visual?.aux ? (visual.aux.left ?? 0) : numberProp(props, 'delay', 3);
    return dinBody(
      { pins: PINS, bounds: BOUNDS },
      stringProp(props, 'mode') === 'off-delay' ? 'OFF-DELAY' : 'ON-DELAY',
      `<rect x="-20" y="-14" width="40" height="14" rx="2" fill="#17191b"/>
       <text x="0" y="-3.5" font-size="8" font-family="monospace" text-anchor="middle" fill="#ff9d2e">${shown.toFixed(1)}s</text>
       <circle cx="-22" cy="12" r="2" fill="${(visual?.aux?.powered ?? 0) > 0 ? '#5fe07a' : '#2d5a37'}"/>
       <circle cx="22" cy="12" r="2" fill="${out ? '#ff5a4f' : '#5c1f1b'}"/>`,
    );
  },
};

export default timer;
