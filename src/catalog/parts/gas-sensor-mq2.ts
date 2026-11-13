import { analogSensor } from '../analog-sensor';
import { numberProp } from '../types';

const level = (props: Parameters<typeof numberProp>[0]): number => numberProp(props, 'gas', 10) / 100;
/** Level at which the digital output switches (set by a trimmer on the real module). */
const THRESHOLD = 0.5;

/** Gas and smoke sensor module: AO rises with the concentration, DO goes low above the threshold. */
export default analogSensor({
  type: 'gas-sensor-mq2',
  name: { es: 'Sensor de gas y humo MQ-2', en: 'Gas and smoke sensor MQ-2' },
  keywords: ['gas', 'humo', 'smoke', 'mq-2', 'mq2', 'mq', 'glp', 'lpg', 'alarma'],
  bounds: { x: -22, y: -28, width: 44, height: 58 },
  pins: [
    { id: 'VCC', name: { es: 'VCC (5 V)', en: 'VCC (5 V)' }, x: -20, y: 30 },
    { id: 'GND', name: { es: 'GND', en: 'GND' }, x: -10, y: 30 },
    { id: 'DO', name: { es: 'DO (salida digital)', en: 'DO (digital output)' }, x: 0, y: 30 },
    { id: 'AO', name: { es: 'AO (salida analógica)', en: 'AO (analog output)' }, x: 10, y: 30 },
  ],
  props: [
    {
      kind: 'number',
      key: 'gas',
      label: { es: 'Concentración de gas', en: 'Gas concentration' },
      unit: '%',
      si: false,
      default: 10,
      min: 0,
      max: 100,
      slider: true,
    },
  ],
  outputs: [
    { pin: 'AO', volts: (props, supply) => supply * (0.08 + 0.8 * level(props)) },
    { pin: 'DO', volts: (props, supply) => (level(props) > THRESHOLD ? 0 : supply) },
  ],
  minSupply: 4,
  supplyOhms: 33,
  footprint: (props) => `
    <path d="M-20 30V20M-10 30V20M0 30V20M10 30V20" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="-22" y="-28" width="44" height="50" rx="3" fill="#1d3c78" stroke="#12264d"/>
    <circle cx="0" cy="-8" r="15" fill="#c3c8cd" stroke="#70777e"/>
    <circle cx="0" cy="-8" r="10" fill="#8f969d"/>
    <path d="M-8 -12h16M-9 -8h18M-8 -4h16" stroke="#5d646b" stroke-width="1"/>
    <circle cx="16" cy="16" r="2.2" fill="${level(props) > THRESHOLD ? '#ff5a4f' : '#5c1f1b'}"/>
    <text x="-4" y="18" font-size="6" font-family="monospace" text-anchor="middle" fill="#e9f1fb">${numberProp(props, 'gas', 10).toFixed(0)}%</text>`,
});
