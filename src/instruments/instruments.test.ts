import { describe, expect, it } from 'vitest';
import { multimeterReading } from '../catalog/parts/multimeter';
import { SimSession } from '../core/sim/session';
import type { SimSnapshot } from '../core/sim/types';
import { VoltageSource } from '../core/solver/devices';
import { addPart, addWire, setPartProp } from '../editor/model/ops';
import { EMPTY_DOC, type CircuitDoc } from '../editor/model/types';
import { lowerBound, parsePlotData, signalStats, windowStart } from './analysis';

function build(types: string[], wires: [string, string][]): CircuitDoc {
  let doc = EMPTY_DOC;
  types.forEach((type, index) => {
    doc = addPart(doc, type, { x: index * 200, y: 0 }).doc;
  });
  for (const [from, to] of wires) {
    const [fromPart = '', fromPin = ''] = from.split('.');
    const [toPart = '', toPin = ''] = to.split('.');
    const result = addWire(doc, { partId: fromPart, pinId: fromPin }, { partId: toPart, pinId: toPin }, [], '#000000');
    if (!result) throw new Error(`bad wire ${from} -> ${to}`);
    doc = result.doc;
  }
  return doc;
}

/** Runs for `seconds` in frame-sized steps, collecting the traces of one part. */
function run(doc: CircuitDoc, seconds: number, tracePart = '') {
  const session = new SimSession();
  session.load(doc, {}, [], {});
  let snapshot: SimSnapshot = session.snapshot();
  const t: number[] = [];
  const ch: number[][] = [];
  for (let elapsed = 0; elapsed < seconds - 1e-9; elapsed += 0.02) {
    snapshot = session.advance(0.02, 60_000);
    const trace = snapshot.traces[tracePart];
    if (trace) {
      t.push(...trace.t);
      trace.ch.forEach((values, k) => (ch[k] ??= []).push(...values));
    }
  }
  return { snapshot, t, ch };
}

const reading = (doc: CircuitDoc, snapshot: SimSnapshot, id: string): string => {
  const part = doc.parts.find((candidate) => candidate.id === id);
  return multimeterReading(part?.props ?? {}, snapshot.parts[id]);
};

describe('waveforms', () => {
  const at = (type: 'sine' | 'square' | 'triangle', time: number): number =>
    new VoltageSource('v', 1, 0, 0, { type, amplitude: 2, frequency: 10, offset: 1, phase: 0 }).valueAt(time);

  it('sine, square and triangle follow amplitude, frequency and offset', () => {
    expect(at('sine', 0)).toBeCloseTo(1, 12);
    expect(at('sine', 0.025)).toBeCloseTo(3, 12);
    expect(at('sine', 0.075)).toBeCloseTo(-1, 12);
    expect(at('square', 0.01)).toBe(3);
    expect(at('square', 0.06)).toBe(-1);
    expect(at('triangle', 0)).toBeCloseTo(1, 12);
    expect(at('triangle', 0.025)).toBeCloseTo(3, 12);
    expect(at('triangle', 0.05)).toBeCloseTo(1, 12);
    expect(at('triangle', 0.075)).toBeCloseTo(-1, 12);
    expect(at('triangle', 0.1)).toBeCloseTo(1, 9);
  });
});

describe('multimeter', () => {
  /** Battery p1 (9 V) feeding resistors p2 = 1 kΩ and p3 = 2 kΩ in series; meter is p4. */
  function divider(mode: string, meterWires: [string, string][]): CircuitDoc {
    let doc = build(['battery-9v', 'resistor', 'resistor', 'multimeter'], [
      ['p1.positive', 'p2.1'],
      ['p3.2', 'p1.negative'],
      ...meterWires,
    ]);
    doc = setPartProp(doc, 'p2', 'resistance', 1000);
    doc = setPartProp(doc, 'p3', 'resistance', 2000);
    return setPartProp(doc, 'p4', 'mode', mode);
  }

  it('reads DC voltage across a divider resistor', () => {
    const doc = divider('vdc', [['p2.2', 'p3.1'], ['p4.positive', 'p3.1'], ['p4.negative', 'p3.2']]);
    // 9 V · 2000 / (1000 + 2000 + 1.5 internal) = 5.997 V
    expect(reading(doc, run(doc, 0.1).snapshot, 'p4')).toBe('5.997 V');
  });

  it('reads current when placed in series', () => {
    const doc = divider('adc', [['p2.2', 'p4.positive'], ['p4.negative', 'p3.1']]);
    // 9 V / 3001.5 Ω = 2.998 mA
    expect(reading(doc, run(doc, 0.1).snapshot, 'p4')).toBe('2.998 mA');
  });

  it('measures resistance of an unpowered part and shows OL when open', () => {
    let doc = build(['resistor', 'multimeter'], [['p2.positive', 'p1.1'], ['p2.negative', 'p1.2']]);
    doc = setPartProp(doc, 'p1', 'resistance', 4700);
    doc = setPartProp(doc, 'p2', 'mode', 'ohm');
    expect(reading(doc, run(doc, 0.1).snapshot, 'p2')).toBe('4.7 kΩ');

    let open = build(['resistor', 'multimeter'], [['p2.positive', 'p1.1']]);
    open = setPartProp(open, 'p2', 'mode', 'ohm');
    expect(reading(open, run(open, 0.1).snapshot, 'p2')).toBe('OL');
  });

  it('reads the RMS of an alternating voltage and ignores its DC part', () => {
    // Generator p1: 10 V peak sine at 50 Hz with 3 V offset, loaded by 10 kΩ (p2).
    let doc = build(['function-generator', 'resistor', 'multimeter'], [
      ['p1.out', 'p2.1'],
      ['p2.2', 'p1.gnd'],
      ['p3.positive', 'p2.1'],
      ['p3.negative', 'p2.2'],
    ]);
    doc = setPartProp(doc, 'p1', 'frequency', 50);
    doc = setPartProp(doc, 'p1', 'amplitude', 10);
    doc = setPartProp(doc, 'p1', 'offset', 3);
    doc = setPartProp(doc, 'p2', 'resistance', 10e3);
    doc = setPartProp(doc, 'p3', 'mode', 'vac');
    const ac = run(doc, 2).snapshot;
    const state = ac.parts.p3;
    const rms = Math.sqrt((state?.vRms ?? 0) ** 2 - (state?.vMean ?? 0) ** 2);
    // 10 V peak · 10000/10050 / √2 = 7.036 V
    expect(rms).toBeGreaterThan(6.9);
    expect(rms).toBeLessThan(7.2);
    expect(state?.vMean).toBeGreaterThan(2.8);
    expect(state?.vMean).toBeLessThan(3.2);
  });
});

describe('recording instruments', () => {
  it('an oscilloscope records the generator waveform', () => {
    // Generator p1 into scope p2 channel 1; channel 2 is left open.
    let doc = build(['function-generator', 'oscilloscope'], [['p1.out', 'p2.ch1'], ['p1.gnd', 'p2.gnd']]);
    doc = setPartProp(doc, 'p1', 'frequency', 100);
    doc = setPartProp(doc, 'p1', 'amplitude', 4);
    const { t, ch } = run(doc, 0.1, 'p2');
    expect(ch).toHaveLength(4);
    // 20 000 samples per simulated second.
    expect(t.length).toBeGreaterThan(1900);
    expect(t.length).toBeLessThan(2100);
    for (let i = 1; i < t.length; i++) expect(t[i]).toBeGreaterThan(t[i - 1] as number);

    const stats = signalStats(t, ch[0] ?? [], 0, t.length);
    expect(stats?.max).toBeGreaterThan(3.9);
    expect(stats?.max).toBeLessThan(4.01);
    expect(stats?.min).toBeLessThan(-3.9);
    expect(Math.abs(stats?.mean ?? 1)).toBeLessThan(0.05);
    expect(Math.abs((stats?.frequency ?? 0) - 100)).toBeLessThan(1);
    // The unconnected channel stays at zero.
    expect(Math.max(...(ch[1] ?? [1]).map(Math.abs))).toBeLessThan(1e-3);
  });

  it('delivers each sample once', () => {
    const doc = build(['function-generator', 'oscilloscope'], [['p1.out', 'p2.ch1'], ['p1.gnd', 'p2.gnd']]);
    const session = new SimSession();
    session.load(doc, {}, [], {});
    const first = session.advance(0.01, 60_000).traces.p2;
    const second = session.advance(0.01, 60_000).traces.p2;
    expect(first?.t.length).toBe(200);
    expect(second?.t.length).toBe(200);
    expect(second?.t[0]).toBeGreaterThan(first?.t[first.t.length - 1] ?? Infinity);
  });

  it('a square wave shows up as logic levels on the logic analyzer', () => {
    let doc = build(['function-generator', 'logic-analyzer'], [['p1.out', 'p2.d3'], ['p1.gnd', 'p2.gnd']]);
    doc = setPartProp(doc, 'p1', 'wave', 'square');
    doc = setPartProp(doc, 'p1', 'frequency', 50);
    doc = setPartProp(doc, 'p1', 'amplitude', 2.5);
    doc = setPartProp(doc, 'p1', 'offset', 2.5);
    const { ch } = run(doc, 0.1, 'p2');
    expect(ch).toHaveLength(8);
    const high = (ch[3] ?? []).filter((v) => v > 2.5).length / (ch[3]?.length ?? 1);
    expect(high).toBeGreaterThan(0.45);
    expect(high).toBeLessThan(0.55);
    expect(Math.max(...(ch[0] ?? [1]))).toBeLessThan(1e-3);
  });
});

describe('adjustable supply', () => {
  it('delivers its set voltage and warns above the current limit', () => {
    let doc = build(['dc-supply', 'resistor'], [['p1.positive', 'p2.1'], ['p2.2', 'p1.negative']]);
    doc = setPartProp(doc, 'p1', 'voltage', 12);
    doc = setPartProp(doc, 'p2', 'resistance', 1000);
    doc = setPartProp(doc, 'p2', 'power', 5);
    const normal = run(doc, 0.1).snapshot;
    expect(normal.parts.p2?.v).toBeCloseTo(12, 2);
    expect(normal.warnings).toEqual([]);

    const overloaded = run(setPartProp(doc, 'p1', 'limit', 0.01), 0.1).snapshot;
    expect(overloaded.warnings[0]).toMatchObject({ partId: 'p1', cause: 'short-circuit', limit: 0.01 });
  });
});

describe('signal analysis', () => {
  const dt = 1e-4;
  const t = Array.from({ length: 2000 }, (_, i) => i * dt);
  // 50 Hz sine, 3 V peak, 1 V offset.
  const sine = t.map((time) => 1 + 3 * Math.sin(2 * Math.PI * 50 * time));

  it('lowerBound finds the first sample at or after a time', () => {
    expect(lowerBound(t, 0)).toBe(0);
    expect(lowerBound(t, 0.01005)).toBe(101);
    expect(lowerBound(t, 99)).toBe(2000);
  });

  it('measures amplitude, mean and frequency', () => {
    const stats = signalStats(t, sine, 0, t.length);
    expect(stats?.max).toBeCloseTo(4, 2);
    expect(stats?.min).toBeCloseTo(-2, 2);
    expect(stats?.mean).toBeCloseTo(1, 1);
    expect(stats?.frequency).toBeCloseTo(50, 1);
    expect(signalStats(t, sine, 0, 1)).toBeNull();
    expect(signalStats(t, t.map(() => 5), 0, t.length)?.frequency).toBe(0);
  });

  it('free-runs without a trigger', () => {
    expect(windowStart(t, sine, 0.05, null)).toBeCloseTo(0.1999 - 0.05, 9);
  });

  it('aligns the window on a rising or falling crossing', () => {
    const span = 0.05;
    const rising = windowStart(t, sine, span, { rising: true, level: 1 });
    const crossing = rising + 0.2 * span;
    // Rising crossings of the 1 V level happen every 20 ms.
    expect(Math.abs(crossing / 0.02 - Math.round(crossing / 0.02))).toBeLessThan(0.01);
    const falling = windowStart(t, sine, span, { rising: false, level: 1 });
    const fallCrossing = (falling + 0.2 * span - 0.01) / 0.02;
    expect(Math.abs(fallCrossing - Math.round(fallCrossing))).toBeLessThan(0.01);
    // The automatic level sits in the middle of the signal: same result here.
    expect(windowStart(t, sine, span, { rising: true, level: null })).toBeCloseTo(rising, 9);
  });

  it('falls back to free running when the level is never crossed', () => {
    expect(windowStart(t, sine, 0.05, { rising: true, level: 10 })).toBeCloseTo(0.1999 - 0.05, 9);
    const flat = t.map(() => 2);
    expect(windowStart(t, flat, 0.05, { rising: true, level: null })).toBeCloseTo(0.1999 - 0.05, 9);
  });
});

describe('parsePlotData', () => {
  it('reads columns, labels and ignores text and the unfinished last line', () => {
    const text = 'hello\n1 2\n3,4\ntemp:5\thum:6\nbad 1\n\n7 8\n9 1';
    expect(parsePlotData(text, 100)).toEqual([
      [1, 3, 5, 7],
      [2, 4, 6, 8],
    ]);
  });

  it('keeps only the newest points', () => {
    expect(parsePlotData('1\n2\n3\n4\n', 2)).toEqual([[3, 4]]);
  });
});
