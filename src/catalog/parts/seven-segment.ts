import { saturationCurrent, type ElementSpec, type FaultRule } from '../model';
import { stringProp, type PartDef } from '../types';

const RATED = 0.02;
const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'] as const;

/** Segment drawings, in the order of SEGMENTS. */
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

const sevenSegment: PartDef = {
  type: 'seven-segment',
  category: 'output',
  name: { es: 'Display de 7 segmentos', en: '7-segment display' },
  keywords: ['display', '7 segmentos', 'siete', 'seven', 'segment', 'numero', 'digito', 'digit'],
  refPrefix: 'DS',
  bounds: { x: -26, y: -40, width: 52, height: 80 },
  // Standard 10-pin layout: g f COM a b on top, e d COM c dp below.
  pins: [
    { id: 'g', name: { es: 'Segmento g', en: 'Segment g' }, x: -20, y: -40 },
    { id: 'f', name: { es: 'Segmento f', en: 'Segment f' }, x: -10, y: -40 },
    { id: 'com1', name: { es: 'Común', en: 'Common' }, x: 0, y: -40 },
    { id: 'a', name: { es: 'Segmento a', en: 'Segment a' }, x: 10, y: -40 },
    { id: 'b', name: { es: 'Segmento b', en: 'Segment b' }, x: 20, y: -40 },
    { id: 'e', name: { es: 'Segmento e', en: 'Segment e' }, x: -20, y: 40 },
    { id: 'd', name: { es: 'Segmento d', en: 'Segment d' }, x: -10, y: 40 },
    { id: 'com2', name: { es: 'Común', en: 'Common' }, x: 0, y: 40 },
    { id: 'c', name: { es: 'Segmento c', en: 'Segment c' }, x: 10, y: 40 },
    { id: 'dp', name: { es: 'Punto decimal', en: 'Decimal point' }, x: 20, y: 40 },
  ],
  props: [
    {
      kind: 'select',
      key: 'common',
      label: { es: 'Pin común', en: 'Common pin' },
      default: 'cathode',
      options: [
        { value: 'cathode', label: { es: 'Cátodo común (a GND)', en: 'Common cathode (to GND)' } },
        { value: 'anode', label: { es: 'Ánodo común (a +)', en: 'Common anode (to +)' } },
      ],
    },
  ],
  bridges: [['com1', 'com2']],
  model: (ctx) => {
    const commonAnode = stringProp(ctx.props, 'common') === 'anode';
    return SEGMENTS.map(
      (segment): ElementSpec => ({
        name: `seg_${segment}`,
        kind: 'diode',
        a: ctx.pin(commonAnode ? 'com1' : segment),
        k: ctx.pin(commonAnode ? segment : 'com1'),
        is: saturationCurrent(1.9, RATED, 2),
        n: 2,
      }),
    );
  },
  probes: Object.fromEntries(SEGMENTS.map((segment) => [segment, `seg_${segment}`])),
  faults: () =>
    SEGMENTS.map(
      (segment): FaultRule => ({
        element: `seg_${segment}`,
        quantity: 'current',
        max: 0.05,
        cause: 'led-overcurrent',
        action: 'burn',
      }),
    ),
  footprint: (_props, visual) => {
    const lit = SEGMENTS.map((segment) => {
      const amps = visual?.burned ? 0 : Math.max(0, visual?.aux?.[segment] ?? 0);
      const level = Math.min(1, Math.sqrt(amps / RATED));
      return `${SHAPES[segment]} fill="${level > 0.03 ? '#ff3b30' : '#3a1512'}" fill-opacity="${level > 0.03 ? (0.45 + 0.55 * level).toFixed(2) : '1'}"/>`;
    }).join('');
    return `
      <path d="M-20 -40V-32M-10 -40V-32M0 -40V-32M10 -40V-32M20 -40V-32M-20 40V32M-10 40V32M0 40V32M10 40V32M20 40V32" stroke="#c3c8cd" stroke-width="2"/>
      <rect x="-26" y="-34" width="52" height="68" rx="3" fill="#17191b" stroke="#000000"/>
      <g transform="skewX(-6)">${lit}</g>`;
  },
};

export default sevenSegment;
