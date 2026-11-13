import type { PartDef } from '../types';

/** Voltage above which the internal oscillator runs. */
const START_VOLTS = 2.5;

const buzzer: PartDef = {
  type: 'buzzer',
  category: 'output',
  name: { es: 'Zumbador activo', en: 'Active buzzer' },
  keywords: ['zumbador', 'buzzer', 'piezo', 'sonido', 'sound', 'alarma', 'alarm', 'beep'],
  refPrefix: 'BZ',
  bounds: { x: -15, y: -19, width: 30, height: 39 },
  pins: [
    { id: 'positive', name: { es: 'Positivo (+)', en: 'Positive (+)' }, x: -10, y: 20 },
    { id: 'negative', name: { es: 'Negativo (−)', en: 'Negative (−)' }, x: 10, y: 20 },
  ],
  props: [],
  // Draws about 30 mA at 5 V.
  model: (ctx) => [
    {
      name: 'main',
      kind: 'resistor',
      a: ctx.pin('positive'),
      b: ctx.pin('negative'),
      ohms: 160,
    },
  ],
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 15, cause: 'overvoltage', action: 'burn' },
  ],
  beep: (_props, state) => state.v > START_VOLTS,
  footprint: (_props, visual) => {
    const sounding = !visual?.burned && (visual?.v ?? 0) > START_VOLTS;
    return `
      <path d="M-10 20V10M10 20V10" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="0" cy="-4" r="15" fill="#1b1d1f" stroke="#000000"/>
      <circle cx="0" cy="-4" r="3" fill="#4a4f55"/>
      <path d="M-11 -12h4M-9 -14v4" stroke="#c9cdd2" stroke-width="1.2"/>
      ${
        sounding
          ? '<path d="M-21 -12a12 12 0 0 0 0 16M21 -12a12 12 0 0 1 0 16M-26 -16a18 18 0 0 0 0 24M26 -16a18 18 0 0 1 0 24" fill="none" stroke="#e2b340" stroke-width="1.5" stroke-linecap="round"/>'
          : ''
      }`;
  },
};

export default buzzer;
