import { describe, expect, it } from 'vitest';
import { SparseLU, solveLinear } from './linear';

/** Deterministic pseudo-random numbers. */
function random(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/** A sparse, MNA-like matrix: conductances between nodes plus voltage-source rows with zero diagonal. */
function circuitMatrix(n: number, sources: number, seed: number): Float64Array {
  const next = random(seed);
  const a = new Float64Array(n * n);
  const nodes = n - sources;
  for (let i = 0; i < nodes; i++) a[i * n + i] = a[i * n + i]! + 1e-9;
  for (let e = 0; e < nodes * 2; e++) {
    const i = Math.floor(next() * nodes);
    const j = Math.floor(next() * nodes);
    const g = 10 ** (next() * 6 - 3);
    a[i * n + i] = a[i * n + i]! + g;
    if (i !== j) {
      a[j * n + j] = a[j * n + j]! + g;
      a[i * n + j] = a[i * n + j]! - g;
      a[j * n + i] = a[j * n + i]! - g;
    }
  }
  // Each source on its own node: two sources on one node would make the matrix singular.
  for (let s = 0; s < sources; s++) {
    const row = nodes + s;
    const node = (s * 7) % nodes;
    a[node * n + row] = 1;
    a[row * n + node] = 1;
  }
  return a;
}

function dense(a: Float64Array, b: Float64Array, n: number): Float64Array {
  const x = Float64Array.from(b);
  expect(solveLinear(Float64Array.from(a), x, n)).toBe(true);
  return x;
}

describe('sparse LU', () => {
  it('matches dense elimination on circuit-like matrices', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const n = 30 + seed;
      const a = circuitMatrix(n, 3, seed);
      const b = Float64Array.from({ length: n }, (_, i) => Math.sin(i + seed));
      const expected = dense(a, b, n);
      const lu = new SparseLU(n);
      const x = Float64Array.from(b);
      expect(lu.solve(a, x)).toBe(true);
      for (let i = 0; i < n; i++) expect(x[i]).toBeCloseTo(expected[i]!, 6);
    }
  });

  it('reuses its pivot order while the values change smoothly', () => {
    const n = 40;
    const a = circuitMatrix(n, 2, 7);
    const lu = new SparseLU(n);
    for (let step = 0; step < 50; step++) {
      const scaled = a.map((value, index) => (index % (n + 1) === 0 ? value * (1 + step * 0.01) : value));
      const b = Float64Array.from({ length: n }, (_, i) => i - step);
      const expected = dense(scaled, b, n);
      const x = Float64Array.from(b);
      expect(lu.solve(scaled, x)).toBe(true);
      for (let i = 0; i < n; i++) expect(x[i]).toBeCloseTo(expected[i]!, 6);
    }
    expect(lu.plans).toBe(1);
  });

  it('chooses a new order when a pivot collapses or a new value appears', () => {
    // 2x2 where the first pivot later becomes zero: needs a row swap.
    const lu = new SparseLU(2);
    const x1 = Float64Array.from([3, 5]);
    expect(lu.solve(Float64Array.from([2, 1, 1, 3]), x1)).toBe(true);
    expect([...x1].map((v) => +v.toFixed(9))).toEqual([0.8, 1.4]);
    const x2 = Float64Array.from([1, 4]);
    expect(lu.solve(Float64Array.from([0, 1, 1, 3]), x2)).toBe(true);
    expect([...x2].map((v) => +v.toFixed(9))).toEqual([1, 1]);
    // A value where there was none before.
    const x3 = Float64Array.from([3, 2]);
    expect(lu.solve(Float64Array.from([1, 1, 1, 0]), x3)).toBe(true);
    expect([...x3].map((v) => +v.toFixed(9))).toEqual([2, 1]);
    expect(lu.plans).toBeGreaterThan(1);
  });

  it('reports a singular matrix', () => {
    const lu = new SparseLU(2);
    expect(lu.solve(Float64Array.from([1, 2, 2, 4]), Float64Array.from([1, 1]))).toBe(false);
  });
});
