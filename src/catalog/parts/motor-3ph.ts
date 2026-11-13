import { SQRT2 } from '../industrial';
import { stringProp, type PartDef, type PartProps } from '../types';

/** Rated current of each winding, in amperes RMS. */
const RATED_AMPS = 1.9;
/** Four poles: the shaft turns at half the electrical frequency, minus the slip. */
const POLE_PAIRS = 2;
const SLIP = 0.033;
const SPIN_UP = 0.4;
const RAD_PER_SEC_TO_RPM = 60 / (2 * Math.PI);

const WINDINGS = [
  { name: 'main', a: 'U1', b: 'U2' },
  { name: 'winding:v', a: 'V1', b: 'V2' },
  { name: 'winding:w', a: 'W1', b: 'W2' },
];
const windingVolts = (props: PartProps): number => (stringProp(props, 'winding') === '380' ? 380 : 220);

/**
 * Three-phase induction motor with its six terminals, laid out as in a real
 * terminal box (U1 V1 W1 above W2 U2 V2): three vertical links make a delta
 * connection, one horizontal link across the bottom row makes a star.
 * It turns with the rotating field of its currents: swapping two phases
 * reverses it, and with a phase missing it does not start.
 */
const motor: PartDef = {
  type: 'motor-3ph',
  category: 'industrial',
  name: { es: 'Motor trifásico (6 bornes)', en: 'Three-phase motor (6 terminals)' },
  keywords: ['motor', 'trifasico', 'three-phase', 'induccion', 'induction', 'jaula', 'estrella', 'triangulo', 'star', 'delta', 'industrial'],
  refPrefix: 'M',
  bounds: { x: -34, y: -50, width: 68, height: 100 },
  pins: [
    { id: 'U1', name: { es: 'U1', en: 'U1' }, x: -20, y: -50 },
    { id: 'V1', name: { es: 'V1', en: 'V1' }, x: 0, y: -50 },
    { id: 'W1', name: { es: 'W1', en: 'W1' }, x: 20, y: -50 },
    { id: 'W2', name: { es: 'W2', en: 'W2' }, x: -20, y: 50 },
    { id: 'U2', name: { es: 'U2', en: 'U2' }, x: 0, y: 50 },
    { id: 'V2', name: { es: 'V2', en: 'V2' }, x: 20, y: 50 },
  ],
  props: [
    {
      kind: 'select',
      key: 'winding',
      label: { es: 'Voltaje de cada bobinado', en: 'Voltage of each winding' },
      default: '220',
      options: [
        { value: '220', label: { es: '220 V (placa 220 Δ / 380 Y)', en: '220 V (plate 220 Δ / 380 Y)' } },
        { value: '380', label: { es: '380 V (placa 380 Δ / 660 Y)', en: '380 V (plate 380 Δ / 660 Y)' } },
      ],
    },
  ],
  model: (ctx) =>
    WINDINGS.map(({ name, a, b }) => ({
      name,
      kind: 'resistor' as const,
      a: ctx.pin(a),
      b: ctx.pin(b),
      ohms: windingVolts(ctx.props) / RATED_AMPS,
    })),
  behavior: {
    init: () => ({ speed: 0, angle: 0, field: 0, rate: 0, strength: 0 }),
    update: (io, state) => {
      const [u = 0, v = 0, w = 0] = WINDINGS.map(({ name }) => io.i(name));
      // The three currents as one rotating vector.
      const alpha = u - (v + w) / 2;
      const beta = (Math.sqrt(3) / 2) * (v - w);
      const size = Math.hypot(alpha, beta);
      const blend = io.dt <= 0 ? 0 : 1 - Math.exp(-io.dt / 0.02);
      let rate = 0;
      if (size > 0.05 && io.dt > 0) {
        const field = Math.atan2(beta, alpha);
        const turn = Math.atan2(Math.sin(field - (state.field ?? 0)), Math.cos(field - (state.field ?? 0)));
        state.field = field;
        // A field that only swings back and forth (a phase missing) does not turn.
        if (Math.abs(turn) < Math.PI / 2) rate = turn / io.dt;
      }
      state.rate = (state.rate ?? 0) + blend * (rate - (state.rate ?? 0));
      state.strength = (state.strength ?? 0) + blend * (size / (1.5 * SQRT2 * RATED_AMPS) - (state.strength ?? 0));

      // A drive lowers the voltage along with the frequency, so little current still counts.
      const driven = state.strength > 0.15;
      const target = driven ? ((state.rate / POLE_PAIRS) * (1 - SLIP)) : 0;
      const speed = (state.speed ?? 0) + (target - (state.speed ?? 0)) * Math.min(1, io.dt / (driven ? SPIN_UP : 2 * SPIN_UP));
      state.speed = speed;
      state.angle = ((state.angle ?? 0) + speed * io.dt) % (2 * Math.PI);
      io.aux('rpm', speed * RAD_PER_SEC_TO_RPM);
      io.aux('angle', state.angle);
    },
  },
  faults: () =>
    WINDINGS.map(({ name }) => ({
      element: name,
      quantity: 'current' as const,
      // Checked against the instantaneous current: with this limit the
      // damage of each peak outweighs the cooling in between from about
      // 1.15 times the rated current, slowly enough for a thermal relay to act first.
      max: RATED_AMPS * SQRT2 * 0.75,
      cause: 'overcurrent' as const,
      action: 'burn' as const,
      tolerance: 6,
    })),
  footprint: (_props, visual) => {
    const rpm = visual?.aux?.rpm ?? 0;
    const degrees = (((visual?.aux?.angle ?? 0) * 180) / Math.PI).toFixed(0);
    const box = (x: number, y: number, id: string): string =>
      `<path d="M${x} ${y}V${y < 0 ? -36 : 36}" stroke="#9aa0a6" stroke-width="2.4" stroke-linecap="round"/>
       <circle cx="${x}" cy="${y < 0 ? -34 : 34}" r="3" fill="#c9a227" stroke="#8a6d14" stroke-width="0.6"/>
       <text x="${x}" y="${y < 0 ? -26 : 29}" font-size="4.6" font-family="monospace" text-anchor="middle" fill="#30353a">${id}</text>`;
    return `
      <rect x="-34" y="-42" width="68" height="84" rx="4" fill="#d9dde1" stroke="#70777e"/>
      ${box(-20, -50, 'U1')}${box(0, -50, 'V1')}${box(20, -50, 'W1')}
      ${box(-20, 50, 'W2')}${box(0, 50, 'U2')}${box(20, 50, 'V2')}
      <circle cx="0" cy="0" r="19" fill="#2f6fbf" stroke="#1d4780"/>
      <circle cx="0" cy="0" r="11" fill="#e6e9ec" stroke="#8f969d"/>
      <g transform="rotate(${degrees})">
        <path d="M0 0V-10M0 0L8.7 5M0 0L-8.7 5" stroke="#30353a" stroke-width="2.6" stroke-linecap="round"/>
      </g>
      <circle cx="0" cy="0" r="2.5" fill="#30353a"/>
      <rect x="-16" y="13.5" width="32" height="8" rx="1.5" fill="#17191b"/>
      <text x="0" y="19.5" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#8fdcff">${Math.round(rpm)} rpm</text>`;
  },
};

export default motor;
