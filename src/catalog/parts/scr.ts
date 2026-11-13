import { to220 } from '../regulator';
import type { PartDef } from '../types';

/** Gate current that fires the device and anode current below which it turns off. */
const GATE_TRIGGER = 0.001;
const HOLDING = 0.005;

/**
 * Thyristor: once a gate pulse fires it, it keeps conducting from anode to
 * cathode until the current drops below the holding current.
 */
const scr: PartDef = {
  type: 'scr',
  category: 'semiconductor',
  name: { es: 'Tiristor (SCR)', en: 'Thyristor (SCR)' },
  keywords: ['scr', 'tiristor', 'thyristor', 'tic106', 'rectificador controlado', 'controlled rectifier'],
  refPrefix: 'Q',
  bounds: { x: -14, y: -24, width: 28, height: 44 },
  pins: [
    { id: 'K', name: { es: 'Cátodo (K)', en: 'Cathode (K)' }, x: -10, y: 20 },
    { id: 'A', name: { es: 'Ánodo (A)', en: 'Anode (A)' }, x: 0, y: 20 },
    { id: 'G', name: { es: 'Compuerta (G)', en: 'Gate (G)' }, x: 10, y: 20 },
  ],
  props: [],
  model: (ctx) => {
    const junction = ctx.internal('junction');
    const gate = ctx.internal('gate');
    return [
      { name: 'main', kind: 'diode', a: ctx.pin('A'), k: junction, is: 1e-12, n: 1.5 },
      { name: 'latch', kind: 'switch', a: junction, b: ctx.pin('K'), ohms: 0.05 },
      { name: 'gate', kind: 'diode', a: ctx.pin('G'), k: gate, is: 1e-12, n: 1.5 },
      { name: 'rgate', kind: 'resistor', a: gate, b: ctx.pin('K'), ohms: 100 },
    ];
  },
  behavior: {
    init: () => ({ on: 0, settle: 0 }),
    update: (io, state) => {
      if (state.on !== 1) {
        if (io.i('gate') > GATE_TRIGGER && io.v('A', 'K') > 0.8) {
          state.on = 1;
          // Give the load current two steps to build up before checking it.
          state.settle = 2;
        }
      } else if ((state.settle ?? 0) > 0) {
        state.settle = (state.settle ?? 0) - 1;
      } else if (io.i('main') < HOLDING) {
        state.on = 0;
      }
      io.setSwitch('latch', state.on === 1);
    },
  },
  faults: () => [
    { element: 'main', quantity: 'current', max: 4, cause: 'overcurrent', action: 'burn' },
  ],
  footprint: () => to220('SCR'),
};

export default scr;
