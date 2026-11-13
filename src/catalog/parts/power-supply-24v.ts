import { dinBody, rms, terminal } from '../industrial';
import type { PartDef } from '../types';

const PINS = [
  terminal('L', -10, -40, 'Fase (L)', 'Line (L)'),
  terminal('N', 10, -40, 'Neutro (N)', 'Neutral (N)'),
  terminal('+24', -10, 40, 'Salida +24 V', '+24 V output'),
  terminal('0V', 10, 40, 'Salida 0 V', '0 V output'),
];
const BOUNDS = { x: -22, y: -40, width: 44, height: 80 };

/** DIN-rail power supply: 24 V DC for the control circuit, isolated from the mains. */
const supply: PartDef = {
  type: 'power-supply-24v',
  category: 'industrial',
  name: { es: 'Fuente de 24 V DC (riel DIN)', en: '24 V DC power supply (DIN rail)' },
  keywords: ['fuente', 'supply', '24v', 'dc', 'riel din', 'din rail', 'control', 'industrial'],
  refPrefix: 'G',
  bounds: BOUNDS,
  pins: PINS,
  props: [],
  model: (ctx) => {
    const stage = ctx.internal('stage');
    return [
      { name: 'main', kind: 'resistor', a: ctx.pin('L'), b: ctx.pin('N'), ohms: 4000 },
      { name: 'out', kind: 'source', p: stage, n: ctx.pin('0V') },
      { name: 'rout', kind: 'resistor', a: stage, b: ctx.pin('+24'), ohms: 0.2 },
    ];
  },
  behavior: {
    init: () => ({}),
    update: (io, state) => {
      const input = rms(state, 'input', io.v('L', 'N'), io.dt);
      io.setSource('out', input > 150 ? 24 : 0);
      io.aux('on', input > 150 ? 1 : 0);
    },
  },
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 400, cause: 'overvoltage', action: 'burn' },
    { element: 'rout', quantity: 'current', max: 2.5, cause: 'overcurrent', action: 'warn' },
  ],
  footprint: (_props, visual) =>
    dinBody(
      { pins: PINS, bounds: BOUNDS },
      '24 V DC',
      `<circle cx="0" cy="-8" r="3" fill="${(visual?.aux?.on ?? 0) > 0 ? '#5fe07a' : '#2d5a37'}"/>`,
    ),
};

export default supply;
