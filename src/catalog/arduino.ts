import type { ElementSpec, FaultRule, McuPin } from './model';
import type { PartDef, PinDef } from './types';

/** Shared definition of the Arduino boards (Uno and Nano with the ATmega328P, Mega with the ATmega2560). */

export const DEFAULT_SKETCH = `void setup() {
  pinMode(LED_BUILTIN, OUTPUT);
}

void loop() {
  digitalWrite(LED_BUILTIN, HIGH);
  delay(1000);
  digitalWrite(LED_BUILTIN, LOW);
  delay(1000);
}
`;

/** MCU side of every Arduino pin on an ATmega328P. */
export const ATMEGA328P_PINS: McuPin[] = [
  ...Array.from({ length: 8 }, (_, i): McuPin => ({ id: `D${i}`, port: 'D', bit: i })),
  ...Array.from({ length: 6 }, (_, i): McuPin => ({ id: `D${i + 8}`, port: 'B', bit: i })),
  ...Array.from({ length: 6 }, (_, i): McuPin => ({ id: `A${i}`, port: 'C', bit: i, adc: i })),
  { id: 'A6', adc: 6 },
  { id: 'A7', adc: 7 },
];

const PIN_NAMES: Record<string, { es: string; en: string }> = {
  '5V': { es: '5 V', en: '5 V' },
  '3V3': { es: '3,3 V', en: '3.3 V' },
  VIN: { es: 'Vin (sin conexión interna)', en: 'Vin (not connected inside)' },
  AREF: { es: 'AREF (sin conexión interna)', en: 'AREF (not connected inside)' },
  SDA: { es: 'SDA (A4)', en: 'SDA (A4)' },
  SCL: { es: 'SCL (A5)', en: 'SCL (A5)' },
  D0: { es: 'D0 (RX)', en: 'D0 (RX)' },
  D1: { es: 'D1 (TX)', en: 'D1 (TX)' },
};

const UNO_PWM = ['D3', 'D5', 'D6', 'D9', 'D10', 'D11'];

function pinName(id: string, pwm: ReadonlySet<string>, extra: Record<string, string>): { es: string; en: string } {
  const known = PIN_NAMES[id];
  if (known) return known;
  if (id.startsWith('GND')) return { es: 'GND', en: 'GND' };
  if (id.startsWith('5V')) return { es: '5 V', en: '5 V' };
  const notes = [pwm.has(id) ? 'PWM' : '', extra[id] ?? ''].filter(Boolean).join(', ');
  const label = notes ? `${id} (${notes})` : id;
  return { es: label, en: label };
}

/** Text printed next to a pin on the board. */
function silk(id: string, pwm: ReadonlySet<string>): string {
  if (id.startsWith('GND')) return 'GND';
  if (id.startsWith('5V')) return '5V';
  if (id === '3V3') return '3V3';
  if (/^D\d+$/.test(id)) return (pwm.has(id) ? '~' : '') + id.slice(1);
  return id;
}

export interface BoardLayout {
  type: string;
  board: string;
  name: { es: string; en: string };
  keywords: string[];
  /** Board outline. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Pin positions; `side` says where the label goes relative to the pin. */
  pins: { id: string; x: number; y: number; side: 'above' | 'below' | 'left' | 'right' }[];
  /** Microcontroller and what each of its pins does (default: ATmega328P). */
  chip?: 'atmega328p' | 'atmega2560';
  mcuPins?: McuPin[];
  pwm?: string[];
  /** Pins of the hardware buses (default: the Uno's). */
  i2c?: { sda: string; scl: string };
  spi?: { mosi: string; sck: string };
  /** Extra notes in pin names, such as "TX1" or "MOSI". */
  notes?: Record<string, string>;
  /** Extra drawing under the pins (connectors, chip, lettering). */
  art: string;
  /** Position of the on-board LED. */
  led: { x: number; y: number };
}

export function arduinoBoard(layout: BoardLayout): PartDef {
  const ids = new Set(layout.pins.map((pin) => pin.id));
  const grounds = layout.pins.filter((pin) => pin.id.startsWith('GND')).map((pin) => pin.id);
  const firstGround = grounds[0] ?? 'GND1';
  const mcuPins = (layout.mcuPins ?? ATMEGA328P_PINS).filter((pin) => ids.has(pin.id));
  const pwm = new Set(layout.pwm ?? UNO_PWM);
  const i2c = layout.i2c ?? { sda: 'A4', scl: 'A5' };
  const spi = layout.spi ?? { mosi: 'D11', sck: 'D13' };

  const bridges: [string, string][] = grounds.slice(1).map((id) => [firstGround, id]);
  // Extra 5 V pins (the Mega has three) are the same rail.
  for (const id of ids) if (id !== '5V' && id.startsWith('5V')) bridges.push(['5V', id]);
  if (ids.has('SDA')) bridges.push(['SDA', i2c.sda]);
  if (ids.has('SCL')) bridges.push(['SCL', i2c.scl]);

  const pins: PinDef[] = layout.pins.map((pin) => ({
    id: pin.id,
    name: pinName(pin.id, pwm, layout.notes ?? {}),
    x: pin.x,
    y: pin.y,
  }));

  const sockets = layout.pins
    .map((pin) => {
      const label = silk(pin.id, pwm);
      const text =
        pin.side === 'left' || pin.side === 'right'
          ? `<text x="${pin.side === 'left' ? pin.x - 6 : pin.x + 6}" y="${pin.y + 1.6}" font-size="4.6" font-family="monospace" text-anchor="${pin.side === 'left' ? 'end' : 'start'}" fill="#e9f3f4">${label}</text>`
          : `<text x="${pin.x}" y="${pin.side === 'above' ? pin.y - 8 : pin.y + 12}" font-size="4.6" font-family="monospace" text-anchor="middle" fill="#e9f3f4">${label}</text>`;
      return `<rect x="${pin.x - 4}" y="${pin.y - 4}" width="8" height="8" fill="#1b1d1f"/>
        <rect x="${pin.x - 1.5}" y="${pin.y - 1.5}" width="3" height="3" fill="#c9a227"/>
        ${text}`;
    })
    .join('');

  return {
    type: layout.type,
    category: 'board',
    name: layout.name,
    keywords: layout.keywords,
    refPrefix: 'U',
    bounds: { x: layout.x, y: layout.y, width: layout.width, height: layout.height },
    pins,
    props: [
      {
        kind: 'code',
        key: 'code',
        label: { es: 'Código', en: 'Code' },
        default: DEFAULT_SKETCH,
      },
    ],
    bridges,
    mcu: {
      board: layout.board,
      chip: layout.chip ?? 'atmega328p',
      pins: mcuPins,
      led: 'D13',
      i2c,
      spi,
    },
    model: (ctx) => {
      const gnd = ctx.pin(firstGround);
      const rail5 = ctx.internal('rail5');
      const rail3 = ctx.internal('rail3');
      // The board is powered over USB: it is itself a 5 V and 3.3 V supply.
      const elements: ElementSpec[] = [
        { name: 'main', kind: 'vsource', p: rail5, n: gnd, volts: 5 },
        { name: 'r5', kind: 'resistor', a: rail5, b: ctx.pin('5V'), ohms: 0.2 },
        { name: 'v33', kind: 'vsource', p: rail3, n: gnd, volts: 3.3 },
        { name: 'r33', kind: 'resistor', a: rail3, b: ctx.pin('3V3'), ohms: 1 },
      ];
      for (const pin of mcuPins) {
        elements.push({ name: `pin:${pin.id}`, kind: 'pin', a: ctx.pin(pin.id), b: gnd });
      }
      return elements;
    },
    faults: () => {
      const rules: FaultRule[] = [
        { element: 'main', quantity: 'current', max: 0.5, cause: 'short-circuit', action: 'warn' },
        { element: 'v33', quantity: 'current', max: 0.15, cause: 'short-circuit', action: 'warn' },
      ];
      for (const pin of mcuPins) {
        if (!pin.port) continue;
        rules.push({
          element: `pin:${pin.id}`,
          quantity: 'current',
          max: 0.04,
          cause: 'pin-overcurrent',
          action: 'warn',
        });
      }
      return rules;
    },
    footprint: (_props, visual) => {
      const level = Math.min(1, Math.max(0, visual?.aux?.led ?? 0));
      const glow =
        level > 0.02
          ? `<circle cx="${layout.led.x}" cy="${layout.led.y}" r="${(4 + 5 * level).toFixed(1)}" fill="#ffb347" fill-opacity="${(0.55 * level).toFixed(2)}"/>`
          : '';
      return `
        <rect x="${layout.x}" y="${layout.y}" width="${layout.width}" height="${layout.height}" rx="5" fill="#0b7c86" stroke="#075b63"/>
        ${layout.art}
        ${sockets}
        ${glow}
        <rect x="${layout.led.x - 3}" y="${layout.led.y - 1.5}" width="6" height="3" fill="${level > 0.02 ? '#ffb347' : '#8a5a1f'}"/>
        <text x="${layout.led.x + 6}" y="${layout.led.y + 1.6}" font-size="4.6" font-family="monospace" fill="#e9f3f4">L</text>`;
    },
  };
}
