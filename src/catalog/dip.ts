import type { LocalizedText } from './types';

/**
 * Dual in-line packages. Rows are 0.3 inch apart so the part straddles the
 * center gap of a breadboard. Pin 1 is bottom-left; numbering goes
 * counter-clockwise, as seen from above with the notch on the left.
 */

export const DIP_TOP_Y = -10;
export const DIP_BOTTOM_Y = 20;

/** x of the k-th pin (0-based, left to right) of a row with `perRow` pins. */
export const dipX = (k: number, perRow: number): number => (k - Math.floor(perRow / 2)) * 10;

export interface DipPin {
  id: string;
  name: LocalizedText;
  x: number;
  y: number;
}

/** Pins of a DIP given their names in pin-number order (1, 2, ...). */
export function dipPins(pins: { id: string; name: LocalizedText }[]): DipPin[] {
  const perRow = pins.length / 2;
  return pins.map((pin, index) =>
    index < perRow
      ? { ...pin, x: dipX(index, perRow), y: DIP_BOTTOM_Y }
      : { ...pin, x: dipX(pins.length - 1 - index, perRow), y: DIP_TOP_Y },
  );
}

export function dipBounds(perRow: number): { x: number; y: number; width: number; height: number } {
  return { x: dipX(0, perRow) - 7, y: DIP_TOP_Y - 2, width: (perRow - 1) * 10 + 14, height: 34 };
}

/** Black plastic body with legs, notch and a label. */
export function dipBody(perRow: number, label: string): string {
  const left = dipX(0, perRow) - 6;
  const width = (perRow - 1) * 10 + 12;
  let legs = '';
  for (let k = 0; k < perRow; k++) {
    const x = dipX(k, perRow);
    legs += `M${x} ${DIP_TOP_Y}v5M${x} ${DIP_BOTTOM_Y}v-5`;
  }
  return `
    <path d="${legs}" stroke="#c3c8cd" stroke-width="3" fill="none"/>
    <rect x="${left}" y="-6" width="${width}" height="22" rx="1.5" fill="#24272b" stroke="#0f1113"/>
    <path d="M${left} 2a3 3 0 0 1 0 6" fill="#0f1113"/>
    <text x="${left + width / 2 + 1}" y="7.2" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#c9cdd2">${label}</text>`;
}
