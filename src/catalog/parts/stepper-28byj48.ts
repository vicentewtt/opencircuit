import { stepper } from '../stepper';

const COILS = ['blue', 'pink', 'yellow', 'orange'];
const COIL_OHMS = 50;

/**
 * 28BYJ-48: unipolar, five wires. The four coils share the red wire (5 V)
 * and a driver such as the ULN2003 connects each one to ground in turn.
 */
export default stepper({
  type: 'stepper-28byj48',
  name: { es: 'Motor paso a paso 28BYJ-48', en: 'Stepper motor 28BYJ-48' },
  keywords: ['28byj-48', '28byj48', 'unipolar', 'uln2003'],
  pins: [
    { id: 'blue', name: { es: 'Bobina 1 (azul)', en: 'Coil 1 (blue)' }, x: -20, y: 40 },
    { id: 'pink', name: { es: 'Bobina 2 (rosado)', en: 'Coil 2 (pink)' }, x: -10, y: 40 },
    { id: 'yellow', name: { es: 'Bobina 3 (amarillo)', en: 'Coil 3 (yellow)' }, x: 0, y: 40 },
    { id: 'orange', name: { es: 'Bobina 4 (naranjo)', en: 'Coil 4 (orange)' }, x: 10, y: 40 },
    { id: 'red', name: { es: 'Común, 5 V (rojo)', en: 'Common, 5 V (red)' }, x: 20, y: 40 },
  ],
  stepsPerTurn: 2048,
  coils: (ctx) =>
    COILS.map((coil) => ({
      name: `coil:${coil}`,
      kind: 'resistor',
      a: ctx.pin('red'),
      b: ctx.pin(coil),
      ohms: COIL_OHMS,
    })),
  field: (io) => {
    const [a, b, c, d] = COILS.map((coil) => (io.i(`coil:${coil}`) > 0.02 ? 1 : 0));
    return [(a ?? 0) - (c ?? 0), (b ?? 0) - (d ?? 0)];
  },
  wires: ['#3b82f6', '#f472b6', '#facc15', '#f29900', '#d93025'],
  label: '28BYJ-48',
});
