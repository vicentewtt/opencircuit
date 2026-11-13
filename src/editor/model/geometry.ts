import { getPartDef } from '../../catalog/registry';
import type { Bounds, PartDef } from '../../catalog/types';
import type { CircuitDoc, Part, PinRef, Point, Rotation } from './types';

export const GRID = 10;

export function snap(value: number): number {
  // "+ 0" turns -0 into 0.
  return Math.round(value / GRID) * GRID + 0;
}

export function snapPoint(point: Point): Point {
  return { x: snap(point.x), y: snap(point.y) };
}

/** Rotates clockwise on screen (y grows downwards), matching SVG rotate(). */
export function rotateVec(x: number, y: number, rotation: Rotation): [number, number] {
  switch (rotation) {
    case 90:
      return [-y, x];
    case 180:
      return [-x, -y];
    case 270:
      return [y, -x];
    default:
      return [x, y];
  }
}

export function localToWorld(part: Part, x: number, y: number): Point {
  const [rx, ry] = rotateVec(part.flipped ? -x : x, y, part.rotation);
  return { x: part.x + rx + 0, y: part.y + ry + 0 };
}

/** Inverse of localToWorld: where a world point falls on the part's own drawing. */
export function worldToLocal(part: Part, x: number, y: number): Point {
  const inverse = ((360 - part.rotation) % 360) as Rotation;
  const [rx, ry] = rotateVec(x - part.x, y - part.y, inverse);
  return { x: (part.flipped ? -rx : rx) + 0, y: ry + 0 };
}

/** SVG transform equivalent to localToWorld. */
export function partTransform(part: Part): string {
  const flip = part.flipped ? ' scale(-1 1)' : '';
  return `translate(${part.x} ${part.y}) rotate(${part.rotation})${flip}`;
}

/** World-space axis-aligned bounding box of a part. */
export function partBounds(part: Part, def: PartDef): Bounds {
  const b = def.bounds;
  const p = localToWorld(part, b.x, b.y);
  const q = localToWorld(part, b.x + b.width, b.y + b.height);
  return {
    x: Math.min(p.x, q.x),
    y: Math.min(p.y, q.y),
    width: Math.abs(q.x - p.x),
    height: Math.abs(q.y - p.y),
  };
}

const indexCache = new WeakMap<CircuitDoc, Map<string, Part>>();

/** Parts by id, cached per (immutable) document. */
export function partIndex(doc: CircuitDoc): Map<string, Part> {
  let index = indexCache.get(doc);
  if (!index) {
    index = new Map(doc.parts.map((part) => [part.id, part]));
    indexCache.set(doc, index);
  }
  return index;
}

/** World position of a pin, or null when the part or pin does not exist. */
export function pinWorld(doc: CircuitDoc, ref: PinRef): Point | null {
  const part = partIndex(doc).get(ref.partId);
  if (!part) return null;
  const pin = getPartDef(part.type)?.pins.find((candidate) => candidate.id === ref.pinId);
  return pin ? localToWorld(part, pin.x, pin.y) : null;
}

export function boundsIntersect(a: Bounds, b: Bounds): boolean {
  return (
    a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
  );
}

export function pointInBounds(point: Point, bounds: Bounds): boolean {
  return (
    point.x >= bounds.x &&
    point.x <= bounds.x + bounds.width &&
    point.y >= bounds.y &&
    point.y <= bounds.y + bounds.height
  );
}

export function boundsFromPoints(a: Point, b: Point): Bounds {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

/** Bounding box of everything in the document, or null when it is empty. */
export function docBounds(doc: CircuitDoc): Bounds | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const part of doc.parts) {
    const def = getPartDef(part.type);
    if (!def) continue;
    const b = partBounds(part, def);
    include(b.x, b.y);
    include(b.x + b.width, b.y + b.height);
  }
  for (const wire of doc.wires) {
    for (const point of wire.points) include(point.x, point.y);
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Index i of the segment (points[i], points[i + 1]) closest to p. */
export function nearestSegmentIndex(points: readonly Point[], p: Point): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) continue;
    const distance = distanceToSegment(p, a, b);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
}
