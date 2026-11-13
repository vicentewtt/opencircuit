import { dipBody, dipBounds, dipPins } from '../dip';
import type { ElementSpec } from '../model';
import { same, type PartDef } from '../types';

const CHANNELS = [1, 2, 3, 4, 5, 6, 7];
const PINS = [
  ...CHANNELS.map((n) => `IN${n}`),
  'GND',
  'COM',
  ...[...CHANNELS].reverse().map((n) => `OUT${n}`),
];

/** Seven Darlington switches to ground, for relays, motors and lamps. */
const uln2003: PartDef = {
  type: 'ic-uln2003',
  category: 'ic',
  name: { es: 'ULN2003 · 7 drivers Darlington', en: 'ULN2003 · 7 Darlington drivers' },
  keywords: ['uln2003', '2003', 'darlington', 'driver', 'paso a paso', 'stepper', 'rele', 'relay', 'ic', 'chip'],
  refPrefix: 'U',
  bounds: dipBounds(8),
  pins: dipPins(PINS.map((id, index) => ({ id, name: same(`${index + 1} · ${id}`) }))),
  props: [],
  model: (ctx) =>
    CHANNELS.flatMap((n): ElementSpec[] => [
      { name: `sw${n}`, kind: 'switch', a: ctx.pin(`OUT${n}`), b: ctx.pin('GND'), ohms: 3 },
      // Clamp diode to COM, which absorbs the kick of inductive loads.
      { name: `clamp${n}`, kind: 'diode', a: ctx.pin(`OUT${n}`), k: ctx.pin('COM'), is: 7e-9, n: 1.8 },
    ]),
  behavior: {
    init: () => ({}),
    update: (io) => {
      for (const n of CHANNELS) io.setSwitch(`sw${n}`, io.v(`IN${n}`, 'GND') > 2.4);
    },
  },
  footprint: () => dipBody(8, 'ULN2003'),
};

export default uln2003;
