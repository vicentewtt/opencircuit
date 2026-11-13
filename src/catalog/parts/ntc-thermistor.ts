import { numberProp, type PartDef, type PartProps } from '../types';

const BETA = 3950;
const KELVIN = 273.15;

/** Beta model: R = R25 · exp(B · (1/T − 1/298.15 K)). */
export const ntcOhms = (props: PartProps): number => {
  const kelvin = numberProp(props, 'temperature', 25) + KELVIN;
  return numberProp(props, 'r25', 10e3) * Math.exp(BETA * (1 / kelvin - 1 / (25 + KELVIN)));
};

const ntc: PartDef = {
  type: 'ntc-thermistor',
  category: 'sensor',
  name: { es: 'Termistor NTC', en: 'NTC thermistor' },
  keywords: ['ntc', 'termistor', 'thermistor', 'temperatura', 'temperature', 'sensor'],
  refPrefix: 'RT',
  bounds: { x: -13, y: -14, width: 26, height: 34 },
  pins: [
    { id: '1', name: { es: 'Terminal 1', en: 'Terminal 1' }, x: -10, y: 20 },
    { id: '2', name: { es: 'Terminal 2', en: 'Terminal 2' }, x: 10, y: 20 },
  ],
  props: [
    {
      kind: 'number',
      key: 'temperature',
      label: { es: 'Temperatura', en: 'Temperature' },
      unit: '°C',
      si: false,
      default: 25,
      min: -20,
      max: 120,
    },
    {
      kind: 'number',
      key: 'r25',
      label: { es: 'Resistencia a 25 °C', en: 'Resistance at 25 °C' },
      unit: 'Ω',
      si: true,
      default: 10e3,
      min: 100,
      max: 1e6,
    },
  ],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('1'), b: ctx.pin('2'), ohms: ntcOhms(ctx.props) },
  ],
  faults: () => [
    { element: 'main', quantity: 'power', max: 0.25, cause: 'overpower', action: 'burn', tolerance: 0.5 },
  ],
  footprint: () => `
    <path d="M-10 20V2M10 20V2" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
    <ellipse cx="0" cy="-3" rx="12" ry="10" fill="#1f1f1f" stroke="#000000"/>
    <text x="0" y="-0.5" font-size="6" font-family="monospace" text-anchor="middle" fill="#c9cdd2">NTC</text>`,
};

export default ntc;
