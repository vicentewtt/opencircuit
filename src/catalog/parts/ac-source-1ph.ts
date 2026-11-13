import { SQRT2 } from '../industrial';
import { numberProp, type PartDef } from '../types';

/** Short-circuit warning level, in amperes RMS. */
const MAX_AMPS = 63;

/** Single-phase mains outlet: line, neutral and protective earth (joined to the neutral at the source). */
const source: PartDef = {
  type: 'ac-source-1ph',
  category: 'industrial',
  name: { es: 'Red monofásica (220 V)', en: 'Single-phase mains (220 V)' },
  keywords: ['red', 'mains', 'monofasica', 'single-phase', 'ac', 'alterna', '220', '230', 'enchufe', 'fase', 'neutro'],
  refPrefix: 'G',
  bounds: { x: -24, y: -30, width: 48, height: 70 },
  pins: [
    { id: 'L', name: { es: 'Fase (L)', en: 'Line (L)' }, x: -10, y: 40 },
    { id: 'N', name: { es: 'Neutro (N)', en: 'Neutral (N)' }, x: 0, y: 40 },
    { id: 'PE', name: { es: 'Tierra de protección (PE)', en: 'Protective earth (PE)' }, x: 10, y: 40 },
  ],
  props: [
    { kind: 'number', key: 'voltage', label: { es: 'Voltaje (RMS)', en: 'Voltage (RMS)' }, unit: 'V', si: false, default: 220, min: 1, max: 500 },
    { kind: 'number', key: 'frequency', label: { es: 'Frecuencia', en: 'Frequency' }, unit: 'Hz', si: false, default: 50, min: 1, max: 400 },
  ],
  model: (ctx) => {
    const inner = ctx.internal('inner');
    return [
      {
        name: 'main',
        kind: 'vsource',
        p: inner,
        n: ctx.pin('N'),
        volts: 0,
        wave: {
          type: 'sine',
          amplitude: numberProp(ctx.props, 'voltage', 220) * SQRT2,
          frequency: numberProp(ctx.props, 'frequency', 50),
          offset: 0,
          phase: 0,
        },
      },
      { name: 'line', kind: 'resistor', a: inner, b: ctx.pin('L'), ohms: 0.1 },
      { name: 'earth', kind: 'resistor', a: ctx.pin('N'), b: ctx.pin('PE'), ohms: 1 },
    ];
  },
  faults: () => [
    { element: 'line', quantity: 'current', max: MAX_AMPS * SQRT2, cause: 'short-circuit', action: 'warn' },
  ],
  footprint: (props) => `
    <path d="M-10 40V28" stroke="#7a4a21" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M0 40V28" stroke="#2f6fbf" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M10 40V28" stroke="#3aa655" stroke-width="2.6" stroke-linecap="round"/>
    <rect x="-24" y="-30" width="48" height="60" rx="4" fill="#f4f5f6" stroke="#8f969d"/>
    <circle cx="0" cy="-6" r="15" fill="#ffffff" stroke="#8f969d"/>
    <path d="M-9 -6q4.5 -9 9 0t9 0" fill="none" stroke="#30353a" stroke-width="1.8" stroke-linecap="round"/>
    <text x="0" y="21" font-size="6.5" font-family="monospace" text-anchor="middle" fill="#30353a">${Math.round(numberProp(props, 'voltage', 220))} V~</text>`,
};

export default source;
