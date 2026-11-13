import { battery } from '../battery';

export default battery({
  type: 'battery-coin',
  name: { es: 'Pila de botón CR2032 (3 V)', en: 'CR2032 coin cell (3 V)' },
  keywords: ['boton', 'coin', 'cr2032', '3v'],
  volts: 3,
  ohms: 15,
  maxAmps: 0.05,
  shape: 'coin',
  label: 'CR2032',
  color: '#c3c8cd',
});
