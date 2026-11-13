import { logicChip } from '../logic';

export default logicChip({
  type: 'ic-74hc04',
  name: { es: '74HC04 · 6 inversores (NOT)', en: '74HC04 · hex inverter (NOT)' },
  keywords: ['74hc04', '7404', 'inversor', 'inverter', 'not', 'compuerta', 'gate', 'logica', 'logic'],
  label: '74HC04',
  pins: ['1A', '1Y', '2A', '2Y', '3A', '3Y', 'GND', '4Y', '4A', '5Y', '5A', '6Y', '6A', 'VCC'],
  vcc: 'VCC',
  gnd: 'GND',
  outputs: ['1Y', '2Y', '3Y', '4Y', '5Y', '6Y'],
  logic: (input) =>
    Object.fromEntries([1, 2, 3, 4, 5, 6].map((n) => [`${n}Y`, !input(`${n}A`)])),
});
