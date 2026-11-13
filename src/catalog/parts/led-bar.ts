import { DIP_BOTTOM_Y, DIP_TOP_Y, dipBounds, dipX } from '../dip';
import { saturationCurrent, type ElementSpec, type FaultRule } from '../model';
import { same, type PartDef, type PinDef } from '../types';

const COUNT = 10;
const RATED = 0.02;
const INDEXES = Array.from({ length: COUNT }, (_, k) => k);
/** Green for most of the bar, then yellow and red, like a level meter. */
const colorOf = (k: number): string => (k < 6 ? '#43d15b' : k < 8 ? '#f2c81e' : '#ff3b30');

const pins: PinDef[] = [];
for (const k of INDEXES) {
  pins.push({ id: `a${k + 1}`, name: same(`A${k + 1}`), x: dipX(k, COUNT), y: DIP_TOP_Y });
  pins.push({ id: `k${k + 1}`, name: same(`K${k + 1}`), x: dipX(k, COUNT), y: DIP_BOTTOM_Y });
}

const ledBar: PartDef = {
  type: 'led-bar',
  category: 'output',
  name: { es: 'Barra de 10 LED', en: '10-LED bar graph' },
  keywords: ['barra', 'bar', 'graph', 'led', 'vumetro', 'nivel', 'level', 'bargraph'],
  refPrefix: 'DS',
  bounds: dipBounds(COUNT),
  pins,
  props: [],
  model: (ctx) =>
    INDEXES.map(
      (k): ElementSpec => ({
        name: `led${k + 1}`,
        kind: 'diode',
        a: ctx.pin(`a${k + 1}`),
        k: ctx.pin(`k${k + 1}`),
        is: saturationCurrent(2, RATED, 2),
        n: 2,
      }),
    ),
  probes: Object.fromEntries(INDEXES.map((k) => [`led${k + 1}`, `led${k + 1}`])),
  faults: () =>
    INDEXES.map(
      (k): FaultRule => ({
        element: `led${k + 1}`,
        quantity: 'current',
        max: 0.05,
        cause: 'led-overcurrent',
        action: 'burn',
      }),
    ),
  footprint: (_props, visual) => {
    const bounds = dipBounds(COUNT);
    let legs = '';
    let bars = '';
    for (const k of INDEXES) {
      const x = dipX(k, COUNT);
      const amps = visual?.burned ? 0 : Math.max(0, visual?.aux?.[`led${k + 1}`] ?? 0);
      const level = Math.min(1, Math.sqrt(amps / RATED));
      legs += `M${x} ${DIP_TOP_Y}v5M${x} ${DIP_BOTTOM_Y}v-5`;
      bars += `<rect x="${x - 3.2}" y="-3" width="6.4" height="16" rx="1" fill="${level > 0.03 ? colorOf(k) : '#2b3a2e'}" fill-opacity="${level > 0.03 ? (0.45 + 0.55 * level).toFixed(2) : '1'}"/>`;
    }
    return `
      <path d="${legs}" stroke="#c3c8cd" stroke-width="3" fill="none"/>
      <rect x="${bounds.x + 1}" y="-6" width="${bounds.width - 2}" height="22" rx="1.5" fill="#17191b" stroke="#000000"/>
      ${bars}`;
  },
};

export default ledBar;
