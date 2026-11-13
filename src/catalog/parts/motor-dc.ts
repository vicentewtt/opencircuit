import type { PartDef } from '../types';

/**
 * Small 6 V hobby motor. Electrically it is its winding resistance in series
 * with the voltage it generates while turning (back-EMF); mechanically, a
 * rotor with inertia and friction.
 */
const WINDING_OHMS = 10;
/** Volts per rad/s, and also newton-metres per ampere. */
const MOTOR_CONSTANT = 0.0095;
const INERTIA = 1.8e-6;
const FRICTION = 8e-7;
const RAD_PER_SEC_TO_RPM = 60 / (2 * Math.PI);

const motorDc: PartDef = {
  type: 'motor-dc',
  category: 'output',
  name: { es: 'Motor DC', en: 'DC motor' },
  keywords: ['motor', 'dc', 'cc', 'continua', 'hobby', 'juguete'],
  refPrefix: 'M',
  bounds: { x: -20, y: -22, width: 40, height: 52 },
  pins: [
    { id: 'positive', name: { es: 'Terminal +', en: 'Terminal +' }, x: -10, y: 30 },
    { id: 'negative', name: { es: 'Terminal −', en: 'Terminal −' }, x: 10, y: 30 },
  ],
  props: [],
  model: (ctx) => {
    const rotor = ctx.internal('rotor');
    return [
      { name: 'main', kind: 'resistor', a: ctx.pin('positive'), b: rotor, ohms: WINDING_OHMS },
      { name: 'emf', kind: 'source', p: rotor, n: ctx.pin('negative') },
    ];
  },
  behavior: {
    init: () => ({ speed: 0, angle: 0 }),
    update: (io, state) => {
      const speed = state.speed ?? 0;
      // Torque from the current, minus friction, accelerates the rotor.
      const torque = MOTOR_CONSTANT * io.i('main') - FRICTION * speed;
      const next = speed + (torque / INERTIA) * io.dt;
      state.speed = next;
      state.angle = ((state.angle ?? 0) + next * io.dt) % (2 * Math.PI);
      io.setSource('emf', MOTOR_CONSTANT * next);
      io.aux('rpm', next * RAD_PER_SEC_TO_RPM);
      io.aux('angle', state.angle);
    },
  },
  faults: () => [
    { element: 'main', quantity: 'current', max: 1.5, cause: 'overcurrent', action: 'burn', tolerance: 1 },
  ],
  footprint: (_props, visual) => {
    const rpm = visual?.aux?.rpm ?? 0;
    const degrees = (((visual?.aux?.angle ?? 0) * 180) / Math.PI).toFixed(0);
    return `
      <path d="M-10 30V16M10 30V16" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="0" cy="-2" r="20" fill="#c3c8cd" stroke="#70777e"/>
      <circle cx="0" cy="-2" r="13" fill="#e6e9ec" stroke="#8f969d"/>
      <g transform="rotate(${degrees} 0 -2)">
        <path d="M0 -2V-14M0 -2L10 4M0 -2L-10 4" stroke="#b3541e" stroke-width="3" stroke-linecap="round"/>
      </g>
      <circle cx="0" cy="-2" r="3" fill="#30353a"/>
      <text x="0" y="14" font-size="5" font-family="monospace" text-anchor="middle" fill="#30353a">${Math.round(rpm)} rpm</text>`;
  },
};

export default motorDc;
