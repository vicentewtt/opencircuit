import { numberProp, type PartDef } from '../types';

const inductor: PartDef = {
  type: 'inductor',
  category: 'passive',
  name: { es: 'Inductor', en: 'Inductor' },
  keywords: ['inductor', 'bobina', 'coil', 'henrio', 'henry', 'l', 'choque', 'choke'],
  refPrefix: 'L',
  bounds: { x: -30, y: -8, width: 60, height: 16 },
  pins: [
    { id: '1', name: { es: 'Terminal 1', en: 'Terminal 1' }, x: -30, y: 0 },
    { id: '2', name: { es: 'Terminal 2', en: 'Terminal 2' }, x: 30, y: 0 },
  ],
  props: [
    {
      kind: 'number',
      key: 'inductance',
      label: { es: 'Inductancia', en: 'Inductance' },
      unit: 'H',
      si: true,
      default: 10e-3,
      min: 1e-9,
      max: 100,
    },
  ],
  model: (ctx) => [
    {
      name: 'main',
      kind: 'inductor',
      a: ctx.pin('1'),
      b: ctx.pin('2'),
      henries: numberProp(ctx.props, 'inductance', 10e-3),
    },
  ],
  footprint: () => `
    <path d="M-30 0H-16M16 0H30" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
    <rect x="-16" y="-7" width="32" height="14" rx="6" fill="#3f8f5f" stroke="#286241"/>
    <path d="M-9 -7V7M-3 -7V7M3 -7V7M9 -7V7" stroke="#286241" stroke-width="1.5" fill="none"/>`,
};

export default inductor;
