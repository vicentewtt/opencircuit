import { panelMeter } from '../meters';

/** Goes in series with the load, like a clamp meter around the wire. */
export default panelMeter({
  type: 'panel-ammeter',
  name: { es: 'Amperímetro (en serie)', en: 'Ammeter (in series)' },
  keywords: ['amperimetro', 'ammeter', 'corriente', 'current', 'pinza', 'clamp', 'amperes'],
  unit: 'A',
  ohms: 0.001,
  quantity: 'current',
  letter: 'A',
});
