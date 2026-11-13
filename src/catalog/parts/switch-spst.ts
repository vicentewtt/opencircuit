import { stringProp, type PartDef } from '../types';

const switchSpst: PartDef = {
  type: 'switch-spst',
  category: 'input',
  name: { es: 'Interruptor (encendido/apagado)', en: 'On/off switch' },
  keywords: ['interruptor', 'switch', 'spst', 'on', 'off', 'balancin', 'rocker', 'palanca', 'toggle'],
  refPrefix: 'S',
  bounds: { x: -20, y: -10, width: 40, height: 20 },
  pins: [
    { id: '1', name: { es: 'Terminal 1', en: 'Terminal 1' }, x: -20, y: 0 },
    { id: '2', name: { es: 'Terminal 2', en: 'Terminal 2' }, x: 20, y: 0 },
  ],
  props: [
    {
      kind: 'select',
      key: 'state',
      label: { es: 'Estado', en: 'State' },
      default: 'off',
      options: [
        { value: 'off', label: { es: 'Abierto (OFF)', en: 'Open (OFF)' } },
        { value: 'on', label: { es: 'Cerrado (ON)', en: 'Closed (ON)' } },
      ],
    },
  ],
  model: (ctx) =>
    stringProp(ctx.props, 'state') === 'on'
      ? [{ name: 'main', kind: 'resistor', a: ctx.pin('1'), b: ctx.pin('2'), ohms: 0.01 }]
      : [],
  interactive: { kind: 'toggle', prop: 'state', values: ['off', 'on'] },
  footprint: (props) => {
    const on = stringProp(props, 'state') === 'on';
    return `
      <path d="M-20 0H-13M13 0H20" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"/>
      <rect x="-13" y="-9" width="26" height="18" rx="2" fill="#2b2f33" stroke="#111315"/>
      <path d="M-10 ${on ? -6 : 6}L10 ${on ? 6 : -6}V${on ? -6 : 6}z" fill="${on ? '#c0392b' : '#70777e'}"/>
      <text x="${on ? -6 : 6}" y="${on ? 6 : -2}" font-size="5" font-family="monospace" text-anchor="middle" fill="#ffffff">${on ? 'I' : 'O'}</text>`;
  },
};

export default switchSpst;
