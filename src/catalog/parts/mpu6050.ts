import { numberProp, type PartDef, type PropDef } from '../types';

const slider = (key: string, es: string, en: string, unit: string, range: number, initial: number): PropDef => ({
  kind: 'number',
  key,
  label: { es, en },
  unit,
  si: false,
  default: initial,
  min: -range,
  max: range,
  slider: true,
});

/** Registers of the chip. */
const ACCEL_CONFIG = 0x1c;
const GYRO_CONFIG = 0x1b;
const DATA = 0x3b;
const POWER = 0x6b;
const WHO_AM_I = 0x75;
const SLEEP = 0x40;

/**
 * Accelerometer and gyroscope on the I2C bus (address 0x68). It starts
 * asleep: nothing is measured until bit 6 of register 0x6B is cleared.
 */
const mpu6050: PartDef = {
  type: 'mpu6050',
  category: 'sensor',
  name: { es: 'Acelerómetro y giroscopio MPU6050', en: 'Accelerometer and gyroscope MPU6050' },
  keywords: ['mpu6050', 'mpu-6050', 'gy-521', 'acelerometro', 'accelerometer', 'giroscopio', 'gyroscope', 'imu', 'i2c'],
  refPrefix: 'U',
  bounds: { x: -30, y: -26, width: 56, height: 52 },
  pins: [
    { id: 'VCC', name: { es: 'VCC (5 V)', en: 'VCC (5 V)' }, x: -30, y: -20 },
    { id: 'GND', name: { es: 'GND', en: 'GND' }, x: -30, y: -10 },
    { id: 'SCL', name: { es: 'SCL (reloj)', en: 'SCL (clock)' }, x: -30, y: 0 },
    { id: 'SDA', name: { es: 'SDA (datos)', en: 'SDA (data)' }, x: -30, y: 10 },
  ],
  props: [
    slider('ax', 'Aceleración X', 'Acceleration X', 'g', 2, 0),
    slider('ay', 'Aceleración Y', 'Acceleration Y', 'g', 2, 0),
    slider('az', 'Aceleración Z', 'Acceleration Z', 'g', 2, 1),
    slider('gx', 'Giro X', 'Rotation X', '°/s', 250, 0),
    slider('gy', 'Giro Y', 'Rotation Y', '°/s', 250, 0),
    slider('gz', 'Giro Z', 'Rotation Z', '°/s', 250, 0),
    {
      kind: 'number',
      key: 'temperature',
      label: { es: 'Temperatura', en: 'Temperature' },
      unit: '°C',
      si: false,
      default: 25,
      min: -40,
      max: 85,
      slider: true,
    },
  ],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('GND'), ohms: 1200 },
  ],
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 7, cause: 'overvoltage', action: 'burn' },
  ],
  digital: {
    i2c: { sda: 'SDA', scl: 'SCL', address: () => 0x68 },
    create: (io) => {
      const registers = new Uint8Array(128);
      registers[POWER] = SLEEP;
      registers[WHO_AM_I] = 0x68;
      let pointer = 0;
      let expectRegister = true;

      /** Writes the current readings as big-endian 16-bit numbers. */
      const sample = (): void => {
        const asleep = ((registers[POWER] ?? 0) & SLEEP) !== 0;
        const accelScale = 16384 >> (((registers[ACCEL_CONFIG] ?? 0) >> 3) & 3);
        const gyroScale = 131 / (1 << (((registers[GYRO_CONFIG] ?? 0) >> 3) & 3));
        const values = [
          ...['ax', 'ay', 'az'].map((key) => numberProp(io.props, key, 0) * accelScale),
          (numberProp(io.props, 'temperature', 25) - 36.53) * 340,
          ...['gx', 'gy', 'gz'].map((key) => numberProp(io.props, key, 0) * gyroScale),
        ];
        values.forEach((value, index) => {
          const raw = asleep ? 0 : Math.max(-32768, Math.min(32767, Math.round(value)));
          registers[DATA + index * 2] = (raw >> 8) & 0xff;
          registers[DATA + index * 2 + 1] = raw & 0xff;
        });
      };

      return {
        i2c: {
          begin: (read) => {
            if (io.v('VCC', 'GND') < 3) return false;
            if (read) sample();
            else expectRegister = true;
            return true;
          },
          write: (byte) => {
            if (expectRegister) {
              pointer = byte & 0x7f;
              expectRegister = false;
            } else {
              if (pointer !== WHO_AM_I) registers[pointer] = byte;
              pointer = (pointer + 1) & 0x7f;
            }
            return true;
          },
          read: () => {
            const value = registers[pointer] ?? 0;
            pointer = (pointer + 1) & 0x7f;
            return value;
          },
        },
      };
    },
  },
  footprint: () => `
    <path d="M-30 -20H-22M-30 -10H-22M-30 0H-22M-30 10H-22" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="-24" y="-26" width="50" height="52" rx="3" fill="#1d5fa8" stroke="#12264d"/>
    <rect x="-4" y="-9" width="18" height="18" rx="1.5" fill="#17191b"/>
    <circle cx="-1" cy="-6" r="1" fill="#c9cdd2"/>
    <path d="M5 16v-5m0 0l-2 2m2-2l2 2M14 20h5m0 0l-2-2m2 2l-2 2" fill="none" stroke="#e9f1fb" stroke-width="0.9"/>
    <text x="5" y="-15" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#e9f1fb">MPU6050</text>`,
};

export default mpu6050;
