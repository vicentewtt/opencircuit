import { stringProp, type PartDef } from '../types';
import { updateRelay } from './relay';

const COIL_OHMS = 70;
const SUPPLY_VOLTS = 5;

/** Relay board for Arduino: the coil is driven by a transistor from a logic input. */
const relayModule: PartDef = {
  type: 'relay-module',
  category: 'output',
  name: { es: 'Módulo relé de 5 V', en: '5 V relay module' },
  keywords: ['rele', 'relay', 'modulo', 'module', 'arduino', '5v', 'relevador'],
  refPrefix: 'K',
  bounds: { x: -40, y: -22, width: 80, height: 44 },
  pins: [
    { id: 'VCC', name: { es: 'VCC (5 V)', en: 'VCC (5 V)' }, x: -40, y: -10 },
    { id: 'GND', name: { es: 'GND', en: 'GND' }, x: -40, y: 0 },
    { id: 'IN', name: { es: 'Señal (IN)', en: 'Signal (IN)' }, x: -40, y: 10 },
    { id: 'nc', name: { es: 'Normalmente cerrado (NC)', en: 'Normally closed (NC)' }, x: 40, y: -10 },
    { id: 'com', name: { es: 'Común (COM)', en: 'Common (COM)' }, x: 40, y: 0 },
    { id: 'no', name: { es: 'Normalmente abierto (NO)', en: 'Normally open (NO)' }, x: 40, y: 10 },
  ],
  props: [
    {
      kind: 'select',
      key: 'trigger',
      label: { es: 'Se activa con', en: 'Triggered by' },
      default: 'high',
      options: [
        { value: 'high', label: { es: 'Nivel alto (HIGH)', en: 'High level (HIGH)' } },
        { value: 'low', label: { es: 'Nivel bajo (LOW)', en: 'Low level (LOW)' } },
      ],
    },
  ],
  model: (ctx) => {
    const driven = ctx.internal('driven');
    return [
      { name: 'main', kind: 'resistor', a: ctx.pin('VCC'), b: driven, ohms: COIL_OHMS },
      { name: 'driver', kind: 'switch', a: driven, b: ctx.pin('GND'), ohms: 1 },
      { name: 'input', kind: 'resistor', a: ctx.pin('IN'), b: ctx.pin('GND'), ohms: 10e3 },
      { name: 'no', kind: 'switch', a: ctx.pin('com'), b: ctx.pin('no'), ohms: 0.05 },
      { name: 'nc', kind: 'switch', a: ctx.pin('com'), b: ctx.pin('nc'), ohms: 0.05 },
    ];
  },
  behavior: {
    init: () => ({ on: 0 }),
    update: (io, state) => {
      const signal = io.v('IN', 'GND');
      // Low-level boards stay off while the input is not connected.
      const wanted =
        stringProp(io.props, 'trigger') === 'low'
          ? io.connected('IN') && signal < 1.5
          : signal > 2;
      io.setSwitch('driver', wanted && io.v('VCC', 'GND') > 3);
      updateRelay(io, state, SUPPLY_VOLTS / COIL_OHMS);
    },
  },
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 9, cause: 'overvoltage', action: 'burn', tolerance: 0.5 },
    { element: 'no', quantity: 'current', max: 10, cause: 'overcurrent', action: 'burn' },
    { element: 'nc', quantity: 'current', max: 10, cause: 'overcurrent', action: 'burn' },
  ],
  footprint: (_props, visual) => {
    const on = (visual?.aux?.on ?? 0) > 0;
    return `
      <path d="M-40 -10H-32M-40 0H-32M-40 10H-32M32 -10H40M32 0H40M32 10H40" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"/>
      <rect x="-34" y="-22" width="68" height="44" rx="3" fill="#14532d" stroke="#0b3019"/>
      <rect x="-8" y="-16" width="34" height="32" rx="2" fill="#2f6fbf" stroke="#1d4780"/>
      <text x="9" y="2" font-size="6" font-family="monospace" text-anchor="middle" fill="#e9f1fb">5 V</text>
      <rect x="-30" y="-14" width="6" height="28" fill="#1b1d1f"/>
      <circle cx="-17" cy="-10" r="3" fill="${on ? '#ff5a4f' : '#5c1f1b'}"/>
      <circle cx="-17" cy="8" r="3" fill="#5fe07a"/>`;
  },
};

export default relayModule;
