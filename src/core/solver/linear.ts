/**
 * Solves A·x = b in place by Gaussian elimination with partial pivoting.
 * `a` is a dense n×n matrix in row-major order; on success `b` holds x.
 * Returns false when the matrix is singular.
 */
export function solveLinear(a: Float64Array, b: Float64Array, n: number): boolean {
  for (let k = 0; k < n; k++) {
    let pivot = k;
    let max = Math.abs(a[k * n + k]!);
    for (let r = k + 1; r < n; r++) {
      const value = Math.abs(a[r * n + k]!);
      if (value > max) {
        max = value;
        pivot = r;
      }
    }
    if (!(max > 1e-300) || !Number.isFinite(max)) return false;

    if (pivot !== k) {
      for (let c = k; c < n; c++) {
        const tmp = a[k * n + c]!;
        a[k * n + c] = a[pivot * n + c]!;
        a[pivot * n + c] = tmp;
      }
      const tmp = b[k]!;
      b[k] = b[pivot]!;
      b[pivot] = tmp;
    }

    const diagonal = a[k * n + k]!;
    for (let r = k + 1; r < n; r++) {
      const factor = a[r * n + k]! / diagonal;
      if (factor === 0) continue;
      for (let c = k + 1; c < n; c++) {
        a[r * n + c] = a[r * n + c]! - factor * a[k * n + c]!;
      }
      b[r] = b[r]! - factor * b[k]!;
    }
  }

  for (let r = n - 1; r >= 0; r--) {
    let sum = b[r]!;
    for (let c = r + 1; c < n; c++) sum -= a[r * n + c]! * b[c]!;
    b[r] = sum / a[r * n + r]!;
  }
  return true;
}

/** A pivot is kept while it is at least this fraction of the largest entry below it. */
const PIVOT_THRESHOLD = 1e-3;

/**
 * Sparse LU for the circuit matrices, which are mostly zeros and keep the
 * same structure from one step to the next. The pivot order is chosen once
 * (Markowitz: the pivot that creates the least fill-in, among those large
 * enough), then reused: each solve only repeats the arithmetic that order
 * needs. The order is chosen again when a reused pivot becomes too small or
 * a value appears where the structure had none.
 *
 * The matrix is read from the same dense row-major array the devices stamp.
 */
export class SparseLU {
  /** Positions that may hold a value: stamped ones plus the fill-in of the order. */
  private known: Uint8Array;
  private planned = false;
  /** Per elimination step: pivot row and column. */
  private pivotRow = new Int32Array(0);
  private pivotCol = new Int32Array(0);
  /** Rows below the pivot with a value in its column, and columns right of it with a value in its row. */
  private rows: Int32Array[] = [];
  private cols: Int32Array[] = [];
  private readonly work: Float64Array;
  private readonly result: Float64Array;
  private readonly rhs: Float64Array;
  /** How many times the order was chosen (for tests and tuning). */
  plans = 0;

  constructor(private readonly n: number) {
    this.known = new Uint8Array(n * n);
    this.work = new Float64Array(n * n);
    this.result = new Float64Array(n);
    this.rhs = new Float64Array(n);
  }

  /** Solves A·x = b. `a` is left untouched; on success `b` holds x. */
  solve(a: Float64Array, b: Float64Array): boolean {
    const { n, known } = this;
    if (n === 0) return true;
    let fresh = !this.planned;
    if (!fresh) {
      for (let i = 0; i < n * n; i++) {
        if (a[i] !== 0 && known[i] === 0) {
          fresh = true;
          break;
        }
      }
    }
    if (!fresh && this.factor(a) && this.substitute(b)) return true;
    // The order no longer fits these values: choose it again.
    return this.plan(a) && this.factor(a) && this.substitute(b);
  }

  /** Chooses the pivot order from the current values (Markowitz with threshold). */
  private plan(a: Float64Array): boolean {
    const { n, known } = this;
    this.plans += 1;
    for (let i = 0; i < n * n; i++) if (a[i] !== 0) known[i] = 1;
    const values = Float64Array.from(a);
    const rowActive = new Uint8Array(n).fill(1);
    const colActive = new Uint8Array(n).fill(1);
    const rowCount = new Int32Array(n);
    const colCount = new Int32Array(n);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (known[r * n + c]) {
          rowCount[r] = rowCount[r]! + 1;
          colCount[c] = colCount[c]! + 1;
        }
      }
    }
    const pivotRow = new Int32Array(n);
    const pivotCol = new Int32Array(n);
    const rows: Int32Array[] = [];
    const cols: Int32Array[] = [];
    const colMax = new Float64Array(n);

    for (let k = 0; k < n; k++) {
      // Largest active value in each active column, for the threshold test.
      colMax.fill(0);
      for (let r = 0; r < n; r++) {
        if (!rowActive[r]) continue;
        for (let c = 0; c < n; c++) {
          if (colActive[c] && known[r * n + c]) colMax[c] = Math.max(colMax[c]!, Math.abs(values[r * n + c]!));
        }
      }
      let bestCost = Infinity;
      let bestSize = 0;
      let pr = -1;
      let pc = -1;
      for (let r = 0; r < n; r++) {
        if (!rowActive[r]) continue;
        for (let c = 0; c < n; c++) {
          if (!colActive[c] || !known[r * n + c]) continue;
          const size = Math.abs(values[r * n + c]!);
          if (!(size > 1e-300) || size < PIVOT_THRESHOLD * colMax[c]!) continue;
          const cost = (rowCount[r]! - 1) * (colCount[c]! - 1);
          if (cost < bestCost || (cost === bestCost && size > bestSize)) {
            bestCost = cost;
            bestSize = size;
            pr = r;
            pc = c;
          }
        }
      }
      if (pr < 0) return false;
      pivotRow[k] = pr;
      pivotCol[k] = pc;
      rowActive[pr] = 0;
      colActive[pc] = 0;

      const below: number[] = [];
      const right: number[] = [];
      for (let r = 0; r < n; r++) if (rowActive[r] && known[r * n + pc]) below.push(r);
      for (let c = 0; c < n; c++) if (colActive[c] && known[pr * n + c]) right.push(c);
      for (const c of right) colCount[c] = colCount[c]! - 1;
      for (const r of below) rowCount[r] = rowCount[r]! - 1;
      const pivot = values[pr * n + pc]!;
      for (const r of below) {
        const factor = values[r * n + pc]! / pivot;
        for (const c of right) {
          const at = r * n + c;
          if (!known[at]) {
            // Fill-in: a new value created by the elimination.
            known[at] = 1;
            rowCount[r] = rowCount[r]! + 1;
            colCount[c] = colCount[c]! + 1;
          }
          values[at] = values[at]! - factor * values[pr * n + c]!;
        }
      }
      rows.push(Int32Array.from(below));
      cols.push(Int32Array.from(right));
    }
    this.pivotRow = pivotRow;
    this.pivotCol = pivotCol;
    this.rows = rows;
    this.cols = cols;
    this.planned = true;
    return true;
  }

  /** LU of the current values with the stored order, in `work`. False when a pivot is too small. */
  private factor(a: Float64Array): boolean {
    const { n, work, pivotRow, pivotCol, rows, cols } = this;
    work.set(a);
    for (let k = 0; k < n; k++) {
      const pr = pivotRow[k]!;
      const pc = pivotCol[k]!;
      const pivot = work[pr * n + pc]!;
      const below = rows[k]!;
      const right = cols[k]!;
      let largest = Math.abs(pivot);
      for (let i = 0; i < below.length; i++) largest = Math.max(largest, Math.abs(work[below[i]! * n + pc]!));
      if (!(Math.abs(pivot) > 1e-300) || Math.abs(pivot) < PIVOT_THRESHOLD * largest || !Number.isFinite(largest)) {
        return false;
      }
      const pivotBase = pr * n;
      for (let i = 0; i < below.length; i++) {
        const base = below[i]! * n;
        const factor = work[base + pc]! / pivot;
        work[base + pc] = factor;
        if (factor === 0) continue;
        for (let j = 0; j < right.length; j++) {
          const c = right[j]!;
          work[base + c] = work[base + c]! - factor * work[pivotBase + c]!;
        }
      }
    }
    return true;
  }

  /** Forward and back substitution; writes x into `b` only when it succeeds. */
  private substitute(input: Float64Array): boolean {
    const { n, work, pivotRow, pivotCol, rows, cols, result, rhs: b } = this;
    b.set(input);
    for (let k = 0; k < n; k++) {
      const pr = pivotRow[k]!;
      const pc = pivotCol[k]!;
      const value = b[pr]!;
      if (value === 0) continue;
      const below = rows[k]!;
      for (let i = 0; i < below.length; i++) {
        const r = below[i]!;
        b[r] = b[r]! - work[r * n + pc]! * value;
      }
    }
    for (let k = n - 1; k >= 0; k--) {
      const pr = pivotRow[k]!;
      const pc = pivotCol[k]!;
      const right = cols[k]!;
      let sum = b[pr]!;
      for (let j = 0; j < right.length; j++) {
        const c = right[j]!;
        sum -= work[pr * n + c]! * result[c]!;
      }
      result[pc] = sum / work[pr * n + pc]!;
    }
    for (let i = 0; i < n; i++) {
      if (!Number.isFinite(result[i]!)) return false;
    }
    input.set(result);
    return true;
  }
}
