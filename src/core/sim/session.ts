import type {
  Behavior,
  BehaviorIo,
  DigitalDef,
  DigitalDevice,
  DigitalIo,
  FaultRule,
  McuDef,
  McuPin,
  PartSimState,
} from '../../catalog/model';
import { getPartDef } from '../../catalog/registry';
import { EMPTY_DOC, type CircuitDoc } from '../../editor/model/types';
import { AvrRunner } from '../avr/runner';
import { Circuit } from '../solver/circuit';
import {
  ControlledSource,
  ControlledSwitch,
  PinDriver,
  nodeV,
  type Device,
  type Measurement,
} from '../solver/devices';
import { buildNetlist, createDevice, elementId, pinKey, type Netlist } from './netlist';
import type { FaultInfo, Firmware, SimInputs, SimSnapshot, Trace } from './types';

/**
 * Time step of circuits that change over time. It adapts like SPICE's:
 * it grows while the voltages barely move, shrinks when they move fast,
 * and drops to the minimum whenever a switch, chip or relay changes state.
 * Circuits with a board (cycle-level coupling) or a recording instrument
 * (evenly spaced samples) always use the minimum.
 */
const MIN_STEP = 50e-6;
const MAX_STEP = 1e-3;
/** Largest node voltage change in one step under which the step grows, and over which it shrinks. */
const QUIET_VOLTS = 0.01;
const BUSY_VOLTS = 0.05;
const DEFAULT_TOLERANCE = 0.2;
/** Overloads this many times the limit fail at once. */
const INSTANT_RATIO = 5;
/** Steps between wall-clock checks: fewer when a CPU is being emulated. */
const BUDGET_INTERVAL = 32;
const BUDGET_INTERVAL_MCU = 4;
/** Early stops at pin changes allowed in a row before falling back to averaging. */
const MAX_BURST = 64;
/** Time constant of the slow averages reported for meters. */
const SLOW_TAU = 0.2;

const UNITS: Record<FaultRule['quantity'], string> = {
  current: 'A',
  power: 'W',
  voltage: 'V',
  'reverse-voltage': 'V',
};

function quantityOf(rule: FaultRule, m: Measurement): number {
  switch (rule.quantity) {
    case 'current':
      return Math.abs(m.i);
    case 'power':
      return Math.abs(m.p);
    case 'voltage':
      return Math.abs(m.v);
    case 'reverse-voltage':
      return Math.max(0, -m.v);
  }
}

interface ActiveRule {
  key: string;
  partId: string;
  rule: FaultRule;
  device: Device;
}

/** A part's main element, with its measurement integrated over an advance(). */
interface Probe {
  partId: string;
  device: Device;
  last: Measurement;
  v: number;
  i: number;
  p: number;
  /** Slow averages of v, i, v² and i². */
  meanV: number;
  meanI: number;
  meanV2: number;
  meanI2: number;
  primed: boolean;
}

/** A part with logic of its own, and its memory. */
interface ActiveBehavior {
  partId: string;
  behavior: Behavior;
  state: Record<string, number>;
  io: BehaviorIo;
  /** False once the part has burned. */
  active: boolean;
}

/** A module with protocol logic, and the board pins its own pins reach. */
interface ActiveDigital {
  def: DigitalDef;
  device: DigitalDevice;
  io: DigitalIo;
  links: Map<string, { board: Board; pin: McuPin }>;
  active: boolean;
}

/** Resistors up to this value still count as a direct connection to a board pin. */
const LINK_MAX_OHMS = 1000;

/** An extra current reported to a footprint, integrated over an advance(). */
interface AuxProbe {
  partId: string;
  key: string;
  device: Device;
  last: number;
  sum: number;
}

/** An instrument whose channels are sampled on every step. */
interface Recorder {
  partId: string;
  channels: (Device | undefined)[];
}

interface Board {
  partId: string;
  mcu: McuDef;
  runner: AvrRunner;
  decoder: TextDecoder;
  /** Time-weighted level of the on-board LED over an advance(). */
  led: number;
}

/** One running simulation: solver, emulated boards and fault tracking. */
export class SimSession {
  private doc: CircuitDoc = EMPTY_DOC;
  private inputs: SimInputs = {};
  private netlist: Netlist = { nodeCount: 1, elements: [], pinNode: new Map(), rules: [] };
  private circuit = new Circuit(1, []);
  private devices = new Map<string, Device>();
  private rules: ActiveRule[] = [];
  private probes: Probe[] = [];
  private readonly boards = new Map<string, Board>();
  private recorders: Recorder[] = [];
  private auxProbes: AuxProbe[] = [];
  private readonly behaviors = new Map<string, ActiveBehavior>();
  private readonly behaviorAux = new Map<string, Record<string, number>>();
  private readonly digitals = new Map<string, ActiveDigital>();
  /** Consecutive steps cut short by a pin change. */
  private burst = 0;
  /** Samples not yet delivered in a snapshot. */
  private readonly traces = new Map<string, Trace>();
  private readonly burned = new Map<string, FaultInfo>();
  /** Accumulated overload per rule, in seconds weighted by excess. */
  private readonly damage = new Map<string, number>();
  private warnings: FaultInfo[] = [];
  private time = 0;
  private converged = true;
  /** The circuit changed since it was last solved. */
  private stale = true;
  /** Step to try next (adaptive), and the voltages after the last step to compare with. */
  private nextStep = MIN_STEP;
  private lastVoltages = new Float64Array(0);
  /** Simulated time covered by the probes' integrals. */
  private window = 0;

  /** Starts from the DC operating point of the circuit. */
  load(doc: CircuitDoc, inputs: SimInputs, burned: readonly FaultInfo[], firmware: Firmware): void {
    this.doc = doc;
    this.inputs = inputs;
    this.burned.clear();
    for (const info of burned) this.burned.set(info.partId, info);
    this.damage.clear();
    this.warnings = [];
    this.time = 0;
    this.probes = [];
    this.traces.clear();
    this.behaviors.clear();
    this.behaviorAux.clear();
    this.digitals.clear();
    this.burst = 0;

    this.boards.clear();
    for (const part of doc.parts) {
      const mcu = getPartDef(part.type)?.mcu;
      const hex = firmware[part.id];
      if (!mcu || !hex) continue;
      this.boards.set(part.id, {
        partId: part.id,
        mcu,
        runner: new AvrRunner(hex, mcu.chip),
        decoder: new TextDecoder(),
        led: 0,
      });
    }

    this.build(false);
    this.converged = this.circuit.solveDc();
    this.stale = false;
    // Let chips and relays settle on the starting state.
    for (let round = 0; round < 8 && this.converged; round++) {
      this.runBehaviors(0);
      if (!this.stale) break;
      this.converged = this.circuit.solveDc();
      this.stale = false;
    }
    this.refreshProbes();
    for (const board of this.boards.values()) board.runner.sense(this.circuit.x);
    this.tickDigitals(0);
  }

  /** Applies an edited document or new inputs, keeping the electrical state. */
  update(doc: CircuitDoc, inputs: SimInputs): void {
    this.doc = doc;
    this.inputs = inputs;
    this.build(true);
  }

  repair(partIds: readonly string[] | null): void {
    const ids = partIds ?? [...this.burned.keys()];
    for (const id of ids) {
      this.burned.delete(id);
      for (const key of [...this.damage.keys()]) {
        if (key.startsWith(`${id}:`)) this.damage.delete(key);
      }
    }
    this.build(true);
  }

  serialWrite(partId: string, text: string): void {
    this.boards.get(partId)?.runner.serialWrite(new TextEncoder().encode(text));
  }

  private createIo(partId: string): BehaviorIo {
    const volts = (pin: string): number => {
      const node = this.netlist.pinNode.get(pinKey(partId, pin));
      return node === undefined ? 0 : nodeV(this.circuit.x, node);
    };
    return {
      props: {},
      dt: 0,
      v: (pin, ref) => volts(pin) - volts(ref),
      connected: (pin) => this.netlist.pinNode.has(pinKey(partId, pin)),
      i: (element) => this.devices.get(elementId(partId, element))?.measure(this.circuit.x).i ?? 0,
      input: (name) => this.inputs[partId]?.[name] ?? 0,
      setSwitch: (element, closed) => {
        const device = this.devices.get(elementId(partId, element));
        if (device instanceof ControlledSwitch && device.setClosed(closed)) this.stale = true;
      },
      setSource: (element, value) => {
        const device = this.devices.get(elementId(partId, element));
        if (device instanceof ControlledSource && device.setVolts(value)) this.stale = true;
      },
      aux: (key, value) => this.reportAux(partId, key, value),
    };
  }

  private reportAux(partId: string, key: string, value: number): void {
    let values = this.behaviorAux.get(partId);
    if (!values) this.behaviorAux.set(partId, (values = {}));
    values[key] = value;
  }

  private createDigitalIo(partId: string, links: ActiveDigital['links']): DigitalIo {
    const volts = (pin: string): number => {
      const node = this.netlist.pinNode.get(pinKey(partId, pin));
      return node === undefined ? 0 : nodeV(this.circuit.x, node);
    };
    const board = (): Board | undefined => links.values().next().value?.board;
    return {
      props: {},
      now: () => board()?.runner.seconds ?? this.time,
      v: (pin, ref) => volts(pin) - volts(ref),
      level: (pin, ref) => {
        const link = links.get(pin);
        const driven = link ? link.board.runner.outputLevel(link.pin) : null;
        return driven ?? volts(pin) - volts(ref) > 2;
      },
      linked: (pin) => links.has(pin),
      drive: (pin, level) => {
        const link = links.get(pin);
        if (link) link.board.runner.override(link.pin, level);
      },
      after: (seconds, task) => board()?.runner.after(seconds, task),
      aux: (key, value) => this.reportAux(partId, key, value),
    };
  }

  /** Finds which module pins reach which board pins and attaches their protocol logic. */
  private linkDigitals(): void {
    for (const board of this.boards.values()) board.runner.clearLinks();

    // Nets joined by a small series resistor count as one for digital signals.
    const parent = Array.from({ length: this.netlist.nodeCount }, (_, index) => index);
    const find = (node: number): number => {
      let root = node;
      while (parent[root] !== root) root = parent[root] ?? root;
      return root;
    };
    for (const { spec } of this.netlist.elements) {
      if (spec.kind === 'resistor' && spec.ohms <= LINK_MAX_OHMS && spec.a > 0 && spec.b > 0) {
        parent[find(spec.a)] = find(spec.b);
      }
    }
    const owners = new Map<number, { board: Board; pin: McuPin }>();
    for (const board of this.boards.values()) {
      if (this.burned.has(board.partId)) continue;
      for (const pin of board.mcu.pins) {
        const node = this.netlist.pinNode.get(pinKey(board.partId, pin.id));
        if (!pin.port || node === undefined || node === 0) continue;
        const root = find(node);
        if (!owners.has(root)) owners.set(root, { board, pin });
      }
    }

    for (const part of this.doc.parts) {
      const partDef = getPartDef(part.type);
      const def = partDef?.digital;
      if (!partDef || !def) continue;
      let entry = this.digitals.get(part.id);
      if (!entry) {
        const links: ActiveDigital['links'] = new Map();
        const io = this.createDigitalIo(part.id, links);
        io.props = part.props;
        entry = { def, device: def.create(io), io, links, active: true };
        this.digitals.set(part.id, entry);
      }
      const { device, links } = entry;
      entry.io.props = part.props;
      entry.active = !this.burned.has(part.id);
      links.clear();
      if (!entry.active) continue;
      for (const pin of partDef.pins) {
        const node = this.netlist.pinNode.get(pinKey(part.id, pin.id));
        const owner = node === undefined || node === 0 ? undefined : owners.get(find(node));
        if (owner) links.set(pin.id, owner);
      }
      for (const pin of def.watch ?? []) {
        const link = links.get(pin);
        if (link) link.board.runner.watch(link.pin, (drive) => device.edge?.(pin, drive));
      }
      if (def.i2c && device.i2c) {
        const sda = links.get(def.i2c.sda);
        const scl = links.get(def.i2c.scl);
        const bus = sda?.board.mcu.i2c;
        if (sda && scl && sda.board === scl.board && bus?.sda === sda.pin.id && bus.scl === scl.pin.id) {
          sda.board.runner.addI2c(def.i2c.address(part.props), device.i2c);
        }
      }
      if (def.spi && device.spi) {
        const mosi = links.get(def.spi.mosi);
        const sck = links.get(def.spi.sck);
        const bus = mosi?.board.mcu.spi;
        if (mosi && sck && mosi.board === sck.board && bus?.mosi === mosi.pin.id && bus.sck === sck.pin.id) {
          mosi.board.runner.addSpi((byte) => device.spi?.(byte) ?? 0);
        }
      }
    }
  }

  private tickDigitals(dt: number): void {
    for (const entry of this.digitals.values()) {
      if (entry.active) entry.device.tick?.(dt);
    }
  }

  private runBehaviors(dt: number): void {
    for (const entry of this.behaviors.values()) {
      if (!entry.active) continue;
      entry.io.dt = dt;
      entry.behavior.update(entry.io, entry.state);
    }
  }

  /** Chooses the next step from how much the node voltages moved in this one. */
  private adaptStep(step: number): void {
    const { x, nodes } = this.circuit;
    if (this.lastVoltages.length !== nodes) {
      this.lastVoltages = Float64Array.from(x.subarray(0, nodes));
      this.nextStep = MIN_STEP;
      return;
    }
    let change = 0;
    for (let i = 0; i < nodes; i++) {
      change = Math.max(change, Math.abs(x[i]! - this.lastVoltages[i]!));
      this.lastVoltages[i] = x[i]!;
    }
    if (change > BUSY_VOLTS) this.nextStep = Math.max(MIN_STEP, step / 2);
    else if (change < QUIET_VOLTS) this.nextStep = Math.min(MAX_STEP, this.nextStep * 1.5);
  }

  private build(keepState: boolean): void {
    this.nextStep = MIN_STEP;
    this.lastVoltages = new Float64Array(0);
    const previous = keepState
      ? {
          states: new Map([...this.devices].map(([id, device]) => [id, device.state()])),
          voltages: new Map(
            [...this.netlist.pinNode].map(([key, node]) => [key, nodeV(this.circuit.x, node)]),
          ),
        }
      : null;

    this.netlist = buildNetlist(this.doc, this.inputs, new Set(this.burned.keys()));
    this.devices = new Map(
      this.netlist.elements.map((element) => [element.id, createDevice(element.id, element.spec)]),
    );
    this.circuit = new Circuit(this.netlist.nodeCount, [...this.devices.values()]);
    this.circuit.time = this.time;

    this.rules = [];
    this.netlist.rules.forEach(({ partId, rule }, index) => {
      const device = this.devices.get(elementId(partId, rule.element));
      if (device) this.rules.push({ key: `${partId}:${index}`, partId, rule, device });
    });

    if (previous) {
      for (const [id, device] of this.devices) {
        const state = previous.states.get(id);
        if (state) device.restore(state);
      }
      // Seed Newton with the voltages each net had before the change.
      for (const [key, node] of this.netlist.pinNode) {
        const voltage = previous.voltages.get(key);
        if (node > 0 && voltage !== undefined) this.circuit.x[node - 1] = voltage;
      }
      this.circuit.discontinuity();
    }

    for (const board of this.boards.values()) {
      const pins = [];
      for (const pin of board.mcu.pins) {
        const driver = this.devices.get(elementId(board.partId, `pin:${pin.id}`));
        if (driver instanceof PinDriver) pins.push({ pin, driver });
      }
      // A burned board has no drivers: the CPU keeps running, disconnected.
      board.runner.bind(pins);
    }
    this.linkDigitals();

    const oldProbes = new Map(this.probes.map((probe) => [probe.partId, probe]));
    this.probes = [];
    this.recorders = [];
    this.auxProbes = [];
    for (const part of this.doc.parts) {
      const behavior = getPartDef(part.type)?.behavior;
      if (behavior) {
        let entry = this.behaviors.get(part.id);
        if (!entry) {
          entry = {
            partId: part.id,
            behavior,
            state: behavior.init(part.props),
            io: this.createIo(part.id),
            active: true,
          };
          this.behaviors.set(part.id, entry);
        }
        entry.io.props = part.props;
        entry.active = !this.burned.has(part.id);
      }
      for (const [key, name] of Object.entries(getPartDef(part.type)?.probes ?? {})) {
        const probed = this.devices.get(elementId(part.id, name));
        if (probed) this.auxProbes.push({ partId: part.id, key, device: probed, last: 0, sum: 0 });
      }
      const device = this.devices.get(elementId(part.id, 'main'));
      if (device) {
        const old = oldProbes.get(part.id);
        this.probes.push({
          partId: part.id,
          device,
          last: { v: 0, i: 0, p: 0 },
          v: 0,
          i: 0,
          p: 0,
          meanV: old?.meanV ?? 0,
          meanI: old?.meanI ?? 0,
          meanV2: old?.meanV2 ?? 0,
          meanI2: old?.meanI2 ?? 0,
          primed: old?.primed ?? false,
        });
      }
      const scope = getPartDef(part.type)?.scope;
      if (scope) {
        this.recorders.push({
          partId: part.id,
          channels: scope.channels.map((name) => this.devices.get(elementId(part.id, name))),
        });
        if (!this.traces.has(part.id)) {
          this.traces.set(part.id, { t: [], ch: scope.channels.map(() => []) });
        }
      }
    }
    this.window = 0;
    this.stale = true;
  }

  private refreshProbes(): void {
    for (const probe of this.probes) probe.last = probe.device.measure(this.circuit.x);
    for (const probe of this.auxProbes) probe.last = probe.device.measure(this.circuit.x).i;
  }

  /** Returns true when a part failed during this step. */
  private checkFaults(dt: number): boolean {
    let failed = false;
    this.warnings = [];
    for (const { key, partId, rule, device } of this.rules) {
      if (this.burned.has(partId)) continue;
      const value = quantityOf(rule, device.measure(this.circuit.x));
      const ratio = value / rule.max;
      if (ratio <= 1) {
        const left = (this.damage.get(key) ?? 0) - dt;
        if (left > 0) this.damage.set(key, left);
        else this.damage.delete(key);
        continue;
      }
      const info: FaultInfo = {
        partId,
        cause: rule.cause,
        value,
        limit: rule.max,
        unit: UNITS[rule.quantity],
      };
      if (rule.action === 'warn') {
        // One warning per part is enough (a board has a rule per pin).
        if (!this.warnings.some((w) => w.partId === partId && w.cause === rule.cause)) {
          this.warnings.push(info);
        }
        continue;
      }
      const damage = (this.damage.get(key) ?? 0) + (ratio * ratio - 1) * dt;
      if (ratio >= INSTANT_RATIO || damage >= (rule.tolerance ?? DEFAULT_TOLERANCE)) {
        this.burned.set(partId, info);
        failed = true;
      } else {
        this.damage.set(key, damage);
      }
    }
    return failed;
  }

  /**
   * Advances up to `dt` simulated seconds, stopping early when `budgetMs` of
   * wall time is used up (the simulation then runs slower than requested).
   */
  advance(dt: number, budgetMs: number): SimSnapshot {
    const started = performance.now();
    const hasBoards = this.boards.size > 0;
    const interval = hasBoards ? BUDGET_INTERVAL_MCU : BUDGET_INTERVAL;
    let remaining = dt;
    let steps = 0;
    for (const probe of this.probes) probe.v = probe.i = probe.p = 0;
    for (const probe of this.auxProbes) probe.sum = 0;
    for (const board of this.boards.values()) board.led = 0;
    this.window = 0;

    while (remaining > 1e-12) {
      // A circuit without memory or CPUs needs a single solve for the whole interval.
      const timed =
        this.circuit.hasDynamic || hasBoards || this.behaviors.size > 0 || this.digitals.size > 0;
      let step = remaining;
      let atBreakpoint = false;
      if (timed && (hasBoards || this.recorders.length > 0)) {
        step = Math.min(MIN_STEP, remaining);
      } else if (timed) {
        step = Math.min(this.nextStep, MAX_STEP, remaining);
        // Land exactly on the edges of square waves and the peaks of triangles.
        const breakpoint = this.circuit.nextBreakpoint(this.time) - this.time;
        if (breakpoint > 1e-9 && breakpoint <= step) {
          step = breakpoint;
          atBreakpoint = true;
        }
      }

      let first = true;
      for (const board of this.boards.values()) {
        // The first board may stop at a pin change: the circuit then reacts
        // before the program reads its inputs again.
        const result = board.runner.run(step, first && this.burst < MAX_BURST);
        if (first) {
          if (result.seconds < step) {
            step = result.seconds;
            this.burst += 1;
          } else {
            this.burst = 0;
          }
          first = false;
        }
        if (result.changed) this.stale = true;
      }

      if (this.stale || this.circuit.hasDynamic) {
        this.circuit.time = this.time;
        this.converged = this.circuit.step(step);
        this.stale = false;
        if (this.converged) {
          this.refreshProbes();
          for (const board of this.boards.values()) board.runner.sense(this.circuit.x);
          this.adaptStep(step);
        }
      } else {
        // Nothing to recompute: the circuit is at rest.
        this.nextStep = Math.min(MAX_STEP, this.nextStep * 1.5);
      }
      if (atBreakpoint) this.nextStep = MIN_STEP;
      this.time += step;
      remaining -= step;
      if (!this.converged) break;

      const blend = 1 - Math.exp(-step / SLOW_TAU);
      for (const probe of this.probes) {
        const { v, i, p } = probe.last;
        probe.v += v * step;
        probe.i += i * step;
        probe.p += p * step;
        if (probe.primed) {
          probe.meanV += blend * (v - probe.meanV);
          probe.meanI += blend * (i - probe.meanI);
          probe.meanV2 += blend * (v * v - probe.meanV2);
          probe.meanI2 += blend * (i * i - probe.meanI2);
        } else {
          probe.meanV = v;
          probe.meanI = i;
          probe.meanV2 = v * v;
          probe.meanI2 = i * i;
          probe.primed = true;
        }
      }
      for (const probe of this.auxProbes) probe.sum += probe.last * step;
      for (const recorder of this.recorders) {
        const trace = this.traces.get(recorder.partId);
        if (!trace) continue;
        trace.t.push(this.time);
        recorder.channels.forEach((device, k) => {
          trace.ch[k]?.push(device ? device.measure(this.circuit.x).v : 0);
        });
      }
      for (const board of this.boards.values()) {
        if (board.mcu.led) board.led += board.runner.duty(board.mcu.led) * step;
      }
      this.window += step;

      if (this.checkFaults(step)) {
        const { probes, window } = this;
        this.build(true);
        // Keep what was integrated so far for the parts that still exist.
        for (const probe of this.probes) {
          const old = probes.find((candidate) => candidate.partId === probe.partId);
          if (old) Object.assign(probe, { v: old.v, i: old.i, p: old.p, last: old.last });
        }
        this.window = window;
      }
      // After the fault check: a switch that has just moved still carries the
      // voltages of the previous solution, which must not count as overloads.
      this.runBehaviors(step);
      this.tickDigitals(step);
      // Something switched: the next step starts small again.
      if (this.stale) this.nextStep = MIN_STEP;
      steps += 1;
      if (steps % interval === 0 && performance.now() - started > budgetMs) break;
    }
    return this.snapshot();
  }

  snapshot(): SimSnapshot {
    const parts: Record<string, PartSimState> = {};
    const window = this.window;
    for (const probe of this.probes) {
      // Averages over the advance() interval, so PWM and AC read steady values.
      const state: PartSimState =
        window > 0
          ? { v: probe.v / window, i: probe.i / window, p: probe.p / window }
          : { ...probe.last };
      if (probe.primed) {
        state.vMean = probe.meanV;
        state.iMean = probe.meanI;
        state.vRms = Math.sqrt(Math.max(0, probe.meanV2));
        state.iRms = Math.sqrt(Math.max(0, probe.meanI2));
      }
      parts[probe.partId] = state;
    }
    for (const probe of this.auxProbes) {
      const state = (parts[probe.partId] ??= { v: 0, i: 0, p: 0 });
      (state.aux ??= {})[probe.key] = window > 0 ? probe.sum / window : probe.last;
    }
    for (const [partId, values] of this.behaviorAux) {
      const state = (parts[partId] ??= { v: 0, i: 0, p: 0 });
      state.aux = { ...state.aux, ...values };
    }
    const traces: Record<string, Trace> = {};
    for (const [partId, trace] of this.traces) {
      if (trace.t.length === 0) continue;
      traces[partId] = { t: trace.t, ch: trace.ch };
      this.traces.set(partId, { t: [], ch: trace.ch.map(() => []) });
    }
    const serial: Record<string, string> = {};
    for (const board of this.boards.values()) {
      const state = parts[board.partId];
      if (state) state.aux = { ...state.aux, led: window > 0 ? board.led / window : 0 };
      const bytes = board.runner.takeSerialOutput();
      if (bytes.length > 0) serial[board.partId] = board.decoder.decode(bytes, { stream: true });
    }
    return {
      time: this.time,
      converged: this.converged,
      parts,
      burned: [...this.burned.values()],
      warnings: this.warnings,
      serial,
      traces,
    };
  }
}
