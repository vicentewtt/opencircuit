import { SQRT2, rms } from '../industrial';
import type { PartDef } from '../types';

const RATED_VOLTS = 220;
const RATED_AMPS = 2.5;
const FULL_SPEED = (1450 * 2 * Math.PI) / 60;
const SPIN_UP = 0.5;
const RAD_PER_SEC_TO_RPM = 60 / (2 * Math.PI);

/** Single-phase motor for 220 V (pumps, fans, compressors). */
const motor: PartDef = {
  type: 'motor-1ph',
  category: 'industrial',
  name: { es: 'Motor monofásico (220 V)', en: 'Single-phase motor (220 V)' },
  keywords: ['motor', 'monofasico', 'single-phase', '220', 'bomba', 'pump', 'ventilador', 'fan', 'industrial'],
  refPrefix: 'M',
  bounds: { x: -30, y: -40, width: 60, height: 76 },
  pins: [
    { id: 'L', name: { es: 'Fase (L)', en: 'Line (L)' }, x: -10, y: -40 },
    { id: 'N', name: { es: 'Neutro (N)', en: 'Neutral (N)' }, x: 10, y: -40 },
  ],
  props: [],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('L'), b: ctx.pin('N'), ohms: RATED_VOLTS / RATED_AMPS },
  ],
  behavior: {
    init: () => ({ speed: 0, angle: 0 }),
    update: (io, state) => {
      const volts = rms(state, 'volts', io.v('L', 'N'), io.dt);
      const target = volts > 0.7 * RATED_VOLTS ? FULL_SPEED * Math.min(1.1, volts / RATED_VOLTS) : 0;
      const speed = (state.speed ?? 0) + (target - (state.speed ?? 0)) * Math.min(1, io.dt / SPIN_UP);
      state.speed = speed;
      state.angle = ((state.angle ?? 0) + speed * io.dt) % (2 * Math.PI);
      io.aux('rpm', speed * RAD_PER_SEC_TO_RPM);
      io.aux('angle', state.angle);
    },
  },
  faults: () => [
    { element: 'main', quantity: 'voltage', max: RATED_VOLTS * SQRT2 * 1.3, cause: 'overvoltage', action: 'burn', tolerance: 1 },
  ],
  footprint: (_props, visual) => {
    const degrees = (((visual?.aux?.angle ?? 0) * 180) / Math.PI).toFixed(0);
    return `
      <path d="M-10 -40V-26M10 -40V-26" stroke="#9aa0a6" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="-16" y="-32" width="32" height="12" rx="2" fill="#aeb4ba" stroke="#70777e"/>
      <circle cx="0" cy="6" r="28" fill="#2f6fbf" stroke="#1d4780"/>
      <circle cx="0" cy="6" r="14" fill="#e6e9ec" stroke="#8f969d"/>
      <g transform="rotate(${degrees} 0 6)">
        <path d="M0 6V-6M0 6L10.4 12M0 6L-10.4 12" stroke="#30353a" stroke-width="2.8" stroke-linecap="round"/>
      </g>
      <circle cx="0" cy="6" r="2.8" fill="#30353a"/>
      <text x="0" y="31" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#e9f1fb">${Math.round(visual?.aux?.rpm ?? 0)} rpm</text>`;
  },
};

export default motor;
