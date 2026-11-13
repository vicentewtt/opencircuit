import { analogSensor } from '../analog-sensor';
import { numberProp } from '../types';

/** Soil probe: the wetter the soil, the lower the voltage on AO. */
export default analogSensor({
  type: 'soil-moisture',
  name: { es: 'Sensor de humedad de suelo', en: 'Soil moisture sensor' },
  keywords: ['humedad', 'suelo', 'tierra', 'soil', 'moisture', 'riego', 'planta', 'yl-69', 'fc-28'],
  bounds: { x: -16, y: -40, width: 32, height: 70 },
  pins: [
    { id: 'VCC', name: { es: 'VCC (5 V)', en: 'VCC (5 V)' }, x: -10, y: 30 },
    { id: 'GND', name: { es: 'GND', en: 'GND' }, x: 0, y: 30 },
    { id: 'AO', name: { es: 'AO (salida analógica)', en: 'AO (analog output)' }, x: 10, y: 30 },
  ],
  props: [
    {
      kind: 'number',
      key: 'moisture',
      label: { es: 'Humedad del suelo', en: 'Soil moisture' },
      unit: '%',
      si: false,
      default: 30,
      min: 0,
      max: 100,
      slider: true,
    },
  ],
  outputs: [{ pin: 'AO', volts: (props, supply) => supply * (0.95 - 0.7 * (numberProp(props, 'moisture', 30) / 100)) }],
  minSupply: 3,
  supplyOhms: 1000,
  footprint: (props) => `
    <path d="M-10 30V20M0 30V20M10 30V20" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M-16 22V-22l5 -18l5 18V4h12V-22l5 -18l5 18V22z" fill="#17191b" stroke="#000000"/>
    <path d="M-11 -34V-4M11 -34V-4" stroke="#c9a227" stroke-width="3" stroke-linecap="round"/>
    <text x="0" y="16" font-size="6" font-family="monospace" text-anchor="middle" fill="#8fdcff">${numberProp(props, 'moisture', 30).toFixed(0)}%</text>`,
});
