import { TO92_BOUNDS, analogSensor, to92 } from '../analog-sensor';
import { numberProp } from '../types';

/** 10 mV per degree Celsius: 250 mV at 25 °C. */
export default analogSensor({
  type: 'lm35',
  name: { es: 'Sensor de temperatura LM35', en: 'Temperature sensor LM35' },
  keywords: ['lm35', 'temperatura', 'temperature', 'sensor', 'termometro', 'thermometer', 'analogico'],
  bounds: TO92_BOUNDS,
  pins: [
    { id: 'VCC', name: { es: '+Vs (alimentación)', en: '+Vs (supply)' }, x: -10, y: 20 },
    { id: 'OUT', name: { es: 'Vout (salida)', en: 'Vout (output)' }, x: 0, y: 20 },
    { id: 'GND', name: { es: 'GND', en: 'GND' }, x: 10, y: 20 },
  ],
  props: [
    {
      kind: 'number',
      key: 'temperature',
      label: { es: 'Temperatura', en: 'Temperature' },
      unit: '°C',
      si: false,
      default: 25,
      min: 2,
      max: 150,
      slider: true,
    },
  ],
  outputs: [{ pin: 'OUT', volts: (props) => 0.01 * numberProp(props, 'temperature', 25) }],
  minSupply: 4,
  supplyOhms: 50e3,
  footprint: (props) => to92('LM35', `${numberProp(props, 'temperature', 25).toFixed(0)}°C`),
});
