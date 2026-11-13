import { numberProp, type PartDef } from '../types';

const fuse: PartDef = {
  type: 'fuse',
  category: 'passive',
  name: { es: 'Fusible', en: 'Fuse' },
  keywords: ['fusible', 'fuse', 'proteccion', 'protection'],
  refPrefix: 'F',
  bounds: { x: -30, y: -7, width: 60, height: 14 },
  pins: [
    { id: '1', name: { es: 'Terminal 1', en: 'Terminal 1' }, x: -30, y: 0 },
    { id: '2', name: { es: 'Terminal 2', en: 'Terminal 2' }, x: 30, y: 0 },
  ],
  props: [
    {
      kind: 'number',
      key: 'rating',
      label: { es: 'Corriente nominal', en: 'Rated current' },
      unit: 'A',
      si: true,
      default: 0.5,
      min: 0.01,
      max: 30,
    },
  ],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('1'), b: ctx.pin('2'), ohms: 0.05 },
  ],
  faults: (props) => [
    {
      element: 'main',
      quantity: 'current',
      max: numberProp(props, 'rating', 0.5),
      cause: 'fuse-blown',
      action: 'burn',
      tolerance: 0.05,
    },
  ],
  footprint: (_props, visual) => `
    <path d="M-30 0H-18M18 0H30" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
    <rect x="-13" y="-5" width="26" height="10" fill="#dfe9ee" fill-opacity="0.7" stroke="#8f969d"/>
    ${
      visual?.burned
        ? '<path d="M-13 0H-5M5 0H13" stroke="#30353a" stroke-width="1.2" fill="none"/><circle cx="0" cy="0" r="4" fill="#30353a" fill-opacity="0.55"/>'
        : '<path d="M-13 0H13" stroke="#30353a" stroke-width="1.2" fill="none"/>'
    }
    <rect x="-18" y="-6" width="6" height="12" rx="1" fill="#c3c8cd" stroke="#70777e"/>
    <rect x="12" y="-6" width="6" height="12" rx="1" fill="#c3c8cd" stroke="#70777e"/>`,
};

export default fuse;
