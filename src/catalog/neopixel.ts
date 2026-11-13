import type { PartDef, PinDef } from './types';

/**
 * Addressable RGB LEDs (WS2812B). Colors arrive on one wire as pulses about
 * a microsecond long: a short pulse is a 0, a long one a 1, 24 bits per LED
 * in green-red-blue order.
 */

/** Pulses longer than this are ones (0.35 µs for a zero, 0.8 µs for a one). */
const ONE_SECONDS = 0.56e-6;
/** A pause this long restarts the chain at the first LED. */
const RESET_SECONDS = 50e-6;

export interface NeopixelLayout {
  type: string;
  name: { es: string; en: string };
  keywords: string[];
  bounds: PartDef['bounds'];
  pins: PinDef[];
  /** Center of each LED, in chain order. */
  leds: { x: number; y: number }[];
  /** Board drawn under the LEDs. */
  board: string;
}

const shade = (value: number): number => Math.round(255 * Math.sqrt(value / 255));

export function neopixel(layout: NeopixelLayout): PartDef {
  const count = layout.leds.length;
  return {
    type: layout.type,
    category: 'output',
    name: layout.name,
    keywords: ['neopixel', 'ws2812', 'ws2812b', 'rgb', 'led', 'direccionable', 'addressable', ...layout.keywords],
    refPrefix: 'LED',
    bounds: layout.bounds,
    pins: layout.pins,
    props: [],
    model: (ctx) => [
      { name: 'main', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('GND'), ohms: 5000 },
    ],
    faults: () => [
      { element: 'main', quantity: 'voltage', max: 7, cause: 'overvoltage', action: 'burn' },
    ],
    digital: {
      watch: ['DIN'],
      create: (io) => {
        const colors = new Uint8Array(count * 3);
        const powered = (): boolean => io.v('VCC', 'GND') > 3.5;
        let high = false;
        let rose = 0;
        let fell = -1;
        let index = 0;
        let bits = 0;
        let byte = 0;
        let dirty = true;
        let wasPowered = false;
        return {
          edge: (_pin, drive) => {
            const now = io.now();
            if (drive === 'high') {
              if (now - fell > RESET_SECONDS) index = bits = byte = 0;
              rose = now;
              high = true;
            } else if (high) {
              high = false;
              fell = now;
              byte = (byte << 1) | (now - rose > ONE_SECONDS ? 1 : 0);
              bits += 1;
              if (bits < 8) return;
              if (index < colors.length && powered()) {
                colors[index] = byte;
                dirty = true;
              }
              index += 1;
              bits = byte = 0;
            }
          },
          tick: () => {
            const on = powered();
            if (!on && wasPowered) colors.fill(0);
            if (!dirty && on === wasPowered) return;
            dirty = false;
            wasPowered = on;
            for (let led = 0; led < count; led++) {
              const green = colors[led * 3] ?? 0;
              const red = colors[led * 3 + 1] ?? 0;
              const blue = colors[led * 3 + 2] ?? 0;
              io.aux(`p${led}`, (red << 16) | (green << 8) | blue);
            }
          },
        };
      },
    },
    footprint: (_props, visual) => {
      const aux = visual?.burned ? undefined : visual?.aux;
      const leds = layout.leds
        .map(({ x, y }, led) => {
          const color = aux?.[`p${led}`] ?? 0;
          const lit = color > 0;
          const fill = lit
            ? `rgb(${shade((color >> 16) & 255)},${shade((color >> 8) & 255)},${shade(color & 255)})`
            : '#cfd3d6';
          return `<rect x="${x - 4}" y="${y - 4}" width="8" height="8" rx="1" fill="#f4f5f6" stroke="#9aa0a6" stroke-width="0.6"/>
            ${lit ? `<circle cx="${x}" cy="${y}" r="6.5" fill="${fill}" fill-opacity="0.35"/>` : ''}
            <circle cx="${x}" cy="${y}" r="3" fill="${fill}"/>`;
        })
        .join('');
      return `${layout.board}${leds}`;
    },
  };
}

const PIN_NAMES = {
  GND: { es: 'GND', en: 'GND' },
  VCC: { es: '5 V', en: '5 V' },
  DIN: { es: 'DIN (datos)', en: 'DIN (data)' },
};

/** Straight strip of `count` LEDs with the connector on the left. */
export function neopixelStrip(count: number): PartDef {
  const half = (count * 10) / 2;
  const left = -half - 10;
  return neopixel({
    type: `neopixel-strip-${count}`,
    name: { es: `Tira NeoPixel de ${count} LED`, en: `NeoPixel strip, ${count} LEDs` },
    keywords: ['tira', 'strip', 'stick'],
    bounds: { x: left, y: -12, width: count * 10 + 14, height: 24 },
    pins: [
      { id: 'GND', name: PIN_NAMES.GND, x: left, y: -10 },
      { id: 'VCC', name: PIN_NAMES.VCC, x: left, y: 0 },
      { id: 'DIN', name: PIN_NAMES.DIN, x: left, y: 10 },
    ],
    leds: Array.from({ length: count }, (_, led) => ({ x: -half + 5 + led * 10, y: 0 })),
    board: `
      <path d="M${left} -10h8M${left} 0h8M${left} 10h8" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="${left + 6}" y="-12" width="${count * 10 + 8}" height="24" rx="2" fill="#17191b" stroke="#000000"/>`,
  });
}

/** Ring of `count` LEDs with the connector at the bottom. */
export function neopixelRing(count: number): PartDef {
  const radius = count <= 12 ? 30 : 40;
  const bottom = radius + 20;
  return neopixel({
    type: `neopixel-ring-${count}`,
    name: { es: `Anillo NeoPixel de ${count} LED`, en: `NeoPixel ring, ${count} LEDs` },
    keywords: ['anillo', 'ring', 'aro'],
    bounds: { x: -radius - 8, y: -radius - 8, width: radius * 2 + 16, height: radius + 8 + bottom },
    pins: [
      { id: 'GND', name: PIN_NAMES.GND, x: -10, y: bottom },
      { id: 'VCC', name: PIN_NAMES.VCC, x: 0, y: bottom },
      { id: 'DIN', name: PIN_NAMES.DIN, x: 10, y: bottom },
    ],
    leds: Array.from({ length: count }, (_, led) => {
      const angle = (led / count) * 2 * Math.PI - Math.PI / 2;
      return { x: Math.round(radius * Math.cos(angle)), y: Math.round(radius * Math.sin(angle)) };
    }),
    board: `
      <path d="M-10 ${bottom}V${radius}M0 ${bottom}V${radius}M10 ${bottom}V${radius}" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
      <circle cx="0" cy="0" r="${radius}" fill="none" stroke="#17191b" stroke-width="16"/>`,
  });
}
