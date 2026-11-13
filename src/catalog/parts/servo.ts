import type { PartDef } from '../types';

/** Pulse widths the Arduino Servo library uses for 0° and 180°. */
const MIN_PULSE = 544e-6;
const MAX_PULSE = 2400e-6;
/** Turning speed of a small hobby servo, in degrees per second. */
const SPEED = 500;

/**
 * Micro servo (SG90). The position is set by the width of the pulses on
 * the signal wire, repeated about fifty times a second.
 */
const servo: PartDef = {
  type: 'servo',
  category: 'output',
  name: { es: 'Servomotor', en: 'Servo motor' },
  keywords: ['servo', 'servomotor', 'sg90', 'motor', 'angulo', 'angle', 'pwm'],
  refPrefix: 'M',
  bounds: { x: -28, y: -42, width: 56, height: 82 },
  pins: [
    { id: 'GND', name: { es: 'GND (café)', en: 'GND (brown)' }, x: -10, y: 40 },
    { id: 'VCC', name: { es: '5 V (rojo)', en: '5 V (red)' }, x: 0, y: 40 },
    { id: 'SIG', name: { es: 'Señal (naranjo)', en: 'Signal (orange)' }, x: 10, y: 40 },
  ],
  props: [],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('GND'), ohms: 500 },
  ],
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 8, cause: 'overvoltage', action: 'burn' },
  ],
  digital: {
    watch: ['SIG'],
    create: (io) => {
      let high = false;
      let rose = 0;
      let lastPulse = -1;
      let target: number | null = null;
      let angle = 90;
      return {
        edge: (_pin, drive) => {
          const now = io.now();
          if (drive === 'high') {
            high = true;
            rose = now;
          } else if (high) {
            high = false;
            const width = now - rose;
            if (width < 300e-6 || width > 2800e-6) return;
            const ratio = (width - MIN_PULSE) / (MAX_PULSE - MIN_PULSE);
            target = Math.max(0, Math.min(180, ratio * 180));
            lastPulse = now;
          }
        },
        tick: (dt) => {
          // Without pulses the servo stops holding its position.
          const driven = target !== null && io.now() - lastPulse < 0.1 && io.v('VCC', 'GND') > 4;
          if (driven && target !== null) {
            const reach = SPEED * dt;
            angle += Math.max(-reach, Math.min(reach, target - angle));
          }
          io.aux('angle', angle);
        },
      };
    },
  },
  footprint: (_props, visual) => {
    const angle = visual?.aux?.angle ?? 90;
    return `
      <path d="M-10 40V28" stroke="#7a4a21" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M0 40V28" stroke="#d93025" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M10 40V28" stroke="#f29900" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="-28" y="-2" width="56" height="8" rx="2" fill="#2a5fb0"/>
      <rect x="-20" y="-22" width="40" height="52" rx="3" fill="#2f6fbf" stroke="#1d4780"/>
      <circle cx="0" cy="-10" r="9" fill="#e6e9ec" stroke="#8f969d"/>
      <g transform="rotate(${(angle - 90).toFixed(1)} 0 -10)">
        <rect x="-4" y="-40" width="8" height="34" rx="4" fill="#f4f5f6" stroke="#8f969d"/>
        <circle cx="0" cy="-35" r="1.2" fill="#8f969d"/>
      </g>
      <circle cx="0" cy="-10" r="2.5" fill="#30353a"/>
      <text x="0" y="22" font-size="7" font-family="monospace" text-anchor="middle" fill="#e9f1fb">${Math.round(angle)}°</text>`;
  },
};

export default servo;
