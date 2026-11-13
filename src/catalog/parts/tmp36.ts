import { TO92_BOUNDS, analogSensor, to92 } from '../analog-sensor';
import { numberProp } from '../types';

/** 10 mV per degree with a 0.5 V offset, so it also reads below zero: 750 mV at 25 °C. */
export default analogSensor({
  type: 'tmp36',
  name: { es: 'Sensor de temperatura TMP36', en: 'Temperature sensor TMP36' },
  keywords: ['tmp36', 'temperatura', 'temperature', 'sensor', 'termometro', 'thermometer', 'analogico'],
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
      min: -40,
      max: 125,
      slider: true,
    },
  ],
  outputs: [{ pin: 'OUT', volts: (props) => 0.5 + 0.01 * numberProp(props, 'temperature', 25) }],
  minSupply: 2.7,
  supplyOhms: 50e3,
  footprint: (props) => to92('TMP36', `${numberProp(props, 'temperature', 25).toFixed(0)}°C`),
});
