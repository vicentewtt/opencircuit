import { battery } from '../battery';

export default battery({
  type: 'battery-aa-x2',
  name: { es: 'Portapilas 2×AA (3 V)', en: '2×AA holder (3 V)' },
  keywords: ['aa', 'portapilas', 'holder', '3v'],
  volts: 3,
  ohms: 0.4,
  maxAmps: 2,
  shape: 'holder',
  label: '2×AA',
  color: '#b8860b',
});
