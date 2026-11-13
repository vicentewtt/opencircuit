import { formatSi } from '../../lib/si';
import { numberProp, type PartDef } from '../types';

const dcSupply: PartDef = {
  type: 'dc-supply',
  category: 'source',
  name: { es: 'Fuente DC regulable', en: 'Adjustable DC supply' },
  keywords: ['fuente', 'supply', 'power', 'dc', 'regulable', 'variable', 'laboratorio', 'bench'],
  refPrefix: 'PS',
  bounds: { x: -40, y: -36, width: 80, height: 76 },
  pins: [
    { id: 'positive', name: { es: 'Positivo (+)', en: 'Positive (+)' }, x: -10, y: 40 },
    { id: 'negative', name: { es: 'Negativo (−)', en: 'Negative (−)' }, x: 10, y: 40 },
  ],
  props: [
    {
      kind: 'number',
      key: 'voltage',
      label: { es: 'Voltaje', en: 'Voltage' },
      unit: 'V',
      si: true,
      default: 5,
      min: 0,
      max: 30,
      slider: true,
    },
    {
      kind: 'number',
      key: 'limit',
      label: { es: 'Aviso de corriente sobre', en: 'Warn when current exceeds' },
      unit: 'A',
      si: true,
      default: 1,
      min: 0.01,
      max: 5,
    },
  ],
  model: (ctx) => {
    const source = ctx.internal('source');
    return [
      {
        name: 'main',
        kind: 'vsource',
        p: source,
        n: ctx.pin('negative'),
        volts: numberProp(ctx.props, 'voltage', 5),
      },
      { name: 'rout', kind: 'resistor', a: source, b: ctx.pin('positive'), ohms: 0.05 },
    ];
  },
  faults: (props) => [
    {
      element: 'main',
      quantity: 'current',
      max: numberProp(props, 'limit', 1),
      cause: 'short-circuit',
      action: 'warn',
    },
  ],
  footprint: (props, visual) => `
    <rect x="-40" y="-36" width="80" height="64" rx="5" fill="#d7dbde" stroke="#8f969d"/>
    <rect x="-34" y="-31" width="68" height="28" rx="2" fill="#0e1513" stroke="#30353a"/>
    <text x="30" y="-19" font-size="9" font-family="monospace" text-anchor="end" fill="#ff7b72">${formatSi(numberProp(props, 'voltage', 5), 'V')}</text>
    <text x="30" y="-8" font-size="7" font-family="monospace" text-anchor="end" fill="#5fbf5f">${formatSi(Math.abs(visual?.iMean ?? visual?.i ?? 0), 'A')}</text>
    <circle cx="-22" cy="8" r="7" fill="#3a3e43" stroke="#111315"/>
    <circle cx="22" cy="8" r="7" fill="#3a3e43" stroke="#111315"/>
    <circle cx="-10" cy="22" r="4" fill="#b3261e" stroke="#70777e"/>
    <circle cx="10" cy="22" r="4" fill="#111315" stroke="#70777e"/>
    <path d="M-10 26V40M10 26V40" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"/>`,
};

export default dcSupply;
