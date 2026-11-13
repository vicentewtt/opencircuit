import { defaultProps, getPartDef, requirePartDef } from '../../catalog/registry';
import { MAX_CODE_LENGTH, type PropValue } from '../../catalog/types';
import { snapPoint } from './geometry';
import type { CircuitDoc, Part, PinRef, Point, Rotation, Wire } from './types';

/**
 * Pure editing operations. Each one returns a new document and leaves the
 * input untouched; unchanged parts and wires keep their identity.
 */

type IdSet = ReadonlySet<string>;

function nextId(items: readonly { id: string }[], prefix: string): string {
  let max = 0;
  for (const { id } of items) {
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length));
    if (Number.isInteger(n) && n > max) max = n;
  }
  return `${prefix}${max + 1}`;
}

function nextLabel(parts: readonly Part[], prefix: string): string {
  let max = 0;
  for (const { label } of parts) {
    if (!label.startsWith(prefix)) continue;
    const rest = label.slice(prefix.length);
    if (/^\d+$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return `${prefix}${max + 1}`;
}

const samePin = (a: PinRef, b: PinRef): boolean => a.partId === b.partId && a.pinId === b.pinId;

/** Applies `map` to the bend points of wires that lie entirely inside the group. */
function mapInnerWires(wires: Wire[], ids: IdSet, map: (point: Point) => Point): Wire[] {
  return wires.map((wire) =>
    wire.points.length > 0 && ids.has(wire.from.partId) && ids.has(wire.to.partId)
      ? { ...wire, points: wire.points.map(map) }
      : wire,
  );
}

function groupCenter(parts: readonly Part[]): Point {
  const first = parts[0];
  if (parts.length === 1 && first) return { x: first.x, y: first.y };
  let x = 0;
  let y = 0;
  for (const part of parts) {
    x += part.x;
    y += part.y;
  }
  return snapPoint({ x: x / parts.length, y: y / parts.length });
}

export function addPart(doc: CircuitDoc, type: string, at: Point): { doc: CircuitDoc; id: string } {
  const def = requirePartDef(type);
  const id = nextId(doc.parts, 'p');
  const part: Part = {
    id,
    type,
    x: at.x,
    y: at.y,
    rotation: 0,
    flipped: false,
    label: nextLabel(doc.parts, def.refPrefix),
    props: defaultProps(def),
  };
  return { doc: { ...doc, parts: [...doc.parts, part] }, id };
}

export function moveParts(doc: CircuitDoc, ids: IdSet, dx: number, dy: number): CircuitDoc {
  if ((dx === 0 && dy === 0) || ids.size === 0) return doc;
  return {
    parts: doc.parts.map((part) =>
      ids.has(part.id) ? { ...part, x: part.x + dx, y: part.y + dy } : part,
    ),
    wires: mapInnerWires(doc.wires, ids, (p) => ({ x: p.x + dx, y: p.y + dy })),
  };
}

/** Rotates the group 90° clockwise around its center. */
export function rotateParts(doc: CircuitDoc, ids: IdSet): CircuitDoc {
  const moving = doc.parts.filter((part) => ids.has(part.id));
  if (moving.length === 0) return doc;
  const c = groupCenter(moving);
  const turn = (p: Point): Point => ({ x: c.x - (p.y - c.y) + 0, y: c.y + (p.x - c.x) + 0 });
  return {
    parts: doc.parts.map((part) =>
      ids.has(part.id)
        ? { ...part, ...turn(part), rotation: ((part.rotation + 90) % 360) as Rotation }
        : part,
    ),
    wires: mapInnerWires(doc.wires, ids, turn),
  };
}

/** Mirrors the group horizontally around its center. */
export function flipParts(doc: CircuitDoc, ids: IdSet): CircuitDoc {
  const moving = doc.parts.filter((part) => ids.has(part.id));
  if (moving.length === 0) return doc;
  const c = groupCenter(moving);
  const mirror = (p: Point): Point => ({ x: 2 * c.x - p.x + 0, y: p.y });
  return {
    parts: doc.parts.map((part) =>
      ids.has(part.id)
        ? {
            ...part,
            ...mirror(part),
            // Mirroring a rotated part: H·R(θ)·F = R(−θ)·H·F.
            rotation: ((360 - part.rotation) % 360) as Rotation,
            flipped: !part.flipped,
          }
        : part,
    ),
    wires: mapInnerWires(doc.wires, ids, mirror),
  };
}

/** Removes the given parts and wires, plus any wire attached to a removed part. */
export function deleteItems(doc: CircuitDoc, ids: IdSet): CircuitDoc {
  if (ids.size === 0) return doc;
  const parts = doc.parts.filter((part) => !ids.has(part.id));
  const wires = doc.wires.filter(
    (wire) => !ids.has(wire.id) && !ids.has(wire.from.partId) && !ids.has(wire.to.partId),
  );
  if (parts.length === doc.parts.length && wires.length === doc.wires.length) return doc;
  return { parts, wires };
}

/** Returns null when the wire would connect a pin to itself. */
export function addWire(
  doc: CircuitDoc,
  from: PinRef,
  to: PinRef,
  points: readonly Point[],
  color: string,
): { doc: CircuitDoc; id: string } | null {
  if (samePin(from, to)) return null;
  const id = nextId(doc.wires, 'w');
  const wire: Wire = { id, from, to, points: [...points], color };
  return { doc: { ...doc, wires: [...doc.wires, wire] }, id };
}

function updateWire(doc: CircuitDoc, wireId: string, update: (wire: Wire) => Wire): CircuitDoc {
  let changed = false;
  const wires = doc.wires.map((wire) => {
    if (wire.id !== wireId) return wire;
    const next = update(wire);
    if (next !== wire) changed = true;
    return next;
  });
  return changed ? { ...doc, wires } : doc;
}

export function setWiresColor(doc: CircuitDoc, ids: IdSet, color: string): CircuitDoc {
  if (!doc.wires.some((wire) => ids.has(wire.id) && wire.color !== color)) return doc;
  return {
    ...doc,
    wires: doc.wires.map((wire) => (ids.has(wire.id) ? { ...wire, color } : wire)),
  };
}

export function setWirePoint(doc: CircuitDoc, wireId: string, index: number, at: Point): CircuitDoc {
  return updateWire(doc, wireId, (wire) => {
    const current = wire.points[index];
    if (!current || (current.x === at.x && current.y === at.y)) return wire;
    return { ...wire, points: wire.points.map((point, i) => (i === index ? at : point)) };
  });
}

export function insertWirePoint(
  doc: CircuitDoc,
  wireId: string,
  index: number,
  at: Point,
): CircuitDoc {
  return updateWire(doc, wireId, (wire) => {
    const i = Math.max(0, Math.min(wire.points.length, index));
    return { ...wire, points: [...wire.points.slice(0, i), at, ...wire.points.slice(i)] };
  });
}

export function removeWirePoint(doc: CircuitDoc, wireId: string, index: number): CircuitDoc {
  return updateWire(doc, wireId, (wire) =>
    index >= 0 && index < wire.points.length
      ? { ...wire, points: wire.points.filter((_, i) => i !== index) }
      : wire,
  );
}

function updatePart(doc: CircuitDoc, partId: string, update: (part: Part) => Part): CircuitDoc {
  let changed = false;
  const parts = doc.parts.map((part) => {
    if (part.id !== partId) return part;
    const next = update(part);
    if (next !== part) changed = true;
    return next;
  });
  return changed ? { ...doc, parts } : doc;
}

/** Sets a property, clamping numbers to their range. Invalid values are ignored. */
export function setPartProp(
  doc: CircuitDoc,
  partId: string,
  key: string,
  value: PropValue,
): CircuitDoc {
  return updatePart(doc, partId, (part) => {
    const prop = getPartDef(part.type)?.props.find((candidate) => candidate.key === key);
    if (!prop) return part;
    let next: PropValue;
    if (prop.kind === 'number') {
      if (typeof value !== 'number' || !Number.isFinite(value)) return part;
      next = Math.min(prop.max, Math.max(prop.min, value));
    } else if (prop.kind === 'code') {
      if (typeof value !== 'string' || value.length > MAX_CODE_LENGTH) return part;
      next = value;
    } else {
      if (typeof value !== 'string' || !prop.options.some((option) => option.value === value)) {
        return part;
      }
      next = value;
    }
    return part.props[key] === next ? part : { ...part, props: { ...part.props, [key]: next } };
  });
}

export const MAX_LABEL_LENGTH = 24;

export function setPartLabel(doc: CircuitDoc, partId: string, label: string): CircuitDoc {
  const clean = label.trim().slice(0, MAX_LABEL_LENGTH);
  return updatePart(doc, partId, (part) => (part.label === clean ? part : { ...part, label: clean }));
}

/** A copied fragment: the parts plus the wires that connect them to each other. */
export interface Clip {
  parts: Part[];
  wires: Wire[];
}

export function copyItems(doc: CircuitDoc, ids: IdSet): Clip {
  return {
    parts: doc.parts.filter((part) => ids.has(part.id)),
    wires: doc.wires.filter((wire) => ids.has(wire.from.partId) && ids.has(wire.to.partId)),
  };
}

/** Inserts a clip with fresh ids and labels, shifted by (dx, dy). */
export function pasteClip(
  doc: CircuitDoc,
  clip: Clip,
  dx: number,
  dy: number,
): { doc: CircuitDoc; ids: string[] } {
  const idMap = new Map<string, string>();
  const ids: string[] = [];
  let parts = doc.parts;
  for (const source of clip.parts) {
    const def = getPartDef(source.type);
    if (!def) continue;
    const id = nextId(parts, 'p');
    idMap.set(source.id, id);
    ids.push(id);
    parts = [
      ...parts,
      {
        ...source,
        id,
        x: source.x + dx,
        y: source.y + dy,
        label: nextLabel(parts, def.refPrefix),
        props: { ...source.props },
      },
    ];
  }
  let wires = doc.wires;
  for (const source of clip.wires) {
    const fromId = idMap.get(source.from.partId);
    const toId = idMap.get(source.to.partId);
    if (!fromId || !toId) continue;
    const id = nextId(wires, 'w');
    ids.push(id);
    wires = [
      ...wires,
      {
        id,
        from: { partId: fromId, pinId: source.from.pinId },
        to: { partId: toId, pinId: source.to.pinId },
        points: source.points.map((p) => ({ x: p.x + dx, y: p.y + dy })),
        color: source.color,
      },
    ];
  }
  if (ids.length === 0) return { doc, ids };
  return { doc: { parts, wires }, ids };
}
