import { stringProp, type PartDef, type PartProps } from '../types';

/** Junction parameters and maximum forward current of each diode type. */
const MODELS: Record<string, { is: number; n: number; max: number }> = {
  '1n4007': { is: 7e-9, n: 1.8, max: 1 },
  '1n4148': { is: 2.5e-9, n: 1.75, max: 0.3 },
  // Schottky: about 0.35 V at 1 A.
  '1n5819': { is: 3e-6, n: 1.05, max: 1 },
};
const DEFAULT_MODEL = { is: 7e-9, n: 1.8, max: 1 };

const modelOf = (props: PartProps): { is: number; n: number; max: number } =>
  MODELS[stringProp(props, 'model')] ?? DEFAULT_MODEL;

const diode: PartDef = {
  type: 'diode',
  category: 'semiconductor',
  name: { es: 'Diodo', en: 'Diode' },
  keywords: ['diodo', 'diode', '1n4007', '1n4148', 'rectificador', 'rectifier'],
  refPrefix: 'D',
  bounds: { x: -30, y: -7, width: 60, height: 14 },
  pins: [
    { id: 'anode', name: { es: 'Ánodo (+)', en: 'Anode (+)' }, x: -30, y: 0 },
    { id: 'cathode', name: { es: 'Cátodo (−)', en: 'Cathode (−)' }, x: 30, y: 0 },
  ],
  props: [
    {
      kind: 'select',
      key: 'model',
      label: { es: 'Tipo', en: 'Type' },
      default: '1n4007',
      options: [
        { value: '1n4007', label: { es: '1N4007 (rectificador, 1 A)', en: '1N4007 (rectifier, 1 A)' } },
        { value: '1n4148', label: { es: '1N4148 (señal, 300 mA)', en: '1N4148 (signal, 300 mA)' } },
        { value: '1n5819', label: { es: '1N5819 (Schottky, 1 A)', en: '1N5819 (Schottky, 1 A)' } },
      ],
    },
  ],
  model: (ctx) => {
    const type = modelOf(ctx.props);
    return [
      { name: 'main', kind: 'diode', a: ctx.pin('anode'), k: ctx.pin('cathode'), is: type.is, n: type.n },
    ];
  },
  faults: (props) => [
    {
      element: 'main',
      quantity: 'current',
      max: modelOf(props).max,
      cause: 'overcurrent',
      action: 'burn',
    },
  ],
  footprint: () => `
    <path d="M-30 0H-14M14 0H30" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
    <rect x="-14" y="-5" width="28" height="10" rx="2" fill="#24272b" stroke="#0f1113"/>
    <rect x="7" y="-5" width="4" height="10" fill="#c9cdd2"/>`,
};

export default diode;
