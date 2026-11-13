import { dht } from '../dht';

/** Whole degrees and whole percent only. */
export default dht({
  type: 'dht11',
  model: 'DHT11',
  minRequest: 0.01,
  temperature: { min: 0, max: 50 },
  humidity: { min: 20, max: 90 },
  encode: (temperature, humidity) => [Math.round(humidity), 0, Math.round(temperature), 0],
  color: '#4aa3e0',
});
