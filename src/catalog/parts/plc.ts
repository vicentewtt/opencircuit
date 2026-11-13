import {
  ADDRESSES,
  ANALOG_FULL_SCALE,
  COUNTERS,
  INPUTS,
  MARKERS,
  OUTPUTS,
  TIMERS,
  defaultProgram,
  programOf,
  scan,
  serializeProgram,
} from '../../plc/ladder';
import type { ElementSpec } from '../model';
import { terminal } from '../industrial';
import { stringProp, type PartDef, type PinDef } from '../types';

/** Time between two scans of the program, in seconds. */
const SCAN_SECONDS = 0.01;
/** Input thresholds for 24 V signals. */
const HIGH = 15;
const LOW = 5;
const MIN_SUPPLY = 18;

const INPUT_PINS: PinDef[] = ADDRESSES.inputs.map((id, index) =>
  terminal(id, -20 + index * 10, -50, `Entrada ${id}`, `Input ${id}`),
);
const OUTPUT_PINS: PinDef[] = ADDRESSES.outputs.flatMap((id, index) => [
  terminal(`${id}A`, -40 + index * 20, 50, `Salida ${id}, borne 1`, `Output ${id}, terminal 1`),
  terminal(`${id}B`, -30 + index * 20, 50, `Salida ${id}, borne 2`, `Output ${id}, terminal 2`),
]);
const ANALOG_PINS: PinDef[] = ADDRESSES.analog.map((id, index) =>
  terminal(id, 60 + index * 10, -50, `Entrada analógica ${id} (0-10 V)`, `Analog input ${id} (0-10 V)`),
);
const PINS: PinDef[] = [
  terminal('L+', -50, -50, 'Alimentación +24 V (L+)', 'Supply +24 V (L+)'),
  terminal('M', -40, -50, 'Alimentación 0 V (M)', 'Supply 0 V (M)'),
  ...INPUT_PINS,
  ...ANALOG_PINS,
  ...OUTPUT_PINS,
];

const mask = (state: Record<string, number>, prefix: string, count: number): number => {
  let bits = 0;
  for (let index = 0; index < count; index++) if (state[`${prefix}${index + 1}`] === 1) bits |= 1 << index;
  return bits;
};

/**
 * Compact PLC for 24 V DC: eight digital inputs, four relay outputs and a
 * Ladder program. It works like a real one: it reads the inputs, runs the
 * program from top to bottom and then updates the outputs, every 10 ms.
 */
const plc: PartDef = {
  type: 'plc',
  category: 'industrial',
  name: { es: 'PLC compacto (8 entradas, 4 salidas a relé)', en: 'Compact PLC (8 inputs, 4 relay outputs)' },
  keywords: ['plc', 'logo', 'automata', 'controlador', 'ladder', 'escalera', 'kop', 'programable', 'industrial', '24v'],
  refPrefix: 'PLC',
  bounds: { x: -60, y: -50, width: 140, height: 100 },
  pins: PINS,
  props: [
    {
      kind: 'code',
      key: 'program',
      label: { es: 'Programa Ladder', en: 'Ladder program' },
      default: serializeProgram(defaultProgram()),
    },
  ],
  plc: true,
  model: (ctx) => [
    { name: 'main', kind: 'resistor', a: ctx.pin('L+'), b: ctx.pin('M'), ohms: 600 },
    ...ADDRESSES.inputs.map(
      (id): ElementSpec => ({ name: `in:${id}`, kind: 'resistor', a: ctx.pin(id), b: ctx.pin('M'), ohms: 4700 }),
    ),
    ...ADDRESSES.analog.map(
      (id): ElementSpec => ({ name: `in:${id}`, kind: 'resistor', a: ctx.pin(id), b: ctx.pin('M'), ohms: 100e3 }),
    ),
    ...ADDRESSES.outputs.map(
      (id): ElementSpec => ({ name: `out:${id}`, kind: 'switch', a: ctx.pin(`${id}A`), b: ctx.pin(`${id}B`), ohms: 0.01 }),
    ),
  ],
  behavior: {
    init: () => ({}),
    update: (io, state) => {
      const running = io.v('L+', 'M') > MIN_SUPPLY;
      if (!running) {
        // Without power nothing is remembered.
        for (const key of Object.keys(state)) delete state[key];
      } else {
        const elapsed = (state['#elapsed'] ?? SCAN_SECONDS) + io.dt;
        if (elapsed >= SCAN_SECONDS) {
          for (const id of ADDRESSES.inputs) {
            const volts = io.v(id, 'M');
            if (volts > HIGH) state[id] = 1;
            else if (volts < LOW) state[id] = 0;
          }
          for (const id of ADDRESSES.analog) {
            const volts = Math.max(0, Math.min(10, io.v(id, 'M')));
            state[id] = Math.round((volts / 10) * ANALOG_FULL_SCALE);
          }
          scan(programOf(stringProp(io.props, 'program')), state, state['#ran'] === 1 ? elapsed : 0);
          state['#ran'] = 1;
          state['#elapsed'] = 0;
        } else {
          state['#elapsed'] = elapsed;
        }
      }
      for (const id of ADDRESSES.outputs) io.setSwitch(`out:${id}`, state[id] === 1);
      io.aux('run', running ? 1 : 0);
      io.aux('I', mask(state, 'I', INPUTS));
      io.aux('Q', mask(state, 'Q', OUTPUTS));
      io.aux('M', mask(state, 'M', MARKERS));
      io.aux('T', mask(state, 'T', TIMERS));
      io.aux('C', mask(state, 'C', COUNTERS));
      for (const id of ADDRESSES.analog) io.aux(id, state[id] ?? 0);
      for (const id of ADDRESSES.timers) io.aux(`${id}:et`, state[`${id}:et`] ?? 0);
      for (const id of ADDRESSES.counters) io.aux(`${id}:cv`, state[`${id}:cv`] ?? 0);
    },
  },
  faults: () => [
    { element: 'main', quantity: 'voltage', max: 32, cause: 'overvoltage', action: 'burn' },
    { element: 'main', quantity: 'reverse-voltage', max: 1, cause: 'reverse-polarity', action: 'burn' },
  ],
  footprint: (_props, visual) => {
    const aux = visual?.burned ? undefined : visual?.aux;
    const led = (x: number, y: number, on: boolean, color: string): string =>
      `<circle cx="${x}" cy="${y}" r="2" fill="${on ? color : '#3a4046'}"/>`;
    const screws = PINS.map(
      (pin) => `<path d="M${pin.x} ${pin.y}V${pin.y < 0 ? -42 : 42}" stroke="#9aa0a6" stroke-width="2.4" stroke-linecap="round"/>
        <text x="${pin.x}" y="${pin.y < 0 ? -35 : 39}" font-size="3.8" font-family="monospace" text-anchor="middle" fill="#30353a">${pin.id.replace(/([AB])$/, '')}</text>`,
    ).join('');
    return `
      <rect x="-60" y="-42" width="140" height="84" rx="4" fill="#d9dde1" stroke="#70777e"/>
      ${screws}
      <rect x="-54" y="-28" width="128" height="52" rx="3" fill="#30353a"/>
      <text x="-48" y="-17" font-size="7" font-family="monospace" font-weight="bold" fill="#e9f1fb">PLC</text>
      ${led(-20, -19, (aux?.run ?? 0) > 0, '#5fe07a')}
      <text x="-15" y="-17" font-size="4.5" font-family="monospace" fill="#c9cdd2">RUN</text>
      ${INPUT_PINS.map((pin, index) => led(pin.x, -8, (((aux?.I ?? 0) >> index) & 1) === 1, '#5fe07a')).join('')}
      <text x="-48" y="-6.5" font-size="4.5" font-family="monospace" fill="#c9cdd2">I1-I8</text>
      ${ADDRESSES.outputs.map((_, index) => led(-35 + index * 20, 14, (((aux?.Q ?? 0) >> index) & 1) === 1, '#ff9d2e')).join('')}
      <text x="42" y="15.5" font-size="4.5" font-family="monospace" text-anchor="middle" fill="#c9cdd2">Q1-Q4</text>
      ${ADDRESSES.analog
        .map(
          (id, index) =>
            `<text x="${60 + index * 10}" y="-6.5" font-size="3.6" font-family="monospace" text-anchor="middle" fill="#8fdcff">${Math.round(((aux?.[id] ?? 0) / ANALOG_FULL_SCALE) * 100)}%</text>`,
        )
        .join('')}`;
  },
};

export default plc;
