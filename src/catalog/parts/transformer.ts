import { numberProp, type PartDef } from '../types';

/** Primary inductance: large enough for a small magnetizing current at 50 Hz. */
const PRIMARY_HENRIES = 10;

const transformer: PartDef = {
  type: 'transformer',
  category: 'passive',
  name: { es: 'Transformador', en: 'Transformer' },
  keywords: ['transformador', 'transformer', 'trafo', 'bobinado', 'winding', 'ac'],
  refPrefix: 'T',
  bounds: { x: -30, y: -22, width: 60, height: 44 },
  pins: [
    { id: 'p1', name: { es: 'Primario 1', en: 'Primary 1' }, x: -30, y: -10 },
    { id: 'p2', name: { es: 'Primario 2', en: 'Primary 2' }, x: -30, y: 10 },
    { id: 's1', name: { es: 'Secundario 1', en: 'Secondary 1' }, x: 30, y: -10 },
    { id: 's2', name: { es: 'Secundario 2', en: 'Secondary 2' }, x: 30, y: 10 },
  ],
  props: [
    {
      kind: 'number',
      key: 'ratio',
      label: {
        es: 'Relación primario : secundario',
        en: 'Primary : secondary ratio',
      },
      unit: ': 1',
      si: false,
      default: 10,
      min: 0.1,
      max: 50,
    },
  ],
  model: (ctx) => {
    const ratio = numberProp(ctx.props, 'ratio', 10);
    return [
      {
        name: 'main',
        kind: 'transformer',
        p1: ctx.pin('p1'),
        p2: ctx.pin('p2'),
        s1: ctx.pin('s1'),
        s2: ctx.pin('s2'),
        l1: PRIMARY_HENRIES,
        // Voltage follows the turns ratio, inductance its square.
        l2: PRIMARY_HENRIES / (ratio * ratio),
        k: 0.999,
      },
    ];
  },
  footprint: () => `
    <path d="M-30 -10H-18M-30 10H-18M18 -10H30M18 10H30" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"/>
    <rect x="-9" y="-22" width="18" height="44" fill="#70777e" stroke="#30353a"/>
    <path d="M-9 -15H9M-9 -8H9M-9 -1H9M-9 6H9M-9 13H9" stroke="#30353a" stroke-width="0.8"/>
    <rect x="-20" y="-17" width="12" height="34" rx="2" fill="#b3541e" stroke="#7d3a14"/>
    <rect x="8" y="-17" width="12" height="34" rx="2" fill="#c96f2b" stroke="#7d3a14"/>`,
};

export default transformer;
