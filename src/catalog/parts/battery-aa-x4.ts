import { battery } from '../battery';

export default battery({
  type: 'battery-aa-x4',
  name: { es: 'Portapilas 4×AA (6 V)', en: '4×AA holder (6 V)' },
  keywords: ['aa', 'portapilas', 'holder', '6v'],
  volts: 6,
  ohms: 0.8,
  maxAmps: 2,
  shape: 'holder',
  label: '4×AA',
  color: '#b8860b',
});
