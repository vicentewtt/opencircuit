import { stringProp, type PartDef } from '../types';

/**
 * Inductive proximity sensor, three wires, PNP normally open: with metal
 * in front of it, the black wire delivers the supply voltage. Click it to
 * put a target in front.
 */
const sensor: PartDef = {
  type: 'proximity-sensor',
  category: 'industrial',
  name: { es: 'Sensor inductivo (PNP, 3 hilos)', en: 'Inductive proximity sensor (PNP, 3-wire)' },
  keywords: ['sensor', 'inductivo', 'inductive', 'proximidad', 'proximity', 'pnp', '3 hilos', '24v', 'industrial', 'detector'],
  refPrefix: 'B',
  bounds: { x: -14, y: -40, width: 28, height: 70 },
  pins: [
    { id: 'BN', name: { es: 'Café: +24 V', en: 'Brown: +24 V' }, x: -10, y: 30 },
    { id: 'BK', name: { es: 'Negro: salida', en: 'Black: output' }, x: 0, y: 30 },
    { id: 'BU', name: { es: 'Azul: 0 V', en: 'Blue: 0 V' }, x: 10, y: 30 },
  ],
  props: [
    {
      kind: 'select',
      key: 'target',
      label: { es: 'Objeto metálico', en: 'Metal target' },
      default: 'no',
      options: [
        { value: 'no', label: { es: 'Ausente', en: 'Absent' } },
        { value: 'yes', label: { es: 'Presente', en: 'Present' } },
      ],
    },
  ],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('BN'), b: ctx.pin('BU'), ohms: 2400 },
    { name: 'out', kind: 'switch', a: ctx.pin('BN'), b: ctx.pin('BK'), ohms: 5 },
  ],
  behavior: {
    init: () => ({}),
    update: (io) => {
      const detecting = stringProp(io.props, 'target') === 'yes' && io.v('BN', 'BU') > 10;
      io.setSwitch('out', detecting);
      io.aux('on', detecting ? 1 : 0);
    },
  },
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 36, cause: 'overvoltage', action: 'burn' },
    { element: 'main', quantity: 'reverse-voltage', max: 1, cause: 'reverse-polarity', action: 'burn' },
    { element: 'out', quantity: 'current', max: 0.3, cause: 'overcurrent', action: 'burn', tolerance: 0.5 },
  ],
  interactive: { kind: 'toggle', prop: 'target', values: ['no', 'yes'] },
  footprint: (props, visual) => `
    <path d="M-10 30V18" stroke="#7a4a21" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M0 30V18" stroke="#17191b" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M10 30V18" stroke="#2f6fbf" stroke-width="2.4" stroke-linecap="round"/>
    ${stringProp(props, 'target') === 'yes' ? '<rect x="-14" y="-40" width="28" height="5" fill="#8f969d" stroke="#5d646b"/>' : ''}
    <rect x="-9" y="-30" width="18" height="50" rx="2" fill="#c3c8cd" stroke="#70777e"/>
    <path d="M-9 -22H9M-9 -18H9M-9 -14H9M-9 -10H9M-9 -6H9M-9 -2H9M-9 2H9" stroke="#8f969d" stroke-width="0.8"/>
    <rect x="-9" y="-33" width="18" height="6" rx="1" fill="#2f6fbf"/>
    <circle cx="0" cy="12" r="2.4" fill="${(visual?.aux?.on ?? 0) > 0 ? '#ffd60a' : '#6f6014'}"/>`,
};

export default sensor;
