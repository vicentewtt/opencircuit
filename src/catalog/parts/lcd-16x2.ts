import { Hd44780, lcdScreen } from '../hd44780';
import { saturationCurrent } from '../model';
import { same, type PartDef, type PinDef } from '../types';

const NAMES = ['VSS', 'VDD', 'V0', 'RS', 'RW', 'E', 'D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'A', 'K'];
const PINS: PinDef[] = NAMES.map((id, index) => ({
  id,
  name: same(`${index + 1} · ${id}`),
  x: -80 + index * 10,
  y: -40,
}));
const BACKLIGHT_AMPS = 0.02;

/** 16x2 character LCD with its usual 16-pin parallel connection. */
const lcd: PartDef = {
  type: 'lcd-16x2',
  category: 'output',
  name: { es: 'LCD 16x2', en: 'LCD 16x2' },
  keywords: ['lcd', 'pantalla', 'display', '16x2', '1602', 'hd44780', 'liquidcrystal', 'caracteres'],
  refPrefix: 'LCD',
  bounds: { x: -90, y: -44, width: 180, height: 84 },
  pins: PINS,
  props: [],
  model: (ctx) => {
    const led = ctx.internal('led');
    return [
      { name: 'logic', kind: 'resistor', a: ctx.pin('VDD'), b: ctx.pin('VSS'), ohms: 5000 },
      // Backlight LED with the series resistor the module already has.
      { name: 'rbl', kind: 'resistor', a: ctx.pin('A'), b: led, ohms: 100 },
      { name: 'main', kind: 'diode', a: led, k: ctx.pin('K'), is: saturationCurrent(3, BACKLIGHT_AMPS, 2), n: 2 },
    ];
  },
  faults: () => [
    { element: 'main', quantity: 'current', max: 0.06, cause: 'led-overcurrent', action: 'burn' },
    { element: 'logic', quantity: 'voltage', max: 7, cause: 'overvoltage', action: 'burn' },
  ],
  digital: {
    watch: ['E'],
    create: (io) => {
      const chip = new Hd44780();
      const powered = (): boolean => io.v('VDD', 'VSS') > 4;
      const nibble = (pins: string[]): number =>
        pins.reduce((value, pin, bit) => value | (io.level(pin, 'VSS') ? 1 << bit : 0), 0);
      let enabled = false;
      let wasPowered = false;
      return {
        edge: (_pin, drive) => {
          if (drive === 'high') {
            enabled = true;
          } else if (enabled) {
            // Data is taken on the falling edge of E.
            enabled = false;
            if (!powered()) return;
            const wired = ['D0', 'D1', 'D2', 'D3'].every((pin) => io.linked(pin));
            chip.pulse(
              io.level('RS', 'VSS'),
              nibble(['D4', 'D5', 'D6', 'D7']),
              wired ? nibble(['D0', 'D1', 'D2', 'D3']) : null,
            );
          }
        },
        tick: () => {
          const on = powered();
          if (chip.dirty || on !== wasPowered) chip.report(io.aux, on);
          wasPowered = on;
        },
      };
    },
  },
  footprint: (_props, visual) => `
    <path d="${PINS.map((pin) => `M${pin.x} -40V-34`).join('')}" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="-90" y="-36" width="180" height="76" rx="3" fill="#1f6b3a" stroke="#134526"/>
    <circle cx="-84" cy="34" r="2.5" fill="#d9dde1"/><circle cx="84" cy="34" r="2.5" fill="#d9dde1"/>
    <rect x="-80" y="-24" width="160" height="52" rx="2" fill="#15181b"/>
    ${lcdScreen(visual?.aux, -72, -13, !visual?.burned && (visual?.i ?? 0) > 0.002)}`,
};

export default lcd;
