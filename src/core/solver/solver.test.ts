import { describe, expect, it } from 'vitest';
import { THERMAL_VOLTAGE } from '../../catalog/model';
import { Circuit, type Integration } from './circuit';
import {
  Bjt,
  Capacitor,
  Diode,
  Inductor,
  Mosfet,
  Resistor,
  VoltageSource,
} from './devices';
import { solveLinear } from './linear';

describe('solveLinear', () => {
  it('solves a system that needs pivoting', () => {
    const a = new Float64Array([0, 2, 1, 1, 1, 0, 2, 0, 3]);
    const b = new Float64Array([7, 3, 11]);
    expect(solveLinear(a, b, 3)).toBe(true);
    // x = 1, y = 2, z = 3
    expect(b[0]).toBeCloseTo(1, 12);
    expect(b[1]).toBeCloseTo(2, 12);
    expect(b[2]).toBeCloseTo(3, 12);
  });

  it('reports singular matrices', () => {
    const a = new Float64Array([1, 2, 2, 4]);
    expect(solveLinear(a, new Float64Array([1, 2]), 2)).toBe(false);
  });
});

describe('DC analysis', () => {
  it('voltage divider', () => {
    // 9 V over 1 kΩ + 2 kΩ: the middle node sits at 9·2/3 = 6 V.
    const source = new VoltageSource('v', 1, 0, 9);
    const circuit = new Circuit(3, [
      source,
      new Resistor('r1', 1, 2, 1000),
      new Resistor('r2', 2, 0, 2000),
    ]);
    expect(circuit.solveDc()).toBe(true);
    expect(circuit.voltage(2)).toBeCloseTo(6, 6);
    expect(source.measure(circuit.x).i).toBeCloseTo(0.003, 9);
  });

  it('floating nodes do not break the solution', () => {
    // Node 2 is only connected through a capacitor (open in DC).
    const circuit = new Circuit(3, [
      new VoltageSource('v', 1, 0, 5),
      new Capacitor('c', 1, 2, 1e-6),
    ]);
    expect(circuit.solveDc()).toBe(true);
    expect(Number.isFinite(circuit.voltage(2))).toBe(true);
  });

  it('diode with series resistor satisfies both device equations', () => {
    const is = 7e-9;
    const n = 1.8;
    const diode = new Diode('d', 2, 0, is, n);
    const circuit = new Circuit(3, [
      new VoltageSource('v', 1, 0, 5),
      new Resistor('r', 1, 2, 1000),
      diode,
    ]);
    expect(circuit.solveDc()).toBe(true);
    const vd = circuit.voltage(2);
    expect(vd).toBeGreaterThan(0.55);
    expect(vd).toBeLessThan(0.75);
    const throughResistor = (5 - vd) / 1000;
    const shockley = is * Math.expm1(vd / (n * THERMAL_VOLTAGE));
    expect(shockley).toBeCloseTo(throughResistor, 6);
    expect(diode.measure(circuit.x).i).toBeCloseTo(throughResistor, 6);
  });

  it('reverse-biased diode blocks', () => {
    const circuit = new Circuit(3, [
      new VoltageSource('v', 1, 0, -5),
      new Resistor('r', 1, 2, 1000),
      new Diode('d', 2, 0, 7e-9, 1.8),
    ]);
    expect(circuit.solveDc()).toBe(true);
    expect(circuit.voltage(2)).toBeCloseTo(-5, 3);
  });

  /** Common emitter: Vcc = 5 V, Rc = 1 kΩ, base driven from `vin` through `rb`. */
  function commonEmitter(vin: number, rb: number, polarity: 1 | -1 = 1) {
    const k = polarity;
    const q = new Bjt('q', 3, 4, 0, polarity, 200, 5, 1e-14);
    const circuit = new Circuit(5, [
      new VoltageSource('vcc', 1, 0, 5 * k),
      new VoltageSource('vin', 2, 0, vin * k),
      new Resistor('rc', 1, 3, 1000),
      new Resistor('rb', 2, 4, rb),
      q,
    ]);
    const ok = circuit.solveDc();
    return { ok, vc: circuit.voltage(3) * k, vb: circuit.voltage(4) * k, q, circuit, k };
  }

  it('BJT in cutoff: collector at Vcc', () => {
    const { ok, vc } = commonEmitter(0, 100e3);
    expect(ok).toBe(true);
    expect(vc).toBeCloseTo(5, 3);
  });

  it('BJT in saturation: Vce below 0.3 V', () => {
    const { ok, vc, vb } = commonEmitter(5, 100e3);
    expect(ok).toBe(true);
    expect(vc).toBeLessThan(0.3);
    expect(vc).toBeGreaterThan(0);
    expect(vb).toBeGreaterThan(0.6);
    expect(vb).toBeLessThan(0.8);
  });

  it('BJT in active region: Ic = β·Ib', () => {
    const { ok, vc, vb } = commonEmitter(5, 1e6);
    expect(ok).toBe(true);
    const ib = (5 - vb) / 1e6;
    const ic = (5 - vc) / 1000;
    expect(vc).toBeGreaterThan(1);
    expect(ic / ib).toBeGreaterThan(195);
    expect(ic / ib).toBeLessThan(201);
  });

  it('PNP mirrors NPN', () => {
    const npn = commonEmitter(5, 1e6, 1);
    const pnp = commonEmitter(5, 1e6, -1);
    expect(pnp.ok).toBe(true);
    expect(pnp.vc).toBeCloseTo(npn.vc, 6);
    expect(pnp.q.measure(pnp.circuit.x).i).toBeCloseTo(-npn.q.measure(npn.circuit.x).i, 9);
  });

  /** Low-side switch: Vdd = 5 V, Rd = 1 kΩ, gate at `vg`. */
  function mosSwitch(vg: number) {
    const circuit = new Circuit(4, [
      new VoltageSource('vdd', 1, 0, 5),
      new VoltageSource('vg', 2, 0, vg),
      new Resistor('rd', 1, 3, 1000),
      new Mosfet('m', 3, 2, 0, 1, 2, 1, 0.01),
    ]);
    return { ok: circuit.solveDc(), vd: circuit.voltage(3) };
  }

  it('MOSFET off below threshold, on above it', () => {
    const off = mosSwitch(0);
    expect(off.ok).toBe(true);
    expect(off.vd).toBeCloseTo(5, 3);
    const on = mosSwitch(5);
    expect(on.ok).toBe(true);
    expect(on.vd).toBeLessThan(0.05);
  });

  it('MOSFET in saturation follows the square law', () => {
    // vgs = 2.5 V, vth = 2 V, kp = 1: id = 0.5·0.5²·(1 + λ·vds).
    const circuit = new Circuit(4, [
      new VoltageSource('vdd', 1, 0, 5),
      new VoltageSource('vg', 2, 0, 2.5),
      new Resistor('rd', 1, 3, 10),
      new Mosfet('m', 3, 2, 0, 1, 2, 1, 0.01),
    ]);
    expect(circuit.solveDc()).toBe(true);
    const vd = circuit.voltage(3);
    const id = (5 - vd) / 10;
    expect(id).toBeCloseTo(0.125 * (1 + 0.01 * vd), 6);
  });
});

describe('transient analysis', () => {
  function chargeRc(integration: Integration): number {
    // 5 V step into R = 1 kΩ, C = 1 µF. τ = 1 ms.
    const circuit = new Circuit(
      3,
      [new VoltageSource('v', 1, 0, 5), new Resistor('r', 1, 2, 1000), new Capacitor('c', 2, 0, 1e-6)],
      integration,
    );
    for (let i = 0; i < 100; i++) expect(circuit.step(10e-6)).toBe(true);
    expect(circuit.time).toBeCloseTo(1e-3, 12);
    return circuit.voltage(2);
  }

  const expectedAtTau = 5 * (1 - Math.exp(-1));

  it('RC charging with Backward Euler is within 1 % of theory', () => {
    expect(Math.abs(chargeRc('euler') - expectedAtTau) / expectedAtTau).toBeLessThan(0.01);
  });

  it('RC charging with the trapezoidal rule is within 0.05 % of theory', () => {
    expect(Math.abs(chargeRc('trapezoidal') - expectedAtTau) / expectedAtTau).toBeLessThan(5e-4);
  });

  it('RL current rise matches theory', () => {
    // 5 V into R = 100 Ω, L = 10 mH. τ = 100 µs, final current 50 mA.
    const coil = new Inductor('l', 2, 0, 10e-3);
    const circuit = new Circuit(
      3,
      [new VoltageSource('v', 1, 0, 5), new Resistor('r', 1, 2, 100), coil],
      'trapezoidal',
    );
    for (let i = 0; i < 100; i++) expect(circuit.step(1e-6)).toBe(true);
    const expected = 0.05 * (1 - Math.exp(-1));
    expect(Math.abs(coil.measure(circuit.x).i - expected) / expected).toBeLessThan(1e-3);
  });

  it('inductor is a short circuit in DC', () => {
    const coil = new Inductor('l', 2, 0, 10e-3);
    const circuit = new Circuit(3, [
      new VoltageSource('v', 1, 0, 5),
      new Resistor('r', 1, 2, 100),
      coil,
    ]);
    expect(circuit.solveDc()).toBe(true);
    expect(coil.measure(circuit.x).i).toBeCloseTo(0.05, 6);
  });

  it('capacitor keeps its DC voltage when the transient starts', () => {
    const circuit = new Circuit(
      3,
      [new VoltageSource('v', 1, 0, 5), new Resistor('r', 1, 2, 1000), new Capacitor('c', 2, 0, 1e-6)],
      'trapezoidal',
    );
    expect(circuit.solveDc()).toBe(true);
    for (let i = 0; i < 20; i++) circuit.step(50e-6);
    expect(circuit.voltage(2)).toBeCloseTo(5, 6);
  });

  it('half-wave rectifier passes only the positive half cycle', () => {
    // 10 V peak, 50 Hz sine through a diode into 1 kΩ.
    const circuit = new Circuit(3, [
      new VoltageSource('v', 1, 0, 0, {
        type: 'sine',
        amplitude: 10,
        frequency: 50,
        offset: 0,
        phase: 0,
      }),
      new Diode('d', 1, 2, 7e-9, 1.8),
      new Resistor('r', 2, 0, 1000),
    ]);
    let max = -Infinity;
    let min = Infinity;
    for (let i = 0; i < 1000; i++) {
      expect(circuit.step(20e-6)).toBe(true);
      max = Math.max(max, circuit.voltage(2));
      min = Math.min(min, circuit.voltage(2));
    }
    expect(max).toBeGreaterThan(9.1);
    expect(max).toBeLessThan(9.5);
    expect(min).toBeGreaterThan(-0.01);
  });

  it('LC tank oscillates at 1/(2π√LC)', () => {
    // L = 10 mH, C = 1 µF: f0 = 1591.5 Hz. Start with the capacitor charged.
    const cap = new Capacitor('c', 1, 0, 1e-6);
    cap.restore([1, 0]);
    const circuit = new Circuit(2, [cap, new Inductor('l', 1, 0, 10e-3)], 'trapezoidal');
    circuit.x[0] = 1;
    const dt = 1e-6;
    let crossings = 0;
    let firstCrossing = 0;
    let lastCrossing = 0;
    let previous = 1;
    for (let i = 1; i <= 5000; i++) {
      circuit.step(dt);
      const v = circuit.voltage(1);
      if (previous < 0 && v >= 0) {
        crossings += 1;
        if (crossings === 1) firstCrossing = i * dt;
        lastCrossing = i * dt;
      }
      previous = v;
    }
    const frequency = (crossings - 1) / (lastCrossing - firstCrossing);
    expect(Math.abs(frequency - 1591.55) / 1591.55).toBeLessThan(0.01);
  });
});
