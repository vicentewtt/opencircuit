import { numberProp, type PartDef } from '../types';

/** Forward drop of the junctions used to build the model, at a few mA. */
const JUNCTION_DROP = 0.65;
const MAX_WATTS = 0.5;

const zener: PartDef = {
  type: 'zener',
  category: 'semiconductor',
  name: { es: 'Diodo Zener', en: 'Zener diode' },
  keywords: ['zener', 'diodo', 'diode', 'regulador', 'regulator', 'referencia', 'reference'],
  refPrefix: 'D',
  bounds: { x: -30, y: -7, width: 60, height: 14 },
  pins: [
    { id: 'anode', name: { es: 'Ánodo (+)', en: 'Anode (+)' }, x: -30, y: 0 },
    { id: 'cathode', name: { es: 'Cátodo (−)', en: 'Cathode (−)' }, x: 30, y: 0 },
  ],
  props: [
    {
      kind: 'number',
      key: 'voltage',
      label: { es: 'Voltaje Zener', en: 'Zener voltage' },
      unit: 'V',
      si: true,
      default: 5.1,
      min: 2.4,
      max: 200,
    },
  ],
  // Forward it is an ordinary diode. In reverse it conducts once the voltage
  // exceeds the Zener voltage: a junction in series with a voltage source.
  model: (ctx) => {
    const anode = ctx.pin('anode');
    const cathode = ctx.pin('cathode');
    const knee = ctx.internal('knee');
    return [
      { name: 'forward', kind: 'diode', a: anode, k: cathode, is: 1e-14, n: 1 },
      { name: 'main', kind: 'diode', a: cathode, k: knee, is: 1e-14, n: 1 },
      {
        name: 'drop',
        kind: 'vsource',
        p: knee,
        n: anode,
        volts: numberProp(ctx.props, 'voltage', 5.1) - JUNCTION_DROP,
      },
    ];
  },
  faults: (props) => [
    {
      element: 'main',
      quantity: 'current',
      max: MAX_WATTS / numberProp(props, 'voltage', 5.1),
      cause: 'overcurrent',
      action: 'burn',
      tolerance: 0.5,
    },
    { element: 'forward', quantity: 'current', max: 0.5, cause: 'overcurrent', action: 'burn' },
  ],
  footprint: () => `
    <path d="M-30 0H-13M13 0H30" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
    <rect x="-13" y="-4.5" width="26" height="9" rx="4" fill="#d9772b" stroke="#8f4a16"/>
    <rect x="6" y="-4.5" width="3.5" height="9" fill="#1b1b1b"/>`,
};

export default zener;
