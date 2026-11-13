import { stepper } from '../stepper';

const COIL_OHMS = 30;
const direction = (amps: number): number => (amps > 0.02 ? 1 : amps < -0.02 ? -1 : 0);

/** Bipolar stepper with two coils (four wires), for an H-bridge such as the L293D. */
export default stepper({
  type: 'stepper-bipolar',
  name: { es: 'Motor paso a paso bipolar', en: 'Bipolar stepper motor' },
  keywords: ['bipolar', 'nema', 'nema17', 'l293d', 'puente h'],
  pins: [
    { id: 'A+', name: { es: 'Bobina A +', en: 'Coil A +' }, x: -20, y: 40 },
    { id: 'A-', name: { es: 'Bobina A −', en: 'Coil A −' }, x: -10, y: 40 },
    { id: 'B+', name: { es: 'Bobina B +', en: 'Coil B +' }, x: 10, y: 40 },
    { id: 'B-', name: { es: 'Bobina B −', en: 'Coil B −' }, x: 20, y: 40 },
  ],
  stepsPerTurn: 200,
  coils: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('A+'), b: ctx.pin('A-'), ohms: COIL_OHMS },
    { name: 'coil:b', kind: 'resistor', a: ctx.pin('B+'), b: ctx.pin('B-'), ohms: COIL_OHMS },
  ],
  field: (io) => [direction(io.i('main')), direction(io.i('coil:b'))],
  wires: ['#d93025', '#3b82f6', '#16a34a', '#17191b'],
  label: '200 pasos',
});
