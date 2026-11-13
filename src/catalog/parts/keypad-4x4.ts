import type { ClickZone, ElementSpec } from '../model';
import { same, type PartDef, type PinDef } from '../types';

const LABELS = ['123A', '456B', '789C', '*0#D'];
const INDEXES = [0, 1, 2, 3];
const keyX = (column: number): number => -30 + column * 20;
const keyY = (row: number): number => -34 + row * 20;
/** Name of the control behind each key: k<row><column>. */
export const keyInput = (row: number, column: number): string => `k${row}${column}`;

const PINS: PinDef[] = [
  ...INDEXES.map((row) => ({ id: `R${row + 1}`, name: same(`Fila ${row + 1} · Row ${row + 1}`), x: -40 + row * 10, y: 50 })),
  ...INDEXES.map((column) => ({ id: `C${column + 1}`, name: same(`Columna ${column + 1} · Column ${column + 1}`), x: column * 10, y: 50 })),
];

const ZONES: ClickZone[] = INDEXES.flatMap((row) =>
  INDEXES.map((column) => ({
    x: keyX(column) - 9,
    y: keyY(row) - 9,
    width: 18,
    height: 18,
    action: { kind: 'momentary' as const, input: keyInput(row, column) },
  })),
);

/** Membrane keypad: each key joins the wire of its row with the wire of its column. */
const keypad: PartDef = {
  type: 'keypad-4x4',
  category: 'input',
  name: { es: 'Teclado matricial 4x4', en: '4x4 matrix keypad' },
  keywords: ['teclado', 'keypad', 'matricial', 'matrix', '4x4', 'membrana', 'teclas', 'keys'],
  refPrefix: 'KP',
  bounds: { x: -46, y: -50, width: 92, height: 100 },
  pins: PINS,
  props: [],
  model: (ctx) =>
    INDEXES.flatMap((row) =>
      INDEXES.flatMap((column): ElementSpec[] =>
        ctx.input(keyInput(row, column)) > 0
          ? [{ name: keyInput(row, column), kind: 'resistor', a: ctx.pin(`R${row + 1}`), b: ctx.pin(`C${column + 1}`), ohms: 1 }]
          : [],
      ),
    ),
  interactive: { kind: 'zones', zones: ZONES },
  footprint: () => {
    const keys = INDEXES.flatMap((row) =>
      INDEXES.map((column) => {
        const label = LABELS[row]?.[column] ?? '';
        const special = column === 3 || row === 3 && column !== 1;
        return `<rect x="${keyX(column) - 8}" y="${keyY(row) - 8}" width="16" height="16" rx="3" fill="${special ? '#c0392b' : '#2f6fbf'}" stroke="#0f1113"/>
          <text x="${keyX(column)}" y="${keyY(row) + 3.5}" font-size="10" font-family="monospace" font-weight="bold" text-anchor="middle" fill="#ffffff">${label}</text>`;
      }),
    ).join('');
    return `
      <path d="${PINS.map((pin) => `M${pin.x} 50V40`).join('')}" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="-46" y="-50" width="92" height="92" rx="4" fill="#24272b" stroke="#0f1113"/>
      ${keys}`;
  },
};

export default keypad;
