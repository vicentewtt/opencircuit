import { describe, expect, it } from 'vitest';
import { SimSession } from '../core/sim/session';
import type { SimSnapshot } from '../core/sim/types';
import { addPart, addWire, setPartProp } from '../editor/model/ops';
import { EMPTY_DOC, type CircuitDoc } from '../editor/model/types';
import { signalStats } from '../instruments/analysis';
import { PART_DEFS, requirePartDef } from './registry';

/** Parts far apart (ids p1, p2, ...) joined by pin-to-pin wires. */
function build(types: string[], wires: [string, string][]): CircuitDoc {
  let doc = EMPTY_DOC;
  types.forEach((type, index) => {
    doc = addPart(doc, type, { x: index * 1000, y: 7000 }).doc;
  });
  for (const [from, to] of wires) {
    const [fromPart = '', fromPin = ''] = from.split('.');
    const [toPart = '', toPin = ''] = to.split('.');
    const result = addWire(doc, { partId: fromPart, pinId: fromPin }, { partId: toPart, pinId: toPin }, [], '#000000');
    if (!result) throw new Error(`bad wire ${from} -> ${to}`);
    doc = result.doc;
  }
  return doc;
}

const set = (doc: CircuitDoc, changes: [string, string, number | string][]): CircuitDoc =>
  changes.reduce((current, [id, key, value]) => setPartProp(current, id, key, value), doc);

function run(doc: CircuitDoc, seconds = 0.1): SimSnapshot {
  const session = new SimSession();
  session.load(doc, {}, [], {});
  let snapshot = session.snapshot();
  for (let t = 0; t < seconds - 1e-9; t += 0.02) snapshot = session.advance(0.02, 60_000);
  return snapshot;
}

/** Drives a logic chip's behavior directly: set pin levels, step, read outputs. */
function chip(type: string) {
  const def = requirePartDef(type);
  const behavior = def.behavior;
  if (!behavior) throw new Error(`${type} has no behavior`);
  const state = behavior.init({});
  const volts: Record<string, number> = { VCC: 5, GND: 0 };
  const switches: Record<string, boolean> = {};
  const io = {
    props: {},
    dt: 50e-6,
    v: (pin: string, ref: string) => (volts[pin] ?? 0) - (volts[ref] ?? 0),
    connected: (pin: string) => pin in volts,
    i: () => 0,
    input: () => 0,
    setSwitch: (element: string, closed: boolean) => {
      switches[element] = closed;
    },
    setSource: () => undefined,
    aux: () => undefined,
  };
  const api = {
    set(levels: Record<string, 0 | 1>) {
      for (const [pin, level] of Object.entries(levels)) volts[pin] = level * 5;
      behavior.update(io, state);
      return api;
    },
    /** Raises and lowers a pin: one clock pulse. */
    pulse(pin: string, times = 1) {
      for (let k = 0; k < times; k++) api.set({ [pin]: 1 }).set({ [pin]: 0 });
      return api;
    },
    out(pin: string): boolean | null {
      return switches[`${pin}:hi`] ? true : switches[`${pin}:lo`] ? false : null;
    },
    bits(pins: string[]): string {
      return pins.map((pin) => (api.out(pin) === true ? '1' : api.out(pin) === false ? '0' : 'z')).join('');
    },
    power(on: boolean) {
      volts.VCC = on ? 5 : 0;
      behavior.update(io, state);
      return api;
    },
  };
  return api;
}

describe('catalog size', () => {
  it('has the 21 parts of phase 5b', () => {
    const types = new Set(PART_DEFS.map((def) => def.type));
    for (const type of [
      'ic-ne555', 'ic-lm358', 'ic-lm741', 'ic-lm7805', 'ic-lm317',
      'ic-74hc00', 'ic-74hc02', 'ic-74hc04', 'ic-74hc08', 'ic-74hc32', 'ic-74hc86',
      'ic-74hc595', 'ic-cd4017', 'ic-74hc193', 'ic-l293d', 'ic-uln2003',
      'relay', 'relay-module', 'motor-dc', 'scr', 'triac',
    ]) {
      expect(types.has(type), type).toBe(true);
    }
    expect(PART_DEFS.length).toBeGreaterThanOrEqual(65);
  });
});

describe('logic gates', () => {
  const table = (type: string): string =>
    [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]
      .map(([a, b]) => (chip(type).set({ '1A': a as 0 | 1, '1B': b as 0 | 1 }).out('1Y') ? '1' : '0'))
      .join('');

  it('follow their truth tables', () => {
    expect(table('ic-74hc00')).toBe('1110');
    expect(table('ic-74hc02')).toBe('1000');
    expect(table('ic-74hc08')).toBe('0001');
    expect(table('ic-74hc32')).toBe('0111');
    expect(table('ic-74hc86')).toBe('0110');
    expect(chip('ic-74hc04').set({ '3A': 0 }).out('3Y')).toBe(true);
    expect(chip('ic-74hc04').set({ '3A': 1 }).out('3Y')).toBe(false);
  });

  it('gates of one chip are independent', () => {
    const nand = chip('ic-74hc00').set({ '1A': 1, '1B': 1, '4A': 0, '4B': 1 });
    expect(nand.bits(['1Y', '2Y', '3Y', '4Y'])).toBe('0111');
  });

  it('release their outputs without power', () => {
    expect(chip('ic-74hc08').set({ '1A': 1, '1B': 1 }).power(false).out('1Y')).toBeNull();
  });

  it('drive a real load from the supply pin', () => {
    // 74HC08 p2 powered from battery p1 (5 V); both inputs high; output feeds 1 kΩ p3.
    let doc = build(['dc-supply', 'ic-74hc08', 'resistor'], [
      ['p1.positive', 'p2.VCC'],
      ['p1.negative', 'p2.GND'],
      ['p1.positive', 'p2.1A'],
      ['p1.positive', 'p2.1B'],
      ['p2.1Y', 'p3.1'],
      ['p3.2', 'p1.negative'],
    ]);
    doc = set(doc, [['p3', 'resistance', 1000]]);
    const high = run(doc);
    // 5 V behind the 30 Ω output: 4.85 V on 1 kΩ, and the supply delivers that current.
    expect(high.parts.p3?.v).toBeGreaterThan(4.8);
    expect(high.parts.p1?.i).toBeGreaterThan(0.0045);

    const low = run(build(['dc-supply', 'ic-74hc08', 'resistor'], [
      ['p1.positive', 'p2.VCC'],
      ['p1.negative', 'p2.GND'],
      ['p1.positive', 'p2.1A'],
      ['p1.negative', 'p2.1B'],
      ['p2.1Y', 'p3.1'],
      ['p3.2', 'p1.negative'],
    ]));
    expect(Math.abs(low.parts.p3?.v ?? 1)).toBeLessThan(0.01);
  });
});

describe('sequential chips', () => {
  const Q = ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'];

  it('74HC595 shifts bits in and shows them on the latch clock', () => {
    const register = chip('ic-74hc595').set({ nSRCLR: 1, nOE: 0, SER: 0, SRCLK: 0, RCLK: 0 });
    // Shift in 1,0,1,1 (first bit ends up furthest along).
    for (const bit of [1, 0, 1, 1] as const) register.set({ SER: bit }).pulse('SRCLK');
    expect(register.bits(Q)).toBe('00000000');
    register.pulse('RCLK');
    expect(register.bits(Q)).toBe('11010000');
    for (let k = 0; k < 4; k++) register.set({ SER: 0 }).pulse('SRCLK');
    expect(register.out("QH'")).toBe(true);
    expect(register.set({ nOE: 1 }).bits(Q)).toBe('zzzzzzzz');
    register.set({ nOE: 0, nSRCLR: 0 }).set({ nSRCLR: 1 }).pulse('RCLK');
    expect(register.bits(Q)).toBe('00000000');
  });

  it('CD4017 walks one high output through ten positions', () => {
    const counter = chip('ic-cd4017').set({ CLK: 0, RST: 0, INH: 0 });
    const active = (): number => [...Array(10).keys()].findIndex((n) => counter.out(`Q${n}`) === true);
    expect(active()).toBe(0);
    counter.pulse('CLK', 3);
    expect(active()).toBe(3);
    expect(counter.out('CO')).toBe(true);
    counter.pulse('CLK', 4);
    expect(active()).toBe(7);
    expect(counter.out('CO')).toBe(false);
    counter.pulse('CLK', 3);
    expect(active()).toBe(0);
    counter.pulse('CLK', 2).set({ INH: 1 }).pulse('CLK', 5);
    expect(active()).toBe(2);
    counter.set({ RST: 1 });
    expect(active()).toBe(0);
  });

  it('74HC193 counts up and down, loads and clears', () => {
    const counter = chip('ic-74hc193').set({ UP: 1, DOWN: 1, nLOAD: 1, CLR: 0 });
    const value = (): number => parseInt(counter.bits(['QD', 'QC', 'QB', 'QA']), 2);
    const tick = (pin: string, times: number) => {
      for (let k = 0; k < times; k++) counter.set({ [pin]: 0 }).set({ [pin]: 1 });
    };
    tick('UP', 5);
    expect(value()).toBe(5);
    tick('DOWN', 2);
    expect(value()).toBe(3);
    counter.set({ A: 0, B: 1, C: 1, D: 1, nLOAD: 0 }).set({ nLOAD: 1 });
    expect(value()).toBe(14);
    tick('UP', 1);
    expect(value()).toBe(15);
    expect(counter.set({ UP: 0 }).out('nCO')).toBe(false);
    counter.set({ UP: 1 });
    expect(value()).toBe(0);
    expect(counter.set({ DOWN: 0 }).out('nBO')).toBe(false);
    counter.set({ DOWN: 1 });
    expect(value()).toBe(15);
    counter.set({ CLR: 1 });
    expect(value()).toBe(0);
  });
});

describe('NE555', () => {
  it('oscillates at 1.44 / ((R1 + 2·R2) · C) in astable mode', () => {
    // p1 supply 5 V, p2 555, p3 R1 = 1 kΩ, p4 R2 = 10 kΩ, p5 C = 1 µF, p6 scope.
    let doc = build(['dc-supply', 'ic-ne555', 'resistor', 'resistor', 'capacitor', 'oscilloscope'], [
      ['p1.positive', 'p2.VCC'],
      ['p1.negative', 'p2.GND'],
      ['p1.positive', 'p2.RESET'],
      ['p1.positive', 'p3.1'],
      ['p3.2', 'p2.DIS'],
      ['p2.DIS', 'p4.1'],
      ['p4.2', 'p2.THR'],
      ['p2.THR', 'p2.TRIG'],
      ['p2.THR', 'p5.1'],
      ['p5.2', 'p1.negative'],
      ['p6.ch1', 'p2.OUT'],
      ['p6.gnd', 'p1.negative'],
    ]);
    doc = set(doc, [['p3', 'resistance', 1000], ['p4', 'resistance', 10e3], ['p5', 'capacitance', 1e-6]]);
    const session = new SimSession();
    session.load(doc, {}, [], {});
    const t: number[] = [];
    const out: number[] = [];
    for (let k = 0; k < 25; k++) {
      const trace = session.advance(0.02, 60_000).traces.p6;
      if (trace) {
        t.push(...trace.t);
        out.push(...(trace.ch[0] ?? []));
      }
    }
    const stats = signalStats(t, out, 0, t.length);
    const expected = 1.44 / ((1000 + 2 * 10e3) * 1e-6);
    expect(Math.abs((stats?.frequency ?? 0) - expected) / expected).toBeLessThan(0.05);
    expect(stats?.max).toBeGreaterThan(4.5);
    expect(stats?.min).toBeLessThan(0.3);
  });
});

describe('op-amps', () => {
  /** LM358 p2 on a single 9 V supply (battery p1); input from adjustable supply p3. */
  const base = (extra: string[], wires: [string, string][], volts: number): CircuitDoc =>
    set(
      build(['battery-9v', 'ic-lm358', 'dc-supply', ...extra], [
        ['p1.positive', 'p2.V+'],
        ['p1.negative', 'p2.V-'],
        ['p3.negative', 'p1.negative'],
        ['p3.positive', 'p2.IN+ A'],
        ...wires,
      ]),
      [['p3', 'voltage', volts]],
    );

  it('a follower copies its input', () => {
    const doc = base([], [['p2.OUT A', 'p2.IN- A']], 2.5);
    const snapshot = run(doc);
    expect(snapshot.converged).toBe(true);
    expect(snapshot.parts.p2?.v).toBeCloseTo(2.5, 3);
  });

  it('a non-inverting amplifier multiplies by 1 + Rf/Rg', () => {
    // Rf p4 = 20 kΩ from output to IN−, Rg p5 = 10 kΩ from IN− to ground: gain 3.
    let doc = base(['resistor', 'resistor'], [
      ['p2.OUT A', 'p4.1'],
      ['p4.2', 'p2.IN- A'],
      ['p2.IN- A', 'p5.1'],
      ['p5.2', 'p1.negative'],
    ], 1.2);
    doc = set(doc, [['p4', 'resistance', 20e3], ['p5', 'resistance', 10e3]]);
    const snapshot = run(doc);
    expect(snapshot.converged).toBe(true);
    // Across Rg sits the input voltage; across Rf twice that.
    expect(snapshot.parts.p5?.v).toBeCloseTo(1.2, 3);
    expect(snapshot.parts.p4?.v).toBeCloseTo(2.4, 2);
  });

  it('saturates near the rails when used as a comparator', () => {
    // IN− tied to ground: any positive input sends the output high (9 V − 1.5 V).
    const high = run(base([], [['p2.IN- A', 'p1.negative']], 1));
    expect(high.converged).toBe(true);
    expect(high.parts.p2?.v).toBeGreaterThan(7.2);
    expect(high.parts.p2?.v).toBeLessThan(7.6);
    // Input at 0 V against a 2 V reference on IN−: output at the bottom rail.
    const low = run(
      set(
        build(['battery-9v', 'ic-lm358', 'dc-supply'], [
          ['p1.positive', 'p2.V+'],
          ['p1.negative', 'p2.V-'],
          ['p3.negative', 'p1.negative'],
          ['p3.positive', 'p2.IN- A'],
          ['p2.IN+ A', 'p1.negative'],
        ]),
        [['p3', 'voltage', 2]],
      ),
    );
    expect(low.parts.p2?.v).toBeLessThan(0.1);
  });
});

describe('regulators', () => {
  it('LM7805 gives 5 V and passes the load current to its input', () => {
    let doc = build(['battery-9v', 'ic-lm7805', 'resistor'], [
      ['p1.positive', 'p2.IN'],
      ['p1.negative', 'p2.GND'],
      ['p2.OUT', 'p3.1'],
      ['p3.2', 'p1.negative'],
    ]);
    doc = set(doc, [['p3', 'resistance', 100], ['p3', 'power', 1]]);
    const snapshot = run(doc);
    expect(snapshot.parts.p3?.v).toBeCloseTo(5, 2);
    // 50 mA of load plus about 4.5 mA of quiescent current.
    expect(snapshot.parts.p1?.i).toBeGreaterThan(0.052);
    expect(snapshot.parts.p1?.i).toBeLessThan(0.057);
  });

  it('LM7805 drops out when the input is too low', () => {
    let doc = build(['dc-supply', 'ic-lm7805', 'resistor'], [
      ['p1.positive', 'p2.IN'],
      ['p1.negative', 'p2.GND'],
      ['p2.OUT', 'p3.1'],
      ['p3.2', 'p1.negative'],
    ]);
    doc = set(doc, [['p1', 'voltage', 6], ['p3', 'resistance', 1000]]);
    expect(run(doc).parts.p3?.v).toBeCloseTo(4, 1);
  });

  it('LM317 output is set by its divider: 1.25 V · (1 + R2/R1)', () => {
    // R1 p3 = 240 Ω between OUT and ADJ, R2 p4 = 720 Ω from ADJ to ground: 5 V.
    let doc = build(['battery-9v', 'ic-lm317', 'resistor', 'resistor'], [
      ['p1.positive', 'p2.IN'],
      ['p2.OUT', 'p3.1'],
      ['p3.2', 'p2.ADJ'],
      ['p2.ADJ', 'p4.1'],
      ['p4.2', 'p1.negative'],
    ]);
    doc = set(doc, [['p3', 'resistance', 240], ['p4', 'resistance', 720]]);
    const snapshot = run(doc);
    expect(snapshot.parts.p3?.v).toBeCloseTo(1.25, 2);
    expect((snapshot.parts.p3?.v ?? 0) + (snapshot.parts.p4?.v ?? 0)).toBeCloseTo(5, 1);
  });
});

describe('relays and drivers', () => {
  /** Battery p1 feeds the coil of relay p2 through switch p3; the contacts switch LED p5 via 220 Ω p4. */
  const relayCircuit = (): CircuitDoc =>
    set(
      build(['battery-aa-x4', 'relay', 'switch-spst', 'resistor', 'led'], [
        ['p1.positive', 'p3.1'],
        ['p3.2', 'p2.coil1'],
        ['p2.coil2', 'p1.negative'],
        ['p1.positive', 'p2.com'],
        ['p2.no', 'p4.1'],
        ['p4.2', 'p5.anode'],
        ['p5.cathode', 'p1.negative'],
      ]),
      [],
    );

  it('a relay closes its normally-open contact when the coil is powered', () => {
    const doc = relayCircuit();
    const off = run(doc);
    expect(Math.abs(off.parts.p5?.i ?? 1)).toBeLessThan(1e-6);
    expect(off.parts.p2?.aux?.on).toBe(0);
    const on = run(set(doc, [['p3', 'state', 'on']]));
    expect(on.parts.p2?.aux?.on).toBe(1);
    expect(on.parts.p5?.i).toBeGreaterThan(0.012);
  });

  it('a relay module follows its input and draws coil current from VCC', () => {
    let doc = build(['dc-supply', 'relay-module', 'switch-spst', 'resistor'], [
      ['p1.positive', 'p2.VCC'],
      ['p1.negative', 'p2.GND'],
      ['p1.positive', 'p3.1'],
      ['p3.2', 'p2.IN'],
      ['p1.positive', 'p2.com'],
      ['p2.no', 'p4.1'],
      ['p4.2', 'p1.negative'],
    ]);
    doc = set(doc, [['p4', 'resistance', 1000]]);
    expect(Math.abs(run(doc).parts.p4?.v ?? 1)).toBeLessThan(0.01);
    const on = run(set(doc, [['p3', 'state', 'on']]));
    expect(on.parts.p4?.v).toBeCloseTo(5, 1);
    // Coil (70 mA) plus the 1 kΩ load (5 mA) plus the input resistor.
    expect(on.parts.p1?.i).toBeGreaterThan(0.07);
    // Active-low boards do the opposite.
    const inverted = run(set(doc, [['p2', 'trigger', 'low'], ['p3', 'state', 'on']]));
    expect(Math.abs(inverted.parts.p4?.v ?? 1)).toBeLessThan(0.01);
  });

  it('ULN2003 sinks the load when its input is high', () => {
    let doc = build(['dc-supply', 'ic-uln2003', 'resistor', 'switch-spst'], [
      ['p1.negative', 'p2.GND'],
      ['p1.positive', 'p3.1'],
      ['p3.2', 'p2.OUT3'],
      ['p1.positive', 'p4.1'],
      ['p4.2', 'p2.IN3'],
    ]);
    doc = set(doc, [['p3', 'resistance', 1000]]);
    expect(Math.abs(run(doc).parts.p3?.i ?? 1)).toBeLessThan(1e-6);
    expect(run(set(doc, [['p4', 'state', 'on']])).parts.p3?.i).toBeGreaterThan(0.0049);
  });

  it('an L293D drives a motor in both directions', () => {
    // Logic and motor supply from p1 (5 V); motor p3 between OUT1 and OUT2.
    const wires: [string, string][] = [
      ['p1.positive', 'p2.VSS'],
      ['p1.positive', 'p2.VS'],
      ['p1.negative', 'p2.GND1'],
      ['p1.positive', 'p2.EN12'],
      ['p2.OUT1', 'p3.positive'],
      ['p2.OUT2', 'p3.negative'],
    ];
    const forward = run(build(['dc-supply', 'ic-l293d', 'motor-dc'], [...wires, ['p1.positive', 'p2.IN1'], ['p1.negative', 'p2.IN2']]), 1.5);
    const backward = run(build(['dc-supply', 'ic-l293d', 'motor-dc'], [...wires, ['p1.negative', 'p2.IN1'], ['p1.positive', 'p2.IN2']]), 1.5);
    const braked = run(build(['dc-supply', 'ic-l293d', 'motor-dc'], [...wires, ['p1.positive', 'p2.IN1'], ['p1.positive', 'p2.IN2']]), 0.5);
    expect(forward.parts.p3?.aux?.rpm).toBeGreaterThan(3500);
    expect(backward.parts.p3?.aux?.rpm).toBeLessThan(-3500);
    expect(Math.abs(braked.parts.p3?.aux?.rpm ?? 1e9)).toBeLessThan(1);
    // The motor current comes out of the supply.
    expect(forward.parts.p1?.i).toBeGreaterThan(0.02);
  });
});

describe('DC motor', () => {
  it('speeds up to its no-load speed and draws little current there', () => {
    const doc = set(build(['dc-supply', 'motor-dc'], [
      ['p1.positive', 'p2.positive'],
      ['p1.negative', 'p2.negative'],
    ]), [['p1', 'voltage', 6]]);
    const session = new SimSession();
    session.load(doc, {}, [], {});
    const start = session.advance(0.001, 60_000);
    // At standstill only the winding limits the current: 6 V / 10 Ω.
    expect(start.parts.p2?.i).toBeGreaterThan(0.5);
    let snapshot = start;
    for (let k = 0; k < 100; k++) snapshot = session.advance(0.02, 60_000);
    // No-load: 6 V / 0.0095 V·s/rad ≈ 630 rad/s ≈ 5700 rpm, a little less with friction.
    expect(snapshot.parts.p2?.aux?.rpm).toBeGreaterThan(5200);
    expect(snapshot.parts.p2?.aux?.rpm).toBeLessThan(6100);
    expect(snapshot.parts.p2?.i).toBeLessThan(0.08);
    expect(snapshot.burned).toEqual([]);
  });
});

describe('thyristors', () => {
  it('an SCR latches after a gate pulse and stays on without it', () => {
    // 6 V p1 -> 220 Ω p3 -> SCR p2 anode; gate from + through 1 kΩ p4 and switch p5.
    let doc = build(['battery-aa-x4', 'scr', 'resistor', 'resistor', 'switch-spst'], [
      ['p1.positive', 'p3.1'],
      ['p3.2', 'p2.A'],
      ['p2.K', 'p1.negative'],
      ['p1.positive', 'p5.1'],
      ['p5.2', 'p4.1'],
      ['p4.2', 'p2.G'],
    ]);
    doc = set(doc, [['p3', 'resistance', 220], ['p4', 'resistance', 1000]]);
    const session = new SimSession();
    session.load(doc, {}, [], {});
    expect(Math.abs(session.advance(0.02, 60_000).parts.p3?.i ?? 1)).toBeLessThan(1e-6);

    session.update(set(doc, [['p5', 'state', 'on']]), {});
    expect(session.advance(0.02, 60_000).parts.p3?.i).toBeGreaterThan(0.02);

    // Gate removed: it keeps conducting.
    session.update(doc, {});
    session.advance(0.02, 60_000);
    expect(session.advance(0.02, 60_000).parts.p3?.i).toBeGreaterThan(0.02);
  });

  it('a triac conducts alternating current while its gate is driven and stops after', () => {
    // Generator p1 (10 V peak, 50 Hz) -> 100 Ω p3 -> triac p2 (MT2..MT1); gate via 220 Ω p4 and switch p5.
    let doc = build(['function-generator', 'triac', 'resistor', 'resistor', 'switch-spst'], [
      ['p1.out', 'p3.1'],
      ['p3.2', 'p2.MT2'],
      ['p2.MT1', 'p1.gnd'],
      ['p2.MT2', 'p5.1'],
      ['p5.2', 'p4.1'],
      ['p4.2', 'p2.G'],
    ]);
    doc = set(doc, [
      ['p1', 'frequency', 50],
      ['p1', 'amplitude', 10],
      ['p3', 'resistance', 100],
      ['p3', 'power', 5],
      ['p4', 'resistance', 220],
      ['p4', 'power', 5],
    ]);
    const session = new SimSession();
    session.load(doc, {}, [], {});
    for (let k = 0; k < 20; k++) session.advance(0.02, 60_000);
    expect(session.advance(0.02, 60_000).parts.p3?.iRms ?? 1).toBeLessThan(0.002);

    session.update(set(doc, [['p5', 'state', 'on']]), {});
    let snapshot = session.advance(0.02, 60_000);
    for (let k = 0; k < 60; k++) snapshot = session.advance(0.02, 60_000);
    // Nearly the full sine through 150 Ω (source + load): about 45 mA RMS.
    expect(snapshot.parts.p3?.iRms).toBeGreaterThan(0.035);

    session.update(doc, {});
    for (let k = 0; k < 60; k++) snapshot = session.advance(0.02, 60_000);
    expect(snapshot.parts.p3?.iRms ?? 1).toBeLessThan(0.003);
  });
});

describe('TTL lab chips', () => {
  const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  /** Segments a 7447 lights (pulls low) for a BCD value. */
  const shown = (decoder: ReturnType<typeof chip>): string =>
    SEGMENTS.filter((segment) => decoder.out(segment) === false).join('');
  const bcd = (value: number): Record<string, 0 | 1> => ({
    A: (value & 1) as 0 | 1,
    B: ((value >> 1) & 1) as 0 | 1,
    C: ((value >> 2) & 1) as 0 | 1,
    D: ((value >> 3) & 1) as 0 | 1,
  });

  it('7447 decodes the ten digits, sinking current only', () => {
    const expected = ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'cdefg', 'abc', 'abcdefg', 'abcfg'];
    expected.forEach((segments, value) => {
      const decoder = chip('ic-7447').set(bcd(value));
      expect(shown(decoder), `digit ${value}`).toBe(segments);
      // Unlit segments are released, never driven high.
      for (const segment of SEGMENTS) expect(decoder.out(segment)).not.toBe(true);
    });
  });

  it('7447 control inputs: lamp test, blanking and zero blanking', () => {
    expect(shown(chip('ic-7447').set({ ...bcd(3), nLT: 0 }))).toBe('abcdefg');
    expect(shown(chip('ic-7447').set({ ...bcd(8), nBI: 0 }))).toBe('');
    expect(shown(chip('ic-7447').set({ ...bcd(0), nRBI: 0 }))).toBe('');
    expect(shown(chip('ic-7447').set({ ...bcd(5), nRBI: 0 }))).toBe('acdfg');
  });

  it('TTL inputs left unconnected read high', () => {
    // Only C wired (low): A, B and D float high -> 1011 = 11.
    expect(shown(chip('ic-7447').set({ C: 0 }))).toBe('cdg');
  });

  it('74163 counts, clears and loads on the clock edge only', () => {
    const counter = chip('ic-74163').set({ CLK: 0 });
    const value = (): number => parseInt(counter.bits(['QD', 'QC', 'QB', 'QA']), 2);
    counter.pulse('CLK', 5);
    expect(value()).toBe(5);
    // Clear is synchronous: nothing happens until the next edge.
    counter.set({ nCLR: 0 });
    expect(value()).toBe(5);
    counter.pulse('CLK');
    expect(value()).toBe(0);
    counter.set({ nCLR: 1, nLOAD: 0, A: 0, B: 1, C: 1, D: 1 }).pulse('CLK');
    expect(value()).toBe(14);
    counter.set({ nLOAD: 1 }).pulse('CLK');
    expect(value()).toBe(15);
    expect(counter.out('RCO')).toBe(true);
    counter.pulse('CLK');
    expect(value()).toBe(0);
    expect(counter.out('RCO')).toBe(false);
    counter.set({ ENP: 0 }).pulse('CLK', 3);
    expect(value()).toBe(0);
  });

  it('a 74163 clocked by a generator drives a 7447 and a common-anode display', () => {
    // p1 supply 5 V, p2 generator, p3 74163, p4 7447, p5 display, p6-p12 330 ohm, p13 logic probe on QA.
    const resistors = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    let doc = build(
      ['dc-supply', 'function-generator', 'ic-74163', 'ic-7447', 'seven-segment', ...resistors.map(() => 'resistor'), 'logic-probe'],
      [
        ['p1.positive', 'p3.VCC'], ['p1.negative', 'p3.GND'], ['p1.positive', 'p4.VCC'], ['p1.negative', 'p4.GND'],
        ['p2.out', 'p3.CLK'], ['p2.gnd', 'p1.negative'],
        ['p3.QA', 'p4.A'], ['p3.QB', 'p4.B'], ['p3.QC', 'p4.C'], ['p3.QD', 'p4.D'],
        ['p1.positive', 'p5.com1'],
        ...resistors.flatMap((segment, index): [string, string][] => [
          [`p4.${segment}`, `p${6 + index}.1`],
          [`p${6 + index}.2`, `p5.${segment}`],
        ]),
        ['p13.VCC', 'p1.positive'], ['p13.GND', 'p1.negative'], ['p13.TIP', 'p3.QA'],
      ],
    );
    doc = set(doc, [
      ['p1', 'voltage', 5], ['p5', 'common', 'anode'],
      ['p2', 'wave', 'square'], ['p2', 'frequency', 10], ['p2', 'amplitude', 2.5], ['p2', 'offset', 2.5],
      ...resistors.map((_, index): [string, string, number] => [`p${6 + index}`, 'resistance', 330]),
    ]);
    const session = new SimSession();
    session.load(doc, {}, [], {});
    const digits = new Set<string>();
    let pulses = 0;
    for (let k = 0; k < 60; k++) {
      const snapshot = session.advance(0.02, 60_000);
      const aux = snapshot.parts.p5?.aux ?? {};
      digits.add(resistors.filter((segment) => (aux[segment] ?? 0) > 0.004).join(''));
      pulses += snapshot.parts.p13?.aux?.pulse ?? 0;
      expect(snapshot.burned).toEqual([]);
    }
    // 1.2 s at 10 Hz: the display has shown at least 0 to 9.
    for (const pattern of ['abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'cdefg', 'abc', 'abcdefg', 'abcfg']) {
      expect(digits.has(pattern), pattern).toBe(true);
    }
    expect(pulses).toBeGreaterThan(20);
  });
});

describe('logic probe', () => {
  /** Probe p2 powered from 5 V supply p1, its tip on the adjustable supply p3. */
  const reading = (volts: number | null, family = 'ttl'): string => {
    const wires: [string, string][] = [['p1.positive', 'p2.VCC'], ['p1.negative', 'p2.GND'], ['p3.negative', 'p1.negative']];
    if (volts !== null) wires.push(['p3.positive', 'p2.TIP']);
    const doc = set(build(['dc-supply', 'logic-probe', 'dc-supply'], wires), [
      ['p1', 'voltage', 5], ['p3', 'voltage', volts ?? 1], ['p2', 'family', family],
    ]);
    const aux = run(doc).parts.p2?.aux;
    return `${aux?.high ? 'H' : ''}${aux?.low ? 'L' : ''}${aux?.pulse ? 'P' : ''}`;
  };

  it('shows high, low, or nothing for floating and in-between levels', () => {
    expect(reading(4)).toBe('H');
    expect(reading(0.3)).toBe('L');
    expect(reading(1.5)).toBe('');
    expect(reading(null)).toBe('');
    // 2.6 V is high for TTL but undefined for CMOS at 5 V.
    expect(reading(2.6)).toBe('H');
    expect(reading(2.6, 'cmos')).toBe('');
  });
});
