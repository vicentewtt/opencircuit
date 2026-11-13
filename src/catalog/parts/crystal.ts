import type { PartDef } from '../types';

/**
 * Quartz crystal. The Arduino boards already include theirs, so this part is
 * only its small capacitance: it lets circuits be drawn completely.
 */
const crystal: PartDef = {
  type: 'crystal',
  category: 'passive',
  name: { es: 'Cristal de cuarzo 16 MHz', en: 'Quartz crystal, 16 MHz' },
  keywords: ['cristal', 'crystal', 'cuarzo', 'quartz', 'oscilador', 'oscillator', '16mhz', 'xtal'],
  refPrefix: 'Y',
  bounds: { x: -15, y: -14, width: 30, height: 34 },
  pins: [
    { id: '1', name: { es: 'Terminal 1', en: 'Terminal 1' }, x: -10, y: 20 },
    { id: '2', name: { es: 'Terminal 2', en: 'Terminal 2' }, x: 10, y: 20 },
  ],
  props: [],
  model: (ctx) => [
    { name: 'main', kind: 'capacitor', a: ctx.pin('1'), b: ctx.pin('2'), farads: 18e-12 },
  ],
  footprint: () => `
    <path d="M-10 20V6M10 20V6" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
    <rect x="-15" y="-14" width="30" height="21" rx="9" fill="#c3c8cd" stroke="#70777e"/>
    <text x="0" y="-1" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#30353a">16.000</text>`,
};

export default crystal;
