import { arduinoBoard, type BoardLayout } from '../arduino';
import type { McuPin } from '../model';

/**
 * Arduino Mega 2560. Its pin table was generated from the official
 * variants/mega/pins_arduino.h (Arduino AVR core 1.6.9): port and bit of
 * each Arduino pin, D0-D53 and A0-A15.
 */
const MEGA_PINS: McuPin[] = [
  { id: 'D0', port: 'E', bit: 0 },
  { id: 'D1', port: 'E', bit: 1 },
  { id: 'D2', port: 'E', bit: 4 },
  { id: 'D3', port: 'E', bit: 5 },
  { id: 'D4', port: 'G', bit: 5 },
  { id: 'D5', port: 'E', bit: 3 },
  { id: 'D6', port: 'H', bit: 3 },
  { id: 'D7', port: 'H', bit: 4 },
  { id: 'D8', port: 'H', bit: 5 },
  { id: 'D9', port: 'H', bit: 6 },
  { id: 'D10', port: 'B', bit: 4 },
  { id: 'D11', port: 'B', bit: 5 },
  { id: 'D12', port: 'B', bit: 6 },
  { id: 'D13', port: 'B', bit: 7 },
  { id: 'D14', port: 'J', bit: 1 },
  { id: 'D15', port: 'J', bit: 0 },
  { id: 'D16', port: 'H', bit: 1 },
  { id: 'D17', port: 'H', bit: 0 },
  { id: 'D18', port: 'D', bit: 3 },
  { id: 'D19', port: 'D', bit: 2 },
  { id: 'D20', port: 'D', bit: 1 },
  { id: 'D21', port: 'D', bit: 0 },
  { id: 'D22', port: 'A', bit: 0 },
  { id: 'D23', port: 'A', bit: 1 },
  { id: 'D24', port: 'A', bit: 2 },
  { id: 'D25', port: 'A', bit: 3 },
  { id: 'D26', port: 'A', bit: 4 },
  { id: 'D27', port: 'A', bit: 5 },
  { id: 'D28', port: 'A', bit: 6 },
  { id: 'D29', port: 'A', bit: 7 },
  { id: 'D30', port: 'C', bit: 7 },
  { id: 'D31', port: 'C', bit: 6 },
  { id: 'D32', port: 'C', bit: 5 },
  { id: 'D33', port: 'C', bit: 4 },
  { id: 'D34', port: 'C', bit: 3 },
  { id: 'D35', port: 'C', bit: 2 },
  { id: 'D36', port: 'C', bit: 1 },
  { id: 'D37', port: 'C', bit: 0 },
  { id: 'D38', port: 'D', bit: 7 },
  { id: 'D39', port: 'G', bit: 2 },
  { id: 'D40', port: 'G', bit: 1 },
  { id: 'D41', port: 'G', bit: 0 },
  { id: 'D42', port: 'L', bit: 7 },
  { id: 'D43', port: 'L', bit: 6 },
  { id: 'D44', port: 'L', bit: 5 },
  { id: 'D45', port: 'L', bit: 4 },
  { id: 'D46', port: 'L', bit: 3 },
  { id: 'D47', port: 'L', bit: 2 },
  { id: 'D48', port: 'L', bit: 1 },
  { id: 'D49', port: 'L', bit: 0 },
  { id: 'D50', port: 'B', bit: 3 },
  { id: 'D51', port: 'B', bit: 2 },
  { id: 'D52', port: 'B', bit: 1 },
  { id: 'D53', port: 'B', bit: 0 },
  { id: 'A0', port: 'F', bit: 0, adc: 0 },
  { id: 'A1', port: 'F', bit: 1, adc: 1 },
  { id: 'A2', port: 'F', bit: 2, adc: 2 },
  { id: 'A3', port: 'F', bit: 3, adc: 3 },
  { id: 'A4', port: 'F', bit: 4, adc: 4 },
  { id: 'A5', port: 'F', bit: 5, adc: 5 },
  { id: 'A6', port: 'F', bit: 6, adc: 6 },
  { id: 'A7', port: 'F', bit: 7, adc: 7 },
  { id: 'A8', port: 'K', bit: 0, adc: 8 },
  { id: 'A9', port: 'K', bit: 1, adc: 9 },
  { id: 'A10', port: 'K', bit: 2, adc: 10 },
  { id: 'A11', port: 'K', bit: 3, adc: 11 },
  { id: 'A12', port: 'K', bit: 4, adc: 12 },
  { id: 'A13', port: 'K', bit: 5, adc: 13 },
  { id: 'A14', port: 'K', bit: 6, adc: 14 },
  { id: 'A15', port: 'K', bit: 7, adc: 15 },
];

const PWM = ['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'D44', 'D45', 'D46'];

type Pin = BoardLayout['pins'][number];
// Header pitch is 0.1 inch = one grid step (10 units).
const top = (id: string, x: number): Pin => ({ id, x, y: -100, side: 'below' });
const bottom = (id: string, x: number): Pin => ({ id, x, y: 100, side: 'above' });

/** The double header on the right: 5 V on top, D22-D53 in pairs, GND at the bottom. */
const side: Pin[] = [
  { id: '5V2', x: 180, y: -80, side: 'left' },
  { id: '5V3', x: 190, y: -80, side: 'right' },
  ...Array.from({ length: 16 }, (_, row): Pin[] => [
    { id: `D${22 + row * 2}`, x: 180, y: -70 + row * 10, side: 'left' },
    { id: `D${23 + row * 2}`, x: 190, y: -70 + row * 10, side: 'right' },
  ]).flat(),
  { id: 'GND4', x: 180, y: 90, side: 'left' },
  { id: 'GND5', x: 190, y: 90, side: 'right' },
];

export default arduinoBoard({
  type: 'arduino-mega',
  board: 'mega',
  chip: 'atmega2560',
  name: { es: 'Arduino Mega 2560', en: 'Arduino Mega 2560' },
  keywords: ['arduino', 'mega', '2560', 'atmega2560', 'placa', 'board', 'microcontrolador', 'microcontroller'],
  x: -230,
  y: -110,
  width: 440,
  height: 220,
  mcuPins: MEGA_PINS,
  pwm: PWM,
  i2c: { sda: 'D20', scl: 'D21' },
  spi: { mosi: 'D51', sck: 'D52' },
  notes: {
    D0: 'RX0',
    D1: 'TX0',
    D14: 'TX3',
    D15: 'RX3',
    D16: 'TX2',
    D17: 'RX2',
    D18: 'TX1',
    D19: 'RX1',
    D20: 'SDA',
    D21: 'SCL',
    D50: 'MISO',
    D51: 'MOSI',
    D52: 'SCK',
    D53: 'SS',
  },
  pins: [
    top('SCL', -110),
    top('SDA', -100),
    top('AREF', -90),
    top('GND1', -80),
    ...[13, 12, 11, 10, 9, 8].map((n, i) => top(`D${n}`, -70 + i * 10)),
    ...[7, 6, 5, 4, 3, 2, 1, 0].map((n, i) => top(`D${n}`, 0 + i * 10)),
    ...[14, 15, 16, 17, 18, 19, 20, 21].map((n, i) => top(`D${n}`, 90 + i * 10)),
    bottom('3V3', -60),
    bottom('5V', -50),
    bottom('GND2', -40),
    bottom('GND3', -30),
    bottom('VIN', -20),
    ...Array.from({ length: 8 }, (_, n) => bottom(`A${n}`, n * 10)),
    ...Array.from({ length: 8 }, (_, n) => bottom(`A${n + 8}`, 90 + n * 10)),
    ...side,
  ],
  led: { x: -62, y: -72 },
  art: `
    <rect x="-242" y="-84" width="46" height="38" rx="2" fill="#c3c8cd" stroke="#70777e"/>
    <rect x="-236" y="34" width="40" height="34" rx="2" fill="#1b1d1f"/>
    <g transform="rotate(45 -20 10)">
      <rect x="-48" y="-18" width="56" height="56" rx="2" fill="#1b1d1f"/>
      <path d="${Array.from({ length: 12 }, (_, i) => `M${-44 + i * 4.4} -21v3M${-44 + i * 4.4} 38v3M-51 ${-14 + i * 4.4}h3M8 ${-14 + i * 4.4}h3`).join('')}" stroke="#c3c8cd" stroke-width="1.6"/>
    </g>
    <circle cx="-180" cy="-94" r="6" fill="#c3c8cd" stroke="#70777e"/>
    <circle cx="-180" cy="-94" r="3" fill="#b3261e"/>
    <text x="80" y="-40" font-size="22" font-family="sans-serif" font-weight="700" text-anchor="middle" fill="#e9f3f4">MEGA</text>
    <text x="80" y="-24" font-size="8" font-family="monospace" text-anchor="middle" fill="#e9f3f4">2560</text>
    <text x="50" y="-82" font-size="6" font-family="monospace" text-anchor="middle" fill="#e9f3f4">PWM ~ · COMMUNICATION</text>
    <text x="50" y="78" font-size="6" font-family="monospace" text-anchor="middle" fill="#e9f3f4">POWER · ANALOG IN</text>
    <text x="185" y="-92" font-size="5" font-family="monospace" text-anchor="middle" fill="#e9f3f4">DIGITAL</text>`,
});
