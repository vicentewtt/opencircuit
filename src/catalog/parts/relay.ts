import type { BehaviorIo } from '../model';
import { stringProp, type PartDef, type PartProps } from '../types';

/** Coil resistance for each rated voltage: about 70 mA at 5 V, 30 mA at 12 V and 24 V. */
const COILS: Record<string, { volts: number; ohms: number }> = {
  '5': { volts: 5, ohms: 70 },
  '12': { volts: 12, ohms: 400 },
  '24': { volts: 24, ohms: 800 },
};
const DEFAULT_COIL = { volts: 5, ohms: 70 };

const coilOf = (props: PartProps): { volts: number; ohms: number } =>
  COILS[stringProp(props, 'coil')] ?? DEFAULT_COIL;

/**
 * Moves the contacts according to the coil current: it pulls in at 60 % of
 * the rated current and only releases below 20 %.
 */
export function updateRelay(io: BehaviorIo, state: Record<string, number>, ratedAmps: number): void {
  const amps = Math.abs(io.i('main'));
  if (amps > 0.6 * ratedAmps) state.on = 1;
  else if (amps < 0.2 * ratedAmps) state.on = 0;
  io.setSwitch('no', state.on === 1);
  io.setSwitch('nc', state.on !== 1);
  io.aux('on', state.on ?? 0);
}

const relay: PartDef = {
  type: 'relay',
  category: 'output',
  name: { es: 'Relé (1 contacto conmutado)', en: 'Relay (SPDT)' },
  keywords: ['rele', 'relay', 'relevador', 'spdt', 'contacto', 'contact', 'bobina', 'coil'],
  refPrefix: 'K',
  bounds: { x: -30, y: -20, width: 60, height: 40 },
  pins: [
    { id: 'coil1', name: { es: 'Bobina 1', en: 'Coil 1' }, x: -30, y: -10 },
    { id: 'coil2', name: { es: 'Bobina 2', en: 'Coil 2' }, x: -30, y: 10 },
    { id: 'nc', name: { es: 'Normalmente cerrado (NC)', en: 'Normally closed (NC)' }, x: 30, y: -10 },
    { id: 'com', name: { es: 'Común (COM)', en: 'Common (COM)' }, x: 30, y: 0 },
    { id: 'no', name: { es: 'Normalmente abierto (NO)', en: 'Normally open (NO)' }, x: 30, y: 10 },
  ],
  props: [
    {
      kind: 'select',
      key: 'coil',
      label: { es: 'Voltaje de la bobina', en: 'Coil voltage' },
      default: '5',
      options: [
        { value: '5', label: { es: '5 V', en: '5 V' } },
        { value: '12', label: { es: '12 V', en: '12 V' } },
        { value: '24', label: { es: '24 V', en: '24 V' } },
      ],
    },
  ],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('coil1'), b: ctx.pin('coil2'), ohms: coilOf(ctx.props).ohms },
    { name: 'no', kind: 'switch', a: ctx.pin('com'), b: ctx.pin('no'), ohms: 0.05 },
    { name: 'nc', kind: 'switch', a: ctx.pin('com'), b: ctx.pin('nc'), ohms: 0.05 },
  ],
  behavior: {
    init: () => ({ on: 0 }),
    update: (io, state) => {
      const coil = coilOf(io.props);
      updateRelay(io, state, coil.volts / coil.ohms);
    },
  },
  faults: (props) => [
    {
      element: 'main',
      quantity: 'voltage',
      max: coilOf(props).volts * 1.8,
      cause: 'overvoltage',
      action: 'burn',
      tolerance: 0.5,
    },
    { element: 'no', quantity: 'current', max: 10, cause: 'overcurrent', action: 'burn' },
    { element: 'nc', quantity: 'current', max: 10, cause: 'overcurrent', action: 'burn' },
  ],
  footprint: (props, visual) => {
    const on = (visual?.aux?.on ?? 0) > 0;
    return `
      <path d="M-30 -10H-22M-30 10H-22M22 -10H30M22 0H30M22 10H30" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"/>
      <rect x="-22" y="-20" width="44" height="40" rx="3" fill="#2f6fbf" stroke="#1d4780"/>
      <text x="-4" y="-7" font-size="6" font-family="monospace" text-anchor="middle" fill="#e9f1fb">${coilOf(props).volts} V</text>
      <path d="M16 0H6L${on ? '14 9' : '14 -9'}" fill="none" stroke="#e9f1fb" stroke-width="1.6" stroke-linecap="round"/>
      <circle cx="16" cy="-10" r="1.8" fill="#e9f1fb"/>
      <circle cx="16" cy="10" r="1.8" fill="#e9f1fb"/>
      <circle cx="-12" cy="8" r="3.5" fill="${on ? '#5fe07a' : '#1d4780'}"/>`;
  },
};

export default relay;
