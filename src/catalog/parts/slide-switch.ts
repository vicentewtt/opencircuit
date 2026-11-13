import { stringProp, type PartDef } from '../types';

const slideSwitch: PartDef = {
  type: 'slide-switch',
  category: 'input',
  name: { es: 'Interruptor deslizante', en: 'Slide switch' },
  keywords: ['interruptor', 'switch', 'deslizante', 'slide', 'spdt', 'conmutador'],
  refPrefix: 'S',
  bounds: { x: -18, y: -8, width: 36, height: 28 },
  pins: [
    { id: '1', name: { es: 'Terminal 1', en: 'Terminal 1' }, x: -10, y: 20 },
    { id: 'common', name: { es: 'Común', en: 'Common' }, x: 0, y: 20 },
    { id: '2', name: { es: 'Terminal 2', en: 'Terminal 2' }, x: 10, y: 20 },
  ],
  props: [
    {
      kind: 'select',
      key: 'position',
      label: { es: 'Posición', en: 'Position' },
      default: '1',
      options: [
        { value: '1', label: { es: 'Común con terminal 1', en: 'Common to terminal 1' } },
        { value: '2', label: { es: 'Común con terminal 2', en: 'Common to terminal 2' } },
      ],
    },
  ],
  model: (ctx) => [
    {
      name: 'main',
      kind: 'resistor',
      a: ctx.pin('common'),
      b: ctx.pin(stringProp(ctx.props, 'position') === '2' ? '2' : '1'),
      ohms: 0.01,
    },
  ],
  interactive: { kind: 'toggle', prop: 'position', values: ['1', '2'] },
  footprint: (props) => {
    const handleX = stringProp(props, 'position') === '2' ? 1 : -11;
    return `
      <path d="M-10 20V8M0 20V8M10 20V8" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
      <rect x="-18" y="-6" width="36" height="14" rx="2" fill="#2b2f33" stroke="#111315"/>
      <rect x="-13" y="-3" width="26" height="8" rx="1" fill="#0f1113"/>
      <rect x="${handleX}" y="-8" width="10" height="13" rx="1" fill="#c3c8cd" stroke="#70777e"/>`;
  },
};

export default slideSwitch;
