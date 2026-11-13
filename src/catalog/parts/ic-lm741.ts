import { opampChip } from '../opamp';

/** Classic single op-amp for split supplies. The offset-null pins are not connected. */
export default opampChip({
  type: 'ic-lm741',
  name: { es: 'LM741 · amplificador operacional', en: 'LM741 · op-amp' },
  keywords: ['lm741', '741', 'ua741'],
  label: 'LM741',
  pins: ['NULL1', 'IN-', 'IN+', 'V-', 'NULL2', 'OUT', 'V+', 'NC'],
  vPlus: 'V+',
  vMinus: 'V-',
  amplifiers: [{ name: 'main', inPlus: 'IN+', inMinus: 'IN-', out: 'OUT' }],
  headroomHigh: 1.5,
  headroomLow: 1.5,
});
