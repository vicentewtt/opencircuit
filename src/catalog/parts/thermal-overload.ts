import { dinBody, heat, rms, terminal } from '../industrial';
import { numberProp, type PartDef } from '../types';

const PINS = [
  terminal('1L1', -30, -40),
  terminal('3L2', -10, -40),
  terminal('5L3', 10, -40),
  terminal('95', 30, -40, 'Contacto NC 95', 'NC contact 95'),
  terminal('97', 50, -40, 'Contacto NA 97', 'NO contact 97'),
  terminal('2T1', -30, 40),
  terminal('4T2', -10, 40),
  terminal('6T3', 10, 40),
  terminal('96', 30, 40, 'Contacto NC 96', 'NC contact 96'),
  terminal('98', 50, 40, 'Contacto NA 98', 'NO contact 98'),
];
const BOUNDS = { x: -40, y: -40, width: 100, height: 80 };
const HEATERS = [
  { name: 'main', a: '1L1', b: '2T1' },
  { name: 'heater2', a: '3L2', b: '4T2' },
  { name: 'heater3', a: '5L3', b: '6T3' },
];
/** Seconds the bimetal takes to follow the current. */
const TAU = 8;
/** Trips once the heating equals about 1.14 times the set current. */
const TRIP_HEAT = 1.3;

/**
 * Thermal overload relay: the motor current passes through it and, if it
 * stays above the setting, contact 95-96 opens (to drop the contactor) and
 * 97-98 closes (for an alarm). Click it to reset once it has cooled.
 */
const overload: PartDef = {
  type: 'thermal-overload',
  category: 'industrial',
  name: { es: 'Relé térmico', en: 'Thermal overload relay' },
  keywords: ['rele termico', 'termico', 'thermal', 'overload', 'sobrecarga', 'proteccion', 'motor', '95', '96', 'industrial'],
  refPrefix: 'F',
  bounds: BOUNDS,
  pins: PINS,
  props: [
    { kind: 'number', key: 'setting', label: { es: 'Corriente de ajuste', en: 'Current setting' }, unit: 'A', si: false, default: 2, min: 0.1, max: 40 },
  ],
  model: (ctx) => [
    ...HEATERS.map(({ name, a, b }) => ({ name, kind: 'resistor' as const, a: ctx.pin(a), b: ctx.pin(b), ohms: 0.02 })),
    { name: 'nc', kind: 'switch', a: ctx.pin('95'), b: ctx.pin('96'), ohms: 0.01 },
    { name: 'no', kind: 'switch', a: ctx.pin('97'), b: ctx.pin('98'), ohms: 0.01 },
  ],
  behavior: {
    init: () => ({ tripped: 0, heat: 0 }),
    update: (io, state) => {
      const amps = Math.max(...HEATERS.map(({ name }) => rms(state, `i:${name}`, io.i(name), io.dt)));
      const level = heat(state, amps, numberProp(io.props, 'setting', 2), io.dt, TAU);
      if (level >= TRIP_HEAT) state.tripped = 1;
      else if (io.input('reset') > 0 && level < 1) state.tripped = 0;
      io.setSwitch('nc', state.tripped !== 1);
      io.setSwitch('no', state.tripped === 1);
      io.aux('tripped', state.tripped ?? 0);
      io.aux('heat', level);
    },
  },
  interactive: { kind: 'momentary', input: 'reset' },
  footprint: (props, visual) => {
    const tripped = (visual?.aux?.tripped ?? 0) > 0;
    const level = Math.min(1, (visual?.aux?.heat ?? 0) / TRIP_HEAT);
    return dinBody(
      { pins: PINS, bounds: BOUNDS },
      `${numberProp(props, 'setting', 2)} A`,
      `<rect x="-30" y="-8" width="50" height="5" rx="1" fill="#c3c8cd"/>
       <rect x="-30" y="-8" width="${(50 * level).toFixed(1)}" height="5" rx="1" fill="${tripped ? '#d93025' : '#f29900'}"/>
       <rect x="30" y="-12" width="14" height="12" rx="2" fill="${tripped ? '#d93025' : '#2f6fbf'}"/>
       <text x="37" y="-3.5" font-size="5" font-family="monospace" text-anchor="middle" fill="#ffffff">${tripped ? 'TRIP' : 'R'}</text>`,
    );
  },
};

export default overload;
