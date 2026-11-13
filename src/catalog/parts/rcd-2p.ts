import { dinBody, rms, terminal } from '../industrial';
import { stringProp, type PartDef } from '../types';

const PINS = [
  terminal('1', -10, -40, 'Entrada de fase', 'Line in'),
  terminal('N', 10, -40, 'Entrada de neutro', 'Neutral in'),
  terminal('2', -10, 40, 'Salida de fase', 'Line out'),
  terminal('N2', 10, 40, 'Salida de neutro', 'Neutral out'),
];
const BOUNDS = { x: -22, y: -40, width: 44, height: 80 };
/** Residual current that trips it, in amperes. */
const SENSITIVITY = 0.03;

/**
 * Residual-current device: compares the current that leaves through the
 * line with the one that returns through the neutral. If 30 mA or more go
 * missing (to earth, through a fault or a person) it opens both poles.
 */
const rcd: PartDef = {
  type: 'rcd-2p',
  category: 'industrial',
  name: { es: 'Interruptor diferencial 2P (30 mA)', en: 'Residual-current device 2P (30 mA)' },
  keywords: ['diferencial', 'rcd', 'gfci', 'fuga', 'leakage', 'tierra', 'earth', '30ma', 'proteccion', 'industrial'],
  refPrefix: 'Q',
  bounds: BOUNDS,
  pins: PINS,
  props: [
    {
      kind: 'select',
      key: 'state',
      label: { es: 'Palanca', en: 'Lever' },
      default: 'on',
      options: [
        { value: 'on', label: { es: 'Conectado (ON)', en: 'On' } },
        { value: 'off', label: { es: 'Desconectado (OFF)', en: 'Off' } },
      ],
    },
  ],
  model: (ctx) => [
    { name: 'main', kind: 'switch', a: ctx.pin('1'), b: ctx.pin('2'), ohms: 0.01 },
    { name: 'neutral', kind: 'switch', a: ctx.pin('N'), b: ctx.pin('N2'), ohms: 0.01 },
  ],
  behavior: {
    init: () => ({ tripped: 0 }),
    update: (io, state) => {
      if (stringProp(io.props, 'state') !== 'on') state.tripped = 0;
      // Both currents are measured downwards: without leakage they cancel out.
      const residual = rms(state, 'residual', io.i('main') + io.i('neutral'), io.dt, 0.02);
      if (residual > SENSITIVITY) state.tripped = 1;
      const closed = stringProp(io.props, 'state') === 'on' && state.tripped !== 1;
      io.setSwitch('main', closed);
      io.setSwitch('neutral', closed);
      io.aux('closed', closed ? 1 : 0);
      io.aux('tripped', state.tripped ?? 0);
    },
  },
  interactive: { kind: 'toggle', prop: 'state', values: ['on', 'off'] },
  footprint: (props, visual) => {
    const closed = visual?.aux ? (visual.aux.closed ?? 0) > 0 : stringProp(props, 'state') === 'on';
    const tripped = (visual?.aux?.tripped ?? 0) > 0;
    return dinBody(
      { pins: PINS, bounds: BOUNDS },
      '30 mA',
      `<rect x="-16" y="-14" width="20" height="20" rx="2" fill="#c3c8cd"/>
       <rect x="-15" y="${closed ? -13 : -3}" width="18" height="8" rx="1.5" fill="${tripped ? '#f29900' : closed ? '#30353a' : '#d93025'}"/>
       <rect x="8" y="-10" width="9" height="9" rx="1.5" fill="#e2b340"/>
       <text x="12.5" y="-3.5" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#30353a">T</text>`,
    );
  },
};

export default rcd;
