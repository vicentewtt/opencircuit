import { same, type PartDef, type PinDef } from './types';

/**
 * Solderless breadboards. Holes are pins on the 0.1 inch grid; the strips
 * underneath are bridges. A component "plugs in" simply by having its pins on
 * the same points as holes.
 */

const TOP_ROWS = ['a', 'b', 'c', 'd', 'e'];
const BOTTOM_ROWS = ['f', 'g', 'h', 'i', 'j'];
const TOP_Y = -60;
const BOTTOM_Y = 10;
/** Power rails: two above and two below the terminal area. */
const RAILS = [
  { id: 'tp', y: -100, positive: true },
  { id: 'tn', y: -90, positive: false },
  { id: 'bp', y: 80, positive: true },
  { id: 'bn', y: 90, positive: false },
];

export interface BreadboardLayout {
  type: string;
  name: { es: string; en: string };
  keywords: string[];
  columns: number;
  /** Column index placed at x = 0. */
  originColumn: number;
  /** Rail holes come in groups of five; null for boards without rails. */
  rails: { firstColumn: number; groups: number } | null;
}

export function breadboard(layout: BreadboardLayout): PartDef {
  const xOf = (column: number): number => (column - layout.originColumn) * 10;
  const pins: PinDef[] = [];
  const bridges: [string, string][] = [];

  for (let column = 0; column < layout.columns; column++) {
    for (const [rows, startY] of [
      [TOP_ROWS, TOP_Y],
      [BOTTOM_ROWS, BOTTOM_Y],
    ] as const) {
      rows.forEach((row, index) => {
        const id = `${row}${column + 1}`;
        pins.push({ id, name: same(id), x: xOf(column), y: startY + index * 10 });
        // Each column of five holes is one metal strip.
        if (index > 0) bridges.push([`${rows[index - 1]}${column + 1}`, id]);
      });
    }
  }

  const railColumns: number[] = [];
  if (layout.rails) {
    for (let group = 0; group < layout.rails.groups; group++) {
      for (let k = 0; k < 5; k++) railColumns.push(layout.rails.firstColumn + group * 6 + k);
    }
    for (const rail of RAILS) {
      railColumns.forEach((column, index) => {
        const id = `${rail.id}${index + 1}`;
        const sign = rail.positive ? '+' : '−';
        pins.push({ id, name: same(`${sign} ${index + 1}`), x: xOf(column), y: rail.y });
        if (index > 0) bridges.push([`${rail.id}${index}`, id]);
      });
    }
  }

  const left = xOf(0) - 15;
  const width = xOf(layout.columns - 1) + 15 - left;
  const top = layout.rails ? -112 : -72;
  const height = (layout.rails ? 102 : 62) - top;

  // One path for all the holes keeps the drawing light.
  const holes = pins.map((pin) => `M${pin.x - 1.8} ${pin.y - 1.8}h3.6v3.6h-3.6z`).join('');
  const numbers: string[] = [];
  for (let column = 0; column < layout.columns; column++) {
    if (column !== 0 && (column + 1) % 5 !== 0) continue;
    for (const y of [TOP_Y - 7, BOTTOM_Y + 49]) {
      numbers.push(
        `<text x="${xOf(column)}" y="${y}" font-size="4.5" font-family="monospace" text-anchor="middle" fill="#8a8f94">${column + 1}</text>`,
      );
    }
  }
  const letters = [...TOP_ROWS, ...BOTTOM_ROWS]
    .map((row, index) => {
      const y = (index < 5 ? TOP_Y + index * 10 : BOTTOM_Y + (index - 5) * 10) + 1.6;
      return `<text x="${left + 5}" y="${y}" font-size="4.5" font-family="monospace" text-anchor="middle" fill="#8a8f94">${row}</text>`;
    })
    .join('');
  const railLines = layout.rails
    ? RAILS.map((rail) => {
        const y = rail.y + (rail.positive ? -5.5 : 5.5);
        const from = xOf(railColumns[0] ?? 0) - 6;
        const to = xOf(railColumns[railColumns.length - 1] ?? 0) + 6;
        return `<path d="M${from} ${y}H${to}" stroke="${rail.positive ? '#d32f2f' : '#2962c9'}" stroke-width="1"/>`;
      }).join('')
    : '';

  const markup = `
    <rect x="${left}" y="${top}" width="${width}" height="${height}" rx="4" fill="#f1eee2" stroke="#b9b5a5"/>
    <rect x="${left}" y="-17" width="${width}" height="24" fill="#e3dfd0"/>
    ${railLines}
    <path d="${holes}" fill="#3a3d40"/>
    ${numbers.join('')}
    ${letters}`;

  return {
    type: layout.type,
    category: 'board',
    name: layout.name,
    keywords: layout.keywords,
    refPrefix: 'BB',
    layer: 'base',
    bounds: { x: left, y: top, width, height },
    pins,
    props: [],
    bridges,
    footprint: () => markup,
  };
}
