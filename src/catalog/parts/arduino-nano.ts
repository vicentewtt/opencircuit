import { arduinoBoard, type BoardLayout } from '../arduino';

// Two rows of pins 0.6 inch apart; the reset pins of the real board are left out.
const top = (id: string, x: number): BoardLayout['pins'][number] => ({ id, x, y: -30, side: 'below' });
const bottom = (id: string, x: number): BoardLayout['pins'][number] => ({ id, x, y: 30, side: 'above' });

export default arduinoBoard({
  type: 'arduino-nano',
  board: 'nano',
  name: { es: 'Arduino Nano', en: 'Arduino Nano' },
  keywords: ['arduino', 'nano', 'atmega328p', 'placa', 'board', 'microcontrolador', 'microcontroller'],
  x: -90,
  y: -40,
  width: 180,
  height: 80,
  pins: [
    ...[12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2].map((n, i) => top(`D${n}`, -70 + i * 10)),
    top('GND1', 40),
    top('D0', 60),
    top('D1', 70),
    bottom('D13', -70),
    bottom('3V3', -60),
    bottom('AREF', -50),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => bottom(`A${n}`, -40 + n * 10)),
    bottom('5V', 40),
    bottom('GND2', 60),
    bottom('VIN', 70),
  ],
  led: { x: -52, y: 0 },
  art: `
    <rect x="-98" y="-14" width="24" height="28" rx="2" fill="#c3c8cd" stroke="#70777e"/>
    <rect x="-14" y="-14" width="28" height="28" fill="#1b1d1f" transform="rotate(45)"/>
    <text x="52" y="3" font-size="9" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#e9f3f4">NANO</text>`,
});
