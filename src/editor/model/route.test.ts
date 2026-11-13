import { describe, expect, it } from 'vitest';
import { getPartDef } from '../../catalog/registry';
import { SimSession } from '../../core/sim/session';
import { EXAMPLES } from '../../project/examples';
import { partBounds, pinWorld } from './geometry';
import { addPart, addWire } from './ops';
import { routeWires } from './route';
import { EMPTY_DOC, type CircuitDoc, type Point } from './types';

/** Full path of every wire, pin to pin. */
const paths = (doc: CircuitDoc): Point[][] =>
  doc.wires.map((wire) => [pinWorld(doc, wire.from)!, ...wire.points, pinWorld(doc, wire.to)!]);

function expectClean(doc: CircuitDoc): void {
  for (const [index, path] of paths(doc).entries()) {
    const wire = doc.wires[index]!;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1]!;
      const b = path[k]!;
      // Only horizontal and vertical segments.
      expect(a.x === b.x || a.y === b.y, `wire ${wire.id} segment ${k}`).toBe(true);
      // Never through the body of a part it does not connect to.
      const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 10;
      for (let s = 0; s <= steps; s++) {
        const x = a.x + Math.sign(b.x - a.x) * s * 10;
        const y = a.y + Math.sign(b.y - a.y) * s * 10;
        for (const part of doc.parts) {
          const def = getPartDef(part.type);
          if (!def || def.layer === 'base' || part.id === wire.from.partId || part.id === wire.to.partId) continue;
          const box = partBounds(part, def);
          const inside = x > box.x && x < box.x + box.width && y > box.y && y < box.y + box.height;
          expect(inside, `wire ${wire.id} crosses ${part.id}`).toBe(false);
        }
      }
    }
  }
}

describe('wire routing', () => {
  it('goes around a part in the way with right angles', () => {
    let doc = EMPTY_DOC;
    for (const [type, x] of [['resistor', 0], ['ic-74hc00', 200], ['resistor', 400]] as const) {
      doc = addPart(doc, type, { x, y: 0 }).doc;
    }
    doc = addWire(doc, { partId: 'p1', pinId: '2' }, { partId: 'p3', pinId: '1' }, [], '#000')!.doc;
    const routed = routeWires(doc);
    expect(routed.wires[0]!.points.length).toBeGreaterThan(1);
    expectClean(routed);
    // Connections never change.
    expect(routed.wires.map((wire) => [wire.from, wire.to])).toEqual(doc.wires.map((wire) => [wire.from, wire.to]));
    expect(routed.parts).toBe(doc.parts);
  });

  it('only moves the wires asked for', () => {
    let doc = EMPTY_DOC;
    for (const x of [0, 200, 400]) doc = addPart(doc, 'resistor', { x, y: 0 }).doc;
    doc = addWire(doc, { partId: 'p1', pinId: '2' }, { partId: 'p2', pinId: '1' }, [], '#000')!.doc;
    doc = addWire(doc, { partId: 'p2', pinId: '2' }, { partId: 'p3', pinId: '1' }, [{ x: 300, y: 90 }], '#000')!.doc;
    const routed = routeWires(doc, new Set([doc.wires[0]!.id]));
    expect(routed.wires[1]).toBe(doc.wires[1]);
  });
});

describe('examples', () => {
  for (const example of EXAMPLES) {
    it(`${example.id} builds with clean wiring and runs`, () => {
      const doc = example.build();
      expect(doc.parts.length).toBeGreaterThan(2);
      expectClean(doc);
      // Parts must not overlap each other.
      const boxes = doc.parts
        .filter((part) => getPartDef(part.type)?.layer !== 'base')
        .map((part) => ({ id: part.id, box: partBounds(part, getPartDef(part.type)!) }));
      for (const [i, a] of boxes.entries()) {
        for (const b of boxes.slice(i + 1)) {
          const apart =
            a.box.x + a.box.width <= b.box.x || b.box.x + b.box.width <= a.box.x ||
            a.box.y + a.box.height <= b.box.y || b.box.y + b.box.height <= a.box.y;
          expect(apart, `${example.id}: ${a.id} overlaps ${b.id}`).toBe(true);
        }
      }
      if (example.id === 'traffic-light') return; // Needs the compiler.
      const session = new SimSession();
      session.load(doc, {}, [], {});
      let snapshot = session.snapshot();
      for (let k = 0; k < 15; k++) snapshot = session.advance(0.02, 60_000);
      expect(snapshot.converged).toBe(true);
      expect(snapshot.burned).toEqual([]);
    }, 60_000);
  }
});
