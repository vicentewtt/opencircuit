import { saturationCurrent, type ElementSpec, type FaultRule } from '../model';
import { same, stringProp, type PartDef, type PinDef } from '../types';

const RATED = 0.02;
const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'] as const;
const DIGITS = [1, 2, 3, 4];

const SHAPES: Record<(typeof SEGMENTS)[number], string> = {
  a: '<rect x="-10" y="-27" width="18" height="5" rx="1.5"',
  b: '<rect x="8" y="-23" width="5" height="20" rx="1.5"',
  c: '<rect x="8" y="3" width="5" height="20" rx="1.5"',
  d: '<rect x="-10" y="22" width="18" height="5" rx="1.5"',
  e: '<rect x="-15" y="3" width="5" height="20" rx="1.5"',
  f: '<rect x="-15" y="-23" width="5" height="20" rx="1.5"',
  g: '<rect x="-10" y="-2.5" width="18" height="5" rx="1.5"',
  dp: '<circle cx="19" cy="24" r="3"',
};

/** Usual 12-pin layout: D1 a f D2 D3 b on top, e d dp c g D4 below. */
const TOP = ['D1', 'a', 'f', 'D2', 'D3', 'b'];
const BOTTOM = ['e', 'd', 'dp', 'c', 'g', 'D4'];
const label = (id: string): string =>
  id.startsWith('D') ? `Dígito ${id.slice(1)} · Digit ${id.slice(1)}` : `Segmento ${id} · Segment ${id}`;
const PINS: PinDef[] = [
  ...TOP.map((id, index) => ({ id, name: same(label(id)), x: -30 + index * 10, y: -40 })),
  ...BOTTOM.map((id, index) => ({ id, name: same(label(id)), x: -30 + index * 10, y: 40 })),
];

const element = (digit: number, segment: string): string => `seg_${segment}${digit}`;

/**
 * Four 7-segment digits that share their segment pins. Only one digit can
 * show a number at a time, so programs light them in turns, very fast.
 */
const display: PartDef = {
  type: 'seven-segment-4',
  category: 'output',
  name: { es: 'Display de 7 segmentos, 4 dígitos', en: '7-segment display, 4 digits' },
  keywords: ['display', '7 segmentos', 'siete', 'seven', 'segment', '4 digitos', 'digits', 'multiplexado', 'reloj'],
  refPrefix: 'DS',
  bounds: { x: -54, y: -40, width: 108, height: 80 },
  pins: PINS,
  props: [
    {
      kind: 'select',
      key: 'common',
      label: { es: 'Pin común de cada dígito', en: 'Common pin of each digit' },
      default: 'cathode',
      options: [
        { value: 'cathode', label: { es: 'Cátodo común (a GND)', en: 'Common cathode (to GND)' } },
        { value: 'anode', label: { es: 'Ánodo común (a +)', en: 'Common anode (to +)' } },
      ],
    },
  ],
  model: (ctx) => {
    const commonAnode = stringProp(ctx.props, 'common') === 'anode';
    return DIGITS.flatMap((digit) =>
      SEGMENTS.map(
        (segment): ElementSpec => ({
          name: element(digit, segment),
          kind: 'diode',
          a: ctx.pin(commonAnode ? `D${digit}` : segment),
          k: ctx.pin(commonAnode ? segment : `D${digit}`),
          is: saturationCurrent(1.9, RATED, 2),
          n: 2,
        }),
      ),
    );
  },
  probes: Object.fromEntries(
    DIGITS.flatMap((digit) => SEGMENTS.map((segment) => [`${segment}${digit}`, element(digit, segment)])),
  ),
  faults: () =>
    DIGITS.flatMap((digit) =>
      SEGMENTS.map(
        (segment): FaultRule => ({
          element: element(digit, segment),
          quantity: 'current',
          max: 0.06,
          cause: 'led-overcurrent',
          action: 'burn',
        }),
      ),
    ),
  footprint: (_props, visual) => {
    const digits = DIGITS.map((digit) => {
      const lit = SEGMENTS.map((segment) => {
        const amps = visual?.burned ? 0 : Math.max(0, visual?.aux?.[`${segment}${digit}`] ?? 0);
        // Each digit is on a quarter of the time: the eye averages it.
        const level = Math.min(1, Math.sqrt((amps * 4) / RATED));
        return `${SHAPES[segment]} fill="${level > 0.05 ? '#ff3b30' : '#3a1512'}" fill-opacity="${level > 0.05 ? (0.45 + 0.55 * level).toFixed(2) : '1'}"/>`;
      }).join('');
      return `<g transform="translate(${-63 + digit * 25} 0) scale(0.62 0.95) skewX(-6)">${lit}</g>`;
    }).join('');
    return `
      <path d="${PINS.map((pin) => `M${pin.x} ${pin.y}V${pin.y < 0 ? -32 : 32}`).join('')}" stroke="#c3c8cd" stroke-width="2"/>
      <rect x="-54" y="-34" width="108" height="68" rx="3" fill="#17191b" stroke="#000000"/>
      ${digits}`;
  },
};

export default display;
