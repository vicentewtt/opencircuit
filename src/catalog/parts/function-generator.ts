import { formatSi } from '../../lib/si';
import type { Waveform } from '../model';
import { numberProp, stringProp, type PartDef, type PartProps } from '../types';

const waveOf = (props: PartProps): Waveform['type'] => {
  const wave = stringProp(props, 'wave', 'sine');
  return wave === 'square' || wave === 'triangle' ? wave : 'sine';
};

const ICONS: Record<Waveform['type'], string> = {
  sine: 'M-26 -20c5 -16 10 -16 15 0s10 16 15 0',
  square: 'M-26 -12v-16h10v16h10v-16h10',
  triangle: 'M-26 -12l7.5 -16 7.5 16 7.5 -16 7.5 16',
};

const functionGenerator: PartDef = {
  type: 'function-generator',
  category: 'instrument',
  name: { es: 'Generador de funciones', en: 'Function generator' },
  keywords: ['generador', 'funciones', 'generator', 'function', 'seno', 'sine', 'cuadrada', 'square', 'triangular', 'señal'],
  refPrefix: 'FG',
  bounds: { x: -40, y: -36, width: 80, height: 76 },
  pins: [
    { id: 'out', name: { es: 'Salida (+)', en: 'Output (+)' }, x: -10, y: 40 },
    { id: 'gnd', name: { es: 'Tierra (−)', en: 'Ground (−)' }, x: 10, y: 40 },
  ],
  props: [
    {
      kind: 'select',
      key: 'wave',
      label: { es: 'Forma de onda', en: 'Waveform' },
      default: 'sine',
      options: [
        { value: 'sine', label: { es: 'Seno', en: 'Sine' } },
        { value: 'square', label: { es: 'Cuadrada', en: 'Square' } },
        { value: 'triangle', label: { es: 'Triangular', en: 'Triangle' } },
      ],
    },
    {
      kind: 'number',
      key: 'frequency',
      label: { es: 'Frecuencia', en: 'Frequency' },
      unit: 'Hz',
      si: true,
      default: 100,
      min: 0.1,
      // The solver takes 20 000 steps per simulated second.
      max: 2000,
    },
    {
      kind: 'number',
      key: 'amplitude',
      label: { es: 'Amplitud (pico)', en: 'Amplitude (peak)' },
      unit: 'V',
      si: true,
      default: 5,
      min: 0,
      max: 20,
    },
    {
      kind: 'number',
      key: 'offset',
      label: { es: 'Desplazamiento (offset)', en: 'Offset' },
      unit: 'V',
      si: true,
      default: 0,
      min: -20,
      max: 20,
    },
  ],
  model: (ctx) => {
    const source = ctx.internal('source');
    return [
      {
        name: 'main',
        kind: 'vsource',
        p: source,
        n: ctx.pin('gnd'),
        volts: 0,
        wave: {
          type: waveOf(ctx.props),
          frequency: numberProp(ctx.props, 'frequency', 100),
          amplitude: numberProp(ctx.props, 'amplitude', 5),
          offset: numberProp(ctx.props, 'offset', 0),
          phase: 0,
        },
      },
      // Standard 50 Ω output.
      { name: 'rout', kind: 'resistor', a: source, b: ctx.pin('out'), ohms: 50 },
    ];
  },
  faults: () => [
    { element: 'main', quantity: 'current', max: 0.5, cause: 'short-circuit', action: 'warn' },
  ],
  footprint: (props) => `
    <rect x="-40" y="-36" width="80" height="64" rx="5" fill="#d7dbde" stroke="#8f969d"/>
    <rect x="-34" y="-31" width="68" height="24" rx="2" fill="#0e1513" stroke="#30353a"/>
    <path d="${ICONS[waveOf(props)]}" fill="none" stroke="#5fbf5f" stroke-width="1.5"/>
    <text x="31" y="-15" font-size="7" font-family="monospace" text-anchor="end" fill="#5fbf5f">${formatSi(numberProp(props, 'frequency', 100), 'Hz')}</text>
    <circle cx="-22" cy="6" r="7" fill="#3a3e43" stroke="#111315"/>
    <circle cx="0" cy="6" r="7" fill="#3a3e43" stroke="#111315"/>
    <circle cx="22" cy="6" r="7" fill="#3a3e43" stroke="#111315"/>
    <circle cx="-10" cy="22" r="4" fill="#b3261e" stroke="#70777e"/>
    <circle cx="10" cy="22" r="4" fill="#111315" stroke="#70777e"/>
    <path d="M-10 26V40M10 26V40" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"/>`,
};

export default functionGenerator;
