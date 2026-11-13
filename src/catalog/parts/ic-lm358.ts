import { opampChip } from '../opamp';

/** Dual op-amp for single supplies: its output reaches the negative rail. */
export default opampChip({
  type: 'ic-lm358',
  name: { es: 'LM358 · amplificador operacional doble', en: 'LM358 · dual op-amp' },
  keywords: ['lm358', '358', 'comparador', 'comparator'],
  label: 'LM358',
  pins: ['OUT A', 'IN- A', 'IN+ A', 'V-', 'IN+ B', 'IN- B', 'OUT B', 'V+'],
  vPlus: 'V+',
  vMinus: 'V-',
  amplifiers: [
    { name: 'main', inPlus: 'IN+ A', inMinus: 'IN- A', out: 'OUT A' },
    { name: 'b', inPlus: 'IN+ B', inMinus: 'IN- B', out: 'OUT B' },
  ],
  headroomHigh: 1.5,
  headroomLow: 0.02,
});
