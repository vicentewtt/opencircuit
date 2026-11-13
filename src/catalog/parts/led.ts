import { saturationCurrent } from '../model';
import { stringProp, type PartDef } from '../types';

interface LedColor {
  body: string;
  edge: string;
  /** Forward voltage at 20 mA and emission coefficient of the junction. */
  vf: number;
  n: number;
}

const COLORS: Record<string, LedColor> = {
  red: { body: '#e53935', edge: '#9c1f1c', vf: 1.9, n: 2 },
  green: { body: '#43a047', edge: '#2a6b2e', vf: 2.1, n: 2 },
  blue: { body: '#2f6fe0', edge: '#1c4596', vf: 3.1, n: 3 },
  yellow: { body: '#f2c81e', edge: '#a88a0c', vf: 2.0, n: 2 },
  orange: { body: '#f57c1f', edge: '#a8500f', vf: 2.0, n: 2 },
  white: { body: '#f2f4f5', edge: '#9aa0a6', vf: 3.1, n: 3 },
};

const RED: LedColor = { body: '#e53935', edge: '#9c1f1c', vf: 1.9, n: 2 };
const RATED_CURRENT = 0.02;
const MAX_CURRENT = 0.05;

const colorOf = (value: string): LedColor => COLORS[value] ?? RED;

const led: PartDef = {
  type: 'led',
  category: 'semiconductor',
  name: { es: 'LED', en: 'LED' },
  keywords: ['led', 'diodo', 'luz', 'light', 'diode'],
  refPrefix: 'D',
  bounds: { x: -14, y: -20, width: 28, height: 40 },
  pins: [
    { id: 'anode', name: { es: 'Ánodo (+)', en: 'Anode (+)' }, x: -10, y: 20 },
    { id: 'cathode', name: { es: 'Cátodo (−)', en: 'Cathode (−)' }, x: 10, y: 20 },
  ],
  props: [
    {
      kind: 'select',
      key: 'color',
      label: { es: 'Color', en: 'Color' },
      default: 'red',
      options: [
        { value: 'red', label: { es: 'Rojo', en: 'Red' } },
        { value: 'green', label: { es: 'Verde', en: 'Green' } },
        { value: 'blue', label: { es: 'Azul', en: 'Blue' } },
        { value: 'yellow', label: { es: 'Amarillo', en: 'Yellow' } },
        { value: 'orange', label: { es: 'Naranja', en: 'Orange' } },
        { value: 'white', label: { es: 'Blanco', en: 'White' } },
      ],
    },
  ],
  model: (ctx) => {
    const color = colorOf(stringProp(ctx.props, 'color'));
    return [
      {
        name: 'main',
        kind: 'diode',
        a: ctx.pin('anode'),
        k: ctx.pin('cathode'),
        is: saturationCurrent(color.vf, RATED_CURRENT, color.n),
        n: color.n,
      },
    ];
  },
  faults: () => [
    {
      element: 'main',
      quantity: 'current',
      max: MAX_CURRENT,
      cause: 'led-overcurrent',
      action: 'burn',
    },
  ],
  footprint: (props, visual) => {
    const color = colorOf(stringProp(props, 'color'));
    // Perceived brightness grows fast at low currents.
    const level = visual?.burned ? 0 : Math.min(1, Math.sqrt(Math.max(0, visual?.i ?? 0) / RATED_CURRENT));
    const glow =
      level > 0.02
        ? `<circle cx="0" cy="-6" r="${(14 + 12 * level).toFixed(1)}" fill="${color.body}" fill-opacity="${(0.4 * level).toFixed(2)}"/>`
        : '';
    return `
      ${glow}
      <path d="M-10 20V6M10 20V6" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M-12 5V-8a12 12 0 0 1 24 0V5z" fill="${color.body}" fill-opacity="${(0.55 + 0.45 * level).toFixed(2)}" stroke="${color.edge}"/>
      <rect x="-14" y="3" width="28" height="4" rx="1" fill="${color.edge}"/>
      <path d="M-7 -8a7 7 0 0 1 5 -7" stroke="#ffffff" stroke-opacity="${(0.5 + 0.4 * level).toFixed(2)}" stroke-width="2" stroke-linecap="round" fill="none"/>`;
  },
};

export default led;
