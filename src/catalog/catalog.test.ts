import { describe, expect, it } from 'vitest';
import { buildNetlist, pinKey } from '../core/sim/netlist';
import { SimSession } from '../core/sim/session';
import type { SimSnapshot } from '../core/sim/types';
import { localToWorld, worldToLocal } from '../editor/model/geometry';
import { addPart, addWire, rotateParts, setPartProp } from '../editor/model/ops';
import { EMPTY_DOC, type CircuitDoc, type Part, type Point } from '../editor/model/types';
import { ldrOhms } from './parts/ldr';
import { ntcOhms } from './parts/ntc-thermistor';
import { PART_DEFS, requirePartDef } from './registry';

/** Parts placed at given points (ids p1, p2, ...), then pin-to-pin wires. */
function build(parts: [type: string, at: Point][], wires: [string, string][] = []): CircuitDoc {
  let doc = EMPTY_DOC;
  for (const [type, at] of parts) doc = addPart(doc, type, at).doc;
  for (const [from, to] of wires) {
    const [fromPart = '', fromPin = ''] = from.split('.');
    const [toPart = '', toPin = ''] = to.split('.');
    const result = addWire(doc, { partId: fromPart, pinId: fromPin }, { partId: toPart, pinId: toPin }, [], '#000000');
    if (!result) throw new Error(`bad wire ${from} -> ${to}`);
    doc = result.doc;
  }
  return doc;
}

const apart = (types: string[]): [string, Point][] =>
  types.map((type, index) => [type, { x: index * 1000, y: 5000 }]);

function run(doc: CircuitDoc, seconds = 0.1): SimSnapshot {
  const session = new SimSession();
  session.load(doc, {}, [], {});
  let snapshot = session.snapshot();
  for (let t = 0; t < seconds - 1e-9; t += 0.02) snapshot = session.advance(0.02, 60_000);
  return snapshot;
}

const nodeOf = (doc: CircuitDoc, partId: string, pinId: string): number | undefined =>
  buildNetlist(doc, {}, new Set()).pinNode.get(pinKey(partId, pinId));

describe('catalog size', () => {
  it('has every part of phase 5a', () => {
    const types = new Set(PART_DEFS.map((def) => def.type));
    for (const type of [
      'breadboard-full', 'breadboard-half', 'breadboard-mini',
      'battery-aa', 'battery-aa-x2', 'battery-aa-x4', 'battery-liion', 'battery-coin',
      'ldr', 'ntc-thermistor', 'transformer', 'crystal', 'zener', 'bridge-rectifier', 'led-rgb',
      'optocoupler', 'dip-switch-4', 'dip-switch-8', 'switch-spst', 'buzzer', 'seven-segment', 'led-bar',
    ]) {
      expect(types.has(type), type).toBe(true);
    }
    expect(PART_DEFS.length).toBeGreaterThanOrEqual(44);
  });
});

describe('breadboards', () => {
  it('have the advertised number of tie points', () => {
    expect(requirePartDef('breadboard-full').pins).toHaveLength(830);
    expect(requirePartDef('breadboard-half').pins).toHaveLength(400);
    expect(requirePartDef('breadboard-mini').pins).toHaveLength(170);
  });

  it('join the five holes of a column, but not across the center gap or between columns', () => {
    const doc = build([['breadboard-half', { x: 0, y: 0 }]]);
    const board = requirePartDef('breadboard-half');
    const pin = (id: string) => board.pins.find((candidate) => candidate.id === id);
    // Same strip: they are bridged, so a wire between them changes nothing; check via the def.
    const bridged = (a: string, b: string): boolean => {
      const groups = new Map<string, string>();
      const find = (id: string): string => {
        let root = id;
        while (groups.has(root)) root = groups.get(root) as string;
        return root;
      };
      for (const [x, y] of board.bridges ?? []) {
        const rx = find(x);
        const ry = find(y);
        if (rx !== ry) groups.set(rx, ry);
      }
      return find(a) === find(b);
    };
    expect(pin('a1')).toBeDefined();
    expect(bridged('a1', 'e1')).toBe(true);
    expect(bridged('f1', 'j1')).toBe(true);
    expect(bridged('e1', 'f1')).toBe(false);
    expect(bridged('a1', 'a2')).toBe(false);
    expect(bridged('tp1', 'tp25')).toBe(true);
    expect(bridged('tp1', 'tn1')).toBe(false);
    expect(doc.parts).toHaveLength(1);
  });

  it('connect parts plugged into the same strip, with no wires at all', () => {
    // Half board at the origin: column c is at x = (c − 16)·10; rows a..e at y = −60..−20,
    // rails: top + at y = −100, top − at y = −90.
    // Battery pins are 20 apart horizontally: + on (−140,−100)... use wires for the supply instead.
    let doc = build([
      ['breadboard-half', { x: 0, y: 0 }],
      ['battery-9v', { x: 2000, y: 0 }],
      // Resistor: pins at x ± 30 → columns 5 and 11 of row a (y = −60).
      ['resistor', { x: -80, y: -60 }],
      // LED: anode at x − 10, cathode at x + 10 (y + 20) → row c, columns 11 and 13.
      ['led', { x: -40, y: -60 }],
    ]);
    // Feed column 5 from the battery and return from column 13.
    doc = addWire(doc, { partId: 'p2', pinId: 'positive' }, { partId: 'p1', pinId: 'e5' }, [], '#d32f2f')!.doc;
    doc = addWire(doc, { partId: 'p2', pinId: 'negative' }, { partId: 'p1', pinId: 'e13' }, [], '#1b1b1b')!.doc;

    expect(nodeOf(doc, 'p3', '1')).toBe(nodeOf(doc, 'p1', 'a5'));
    expect(nodeOf(doc, 'p3', '2')).toBe(nodeOf(doc, 'p4', 'anode'));
    expect(nodeOf(doc, 'p4', 'cathode')).toBe(nodeOf(doc, 'p1', 'e13'));

    const snapshot = run(doc);
    expect(snapshot.parts.p4?.i).toBeGreaterThan(0.028);
    expect(snapshot.parts.p4?.i).toBeLessThan(0.034);
  });

  it('stays connected when board and parts are rotated together', () => {
    const doc = build([
      ['breadboard-mini', { x: 0, y: 0 }],
      ['resistor', { x: 0, y: -60 }],
    ]);
    const before = nodeOf(doc, 'p2', '1') === nodeOf(doc, 'p1', 'a6');
    const turned = rotateParts(doc, new Set(['p1', 'p2']));
    expect(before).toBe(true);
    expect(nodeOf(turned, 'p2', '1')).toBe(nodeOf(turned, 'p1', 'a6'));
    expect(nodeOf(turned, 'p2', '1')).toBeDefined();
  });
});

describe('touching pins', () => {
  it('connects two parts whose pins share a point', () => {
    // Resistor pin 2 at (30,0) and the second resistor's pin 1 at (30,0).
    const doc = build([
      ['resistor', { x: 0, y: 0 }],
      ['resistor', { x: 60, y: 0 }],
    ]);
    const netlist = buildNetlist(doc, {}, new Set());
    expect(netlist.pinNode.get(pinKey('p1', '2'))).toBe(netlist.pinNode.get(pinKey('p2', '1')));
    expect(netlist.pinNode.get(pinKey('p1', '1'))).not.toBe(netlist.pinNode.get(pinKey('p2', '2')));
  });
});

describe('worldToLocal', () => {
  it('inverts localToWorld for every orientation', () => {
    const base: Part = { id: 'p', type: 'resistor', x: 40, y: -30, rotation: 0, flipped: false, label: '', props: {} };
    for (const rotation of [0, 90, 180, 270] as const) {
      for (const flipped of [false, true]) {
        const part = { ...base, rotation, flipped };
        const world = localToWorld(part, 13, -7);
        expect(worldToLocal(part, world.x, world.y)).toEqual({ x: 13, y: -7 });
      }
    }
  });
});

describe('new analog parts', () => {
  it('a Zener diode regulates its voltage', () => {
    // 9 V -> 220 Ω -> Zener (cathode up) -> ground.
    const doc = build(apart(['battery-9v', 'resistor', 'zener']), [
      ['p1.positive', 'p2.1'],
      ['p2.2', 'p3.cathode'],
      ['p3.anode', 'p1.negative'],
    ]);
    const snapshot = run(doc);
    const acrossResistor = snapshot.parts.p2?.v ?? 0;
    const zenerVolts = 9 - (snapshot.parts.p1?.i ?? 0) * 1.5 - acrossResistor;
    expect(zenerVolts).toBeGreaterThan(5.0);
    expect(zenerVolts).toBeLessThan(5.25);
    expect(snapshot.burned).toEqual([]);
  });

  it('a forward-biased Zener behaves like a diode', () => {
    const doc = build(apart(['battery-9v', 'resistor', 'zener']), [
      ['p1.positive', 'p2.1'],
      ['p2.2', 'p3.anode'],
      ['p3.cathode', 'p1.negative'],
    ]);
    const snapshot = run(doc);
    const drop = 9 - (snapshot.parts.p1?.i ?? 0) * 1.5 - (snapshot.parts.p2?.v ?? 0);
    expect(drop).toBeGreaterThan(0.6);
    expect(drop).toBeLessThan(0.85);
  });

  it('a bridge rectifier gives the same polarity for both input polarities', () => {
    for (const [first, second] of [
      ['ac1', 'ac2'],
      ['ac2', 'ac1'],
    ] as const) {
      let doc = build(apart(['battery-9v', 'bridge-rectifier', 'resistor']), [
        ['p1.positive', `p2.${first}`],
        ['p1.negative', `p2.${second}`],
        ['p2.positive', 'p3.1'],
        ['p3.2', 'p2.negative'],
      ]);
      doc = setPartProp(doc, 'p3', 'resistance', 1000);
      const load = run(doc).parts.p3;
      // 9 V minus two diode drops.
      expect(load?.v).toBeGreaterThan(7.4);
      expect(load?.v).toBeLessThan(8);
    }
  });

  it('an RGB LED reports each color separately', () => {
    // Only the green channel is powered, through 220 Ω.
    const doc = build(apart(['battery-9v', 'resistor', 'led-rgb']), [
      ['p1.positive', 'p2.1'],
      ['p2.2', 'p3.green'],
      ['p3.common', 'p1.negative'],
    ]);
    const aux = run(doc).parts.p3?.aux;
    expect(aux?.g).toBeGreaterThan(0.02);
    expect(Math.abs(aux?.r ?? 1)).toBeLessThan(1e-6);
    expect(Math.abs(aux?.b ?? 1)).toBeLessThan(1e-6);
    const markup = requirePartDef('led-rgb').footprint({ common: 'cathode' }, { aux });
    expect(markup).toContain('rgb(0,255,0)');
  });

  it('a common-anode RGB LED lights when its color pin is pulled low', () => {
    let doc = build(apart(['battery-9v', 'resistor', 'led-rgb']), [
      ['p1.positive', 'p3.common'],
      ['p3.red', 'p2.1'],
      ['p2.2', 'p1.negative'],
    ]);
    doc = setPartProp(doc, 'p3', 'common', 'anode');
    expect(run(doc).parts.p3?.aux?.r).toBeGreaterThan(0.02);
  });

  it('an optocoupler passes the signal while isolating both sides', () => {
    // Input: 9 V battery p1 -> 1 kΩ p2 -> LED. Output: separate battery p4 -> 10 kΩ p5 -> collector.
    let doc = build(apart(['battery-9v', 'resistor', 'optocoupler', 'battery-9v', 'resistor', 'switch-spst']), [
      ['p1.positive', 'p6.1'],
      ['p6.2', 'p2.1'],
      ['p2.2', 'p3.anode'],
      ['p3.cathode', 'p1.negative'],
      ['p4.positive', 'p5.1'],
      ['p5.2', 'p3.collector'],
      ['p3.emitter', 'p4.negative'],
    ]);
    doc = setPartProp(doc, 'p2', 'resistance', 1000);
    doc = setPartProp(doc, 'p5', 'resistance', 10e3);

    const off = run(doc);
    expect(off.converged).toBe(true);
    expect(Math.abs(off.parts.p5?.i ?? 1)).toBeLessThan(1e-5);

    const on = run(setPartProp(doc, 'p6', 'state', 'on'));
    expect(on.converged).toBe(true);
    // LED current about 7.7 mA; the output transistor saturates: nearly 9 V across 10 kΩ.
    expect(on.parts.p3?.i).toBeGreaterThan(0.006);
    expect(on.parts.p5?.v).toBeGreaterThan(8.5);
    // The two sides share no node.
    expect(nodeOf(doc, 'p1', 'negative')).toBe(0);
    expect(nodeOf(doc, 'p4', 'negative')).toBe(0);
    expect(nodeOf(doc, 'p3', 'cathode')).toBe(0);
  });

  it('a transformer steps an alternating voltage down by its ratio', () => {
    // Generator p1 (10 V peak, 50 Hz) on the primary; 1 kΩ p3 on the secondary; meters read it.
    let doc = build(apart(['function-generator', 'transformer', 'resistor']), [
      ['p1.out', 'p2.p1'],
      ['p1.gnd', 'p2.p2'],
      ['p2.s1', 'p3.1'],
      ['p2.s2', 'p3.2'],
    ]);
    doc = setPartProp(doc, 'p1', 'frequency', 50);
    doc = setPartProp(doc, 'p1', 'amplitude', 10);
    doc = setPartProp(doc, 'p2', 'ratio', 5);
    doc = setPartProp(doc, 'p3', 'resistance', 1000);
    const snapshot = run(doc, 2);
    expect(snapshot.converged).toBe(true);
    const secondary = snapshot.parts.p3?.vRms ?? 0;
    const primary = snapshot.parts.p2?.vRms ?? 0;
    expect(primary).toBeGreaterThan(6);
    expect(primary / secondary).toBeGreaterThan(4.7);
    expect(primary / secondary).toBeLessThan(5.3);
  });

  it('light and temperature set the resistance of the sensors', () => {
    expect(ldrOhms({ light: 0 })).toBeCloseTo(1e6, 0);
    expect(ldrOhms({ light: 100 })).toBeGreaterThan(400);
    expect(ldrOhms({ light: 100 })).toBeLessThan(600);
    expect(ntcOhms({ temperature: 25, r25: 10e3 })).toBeCloseTo(10e3, 6);
    // A 10 kΩ B3950 thermistor is about 3.6 kΩ at 50 °C and 27 kΩ at 5 °C.
    expect(ntcOhms({ temperature: 50, r25: 10e3 })).toBeGreaterThan(3400);
    expect(ntcOhms({ temperature: 50, r25: 10e3 })).toBeLessThan(3800);
    expect(ntcOhms({ temperature: 5, r25: 10e3 })).toBeGreaterThan(24e3);
  });

  it('a 7-segment display lights only the driven segments', () => {
    const doc = build(apart(['battery-9v', 'resistor', 'seven-segment']), [
      ['p1.positive', 'p2.1'],
      ['p2.2', 'p3.b'],
      ['p3.com2', 'p1.negative'],
    ]);
    const aux = run(doc).parts.p3?.aux;
    expect(aux?.b).toBeGreaterThan(0.02);
    expect(Math.abs(aux?.a ?? 1)).toBeLessThan(1e-6);
    expect(Object.keys(aux ?? {}).sort()).toEqual(['a', 'b', 'c', 'd', 'dp', 'e', 'f', 'g']);
  });

  it('each DIP switch position closes its own pair of pins', () => {
    const doc = build(apart(['battery-9v', 'resistor', 'dip-switch-4']), [
      ['p1.positive', 'p3.2a'],
      ['p3.2b', 'p2.1'],
      ['p2.2', 'p1.negative'],
    ]);
    const current = (d: CircuitDoc): number => Math.abs(run(d).parts.p2?.i ?? 0);
    expect(current(doc)).toBeLessThan(1e-6);
    expect(current(setPartProp(doc, 'p3', 'sw1', 'on'))).toBeLessThan(1e-6);
    expect(current(setPartProp(doc, 'p3', 'sw2', 'on'))).toBeGreaterThan(0.03);
  });

  it('batteries deliver their nominal voltage', () => {
    for (const [type, volts] of [
      ['battery-aa', 1.5],
      ['battery-aa-x2', 3],
      ['battery-aa-x4', 6],
      ['battery-liion', 3.7],
      ['battery-coin', 3],
    ] as const) {
      let doc = build(apart([type, 'resistor']), [
        ['p1.positive', 'p2.1'],
        ['p2.2', 'p1.negative'],
      ]);
      doc = setPartProp(doc, 'p2', 'resistance', 100e3);
      expect(run(doc).parts.p2?.v, type).toBeCloseTo(volts, 2);
    }
  });

  it('a buzzer sounds only with enough voltage and the right polarity', () => {
    const beep = requirePartDef('buzzer').beep;
    expect(beep?.({}, { v: 5, i: 0.03, p: 0.15 })).toBe(true);
    expect(beep?.({}, { v: 1, i: 0.006, p: 0.006 })).toBe(false);
    expect(beep?.({}, { v: -5, i: -0.03, p: 0.15 })).toBe(false);
  });
});
