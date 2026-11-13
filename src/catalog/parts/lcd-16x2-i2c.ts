import { Hd44780, lcdScreen } from '../hd44780';
import { stringProp, type PartDef, type PartProps } from '../types';

const addressOf = (props: PartProps): number => (stringProp(props, 'address') === '0x3F' ? 0x3f : 0x27);

/**
 * 16x2 LCD with the I2C adapter soldered on (PCF8574): four wires instead of
 * twelve. The adapter's outputs are RS, RW, E, backlight and D4-D7.
 */
const lcdI2c: PartDef = {
  type: 'lcd-16x2-i2c',
  category: 'output',
  name: { es: 'LCD 16x2 con I2C', en: 'LCD 16x2 with I2C' },
  keywords: ['lcd', 'pantalla', 'display', '16x2', '1602', 'i2c', 'pcf8574', 'liquidcrystal_i2c', 'caracteres'],
  refPrefix: 'LCD',
  bounds: { x: -100, y: -40, width: 190, height: 80 },
  pins: [
    { id: 'GND', name: { es: 'GND', en: 'GND' }, x: -100, y: -20 },
    { id: 'VCC', name: { es: 'VCC (5 V)', en: 'VCC (5 V)' }, x: -100, y: -10 },
    { id: 'SDA', name: { es: 'SDA (datos)', en: 'SDA (data)' }, x: -100, y: 0 },
    { id: 'SCL', name: { es: 'SCL (reloj)', en: 'SCL (clock)' }, x: -100, y: 10 },
  ],
  props: [
    {
      kind: 'select',
      key: 'address',
      label: { es: 'Dirección I2C', en: 'I2C address' },
      default: '0x27',
      options: [
        { value: '0x27', label: { es: '0x27', en: '0x27' } },
        { value: '0x3F', label: { es: '0x3F', en: '0x3F' } },
      ],
    },
  ],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('GND'), ohms: 250 },
  ],
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 7, cause: 'overvoltage', action: 'burn' },
  ],
  digital: {
    i2c: { sda: 'SDA', scl: 'SCL', address: addressOf },
    create: (io) => {
      const chip = new Hd44780();
      const powered = (): boolean => io.v('VCC', 'GND') > 4;
      let enabled = false;
      let backlight = false;
      let shown = '';
      return {
        i2c: {
          begin: () => powered(),
          write: (byte) => {
            const enable = (byte & 0x04) !== 0;
            if (enabled && !enable) chip.pulse((byte & 0x01) !== 0, byte >> 4, null);
            enabled = enable;
            backlight = (byte & 0x08) !== 0;
            return true;
          },
          read: () => 0xff,
        },
        tick: () => {
          const on = powered();
          const state = `${on}${backlight}`;
          if (chip.dirty || state !== shown) {
            chip.report(io.aux, on);
            io.aux('bl', on && backlight ? 1 : 0);
          }
          shown = state;
        },
      };
    },
  },
  footprint: (_props, visual) => `
    <path d="M-100 -20H-92M-100 -10H-92M-100 0H-92M-100 10H-92" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="-94" y="-26" width="8" height="42" fill="#15181b"/>
    <rect x="-90" y="-38" width="180" height="76" rx="3" fill="#1f6b3a" stroke="#134526"/>
    <circle cx="-84" cy="-32" r="2.5" fill="#d9dde1"/><circle cx="84" cy="-32" r="2.5" fill="#d9dde1"/>
    <circle cx="-84" cy="32" r="2.5" fill="#d9dde1"/><circle cx="84" cy="32" r="2.5" fill="#d9dde1"/>
    <rect x="-80" y="-26" width="160" height="52" rx="2" fill="#15181b"/>
    ${lcdScreen(visual?.aux, -72, -15, !visual?.burned && (visual?.aux?.bl ?? 0) > 0)}`,
};

export default lcdI2c;
