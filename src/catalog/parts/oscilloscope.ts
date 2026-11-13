import type { ElementSpec } from '../model';
import type { PartDef } from '../types';

const CHANNELS = ['ch1', 'ch2', 'ch3', 'ch4'];
const COLORS = ['#e2b340', '#3fb6c9', '#d264c8', '#5fbf5f'];

const oscilloscope: PartDef = {
  type: 'oscilloscope',
  category: 'instrument',
  name: { es: 'Osciloscopio', en: 'Oscilloscope' },
  keywords: ['osciloscopio', 'oscilloscope', 'scope', 'señal', 'signal', 'onda', 'wave'],
  refPrefix: 'OSC',
  bounds: { x: -60, y: -40, width: 120, height: 90 },
  pins: [
    ...CHANNELS.map((id, i) => ({
      id,
      name: { es: `Canal ${i + 1}`, en: `Channel ${i + 1}` },
      x: -40 + i * 20,
      y: 50,
    })),
    { id: 'gnd', name: { es: 'Tierra (GND)', en: 'Ground (GND)' }, x: 50, y: 50 },
  ],
  props: [],
  // Every probe is a 1 MΩ load referenced to the common ground clip.
  model: (ctx) =>
    CHANNELS.map(
      (id): ElementSpec => ({
        name: id,
        kind: 'resistor',
        a: ctx.pin(id),
        b: ctx.pin('gnd'),
        ohms: 1e6,
      }),
    ),
  scope: { channels: CHANNELS, digital: false },
  footprint: () => `
    <rect x="-60" y="-40" width="120" height="80" rx="5" fill="#d7dbde" stroke="#8f969d"/>
    <rect x="-54" y="-34" width="76" height="52" rx="2" fill="#0e1513" stroke="#30353a"/>
    <path d="M-54 -8H22M-16 -34V18" stroke="#2c3a36" stroke-width="0.8"/>
    <path d="M-52 -8c6 -22 12 -22 18 0s12 22 18 0 12 -22 18 0 12 22 18 0" fill="none" stroke="#e2b340" stroke-width="1.5"/>
    <circle cx="40" cy="-22" r="7" fill="#3a3e43" stroke="#111315"/>
    <circle cx="40" cy="-2" r="7" fill="#3a3e43" stroke="#111315"/>
    ${CHANNELS.map(
      (_, i) =>
        `<circle cx="${-40 + i * 20}" cy="32" r="5" fill="${COLORS[i]}" stroke="#30353a"/>
         <path d="M${-40 + i * 20} 37V50" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"/>`,
    ).join('')}
    <circle cx="50" cy="32" r="5" fill="#111315" stroke="#70777e"/>
    <path d="M50 37V50" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"/>`,
};

export default oscilloscope;
