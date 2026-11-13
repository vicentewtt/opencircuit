import { numberProp, type PartDef, type PartProps } from './types';

/**
 * Temperature and humidity sensors with a single data wire (DHT11, DHT22).
 * The board asks by holding the line low; the sensor answers with 40 bits,
 * where the length of each high pulse tells a 0 from a 1.
 */

/** Times of the answer, in seconds. */
const REPLY_DELAY = 30e-6;
const PRESENCE = 80e-6;
const BIT_LOW = 50e-6;
const ZERO_HIGH = 26e-6;
const ONE_HIGH = 70e-6;

export interface DhtSensor {
  type: string;
  model: string;
  /** Shortest request pulse the sensor accepts. */
  minRequest: number;
  temperature: { min: number; max: number };
  humidity: { min: number; max: number };
  /** The four data bytes for a reading (the checksum is added here). */
  encode: (temperature: number, humidity: number) => number[];
  color: string;
}

export function dht(sensor: DhtSensor): PartDef {
  const reading = (props: PartProps): number[] => {
    const bytes = sensor
      .encode(numberProp(props, 'temperature', 25), numberProp(props, 'humidity', 50))
      .map((byte) => byte & 0xff);
    return [...bytes, bytes.reduce((sum, byte) => sum + byte, 0) & 0xff];
  };
  return {
    type: sensor.type,
    category: 'sensor',
    name: {
      es: `Sensor de temperatura y humedad ${sensor.model}`,
      en: `Temperature and humidity sensor ${sensor.model}`,
    },
    keywords: ['dht', sensor.model.toLowerCase(), 'temperatura', 'temperature', 'humedad', 'humidity', 'sensor'],
    refPrefix: 'U',
    bounds: { x: -18, y: -30, width: 36, height: 60 },
    pins: [
      { id: 'VCC', name: { es: 'VCC (5 V)', en: 'VCC (5 V)' }, x: -10, y: 30 },
      { id: 'DATA', name: { es: 'Datos', en: 'Data' }, x: 0, y: 30 },
      { id: 'GND', name: { es: 'GND', en: 'GND' }, x: 10, y: 30 },
    ],
    props: [
      {
        kind: 'number',
        key: 'temperature',
        label: { es: 'Temperatura', en: 'Temperature' },
        unit: '°C',
        si: false,
        default: 25,
        ...sensor.temperature,
        slider: true,
      },
      {
        kind: 'number',
        key: 'humidity',
        label: { es: 'Humedad relativa', en: 'Relative humidity' },
        unit: '%',
        si: false,
        default: 50,
        ...sensor.humidity,
        slider: true,
      },
    ],
    model: (ctx) => [
      { name: 'main', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('GND'), ohms: 5000 },
      // The module includes the pull-up of the data line.
      { name: 'pull', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('DATA'), ohms: 10e3 },
    ],
    faults: () => [
      { element: 'main', quantity: 'voltage', max: 7, cause: 'overvoltage', action: 'burn' },
    ],
    digital: {
      watch: ['DATA'],
      create: (io) => {
        let lowSince: number | null = null;
        let busy = false;
        return {
          edge: (_pin, drive) => {
            const now = io.now();
            if (drive === 'low') {
              lowSince = now;
              return;
            }
            const held = lowSince === null ? 0 : now - lowSince;
            lowSince = null;
            if (busy || held < sensor.minRequest || io.v('VCC', 'GND') < 3) return;
            busy = true;
            let at = REPLY_DELAY;
            const level = (value: boolean | null, duration: number): void => {
              io.after(at, () => io.drive('DATA', value));
              at += duration;
            };
            level(false, PRESENCE);
            level(true, PRESENCE);
            for (const byte of reading(io.props)) {
              for (let bit = 7; bit >= 0; bit--) {
                level(false, BIT_LOW);
                level(true, (byte >> bit) & 1 ? ONE_HIGH : ZERO_HIGH);
              }
            }
            level(false, BIT_LOW);
            io.after(at, () => {
              io.drive('DATA', null);
              busy = false;
            });
          },
        };
      },
    },
    footprint: (props) => {
      let grille = '';
      for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
          grille += `<rect x="${-11 + column * 6}" y="${-25 + row * 6}" width="4" height="4" rx="0.8" fill="#000000" fill-opacity="0.25"/>`;
        }
      }
      return `
        <path d="M-10 30V20M0 30V20M10 30V20" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
        <rect x="-16" y="-30" width="32" height="52" rx="2" fill="${sensor.color}" stroke="#00000055"/>
        ${grille}
        <text x="0" y="7" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#10141a">${sensor.model}</text>
        <text x="0" y="14" font-size="5" font-family="monospace" text-anchor="middle" fill="#10141a">${numberProp(props, 'temperature', 25).toFixed(0)}°C ${numberProp(props, 'humidity', 50).toFixed(0)}%</text>`;
    },
  };
}
