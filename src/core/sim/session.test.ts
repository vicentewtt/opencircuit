import { describe, expect, it } from 'vitest';
import { addPart, addWire, setPartProp } from '../../editor/model/ops';
import { EMPTY_DOC, type CircuitDoc } from '../../editor/model/types';
import { buildNetlist, pinKey } from './netlist';
import { SimSession } from './session';
import type { SimInputs } from './types';

/** Builds a document from part types (ids p1, p2, ... in order) and pin-to-pin wires. */
function build(types: string[], wires: [string, string][]): CircuitDoc {
  let doc = EMPTY_DOC;
  types.forEach((type, index) => {
    doc = addPart(doc, type, { x: index * 100, y: 0 }).doc;
  });
  for (const [from, to] of wires) {
    const [fromPart = '', fromPin = ''] = from.split('.');
    const [toPart = '', toPin = ''] = to.split('.');
    const result = addWire(
      doc,
      { partId: fromPart, pinId: fromPin },
      { partId: toPart, pinId: toPin },
      [],
      '#000000',
    );
    if (!result) throw new Error(`bad wire ${from} -> ${to}`);
    doc = result.doc;
  }
  return doc;
}

function run(doc: CircuitDoc, seconds: number, inputs: SimInputs = {}) {
  const session = new SimSession();
  session.load(doc, inputs, [], {});
  let snapshot = session.snapshot();
  // Advance in frame-sized chunks like the UI does.
  for (let t = 0; t < seconds; t += 0.02) snapshot = session.advance(0.02, 10_000);
  return { session, snapshot };
}

/** Battery p1, resistor p2, LED p3 in series. */
const ledCircuit = (): CircuitDoc =>
  build(
    ['battery-9v', 'resistor', 'led'],
    [
      ['p1.positive', 'p2.1'],
      ['p2.2', 'p3.anode'],
      ['p3.cathode', 'p1.negative'],
    ],
  );

describe('netlist', () => {
  it('merges pins connected by wires into nodes', () => {
    const netlist = buildNetlist(ledCircuit(), {}, new Set());
    expect(netlist.pinNode.get(pinKey('p1', 'positive'))).toBe(netlist.pinNode.get(pinKey('p2', '1')));
    expect(netlist.pinNode.get(pinKey('p2', '2'))).toBe(netlist.pinNode.get(pinKey('p3', 'anode')));
    // The battery's negative terminal is the ground reference.
    expect(netlist.pinNode.get(pinKey('p1', 'negative'))).toBe(0);
    expect(netlist.pinNode.get(pinKey('p3', 'cathode'))).toBe(0);
    // ground, emf (internal), positive, anode
    expect(netlist.nodeCount).toBe(4);
  });

  it('leaves burned parts out', () => {
    const netlist = buildNetlist(ledCircuit(), {}, new Set(['p3']));
    expect(netlist.elements.some((element) => element.partId === 'p3')).toBe(false);
  });

  it('joins bridged pins of a pushbutton', () => {
    const doc = build(['pushbutton', 'resistor'], [['p1.1a', 'p2.1'], ['p1.1b', 'p2.2']]);
    const netlist = buildNetlist(doc, {}, new Set());
    // Both resistor ends land on the same net, so the resistor is shorted.
    expect(netlist.pinNode.get(pinKey('p2', '1'))).toBe(netlist.pinNode.get(pinKey('p2', '2')));
  });
});

describe('simulation session', () => {
  it('lights an LED through its resistor without burning it', () => {
    const { snapshot } = run(ledCircuit(), 1);
    expect(snapshot.converged).toBe(true);
    expect(snapshot.burned).toEqual([]);
    const ledState = snapshot.parts.p3;
    // (9 V − ~2 V) / (220 Ω + 1.5 Ω internal) ≈ 32 mA
    expect(ledState?.i).toBeGreaterThan(0.028);
    expect(ledState?.i).toBeLessThan(0.034);
    expect(ledState?.v).toBeGreaterThan(1.8);
    expect(ledState?.v).toBeLessThan(2.1);
    expect(snapshot.parts.p2?.i).toBeCloseTo(ledState?.i ?? 0, 7);
    expect(snapshot.time).toBeCloseTo(1, 6);
  });

  it('a reversed LED does not conduct', () => {
    const doc = build(
      ['battery-9v', 'resistor', 'led'],
      [
        ['p1.positive', 'p2.1'],
        ['p2.2', 'p3.cathode'],
        ['p3.anode', 'p1.negative'],
      ],
    );
    const { snapshot } = run(doc, 0.1);
    expect(Math.abs(snapshot.parts.p3?.i ?? 1)).toBeLessThan(1e-6);
    expect(snapshot.burned).toEqual([]);
  });

  it('burns an LED connected without a resistor and reports why', () => {
    const doc = build(
      ['battery-9v', 'led'],
      [
        ['p1.positive', 'p2.anode'],
        ['p2.cathode', 'p1.negative'],
      ],
    );
    const { snapshot } = run(doc, 0.1);
    expect(snapshot.burned).toHaveLength(1);
    const fault = snapshot.burned[0];
    expect(fault).toMatchObject({ partId: 'p2', cause: 'led-overcurrent', limit: 0.05, unit: 'A' });
    expect(fault?.value).toBeGreaterThan(1);
    // Once burned the LED is an open circuit.
    expect(Math.abs(snapshot.parts.p1?.i ?? 1)).toBeLessThan(1e-6);
  });

  it('burns a resistor that dissipates too much power', () => {
    let doc = build(
      ['battery-9v', 'resistor'],
      [
        ['p1.positive', 'p2.1'],
        ['p2.2', 'p1.negative'],
      ],
    );
    doc = setPartProp(doc, 'p2', 'resistance', 10);
    const { snapshot } = run(doc, 0.5);
    // 9 V over 11.5 Ω: 0.78 A, about 6 W in a 0.25 W resistor.
    expect(snapshot.burned[0]).toMatchObject({ partId: 'p2', cause: 'overpower', unit: 'W' });
  });

  it('survives a small overload for a while before failing', () => {
    let doc = build(
      ['battery-9v', 'resistor'],
      [
        ['p1.positive', 'p2.1'],
        ['p2.2', 'p1.negative'],
      ],
    );
    // 9 V over 251.5 Ω: 0.32 W, 28 % over the rating.
    doc = setPartProp(doc, 'p2', 'resistance', 250);
    expect(run(doc, 0.1).snapshot.burned).toEqual([]);
    expect(run(doc, 3).snapshot.burned).toHaveLength(1);
  });

  it('a fuse protects the circuit and the battery warns about the short', () => {
    const doc = build(
      ['battery-9v', 'fuse'],
      [
        ['p1.positive', 'p2.1'],
        ['p2.2', 'p1.negative'],
      ],
    );
    const session = new SimSession();
    session.load(doc, {}, [], {});
    const first = session.advance(0.001, 10_000);
    expect(first.burned[0]).toMatchObject({ partId: 'p2', cause: 'fuse-blown', limit: 0.5 });
    const later = session.advance(0.02, 10_000);
    expect(later.warnings).toEqual([]);
    expect(Math.abs(later.parts.p1?.i ?? 1)).toBeLessThan(1e-6);
  });

  it('warns about a short-circuited battery without burning it', () => {
    const doc = build(['battery-9v'], [['p1.positive', 'p1.negative']]);
    const { snapshot } = run(doc, 0.1);
    expect(snapshot.burned).toEqual([]);
    expect(snapshot.warnings[0]).toMatchObject({ partId: 'p1', cause: 'short-circuit' });
    expect(snapshot.warnings[0]?.value).toBeCloseTo(6, 3);
  });

  it('burns a reversed electrolytic capacitor', () => {
    const doc = build(
      ['battery-9v', 'capacitor-electrolytic'],
      [
        ['p1.positive', 'p2.negative'],
        ['p2.positive', 'p1.negative'],
      ],
    );
    const { snapshot } = run(doc, 0.1);
    expect(snapshot.burned[0]).toMatchObject({ partId: 'p2', cause: 'reverse-polarity' });
  });

  it('a pushbutton closes the circuit only while pressed', () => {
    const doc = build(
      ['battery-9v', 'resistor', 'led', 'pushbutton'],
      [
        ['p1.positive', 'p4.1a'],
        ['p4.2a', 'p2.1'],
        ['p2.2', 'p3.anode'],
        ['p3.cathode', 'p1.negative'],
      ],
    );
    const session = new SimSession();
    session.load(doc, {}, [], {});
    expect(Math.abs(session.advance(0.02, 10_000).parts.p3?.i ?? 1)).toBeLessThan(1e-6);
    session.update(doc, { p4: { pressed: 1 } });
    expect(session.advance(0.02, 10_000).parts.p3?.i).toBeGreaterThan(0.02);
    session.update(doc, {});
    expect(Math.abs(session.advance(0.02, 10_000).parts.p3?.i ?? 1)).toBeLessThan(1e-6);
  });

  it('a capacitor keeps its charge when the circuit is rewired', () => {
    // Battery charges the capacitor through a resistor and a pushbutton.
    let doc = build(
      ['battery-9v', 'resistor', 'capacitor-electrolytic', 'pushbutton'],
      [
        ['p1.positive', 'p4.1a'],
        ['p4.2a', 'p2.1'],
        ['p2.2', 'p3.positive'],
        ['p3.negative', 'p1.negative'],
      ],
    );
    doc = setPartProp(doc, 'p2', 'resistance', 1000);
    doc = setPartProp(doc, 'p3', 'capacitance', 10e-6);
    const session = new SimSession();
    session.load(doc, {}, [], {});
    session.update(doc, { p4: { pressed: 1 } });
    // τ = 1001.5 Ω · 10 µF ≈ 10 ms; after 10 ms the capacitor is at 63 %.
    // Measurements are averages over the interval, so read over a single short step.
    session.advance(0.010015 - 50e-6, 10_000);
    const charging = session.advance(50e-6, 10_000);
    expect(charging.parts.p3?.v).toBeGreaterThan(9 * 0.62);
    expect(charging.parts.p3?.v).toBeLessThan(9 * 0.645);
    session.advance(0.2, 10_000);
    session.update(doc, {});
    const holding = session.advance(0.1, 10_000);
    expect(holding.parts.p3?.v).toBeCloseTo(9, 2);
  });

  it('repairing restores a burned part', () => {
    const doc = build(
      ['battery-9v', 'led'],
      [
        ['p1.positive', 'p2.anode'],
        ['p2.cathode', 'p1.negative'],
      ],
    );
    const { session, snapshot } = run(doc, 0.1);
    expect(snapshot.burned).toHaveLength(1);
    // Fix the circuit conceptually by lowering the voltage, then repair.
    const safe = setPartProp(doc, 'p1', 'voltage', 1.8);
    session.update(safe, {});
    session.repair(null);
    const after = session.advance(0.1, 10_000);
    expect(after.burned).toEqual([]);
    expect(after.parts.p2?.i).toBeGreaterThan(0);
  });

  it('keeps previously burned parts open when loading', () => {
    const session = new SimSession();
    session.load(
      ledCircuit(),
      {},
      [{ partId: 'p3', cause: 'led-overcurrent', value: 1, limit: 0.05, unit: 'A' }],
      {},
    );
    const snapshot = session.advance(0.02, 10_000);
    expect(snapshot.burned).toHaveLength(1);
    expect(Math.abs(snapshot.parts.p2?.i ?? 1)).toBeLessThan(1e-6);
  });

  it('handles empty and unconnected circuits', () => {
    expect(run(EMPTY_DOC, 0.04).snapshot.converged).toBe(true);
    const lonely = run(build(['resistor', 'led', 'bjt-npn'], []), 0.04).snapshot;
    expect(lonely.converged).toBe(true);
    expect(lonely.parts.p1?.i).toBeCloseTo(0, 12);
  });

  it('an NPN transistor switches an LED from a pushbutton', () => {
    // Battery p1, LED p2 + 330 Ω p3 on the collector, 10 kΩ p4 into the base via button p5.
    let doc = build(
      ['battery-9v', 'led', 'resistor', 'resistor', 'pushbutton', 'bjt-npn'],
      [
        ['p1.positive', 'p3.1'],
        ['p3.2', 'p2.anode'],
        ['p2.cathode', 'p6.c'],
        ['p6.e', 'p1.negative'],
        ['p1.positive', 'p5.1a'],
        ['p5.2a', 'p4.1'],
        ['p4.2', 'p6.b'],
      ],
    );
    doc = setPartProp(doc, 'p3', 'resistance', 330);
    doc = setPartProp(doc, 'p4', 'resistance', 10e3);
    const session = new SimSession();
    session.load(doc, {}, [], {});
    const off = session.advance(0.02, 10_000);
    expect(off.converged).toBe(true);
    expect(Math.abs(off.parts.p2?.i ?? 1)).toBeLessThan(1e-6);
    session.update(doc, { p5: { pressed: 1 } });
    const on = session.advance(0.02, 10_000);
    expect(on.converged).toBe(true);
    // Saturated: (9 − 2 − Vce) / 331.5 ≈ 21 mA.
    expect(on.parts.p2?.i).toBeGreaterThan(0.019);
    expect(on.parts.p2?.i).toBeLessThan(0.022);
    expect(on.parts.p6?.v).toBeLessThan(0.3);
    expect(on.burned).toEqual([]);
  });
});
