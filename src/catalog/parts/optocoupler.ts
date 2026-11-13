import { dipBody, dipBounds, dipPins } from '../dip';
import { saturationCurrent } from '../model';
import type { PartDef } from '../types';

/** Current transfer ratio (collector current / LED current) of 100 %. */
const CTR = 1;
const BETA = 100;

const optocoupler: PartDef = {
  type: 'optocoupler',
  category: 'semiconductor',
  name: { es: 'Optoacoplador (PC817)', en: 'Optocoupler (PC817)' },
  keywords: ['optoacoplador', 'optocoupler', 'pc817', '4n35', 'aislador', 'isolator', 'opto'],
  refPrefix: 'U',
  bounds: dipBounds(2),
  pins: dipPins([
    { id: 'anode', name: { es: '1 · Ánodo del LED', en: '1 · LED anode' } },
    { id: 'cathode', name: { es: '2 · Cátodo del LED', en: '2 · LED cathode' } },
    { id: 'emitter', name: { es: '3 · Emisor', en: '3 · Emitter' } },
    { id: 'collector', name: { es: '4 · Colector', en: '4 · Collector' } },
  ]),
  props: [],
  // The LED current is copied (scaled) into the base of the output
  // transistor; nothing else links the two sides.
  model: (ctx) => {
    const sense = ctx.internal('sense');
    const base = ctx.internal('base');
    return [
      {
        name: 'main',
        kind: 'diode',
        a: ctx.pin('anode'),
        k: sense,
        is: saturationCurrent(1.2, 0.01, 2),
        n: 2,
      },
      {
        name: 'light',
        kind: 'cccs',
        a: sense,
        b: ctx.pin('cathode'),
        c: ctx.pin('collector'),
        d: base,
        gain: CTR / BETA,
      },
      {
        name: 'q',
        kind: 'bjt',
        c: ctx.pin('collector'),
        b: base,
        e: ctx.pin('emitter'),
        polarity: 1,
        bf: BETA,
        br: 1,
        is: 1e-14,
      },
      { name: 'leak', kind: 'resistor', a: base, b: ctx.pin('emitter'), ohms: 10e6 },
    ];
  },
  faults: () => [
    { element: 'main', quantity: 'current', max: 0.06, cause: 'led-overcurrent', action: 'burn' },
  ],
  footprint: () => dipBody(2, '817'),
};

export default optocoupler;
