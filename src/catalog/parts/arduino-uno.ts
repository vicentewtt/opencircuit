import { arduinoBoard, type BoardLayout } from '../arduino';

// Header pitch is 0.1 inch = one grid step (10 units).
const top = (id: string, x: number): BoardLayout['pins'][number] => ({ id, x, y: -90, side: 'below' });
const bottom = (id: string, x: number): BoardLayout['pins'][number] => ({ id, x, y: 90, side: 'above' });

export default arduinoBoard({
  type: 'arduino-uno',
  board: 'uno',
  name: { es: 'Arduino Uno', en: 'Arduino Uno' },
  keywords: ['arduino', 'uno', 'atmega328p', 'placa', 'board', 'microcontrolador', 'microcontroller'],
  x: -140,
  y: -100,
  width: 280,
  height: 200,
  pins: [
    top('SCL', -50),
    top('SDA', -40),
    top('AREF', -30),
    top('GND1', -20),
    ...[13, 12, 11, 10, 9, 8].map((n, i) => top(`D${n}`, -10 + i * 10)),
    ...[7, 6, 5, 4, 3, 2, 1, 0].map((n, i) => top(`D${n}`, 60 + i * 10)),
    bottom('3V3', 0),
    bottom('5V', 10),
    bottom('GND2', 20),
    bottom('GND3', 30),
    bottom('VIN', 40),
    ...[0, 1, 2, 3, 4, 5].map((n) => bottom(`A${n}`, 80 + n * 10)),
  ],
  led: { x: -8, y: -62 },
  art: `
    <rect x="-152" y="-74" width="46" height="38" rx="2" fill="#c3c8cd" stroke="#70777e"/>
    <rect x="-146" y="34" width="40" height="34" rx="2" fill="#1b1d1f"/>
    <rect x="-8" y="16" width="118" height="28" rx="2" fill="#1b1d1f"/>
    <path d="${Array.from({ length: 14 }, (_, i) => `M${-2 + i * 8} 13v3M${-2 + i * 8} 44v3`).join('')}" stroke="#c3c8cd" stroke-width="2"/>
    <circle cx="-90" cy="-84" r="6" fill="#c3c8cd" stroke="#70777e"/>
    <circle cx="-90" cy="-84" r="3" fill="#b3261e"/>
    <text x="52" y="-28" font-size="20" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#e9f3f4">UNO</text>
    <text x="52" y="-12" font-size="6" font-family="monospace" text-anchor="middle" fill="#e9f3f4">DIGITAL (PWM ~)</text>
    <text x="68" y="64" font-size="6" font-family="monospace" text-anchor="middle" fill="#e9f3f4">POWER · ANALOG IN</text>`,
});
