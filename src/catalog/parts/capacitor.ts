import { numberProp, type PartDef } from '../types';

const capacitor: PartDef = {
  type: 'capacitor',
  category: 'passive',
  name: { es: 'Condensador cerámico', en: 'Ceramic capacitor' },
  keywords: ['condensador', 'capacitor', 'ceramico', 'ceramic', 'faradio', 'farad', 'c'],
  refPrefix: 'C',
  bounds: { x: -13, y: -16, width: 26, height: 36 },
  pins: [
    { id: '1', name: { es: 'Terminal 1', en: 'Terminal 1' }, x: -10, y: 20 },
    { id: '2', name: { es: 'Terminal 2', en: 'Terminal 2' }, x: 10, y: 20 },
  ],
  props: [
    {
      kind: 'number',
      key: 'capacitance',
      label: { es: 'Capacidad', en: 'Capacitance' },
      unit: 'F',
      si: true,
      default: 100e-9,
      min: 1e-12,
      max: 1,
    },
  ],
  model: (ctx) => [
    {
      name: 'main',
      kind: 'capacitor',
      a: ctx.pin('1'),
      b: ctx.pin('2'),
      farads: numberProp(ctx.props, 'capacitance', 100e-9),
    },
  ],
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 50, cause: 'overvoltage', action: 'burn' },
  ],
  footprint: () => `
    <path d="M-10 20V2M10 20V2" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
    <ellipse cx="0" cy="-4" rx="12" ry="11" fill="#d98f2b" stroke="#9c6218"/>
    <path d="M-6 -9a8 7 0 0 1 6 -4" stroke="#ffffff" stroke-opacity="0.45" stroke-width="2" stroke-linecap="round" fill="none"/>`,
};

export default capacitor;
