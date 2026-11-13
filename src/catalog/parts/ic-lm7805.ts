import { regulator } from '../regulator';

export default regulator({
  type: 'ic-lm7805',
  name: { es: 'LM7805 · regulador de 5 V', en: 'LM7805 · 5 V regulator' },
  keywords: ['7805', 'lm7805', '5v'],
  label: '7805',
  pins: [
    { id: 'IN', name: { es: 'Entrada', en: 'Input' }, x: -10, y: 20 },
    { id: 'GND', name: { es: 'Tierra (GND)', en: 'Ground (GND)' }, x: 0, y: 20 },
    { id: 'OUT', name: { es: 'Salida 5 V', en: '5 V output' }, x: 10, y: 20 },
  ],
  ground: 'GND',
  quiescentTo: 'GND',
  target: () => 5,
});
