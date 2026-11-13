import { formatSi } from '../../lib/si';
import type { PartSimState } from '../model';
import { stringProp, type PartDef, type PartProps } from '../types';

/** Test source of the ohmmeter: 0.5 V behind 1 kΩ. */
const TEST_VOLTS = 0.5;
const TEST_OHMS = 1000;
const CONTINUITY_OHMS = 50;
const OVER_RANGE_OHMS = 50e6;

type Mode = 'vdc' | 'vac' | 'adc' | 'ohm' | 'cont';

const modeOf = (props: PartProps): Mode => {
  const mode = stringProp(props, 'mode', 'vdc');
  return mode === 'vac' || mode === 'adc' || mode === 'ohm' || mode === 'cont' ? mode : 'vdc';
};

/** Resistance seen between the probes in the ohm and continuity modes. */
function measuredOhms(state: PartSimState): number {
  const current = state.iMean ?? state.i;
  if (current < 1e-9) return Infinity;
  return Math.max(0, (TEST_VOLTS - current * TEST_OHMS) / current);
}

/** What the display shows for the current mode and electrical state. */
export function multimeterReading(props: PartProps, state: PartSimState | undefined): string {
  if (!state) return '----';
  switch (modeOf(props)) {
    case 'vdc':
      return formatSi(state.vMean ?? state.v, 'V');
    case 'vac': {
      // RMS of the alternating part only, like a meter with AC coupling.
      const mean = state.vMean ?? state.v;
      const rms = state.vRms ?? Math.abs(state.v);
      return formatSi(Math.sqrt(Math.max(0, rms * rms - mean * mean)), 'V');
    }
    case 'adc':
      return formatSi(state.iMean ?? state.i, 'A');
    case 'ohm':
    case 'cont': {
      const ohms = measuredOhms(state);
      return ohms > OVER_RANGE_OHMS ? 'OL' : formatSi(ohms, 'Ω');
    }
  }
}

const SYMBOLS: Record<Mode, string> = { vdc: 'V⎓', vac: 'V~', adc: 'A⎓', ohm: 'Ω', cont: '•))' };
const DIAL_ANGLES: Record<Mode, number> = { vdc: -60, vac: -30, adc: 0, ohm: 30, cont: 60 };

const multimeter: PartDef = {
  type: 'multimeter',
  category: 'instrument',
  name: { es: 'Multímetro', en: 'Multimeter' },
  keywords: ['multimetro', 'multimeter', 'tester', 'voltimetro', 'amperimetro', 'ohmetro', 'voltmeter', 'ammeter'],
  refPrefix: 'M',
  bounds: { x: -30, y: -50, width: 60, height: 100 },
  pins: [
    { id: 'negative', name: { es: 'COM (negro)', en: 'COM (black)' }, x: -10, y: 50 },
    { id: 'positive', name: { es: 'VΩA (rojo)', en: 'VΩA (red)' }, x: 10, y: 50 },
  ],
  props: [
    {
      kind: 'select',
      key: 'mode',
      label: { es: 'Función', en: 'Function' },
      default: 'vdc',
      options: [
        { value: 'vdc', label: { es: 'Voltaje continuo (V⎓)', en: 'DC voltage (V⎓)' } },
        { value: 'vac', label: { es: 'Voltaje alterno (V~)', en: 'AC voltage (V~)' } },
        { value: 'adc', label: { es: 'Corriente (A)', en: 'Current (A)' } },
        { value: 'ohm', label: { es: 'Resistencia (Ω)', en: 'Resistance (Ω)' } },
        { value: 'cont', label: { es: 'Continuidad', en: 'Continuity' } },
      ],
    },
  ],
  model: (ctx) => {
    const positive = ctx.pin('positive');
    const negative = ctx.pin('negative');
    switch (modeOf(ctx.props)) {
      case 'vdc':
      case 'vac':
        // A voltmeter barely loads the circuit.
        return [{ name: 'main', kind: 'resistor', a: positive, b: negative, ohms: 10e6 }];
      case 'adc':
        // An ammeter goes in series: it is almost a short circuit.
        return [{ name: 'main', kind: 'resistor', a: positive, b: negative, ohms: 0.01 }];
      case 'ohm':
      case 'cont': {
        const source = ctx.internal('test');
        return [
          { name: 'test', kind: 'vsource', p: source, n: negative, volts: TEST_VOLTS },
          { name: 'main', kind: 'resistor', a: source, b: positive, ohms: TEST_OHMS },
        ];
      }
    }
  },
  faults: (props) =>
    modeOf(props) === 'adc'
      ? [{ element: 'main', quantity: 'current', max: 10, cause: 'overcurrent', action: 'burn' }]
      : [],
  beep: (props, state) => modeOf(props) === 'cont' && measuredOhms(state) < CONTINUITY_OHMS,
  footprint: (props, visual) => {
    const mode = modeOf(props);
    const hasState = visual?.v !== undefined;
    const reading = hasState ? multimeterReading(props, visual as PartSimState) : '----';
    return `
      <rect x="-30" y="-50" width="60" height="100" rx="7" fill="#e0a526" stroke="#9c7212"/>
      <rect x="-25" y="-45" width="50" height="90" rx="5" fill="#2a2d31"/>
      <rect x="-21" y="-41" width="42" height="20" rx="2" fill="#c5d1b6" stroke="#70777e"/>
      <text x="18" y="-27" font-size="9" font-family="monospace" text-anchor="end" fill="#1b1f1d">${reading}</text>
      <text x="-19" y="-34" font-size="5" font-family="monospace" fill="#1b1f1d">${SYMBOLS[mode]}</text>
      <circle cx="0" cy="6" r="15" fill="#3a3e43" stroke="#111315"/>
      <path d="M0 6V-7" stroke="#e9eef0" stroke-width="3" stroke-linecap="round" transform="rotate(${DIAL_ANGLES[mode]} 0 6)"/>
      <circle cx="-10" cy="38" r="4.5" fill="#111315" stroke="#70777e"/>
      <circle cx="10" cy="38" r="4.5" fill="#b3261e" stroke="#70777e"/>
      <path d="M-10 42V50M10 42V50" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round"/>`;
  },
};

export default multimeter;
