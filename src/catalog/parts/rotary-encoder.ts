import type { PartDef } from '../types';

/** Time each of the four phases of a click lasts, and the pause between clicks. */
const PHASE_SECONDS = 0.002;
const REPEAT_SECONDS = 0.12;

/**
 * Rotary encoder module (KY-040). Each click of the knob makes CLK and DT
 * go low one after the other; which one goes first tells the direction.
 * Click the arrows to turn it and the center to press the button.
 */
const encoder: PartDef = {
  type: 'rotary-encoder',
  category: 'input',
  name: { es: 'Encoder rotatorio (KY-040)', en: 'Rotary encoder (KY-040)' },
  keywords: ['encoder', 'rotatorio', 'rotary', 'ky-040', 'ky040', 'perilla', 'knob', 'giro'],
  refPrefix: 'ENC',
  bounds: { x: -40, y: -28, width: 76, height: 56 },
  pins: [
    { id: 'CLK', name: { es: 'CLK (salida A)', en: 'CLK (output A)' }, x: -40, y: -20 },
    { id: 'DT', name: { es: 'DT (salida B)', en: 'DT (output B)' }, x: -40, y: -10 },
    { id: 'SW', name: { es: 'SW (botón)', en: 'SW (button)' }, x: -40, y: 0 },
    { id: 'VCC', name: { es: '+ (5 V)', en: '+ (5 V)' }, x: -40, y: 10 },
    { id: 'GND', name: { es: 'GND', en: 'GND' }, x: -40, y: 20 },
  ],
  props: [],
  model: (ctx) => [
    { name: 'pull:clk', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('CLK'), ohms: 10e3 },
    { name: 'pull:dt', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('DT'), ohms: 10e3 },
    { name: 'a', kind: 'switch', a: ctx.pin('CLK'), b: ctx.pin('GND'), ohms: 10 },
    { name: 'b', kind: 'switch', a: ctx.pin('DT'), b: ctx.pin('GND'), ohms: 10 },
    ...(ctx.input('sw') > 0
      ? [{ name: 'button', kind: 'resistor' as const, a: ctx.pin('SW'), b: ctx.pin('GND'), ohms: 1 }]
      : []),
  ],
  behavior: {
    init: () => ({ phase: 0, direction: 1, timer: 0, wait: 0, position: 0 }),
    update: (io, state) => {
      if (state.phase === 0) {
        state.wait = Math.max(0, (state.wait ?? 0) - io.dt);
        const direction = io.input('cw') > 0 ? 1 : io.input('ccw') > 0 ? -1 : 0;
        // Holding an arrow keeps the knob turning, one click after another.
        if (direction !== 0 && state.wait <= 0) {
          state.phase = 1;
          state.direction = direction;
          state.timer = 0;
        }
      } else {
        state.timer = (state.timer ?? 0) + io.dt;
        if (state.timer >= PHASE_SECONDS) {
          state.timer = 0;
          state.phase = (state.phase ?? 0) + 1;
          if (state.phase > 4) {
            state.phase = 0;
            state.position = (state.position ?? 0) + (state.direction ?? 1);
            state.wait = REPEAT_SECONDS;
          }
        }
      }
      const first = state.phase === 1 || state.phase === 2;
      const second = state.phase === 2 || state.phase === 3;
      const clockwise = (state.direction ?? 1) > 0;
      io.setSwitch('a', clockwise ? first : second);
      io.setSwitch('b', clockwise ? second : first);
      io.aux('position', state.position ?? 0);
    },
  },
  interactive: {
    kind: 'zones',
    zones: [
      { x: -12, y: -18, width: 12, height: 36, action: { kind: 'momentary', input: 'ccw' } },
      { x: 0, y: -18, width: 12, height: 36, action: { kind: 'momentary', input: 'sw' } },
      { x: 12, y: -18, width: 12, height: 36, action: { kind: 'momentary', input: 'cw' } },
    ],
  },
  footprint: (_props, visual) => {
    const position = visual?.aux?.position ?? 0;
    return `
      <path d="M-40 -20H-32M-40 -10H-32M-40 0H-32M-40 10H-32M-40 20H-32" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="-34" y="-28" width="70" height="56" rx="3" fill="#17191b" stroke="#000000"/>
      <circle cx="6" cy="0" r="18" fill="#c3c8cd" stroke="#70777e"/>
      <g transform="rotate(${position * 18} 6 0)">
        <circle cx="6" cy="0" r="12" fill="#30353a" stroke="#0f1113"/>
        <path d="M6 -4V-11" stroke="#f4f5f6" stroke-width="2" stroke-linecap="round"/>
      </g>
      <path d="M-9 -3l-3 3 3 3M21 -3l3 3-3 3" fill="none" stroke="#17191b" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="6" y="26" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#c9cdd2">${position}</text>`;
  },
};

export default encoder;
