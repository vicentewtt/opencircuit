import { saturationCurrent, type ElementSpec, type FaultRule } from '../model';
import { stringProp, type PartDef } from '../types';

const RATED = 0.02;
const CHANNELS = [
  { key: 'r', pin: 'red', vf: 2.0, n: 2 },
  { key: 'g', pin: 'green', vf: 3.0, n: 3 },
  { key: 'b', pin: 'blue', vf: 3.0, n: 3 },
] as const;

const level = (amps: number | undefined): number =>
  Math.min(1, Math.sqrt(Math.max(0, amps ?? 0) / RATED));

const ledRgb: PartDef = {
  type: 'led-rgb',
  category: 'semiconductor',
  name: { es: 'LED RGB', en: 'RGB LED' },
  keywords: ['led', 'rgb', 'color', 'tricolor', 'multicolor'],
  refPrefix: 'D',
  bounds: { x: -14, y: -20, width: 38, height: 40 },
  pins: [
    { id: 'red', name: { es: 'Rojo', en: 'Red' }, x: -10, y: 20 },
    { id: 'common', name: { es: 'Común', en: 'Common' }, x: 0, y: 20 },
    { id: 'green', name: { es: 'Verde', en: 'Green' }, x: 10, y: 20 },
    { id: 'blue', name: { es: 'Azul', en: 'Blue' }, x: 20, y: 20 },
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
  model: (ctx) => {
    const commonAnode = stringProp(ctx.props, 'common') === 'anode';
    return CHANNELS.map(
      (channel): ElementSpec => ({
        name: channel.key,
        kind: 'diode',
        a: ctx.pin(commonAnode ? 'common' : channel.pin),
        k: ctx.pin(commonAnode ? channel.pin : 'common'),
        is: saturationCurrent(channel.vf, RATED, channel.n),
        n: channel.n,
      }),
    );
  },
  probes: { r: 'r', g: 'g', b: 'b' },
  faults: () =>
    CHANNELS.map(
      (channel): FaultRule => ({
        element: channel.key,
        quantity: 'current',
        max: 0.05,
        cause: 'led-overcurrent',
        action: 'burn',
      }),
    ),
  footprint: (_props, visual) => {
    const r = visual?.burned ? 0 : level(visual?.aux?.r);
    const g = visual?.burned ? 0 : level(visual?.aux?.g);
    const b = visual?.burned ? 0 : level(visual?.aux?.b);
    const brightest = Math.max(r, g, b);
    const color = `rgb(${Math.round(255 * r)},${Math.round(255 * g)},${Math.round(255 * b)})`;
    const glow =
      brightest > 0.02
        ? `<circle cx="5" cy="-6" r="${(14 + 12 * brightest).toFixed(1)}" fill="${color}" fill-opacity="${(0.4 * brightest).toFixed(2)}"/>
           <path d="M-7 5V-8a12 12 0 0 1 24 0V5z" fill="${color}" fill-opacity="${(0.9 * brightest).toFixed(2)}"/>`
        : '';
    return `
      <path d="M-10 20V6M0 20V6M10 20V6M20 20V6" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
      <path d="M-7 5V-8a12 12 0 0 1 24 0V5z" fill="#eef1f2" fill-opacity="0.85" stroke="#9aa0a6"/>
      ${glow}
      <rect x="-9" y="3" width="28" height="4" rx="1" fill="#9aa0a6"/>`;
  },
};

export default ledRgb;
