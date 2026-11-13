import { SQRT2, dinBody, heat, rms, terminal } from './industrial';
import { stringProp, type PartDef, type PartProps } from './types';

/**
 * Miniature circuit breakers (curve C). Two ways of tripping: at once on a
 * short circuit (magnetic), and after a while on an overload (thermal).
 * Click the lever to switch; after a trip, switch off and on again.
 */

const RATINGS = ['2', '6', '10', '16', '20', '25', '32'];
/** Curve C trips magnetically between 5 and 10 times the rated current. */
const MAGNETIC = 7;
const TAU = 6;
const TRIP_HEAT = 1.69;

const ratingOf = (props: PartProps): number => Number(stringProp(props, 'rating')) || 10;

export function breaker(poles: 1 | 3): PartDef {
  const xs = poles === 1 ? [0] : [-20, 0, 20];
  const pins = [
    ...xs.map((x, index) => terminal(String(index * 2 + 1), x, -40)),
    ...xs.map((x, index) => terminal(String(index * 2 + 2), x, 40)),
  ];
  const bounds = { x: poles === 1 ? -12 : -32, y: -40, width: poles === 1 ? 24 : 64, height: 80 };
  const names = xs.map((_, index) => (index === 0 ? 'main' : `pole${index + 1}`));
  return {
    type: `mcb-${poles}p`,
    category: 'industrial',
    name:
      poles === 1
        ? { es: 'Interruptor termomagnético 1P', en: 'Circuit breaker 1P' }
        : { es: 'Interruptor termomagnético 3P', en: 'Circuit breaker 3P' },
    keywords: ['termomagnetico', 'automatico', 'breaker', 'mcb', 'disyuntor', 'proteccion', 'cortocircuito', 'industrial', `${poles}p`],
    refPrefix: 'Q',
    bounds,
    pins,
    props: [
      {
        kind: 'select',
        key: 'rating',
        label: { es: 'Corriente nominal (curva C)', en: 'Rated current (curve C)' },
        default: '10',
        options: RATINGS.map((value) => ({ value, label: { es: `${value} A`, en: `${value} A` } })),
      },
      {
        kind: 'select',
        key: 'state',
        label: { es: 'Palanca', en: 'Lever' },
        default: 'on',
        options: [
          { value: 'on', label: { es: 'Conectado (ON)', en: 'On' } },
          { value: 'off', label: { es: 'Desconectado (OFF)', en: 'Off' } },
        ],
      },
    ],
    model: (ctx) =>
      names.map((name, index) => ({
        name,
        kind: 'switch' as const,
        a: ctx.pin(String(index * 2 + 1)),
        b: ctx.pin(String(index * 2 + 2)),
        ohms: 0.01,
      })),
    behavior: {
      init: () => ({ tripped: 0, heat: 0 }),
      update: (io, state) => {
        const rated = ratingOf(io.props);
        if (stringProp(io.props, 'state') !== 'on') state.tripped = 0;
        const peak = Math.max(...names.map((name) => Math.abs(io.i(name))));
        const amps = Math.max(...names.map((name) => rms(state, `i:${name}`, io.i(name), io.dt)));
        const level = heat(state, amps, rated, io.dt, TAU);
        if (peak > MAGNETIC * rated * SQRT2 || level >= TRIP_HEAT) state.tripped = 1;
        const closed = stringProp(io.props, 'state') === 'on' && state.tripped !== 1;
        for (const name of names) io.setSwitch(name, closed);
        io.aux('closed', closed ? 1 : 0);
        io.aux('tripped', state.tripped ?? 0);
      },
    },
    interactive: { kind: 'toggle', prop: 'state', values: ['on', 'off'] },
    footprint: (props, visual) => {
      const closed = visual?.aux ? (visual.aux.closed ?? 0) > 0 : stringProp(props, 'state') === 'on';
      const tripped = (visual?.aux?.tripped ?? 0) > 0;
      const { x, width } = bounds;
      return dinBody(
        { pins, bounds },
        `C${ratingOf(props)}`,
        `<rect x="${x + 6}" y="-14" width="${width - 12}" height="20" rx="2" fill="#c3c8cd"/>
         <rect x="${x + 7}" y="${closed ? -13 : -3}" width="${width - 14}" height="8" rx="1.5" fill="${tripped ? '#f29900' : closed ? '#30353a' : '#d93025'}"/>`,
      );
    },
  };
}
