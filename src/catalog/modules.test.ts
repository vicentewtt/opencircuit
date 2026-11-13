import { describe, expect, it } from 'vitest';
import { SimSession } from '../core/sim/session';
import type { SimInputs, SimSnapshot } from '../core/sim/types';
import { addPart, addWire, setPartProp } from '../editor/model/ops';
import { EMPTY_DOC, type CircuitDoc } from '../editor/model/types';
import { Hd44780 } from './hd44780';
import type { BehaviorIo } from './model';
import { PART_DEFS, requirePartDef } from './registry';

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

const set = (doc: CircuitDoc, changes: [string, string, number | string][]): CircuitDoc =>
  changes.reduce((current, [id, key, value]) => setPartProp(current, id, key, value), doc);

function run(doc: CircuitDoc, inputs: SimInputs = {}, seconds = 0.06): SimSnapshot {
  const session = new SimSession();
  session.load(doc, inputs, [], {});
  let snapshot = session.snapshot();
  for (let t = 0; t < seconds - 1e-9; t += 0.02) snapshot = session.advance(0.02, 60_000);
  return snapshot;
}

/** Drives a part's behavior by hand: currents and controls in, switches out. */
function drive(type: string) {
  const behavior = requirePartDef(type).behavior;
  if (!behavior) throw new Error(`${type} has no behavior`);
  const state = behavior.init({});
  const amps: Record<string, number> = {};
  const inputs: Record<string, number> = {};
  const switches: Record<string, boolean> = {};
  const aux: Record<string, number> = {};
  const io: BehaviorIo = {
    props: {},
    dt: 0.001,
    v: () => 0,
    connected: () => true,
    i: (element) => amps[element] ?? 0,
    input: (name) => inputs[name] ?? 0,
    setSwitch: (element, closed) => {
      switches[element] = closed;
    },
    setSource: () => undefined,
    aux: (key, value) => {
      aux[key] = value;
    },
  };
  return { amps, inputs, switches, aux, step: () => behavior.update(io, state) };
}

describe('phase 5c catalog', () => {
  it('has every Arduino module', () => {
    const types = new Set(PART_DEFS.map((def) => def.type));
    for (const type of [
      'lcd-16x2', 'lcd-16x2-i2c', 'oled-ssd1306', 'led-matrix-max7219', 'seven-segment-4',
      'neopixel-strip-8', 'neopixel-strip-16', 'neopixel-ring-12', 'neopixel-ring-16',
      'servo', 'stepper-28byj48', 'stepper-bipolar', 'piezo',
      'keypad-4x4', 'rotary-encoder', 'joystick',
      'hc-sr04', 'pir-sensor', 'dht11', 'dht22', 'lm35', 'tmp36', 'soil-moisture', 'gas-sensor-mq2', 'mpu6050',
    ]) {
      expect(types.has(type), type).toBe(true);
    }
    expect(PART_DEFS.length).toBeGreaterThanOrEqual(90);
  });
});

describe('HD44780', () => {
  /** Sends a byte as two nibbles, the way the libraries do on a 4-bit bus. */
  const send = (chip: Hd44780, rs: boolean, byte: number): void => {
    chip.pulse(rs, byte >> 4, null);
    chip.pulse(rs, byte & 15, null);
  };
  const started = (): Hd44780 => {
    const chip = new Hd44780();
    for (const nibble of [3, 3, 3, 2]) chip.pulse(false, nibble, null);
    for (const command of [0x28, 0x0c, 0x01, 0x06]) send(chip, false, command);
    return chip;
  };
  const line = (chip: Hd44780, row: number): string =>
    Array.from({ length: 16 }, (_, column) => String.fromCharCode(chip.charAt(row, column))).join('');

  it('starts in 4-bit mode and writes on both lines', () => {
    const chip = started();
    for (const char of 'Hola') send(chip, true, char.charCodeAt(0));
    send(chip, false, 0x80 | 0x40);
    for (const char of 'mundo') send(chip, true, char.charCodeAt(0));
    expect(line(chip, 0).trimEnd()).toBe('Hola');
    expect(line(chip, 1).trimEnd()).toBe('mundo');
  });

  it('scrolls the display and clears it', () => {
    const chip = started();
    for (const char of 'abc') send(chip, true, char.charCodeAt(0));
    send(chip, false, 0x18);
    expect(line(chip, 0).slice(0, 2)).toBe('bc');
    send(chip, false, 0x1c);
    expect(line(chip, 0).slice(0, 3)).toBe('abc');
    send(chip, false, 0x01);
    expect(line(chip, 0).trim()).toBe('');
  });

  it('reports a blank screen while the display is off', () => {
    const chip = started();
    send(chip, true, 65);
    send(chip, false, 0x08);
    const aux: Record<string, number> = {};
    chip.report((key, value) => (aux[key] = value), true);
    expect(aux.c0).toBe(0x20);
    expect(chip.dirty).toBe(false);
  });
});

describe('analog sensors', () => {
  /** Sensor p2 on a 5 V supply p1, with a 100 kΩ load p3 on its output. */
  const reading = (type: string, pin: string, changes: [string, string, number | string][]): number => {
    const doc = build(['dc-supply', type, 'resistor'], [
      ['p1.positive', 'p2.VCC'], ['p1.negative', 'p2.GND'], [`p2.${pin}`, 'p3.1'], ['p3.2', 'p1.negative'],
    ]);
    return run(set(doc, [['p3', 'resistance', 100e3], ...changes])).parts.p3?.v ?? NaN;
  };

  it('LM35 and TMP36 give 10 mV per degree', () => {
    expect(reading('lm35', 'OUT', [['p2', 'temperature', 37]])).toBeCloseTo(0.37, 2);
    expect(reading('tmp36', 'OUT', [['p2', 'temperature', 37]])).toBeCloseTo(0.87, 2);
    expect(reading('tmp36', 'OUT', [['p2', 'temperature', -20]])).toBeCloseTo(0.3, 2);
  });

  it('the soil probe reads lower when wet', () => {
    const dry = reading('soil-moisture', 'AO', [['p2', 'moisture', 0]]);
    const wet = reading('soil-moisture', 'AO', [['p2', 'moisture', 100]]);
    expect(dry).toBeGreaterThan(4.5);
    expect(wet).toBeLessThan(1.5);
  });

  it('MQ-2 raises AO with gas and pulls DO low over the threshold', () => {
    expect(reading('gas-sensor-mq2', 'AO', [['p2', 'gas', 10]])).toBeLessThan(1);
    expect(reading('gas-sensor-mq2', 'AO', [['p2', 'gas', 90]])).toBeGreaterThan(3.5);
    expect(reading('gas-sensor-mq2', 'DO', [['p2', 'gas', 10]])).toBeGreaterThan(4.9);
    expect(reading('gas-sensor-mq2', 'DO', [['p2', 'gas', 90]])).toBeLessThan(0.1);
  });

  it('the PIR output goes to 3.3 V with motion', () => {
    expect(Math.abs(reading('pir-sensor', 'OUT', []))).toBeLessThan(0.01);
    expect(reading('pir-sensor', 'OUT', [['p2', 'motion', 'yes']])).toBeCloseTo(3.27, 1);
  });

  it('a joystick is two potentiometers and a button', () => {
    const at = (x: number, y: number, pin: string): number =>
      reading('joystick', pin, [['p2', 'x', x], ['p2', 'y', y]]);
    expect(at(0, 0, 'VRX')).toBeCloseTo(2.44, 1);
    expect(at(100, 0, 'VRX')).toBeGreaterThan(4.9);
    expect(at(0, -100, 'VRY')).toBeLessThan(0.1);

    // SW pulled up through 10 kΩ p3: pressing takes it to ground.
    const doc = set(
      build(['dc-supply', 'joystick', 'resistor'], [
        ['p1.negative', 'p2.GND'], ['p1.positive', 'p3.1'], ['p3.2', 'p2.SW'],
      ]),
      [['p3', 'resistance', 10e3]],
    );
    expect(Math.abs(run(doc).parts.p3?.v ?? 1)).toBeLessThan(0.01);
    expect(run(doc, { p2: { pressed: 1 } }).parts.p3?.v).toBeCloseTo(5, 2);
  });
});

describe('input modules', () => {
  it('a keypad key joins its row with its column', () => {
    // 5 V -> 1 kΩ p3 -> row 2; column 3 to ground.
    const doc = set(
      build(['dc-supply', 'keypad-4x4', 'resistor'], [
        ['p1.positive', 'p3.1'], ['p3.2', 'p2.R2'], ['p2.C3', 'p1.negative'],
      ]),
      [['p3', 'resistance', 1000]],
    );
    expect(Math.abs(run(doc).parts.p3?.i ?? 1)).toBeLessThan(1e-6);
    expect(run(doc, { p2: { k12: 1 } }).parts.p3?.i).toBeGreaterThan(0.0049);
    expect(Math.abs(run(doc, { p2: { k13: 1 } }).parts.p3?.i ?? 1)).toBeLessThan(1e-6);
  });

  it('an encoder click pulls CLK low before DT when turning clockwise', () => {
    const sequence = (input: string): string => {
      const encoder = drive('rotary-encoder');
      encoder.inputs[input] = 1;
      const seen: string[] = [];
      for (let k = 0; k < 12; k++) {
        encoder.step();
        const pattern = `${encoder.switches.a ? 'A' : '-'}${encoder.switches.b ? 'B' : '-'}`;
        if (seen[seen.length - 1] !== pattern) seen.push(pattern);
      }
      expect(Math.abs(encoder.aux.position ?? 0)).toBe(1);
      return seen.join(' ');
    };
    expect(sequence('cw')).toBe('A- AB -B --');
    expect(sequence('ccw')).toBe('-B AB A- --');
  });
});

describe('steppers', () => {
  it('a bipolar motor follows a full-step sequence both ways', () => {
    const motor = drive('stepper-bipolar');
    const forward: [number, number][] = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
    const energize = ([a, b]: [number, number]): void => {
      motor.amps.main = a * 0.2;
      motor.amps['coil:b'] = b * 0.2;
      motor.step();
    };
    for (let turn = 0; turn < 5; turn++) forward.forEach(energize);
    // The first pattern only aligns the rotor (half a step).
    expect(motor.aux.steps).toBe(19.5);
    expect(motor.aux.angle).toBeCloseTo((19.5 / 200) * 360, 6);
    for (let turn = 0; turn < 5; turn++) [...forward].reverse().forEach(energize);
    expect(motor.aux.steps).toBe(0.5);
  });

  it('opposite coils at once do not move a unipolar motor', () => {
    const motor = drive('stepper-28byj48');
    motor.amps['coil:blue'] = 0.1;
    motor.amps['coil:yellow'] = 0.1;
    motor.step();
    expect(motor.aux.steps).toBe(0);
  });
});

describe('4-digit display', () => {
  it('lights only the segments of the digit that is selected', () => {
    // Segment a from 5 V through 220 Ω p3; digit 2 to ground.
    const doc = set(
      build(['dc-supply', 'seven-segment-4', 'resistor'], [
        ['p1.positive', 'p3.1'], ['p3.2', 'p2.a'], ['p2.D2', 'p1.negative'],
      ]),
      [['p3', 'resistance', 220]],
    );
    const aux = run(doc).parts.p2?.aux;
    expect(aux?.a2).toBeGreaterThan(0.01);
    expect(Math.abs(aux?.a1 ?? 1)).toBeLessThan(1e-6);
    expect(Math.abs(aux?.b2 ?? 1)).toBeLessThan(1e-6);
  });
});
