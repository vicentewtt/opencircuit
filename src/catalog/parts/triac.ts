import { to220 } from '../regulator';
import type { PartDef } from '../types';

const GATE_TRIGGER = 0.01;
const HOLDING = 0.01;

/**
 * Bidirectional thyristor for alternating current: fired by a gate current
 * of either sign, it conducts both ways until the current falls to zero.
 */
const triac: PartDef = {
  type: 'triac',
  category: 'semiconductor',
  name: { es: 'Triac', en: 'Triac' },
  keywords: ['triac', 'bt136', 'tiristor', 'thyristor', 'ac', 'alterna', 'dimmer'],
  refPrefix: 'Q',
  bounds: { x: -14, y: -24, width: 28, height: 44 },
  pins: [
    { id: 'MT1', name: { es: 'Terminal principal 1 (MT1)', en: 'Main terminal 1 (MT1)' }, x: -10, y: 20 },
    { id: 'MT2', name: { es: 'Terminal principal 2 (MT2)', en: 'Main terminal 2 (MT2)' }, x: 0, y: 20 },
    { id: 'G', name: { es: 'Compuerta (G)', en: 'Gate (G)' }, x: 10, y: 20 },
  ],
  props: [],
  model: (ctx) => {
    const junction = ctx.internal('junction');
    const gate = ctx.internal('gate');
    return [
      // Two junctions back to back give the on-state drop in both directions.
      { name: 'forward', kind: 'diode', a: ctx.pin('MT2'), k: junction, is: 1e-12, n: 1.5 },
      { name: 'reverse', kind: 'diode', a: junction, k: ctx.pin('MT2'), is: 1e-12, n: 1.5 },
      { name: 'latch', kind: 'switch', a: junction, b: ctx.pin('MT1'), ohms: 0.05 },
      { name: 'gate1', kind: 'diode', a: ctx.pin('G'), k: gate, is: 1e-12, n: 1.5 },
      { name: 'gate2', kind: 'diode', a: gate, k: ctx.pin('G'), is: 1e-12, n: 1.5 },
      { name: 'rgate', kind: 'resistor', a: gate, b: ctx.pin('MT1'), ohms: 100 },
    ];
  },
  behavior: {
    init: () => ({ on: 0, settle: 0 }),
    update: (io, state) => {
      const gateAmps = Math.abs(io.i('rgate'));
      const mainAmps = Math.abs(io.i('forward') - io.i('reverse'));
      if (state.on !== 1) {
        if (gateAmps > GATE_TRIGGER && Math.abs(io.v('MT2', 'MT1')) > 0.8) {
          state.on = 1;
          state.settle = 2;
        }
      } else if ((state.settle ?? 0) > 0) {
        state.settle = (state.settle ?? 0) - 1;
      } else if (mainAmps < HOLDING) {
        state.on = 0;
      }
      io.setSwitch('latch', state.on === 1);
    },
  },
  faults: () => [
    { element: 'forward', quantity: 'current', max: 4, cause: 'overcurrent', action: 'burn' },
    { element: 'reverse', quantity: 'current', max: 4, cause: 'overcurrent', action: 'burn' },
  ],
  footprint: () => to220('TRIAC'),
};

export default triac;
