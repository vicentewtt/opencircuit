import { dht } from '../dht';

/** Tenths of a degree and of a percent, as 16-bit numbers; bit 15 marks a negative temperature. */
export default dht({
  type: 'dht22',
  model: 'DHT22',
  minRequest: 0.0008,
  temperature: { min: -40, max: 80 },
  humidity: { min: 0, max: 100 },
  encode: (temperature, humidity) => {
    const wet = Math.round(humidity * 10);
    const tenths = Math.round(Math.abs(temperature) * 10) | (temperature < 0 ? 0x8000 : 0);
    return [wet >> 8, wet, tenths >> 8, tenths];
  },
  color: '#f4f5f6',
});
