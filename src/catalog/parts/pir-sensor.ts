import { stringProp, type PartDef } from '../types';

/**
 * Motion sensor (HC-SR501). Its output goes to 3.3 V while it detects
 * movement. Click it to make something move in front of it.
 */
const pir: PartDef = {
  type: 'pir-sensor',
  category: 'sensor',
  name: { es: 'Sensor de movimiento PIR', en: 'PIR motion sensor' },
  keywords: ['pir', 'movimiento', 'motion', 'presencia', 'presence', 'hc-sr501', 'infrarrojo', 'infrared'],
  refPrefix: 'PIR',
  bounds: { x: -26, y: -28, width: 52, height: 58 },
  pins: [
    { id: 'VCC', name: { es: 'VCC (5 V)', en: 'VCC (5 V)' }, x: -10, y: 30 },
    { id: 'OUT', name: { es: 'Salida', en: 'Output' }, x: 0, y: 30 },
    { id: 'GND', name: { es: 'GND', en: 'GND' }, x: 10, y: 30 },
  ],
  props: [
    {
      kind: 'select',
      key: 'motion',
      label: { es: 'Movimiento', en: 'Motion' },
      default: 'no',
      options: [
        { value: 'no', label: { es: 'Sin movimiento', en: 'No motion' } },
        { value: 'yes', label: { es: 'Hay movimiento', en: 'Motion detected' } },
      ],
    },
  ],
  model: (ctx) => {
    const stage = ctx.internal('stage');
    return [
      { name: 'main', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('GND'), ohms: 50e3 },
      { name: 'out', kind: 'source', p: stage, n: ctx.pin('GND') },
      { name: 'rout', kind: 'resistor', a: stage, b: ctx.pin('OUT'), ohms: 1000 },
    ];
  },
  behavior: {
    init: () => ({}),
    update: (io) => {
      const detecting = stringProp(io.props, 'motion') === 'yes' && io.v('VCC', 'GND') > 4;
      io.setSource('out', detecting ? 3.3 : 0);
    },
  },
  interactive: { kind: 'toggle', prop: 'motion', values: ['no', 'yes'] },
  footprint: (props) => {
    const motion = stringProp(props, 'motion') === 'yes';
    return `
      <path d="M-10 30V20M0 30V20M10 30V20" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="-26" y="-28" width="52" height="50" rx="3" fill="#1f6b3a" stroke="#134526"/>
      <circle cx="0" cy="-4" r="19" fill="${motion ? '#ffd9d4' : '#f4f5f6'}" stroke="#9aa0a6"/>
      <path d="M-13 -4a13 13 0 0 1 26 0M-7 -4a7 7 0 0 1 14 0M-17 -4h34M0 -23v38" fill="none" stroke="#c3c8cd" stroke-width="0.8"/>
      ${motion ? '<circle cx="0" cy="-4" r="5" fill="#ff5a4f"/>' : ''}`;
  },
};

export default pir;
