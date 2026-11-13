import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseIntelHex } from '../core/avr/intelhex';
import { SimSession } from '../core/sim/session';
import { addPart, addWire, setPartProp } from '../editor/model/ops';
import { EMPTY_DOC, type CircuitDoc } from '../editor/model/types';
import { BOARD_TARGETS, Toolchain, parseDiagnostics, type ToolFactory } from './toolchain';

/**
 * End-to-end: real sketches compiled with the WebAssembly toolchain and run
 * on the emulated board inside a simulated circuit. Needs public/avr/
 * (created by scripts/prepare-avr.mjs, which runs before the tests).
 */

const AVR_DIR = join(process.cwd(), 'public/avr');
const available = existsSync(join(AVR_DIR, 'manifest.json'));
const UNO = BOARD_TARGETS.uno!;

const toolchain = new Toolchain({
  readFile: async (path) => new Uint8Array(readFileSync(join(AVR_DIR, path))),
  importFactory: async (path) =>
    ((await import(/* @vite-ignore */ pathToFileURL(join(AVR_DIR, path)).href)) as { default: ToolFactory })
      .default,
});

function build(types: string[], wires: [string, string][]): CircuitDoc {
  let doc = EMPTY_DOC;
  types.forEach((type, index) => {
    doc = addPart(doc, type, { x: index * 300, y: 0 }).doc;
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

async function compile(source: string): Promise<string> {
  const result = await toolchain.compile(source, UNO);
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(result.ok).toBe(true);
  return result.hex;
}

function start(doc: CircuitDoc, hex: string): SimSession {
  const session = new SimSession();
  session.load(doc, {}, [], { p1: hex });
  return session;
}

describe('Intel HEX', () => {
  it('loads data records and leaves the rest erased', () => {
    const flash = parseIntelHex(':0400000001020304F2\r\n:020010000A0BD9\r\n:00000001FF\r\n', 32);
    expect([...flash.slice(0, 5)]).toEqual([1, 2, 3, 4, 0xff]);
    expect([...flash.slice(16, 18)]).toEqual([0x0a, 0x0b]);
  });

  it('rejects corrupt records', () => {
    expect(() => parseIntelHex(':0400000001020304F3\n', 32)).toThrow();
    expect(() => parseIntelHex('hello\n', 32)).toThrow();
  });
});

describe('parseDiagnostics', () => {
  it('extracts located errors, warnings and linker errors', () => {
    const diagnostics = parseDiagnostics([
      "sketch.ino: In function 'void loop()':",
      "sketch.ino:7:3: error: 'foo' was not declared in this scope",
      'sketch.ino:9:12: warning: unused variable',
      "/build/sketch.o: In function `setup': undefined reference to `missing()'",
    ]);
    expect(diagnostics).toEqual([
      { severity: 'error', line: 7, column: 3, message: "'foo' was not declared in this scope" },
      { severity: 'warning', line: 9, column: 12, message: 'unused variable' },
      { severity: 'error', line: 0, column: 0, message: "undefined reference to 'missing()'" },
    ]);
  });
});

describe.skipIf(!available)('Arduino toolchain and emulation', () => {
  it('reports compile errors with the sketch line', async () => {
    const result = await toolchain.compile('void setup() {\n  pinMode(13, OUTPUT)\n}\nvoid loop() {}\n', UNO);
    expect(result.ok).toBe(false);
    const error = result.diagnostics.find((d) => d.severity === 'error');
    expect(error?.line).toBe(3);
    expect(error?.message).toMatch(/expected ';'/);
  }, 60_000);

  it('blinks an external LED: on for the first second, off for the next', async () => {
    const hex = await compile(`
void setup() { pinMode(13, OUTPUT); }
void loop() {
  digitalWrite(13, HIGH); delay(1000);
  digitalWrite(13, LOW);  delay(1000);
}`);
    // Uno p1, resistor p2 (220 Ω), LED p3: D13 -> R -> LED -> GND.
    const doc = build(
      ['arduino-uno', 'resistor', 'led'],
      [['p1.D13', 'p2.1'], ['p2.2', 'p3.anode'], ['p3.cathode', 'p1.GND1']],
    );
    const session = start(doc, hex);
    const on = session.advance(0.5, 60_000);
    expect(on.converged).toBe(true);
    // (5 V − ~1.85 V) / (220 Ω + 25 Ω of the pin) ≈ 13 mA
    expect(on.parts.p3?.i).toBeGreaterThan(0.011);
    expect(on.parts.p3?.i).toBeLessThan(0.015);
    expect(on.parts.p1?.aux?.led).toBeGreaterThan(0.95);
    expect(on.warnings).toEqual([]);

    session.advance(0.6, 60_000);
    const off = session.advance(0.3, 60_000);
    expect(Math.abs(off.parts.p3?.i ?? 1)).toBeLessThan(1e-6);
    expect(off.parts.p1?.aux?.led).toBeLessThan(0.05);
    expect(off.time).toBeCloseTo(1.4, 6);
  }, 120_000);

  it('reads a potentiometer and a pulled-up input, and prints over serial', async () => {
    const hex = await compile(`
void setup() {
  Serial.begin(9600);
  pinMode(2, INPUT_PULLUP);
  pinMode(3, INPUT_PULLUP);
}
void loop() {
  Serial.print(analogRead(A0)); Serial.print(' ');
  Serial.print(digitalRead(2)); Serial.println(digitalRead(3));
  delay(50);
}`);
    // Pot p2 across 5 V and GND with the wiper on A0; D2 tied to ground, D3 left open.
    let doc = build(
      ['arduino-uno', 'potentiometer'],
      [['p1.5V', 'p2.1'], ['p2.2', 'p1.GND2'], ['p2.wiper', 'p1.A0'], ['p1.D2', 'p1.GND1']],
    );
    doc = setPartProp(doc, 'p2', 'position', 25);
    const session = start(doc, hex);
    let text = '';
    for (let i = 0; i < 10; i++) text += session.advance(0.02, 60_000).serial.p1 ?? '';
    const lines = text.trim().split(/\r?\n/);
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const [reading, digital] = (lines[1] ?? '').split(' ');
    // Wiper at 25 % from terminal 1 (5 V): 75 % of 5 V -> about 767 of 1023.
    expect(Number(reading)).toBeGreaterThan(755);
    expect(Number(reading)).toBeLessThan(780);
    expect(digital).toBe('01');
  }, 120_000);

  it('PWM drives the average voltage and serial input reaches the sketch', async () => {
    const hex = await compile(`
void setup() { Serial.begin(115200); analogWrite(9, 64); }
void loop() {
  if (Serial.available()) { char c = Serial.read(); Serial.print('<'); Serial.print(c); Serial.print('>'); }
}`);
    // 1 kΩ load p2 from D9 to ground.
    let doc = build(['arduino-uno', 'resistor'], [['p1.D9', 'p2.1'], ['p2.2', 'p1.GND1']]);
    doc = setPartProp(doc, 'p2', 'resistance', 1000);
    const session = start(doc, hex);
    session.advance(0.05, 60_000);
    session.serialWrite('p1', 'ok');
    const snapshot = session.advance(0.1, 60_000);
    // 64/255 duty of 5 V behind 25 Ω into 1 kΩ: 5 · 0.251 · 1000/1025 ≈ 1.22 V.
    expect(snapshot.parts.p2?.v).toBeGreaterThan(1.17);
    expect(snapshot.parts.p2?.v).toBeLessThan(1.28);
    expect(snapshot.serial.p1).toBe('<o><k>');
  }, 120_000);

  it('warns when a pin is overloaded', async () => {
    const hex = await compile('void setup() { pinMode(7, OUTPUT); digitalWrite(7, HIGH); }\nvoid loop() {}');
    const doc = build(['arduino-uno'], [['p1.D7', 'p1.GND1']]);
    const snapshot = start(doc, hex).advance(0.05, 60_000);
    expect(snapshot.warnings[0]).toMatchObject({ partId: 'p1', cause: 'pin-overcurrent', limit: 0.04 });
  }, 120_000);

  it('shiftOut() loads a 74HC595 that lights the chosen LEDs', async () => {
    const hex = await compile(`
      void setup() {
        pinMode(2, OUTPUT); pinMode(3, OUTPUT); pinMode(4, OUTPUT);
        digitalWrite(3, LOW);
        shiftOut(2, 4, MSBFIRST, 0b10000101);
        digitalWrite(3, HIGH);
      }
      void loop() {}
    `);
    // Uno p1, 74HC595 p2 (data 2, latch 3, clock 4), 1 kΩ loads on QA p3, QB p4, QC p5, QH p6.
    const doc = build(['arduino-uno', 'ic-74hc595', 'resistor', 'resistor', 'resistor', 'resistor'], [
      ['p1.5V', 'p2.VCC'],
      ['p1.GND1', 'p2.GND'],
      ['p1.5V', 'p2.nSRCLR'],
      ['p1.GND1', 'p2.nOE'],
      ['p1.D2', 'p2.SER'],
      ['p1.D3', 'p2.RCLK'],
      ['p1.D4', 'p2.SRCLK'],
      ['p2.QA', 'p3.1'],
      ['p3.2', 'p1.GND1'],
      ['p2.QB', 'p4.1'],
      ['p4.2', 'p1.GND1'],
      ['p2.QC', 'p5.1'],
      ['p5.2', 'p1.GND1'],
      ['p2.QH', 'p6.1'],
      ['p6.2', 'p1.GND1'],
    ]);
    const session = start(doc, hex);
    let snapshot = session.advance(0.02, 60_000);
    for (let k = 0; k < 4; k++) snapshot = session.advance(0.02, 60_000);
    const lit = ['p3', 'p4', 'p5', 'p6'].map((id) => ((snapshot.parts[id]?.v ?? 0) > 4 ? 1 : 0));
    expect(lit).toEqual([1, 0, 1, 1]);
  });

  it('links every bundled library', async () => {
    const result = await toolchain.compile(
      `
#include <Servo.h>
#include <Wire.h>
#include <SPI.h>
#include <LiquidCrystal.h>
#include <LiquidCrystal_I2C.h>
#include <Adafruit_NeoPixel.h>
#include <DHT.h>
#include <Keypad.h>
#include <Stepper.h>

Servo servo;
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
LiquidCrystal_I2C lcdI2c(0x27, 16, 2);
Adafruit_NeoPixel strip(8, 6, NEO_GRB + NEO_KHZ800);
DHT dht(7, DHT11);
Stepper stepper(200, 8, 9, 10, 13);
char keys[2][2] = {{'1', '2'}, {'3', '4'}};
byte rowPins[2] = {A0, A1};
byte colPins[2] = {A2, A3};
Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, 2, 2);

void setup() {
  servo.attach(9);
  lcd.begin(16, 2);
  lcdI2c.init();
  strip.begin();
  dht.begin();
  SPI.begin();
  Wire.begin();
}

void loop() {
  servo.write(90);
  lcd.print(dht.readTemperature());
  lcdI2c.print(keypad.getKey());
  strip.setPixelColor(0, strip.Color(255, 0, 0));
  strip.show();
  stepper.step(1);
  SPI.transfer(0);
}`,
      UNO,
    );
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.flashBytes).toBeGreaterThan(5000);
    expect(result.flashBytes).toBeLessThan(UNO.maxFlash);
  }, 120_000);
});
