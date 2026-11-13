import { getPartDef } from '../../catalog/registry';
import { GRID, partBounds, partIndex, pinWorld, localToWorld } from './geometry';
import type { CircuitDoc, Point, Wire } from './types';

/**
 * Automatic wire routing: every wire becomes a path of horizontal and
 * vertical segments on the grid that goes around the parts, never over
 * a pin it does not belong to, and avoids running on top of other wires.
 * Each wire is found with A* over grid cells, cheapest first.
 */

/** Costs of the search, in grid steps. */
const STEP = 1;
const BEND = 4;
/** Running along a stretch another wire already uses in the same direction. */
const OVERLAP = 14;
/** Crossing another wire at a right angle. */
const CROSS = 1;
/** Passing through the body of the part the wire starts or ends at. */
const OWN_BODY = 6;
/** Free space kept around the circuit for detours. */
const MARGIN = 8;

const DIRECTIONS: readonly [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
/** Bit for horizontal (0) and vertical (1) use of a cell. */
const axisBit = (direction: number): number => (direction < 2 ? 1 : 2);

const key = (x: number, y: number): string => `${x},${y}`;

/** Min-heap of search states ordered by estimated total cost. */
class Heap {
  private readonly items: { f: number; node: number }[] = [];

  get size(): number {
    return this.items.length;
  }

  push(f: number, node: number): void {
    const items = this.items;
    items.push({ f, node });
    let index = items.length - 1;
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (items[parent]!.f <= items[index]!.f) break;
      [items[parent], items[index]] = [items[index]!, items[parent]!];
      index = parent;
    }
  }

  pop(): number {
    const items = this.items;
    const top = items[0]!.node;
    const last = items.pop()!;
    if (items.length > 0) {
      items[0] = last;
      let index = 0;
      for (;;) {
        const left = index * 2 + 1;
        const right = left + 1;
        let smallest = index;
        if (left < items.length && items[left]!.f < items[smallest]!.f) smallest = left;
        if (right < items.length && items[right]!.f < items[smallest]!.f) smallest = right;
        if (smallest === index) break;
        [items[smallest], items[index]] = [items[index]!, items[smallest]!];
        index = smallest;
      }
    }
    return top;
  }
}

interface Area {
  x0: number;
  y0: number;
  width: number;
  height: number;
}

/** Everything the search needs to know about the circuit, in grid cells. */
interface Board {
  area: Area;
  /** Part id owning each blocked cell (inside a part's body). */
  body: Map<string, string>;
  /** Pins of parts that are not breadboards: no other wire may pass over them. */
  pins: Set<string>;
  /** How routed wires use each cell (bit 1 horizontal, bit 2 vertical). */
  used: Map<string, number>;
}

function buildBoard(doc: CircuitDoc): Board {
  const body = new Map<string, string>();
  const pins = new Set<string>();
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (x: number, y: number): void => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const part of doc.parts) {
    const def = getPartDef(part.type);
    if (!def) continue;
    const bounds = partBounds(part, def);
    extend(Math.floor(bounds.x / GRID), Math.floor(bounds.y / GRID));
    extend(Math.ceil((bounds.x + bounds.width) / GRID), Math.ceil((bounds.y + bounds.height) / GRID));
    // Breadboards are made to be wired over.
    if (def.layer === 'base') continue;
    for (let gx = Math.ceil(bounds.x / GRID); gx * GRID <= bounds.x + bounds.width; gx++) {
      for (let gy = Math.ceil(bounds.y / GRID); gy * GRID <= bounds.y + bounds.height; gy++) {
        const x = gx * GRID;
        const y = gy * GRID;
        if (x > bounds.x && x < bounds.x + bounds.width && y > bounds.y && y < bounds.y + bounds.height) {
          body.set(key(gx, gy), part.id);
        }
      }
    }
    for (const pin of def.pins) {
      const at = localToWorld(part, pin.x, pin.y);
      const gx = Math.round(at.x / GRID);
      const gy = Math.round(at.y / GRID);
      pins.add(key(gx, gy));
      extend(gx, gy);
    }
  }
  if (!Number.isFinite(minX)) {
    minX = minY = 0;
    maxX = maxY = 0;
  }
  return {
    area: {
      x0: minX - MARGIN,
      y0: minY - MARGIN,
      width: maxX - minX + 2 * MARGIN + 1,
      height: maxY - minY + 2 * MARGIN + 1,
    },
    body,
    pins,
    used: new Map(),
  };
}

/** Cheapest grid path between two cells, as cells from start to goal, or null. */
function search(
  board: Board,
  start: [number, number],
  goal: [number, number],
  ownParts: Set<string>,
): [number, number][] | null {
  const { area, body, pins, used } = board;
  const cells = area.width * area.height;
  const inArea = (x: number, y: number): boolean =>
    x >= area.x0 && y >= area.y0 && x < area.x0 + area.width && y < area.y0 + area.height;
  if (!inArea(...start) || !inArea(...goal)) return null;
  const startKey = key(...start);
  const goalKey = key(...goal);

  // State = cell * 5 + arrival direction (4 = none yet).
  const cost = new Float64Array(cells * 5).fill(Infinity);
  const previous = new Int32Array(cells * 5).fill(-1);
  const index = (x: number, y: number): number => (y - area.y0) * area.width + (x - area.x0);
  const heuristic = (x: number, y: number): number => Math.abs(x - goal[0]) + Math.abs(y - goal[1]);

  const heap = new Heap();
  const first = index(...start) * 5 + 4;
  cost[first] = 0;
  heap.push(heuristic(...start), first);

  let reached = -1;
  while (heap.size > 0) {
    const node = heap.pop();
    const cell = Math.floor(node / 5);
    const arrived = node % 5;
    const x = (cell % area.width) + area.x0;
    const y = Math.floor(cell / area.width) + area.y0;
    if (x === goal[0] && y === goal[1]) {
      reached = node;
      break;
    }
    const here = cost[node]!;
    for (let direction = 0; direction < 4; direction++) {
      // No turning straight back.
      if (arrived !== 4 && (arrived ^ 1) === direction) continue;
      const [dx, dy] = DIRECTIONS[direction]!;
      const nx = x + dx;
      const ny = y + dy;
      if (!inArea(nx, ny)) continue;
      const nextKey = key(nx, ny);
      const isGoal = nextKey === goalKey;
      if (!isGoal && pins.has(nextKey) && nextKey !== startKey) continue;
      let step = STEP;
      const owner = body.get(nextKey);
      if (owner !== undefined && !isGoal) {
        if (!ownParts.has(owner)) continue;
        step += OWN_BODY;
      }
      if (arrived !== 4 && arrived !== direction) step += BEND;
      const usage = used.get(nextKey) ?? 0;
      if (!isGoal) {
        if (usage & axisBit(direction)) step += OVERLAP;
        else if (usage) step += CROSS;
      }
      const next = index(nx, ny) * 5 + direction;
      const total = here + step;
      if (total < cost[next]!) {
        cost[next] = total;
        previous[next] = node;
        heap.push(total + heuristic(nx, ny), next);
      }
    }
  }
  if (reached < 0) return null;

  const path: [number, number][] = [];
  for (let node = reached; node >= 0; node = previous[node]!) {
    const cell = Math.floor(node / 5);
    path.push([(cell % area.width) + area.x0, Math.floor(cell / area.width) + area.y0]);
  }
  return path.reverse();
}

/** Keeps only the corners of a grid path, in world coordinates. */
function corners(path: [number, number][]): Point[] {
  const points: Point[] = [];
  for (let k = 1; k < path.length - 1; k++) {
    const [ax, ay] = path[k - 1]!;
    const [bx, by] = path[k]!;
    const [cx, cy] = path[k + 1]!;
    if (bx - ax !== cx - bx || by - ay !== cy - by) points.push({ x: bx * GRID, y: by * GRID });
  }
  return points;
}

/** Marks the cells a routed path uses, so later wires keep away from it. */
function occupy(board: Board, path: [number, number][]): void {
  for (let k = 1; k < path.length; k++) {
    const [ax, ay] = path[k - 1]!;
    const [bx, by] = path[k]!;
    const bit = ay === by ? 1 : 2;
    for (const [x, y] of [
      [ax, ay],
      [bx, by],
    ] as const) {
      const cell = key(x, y);
      board.used.set(cell, (board.used.get(cell) ?? 0) | bit);
    }
  }
}

/**
 * Returns the circuit with its wires routed. Only the wires listed in `ids`
 * move (all of them when it is omitted); a wire with no possible path
 * keeps its old shape. Parts and connections never change.
 */
export function routeWires(doc: CircuitDoc, ids?: ReadonlySet<string>): CircuitDoc {
  const board = buildBoard(doc);
  const parts = partIndex(doc);
  const toCell = (point: Point): [number, number] => [Math.round(point.x / GRID), Math.round(point.y / GRID)];

  const jobs = doc.wires
    .map((wire) => {
      const from = pinWorld(doc, wire.from);
      const to = pinWorld(doc, wire.to);
      return { wire, from, to };
    })
    .filter((job): job is { wire: Wire; from: Point; to: Point } => job.from !== null && job.to !== null);

  // Wires left as they are still take up room.
  const fixed = jobs.filter((job) => ids && !ids.has(job.wire.id));
  for (const { from, wire, to } of fixed) {
    const points = [from, ...wire.points, to].map(toCell);
    for (let k = 1; k < points.length; k++) {
      const [ax, ay] = points[k - 1]!;
      const [bx, by] = points[k]!;
      if (ax !== bx && ay !== by) continue;
      const cells: [number, number][] = [];
      const steps = Math.max(Math.abs(bx - ax), Math.abs(by - ay));
      for (let s = 0; s <= steps; s++) {
        cells.push([ax + Math.sign(bx - ax) * s, ay + Math.sign(by - ay) * s]);
      }
      occupy(board, cells);
    }
  }

  // Short wires first: they have the fewest ways around.
  const pending = jobs
    .filter((job) => !ids || ids.has(job.wire.id))
    .sort(
      (a, b) =>
        Math.abs(a.from.x - a.to.x) + Math.abs(a.from.y - a.to.y) - (Math.abs(b.from.x - b.to.x) + Math.abs(b.from.y - b.to.y)),
    );

  const routed = new Map<string, Point[]>();
  for (const { wire, from, to } of pending) {
    const start = toCell(from);
    const goal = toCell(to);
    if (start[0] === goal[0] && start[1] === goal[1]) {
      routed.set(wire.id, []);
      continue;
    }
    const own = new Set<string>();
    for (const ref of [wire.from, wire.to]) {
      if (parts.has(ref.partId)) own.add(ref.partId);
    }
    const path = search(board, start, goal, own);
    if (!path) continue;
    occupy(board, path);
    routed.set(wire.id, corners(path));
  }

  if (routed.size === 0) return doc;
  return {
    ...doc,
    wires: doc.wires.map((wire) => {
      const points = routed.get(wire.id);
      return points ? { ...wire, points } : wire;
    }),
  };
}
