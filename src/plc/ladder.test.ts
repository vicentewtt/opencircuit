import { describe, expect, it } from 'vitest';
import { SimSession } from '../core/sim/session';
import type { SimInputs, SimSnapshot } from '../core/sim/types';
import { addPart, addWire, setPartProp } from '../editor/model/ops';
import { EMPTY_DOC, type CircuitDoc } from '../editor/model/types';
import {
  COLUMNS,
  addRow,
  defaultProgram,
  emptyRung,
  flow,
  liveTest,
  parseProgram,
  scan,
  serializeProgram,
  tidy,
  type Memory,
  type Output,
  type Program,
  type Rung,
} from './ladder';

/** A rung with contacts in a row ("I1", "/I2" for normally closed) and an output. */
function line(contacts: string[], output: Output): Rung {
  const rung = emptyRung();
  contacts.forEach((contact, index) => {
    const closed = contact.startsWith('/');
    rung.cells[0]![index] = { t: closed ? 'nc' : 'no', a: closed ? contact.slice(1) : contact };
  });
  rung.outputs[0] = output;
  return tidy(rung);
}

const run = (program: Program, memory: Memory, scans = 1, dt = 0.01): Memory => {
  for (let k = 0; k < scans; k++) scan(program, memory, dt);
  return memory;
};

describe('ladder power flow', () => {
  it('contacts in series and a branch in parallel', () => {
    const [rung] = defaultProgram().rungs;
    if (!rung) throw new Error('no rung');
    const out = (bits: Record<string, boolean>): boolean =>
      flow(rung, liveTest((address) => bits[address] === true))[0]?.[COLUMNS] === true;
    expect(out({})).toBe(false);
    expect(out({ I1: true })).toBe(true);
    expect(out({ Q1: true })).toBe(true);
    expect(out({ I1: true, I2: true })).toBe(false);
    expect(out({ Q1: true, I2: true })).toBe(false);
  });

  it('power does not flow backwards through a branch', () => {
    // Row 0: I1, I2. Branch under I2 only (joined at boundaries 1 and 2), holding I3.
    const rung = addRow(emptyRung());
    rung.cells[0]![0] = { t: 'no', a: 'I1' };
    rung.cells[0]![1] = { t: 'no', a: 'I2' };
    rung.cells[1]![1] = { t: 'no', a: 'I3' };
    rung.links[0] = [false, true, true, false, false, false];
    rung.outputs[0] = { t: 'coil', a: 'Q1' };
    const tidied = tidy(rung);
    const out = (bits: Record<string, boolean>): boolean =>
      flow(tidied, liveTest((address) => bits[address] === true))[0]?.[COLUMNS] === true;
    expect(out({ I1: true, I3: true })).toBe(true);
    expect(out({ I1: true, I2: true })).toBe(true);
    // Without I1 the branch has no power to pass on.
    expect(out({ I2: true, I3: true })).toBe(false);
  });

  it('an empty stretch is an open circuit', () => {
    const rung = emptyRung();
    rung.cells[0]![2] = { t: 'no', a: 'I1' };
    rung.outputs[0] = { t: 'coil', a: 'Q1' };
    expect(flow(rung, liveTest(() => true))[0]?.[COLUMNS]).toBe(false);
    expect(flow(tidy(rung), liveTest(() => true))[0]?.[COLUMNS]).toBe(true);
  });
});

describe('ladder scan', () => {
  it('start/stop latch', () => {
    const program = defaultProgram();
    const memory: Memory = {};
    expect(run(program, { ...memory, I1: 1 }).Q1).toBe(1);
    Object.assign(memory, { I1: 1 });
    run(program, memory);
    memory.I1 = 0;
    expect(run(program, memory, 5).Q1).toBe(1);
    memory.I2 = 1;
    expect(run(program, memory).Q1).toBe(0);
    memory.I2 = 0;
    expect(run(program, memory, 5).Q1).toBe(0);
  });

  it('set and reset coils keep their state', () => {
    const program: Program = {
      rungs: [line(['I1'], { t: 'set', a: 'M1' }), line(['I2'], { t: 'reset', a: 'M1' }), line(['M1'], { t: 'coil', a: 'Q2' })],
    };
    const memory: Memory = { I1: 1 };
    run(program, memory);
    memory.I1 = 0;
    expect(run(program, memory, 3).Q2).toBe(1);
    memory.I2 = 1;
    expect(run(program, memory).Q2).toBe(0);
  });

  it('later rungs see what earlier ones wrote in the same scan', () => {
    const program: Program = { rungs: [line(['I1'], { t: 'coil', a: 'M1' }), line(['M1'], { t: 'coil', a: 'Q1' })] };
    expect(run(program, { I1: 1 }).Q1).toBe(1);
    // The other way round it takes a second scan.
    const reversed: Program = { rungs: [...program.rungs].reverse() };
    const memory: Memory = { I1: 1 };
    expect(run(reversed, memory).Q1).toBe(0);
    expect(run(reversed, memory).Q1).toBe(1);
  });

  it('TON turns on after its time and TOF holds on after it', () => {
    const program: Program = {
      rungs: [line(['I1'], { t: 'ton', a: 'T1', pt: 0.5 }), line(['I1'], { t: 'tof', a: 'T2', pt: 0.3 })],
    };
    const memory: Memory = { I1: 1 };
    run(program, memory, 49);
    expect([memory.T1, memory.T2]).toEqual([0, 1]);
    run(program, memory, 2);
    expect(memory.T1).toBe(1);
    memory.I1 = 0;
    run(program, memory, 29);
    expect([memory.T1, memory.T2]).toEqual([0, 1]);
    run(program, memory, 2);
    expect(memory.T2).toBe(0);
  });

  it('a counter counts rising edges and is cleared by a reset', () => {
    const program: Program = {
      rungs: [line(['I1'], { t: 'ctu', a: 'C1', pv: 3 }), line(['I2'], { t: 'reset', a: 'C1' })],
    };
    const memory: Memory = {};
    for (let pulse = 0; pulse < 3; pulse++) {
      memory.I1 = 1;
      run(program, memory, 4);
      expect(memory.C1).toBe(pulse === 2 ? 1 : 0);
      memory.I1 = 0;
      run(program, memory, 2);
    }
    expect(memory['C1:cv']).toBe(3);
    memory.I2 = 1;
    run(program, memory);
    expect([memory.C1, memory['C1:cv']]).toEqual([0, 0]);
  });
});

describe('stored programs', () => {
  it('survive a round trip', () => {
    const program = defaultProgram();
    expect(parseProgram(serializeProgram(program))).toEqual(program);
  });

  it('are cleaned up instead of trusted', () => {
    expect(parseProgram('not json')).toEqual({ rungs: [] });
    const parsed = parseProgram(
      JSON.stringify({
        rungs: [{ cells: [[{ t: 'no', a: 'I99' }, { t: 'nc', a: 'I2' }, { t: 'boom' }]], outputs: [{ t: 'coil', a: 'I1' }], links: 'x' }],
      }),
    );
    expect(parsed.rungs[0]?.cells[0]).toEqual([null, { t: 'nc', a: 'I2' }, null, null, null]);
    expect(parsed.rungs[0]?.outputs).toEqual([null]);
  });
});

describe('PLC in a circuit', () => {
  function build(types: string[], wires: [string, string][]): CircuitDoc {
    let doc = EMPTY_DOC;
    types.forEach((type, index) => {
      doc = addPart(doc, type, { x: index * 1000, y: 7000 }).doc;
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

  /** 24 V supply p1, PLC p2, start p3 on I1, stop (NC) p4 on I2, lamp p5 on Q1. */
  const station = (): CircuitDoc =>
    setPartProp(
      setPartProp(
        build(['dc-supply', 'plc', 'button-start', 'button-stop', 'pilot-lamp'], [
          ['p1.positive', 'p2.L+'], ['p1.negative', 'p2.M'],
          ['p1.positive', 'p3.13'], ['p3.14', 'p2.I1'],
          ['p1.positive', 'p4.11'], ['p4.12', 'p2.I2'],
          ['p1.positive', 'p2.Q1A'], ['p2.Q1B', 'p5.X1'], ['p5.X2', 'p1.negative'],
        ]),
        'p1', 'voltage', 24,
      ),
      'p5', 'voltage', '24',
    );

  it('runs its program against real inputs and outputs', () => {
    // The stop button is normally closed, so the program uses I2 as a normally-open contact.
    const program: Program = { rungs: [defaultProgram().rungs[0]!] };
    program.rungs[0]!.cells[0]![1] = { t: 'no', a: 'I2' };
    const doc = setPartProp(station(), 'p2', 'program', serializeProgram(program));

    const session = new SimSession();
    session.load(doc, {}, [], {});
    let snapshot: SimSnapshot = session.snapshot();
    const advance = (seconds: number, inputs?: SimInputs): void => {
      if (inputs) session.update(doc, inputs);
      for (let t = 0; t < seconds - 1e-9; t += 0.02) snapshot = session.advance(0.02, 60_000);
    };
    advance(0.2);
    expect(snapshot.parts.p2?.aux?.run).toBe(1);
    expect(snapshot.parts.p2?.aux?.I).toBe(0b10);
    expect(snapshot.parts.p2?.aux?.Q).toBe(0);

    advance(0.1, { p3: { pressed: 1 } });
    advance(0.2, { p3: { pressed: 0 } });
    expect(snapshot.parts.p2?.aux?.Q).toBe(1);
    expect(snapshot.parts.p5?.v).toBeGreaterThan(23);

    advance(0.1, { p4: { pressed: 1 } });
    advance(0.2, { p4: { pressed: 0 } });
    expect(snapshot.parts.p2?.aux?.Q).toBe(0);
    expect(Math.abs(snapshot.parts.p5?.v ?? 9)).toBeLessThan(0.1);
    expect(snapshot.burned).toEqual([]);
  });

  it('does nothing without its supply', () => {
    const doc = setPartProp(station(), 'p1', 'voltage', 5);
    const session = new SimSession();
    session.load(doc, { p3: { pressed: 1 } }, [], {});
    const snapshot = session.advance(0.2, 60_000);
    expect(snapshot.parts.p2?.aux?.run).toBe(0);
    expect(snapshot.parts.p2?.aux?.Q).toBe(0);
  });
});

describe('phase 7b', () => {
  const contact = (t: 'p' | 'n', a: string): Rung => {
    const rung = emptyRung();
    rung.cells[0]![0] = { t, a };
    rung.outputs[0] = { t: 'ctu', a: 'C1', pv: 99 };
    return tidy(rung);
  };

  it('edge contacts pass power for one scan only', () => {
    const rising: Program = { rungs: [contact('p', 'I1')] };
    const memory: Memory = { I1: 0 };
    run(rising, memory, 3);
    memory.I1 = 1;
    run(rising, memory, 5);
    memory.I1 = 0;
    run(rising, memory, 5);
    memory.I1 = 1;
    run(rising, memory, 2);
    expect(memory['C1:cv']).toBe(2);

    const falling: Program = { rungs: [contact('n', 'I1')] };
    const other: Memory = { I1: 1 };
    run(falling, other, 3);
    other.I1 = 0;
    run(falling, other, 4);
    expect(other['C1:cv']).toBe(1);
  });

  it('comparators read analog inputs, timers and counters', () => {
    const rung = emptyRung();
    rung.cells[0]![0] = { t: 'cmp', a: 'AI1', op: '>=', k: 500 };
    rung.outputs[0] = { t: 'coil', a: 'Q1' };
    const program: Program = { rungs: [tidy(rung)] };
    expect(run(program, { AI1: 499 }).Q1).toBe(0);
    expect(run(program, { AI1: 500 }).Q1).toBe(1);

    const timed = emptyRung();
    timed.cells[0]![0] = { t: 'cmp', a: 'T1', op: '>', k: 0.2 };
    timed.outputs[0] = { t: 'coil', a: 'Q2' };
    const both: Program = { rungs: [line(['I1'], { t: 'ton', a: 'T1', pt: 1 }), tidy(timed)] };
    const memory: Memory = { I1: 1 };
    run(both, memory, 15);
    expect(memory.Q2).toBe(0);
    run(both, memory, 10);
    expect([memory.Q2, memory.T1]).toEqual([1, 0]);
  });

  it('CTU and CTD on one counter count both ways', () => {
    const program: Program = {
      rungs: [line(['I1'], { t: 'ctu', a: 'C1', pv: 3 }), line(['I2'], { t: 'ctd', a: 'C1', pv: 3 })],
    };
    const memory: Memory = {};
    const pulse = (input: string): void => {
      memory[input] = 1;
      run(program, memory);
      memory[input] = 0;
      run(program, memory);
    };
    pulse('I1');
    pulse('I1');
    pulse('I1');
    expect([memory['C1:cv'], memory.C1]).toEqual([3, 1]);
    pulse('I2');
    expect([memory['C1:cv'], memory.C1]).toEqual([2, 0]);
    pulse('I2');
    pulse('I2');
    pulse('I2');
    expect(memory['C1:cv']).toBe(0);
  });

  it('names and the new elements survive a round trip, bad ones are dropped', () => {
    const rung = emptyRung();
    rung.cells[0]![0] = { t: 'p', a: 'I1' };
    rung.cells[0]![1] = { t: 'cmp', a: 'C2', op: '<>', k: 7 };
    rung.outputs[0] = { t: 'ctd', a: 'C2', pv: 5 };
    const program: Program = { rungs: [tidy(rung)], names: { I1: 'Marcha', AI1: 'Nivel' } };
    expect(parseProgram(serializeProgram(program))).toEqual(program);
    const parsed = parseProgram(
      JSON.stringify({ rungs: [{ cells: [[{ t: 'cmp', a: 'Q1', op: '>', k: 1 }, { t: 'cmp', a: 'AI1', op: '!', k: 1 }]] }], names: { Z9: 'x', I2: '  ' } }),
    );
    expect(parsed.rungs[0]?.cells[0]?.slice(0, 2)).toEqual([null, null]);
    expect(parsed.names).toBeUndefined();
  });

  it('the PLC reads a potentiometer on AI1', () => {
    // 24 V supply p1 also feeds a 0-10 V divider: p3 (14 kΩ) over potentiometer p4 (10 kΩ).
    const rung = emptyRung();
    rung.cells[0]![0] = { t: 'cmp', a: 'AI1', op: '>', k: 500 };
    rung.outputs[0] = { t: 'coil', a: 'Q1' };
    const program = serializeProgram({ rungs: [tidy(rung)] });
    const circuit = (position: number): CircuitDoc => {
      let doc = EMPTY_DOC;
      for (const [index, type] of ['dc-supply', 'plc', 'resistor', 'potentiometer'].entries()) {
        doc = addPart(doc, type, { x: index * 1000, y: 7000 }).doc;
      }
      for (const [from, to] of [
        ['p1.positive', 'p2.L+'], ['p1.negative', 'p2.M'],
        ['p1.positive', 'p3.1'], ['p3.2', 'p4.1'], ['p4.2', 'p1.negative'], ['p4.wiper', 'p2.AI1'],
      ] as [string, string][]) {
        const [fp = '', fi = ''] = from.split('.');
        const [tp = '', ti = ''] = to.split('.');
        doc = addWire(doc, { partId: fp, pinId: fi }, { partId: tp, pinId: ti }, [], '#000')!.doc;
      }
      for (const [id, key, value] of [
        ['p1', 'voltage', 24], ['p2', 'program', program], ['p3', 'resistance', 14000],
        ['p4', 'resistance', 10000], ['p4', 'position', position],
      ] as [string, string, number | string][]) {
        doc = setPartProp(doc, id, key, value);
      }
      return doc;
    };
    const read = (position: number) => {
      const session = new SimSession();
      session.load(circuit(position), {}, [], {});
      let snapshot = session.snapshot();
      for (let k = 0; k < 5; k++) snapshot = session.advance(0.02, 60_000);
      return snapshot.parts.p2?.aux;
    };
    const low = read(20);
    const high = read(80);
    // The wiper runs from 0 to 10 V, read as 0 to 1000 (a little less: the input's 100 kΩ loads the divider).
    expect(Math.abs((low?.AI1 ?? 0) - 800)).toBeLessThan(60);
    expect(Math.abs((high?.AI1 ?? 0) - 200)).toBeLessThan(60);
    expect(low?.Q).toBe(1);
    expect(high?.Q).toBe(0);
  });
});
