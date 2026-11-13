import { numberProp, type PartDef, type PartProps } from '../types';

/** About 1 MΩ in the dark, falling to roughly 500 Ω in full light. */
export const ldrOhms = (props: PartProps): number =>
  10 ** (6 - 3.3 * (numberProp(props, 'light', 50) / 100));

const ldr: PartDef = {
  type: 'ldr',
  category: 'sensor',
  name: { es: 'Fotorresistencia (LDR)', en: 'Photoresistor (LDR)' },
  keywords: ['ldr', 'fotorresistencia', 'photoresistor', 'luz', 'light', 'sensor'],
  refPrefix: 'R',
  bounds: { x: -13, y: -17, width: 26, height: 37 },
  pins: [
    { id: '1', name: { es: 'Terminal 1', en: 'Terminal 1' }, x: -10, y: 20 },
    { id: '2', name: { es: 'Terminal 2', en: 'Terminal 2' }, x: 10, y: 20 },
  ],
  props: [
    {
      kind: 'number',
      key: 'light',
      label: { es: 'Luz que recibe', en: 'Light level' },
      unit: '%',
      si: false,
      default: 50,
      min: 0,
      max: 100,
    },
  ],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('1'), b: ctx.pin('2'), ohms: ldrOhms(ctx.props) },
  ],
  faults: () => [
    { element: 'main', quantity: 'power', max: 0.1, cause: 'overpower', action: 'burn', tolerance: 0.5 },
  ],
  footprint: (props) => {
    const light = numberProp(props, 'light', 50) / 100;
    return `
      <path d="M-10 20V4M10 20V4" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="0" cy="-4" r="12" fill="#d6c7a1" stroke="#8f7e52"/>
      <circle cx="0" cy="-4" r="12" fill="#fff3b0" fill-opacity="${(0.75 * light).toFixed(2)}"/>
      <path d="M-8 -10h13v4h-10v4h10v4h-13" fill="none" stroke="#b3261e" stroke-width="1.3"/>`;
  },
};

export default ldr;
