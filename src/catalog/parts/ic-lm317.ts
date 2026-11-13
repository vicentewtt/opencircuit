import { regulator } from '../regulator';

/** Keeps 1.25 V between OUT and ADJ: a resistor divider sets the output voltage. */
export default regulator({
  type: 'ic-lm317',
  name: { es: 'LM317 · regulador ajustable', en: 'LM317 · adjustable regulator' },
  keywords: ['317', 'lm317', 'ajustable', 'adjustable', 'variable'],
  label: 'LM317',
  pins: [
    { id: 'ADJ', name: { es: 'Ajuste (ADJ)', en: 'Adjust (ADJ)' }, x: -10, y: 20 },
    { id: 'OUT', name: { es: 'Salida', en: 'Output' }, x: 0, y: 20 },
    { id: 'IN', name: { es: 'Entrada', en: 'Input' }, x: 10, y: 20 },
  ],
  // The chip has no ground pin: everything is referenced to ADJ.
  ground: 'ADJ',
  quiescentTo: 'OUT',
  target: () => 1.25,
});
