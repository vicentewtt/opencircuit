import type { PartDef } from '../types';

/**
 * 4-leg tactile switch. Legs 1a-1b are joined internally, as are 2a-2b;
 * pressing the button connects side 1 with side 2.
 */
const pushbutton: PartDef = {
  type: 'pushbutton',
  category: 'input',
  name: { es: 'Pulsador', en: 'Pushbutton' },
  keywords: ['pulsador', 'boton', 'button', 'pushbutton', 'tactil', 'tactile', 'switch'],
  refPrefix: 'S',
  bounds: { x: -20, y: -15, width: 40, height: 30 },
  pins: [
    { id: '1a', name: { es: 'Terminal 1a', en: 'Terminal 1a' }, x: -20, y: -10 },
    { id: '1b', name: { es: 'Terminal 1b', en: 'Terminal 1b' }, x: 20, y: -10 },
    { id: '2a', name: { es: 'Terminal 2a', en: 'Terminal 2a' }, x: -20, y: 10 },
    { id: '2b', name: { es: 'Terminal 2b', en: 'Terminal 2b' }, x: 20, y: 10 },
  ],
  props: [],
  bridges: [
    ['1a', '1b'],
    ['2a', '2b'],
  ],
  model: (ctx) =>
    ctx.input('pressed') > 0
      ? [{ name: 'main', kind: 'resistor', a: ctx.pin('1a'), b: ctx.pin('2a'), ohms: 0.01 }]
      : [],
  interactive: { kind: 'momentary', input: 'pressed' },
  footprint: (_props, visual) => `
    <path d="M-20 -10H-13M13 -10H20M-20 10H-13M13 10H20" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
    <rect x="-14" y="-14" width="28" height="28" rx="3" fill="#2b2f33" stroke="#111315"/>
    <rect x="-11" y="-11" width="22" height="22" rx="2" fill="#c3c8cd"/>
    <circle cx="0" cy="0" r="${visual?.pressed ? 6 : 7}" fill="${visual?.pressed ? '#15181b' : '#30353a'}" stroke="#111315"/>`,
};

export default pushbutton;
