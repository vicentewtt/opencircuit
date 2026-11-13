import { rms, terminal } from '../industrial';
import { display, reading } from '../meters';
import type { PartDef } from '../types';

const PINS = [
  terminal('L', -10, -40, 'Entrada de fase', 'Line in'),
  terminal('N', 10, -40, 'Neutro', 'Neutral'),
  terminal('OUT', -10, 40, 'Salida de fase (a la carga)', 'Line out (to the load)'),
];
/** Seconds over which the power is averaged. */
const TAU = 0.1;

/**
 * Single-phase power meter: the line passes through it and the neutral
 * gives the voltage reference. Shows active power, voltage, current, power
 * factor and the energy used so far.
 */
const wattmeter: PartDef = {
  type: 'wattmeter',
  category: 'industrial',
  name: { es: 'Vatímetro monofásico', en: 'Single-phase wattmeter' },
  keywords: ['vatimetro', 'wattmeter', 'potencia', 'power', 'watts', 'energia', 'energy', 'kwh', 'factor de potencia', 'medidor', 'industrial'],
  refPrefix: 'P',
  bounds: { x: -32, y: -40, width: 64, height: 80 },
  pins: PINS,
  props: [],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('L'), b: ctx.pin('OUT'), ohms: 0.001 },
    { name: 'sense', kind: 'resistor', a: ctx.pin('L'), b: ctx.pin('N'), ohms: 10e6 },
  ],
  behavior: {
    init: () => ({ power: 0, energy: 0 }),
    update: (io, state) => {
      const volts = io.v('OUT', 'N');
      const amps = io.i('main');
      const blend = io.dt <= 0 ? 1 : 1 - Math.exp(-io.dt / TAU);
      state.power = (state.power ?? 0) + blend * (volts * amps - (state.power ?? 0));
      state.energy = (state.energy ?? 0) + (state.power * io.dt) / 3600;
      const vRms = rms(state, 'volts', volts, io.dt, TAU);
      const iRms = rms(state, 'amps', amps, io.dt, TAU);
      const apparent = vRms * iRms;
      io.aux('watts', state.power);
      io.aux('volts', vRms);
      io.aux('amps', iRms);
      io.aux('factor', apparent > 1e-6 ? Math.max(-1, Math.min(1, state.power / apparent)) : 0);
      io.aux('wh', state.energy);
    },
  },
  footprint: (_props, visual) => {
    const aux = visual?.aux;
    return `
      <path d="M-10 -40V-30M10 -40V-30M-10 40V30" stroke="#9aa0a6" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="-32" y="-32" width="64" height="64" rx="3" fill="#eceef0" stroke="#8f969d"/>
      ${display(
        [
          reading(aux?.watts ?? 0, 'W'),
          `${reading(aux?.volts ?? 0, 'V')} ${reading(aux?.amps ?? 0, 'A')}`,
          `FP ${(aux?.factor ?? 0).toFixed(2)}`,
          reading(aux?.wh ?? 0, 'Wh'),
        ].map((line, index) => (index === 1 ? `<tspan font-size="4.6">${line}</tspan>` : line)),
        58,
        -24,
      )}
      <text x="0" y="27" font-size="5" font-family="monospace" text-anchor="middle" fill="#30353a">L · N · OUT</text>`;
  },
};

export default wattmeter;
