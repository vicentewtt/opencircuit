import type { ElementSpec } from '../model';
import { SQRT2 } from '../industrial';
import { numberProp, type PartDef } from '../types';

const PHASES = ['L1', 'L2', 'L3'];
const COLORS = ['#7a4a21', '#17191b', '#8f969d'];
const MAX_AMPS = 63;

/** Three-phase supply with neutral: 380 V between lines, 220 V from each line to neutral. */
const source: PartDef = {
  type: 'ac-source-3ph',
  category: 'industrial',
  name: { es: 'Red trifásica (380 V)', en: 'Three-phase mains (380 V)' },
  keywords: ['red', 'mains', 'trifasica', 'three-phase', 'ac', 'alterna', '380', '400', 'fases', 'neutro'],
  refPrefix: 'G',
  bounds: { x: -34, y: -30, width: 68, height: 70 },
  pins: [
    { id: 'L1', name: { es: 'Fase L1', en: 'Line L1' }, x: -20, y: 40 },
    { id: 'L2', name: { es: 'Fase L2', en: 'Line L2' }, x: -10, y: 40 },
    { id: 'L3', name: { es: 'Fase L3', en: 'Line L3' }, x: 0, y: 40 },
    { id: 'N', name: { es: 'Neutro (N)', en: 'Neutral (N)' }, x: 10, y: 40 },
    { id: 'PE', name: { es: 'Tierra de protección (PE)', en: 'Protective earth (PE)' }, x: 20, y: 40 },
  ],
  props: [
    { kind: 'number', key: 'voltage', label: { es: 'Voltaje entre fases (RMS)', en: 'Line-to-line voltage (RMS)' }, unit: 'V', si: false, default: 380, min: 1, max: 700 },
    { kind: 'number', key: 'frequency', label: { es: 'Frecuencia', en: 'Frequency' }, unit: 'Hz', si: false, default: 50, min: 1, max: 400 },
  ],
  model: (ctx) => {
    const amplitude = (numberProp(ctx.props, 'voltage', 380) / Math.sqrt(3)) * SQRT2;
    const frequency = numberProp(ctx.props, 'frequency', 50);
    return [
      ...PHASES.flatMap((phase, index): ElementSpec[] => {
        const inner = ctx.internal(`inner:${phase}`);
        return [
          {
            name: index === 0 ? 'main' : `source:${phase}`,
            kind: 'vsource',
            p: inner,
            n: ctx.pin('N'),
            volts: 0,
            wave: { type: 'sine', amplitude, frequency, offset: 0, phase: (-index * 2 * Math.PI) / 3 },
          },
          { name: `line:${phase}`, kind: 'resistor', a: inner, b: ctx.pin(phase), ohms: 0.1 },
        ];
      }),
      { name: 'earth', kind: 'resistor', a: ctx.pin('N'), b: ctx.pin('PE'), ohms: 1 },
    ];
  },
  faults: () =>
    PHASES.map((phase) => ({
      element: `line:${phase}`,
      quantity: 'current' as const,
      max: MAX_AMPS * SQRT2,
      cause: 'short-circuit' as const,
      action: 'warn' as const,
    })),
  footprint: (props) => `
    ${PHASES.map((_, index) => `<path d="M${-20 + index * 10} 40V28" stroke="${COLORS[index]}" stroke-width="2.6" stroke-linecap="round"/>`).join('')}
    <path d="M10 40V28" stroke="#2f6fbf" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M20 40V28" stroke="#3aa655" stroke-width="2.6" stroke-linecap="round"/>
    <rect x="-34" y="-30" width="68" height="60" rx="4" fill="#f4f5f6" stroke="#8f969d"/>
    <circle cx="0" cy="-6" r="15" fill="#ffffff" stroke="#8f969d"/>
    <path d="M-9 -12q4.5 -7 9 0t9 0M-9 -6q4.5 -7 9 0t9 0M-9 0q4.5 -7 9 0t9 0" fill="none" stroke="#30353a" stroke-width="1.5" stroke-linecap="round"/>
    <text x="0" y="21" font-size="6.5" font-family="monospace" text-anchor="middle" fill="#30353a">3~ ${Math.round(numberProp(props, 'voltage', 380))} V</text>`,
};

export default source;
