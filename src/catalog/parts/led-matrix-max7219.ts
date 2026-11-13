import type { PartDef } from '../types';

/**
 * 8x8 LED matrix module with its MAX7219 driver. Each 16-bit word is a
 * register address and a value; registers 1 to 8 hold the rows, top to
 * bottom, with the most significant bit on the left.
 */
const matrix: PartDef = {
  type: 'led-matrix-max7219',
  category: 'output',
  name: { es: 'Matriz LED 8x8 (MAX7219)', en: '8x8 LED matrix (MAX7219)' },
  keywords: ['matriz', 'matrix', 'led', '8x8', 'max7219', 'ledcontrol', 'spi', 'shiftout'],
  refPrefix: 'DS',
  bounds: { x: -60, y: -42, width: 102, height: 84 },
  pins: [
    { id: 'VCC', name: { es: 'VCC (5 V)', en: 'VCC (5 V)' }, x: -60, y: -20 },
    { id: 'GND', name: { es: 'GND', en: 'GND' }, x: -60, y: -10 },
    { id: 'DIN', name: { es: 'DIN (datos)', en: 'DIN (data)' }, x: -60, y: 0 },
    { id: 'CS', name: { es: 'CS (carga)', en: 'CS (load)' }, x: -60, y: 10 },
    { id: 'CLK', name: { es: 'CLK (reloj)', en: 'CLK (clock)' }, x: -60, y: 20 },
  ],
  props: [],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('GND'), ohms: 100 },
  ],
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 7, cause: 'overvoltage', action: 'burn' },
  ],
  digital: {
    watch: ['CLK', 'CS'],
    spi: { mosi: 'DIN', sck: 'CLK' },
    create: (io) => {
      const rows = new Uint8Array(8);
      let word = 0;
      let shutdown = true;
      let test = false;
      let intensity = 0;
      let scanLimit = 7;
      let dirty = true;
      let wasPowered = false;
      const powered = (): boolean => io.v('VCC', 'GND') > 4;
      return {
        edge: (pin, drive) => {
          if (drive !== 'high' || !powered()) return;
          if (pin === 'CLK') {
            word = ((word << 1) | (io.level('DIN', 'GND') ? 1 : 0)) & 0xffff;
            return;
          }
          // Rising CS: the last 16 bits received take effect.
          const register = (word >> 8) & 15;
          const value = word & 0xff;
          if (register >= 1 && register <= 8) rows[register - 1] = value;
          else if (register === 0x0a) intensity = value & 15;
          else if (register === 0x0b) scanLimit = value & 7;
          else if (register === 0x0c) shutdown = (value & 1) === 0;
          else if (register === 0x0f) test = (value & 1) === 1;
          dirty = true;
        },
        spi: (byte) => {
          word = ((word << 8) | byte) & 0xffff;
          return 0;
        },
        tick: () => {
          const on = powered();
          if (!dirty && on === wasPowered) return;
          dirty = false;
          wasPowered = on;
          for (let row = 0; row < 8; row++) {
            const value = !on ? 0 : test ? 0xff : shutdown || row > scanLimit ? 0 : (rows[row] ?? 0);
            io.aux(`r${row}`, value);
          }
          io.aux('level', test ? 15 : intensity);
        },
      };
    },
  },
  footprint: (_props, visual) => {
    const aux = visual?.burned ? undefined : visual?.aux;
    const opacity = (0.55 + 0.03 * (aux?.level ?? 0)).toFixed(2);
    let dots = '';
    for (let row = 0; row < 8; row++) {
      for (let column = 0; column < 8; column++) {
        const lit = (((aux?.[`r${row}`] ?? 0) >> (7 - column)) & 1) === 1;
        dots += `<circle cx="${-35 + column * 10}" cy="${-35 + row * 10}" r="3.8" fill="${lit ? '#ff3b30' : '#3a1512'}"${lit ? ` fill-opacity="${opacity}"` : ''}/>`;
      }
    }
    return `
      <path d="M-60 -20H-52M-60 -10H-52M-60 0H-52M-60 10H-52M-60 20H-52" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="-54" y="-42" width="12" height="84" rx="2" fill="#1d3c78" stroke="#12264d"/>
      <rect x="-42" y="-42" width="84" height="84" rx="2" fill="#17191b" stroke="#000000"/>
      ${dots}`;
  },
};

export default matrix;
