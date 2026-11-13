/**
 * Controller of character LCDs (HD44780), as far as the Arduino libraries
 * use it: 4 and 8-bit buses, two lines, custom characters and scrolling.
 */

export const LCD_COLUMNS = 16;
export const LCD_ROWS = 2;
/** Characters each line holds in memory (only 16 are visible). */
const LINE_LENGTH = 40;
const SECOND_LINE = 0x40;
const MEMORY_END = SECOND_LINE + LINE_LENGTH;

export class Hd44780 {
  private readonly ddram = new Uint8Array(MEMORY_END).fill(0x20);
  private readonly cgram = new Uint8Array(64);
  private address = 0;
  private inCgram = false;
  private increment = true;
  private shiftOnWrite = false;
  private displayOn = false;
  private cursor = false;
  private blink = false;
  /** The chip wakes up with an 8-bit bus; the libraries switch it to 4 bits. */
  private eightBit = true;
  private pending: number | null = null;
  private shift = 0;
  /** Something visible changed since the last report(). */
  dirty = true;

  /** One enable pulse. `low` is null when only D4-D7 are wired. */
  pulse(rs: boolean, high: number, low: number | null): void {
    if (this.eightBit) {
      this.execute(rs, ((high & 15) << 4) | ((low ?? 0) & 15));
    } else if (this.pending === null) {
      this.pending = high & 15;
    } else {
      const byte = (this.pending << 4) | (high & 15);
      this.pending = null;
      this.execute(rs, byte);
    }
  }

  private execute(rs: boolean, byte: number): void {
    this.dirty = true;
    if (rs) this.write(byte);
    else this.command(byte);
  }

  private command(code: number): void {
    if (code & 0x80) {
      this.address = code & 0x7f;
      this.inCgram = false;
    } else if (code & 0x40) {
      this.address = code & 0x3f;
      this.inCgram = true;
    } else if (code & 0x20) {
      const eightBit = (code & 0x10) !== 0;
      if (eightBit !== this.eightBit) this.pending = null;
      this.eightBit = eightBit;
    } else if (code & 0x10) {
      const right = (code & 0x04) !== 0;
      if (code & 0x08) this.shift += right ? -1 : 1;
      else this.step(right ? 1 : -1);
    } else if (code & 0x08) {
      this.displayOn = (code & 0x04) !== 0;
      this.cursor = (code & 0x02) !== 0;
      this.blink = (code & 0x01) !== 0;
    } else if (code & 0x04) {
      this.increment = (code & 0x02) !== 0;
      this.shiftOnWrite = (code & 0x01) !== 0;
    } else if (code & 0x02) {
      this.address = 0;
      this.inCgram = false;
      this.shift = 0;
    } else if (code & 0x01) {
      this.ddram.fill(0x20);
      this.address = 0;
      this.inCgram = false;
      this.shift = 0;
      this.increment = true;
    }
  }

  private write(byte: number): void {
    const delta = this.increment ? 1 : -1;
    if (this.inCgram) {
      this.cgram[this.address & 63] = byte & 0x1f;
      this.address = (this.address + delta) & 63;
      return;
    }
    if (this.address < MEMORY_END) this.ddram[this.address] = byte;
    this.step(delta);
    if (this.shiftOnWrite) this.shift += delta;
  }

  /** Moves the cursor, jumping between the two lines at their ends. */
  private step(delta: number): void {
    let next = this.address + delta;
    if (next === LINE_LENGTH) next = SECOND_LINE;
    else if (next >= MEMORY_END) next = 0;
    else if (next < 0) next = MEMORY_END - 1;
    else if (next === SECOND_LINE - 1) next = LINE_LENGTH - 1;
    this.address = next;
  }

  /** Character code shown at a screen position. */
  charAt(row: number, column: number): number {
    const offset = (((column + this.shift) % LINE_LENGTH) + LINE_LENGTH) % LINE_LENGTH;
    return this.ddram[row * SECOND_LINE + offset] ?? 0x20;
  }

  /** Screen cell under the cursor, or -1 when it is hidden or off-screen. */
  private cursorCell(): number {
    if (!this.displayOn || this.inCgram || !(this.cursor || this.blink)) return -1;
    const row = this.address >= SECOND_LINE ? 1 : 0;
    const offset = (this.address - row * SECOND_LINE - this.shift) % LINE_LENGTH;
    const column = (offset + LINE_LENGTH) % LINE_LENGTH;
    return column < LCD_COLUMNS ? row * LCD_COLUMNS + column : -1;
  }

  /** Sends what the screen shows to the footprint and clears `dirty`. */
  report(aux: (key: string, value: number) => void, powered: boolean): void {
    this.dirty = false;
    const visible = powered && this.displayOn;
    for (let row = 0; row < LCD_ROWS; row++) {
      for (let column = 0; column < LCD_COLUMNS; column++) {
        aux(`c${row * LCD_COLUMNS + column}`, visible ? this.charAt(row, column) : 0x20);
      }
    }
    for (let index = 0; index < 64; index++) aux(`g${index}`, this.cgram[index] ?? 0);
    aux('cur', powered ? this.cursorCell() : -1);
  }
}

/** A few codes of the LCD's character ROM that differ from ASCII. */
const SPECIAL: Record<number, string> = {
  0x5c: '¥',
  0x7e: '→',
  0x7f: '←',
  0xdf: '°',
  0xe0: 'α',
  0xe2: 'β',
  0xe4: 'µ',
  0xf4: 'Ω',
  0xf7: 'π',
  0xff: '█',
};

const ESCAPES: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;' };

const CELL_WIDTH = 9;
const CELL_HEIGHT = 15;

/**
 * Draws the screen contents reported by Hd44780.report(), with its top-left
 * corner at (x, y). The screen measures 144 x 30 units.
 */
export function lcdScreen(
  aux: Record<string, number> | undefined,
  x: number,
  y: number,
  backlight: boolean,
): string {
  const ink = backlight ? '#10240a' : '#2a3320';
  let cells = '';
  for (let index = 0; index < LCD_COLUMNS * LCD_ROWS; index++) {
    const code = aux?.[`c${index}`] ?? 0x20;
    const left = x + (index % LCD_COLUMNS) * CELL_WIDTH;
    const top = y + Math.floor(index / LCD_COLUMNS) * CELL_HEIGHT;
    cells += `<rect x="${left + 0.6}" y="${top + 0.8}" width="${CELL_WIDTH - 1.2}" height="${CELL_HEIGHT - 1.6}" fill="#000000" fill-opacity="0.06"/>`;
    if (code < 16) {
      // Custom character: eight rows of five dots.
      const base = (code & 7) * 8;
      for (let row = 0; row < 8; row++) {
        const bits = aux?.[`g${base + row}`] ?? 0;
        for (let dot = 0; dot < 5; dot++) {
          if (bits & (16 >> dot)) {
            cells += `<rect x="${(left + 1 + dot * 1.4).toFixed(1)}" y="${(top + 1.6 + row * 1.5).toFixed(1)}" width="1.3" height="1.4" fill="${ink}"/>`;
          }
        }
      }
    } else if (code !== 0x20) {
      const char = SPECIAL[code] ?? (code < 0x7e ? String.fromCharCode(code) : '');
      if (char) {
        cells += `<text x="${left + CELL_WIDTH / 2}" y="${top + 11.5}" font-size="11" font-family="monospace" font-weight="bold" text-anchor="middle" fill="${ink}">${ESCAPES[char] ?? char}</text>`;
      }
    }
    if (aux?.cur === index) {
      cells += `<rect x="${left + 1}" y="${top + 12.4}" width="${CELL_WIDTH - 2}" height="1.4" fill="${ink}"/>`;
    }
  }
  return `<rect x="${x - 3}" y="${y - 3}" width="150" height="36" rx="1.5" fill="${backlight ? '#b9d83c' : '#6f7d3a'}"/>${cells}`;
}
