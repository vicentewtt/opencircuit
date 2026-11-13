import type { ElementSpec } from '../model';
import type { PartDef } from '../types';

const CHANNELS = ['d0', 'd1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7'];

const logicAnalyzer: PartDef = {
  type: 'logic-analyzer',
  category: 'instrument',
  name: { es: 'Analizador lógico', en: 'Logic analyzer' },
  keywords: ['analizador', 'logico', 'logic', 'analyzer', 'digital', 'señales', 'signals'],
  refPrefix: 'LA',
  bounds: { x: -60, y: -20, width: 120, height: 50 },
  pins: [
    ...CHANNELS.map((id, i) => ({
      id,
      name: { es: `Canal D${i}`, en: `Channel D${i}` },
      x: -40 + i * 10,
      y: 30,
    })),
    { id: 'gnd', name: { es: 'Tierra (GND)', en: 'Ground (GND)' }, x: 50, y: 30 },
  ],
  props: [],
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
  scope: { channels: CHANNELS, digital: true },
  footprint: () => `
    <rect x="-60" y="-20" width="120" height="38" rx="4" fill="#2a2d31" stroke="#111315"/>
    <path d="M-50 -4h8v-8h10v8h6v-8h14v8h8" fill="none" stroke="#3fb6c9" stroke-width="1.5"/>
    <text x="20" y="-4" font-size="7" font-family="monospace" fill="#c9cdd2">8 CH</text>
    ${CHANNELS.map(
      (_, i) =>
        `<rect x="${-43 + i * 10}" y="8" width="6" height="8" fill="#c3c8cd"/>
         <path d="M${-40 + i * 10} 16V30" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"/>
         <text x="${-40 + i * 10}" y="6" font-size="4.5" font-family="monospace" text-anchor="middle" fill="#c9cdd2">${i}</text>`,
    ).join('')}
    <rect x="47" y="8" width="6" height="8" fill="#111315" stroke="#70777e"/>
    <path d="M50 16V30" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"/>`,
};

export default logicAnalyzer;
