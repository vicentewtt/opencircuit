import type { PartDef } from '../types';

const WIDTH = 128;
const HEIGHT = 64;
const WORDS = (WIDTH * HEIGHT) / 32;
/** Commands followed by parameter bytes, and how many. */
const PARAMETERS: Record<number, number> = {
  0x20: 1, 0x21: 2, 0x22: 2, 0x26: 6, 0x27: 6, 0x29: 5, 0x2a: 5, 0x81: 1, 0x8d: 1,
  0xa3: 2, 0xa8: 1, 0xd3: 1, 0xd5: 1, 0xd9: 1, 0xda: 1, 0xdb: 1,
};
/** Size of a pixel on the footprint. */
const DOT = 0.5;
const SCREEN_X = -32;
const SCREEN_Y = -12;

/** 0.96" monochrome OLED, 128x64 pixels, on the I2C bus (address 0x3C). */
const oled: PartDef = {
  type: 'oled-ssd1306',
  category: 'output',
  name: { es: 'Pantalla OLED 128x64 (I2C)', en: 'OLED display 128x64 (I2C)' },
  keywords: ['oled', 'ssd1306', 'pantalla', 'display', 'i2c', '128x64', 'grafica', 'graphic', 'adafruit'],
  refPrefix: 'OLED',
  bounds: { x: -38, y: -40, width: 76, height: 70 },
  pins: [
    { id: 'GND', name: { es: 'GND', en: 'GND' }, x: -20, y: -40 },
    { id: 'VCC', name: { es: 'VCC (3,3 a 5 V)', en: 'VCC (3.3 to 5 V)' }, x: -10, y: -40 },
    { id: 'SCL', name: { es: 'SCL (reloj)', en: 'SCL (clock)' }, x: 0, y: -40 },
    { id: 'SDA', name: { es: 'SDA (datos)', en: 'SDA (data)' }, x: 10, y: -40 },
  ],
  props: [],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('GND'), ohms: 400 },
  ],
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 7, cause: 'overvoltage', action: 'burn' },
  ],
  digital: {
    i2c: { sda: 'SDA', scl: 'SCL', address: () => 0x3c },
    create: (io) => {
      const memory = new Uint8Array((WIDTH * HEIGHT) / 8);
      const powered = (): boolean => io.v('VCC', 'GND') > 2.7;
      let on = false;
      let inverted = false;
      let column = 0;
      let page = 0;
      let columns: [number, number] = [0, WIDTH - 1];
      let pages: [number, number] = [0, HEIGHT / 8 - 1];
      // Each transfer starts with a control byte that says what follows.
      let expectControl = true;
      let isData = false;
      let single = false;
      let command = 0;
      let wanted = 0;
      let parameters: number[] = [];
      let dirty = true;
      let shown = '';

      const run = (code: number, values: number[]): void => {
        if (code === 0x21) {
          columns = [(values[0] ?? 0) & 127, (values[1] ?? 127) & 127];
          column = columns[0];
        } else if (code === 0x22) {
          pages = [(values[0] ?? 0) & 7, (values[1] ?? 7) & 7];
          page = pages[0];
        } else if (code === 0xae || code === 0xaf) {
          on = code === 0xaf;
        } else if (code === 0xa6 || code === 0xa7) {
          inverted = code === 0xa7;
        } else if (code >= 0xb0 && code <= 0xb7) {
          page = code & 7;
        } else if (code <= 0x0f) {
          column = (column & 0xf0) | code;
        } else if (code <= 0x1f) {
          column = ((code & 0x07) << 4) | (column & 0x0f);
        }
        dirty = true;
      };

      return {
        i2c: {
          begin: () => {
            expectControl = true;
            return powered();
          },
          write: (byte) => {
            if (expectControl) {
              isData = (byte & 0x40) !== 0;
              single = (byte & 0x80) !== 0;
              expectControl = false;
            } else if (isData) {
              memory[page * WIDTH + column] = byte;
              dirty = true;
              column += 1;
              if (column > columns[1]) {
                column = columns[0];
                page = page >= pages[1] ? pages[0] : page + 1;
              }
              if (single) expectControl = true;
            } else {
              if (wanted > 0) {
                parameters.push(byte);
                wanted -= 1;
                if (wanted === 0) run(command, parameters);
              } else if (PARAMETERS[byte]) {
                command = byte;
                wanted = PARAMETERS[byte] ?? 0;
                parameters = [];
              } else {
                run(byte, []);
              }
              if (single) expectControl = true;
            }
            return true;
          },
          read: () => 0xff,
        },
        tick: () => {
          const lit = powered() && on;
          const state = `${lit}${inverted}`;
          if (!dirty && state === shown) return;
          dirty = false;
          shown = state;
          io.aux('on', lit ? 1 : 0);
          io.aux('inv', inverted ? 1 : 0);
          for (let word = 0; word < WORDS; word++) {
            const at = word * 4;
            io.aux(
              `f${word}`,
              ((memory[at] ?? 0) |
                ((memory[at + 1] ?? 0) << 8) |
                ((memory[at + 2] ?? 0) << 16) |
                ((memory[at + 3] ?? 0) << 24)) >>>
                0,
            );
          }
        },
      };
    },
  },
  footprint: (_props, visual) => {
    const aux = visual?.aux;
    let path = '';
    if (aux?.on && !visual?.burned) {
      const inverted = (aux.inv ?? 0) > 0;
      for (let y = 0; y < HEIGHT; y++) {
        const base = (y >> 3) * WIDTH;
        let start = -1;
        for (let x = 0; x <= WIDTH; x++) {
          const index = base + x;
          const byte = x < WIDTH ? ((aux[`f${index >> 2}`] ?? 0) >>> ((index & 3) * 8)) & 0xff : 0;
          const lit = x < WIDTH && (((byte >> (y & 7)) & 1) === 1) !== inverted;
          if (lit && start < 0) start = x;
          if (!lit && start >= 0) {
            const length = (x - start) * DOT;
            path += `M${SCREEN_X + start * DOT} ${SCREEN_Y + y * DOT}h${length}v${DOT}h${-length}z`;
            start = -1;
          }
        }
      }
    }
    return `
      <path d="M-20 -40V-33M-10 -40V-33M0 -40V-33M10 -40V-33" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="-38" y="-35" width="76" height="65" rx="3" fill="#1d3c78" stroke="#12264d"/>
      <circle cx="-33" cy="-30" r="2.2" fill="#d9dde1"/><circle cx="33" cy="-30" r="2.2" fill="#d9dde1"/>
      <circle cx="-33" cy="25" r="2.2" fill="#d9dde1"/><circle cx="33" cy="25" r="2.2" fill="#d9dde1"/>
      <rect x="-35" y="-16" width="70" height="40" rx="1.5" fill="#08090b"/>
      <path d="${path}" fill="#8fdcff"/>`;
  },
};

export default oled;
