import type { ElementSpec, FaultRule } from '../../catalog/model';
import { getPartDef } from '../../catalog/registry';
import { localToWorld } from '../../editor/model/geometry';
import type { CircuitDoc } from '../../editor/model/types';
import {
  Bjt,
  Capacitor,
  ControlledSource,
  ControlledSwitch,
  CurrentMirror,
  Diode,
  Inductor,
  Mosfet,
  Opamp,
  PinDriver,
  Resistor,
  Transformer,
  VoltageSource,
  type Device,
} from '../solver/devices';
import type { SimInputs } from './types';

/** Turns the drawn circuit into numbered nodes and circuit elements. */

export interface NetlistElement {
  /** `${partId}:${name}` */
  id: string;
  partId: string;
  spec: ElementSpec;
}

export interface Netlist {
  /** Number of nodes including ground (node 0). */
  nodeCount: number;
  elements: NetlistElement[];
  /** Node of each connected pin, keyed by pinKey(). */
  pinNode: Map<string, number>;
  rules: { partId: string; rule: FaultRule }[];
}

export const pinKey = (partId: string, pinId: string): string => `${partId}:${pinId}`;
export const elementId = (partId: string, name: string): string => `${partId}:${name}`;

class UnionFind {
  private readonly parent: number[] = [];

  add(): number {
    this.parent.push(this.parent.length);
    return this.parent.length - 1;
  }

  find(i: number): number {
    let root = i;
    while (this.parent[root] !== root) root = this.parent[root]!;
    while (this.parent[i] !== root) {
      const next = this.parent[i]!;
      this.parent[i] = root;
      i = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

function terminals(spec: ElementSpec): number[] {
  switch (spec.kind) {
    case 'resistor':
    case 'capacitor':
    case 'inductor':
    case 'pin':
    case 'switch':
      return [spec.a, spec.b];
    case 'vsource':
    case 'source':
      return [spec.p, spec.n];
    case 'opamp':
      return [spec.inp, spec.inn, spec.out, spec.vp, spec.vn];
    case 'diode':
      return [spec.a, spec.k];
    case 'bjt':
      return [spec.c, spec.b, spec.e];
    case 'mosfet':
      return [spec.d, spec.g, spec.s];
    case 'transformer':
      return [spec.p1, spec.p2, spec.s1, spec.s2];
    case 'cccs':
      return [spec.a, spec.b, spec.c, spec.d];
  }
}

/**
 * Terminals that are galvanically linked inside the element. Isolating
 * elements (transformer, optocoupler) return one group per side, so each
 * side of the circuit can have its own ground reference.
 */
function linkedTerminals(spec: ElementSpec): number[][] {
  if (spec.kind === 'transformer') return [[spec.p1, spec.p2], [spec.s1, spec.s2]];
  if (spec.kind === 'cccs') return [[spec.a, spec.b], [spec.c, spec.d]];
  return [terminals(spec)];
}

function mapNodes(spec: ElementSpec, map: (node: number) => number): ElementSpec {
  switch (spec.kind) {
    case 'resistor':
    case 'capacitor':
    case 'inductor':
    case 'pin':
    case 'switch':
      return { ...spec, a: map(spec.a), b: map(spec.b) };
    case 'vsource':
    case 'source':
      return { ...spec, p: map(spec.p), n: map(spec.n) };
    case 'opamp':
      return {
        ...spec,
        inp: map(spec.inp),
        inn: map(spec.inn),
        out: map(spec.out),
        vp: map(spec.vp),
        vn: map(spec.vn),
      };
    case 'diode':
      return { ...spec, a: map(spec.a), k: map(spec.k) };
    case 'bjt':
      return { ...spec, c: map(spec.c), b: map(spec.b), e: map(spec.e) };
    case 'mosfet':
      return { ...spec, d: map(spec.d), g: map(spec.g), s: map(spec.s) };
    case 'transformer':
      return { ...spec, p1: map(spec.p1), p2: map(spec.p2), s1: map(spec.s1), s2: map(spec.s2) };
    case 'cccs':
      return { ...spec, a: map(spec.a), b: map(spec.b), c: map(spec.c), d: map(spec.d) };
  }
}

/**
 * Builds the netlist. Burned parts are left out (they fail open).
 * Each electrically separate island gets its own ground reference: the
 * negative terminal of a source when it has one.
 */
export function buildNetlist(
  doc: CircuitDoc,
  inputs: SimInputs,
  burned: ReadonlySet<string>,
): Netlist {
  // 1. Nets: pins joined by wires and by internal bridges.
  const nets = new UnionFind();
  const pinIndex = new Map<string, number>();
  const pinsAt = new Map<string, number>();
  for (const part of doc.parts) {
    const def = getPartDef(part.type);
    if (!def) continue;
    for (const pin of def.pins) {
      const index = nets.add();
      pinIndex.set(pinKey(part.id, pin.id), index);
      // Pins that sit on the same point touch: that is how parts plug into a breadboard.
      const at = localToWorld(part, pin.x, pin.y);
      const spot = `${at.x},${at.y}`;
      const occupant = pinsAt.get(spot);
      if (occupant === undefined) pinsAt.set(spot, index);
      else nets.union(occupant, index);
    }
    for (const [a, b] of def.bridges ?? []) {
      const ia = pinIndex.get(pinKey(part.id, a));
      const ib = pinIndex.get(pinKey(part.id, b));
      if (ia !== undefined && ib !== undefined) nets.union(ia, ib);
    }
  }
  for (const wire of doc.wires) {
    const a = pinIndex.get(pinKey(wire.from.partId, wire.from.pinId));
    const b = pinIndex.get(pinKey(wire.to.partId, wire.to.pinId));
    if (a !== undefined && b !== undefined) nets.union(a, b);
  }

  // 2. Elements, still on provisional net indices.
  const raw: NetlistElement[] = [];
  const rules: Netlist['rules'] = [];
  for (const part of doc.parts) {
    const def = getPartDef(part.type);
    if (!def?.model || burned.has(part.id)) continue;
    const internals = new Map<string, number>();
    const partInputs = inputs[part.id];
    const specs = def.model({
      props: part.props,
      pin: (pinId) => {
        const index = pinIndex.get(pinKey(part.id, pinId));
        if (index === undefined) throw new Error(`${part.type} has no pin "${pinId}"`);
        return index;
      },
      internal: (name) => {
        let index = internals.get(name);
        if (index === undefined) {
          index = nets.add();
          internals.set(name, index);
        }
        return index;
      },
      input: (name) => partInputs?.[name] ?? 0,
    });
    for (const spec of specs) {
      raw.push({ id: elementId(part.id, spec.name), partId: part.id, spec });
    }
    for (const rule of def.faults?.(part.props) ?? []) rules.push({ partId: part.id, rule });
  }

  // 3. Islands: nets linked through any element.
  const resolved = raw.map((element) => ({
    ...element,
    spec: mapNodes(element.spec, (node) => nets.find(node)),
  }));
  const islands = new UnionFind();
  const islandOf = new Map<number, number>();
  const islandIndex = (net: number): number => {
    let index = islandOf.get(net);
    if (index === undefined) {
      index = islands.add();
      islandOf.set(net, index);
    }
    return index;
  };
  for (const { spec } of resolved) {
    for (const group of linkedTerminals(spec)) {
      const [first, ...rest] = group.map(islandIndex);
      if (first === undefined) continue;
      for (const other of rest) islands.union(first, other);
    }
  }

  // 4. One ground per island, then compact node numbers.
  const groundOfIsland = new Map<number, number>();
  for (const { spec } of resolved) {
    if (spec.kind !== 'vsource') continue;
    const island = islands.find(islandIndex(spec.n));
    if (!groundOfIsland.has(island)) groundOfIsland.set(island, spec.n);
  }
  const nodeOfNet = new Map<number, number>();
  let nodeCount = 1;
  for (const { spec } of resolved) {
    for (const net of terminals(spec)) {
      if (nodeOfNet.has(net)) continue;
      const island = islands.find(islandIndex(net));
      if (!groundOfIsland.has(island)) groundOfIsland.set(island, net);
      nodeOfNet.set(net, groundOfIsland.get(island) === net ? 0 : nodeCount++);
    }
  }

  const pinNode = new Map<string, number>();
  for (const [key, index] of pinIndex) {
    const node = nodeOfNet.get(nets.find(index));
    if (node !== undefined) pinNode.set(key, node);
  }

  return {
    nodeCount,
    elements: resolved.map((element) => ({
      ...element,
      spec: mapNodes(element.spec, (net) => nodeOfNet.get(net) ?? 0),
    })),
    pinNode,
    rules,
  };
}

export function createDevice(id: string, spec: ElementSpec): Device {
  switch (spec.kind) {
    case 'resistor':
      return new Resistor(id, spec.a, spec.b, spec.ohms);
    case 'pin':
      return new PinDriver(id, spec.a, spec.b);
    case 'capacitor':
      return new Capacitor(id, spec.a, spec.b, spec.farads);
    case 'inductor':
      return new Inductor(id, spec.a, spec.b, spec.henries);
    case 'vsource':
      return new VoltageSource(id, spec.p, spec.n, spec.volts, spec.wave);
    case 'diode':
      return new Diode(id, spec.a, spec.k, spec.is, spec.n);
    case 'bjt':
      return new Bjt(id, spec.c, spec.b, spec.e, spec.polarity, spec.bf, spec.br, spec.is);
    case 'switch':
      return new ControlledSwitch(id, spec.a, spec.b, spec.ohms);
    case 'source':
      return new ControlledSource(id, spec.p, spec.n);
    case 'opamp':
      return new Opamp(
        id,
        spec.inp,
        spec.inn,
        spec.out,
        spec.vp,
        spec.vn,
        spec.gain,
        spec.headroomHigh,
        spec.headroomLow,
      );
    case 'transformer':
      return new Transformer(id, spec.p1, spec.p2, spec.s1, spec.s2, spec.l1, spec.l2, spec.k);
    case 'cccs':
      return new CurrentMirror(id, spec.a, spec.b, spec.c, spec.d, spec.gain);
    case 'mosfet':
      return new Mosfet(id, spec.d, spec.g, spec.s, spec.polarity, spec.vth, spec.kp, spec.lambda);
  }
}
