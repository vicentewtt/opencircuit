import { numberProp, type PartDef } from '../types';

const DIGIT_COLORS = [
  '#1b1b1b',
  '#7a4a21',
  '#d32f2f',
  '#ef7d1a',
  '#f4d21f',
  '#2e9e4f',
  '#2962c9',
  '#8e44ad',
  '#8a8a8a',
  '#f5f5f5',
] as const;
const GOLD = '#c9a227';
const SILVER = '#b8bcc2';

const digitColor = (digit: number): string => DIGIT_COLORS[digit] ?? DIGIT_COLORS[0];

/** Colors of the two digit bands and the multiplier band for a resistance. */
export function bandColors(ohms: number): [string, string, string] {
  if (!(ohms > 0)) return [digitColor(0), digitColor(0), digitColor(0)];
  let exponent = Math.floor(Math.log10(ohms)) - 1;
  let digits = Math.round(ohms / 10 ** exponent);
  if (digits >= 100) {
    digits = Math.round(digits / 10);
    exponent += 1;
  }
  let multiplier = digitColor(0);
  if (exponent >= 0 && exponent <= 9) multiplier = digitColor(exponent);
  else if (exponent === -1) multiplier = GOLD;
  else if (exponent === -2) multiplier = SILVER;
  return [digitColor(Math.floor(digits / 10)), digitColor(digits % 10), multiplier];
}

const resistor: PartDef = {
  type: 'resistor',
  category: 'passive',
  name: { es: 'Resistencia', en: 'Resistor' },
  keywords: ['resistor', 'resistencia', 'ohm', 'r'],
  refPrefix: 'R',
  bounds: { x: -30, y: -8, width: 60, height: 16 },
  pins: [
    { id: '1', name: { es: 'Terminal 1', en: 'Terminal 1' }, x: -30, y: 0 },
    { id: '2', name: { es: 'Terminal 2', en: 'Terminal 2' }, x: 30, y: 0 },
  ],
  props: [
    {
      kind: 'number',
      key: 'resistance',
      label: { es: 'Resistencia', en: 'Resistance' },
      unit: 'Ω',
      si: true,
      default: 220,
      min: 0.1,
      max: 1e9,
    },
    {
      kind: 'number',
      key: 'power',
      label: { es: 'Potencia máxima', en: 'Power rating' },
      unit: 'W',
      si: true,
      default: 0.25,
      min: 0.01,
      max: 1000,
    },
  ],
  model: (ctx) => [
    {
      name: 'main',
      kind: 'resistor',
      a: ctx.pin('1'),
      b: ctx.pin('2'),
      ohms: numberProp(ctx.props, 'resistance', 220),
    },
  ],
  faults: (props) => [
    {
      element: 'main',
      quantity: 'power',
      max: numberProp(props, 'power', 0.25),
      cause: 'overpower',
      action: 'burn',
      tolerance: 0.5,
    },
  ],
  footprint: (props) => {
    const [first, second, multiplier] = bandColors(numberProp(props, 'resistance', 220));
    return `
      <path d="M-30 0H-17M17 0H30" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
      <rect x="-17" y="-6" width="34" height="12" rx="5" fill="#d9b98a" stroke="#a88555"/>
      <rect x="-12" y="-6" width="3" height="12" fill="${first}"/>
      <rect x="-6" y="-6" width="3" height="12" fill="${second}"/>
      <rect x="0" y="-6" width="3" height="12" fill="${multiplier}"/>
      <rect x="9" y="-6" width="3" height="12" fill="${GOLD}"/>`;
  },
};

export default resistor;
