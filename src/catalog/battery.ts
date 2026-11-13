import { numberProp, type PartDef, type PinDef } from './types';

/** Batteries and battery holders: an ideal source behind an internal resistance. */

export interface BatteryLayout {
  type: string;
  name: { es: string; en: string };
  keywords: string[];
  volts: number;
  /** Internal resistance in ohms. */
  ohms: number;
  /** Current above which a short-circuit warning is shown. */
  maxAmps: number;
  shape: 'cell' | 'holder' | 'coin';
  /** Label drawn on the body. */
  label: string;
  color: string;
}

const LEADS =
  '<path d="M-10 30V18M10 30V18" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>';

const SHAPES: Record<
  BatteryLayout['shape'],
  { bounds: PartDef['bounds']; pins: [number, number][]; draw: (b: BatteryLayout) => string }
> = {
  // Single cylindrical cell lying flat: negative on the left, positive on the right.
  cell: {
    bounds: { x: -30, y: -9, width: 60, height: 18 },
    pins: [
      [30, 0],
      [-30, 0],
    ],
    draw: (b) => `
      <path d="M-30 0H-24M26 0H30" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"/>
      <rect x="-24" y="-8" width="46" height="16" rx="2" fill="${b.color}" stroke="#111315"/>
      <rect x="-24" y="-8" width="9" height="16" rx="2" fill="#2a2d31"/>
      <rect x="22" y="-3" width="4" height="6" fill="#c3c8cd" stroke="#70777e"/>
      <text x="4" y="2.5" font-size="6.5" font-family="monospace" text-anchor="middle" fill="#ffffff">${b.label}</text>
      <path d="M15 -5v4M13 -3h4" stroke="#ffffff" stroke-width="1.2"/>`,
  },
  // Plastic holder with two leads.
  holder: {
    bounds: { x: -30, y: -30, width: 60, height: 60 },
    pins: [
      [-10, 30],
      [10, 30],
    ],
    draw: (b) => `
      ${LEADS}
      <rect x="-30" y="-30" width="60" height="50" rx="3" fill="#2a2d31" stroke="#111315"/>
      <rect x="-25" y="-25" width="50" height="19" rx="3" fill="${b.color}"/>
      <rect x="-25" y="-4" width="50" height="19" rx="3" fill="${b.color}"/>
      <text x="0" y="-12" font-size="7" font-family="monospace" text-anchor="middle" fill="#ffffff">${b.label}</text>
      <circle cx="-10" cy="18" r="2.5" fill="#d32f2f"/>
      <circle cx="10" cy="18" r="2.5" fill="#111315" stroke="#70777e"/>`,
  },
  coin: {
    bounds: { x: -16, y: -18, width: 32, height: 38 },
    pins: [
      [-10, 20],
      [10, 20],
    ],
    draw: (b) => `
      <path d="M-10 20V8M10 20V8" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="0" cy="-2" r="15" fill="#c3c8cd" stroke="#70777e"/>
      <circle cx="0" cy="-2" r="11" fill="none" stroke="#9aa0a6"/>
      <text x="0" y="0" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#30353a">${b.label}</text>
      <path d="M-12 12h4M-10 10v4" stroke="#d32f2f" stroke-width="1.2"/>`,
  },
};

export function battery(layout: BatteryLayout): PartDef {
  const shape = SHAPES[layout.shape];
  const [positive, negative] = shape.pins;
  const pins: PinDef[] = [
    { id: 'positive', name: { es: 'Positivo (+)', en: 'Positive (+)' }, x: positive?.[0] ?? 0, y: positive?.[1] ?? 0 },
    { id: 'negative', name: { es: 'Negativo (−)', en: 'Negative (−)' }, x: negative?.[0] ?? 0, y: negative?.[1] ?? 0 },
  ];
  return {
    type: layout.type,
    category: 'source',
    name: layout.name,
    keywords: ['bateria', 'battery', 'pila', 'fuente', ...layout.keywords],
    refPrefix: 'BT',
    bounds: shape.bounds,
    pins,
    props: [
      {
        kind: 'number',
        key: 'voltage',
        label: { es: 'Voltaje', en: 'Voltage' },
        unit: 'V',
        si: true,
        default: layout.volts,
        min: 0,
        max: layout.volts * 1.5,
      },
    ],
    model: (ctx) => {
      const emf = ctx.internal('emf');
      return [
        {
          name: 'main',
          kind: 'vsource',
          p: emf,
          n: ctx.pin('negative'),
          volts: numberProp(ctx.props, 'voltage', layout.volts),
        },
        { name: 'rint', kind: 'resistor', a: emf, b: ctx.pin('positive'), ohms: layout.ohms },
      ];
    },
    faults: () => [
      {
        element: 'main',
        quantity: 'current',
        max: layout.maxAmps,
        cause: 'short-circuit',
        action: 'warn',
      },
    ],
    footprint: () => shape.draw(layout),
  };
}
