import { describe, expect, it } from 'vitest';
import { requirePartDef } from '../../catalog/registry';
import {
  docBounds,
  localToWorld,
  nearestSegmentIndex,
  partBounds,
  pinWorld,
  snap,
} from './geometry';
import {
  HISTORY_LIMIT,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from './history';
import {
  addPart,
  addWire,
  copyItems,
  deleteItems,
  flipParts,
  insertWirePoint,
  moveParts,
  pasteClip,
  removeWirePoint,
  rotateParts,
  setPartLabel,
  setPartProp,
  setWirePoint,
  setWiresColor,
} from './ops';
import { EMPTY_DOC, type CircuitDoc, type Part } from './types';

const ids = (...values: string[]): Set<string> => new Set(values);

/** Resistor p1 at (100,100), LED p2 at (200,100), wire w1 between them with one bend. */
function sample(): CircuitDoc {
  let doc = addPart(EMPTY_DOC, 'resistor', { x: 100, y: 100 }).doc;
  doc = addPart(doc, 'led', { x: 200, y: 100 }).doc;
  const wired = addWire(
    doc,
    { partId: 'p1', pinId: '2' },
    { partId: 'p2', pinId: 'anode' },
    [{ x: 150, y: 140 }],
    '#d32f2f',
  );
  if (!wired) throw new Error('wire not created');
  return wired.doc;
}

const partOf = (doc: CircuitDoc, id: string): Part => {
  const part = doc.parts.find((candidate) => candidate.id === id);
  if (!part) throw new Error(`missing ${id}`);
  return part;
};

describe('geometry', () => {
  const base: Part = {
    id: 'p1',
    type: 'resistor',
    x: 100,
    y: 50,
    rotation: 0,
    flipped: false,
    label: 'R1',
    props: {},
  };

  it('snaps to the grid without producing -0', () => {
    expect(snap(14)).toBe(10);
    expect(snap(15)).toBe(20);
    expect(Object.is(snap(-2), 0)).toBe(true);
  });

  it('transforms local points with rotation and flip', () => {
    expect(localToWorld(base, 30, 0)).toEqual({ x: 130, y: 50 });
    expect(localToWorld({ ...base, rotation: 90 }, 30, 0)).toEqual({ x: 100, y: 80 });
    expect(localToWorld({ ...base, rotation: 180 }, 30, 0)).toEqual({ x: 70, y: 50 });
    expect(localToWorld({ ...base, rotation: 270 }, 30, 0)).toEqual({ x: 100, y: 20 });
    expect(localToWorld({ ...base, flipped: true }, 30, 0)).toEqual({ x: 70, y: 50 });
    expect(localToWorld({ ...base, flipped: true, rotation: 90 }, 30, 0)).toEqual({ x: 100, y: 20 });
  });

  it('computes rotated bounds', () => {
    const def = requirePartDef('resistor');
    expect(partBounds(base, def)).toEqual({ x: 70, y: 42, width: 60, height: 16 });
    expect(partBounds({ ...base, rotation: 90 }, def)).toEqual({
      x: 92,
      y: 20,
      width: 16,
      height: 60,
    });
  });

  it('resolves pin positions and missing pins', () => {
    const doc = sample();
    expect(pinWorld(doc, { partId: 'p1', pinId: '2' })).toEqual({ x: 130, y: 100 });
    expect(pinWorld(doc, { partId: 'p2', pinId: 'anode' })).toEqual({ x: 190, y: 120 });
    expect(pinWorld(doc, { partId: 'p1', pinId: 'nope' })).toBeNull();
    expect(pinWorld(doc, { partId: 'nope', pinId: '1' })).toBeNull();
  });

  it('finds the nearest segment of a polyline', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(nearestSegmentIndex(line, { x: 40, y: 5 })).toBe(0);
    expect(nearestSegmentIndex(line, { x: 95, y: 60 })).toBe(1);
  });

  it('returns null bounds for an empty document', () => {
    expect(docBounds(EMPTY_DOC)).toBeNull();
    expect(docBounds(sample())).toEqual({ x: 70, y: 80, width: 144, height: 60 });
  });
});

describe('ops', () => {
  it('adds parts with sequential ids and labels per prefix', () => {
    let doc = addPart(EMPTY_DOC, 'resistor', { x: 0, y: 0 }).doc;
    doc = addPart(doc, 'resistor', { x: 0, y: 0 }).doc;
    doc = addPart(doc, 'led', { x: 0, y: 0 }).doc;
    doc = addPart(doc, 'diode', { x: 0, y: 0 }).doc;
    expect(doc.parts.map((part) => part.id)).toEqual(['p1', 'p2', 'p3', 'p4']);
    expect(doc.parts.map((part) => part.label)).toEqual(['R1', 'R2', 'D1', 'D2']);
    expect(partOf(doc, 'p1').props).toEqual({ resistance: 220, power: 0.25 });
  });

  it('rejects unknown part types', () => {
    expect(() => addPart(EMPTY_DOC, 'nope', { x: 0, y: 0 })).toThrow();
  });

  it('does not mutate the input document', () => {
    const doc = sample();
    const snapshot = JSON.stringify(doc);
    moveParts(doc, ids('p1', 'p2'), 10, 10);
    rotateParts(doc, ids('p1'));
    deleteItems(doc, ids('p1'));
    expect(JSON.stringify(doc)).toBe(snapshot);
  });

  it('moves bend points only when both ends of the wire move', () => {
    const doc = sample();
    const one = moveParts(doc, ids('p1'), 20, 0);
    expect(partOf(one, 'p1').x).toBe(120);
    expect(one.wires[0]?.points).toEqual([{ x: 150, y: 140 }]);
    expect(one.parts[1]).toBe(doc.parts[1]);

    const both = moveParts(doc, ids('p1', 'p2'), 20, -10);
    expect(both.wires[0]?.points).toEqual([{ x: 170, y: 130 }]);
  });

  it('returns the same document for a zero move', () => {
    const doc = sample();
    expect(moveParts(doc, ids('p1'), 0, 0)).toBe(doc);
  });

  it('rotates a single part around its own origin', () => {
    const doc = rotateParts(sample(), ids('p1'));
    expect(partOf(doc, 'p1')).toMatchObject({ x: 100, y: 100, rotation: 90 });
    expect(pinWorld(doc, { partId: 'p1', pinId: '2' })).toEqual({ x: 100, y: 130 });
  });

  it('four group rotations restore the original layout', () => {
    const doc = sample();
    let turned = doc;
    for (let i = 0; i < 4; i++) turned = rotateParts(turned, ids('p1', 'p2'));
    expect(turned).toEqual(doc);
  });

  it('group rotation keeps pins and bend points rigidly attached', () => {
    const doc = sample();
    const turned = rotateParts(doc, ids('p1', 'p2'));
    // Center is (150,100): a point (x,y) maps to (150-(y-100), 100+(x-150)).
    expect(pinWorld(turned, { partId: 'p1', pinId: '2' })).toEqual({ x: 150, y: 80 });
    expect(turned.wires[0]?.points).toEqual([{ x: 110, y: 100 }]);
  });

  it('flipping twice restores the original layout', () => {
    const doc = rotateParts(sample(), ids('p2'));
    expect(flipParts(flipParts(doc, ids('p1', 'p2')), ids('p1', 'p2'))).toEqual(doc);
  });

  it('flip mirrors pin positions around the group center', () => {
    const doc = sample();
    const flipped = flipParts(doc, ids('p1', 'p2'));
    expect(pinWorld(flipped, { partId: 'p1', pinId: '2' })).toEqual({ x: 170, y: 100 });
    expect(pinWorld(flipped, { partId: 'p2', pinId: 'anode' })).toEqual({ x: 110, y: 120 });
    expect(flipped.wires[0]?.points).toEqual([{ x: 150, y: 140 }]);
  });

  it('deleting a part also deletes its wires', () => {
    const doc = deleteItems(sample(), ids('p2'));
    expect(doc.parts.map((part) => part.id)).toEqual(['p1']);
    expect(doc.wires).toEqual([]);
  });

  it('deletes a wire alone and ignores unknown ids', () => {
    const doc = sample();
    expect(deleteItems(doc, ids('w1')).wires).toEqual([]);
    expect(deleteItems(doc, ids('w1')).parts).toHaveLength(2);
    expect(deleteItems(doc, ids('zzz'))).toBe(doc);
  });

  it('refuses a wire from a pin to itself', () => {
    const pin = { partId: 'p1', pinId: '1' };
    expect(addWire(sample(), pin, { ...pin }, [], '#000000')).toBeNull();
  });

  it('edits wire bend points and color', () => {
    let doc = sample();
    doc = insertWirePoint(doc, 'w1', 1, { x: 180, y: 140 });
    expect(doc.wires[0]?.points).toEqual([
      { x: 150, y: 140 },
      { x: 180, y: 140 },
    ]);
    doc = setWirePoint(doc, 'w1', 0, { x: 140, y: 150 });
    expect(doc.wires[0]?.points[0]).toEqual({ x: 140, y: 150 });
    doc = removeWirePoint(doc, 'w1', 0);
    expect(doc.wires[0]?.points).toEqual([{ x: 180, y: 140 }]);
    expect(removeWirePoint(doc, 'w1', 9)).toBe(doc);

    const recolored = setWiresColor(doc, ids('w1'), '#2962c9');
    expect(recolored.wires[0]?.color).toBe('#2962c9');
    expect(setWiresColor(recolored, ids('w1'), '#2962c9')).toBe(recolored);
  });

  it('sets properties with validation and clamping', () => {
    const doc = sample();
    expect(partOf(setPartProp(doc, 'p1', 'resistance', 4700), 'p1').props.resistance).toBe(4700);
    expect(partOf(setPartProp(doc, 'p1', 'resistance', -1), 'p1').props.resistance).toBe(0.1);
    expect(setPartProp(doc, 'p1', 'resistance', Number.NaN)).toBe(doc);
    expect(setPartProp(doc, 'p1', 'resistance', 220)).toBe(doc);
    expect(setPartProp(doc, 'p1', 'bogus', 1)).toBe(doc);
    expect(partOf(setPartProp(doc, 'p2', 'color', 'blue'), 'p2').props.color).toBe('blue');
    expect(setPartProp(doc, 'p2', 'color', 'ultraviolet')).toBe(doc);
  });

  it('trims labels', () => {
    const doc = setPartLabel(sample(), 'p1', '  Rled  ');
    expect(partOf(doc, 'p1').label).toBe('Rled');
  });

  it('copy keeps only wires between copied parts', () => {
    const doc = sample();
    expect(copyItems(doc, ids('p1')).wires).toEqual([]);
    expect(copyItems(doc, ids('p1', 'p2')).wires).toHaveLength(1);
  });

  it('paste creates new ids, labels and rewired copies', () => {
    const doc = sample();
    const result = pasteClip(doc, copyItems(doc, ids('p1', 'p2')), 20, 20);
    expect(result.ids).toEqual(['p3', 'p4', 'w2']);
    expect(result.doc.parts).toHaveLength(4);
    expect(partOf(result.doc, 'p3')).toMatchObject({ x: 120, y: 120, label: 'R2' });
    expect(partOf(result.doc, 'p4')).toMatchObject({ label: 'D2' });
    expect(result.doc.wires[1]).toMatchObject({
      from: { partId: 'p3', pinId: '2' },
      to: { partId: 'p4', pinId: 'anode' },
      points: [{ x: 170, y: 160 }],
    });
    // Copies must not share prop objects with the originals.
    expect(partOf(result.doc, 'p3').props).not.toBe(partOf(doc, 'p1').props);
  });
});

describe('history', () => {
  it('undoes and redoes', () => {
    let h = createHistory('a');
    h = pushHistory(h, 'b');
    h = pushHistory(h, 'c');
    h = undoHistory(h);
    expect(h.present).toBe('b');
    h = undoHistory(h);
    expect(h.present).toBe('a');
    expect(undoHistory(h)).toBe(h);
    h = redoHistory(h);
    h = redoHistory(h);
    expect(h.present).toBe('c');
    expect(redoHistory(h)).toBe(h);
  });

  it('drops the redo branch on a new edit and ignores no-op pushes', () => {
    let h = createHistory('a');
    h = pushHistory(h, 'b');
    h = undoHistory(h);
    h = pushHistory(h, 'c');
    expect(h.future).toEqual([]);
    expect(pushHistory(h, 'c')).toBe(h);
  });

  it('caps the number of undo steps', () => {
    let h = createHistory(0);
    for (let i = 1; i <= HISTORY_LIMIT + 50; i++) h = pushHistory(h, i);
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.present).toBe(HISTORY_LIMIT + 50);
  });
});
