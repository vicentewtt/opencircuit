import { numberProp, type PartDef } from '../types';

const battery9v: PartDef = {
  type: 'battery-9v',
  category: 'source',
  name: { es: 'Batería 9 V', en: '9 V battery' },
  keywords: ['bateria', 'battery', 'pila', '9v', 'fuente', 'source'],
  refPrefix: 'BT',
  bounds: { x: -20, y: -40, width: 40, height: 80 },
  pins: [
    { id: 'positive', name: { es: 'Positivo (+)', en: 'Positive (+)' }, x: -10, y: -40 },
    { id: 'negative', name: { es: 'Negativo (−)', en: 'Negative (−)' }, x: 10, y: -40 },
  ],
  props: [
    {
      kind: 'number',
      key: 'voltage',
      label: { es: 'Voltaje', en: 'Voltage' },
      unit: 'V',
      si: true,
      default: 9,
      min: 0,
      max: 12,
    },
  ],
  model: (ctx) => {
    const emf = ctx.internal('emf');
    return [
      {
        name: 'main',
        kind: 'vsource',
        p: emf,
        n: ctx.pin('negative'),
        volts: numberProp(ctx.props, 'voltage', 9),
      },
      // Internal resistance of a 9 V alkaline battery.
      { name: 'rint', kind: 'resistor', a: emf, b: ctx.pin('positive'), ohms: 1.5 },
    ];
  },
  faults: () => [
    { element: 'main', quantity: 'current', max: 1, cause: 'short-circuit', action: 'warn' },
  ],
  footprint: () => `
    <rect x="-20" y="-30" width="40" height="70" rx="3" fill="#2a2d31" stroke="#111315"/>
    <rect x="-20" y="-30" width="40" height="24" rx="3" fill="#c96f2b"/>
    <rect x="-20" y="-12" width="40" height="6" fill="#c96f2b"/>
    <circle cx="-10" cy="-36" r="4" fill="#c3c8cd" stroke="#70777e"/>
    <path d="M5 -40h10l3 4-3 4H5l-3-4z" fill="#c3c8cd" stroke="#70777e"/>
    <path d="M-13 -19h6M-10 -22v6M7 -19h6" stroke="#ffffff" stroke-width="1.6" stroke-linecap="round" fill="none"/>`,
};

export default battery9v;
