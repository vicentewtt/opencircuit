import { numberProp, type PartDef } from '../types';

/** Speed of sound, in centimetres per second. */
const SOUND = 34300;
const MAX_RANGE = 400;
/** The echo pin stays high this long when nothing is in range. */
const TIMEOUT = 0.038;
/** Time the module takes to send its burst after the trigger. */
const BURST = 460e-6;

/**
 * Ultrasonic distance sensor. A 10 µs pulse on Trig makes it measure; Echo
 * then stays high for as long as the sound took to go and come back.
 */
const hcSr04: PartDef = {
  type: 'hc-sr04',
  category: 'sensor',
  name: { es: 'Sensor ultrasónico HC-SR04', en: 'Ultrasonic sensor HC-SR04' },
  keywords: ['ultrasonico', 'ultrasonic', 'hc-sr04', 'hcsr04', 'distancia', 'distance', 'sonar', 'ping'],
  refPrefix: 'US',
  bounds: { x: -46, y: -24, width: 92, height: 54 },
  pins: [
    { id: 'VCC', name: { es: 'VCC (5 V)', en: 'VCC (5 V)' }, x: -20, y: 30 },
    { id: 'TRIG', name: { es: 'Trig (disparo)', en: 'Trig (trigger)' }, x: -10, y: 30 },
    { id: 'ECHO', name: { es: 'Echo (eco)', en: 'Echo' }, x: 0, y: 30 },
    { id: 'GND', name: { es: 'GND', en: 'GND' }, x: 10, y: 30 },
  ],
  props: [
    {
      kind: 'number',
      key: 'distance',
      label: { es: 'Distancia al objeto', en: 'Distance to the object' },
      unit: 'cm',
      si: false,
      default: 50,
      min: 2,
      max: 450,
      slider: true,
    },
  ],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('GND'), ohms: 330 },
    { name: 'pull', kind: 'resistor', a: ctx.pin('ECHO'), b: ctx.pin('GND'), ohms: 10e3 },
  ],
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 7, cause: 'overvoltage', action: 'burn' },
  ],
  digital: {
    watch: ['TRIG'],
    create: (io) => {
      let high = false;
      let rose = 0;
      let busy = false;
      return {
        edge: (_pin, drive) => {
          const now = io.now();
          if (drive === 'high') {
            high = true;
            rose = now;
          } else if (high) {
            high = false;
            if (busy || now - rose < 8e-6 || io.v('VCC', 'GND') < 4) return;
            busy = true;
            const distance = numberProp(io.props, 'distance', 50);
            const echo = distance > MAX_RANGE ? TIMEOUT : (2 * distance) / SOUND;
            io.drive('ECHO', false);
            io.after(BURST, () => io.drive('ECHO', true));
            io.after(BURST + echo, () => {
              io.drive('ECHO', false);
              busy = false;
            });
          }
        },
      };
    },
  },
  footprint: (props) => `
    <path d="M-20 30V20M-10 30V20M0 30V20M10 30V20" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="-46" y="-24" width="92" height="46" rx="3" fill="#1d5fa8" stroke="#12264d"/>
    <circle cx="-24" cy="-3" r="16" fill="#c3c8cd" stroke="#70777e"/><circle cx="-24" cy="-3" r="11" fill="#30353a"/>
    <circle cx="24" cy="-3" r="16" fill="#c3c8cd" stroke="#70777e"/><circle cx="24" cy="-3" r="11" fill="#30353a"/>
    <text x="0" y="19" font-size="6" font-family="monospace" text-anchor="middle" fill="#e9f1fb">${Math.round(numberProp(props, 'distance', 50))} cm</text>`,
};

export default hcSr04;
