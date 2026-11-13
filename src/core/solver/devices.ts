import { THERMAL_VOLTAGE, type Waveform } from '../../catalog/model';

/**
 * Circuit elements for modified nodal analysis. Node 0 is ground; node k > 0
 * is unknown k-1. Elements that need their current as an unknown (voltage
 * sources, inductors) get a branch row after the node rows.
 */

/** State of one Newton iteration, shared by all devices while stamping. */
export interface Solve {
  /** Number of unknowns. */
  n: number;
  a: Float64Array;
  b: Float64Array;
  /** Current iterate: node voltages, then branch currents. */
  x: Float64Array;
  /** Time step; 0 means DC analysis. */
  dt: number;
  /** Trapezoidal integration instead of Backward Euler. */
  trap: boolean;
  /** Time at the end of the step being solved. */
  time: number;
  gmin: number;
  /** Scale of independent sources (source stepping). */
  srcScale: number;
  /** Set by devices that limited a junction voltage this iteration. */
  limited: boolean;
}

export interface Measurement {
  v: number;
  i: number;
  p: number;
}

export interface Device {
  readonly id: string;
  /** Extra unknowns (branch currents) this device needs. */
  readonly branchCount: number;
  /** Index of its first branch unknown; assigned by the circuit. */
  branch: number;
  readonly nonlinear: boolean;
  /** Has memory (capacitor, inductor) or changes with time (waveform source). */
  readonly dynamic: boolean;
  stamp(s: Solve): void;
  /** Called once the step has converged, to store history. */
  accept(s: Solve): void;
  measure(x: Float64Array): Measurement;
  /** Next instant after `time` where its value jumps or turns; the time step stops there. */
  nextBreakpoint?(time: number): number;
  /** Memory that must survive a netlist rebuild. */
  state(): number[];
  restore(state: number[]): void;
}

export const nodeV = (x: Float64Array, node: number): number => (node === 0 ? 0 : x[node - 1]!);

function addA(s: Solve, row: number, col: number, value: number): void {
  if (row === 0 || col === 0) return;
  const k = (row - 1) * s.n + (col - 1);
  s.a[k] = s.a[k]! + value;
}

function addB(s: Solve, row: number, value: number): void {
  if (row === 0) return;
  s.b[row - 1] = s.b[row - 1]! + value;
}

/** Conductance g between two nodes. */
function stampG(s: Solve, n1: number, n2: number, g: number): void {
  addA(s, n1, n1, g);
  addA(s, n2, n2, g);
  addA(s, n1, n2, -g);
  addA(s, n2, n1, -g);
}

/** Known current i flowing through the device from node `from` to node `to`. */
function stampI(s: Solve, from: number, to: number, i: number): void {
  addB(s, from, -i);
  addB(s, to, i);
}

/** Couples a branch unknown (current flowing a → b) into the node equations. */
function stampBranch(s: Solve, a: number, b: number, branch: number): void {
  const col = branch + 1;
  addA(s, a, col, 1);
  addA(s, b, col, -1);
  addA(s, col, a, 1);
  addA(s, col, b, -1);
}

/** Diode current and conductance, with a linear continuation to avoid overflow. */
function junction(v: number, is: number, nvt: number): [number, number] {
  const arg = v / nvt;
  if (arg > 80) {
    const e = Math.exp(80);
    return [is * (e * (1 + arg - 80) - 1), (is * e) / nvt];
  }
  const e = Math.exp(arg);
  return [is * (e - 1), (is * e) / nvt];
}

const criticalVoltage = (is: number, nvt: number): number =>
  nvt * Math.log(nvt / (Math.SQRT2 * is));

/** SPICE junction voltage limiting: keeps Newton from overshooting the exponential. */
function pnjlim(vNew: number, vOld: number, nvt: number, vCrit: number): number {
  if (vNew > vCrit && Math.abs(vNew - vOld) > 2 * nvt) {
    if (vOld > 0) {
      const arg = 1 + (vNew - vOld) / nvt;
      return arg > 0 ? vOld + nvt * Math.log(arg) : vCrit;
    }
    return nvt * Math.log(vNew / nvt);
  }
  return vNew;
}

function clampStep(v: number, last: number, maxStep: number): number {
  if (v - last > maxStep) return last + maxStep;
  if (last - v > maxStep) return last - maxStep;
  return v;
}

abstract class Base {
  branch = -1;
  readonly branchCount: number = 0;
  readonly nonlinear: boolean = false;
  readonly dynamic: boolean = false;
  constructor(readonly id: string) {}
  accept(_s: Solve): void {}
  state(): number[] {
    return [];
  }
  restore(_state: number[]): void {}
}

export class Resistor extends Base implements Device {
  constructor(
    id: string,
    private readonly a: number,
    private readonly b: number,
    private readonly ohms: number,
  ) {
    super(id);
  }

  stamp(s: Solve): void {
    stampG(s, this.a, this.b, 1 / this.ohms);
  }

  measure(x: Float64Array): Measurement {
    const v = nodeV(x, this.a) - nodeV(x, this.b);
    const i = v / this.ohms;
    return { v, i, p: v * i };
  }
}

/**
 * I/O pin of a microcontroller, set by the emulator: a voltage behind the
 * output resistance when driving, a weak pull-up or nothing when reading.
 */
export class PinDriver extends Base implements Device {
  private static readonly OUTPUT_OHMS = 25;
  private static readonly PULLUP_OHMS = 35_000;
  private static readonly PULLUP_VOLTS = 5;
  /** 0 = high impedance, 1 = input with pull-up, 2 = output. */
  private mode = 0;
  private volts = 0;

  constructor(
    id: string,
    private readonly node: number,
    private readonly gnd: number,
  ) {
    super(id);
  }

  /** Returns true when the driver changed (the circuit must be solved again). */
  setOutput(volts: number): boolean {
    if (this.mode === 2 && Math.abs(volts - this.volts) < 1e-6) return false;
    this.mode = 2;
    this.volts = volts;
    return true;
  }

  setInput(pullUp: boolean): boolean {
    const mode = pullUp ? 1 : 0;
    if (this.mode === mode) return false;
    this.mode = mode;
    return true;
  }

  private conductance(): number {
    if (this.mode === 2) return 1 / PinDriver.OUTPUT_OHMS;
    return this.mode === 1 ? 1 / PinDriver.PULLUP_OHMS : 0;
  }

  private target(): number {
    return this.mode === 2 ? this.volts : PinDriver.PULLUP_VOLTS;
  }

  stamp(s: Solve): void {
    const g = this.conductance();
    if (g === 0) return;
    stampG(s, this.node, this.gnd, g);
    stampI(s, this.gnd, this.node, g * this.target());
  }

  /** Pin voltage relative to the board ground. */
  voltage(x: Float64Array): number {
    return nodeV(x, this.node) - nodeV(x, this.gnd);
  }

  /** i is the current flowing out of the pin into the circuit. */
  measure(x: Float64Array): Measurement {
    const v = this.voltage(x);
    const i = this.conductance() * (this.target() - v);
    return { v, i, p: (this.target() - v) * i };
  }

  override state(): number[] {
    return [this.mode, this.volts];
  }

  override restore(state: number[]): void {
    this.mode = state[0] ?? 0;
    this.volts = state[1] ?? 0;
  }
}

export class Capacitor extends Base implements Device {
  override readonly dynamic = true;
  private vPrev = 0;
  private iPrev = 0;

  constructor(
    id: string,
    private readonly a: number,
    private readonly b: number,
    private readonly farads: number,
  ) {
    super(id);
  }

  private current(s: Solve, v: number): number {
    if (s.dt === 0) return 0;
    const geq = ((s.trap ? 2 : 1) * this.farads) / s.dt;
    return geq * (v - this.vPrev) - (s.trap ? this.iPrev : 0);
  }

  stamp(s: Solve): void {
    if (s.dt === 0) return; // open circuit in DC
    const geq = ((s.trap ? 2 : 1) * this.farads) / s.dt;
    stampG(s, this.a, this.b, geq);
    stampI(s, this.a, this.b, -geq * this.vPrev - (s.trap ? this.iPrev : 0));
  }

  override accept(s: Solve): void {
    const v = nodeV(s.x, this.a) - nodeV(s.x, this.b);
    this.iPrev = this.current(s, v);
    this.vPrev = v;
  }

  measure(x: Float64Array): Measurement {
    const v = nodeV(x, this.a) - nodeV(x, this.b);
    return { v, i: this.iPrev, p: v * this.iPrev };
  }

  override state(): number[] {
    return [this.vPrev, this.iPrev];
  }

  override restore(state: number[]): void {
    this.vPrev = state[0] ?? 0;
    this.iPrev = state[1] ?? 0;
  }
}

export class Inductor extends Base implements Device {
  override readonly branchCount = 1;
  override readonly dynamic = true;
  private iPrev = 0;
  private vPrev = 0;

  constructor(
    id: string,
    private readonly a: number,
    private readonly b: number,
    private readonly henries: number,
  ) {
    super(id);
  }

  stamp(s: Solve): void {
    const row = this.branch + 1;
    stampBranch(s, this.a, this.b, this.branch);
    if (s.dt === 0) {
      // Short circuit in DC; the tiny resistance keeps inductor loops solvable.
      addA(s, row, row, -1e-6);
      return;
    }
    const req = ((s.trap ? 2 : 1) * this.henries) / s.dt;
    addA(s, row, row, -req);
    addB(s, row, -req * this.iPrev - (s.trap ? this.vPrev : 0));
  }

  override accept(s: Solve): void {
    this.iPrev = s.x[this.branch]!;
    this.vPrev = nodeV(s.x, this.a) - nodeV(s.x, this.b);
  }

  measure(x: Float64Array): Measurement {
    const v = nodeV(x, this.a) - nodeV(x, this.b);
    const i = x[this.branch]!;
    return { v, i, p: v * i };
  }

  override state(): number[] {
    return [this.iPrev, this.vPrev];
  }

  override restore(state: number[]): void {
    this.iPrev = state[0] ?? 0;
    this.vPrev = state[1] ?? 0;
  }
}

/** Switch set from outside the solver: a resistance when closed, nothing when open. */
export class ControlledSwitch extends Base implements Device {
  private closed = false;

  constructor(
    id: string,
    private readonly a: number,
    private readonly b: number,
    private readonly ohms: number,
  ) {
    super(id);
  }

  /** Returns true when the state changed (the circuit must be solved again). */
  setClosed(closed: boolean): boolean {
    if (closed === this.closed) return false;
    this.closed = closed;
    return true;
  }

  stamp(s: Solve): void {
    if (this.closed) stampG(s, this.a, this.b, 1 / this.ohms);
  }

  measure(x: Float64Array): Measurement {
    const v = nodeV(x, this.a) - nodeV(x, this.b);
    const i = this.closed ? v / this.ohms : 0;
    return { v, i, p: v * i };
  }

  override state(): number[] {
    return [this.closed ? 1 : 0];
  }

  override restore(state: number[]): void {
    this.closed = state[0] === 1;
  }
}

/** Voltage source set from outside the solver (e.g. the back-EMF of a motor). */
export class ControlledSource extends Base implements Device {
  override readonly branchCount = 1;
  private volts = 0;

  constructor(
    id: string,
    private readonly p: number,
    private readonly n: number,
  ) {
    super(id);
  }

  setVolts(volts: number): boolean {
    if (Math.abs(volts - this.volts) < 1e-9) return false;
    this.volts = volts;
    return true;
  }

  stamp(s: Solve): void {
    stampBranch(s, this.p, this.n, this.branch);
    addB(s, this.branch + 1, this.volts * s.srcScale);
  }

  /** i is the current delivered out of the positive terminal. */
  measure(x: Float64Array): Measurement {
    const v = nodeV(x, this.p) - nodeV(x, this.n);
    const i = -x[this.branch]!;
    return { v, i, p: v * i };
  }

  override state(): number[] {
    return [this.volts];
  }

  override restore(state: number[]): void {
    this.volts = state[0] ?? 0;
  }
}

/**
 * Operational amplifier as a saturating voltage-controlled source. The
 * output swings smoothly (tanh) between limits set by the supply pins.
 */
export class Opamp extends Base implements Device {
  override readonly branchCount = 1;
  override readonly nonlinear = true;

  constructor(
    id: string,
    private readonly inp: number,
    private readonly inn: number,
    private readonly out: number,
    private readonly vp: number,
    private readonly vn: number,
    private readonly gain: number,
    private readonly headroomHigh: number,
    private readonly headroomLow: number,
  ) {
    super(id);
  }

  /** Normalized differential input used in the previous iteration. */
  private uLast = 0;

  stamp(s: Solve): void {
    const row = this.branch + 1;
    // The branch current is what the output sources into its node.
    addA(s, this.out, row, -1);
    const high = nodeV(s.x, this.vp) - this.headroomHigh;
    const low = nodeV(s.x, this.vn) + this.headroomLow;
    const mid = (high + low) / 2;
    const half = (high - low) / 2;
    addA(s, row, this.out, 1);
    if (half <= 1e-6) {
      // Not powered: the output just sits between the rails.
      this.uLast = 0;
      addB(s, row, mid);
      return;
    }
    const raw = (this.gain * (nodeV(s.x, this.inp) - nodeV(s.x, this.inn))) / half;
    // Limiting: Newton may not jump from one saturated side to the other,
    // where the slope is zero; it has to pass through the linear region.
    const last = this.uLast;
    let u = raw;
    if (last > 3) u = raw < last ? Math.max(raw, 1) : raw;
    else if (last < -3) u = raw > last ? Math.min(raw, -1) : raw;
    else u = Math.max(last - 2, Math.min(last + 2, raw));
    if (Math.abs(u - raw) > 1e-9) s.limited = true;
    u = Math.max(-40, Math.min(40, u));
    this.uLast = u;
    const vd = (u * half) / this.gain;
    const th = Math.tanh(u);
    const slope = this.gain * (1 - th * th);
    addA(s, row, this.inp, -slope);
    addA(s, row, this.inn, slope);
    addB(s, row, mid + half * th - slope * vd);
  }

  /** v = output voltage, i = current sourced by the output. */
  measure(x: Float64Array): Measurement {
    return { v: nodeV(x, this.out), i: x[this.branch]!, p: 0 };
  }
}

/** Two coupled windings, each with its own branch current and a small resistance. */
export class Transformer extends Base implements Device {
  private static readonly WINDING_OHMS = 0.5;
  override readonly branchCount = 2;
  override readonly dynamic = true;
  private readonly mutual: number;
  private i1Prev = 0;
  private i2Prev = 0;

  constructor(
    id: string,
    private readonly p1: number,
    private readonly p2: number,
    private readonly s1: number,
    private readonly s2: number,
    private readonly l1: number,
    private readonly l2: number,
    k: number,
  ) {
    super(id);
    this.mutual = k * Math.sqrt(l1 * l2);
  }

  stamp(s: Solve): void {
    const b1 = this.branch;
    const b2 = this.branch + 1;
    stampBranch(s, this.p1, this.p2, b1);
    stampBranch(s, this.s1, this.s2, b2);
    const r = Transformer.WINDING_OHMS;
    if (s.dt === 0) {
      // In DC a winding is just its resistance.
      addA(s, b1 + 1, b1 + 1, -r);
      addA(s, b2 + 1, b2 + 1, -r);
      return;
    }
    // v1 = R·i1 + L1·di1/dt + M·di2/dt (and the mirror for v2), Backward Euler.
    const a1 = this.l1 / s.dt;
    const a2 = this.l2 / s.dt;
    const am = this.mutual / s.dt;
    addA(s, b1 + 1, b1 + 1, -(r + a1));
    addA(s, b1 + 1, b2 + 1, -am);
    addB(s, b1 + 1, -a1 * this.i1Prev - am * this.i2Prev);
    addA(s, b2 + 1, b2 + 1, -(r + a2));
    addA(s, b2 + 1, b1 + 1, -am);
    addB(s, b2 + 1, -a2 * this.i2Prev - am * this.i1Prev);
  }

  override accept(s: Solve): void {
    this.i1Prev = s.x[this.branch]!;
    this.i2Prev = s.x[this.branch + 1]!;
  }

  /** Primary side: voltage across it and current into p1. */
  measure(x: Float64Array): Measurement {
    const v = nodeV(x, this.p1) - nodeV(x, this.p2);
    const i = x[this.branch]!;
    return { v, i, p: v * i };
  }

  override state(): number[] {
    return [this.i1Prev, this.i2Prev];
  }

  override restore(state: number[]): void {
    this.i1Prev = state[0] ?? 0;
    this.i2Prev = state[1] ?? 0;
  }
}

/** Current-controlled current source with its own sense path (a short from a to b). */
export class CurrentMirror extends Base implements Device {
  override readonly branchCount = 1;

  constructor(
    id: string,
    private readonly a: number,
    private readonly b: number,
    private readonly c: number,
    private readonly d: number,
    private readonly gain: number,
  ) {
    super(id);
  }

  stamp(s: Solve): void {
    // The branch current is the sensed current; a -> b is a 0 V source.
    stampBranch(s, this.a, this.b, this.branch);
    const col = this.branch + 1;
    addA(s, this.c, col, this.gain);
    addA(s, this.d, col, -this.gain);
  }

  measure(x: Float64Array): Measurement {
    const i = x[this.branch]!;
    return { v: 0, i, p: 0 };
  }
}

export class VoltageSource extends Base implements Device {
  override readonly branchCount = 1;
  override readonly dynamic: boolean;

  constructor(
    id: string,
    private readonly p: number,
    private readonly n: number,
    private readonly volts: number,
    private readonly wave?: Waveform,
  ) {
    super(id);
    this.dynamic = wave !== undefined;
  }

  nextBreakpoint(time: number): number {
    const w = this.wave;
    if (!w || w.type === 'sine' || !(w.frequency > 0)) return Infinity;
    const start = w.phase / (2 * Math.PI);
    // Square waves jump at 0 and 1/2 of the cycle; triangles turn at 1/4 and 3/4.
    const offset = w.type === 'square' ? 0 : 0.25;
    const turns = w.frequency * time + start;
    const half = Math.floor((turns - offset) * 2 + 1e-9) + 1;
    return (half / 2 + offset - start) / w.frequency;
  }

  valueAt(time: number): number {
    const w = this.wave;
    if (!w) return this.volts;
    const turns = w.frequency * time + w.phase / (2 * Math.PI);
    if (w.type === 'sine') return w.offset + w.amplitude * Math.sin(2 * Math.PI * turns);
    // Position within the cycle, 0..1.
    const u = turns - Math.floor(turns);
    if (w.type === 'square') return w.offset + (u < 0.5 ? w.amplitude : -w.amplitude);
    const ramp = u < 0.25 ? 4 * u : u < 0.75 ? 2 - 4 * u : 4 * u - 4;
    return w.offset + w.amplitude * ramp;
  }

  stamp(s: Solve): void {
    stampBranch(s, this.p, this.n, this.branch);
    addB(s, this.branch + 1, this.valueAt(s.time) * s.srcScale);
  }

  /** i is the current delivered out of the positive terminal. */
  measure(x: Float64Array): Measurement {
    const v = nodeV(x, this.p) - nodeV(x, this.n);
    const i = -x[this.branch]!;
    return { v, i, p: v * i };
  }
}

export class Diode extends Base implements Device {
  override readonly nonlinear = true;
  private readonly nvt: number;
  private readonly vCrit: number;
  private vLast = 0;

  constructor(
    id: string,
    private readonly a: number,
    private readonly k: number,
    private readonly is: number,
    n: number,
  ) {
    super(id);
    this.nvt = n * THERMAL_VOLTAGE;
    this.vCrit = criticalVoltage(is, this.nvt);
  }

  stamp(s: Solve): void {
    const raw = nodeV(s.x, this.a) - nodeV(s.x, this.k);
    const v = pnjlim(raw, this.vLast, this.nvt, this.vCrit);
    if (v !== raw) s.limited = true;
    this.vLast = v;
    const [i, g] = junction(v, this.is, this.nvt);
    stampG(s, this.a, this.k, g + s.gmin);
    stampI(s, this.a, this.k, i - g * v);
  }

  measure(x: Float64Array): Measurement {
    const v = nodeV(x, this.a) - nodeV(x, this.k);
    const [i] = junction(v, this.is, this.nvt);
    return { v, i, p: v * i };
  }

  override state(): number[] {
    return [this.vLast];
  }

  override restore(state: number[]): void {
    this.vLast = state[0] ?? 0;
  }
}

/** Ebers-Moll transport model. */
export class Bjt extends Base implements Device {
  override readonly nonlinear = true;
  private readonly vCrit: number;
  private vbeLast = 0;
  private vbcLast = 0;

  constructor(
    id: string,
    private readonly c: number,
    private readonly b: number,
    private readonly e: number,
    private readonly polarity: 1 | -1,
    private readonly bf: number,
    private readonly br: number,
    private readonly is: number,
  ) {
    super(id);
    this.vCrit = criticalVoltage(is, THERMAL_VOLTAGE);
  }

  /** Terminal currents flowing into collector and base for given junction voltages. */
  private currents(vbe: number, vbc: number): { ic: number; ib: number; gf: number; gr: number } {
    const [iF, gf] = junction(vbe, this.is, THERMAL_VOLTAGE);
    const [iR, gr] = junction(vbc, this.is, THERMAL_VOLTAGE);
    return { ic: iF - iR * (1 + 1 / this.br), ib: iF / this.bf + iR / this.br, gf, gr };
  }

  stamp(s: Solve): void {
    const p = this.polarity;
    const { c, b, e } = this;
    const rawBe = p * (nodeV(s.x, b) - nodeV(s.x, e));
    const rawBc = p * (nodeV(s.x, b) - nodeV(s.x, c));
    const vbe = pnjlim(rawBe, this.vbeLast, THERMAL_VOLTAGE, this.vCrit);
    const vbc = pnjlim(rawBc, this.vbcLast, THERMAL_VOLTAGE, this.vCrit);
    if (vbe !== rawBe || vbc !== rawBc) s.limited = true;
    this.vbeLast = vbe;
    this.vbcLast = vbc;

    const { ic, ib, gf, gr } = this.currents(vbe, vbc);
    const gcbe = gf;
    const gcbc = -gr * (1 + 1 / this.br);
    const gbbe = gf / this.bf;
    const gbbc = gr / this.br;
    const icEq = p * (ic - gcbe * vbe - gcbc * vbc);
    const ibEq = p * (ib - gbbe * vbe - gbbc * vbc);

    // Collector row: current leaving node c into the device.
    addA(s, c, b, gcbe + gcbc);
    addA(s, c, e, -gcbe);
    addA(s, c, c, -gcbc);
    addB(s, c, -icEq);
    // Base row.
    addA(s, b, b, gbbe + gbbc);
    addA(s, b, e, -gbbe);
    addA(s, b, c, -gbbc);
    addB(s, b, -ibEq);
    // Emitter row: minus the sum of both.
    addA(s, e, b, -(gcbe + gcbc + gbbe + gbbc));
    addA(s, e, e, gcbe + gbbe);
    addA(s, e, c, gcbc + gbbc);
    addB(s, e, icEq + ibEq);

    stampG(s, b, e, s.gmin);
    stampG(s, b, c, s.gmin);
  }

  /** v = collector-emitter voltage, i = collector current, p = total dissipation. */
  measure(x: Float64Array): Measurement {
    const p = this.polarity;
    const vb = nodeV(x, this.b);
    const vc = nodeV(x, this.c);
    const ve = nodeV(x, this.e);
    const { ic, ib } = this.currents(p * (vb - ve), p * (vb - vc));
    return { v: vc - ve, i: p * ic, p: (vc - ve) * p * ic + (vb - ve) * p * ib };
  }

  override state(): number[] {
    return [this.vbeLast, this.vbcLast];
  }

  override restore(state: number[]): void {
    this.vbeLast = state[0] ?? 0;
    this.vbcLast = state[1] ?? 0;
  }
}

/** Level 1 (Shichman-Hodges) MOSFET without body effect. Symmetric in drain/source. */
export class Mosfet extends Base implements Device {
  override readonly nonlinear = true;
  private vgsLast = 0;
  private vdsLast = 0;

  constructor(
    id: string,
    private readonly d: number,
    private readonly g: number,
    private readonly s: number,
    private readonly polarity: 1 | -1,
    private readonly vth: number,
    private readonly kp: number,
    private readonly lambda: number,
  ) {
    super(id);
  }

  /** Drain current and derivatives for vds >= 0. */
  private evaluate(vgs: number, vds: number): { id: number; gm: number; gds: number } {
    const vov = vgs - this.vth;
    if (vov <= 0) return { id: 0, gm: 0, gds: 0 };
    const clm = 1 + this.lambda * vds;
    if (vds < vov) {
      const core = vov * vds - (vds * vds) / 2;
      return {
        id: this.kp * core * clm,
        gm: this.kp * vds * clm,
        gds: this.kp * (vov - vds) * clm + this.kp * core * this.lambda,
      };
    }
    const half = (this.kp / 2) * vov * vov;
    return { id: half * clm, gm: this.kp * vov * clm, gds: half * this.lambda };
  }

  stamp(s: Solve): void {
    const p = this.polarity;
    const rawGs = p * (nodeV(s.x, this.g) - nodeV(s.x, this.s));
    const rawDs = p * (nodeV(s.x, this.d) - nodeV(s.x, this.s));
    const vgs = clampStep(rawGs, this.vgsLast, 2);
    const vds = clampStep(rawDs, this.vdsLast, 4);
    if (vgs !== rawGs || vds !== rawDs) s.limited = true;
    this.vgsLast = vgs;
    this.vdsLast = vds;

    // With vds < 0 the terminals swap roles.
    const forward = vds >= 0;
    const drain = forward ? this.d : this.s;
    const source = forward ? this.s : this.d;
    const vgsEff = forward ? vgs : vgs - vds;
    const vdsEff = forward ? vds : -vds;

    const { id, gm, gds } = this.evaluate(vgsEff, vdsEff);
    const iEq = p * (id - gm * vgsEff - gds * vdsEff);
    addA(s, drain, this.g, gm);
    addA(s, drain, source, -(gm + gds));
    addA(s, drain, drain, gds);
    addB(s, drain, -iEq);
    addA(s, source, this.g, -gm);
    addA(s, source, source, gm + gds);
    addA(s, source, drain, -gds);
    addB(s, source, iEq);

    stampG(s, this.d, this.s, s.gmin);
  }

  /** v = drain-source voltage, i = current into the drain. */
  measure(x: Float64Array): Measurement {
    const p = this.polarity;
    const vgs = p * (nodeV(x, this.g) - nodeV(x, this.s));
    const vds = p * (nodeV(x, this.d) - nodeV(x, this.s));
    const id =
      vds >= 0 ? this.evaluate(vgs, vds).id : -this.evaluate(vgs - vds, -vds).id;
    const v = nodeV(x, this.d) - nodeV(x, this.s);
    const i = p * id;
    return { v, i, p: v * i };
  }

  override state(): number[] {
    return [this.vgsLast, this.vdsLast];
  }

  override restore(state: number[]): void {
    this.vgsLast = state[0] ?? 0;
    this.vdsLast = state[1] ?? 0;
  }
}
