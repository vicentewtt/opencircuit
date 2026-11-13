import type { ElementSpec, FaultRule } from '../model';
import type { PartDef } from '../types';

const DIODES: [name: string, anode: string, cathode: string][] = [
  ['d1', 'ac1', 'positive'],
  ['d2', 'ac2', 'positive'],
  ['d3', 'negative', 'ac1'],
  ['d4', 'negative', 'ac2'],
];

const bridge: PartDef = {
  type: 'bridge-rectifier',
  category: 'semiconductor',
  name: { es: 'Puente rectificador', en: 'Bridge rectifier' },
  keywords: ['puente', 'rectificador', 'bridge', 'rectifier', 'diodos', 'graetz', 'kbp'],
  refPrefix: 'BR',
  bounds: { x: -17, y: -16, width: 44, height: 36 },
  pins: [
    { id: 'positive', name: { es: 'Salida +', en: 'Output +' }, x: -10, y: 20 },
    { id: 'ac1', name: { es: 'Entrada alterna 1 (~)', en: 'AC input 1 (~)' }, x: 0, y: 20 },
    { id: 'ac2', name: { es: 'Entrada alterna 2 (~)', en: 'AC input 2 (~)' }, x: 10, y: 20 },
    { id: 'negative', name: { es: 'Salida −', en: 'Output −' }, x: 20, y: 20 },
  ],
  props: [],
  model: (ctx) =>
    DIODES.map(
      ([name, anode, cathode]): ElementSpec => ({
        name,
        kind: 'diode',
        a: ctx.pin(anode),
        k: ctx.pin(cathode),
        is: 7e-9,
        n: 1.8,
      }),
    ),
  faults: () =>
    DIODES.map(
      ([name]): FaultRule => ({
        element: name,
        quantity: 'current',
        max: 1.5,
        cause: 'overcurrent',
        action: 'burn',
      }),
    ),
  footprint: () => `
    <path d="M-10 20V4M0 20V4M10 20V4M20 20V4" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M-17 -16H21l6 6V5H-17z" fill="#24272b" stroke="#0f1113"/>
    <text x="-10" y="1" font-size="6" font-family="monospace" text-anchor="middle" fill="#c9cdd2">+</text>
    <text x="0" y="1" font-size="6" font-family="monospace" text-anchor="middle" fill="#c9cdd2">~</text>
    <text x="10" y="1" font-size="6" font-family="monospace" text-anchor="middle" fill="#c9cdd2">~</text>
    <text x="20" y="1" font-size="6" font-family="monospace" text-anchor="middle" fill="#c9cdd2">−</text>`,
};

export default bridge;
