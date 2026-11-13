import { SQRT2, terminal } from '../industrial';
import { stringProp, type PartDef, type PartProps } from '../types';

const COLORS: Record<string, { on: string; off: string }> = {
  red: { on: '#ff3b30', off: '#6e2520' },
  green: { on: '#34d058', off: '#1f5a2d' },
  yellow: { on: '#ffd60a', off: '#6f6014' },
  blue: { on: '#3b9dff', off: '#1d3f66' },
  white: { on: '#ffffff', off: '#8f969d' },
};
const LABELS: Record<string, { es: string; en: string }> = {
  red: { es: 'Rojo', en: 'Red' },
  green: { es: 'Verde', en: 'Green' },
  yellow: { es: 'Amarillo', en: 'Yellow' },
  blue: { es: 'Azul', en: 'Blue' },
  white: { es: 'Blanco', en: 'White' },
};
/** Rated voltage and resistance of each version. */
const VERSIONS: Record<string, { volts: number; ohms: number }> = {
  '24': { volts: 24, ohms: 1200 },
  '220': { volts: 220, ohms: 33000 },
};
const versionOf = (props: PartProps) => VERSIONS[stringProp(props, 'voltage')] ?? { volts: 220, ohms: 33000 };

/** Panel indicator light, for 24 V or 220 V (AC or DC). */
const lamp: PartDef = {
  type: 'pilot-lamp',
  category: 'industrial',
  name: { es: 'Luz piloto', en: 'Pilot light' },
  keywords: ['piloto', 'pilot', 'luz', 'lampara', 'lamp', 'indicador', 'indicator', 'señalizacion', 'industrial'],
  refPrefix: 'H',
  bounds: { x: -14, y: -30, width: 28, height: 60 },
  pins: [terminal('X1', 0, -30), terminal('X2', 0, 30)],
  props: [
    {
      kind: 'select',
      key: 'color',
      label: { es: 'Color', en: 'Color' },
      default: 'green',
      options: Object.entries(LABELS).map(([value, label]) => ({ value, label })),
    },
    {
      kind: 'select',
      key: 'voltage',
      label: { es: 'Voltaje nominal', en: 'Rated voltage' },
      default: '220',
      options: [
        { value: '24', label: { es: '24 V', en: '24 V' } },
        { value: '220', label: { es: '220 V', en: '220 V' } },
      ],
    },
  ],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('X1'), b: ctx.pin('X2'), ohms: versionOf(ctx.props).ohms },
  ],
  faults: (props) => [
    {
      element: 'main',
      quantity: 'voltage',
      max: versionOf(props).volts * SQRT2 * 1.4,
      cause: 'overvoltage',
      action: 'burn',
      tolerance: 0.3,
    },
  ],
  footprint: (props, visual) => {
    const color = COLORS[stringProp(props, 'color')] ?? { on: '#34d058', off: '#1f5a2d' };
    const level = visual?.burned ? 0 : Math.min(1, (visual?.vRms ?? 0) / versionOf(props).volts);
    const lit = level > 0.5;
    return `
      <path d="M0 -30V-14M0 30V14" stroke="#9aa0a6" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="0" cy="0" r="14" fill="#c3c8cd" stroke="#70777e"/>
      ${lit ? `<circle cx="0" cy="0" r="18" fill="${color.on}" fill-opacity="0.3"/>` : ''}
      <circle cx="0" cy="0" r="10.5" fill="${lit ? color.on : color.off}" stroke="#00000055"/>
      <path d="M-5 -5a7 7 0 0 1 6 -3" fill="none" stroke="#ffffff" stroke-opacity="0.6" stroke-width="1.4" stroke-linecap="round"/>`;
  },
};

export default lamp;
