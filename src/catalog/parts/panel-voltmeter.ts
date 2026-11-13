import { panelMeter } from '../meters';

/** Goes in parallel with what is being measured. */
export default panelMeter({
  type: 'panel-voltmeter',
  name: { es: 'Voltímetro (en paralelo)', en: 'Voltmeter (in parallel)' },
  keywords: ['voltimetro', 'voltmeter', 'voltaje', 'tension', 'voltage', 'volts'],
  unit: 'V',
  ohms: 10e6,
  quantity: 'voltage',
  letter: 'V',
});
