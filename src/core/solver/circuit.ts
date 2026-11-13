import { nodeV, type Device, type Solve } from './devices';
import { SparseLU } from './linear';

/**
 * Nonlinear circuit solver: modified nodal analysis, Newton-Raphson with
 * junction limiting, and Backward Euler / trapezoidal integration in time.
 */

const MAX_ITERATIONS = 150;
const RELTOL = 1e-3;
const VNTOL = 1e-6;
const ABSTOL = 1e-9;
/** Leak from every node to ground: keeps floating nodes solvable. */
const NODE_GMIN = 1e-12;
const DEVICE_GMIN = 1e-12;
const MAX_HALVINGS = 5;

export type Integration = 'euler' | 'trapezoidal';

export class Circuit {
  /** Node voltages (node k at index k-1) followed by branch currents. */
  readonly x: Float64Array;
  readonly size: number;
  readonly hasNonlinear: boolean;
  /** True when the solution depends on time (reactive parts or waveform sources). */
  readonly hasDynamic: boolean;
  time = 0;

  /** Unknowns that are node voltages (the first ones in x); the rest are branch currents. */
  readonly nodes: number;
  private readonly a: Float64Array;
  private readonly b: Float64Array;
  private readonly s: Solve;
  /** Backward Euler for the next step (history is not smooth after a change). */
  private eulerNext = true;

  /** `nodeCount` includes ground (node 0). */
  constructor(
    nodeCount: number,
    readonly devices: readonly Device[],
    private readonly integration: Integration = 'euler',
  ) {
    this.nodes = Math.max(0, nodeCount - 1);
    let size = this.nodes;
    for (const device of devices) {
      if (device.branchCount > 0) {
        device.branch = size;
        size += device.branchCount;
      }
    }
    this.size = size;
    this.x = new Float64Array(size);
    this.a = new Float64Array(size * size);
    this.b = new Float64Array(size);
    this.lu = new SparseLU(size);
    this.hasNonlinear = devices.some((device) => device.nonlinear);
    this.hasDynamic = devices.some((device) => device.dynamic);
    this.s = {
      n: size,
      a: this.a,
      b: this.b,
      x: this.x,
      dt: 0,
      trap: false,
      time: 0,
      gmin: DEVICE_GMIN,
      srcScale: 1,
      limited: false,
    };
  }

  /** Earliest breakpoint of any device after `time` (Infinity when none). */
  nextBreakpoint(time: number): number {
    let next = Infinity;
    for (const device of this.devices) {
      if (device.nextBreakpoint) next = Math.min(next, device.nextBreakpoint(time));
    }
    return next;
  }

  voltage(node: number): number {
    return nodeV(this.x, node);
  }

  /** Tells the solver that stored history no longer matches (circuit was rewired). */
  discontinuity(): void {
    this.eulerNext = true;
  }

  /** Factorization reused from step to step (see SparseLU). */
  private readonly lu: SparseLU;

  private newton(extraGmin: number, srcScale: number): boolean {
    const { a, b, x, s, size, nodes } = this;
    s.srcScale = srcScale;
    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      a.fill(0);
      b.fill(0);
      s.limited = false;
      const leak = NODE_GMIN + extraGmin;
      for (let i = 0; i < nodes; i++) a[i * size + i] = leak;
      for (const device of this.devices) device.stamp(s);
      if (!this.lu.solve(a, b)) return false;

      let converged = !s.limited;
      for (let i = 0; i < size; i++) {
        const next = b[i]!;
        if (!Number.isFinite(next)) return false;
        const previous = x[i]!;
        const tolerance =
          RELTOL * Math.max(Math.abs(next), Math.abs(previous)) + (i < nodes ? VNTOL : ABSTOL);
        if (Math.abs(next - previous) > tolerance) converged = false;
        x[i] = next;
      }
      if (converged || !this.hasNonlinear) return true;
    }
    return false;
  }

  /** Newton with fallbacks: gmin stepping, then source stepping. */
  private solve(dt: number, time: number): boolean {
    const s = this.s;
    s.dt = dt;
    s.time = time;
    s.trap = dt > 0 && this.integration === 'trapezoidal' && !this.eulerNext;
    if (this.size === 0) return true;

    const start = this.x.slice();
    if (this.newton(0, 1)) return true;

    this.x.set(start);
    let ok = true;
    for (let gmin = 1e-2; gmin > 1e-13 && ok; gmin /= 10) ok = this.newton(gmin, 1);
    if (ok && this.newton(0, 1)) return true;

    this.x.set(start);
    ok = true;
    for (let k = 1; k <= 10 && ok; k++) ok = this.newton(0, k / 10);
    if (ok) return true;

    this.x.set(start);
    return false;
  }

  private accept(): void {
    for (const device of this.devices) device.accept(this.s);
    this.eulerNext = false;
  }

  /** DC operating point: capacitors open, inductors shorted. */
  solveDc(): boolean {
    const ok = this.solve(0, this.time);
    if (ok) {
      this.accept();
      // After DC there is no current history for the trapezoidal rule.
      this.eulerNext = true;
    }
    return ok;
  }

  /** Advances time by dt, halving the step when Newton does not converge. */
  step(dt: number, depth = 0): boolean {
    if (this.solve(dt, this.time + dt)) {
      this.accept();
      this.time += dt;
      return true;
    }
    if (depth >= MAX_HALVINGS) return false;
    return this.step(dt / 2, depth + 1) && this.step(dt / 2, depth + 1);
  }
}
