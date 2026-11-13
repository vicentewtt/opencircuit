import { COIL_PROP, coilElement, coilEnergized, coilFault, coilOf, dinBody, switchElements, terminal } from '../industrial';
import type { PartDef } from '../types';

const PINS = [
  terminal('A1', -50, -40, 'Bobina A1', 'Coil A1'),
  terminal('1L1', -30, -40),
  terminal('3L2', -10, -40),
  terminal('5L3', 10, -40),
  terminal('13', 30, -40, 'Auxiliar NA 13', 'Auxiliary NO 13'),
  terminal('21', 50, -40, 'Auxiliar NC 21', 'Auxiliary NC 21'),
  terminal('A2', -50, 40, 'Bobina A2', 'Coil A2'),
  terminal('2T1', -30, 40),
  terminal('4T2', -10, 40),
  terminal('6T3', 10, 40),
  terminal('14', 30, 40, 'Auxiliar NA 14', 'Auxiliary NO 14'),
  terminal('22', 50, 40, 'Auxiliar NC 22', 'Auxiliary NC 22'),
];
const BOUNDS = { x: -60, y: -40, width: 120, height: 80 };
const CLOSING = [
  { name: 'pole1', a: '1L1', b: '2T1' },
  { name: 'pole2', a: '3L2', b: '4T2' },
  { name: 'pole3', a: '5L3', b: '6T3' },
  { name: 'no', a: '13', b: '14' },
];

/**
 * Contactor: a coil (A1-A2) that closes three power poles and an auxiliary
 * contact (13-14), and opens another one (21-22).
 */
const contactor: PartDef = {
  type: 'contactor',
  category: 'industrial',
  name: { es: 'Contactor tripolar', en: 'Three-pole contactor' },
  keywords: ['contactor', 'km', 'bobina', 'coil', 'potencia', 'power', 'industrial', 'a1', 'a2', 'auxiliar'],
  refPrefix: 'KM',
  bounds: BOUNDS,
  pins: PINS,
  props: [COIL_PROP],
  model: (ctx) => [
    coilElement(ctx),
    ...switchElements(ctx, [...CLOSING, { name: 'nc', a: '21', b: '22' }]),
  ],
  behavior: {
    init: () => ({ on: 0 }),
    update: (io, state) => {
      const on = coilEnergized(io, state);
      for (const contact of CLOSING) io.setSwitch(contact.name, on);
      io.setSwitch('nc', !on);
      io.aux('on', on ? 1 : 0);
    },
  },
  faults: (props) => [coilFault(props)],
  footprint: (props, visual) => {
    const on = (visual?.aux?.on ?? 0) > 0;
    return dinBody(
      { pins: PINS, bounds: BOUNDS },
      coilOf(props).label,
      `<rect x="-22" y="-12" width="44" height="14" rx="2" fill="#30353a"/>
       <rect x="${on ? 2 : -18}" y="-10" width="16" height="10" rx="1.5" fill="${on ? '#5fe07a' : '#8f969d'}"/>`,
    );
  },
};

export default contactor;
