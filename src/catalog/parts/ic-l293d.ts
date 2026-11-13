import { dipBody, dipBounds, dipPins } from '../dip';
import type { ElementSpec } from '../model';
import { same, type PartDef } from '../types';

const PINS = [
  'EN12', 'IN1', 'OUT1', 'GND1', 'GND2', 'OUT2', 'IN2', 'VS',
  'VSS', 'IN4', 'OUT4', 'GND3', 'GND4', 'OUT3', 'IN3', 'EN34',
];
const CHANNELS = [
  { n: 1, enable: 'EN12' },
  { n: 2, enable: 'EN12' },
  { n: 3, enable: 'EN34' },
  { n: 4, enable: 'EN34' },
];
/** Each output transistor, including its saturation drop at typical currents. */
const SWITCH_OHMS = 1.5;
const LOGIC_HIGH = 2;

/** Dual H-bridge: four half-bridges fed from VS, controlled with 5 V logic. */
const l293d: PartDef = {
  type: 'ic-l293d',
  category: 'ic',
  name: { es: 'L293D · driver de motores (puente H)', en: 'L293D · motor driver (H-bridge)' },
  keywords: ['l293d', 'l293', 'puente h', 'h-bridge', 'driver', 'motor', 'ic', 'chip'],
  refPrefix: 'U',
  bounds: dipBounds(8),
  pins: dipPins(PINS.map((id, index) => ({ id, name: same(`${index + 1} · ${id}`) }))),
  props: [],
  bridges: [
    ['GND1', 'GND2'],
    ['GND2', 'GND3'],
    ['GND3', 'GND4'],
  ],
  model: (ctx) =>
    CHANNELS.flatMap(({ n }): ElementSpec[] => [
      { name: `OUT${n}:hi`, kind: 'switch', a: ctx.pin('VS'), b: ctx.pin(`OUT${n}`), ohms: SWITCH_OHMS },
      { name: `OUT${n}:lo`, kind: 'switch', a: ctx.pin(`OUT${n}`), b: ctx.pin('GND1'), ohms: SWITCH_OHMS },
    ]),
  behavior: {
    init: () => ({}),
    update: (io) => {
      const powered = io.v('VSS', 'GND1') > 3;
      for (const { n, enable } of CHANNELS) {
        const enabled = powered && io.v(enable, 'GND1') > LOGIC_HIGH;
        const high = io.v(`IN${n}`, 'GND1') > LOGIC_HIGH;
        io.setSwitch(`OUT${n}:hi`, enabled && high);
        io.setSwitch(`OUT${n}:lo`, enabled && !high);
      }
    },
  },
  footprint: () => dipBody(8, 'L293D'),
};

export default l293d;
