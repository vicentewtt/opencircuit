import { numberProp, type PartDef } from '../types';

const potentiometer: PartDef = {
  type: 'potentiometer',
  category: 'passive',
  name: { es: 'Potenciómetro', en: 'Potentiometer' },
  keywords: ['potenciometro', 'potentiometer', 'pot', 'trimmer', 'variable'],
  refPrefix: 'RV',
  bounds: { x: -16, y: -20, width: 32, height: 40 },
  pins: [
    { id: '1', name: { es: 'Terminal 1', en: 'Terminal 1' }, x: -10, y: 20 },
    { id: 'wiper', name: { es: 'Cursor', en: 'Wiper' }, x: 0, y: 20 },
    { id: '2', name: { es: 'Terminal 2', en: 'Terminal 2' }, x: 10, y: 20 },
  ],
  props: [
    {
      kind: 'number',
      key: 'resistance',
      label: { es: 'Resistencia total', en: 'Total resistance' },
      unit: 'Ω',
      si: true,
      default: 10e3,
      min: 1,
      max: 1e8,
    },
    {
      kind: 'number',
      key: 'position',
      label: { es: 'Posición del cursor', en: 'Wiper position' },
      unit: '%',
      si: false,
      default: 50,
      min: 0,
      max: 100,
    },
  ],
  model: (ctx) => {
    const total = numberProp(ctx.props, 'resistance', 10e3);
    const fraction = numberProp(ctx.props, 'position', 50) / 100;
    // A fully turned wiper still has some contact resistance.
    return [
      {
        name: 'a',
        kind: 'resistor',
        a: ctx.pin('1'),
        b: ctx.pin('wiper'),
        ohms: Math.max(total * fraction, 0.5),
      },
      {
        name: 'b',
        kind: 'resistor',
        a: ctx.pin('wiper'),
        b: ctx.pin('2'),
        ohms: Math.max(total * (1 - fraction), 0.5),
      },
    ];
  },
  faults: () => [
    { element: 'a', quantity: 'power', max: 0.5, cause: 'overpower', action: 'burn', tolerance: 0.5 },
    { element: 'b', quantity: 'power', max: 0.5, cause: 'overpower', action: 'burn', tolerance: 0.5 },
  ],
  footprint: (props) => {
    const angle = -135 + (numberProp(props, 'position', 50) / 100) * 270;
    return `
      <path d="M-10 20V8M0 20V8M10 20V8" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="0" cy="-4" r="16" fill="#2f6fbf" stroke="#1d4780"/>
      <circle cx="0" cy="-4" r="9" fill="#e6e9ec" stroke="#8f969d"/>
      <path d="M0 -4V-12" stroke="#30353a" stroke-width="2.5" stroke-linecap="round" transform="rotate(${angle.toFixed(1)} 0 -4)"/>`;
  },
};

export default potentiometer;
