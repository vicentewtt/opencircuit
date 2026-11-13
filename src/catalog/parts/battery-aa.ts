import { battery } from '../battery';

export default battery({
  type: 'battery-aa',
  name: { es: 'Pila AA 1,5 V', en: 'AA battery, 1.5 V' },
  keywords: ['aa', '1.5v'],
  volts: 1.5,
  ohms: 0.2,
  maxAmps: 2,
  shape: 'cell',
  label: 'AA',
  color: '#b8860b',
});
