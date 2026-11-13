import type { PartDef } from '../types';

/** A tone ends when no pulse arrives for this long. */
const SILENCE_SECONDS = 0.08;

/**
 * Passive piezo speaker: it sounds at the frequency of the signal it
 * receives, which is what tone() produces. With steady voltage it is silent.
 */
const piezo: PartDef = {
  type: 'piezo',
  category: 'output',
  name: { es: 'Piezo (zumbador pasivo)', en: 'Piezo (passive buzzer)' },
  keywords: ['piezo', 'zumbador', 'buzzer', 'pasivo', 'passive', 'parlante', 'speaker', 'tone', 'sonido', 'sound', 'melodia'],
  refPrefix: 'BZ',
  bounds: { x: -17, y: -21, width: 34, height: 41 },
  pins: [
    { id: 'positive', name: { es: 'Positivo (+)', en: 'Positive (+)' }, x: -10, y: 20 },
    { id: 'negative', name: { es: 'Negativo (−)', en: 'Negative (−)' }, x: 10, y: 20 },
  ],
  props: [],
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('positive'), b: ctx.pin('negative'), ohms: 1000 },
  ],
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 25, cause: 'overvoltage', action: 'burn' },
  ],
  digital: {
    watch: ['positive'],
    create: (io) => {
      let lastRise = -1;
      let hertz = 0;
      let wasHigh = false;
      const rise = (now: number): void => {
        const period = now - lastRise;
        if (lastRise >= 0 && period > 40e-6 && period < 0.05) hertz = 1 / period;
        lastRise = now;
      };
      return {
        edge: (_pin, drive) => {
          if (drive === 'high') rise(io.now());
        },
        tick: () => {
          const now = io.now();
          if (!io.linked('positive')) {
            // Driven by something other than a board: watch the solved voltage.
            const high = io.v('positive', 'negative') > 1.5;
            if (high && !wasHigh) rise(now);
            wasHigh = high;
          }
          if (now - lastRise > SILENCE_SECONDS) hertz = 0;
          io.aux('hertz', Math.round(hertz));
        },
      };
    },
  },
  beep: (_props, state) => state.aux?.hertz ?? 0,
  footprint: (_props, visual) => {
    const hertz = visual?.burned ? 0 : (visual?.aux?.hertz ?? 0);
    return `
      <path d="M-10 20V10M10 20V10" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
      <circle cx="0" cy="-4" r="17" fill="#1b1d1f" stroke="#000000"/>
      <circle cx="0" cy="-4" r="11" fill="#c9a227" stroke="#8a6d14"/>
      <circle cx="0" cy="-4" r="4" fill="#e6e9ec"/>
      ${
        hertz > 0
          ? `<path d="M-23 -12a12 12 0 0 0 0 16M23 -12a12 12 0 0 1 0 16" fill="none" stroke="#e2b340" stroke-width="1.5" stroke-linecap="round"/>
             <text x="0" y="-24" font-size="6" font-family="monospace" text-anchor="middle" fill="#b3541e">${hertz} Hz</text>`
          : ''
      }`;
  },
};

export default piezo;
