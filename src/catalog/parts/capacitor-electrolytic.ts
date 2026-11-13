import { numberProp, type PartDef } from '../types';

const electrolytic: PartDef = {
  type: 'capacitor-electrolytic',
  category: 'passive',
  name: { es: 'Condensador electrolítico', en: 'Electrolytic capacitor' },
  keywords: ['condensador', 'capacitor', 'electrolitico', 'electrolytic', 'polarizado', 'polarized'],
  refPrefix: 'C',
  bounds: { x: -12, y: -22, width: 24, height: 42 },
  pins: [
    { id: 'positive', name: { es: 'Positivo (+)', en: 'Positive (+)' }, x: -10, y: 20 },
    { id: 'negative', name: { es: 'Negativo (−)', en: 'Negative (−)' }, x: 10, y: 20 },
  ],
  props: [
    {
      kind: 'number',
      key: 'capacitance',
      label: { es: 'Capacidad', en: 'Capacitance' },
      unit: 'F',
      si: true,
      default: 100e-6,
      min: 1e-9,
      max: 1,
    },
    {
      kind: 'number',
      key: 'voltage',
      label: { es: 'Voltaje máximo', en: 'Voltage rating' },
      unit: 'V',
      si: true,
      default: 16,
      min: 1,
      max: 500,
    },
  ],
  model: (ctx) => [
    {
      name: 'main',
      kind: 'capacitor',
      a: ctx.pin('positive'),
      b: ctx.pin('negative'),
      farads: numberProp(ctx.props, 'capacitance', 100e-6),
    },
  ],
  faults: (props) => [
    {
      element: 'main',
      quantity: 'reverse-voltage',
      max: 1,
      cause: 'reverse-polarity',
      action: 'burn',
    },
    {
      element: 'main',
      quantity: 'voltage',
      max: numberProp(props, 'voltage', 16),
      cause: 'overvoltage',
      action: 'burn',
    },
  ],
  footprint: () => `
    <path d="M-10 20V4M10 20V4" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
    <rect x="-12" y="-22" width="24" height="27" rx="3" fill="#1f3a6e" stroke="#12244a"/>
    <rect x="5" y="-22" width="7" height="27" rx="3" fill="#c9cdd2"/>
    <path d="M7 -14h3M7 -8h3M7 -2h3" stroke="#1f3a6e" stroke-width="1.4" stroke-linecap="round" fill="none"/>`,
};

export default electrolytic;
