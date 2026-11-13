import { describe, expect, it } from 'vitest';
import { SimSession } from '../core/sim/session';
import type { SimInputs, SimSnapshot } from '../core/sim/types';
import { addPart, addWire, setPartProp } from '../editor/model/ops';
import { EMPTY_DOC, type CircuitDoc } from '../editor/model/types';
import { PART_DEFS } from './registry';

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

/** A running circuit that can be advanced, edited and operated. */
function simulation(doc: CircuitDoc) {
  const session = new SimSession();
  session.load(doc, {}, [], {});
  let current = doc;
  let inputs: SimInputs = {};
  let snapshot: SimSnapshot = session.snapshot();
  const api = {
    run(seconds: number) {
      for (let t = 0; t < seconds - 1e-9; t += 0.02) snapshot = session.advance(0.02, 60_000);
      return api;
    },
    /** Holds a control (true) or lets it go (false). */
    hold(partId: string, held: boolean) {
      inputs = { ...inputs, [partId]: { pressed: held ? 1 : 0, reset: held ? 1 : 0 } };
      session.update(current, inputs);
      return api;
    },
    change(changes: [string, string, number | string][]) {
      current = set(current, changes);
      session.update(current, inputs);
      return api;
    },
    get parts() {
      return snapshot.parts;
    },
    get snapshot() {
      return snapshot;
    },
  };
  return api;
}

describe('phase 6a catalog', () => {
  it('has the industrial parts', () => {
    const types = new Set(PART_DEFS.map((def) => def.type));
    for (const type of [
      'ac-source-1ph', 'ac-source-3ph', 'power-supply-24v', 'contactor', 'thermal-overload',
      'mcb-1p', 'mcb-3p', 'rcd-2p', 'button-start', 'button-stop', 'emergency-stop', 'selector-switch',
      'limit-switch', 'pilot-lamp', 'timer-relay', 'proximity-sensor', 'motor-3ph', 'motor-1ph',
    ]) {
      expect(types.has(type), type).toBe(true);
    }
    expect(PART_DEFS.length).toBeGreaterThanOrEqual(108);
  });
});

describe('AC supplies', () => {
  it('single-phase mains gives 220 V RMS at 50 Hz', () => {
    const sim = simulation(build(['ac-source-1ph', 'pilot-lamp'], [['p1.L', 'p2.X1'], ['p1.N', 'p2.X2']])).run(0.6);
    // The meter average still ripples a little at 50 Hz.
    expect(sim.parts.p2?.vRms).toBeGreaterThan(208);
    expect(sim.parts.p2?.vRms).toBeLessThan(230);
    expect(Math.abs(sim.parts.p2?.vMean ?? 99)).toBeLessThan(8);
    expect(sim.snapshot.burned).toEqual([]);
  });

  it('three-phase mains gives 380 V between lines and 220 V to neutral', () => {
    const doc = set(
      build(['ac-source-3ph', 'resistor', 'resistor'], [
        ['p1.L1', 'p2.1'], ['p2.2', 'p1.L2'], ['p1.L3', 'p3.1'], ['p3.2', 'p1.N'],
      ]),
      [['p2', 'resistance', 100e3], ['p2', 'power', 5], ['p3', 'resistance', 100e3], ['p3', 'power', 5]],
    );
    const sim = simulation(doc).run(0.6);
    expect(sim.parts.p2?.vRms).toBeGreaterThan(362);
    expect(sim.parts.p2?.vRms).toBeLessThan(396);
    expect(sim.parts.p3?.vRms).toBeGreaterThan(208);
    expect(sim.parts.p3?.vRms).toBeLessThan(230);
  });

  it('a 24 V supply feeds a sensor that switches a lamp', () => {
    // Mains p1 -> supply p2; sensor p3 output drives 24 V lamp p4.
    const doc = set(
      build(['ac-source-1ph', 'power-supply-24v', 'proximity-sensor', 'pilot-lamp'], [
        ['p1.L', 'p2.L'], ['p1.N', 'p2.N'],
        ['p2.+24', 'p3.BN'], ['p2.0V', 'p3.BU'], ['p3.BK', 'p4.X1'], ['p4.X2', 'p2.0V'],
      ]),
      [['p4', 'voltage', '24']],
    );
    const sim = simulation(doc).run(0.4);
    expect(Math.abs(sim.parts.p4?.v ?? 9)).toBeLessThan(0.1);
    sim.change([['p3', 'target', 'yes']]).run(1);
    expect(sim.parts.p4?.vRms).toBeGreaterThan(23);
    expect(sim.snapshot.burned).toEqual([]);
  });
});

describe('contactor control', () => {
  /**
   * Start/stop with self-holding: L -> stop p3 -> (start p4 parallel with
   * auxiliary 13-14 of contactor p2) -> coil -> N. Pole 1 switches lamp p5.
   */
  const latch = (): CircuitDoc =>
    build(['ac-source-1ph', 'contactor', 'button-stop', 'button-start', 'pilot-lamp'], [
      ['p1.L', 'p3.11'], ['p3.12', 'p4.13'], ['p4.14', 'p2.A1'], ['p2.A2', 'p1.N'],
      ['p3.12', 'p2.13'], ['p2.14', 'p2.A1'],
      ['p1.L', 'p2.1L1'], ['p2.2T1', 'p5.X1'], ['p5.X2', 'p1.N'],
    ]);

  it('holds itself after start and drops with stop', () => {
    const sim = simulation(latch()).run(0.3);
    expect(sim.parts.p2?.aux?.on).toBe(0);
    expect(sim.parts.p5?.vRms ?? 9).toBeLessThan(1);

    sim.hold('p4', true).run(0.3).hold('p4', false).run(0.5);
    expect(sim.parts.p2?.aux?.on).toBe(1);
    expect(sim.parts.p5?.vRms).toBeGreaterThan(210);

    sim.hold('p3', true).run(0.3).hold('p3', false).run(1.2);
    expect(sim.parts.p2?.aux?.on).toBe(0);
    expect(sim.parts.p5?.vRms ?? 99).toBeLessThan(25);
  });

  it('a 24 V DC coil does not pull in at 12 V and burns at 220 V', () => {
    const coil = (): CircuitDoc =>
      set(build(['dc-supply', 'contactor'], [['p1.positive', 'p2.A1'], ['p1.negative', 'p2.A2']]), [['p2', 'coil', '24dc']]);
    expect(simulation(set(coil(), [['p1', 'voltage', 12]])).run(0.2).parts.p2?.aux?.on).toBe(0);
    expect(simulation(set(coil(), [['p1', 'voltage', 24]])).run(0.2).parts.p2?.aux?.on).toBe(1);
    const mains = set(build(['ac-source-1ph', 'contactor'], [['p1.L', 'p2.A1'], ['p1.N', 'p2.A2']]), [['p2', 'coil', '24dc']]);
    expect(simulation(mains).run(1).snapshot.burned.map((info) => info.partId)).toEqual(['p2']);
  });

  it('an on-delay timer closes 15-18 after its time, an off-delay one holds it', () => {
    const timer = (mode: string): CircuitDoc =>
      set(
        build(['ac-source-1ph', 'timer-relay', 'selector-switch', 'pilot-lamp'], [
          ['p1.L', 'p3.13'], ['p3.14', 'p2.A1'], ['p2.A2', 'p1.N'],
          ['p1.L', 'p2.15'], ['p2.18', 'p4.X1'], ['p4.X2', 'p1.N'],
        ]),
        [['p2', 'mode', mode], ['p2', 'delay', 1]],
      );
    const on = simulation(timer('on-delay')).change([['p3', 'state', 'on']]).run(0.7);
    expect(on.parts.p4?.vRms ?? 9).toBeLessThan(5);
    expect(on.run(0.8).parts.p4?.vRms).toBeGreaterThan(200);

    const off = simulation(timer('off-delay')).change([['p3', 'state', 'on']]).run(0.5);
    expect(off.parts.p4?.vRms).toBeGreaterThan(200);
    off.change([['p3', 'state', 'off']]).run(0.6);
    expect(off.parts.p2?.aux?.out).toBe(1);
    expect(off.run(0.8).parts.p2?.aux?.out).toBe(0);
  });
});

describe('protections', () => {
  it('a breaker trips at once on a short circuit and must be reset by hand', () => {
    // Mains p1 -> breaker p2 -> dead short back to neutral through switch p3.
    const doc = build(['ac-source-1ph', 'mcb-1p', 'selector-switch'], [
      ['p1.L', 'p2.1'], ['p2.2', 'p3.13'], ['p3.14', 'p1.N'],
    ]);
    const sim = simulation(doc).run(0.1);
    expect(sim.parts.p2?.aux?.closed).toBe(1);
    sim.change([['p3', 'state', 'on']]).run(0.1);
    expect(sim.parts.p2?.aux?.tripped).toBe(1);
    expect(sim.parts.p2?.aux?.closed).toBe(0);
    expect(sim.snapshot.burned).toEqual([]);

    // With the fault removed it stays open until switched off and on.
    sim.change([['p3', 'state', 'off']]).run(0.1);
    expect(sim.parts.p2?.aux?.closed).toBe(0);
    sim.change([['p2', 'state', 'off']]).run(0.04).change([['p2', 'state', 'on']]).run(0.1);
    expect(sim.parts.p2?.aux?.closed).toBe(1);
  });

  it('a breaker carries a small overload and trips on a large one', () => {
    // 2 A breaker p2: motor p3 draws 2.5 A; closing p6 adds motors p4 and p5 (7.5 A in all).
    const doc = set(
      build(['ac-source-1ph', 'mcb-1p', 'motor-1ph', 'motor-1ph', 'motor-1ph', 'selector-switch'], [
        ['p1.L', 'p2.1'], ['p2.2', 'p3.L'], ['p3.N', 'p1.N'],
        ['p2.2', 'p6.13'], ['p6.14', 'p4.L'], ['p4.N', 'p1.N'], ['p6.14', 'p5.L'], ['p5.N', 'p1.N'],
      ]),
      [['p2', 'rating', '2']],
    );
    const sim = simulation(doc).run(4);
    expect(sim.parts.p2?.aux?.closed).toBe(1);
    expect(sim.parts.p3?.iRms).toBeGreaterThan(2.3);
    sim.change([['p6', 'state', 'on']]).run(0.3);
    expect(sim.parts.p2?.aux?.closed).toBe(1);
    sim.run(1.2);
    expect(sim.parts.p2?.aux?.tripped).toBe(1);
  });

  it('a residual-current device ignores the load and trips on a leak to earth', () => {
    // Load p3 (1 kΩ) between line and neutral; leak p4 (4.7 kΩ) from line to PE through switch p5.
    const doc = set(
      build(['ac-source-1ph', 'rcd-2p', 'resistor', 'resistor', 'selector-switch'], [
        ['p1.L', 'p2.1'], ['p1.N', 'p2.N'],
        ['p2.2', 'p3.1'], ['p3.2', 'p2.N2'],
        ['p2.2', 'p5.13'], ['p5.14', 'p4.1'], ['p4.2', 'p1.PE'],
      ]),
      [['p3', 'resistance', 1000], ['p3', 'power', 100], ['p4', 'resistance', 4700], ['p4', 'power', 100]],
    );
    const sim = simulation(doc).run(0.3);
    expect(sim.parts.p2?.aux?.closed).toBe(1);
    expect(sim.parts.p3?.vRms).toBeGreaterThan(180);
    sim.change([['p5', 'state', 'on']]).run(0.2);
    expect(sim.parts.p2?.aux?.tripped).toBe(1);
    expect(sim.run(1).parts.p3?.vRms ?? 99).toBeLessThan(25);
  });

  it('a thermal relay opens 95-96 on overload and resets once cool', () => {
    // Motor p3 (2.5 A) through relay p2 set to 1 A, switched by p5; lamp p4 wired through 95-96.
    const doc = set(
      build(['ac-source-1ph', 'thermal-overload', 'motor-1ph', 'pilot-lamp', 'selector-switch'], [
        ['p1.L', 'p5.13'], ['p5.14', 'p2.1L1'], ['p2.2T1', 'p3.L'], ['p3.N', 'p1.N'],
        ['p1.L', 'p2.95'], ['p2.96', 'p4.X1'], ['p4.X2', 'p1.N'],
      ]),
      [['p2', 'setting', 1], ['p5', 'state', 'on']],
    );
    const sim = simulation(doc).run(0.6);
    expect(sim.parts.p2?.aux?.tripped).toBe(0);
    expect(sim.parts.p4?.vRms).toBeGreaterThan(190);
    sim.run(2);
    expect(sim.parts.p2?.aux?.tripped).toBe(1);
    expect(sim.run(1).parts.p4?.vRms ?? 9).toBeLessThan(5);
    // Still hot: the reset button does nothing yet.
    sim.hold('p2', true).run(0.1).hold('p2', false);
    expect(sim.parts.p2?.aux?.tripped).toBe(1);
    sim.change([['p5', 'state', 'off']]).run(25).hold('p2', true).run(0.1).hold('p2', false).run(0.1);
    expect(sim.parts.p2?.aux?.tripped).toBe(0);
  }, 60_000);
});

describe('motors', () => {
  const STAR: [string, string][] = [['p2.W2', 'p2.U2'], ['p2.U2', 'p2.V2']];
  const DELTA: [string, string][] = [['p2.U1', 'p2.W2'], ['p2.V1', 'p2.U2'], ['p2.W1', 'p2.V2']];
  const direct: [string, string][] = [['p1.L1', 'p2.U1'], ['p1.L2', 'p2.V1'], ['p1.L3', 'p2.W1']];
  const motor = (wires: [string, string][]) => build(['ac-source-3ph', 'motor-3ph'], wires);

  it('a three-phase motor in star runs near 1450 rpm at its rated current', () => {
    const sim = simulation(motor([...direct, ...STAR])).run(3);
    expect(sim.parts.p2?.aux?.rpm).toBeGreaterThan(1400);
    expect(sim.parts.p2?.aux?.rpm).toBeLessThan(1500);
    expect(sim.parts.p2?.iRms).toBeGreaterThan(1.8);
    expect(sim.parts.p2?.iRms).toBeLessThan(2);
    expect(sim.snapshot.burned).toEqual([]);
  });

  it('swapping two phases reverses it', () => {
    const swapped: [string, string][] = [['p1.L2', 'p2.U1'], ['p1.L1', 'p2.V1'], ['p1.L3', 'p2.W1']];
    expect(simulation(motor([...swapped, ...STAR])).run(3).parts.p2?.aux?.rpm).toBeLessThan(-1400);
  });

  it('with a phase missing it does not start', () => {
    const sim = simulation(motor([['p1.L1', 'p2.U1'], ['p1.L2', 'p2.V1'], ...STAR])).run(2);
    expect(Math.abs(sim.parts.p2?.aux?.rpm ?? 9999)).toBeLessThan(60);
  });

  it('220 V windings in delta on 380 V burn; 380 V windings run', () => {
    expect(simulation(motor([...direct, ...DELTA])).run(8).snapshot.burned.map((info) => info.partId)).toEqual(['p2']);
    const right = simulation(set(motor([...direct, ...DELTA]), [['p2', 'winding', '380']])).run(3);
    expect(right.snapshot.burned).toEqual([]);
    expect(right.parts.p2?.aux?.rpm).toBeGreaterThan(1400);
  }, 60_000);

  it('a single-phase motor runs from 220 V', () => {
    const sim = simulation(build(['ac-source-1ph', 'motor-1ph'], [['p1.L', 'p2.L'], ['p1.N', 'p2.N']])).run(3);
    expect(sim.parts.p2?.aux?.rpm).toBeGreaterThan(1380);
    expect(sim.parts.p2?.iRms).toBeGreaterThan(2.3);
  });
});

describe('phase 6b: meters and drive', () => {
  it('panel meters and the wattmeter read a 220 V motor', () => {
    // Mains p1 -> wattmeter p2 -> ammeter p3 -> motor p4; voltmeter p5 across the motor.
    const doc = build(['ac-source-1ph', 'wattmeter', 'panel-ammeter', 'motor-1ph', 'panel-voltmeter'], [
      ['p1.L', 'p2.L'], ['p1.N', 'p2.N'], ['p2.OUT', 'p3.1'], ['p3.2', 'p4.L'], ['p4.N', 'p1.N'],
      ['p4.L', 'p5.1'], ['p4.N', 'p5.2'],
    ]);
    const sim = simulation(doc).run(1.5);
    expect(sim.parts.p3?.aux?.value).toBeGreaterThan(2.4);
    expect(sim.parts.p3?.aux?.value).toBeLessThan(2.6);
    expect(sim.parts.p5?.aux?.value).toBeGreaterThan(214);
    expect(sim.parts.p5?.aux?.value).toBeLessThan(226);
    const meter = sim.parts.p2?.aux;
    // 220 V x 2.5 A on a resistive load: about 550 W with power factor 1.
    expect(meter?.watts).toBeGreaterThan(520);
    expect(meter?.watts).toBeLessThan(580);
    expect(meter?.factor).toBeGreaterThan(0.97);
    expect(meter?.wh).toBeGreaterThan(0.15);
    expect(meter?.wh).toBeLessThan(0.26);
  });

  it('an ammeter also reads direct current', () => {
    const doc = set(
      build(['dc-supply', 'panel-ammeter', 'resistor'], [['p1.positive', 'p2.1'], ['p2.2', 'p3.1'], ['p3.2', 'p1.negative']]),
      [['p1', 'voltage', 12], ['p3', 'resistance', 100], ['p3', 'power', 5]],
    );
    expect(simulation(doc).run(0.5).parts.p2?.aux?.value).toBeCloseTo(0.12, 3);
  });

  /** Mains p1 -> drive p2 -> motor p3 in star; selectors p4 (forward) and p5 (reverse) from the drive's 24 V. */
  const drive = (): CircuitDoc =>
    build(['ac-source-3ph', 'vfd', 'motor-3ph', 'selector-switch', 'selector-switch'], [
      ['p1.L1', 'p2.L1'], ['p1.L2', 'p2.L2'], ['p1.L3', 'p2.L3'],
      ['p2.U', 'p3.U1'], ['p2.V', 'p3.V1'], ['p2.W', 'p3.W1'], ['p3.W2', 'p3.U2'], ['p3.U2', 'p3.V2'],
      ['p2.24V', 'p4.13'], ['p4.14', 'p2.DI1'], ['p2.24V', 'p5.13'], ['p5.14', 'p2.DI2'],
    ]);

  it('a drive ramps the motor up to the chosen frequency and reverses it', () => {
    const sim = simulation(set(drive(), [['p2', 'frequency', 25]])).run(1);
    expect(Math.abs(sim.parts.p3?.aux?.rpm ?? 9)).toBeLessThan(1);

    sim.change([['p4', 'state', 'on']]).run(0.5);
    // Half a second into a 2 s ramp to 50 Hz: 12.5 Hz.
    expect(sim.parts.p2?.aux?.hertz).toBeCloseTo(12.5, 0);
    sim.run(3);
    expect(sim.parts.p2?.aux?.hertz).toBeCloseTo(25, 3);
    expect(sim.parts.p3?.aux?.rpm).toBeGreaterThan(690);
    expect(sim.parts.p3?.aux?.rpm).toBeLessThan(740);

    sim.change([['p4', 'state', 'off'], ['p5', 'state', 'on'], ['p2', 'frequency', 50]]).run(6);
    expect(sim.parts.p2?.aux?.hertz).toBeCloseTo(-50, 3);
    expect(sim.parts.p3?.aux?.rpm).toBeLessThan(-1400);
    expect(sim.snapshot.burned).toEqual([]);
  }, 60_000);

  it('a potentiometer on the analog input sets the speed', () => {
    // Potentiometer p6 between the drive's 10 V and COM, wiper to AI.
    const base = drive();
    const withPot = build(
      ['ac-source-3ph', 'vfd', 'motor-3ph', 'selector-switch', 'selector-switch', 'potentiometer'],
      [
        ...base.wires.map((wire): [string, string] => [`${wire.from.partId}.${wire.from.pinId}`, `${wire.to.partId}.${wire.to.pinId}`]),
        ['p2.10V', 'p6.1'], ['p6.wiper', 'p2.AI'], ['p6.2', 'p2.COM'],
      ],
    );
    const sim = simulation(set(withPot, [['p2', 'reference', 'analog'], ['p4', 'state', 'on']])).run(4);
    const hertz = sim.parts.p2?.aux?.hertz ?? 0;
    expect(hertz).toBeGreaterThan(5);
    expect(hertz).toBeLessThan(48);
    expect(sim.parts.p3?.aux?.rpm).toBeCloseTo(hertz * 30 * 0.967, -1);
  }, 60_000);
});
