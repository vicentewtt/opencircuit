import { battery } from '../battery';

export default battery({
  type: 'battery-liion',
  name: { es: 'Batería Li-ion 3,7 V', en: 'Li-ion battery, 3.7 V' },
  keywords: ['litio', 'lithium', 'li-ion', '18650', '3.7v'],
  volts: 3.7,
  ohms: 0.05,
  maxAmps: 5,
  shape: 'cell',
  label: '18650',
  color: '#2f6fbf',
});
