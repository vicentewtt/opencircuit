import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SimSession } from '../core/sim/session';
import type { SimSnapshot } from '../core/sim/types';
import { addPart, addWire, setPartProp } from '../editor/model/ops';
import { EMPTY_DOC, type CircuitDoc } from '../editor/model/types';
import { BOARD_TARGETS, Toolchain, type ToolFactory } from './toolchain';

/**
 * The Arduino Mega end to end: sketches compiled for the ATmega2560 with the
 * WebAssembly toolchain, run on the emulated chip inside a circuit. Each case
 * targets something the Mega does differently from the Uno.
 */

const AVR_DIR = join(process.cwd(), 'public/avr');
const available = existsSync(join(AVR_DIR, 'runtime-atmega2560.json'));
const MEGA = BOARD_TARGETS.mega!;

const toolchain = new Toolchain({
  readFile: async (path) => new Uint8Array(readFileSync(join(AVR_DIR, path))),
  importFactory: async (path) =>
    ((await import(/* @vite-ignore */ pathToFileURL(join(AVR_DIR, path)).href)) as { default: ToolFactory })
      .default,
});

function build(types: string[], wires: [string, string][]): CircuitDoc {
  let doc = EMPTY_DOC;
  types.forEach((type, index) => {
    doc = addPart(doc, type, { x: index * 600, y: 0 }).doc;
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

async function compile(source: string): Promise<string> {
  const result = await toolchain.compile(source, MEGA);
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  expect(result.ok).toBe(true);
  return result.hex;
}

/** Runs the sketch on the Mega (part p1) and collects what it prints. */
async function simulate(
  doc: CircuitDoc,
  source: string,
  seconds: number,
): Promise<{ snapshot: SimSnapshot; printed: string; led: number[] }> {
  const session = new SimSession();
  session.load(doc, {}, [], { p1: await compile(source) });
  let snapshot = session.snapshot();
  let printed = '';
  const led: number[] = [];
  for (let t = 0; t < seconds - 1e-9; t += 0.02) {
    snapshot = session.advance(0.02, 60_000);
    printed += snapshot.serial.p1 ?? '';
    led.push(snapshot.parts.p1?.aux?.led ?? 0);
  }
  return { snapshot, printed, led };
}

/** Within 3 % of the expected value: the pins have about 30 Ω of their own against the 1 kΩ loads. */
const near = (value: number | undefined, expected: number): void => {
  expect(Math.abs((value ?? 0) - expected) / expected).toBeLessThan(0.04);
};

describe.skipIf(!available)('Arduino Mega 2560', () => {
  it('runs C++, floats, varargs and jump tables, and its LED blinks', async () => {
    const doc = build(['arduino-mega'], []);
    const { printed, led } = await simulate(doc, `
      float values[] = {1.5, 2.25};
      String label = "Mega";
      int pick(int k) {
        switch (k) {
          case 0: return 10; case 1: return 20; case 2: return 30; case 3: return 40;
          case 4: return 50; case 5: return 60; case 6: return 70; default: return -1;
        }
      }
      void setup() {
        Serial.begin(9600);
        Serial1.begin(9600);
        Serial1.println("the other ports work too");
        pinMode(13, OUTPUT);
        Serial.print(label); Serial.print(' ');
        Serial.print(values[0] * values[1], 3); Serial.print(' ');
        Serial.print(pick(3)); Serial.print(' ');
        Serial.println(sqrt(2.0), 4);
        char text[32];
        sprintf(text, "%d-%s-%ld-%u", 42, "x", 70000L, 65000u);
        Serial.println(text);
      }
      void loop() {
        digitalWrite(13, HIGH); delay(50);
        digitalWrite(13, LOW); delay(50);
      }
    `, 0.4);
    expect(printed).toBe('Mega 3.375 40 1.4142\r\n42-x-70000-65000\r\n');
    // The on-board LED (pin 13, port B bit 7 on the Mega) goes fully on and fully off.
    expect(Math.max(...led)).toBeGreaterThan(0.9);
    expect(Math.min(...led)).toBeLessThan(0.1);
  }, 120_000);

  it('reads ADC channels 0-15 and drives PWM from timers 2, 3 and 5', async () => {
    // A0 on 5 V, A8 at the middle of two 10 kΩ, A15 grounded; 1 kΩ loads on D2, D9 and D44.
    let doc = build(['arduino-mega', 'resistor', 'resistor', 'resistor', 'resistor', 'resistor'], [
      ['p1.5V', 'p1.A0'],
      ['p1.5V', 'p2.1'], ['p2.2', 'p1.A8'], ['p1.A8', 'p3.1'], ['p3.2', 'p1.GND1'],
      ['p1.GND1', 'p1.A15'],
      ['p1.D2', 'p4.1'], ['p4.2', 'p1.GND1'],
      ['p1.D44', 'p5.1'], ['p5.2', 'p1.GND1'],
      ['p1.D9', 'p6.1'], ['p6.2', 'p1.GND1'],
    ]);
    doc = set(doc, [
      ['p2', 'resistance', 10000], ['p3', 'resistance', 10000],
      ['p4', 'resistance', 1000], ['p5', 'resistance', 1000], ['p6', 'resistance', 1000],
    ]);
    const { snapshot, printed } = await simulate(doc, `
      void setup() {
        Serial.begin(9600);
        analogWrite(2, 192);   // timer 3
        analogWrite(44, 64);   // timer 5
        analogWrite(9, 128);   // timer 2
        Serial.print(analogRead(A0)); Serial.print(' ');
        Serial.print(analogRead(A8)); Serial.print(' ');
        Serial.println(analogRead(A15));
      }
      void loop() {}
    `, 0.3);
    const [a0, a8, a15] = printed.trim().split(' ').map(Number);
    expect(a0).toBeGreaterThan(1015);
    expect(Math.abs((a8 ?? 0) - 511)).toBeLessThan(8);
    expect(a15).toBeLessThan(5);
    near(snapshot.parts.p4?.v, 5 * (192 / 255) * (1000 / 1030));
    near(snapshot.parts.p5?.v, 5 * (64 / 255) * (1000 / 1030));
    near(snapshot.parts.p6?.v, 5 * (128 / 255) * (1000 / 1030));
  }, 120_000);

  it('counts external interrupts on ports D and E', async () => {
    // D30 toggles 25 times; it is wired to D2 (INT4, port E) and D19 (INT2, port D).
    const doc = build(['arduino-mega'], [['p1.D30', 'p1.D2'], ['p1.D30', 'p1.D19']]);
    const { printed } = await simulate(doc, `
      volatile int risingE = 0, changesD = 0;
      void onE() { risingE++; }
      void onD() { changesD++; }
      void setup() {
        Serial.begin(9600);
        pinMode(30, OUTPUT);
        attachInterrupt(digitalPinToInterrupt(2), onE, RISING);
        attachInterrupt(digitalPinToInterrupt(19), onD, CHANGE);
        for (int i = 0; i < 25; i++) {
          digitalWrite(30, HIGH); delay(2);
          digitalWrite(30, LOW); delay(2);
        }
        Serial.print(risingE); Serial.print(' '); Serial.println(changesD);
      }
      void loop() {}
    `, 0.3);
    expect(printed.trim()).toBe('25 50');
  }, 120_000);

  it('Servo and DHT work with the Mega libraries', async () => {
    const doc = build(['arduino-mega', 'servo', 'dht22'], [
      ['p1.GND1', 'p2.GND'], ['p1.5V', 'p2.VCC'], ['p1.D46', 'p2.SIG'],
      ['p1.GND2', 'p3.GND'], ['p1.5V', 'p3.VCC'], ['p1.D7', 'p3.DATA'],
    ]);
    const { snapshot, printed } = await simulate(
      set(doc, [['p3', 'temperature', 23.4], ['p3', 'humidity', 55.5]]),
      `
      #include <Servo.h>
      #include <DHT.h>
      Servo servo;
      DHT dht(7, DHT22);
      void setup() {
        Serial.begin(9600);
        dht.begin();
        servo.attach(46);
        servo.write(120);
        delay(20);
        Serial.print(dht.readTemperature(), 1); Serial.print(' ');
        Serial.println(dht.readHumidity(), 1);
      }
      void loop() {}
    `,
      0.8,
    );
    expect(printed.trim()).toBe('23.4 55.5');
    expect(Math.abs((snapshot.parts.p2?.aux?.angle ?? 0) - 120)).toBeLessThan(2);
  }, 120_000);

  it('talks I2C on D20/D21 and SPI on D51/D52', async () => {
    const doc = build(['arduino-mega', 'lcd-16x2-i2c', 'led-matrix-max7219'], [
      ['p1.GND1', 'p2.GND'], ['p1.5V', 'p2.VCC'], ['p1.D20', 'p2.SDA'], ['p1.D21', 'p2.SCL'],
      ['p1.GND2', 'p3.GND'], ['p1.5V', 'p3.VCC'], ['p1.D51', 'p3.DIN'], ['p1.D53', 'p3.CS'], ['p1.D52', 'p3.CLK'],
    ]);
    const { snapshot } = await simulate(doc, `
      #include <Wire.h>
      #include <SPI.h>
      #include <LiquidCrystal_I2C.h>
      LiquidCrystal_I2C lcd(0x27, 16, 2);
      void matrix(byte reg, byte value) {
        digitalWrite(53, LOW);
        SPI.transfer(reg);
        SPI.transfer(value);
        digitalWrite(53, HIGH);
      }
      void setup() {
        pinMode(53, OUTPUT);
        SPI.begin();
        matrix(0x0C, 1);
        matrix(0x01, 0xA5);
        lcd.init();
        lcd.backlight();
        lcd.print("Hola Mega");
      }
      void loop() {}
    `, 1.4);
    const aux = snapshot.parts.p2?.aux;
    const text = Array.from({ length: 9 }, (_, k) => String.fromCharCode(aux?.[`c${k}`] ?? 0)).join('');
    expect(text).toBe('Hola Mega');
    expect(snapshot.parts.p3?.aux?.r0).toBe(0xa5);
  }, 120_000);

  it('refuses sketches over 64 KB with a clear message', async () => {
    const result = await toolchain.compile(
      // Three tables of 30 000 bytes (one object can hold at most 32 KB on AVR).
      `const uint8_t a[30000] PROGMEM = {1};
      const uint8_t b[30000] PROGMEM = {2};
      const uint8_t c[30000] PROGMEM = {3};
      void setup() {
        Serial.begin(9600);
        Serial.print(pgm_read_byte(&a[1]) + pgm_read_byte(&b[2]) + pgm_read_byte(&c[3]));
      }
      void loop() {}
      `,
      MEGA,
    );
    expect(result.ok).toBe(false);
    expect(result.diagnostics.at(-1)?.message).toMatch(/Sketch too big: \d+ bytes, the limit for this board in OpenCircuit is 65536/);
  }, 60_000);

  it('explains which libraries the Mega does not have yet', async () => {
    const result = await toolchain.compile('#include <Adafruit_SSD1306.h>\nvoid setup() {}\nvoid loop() {}\n', MEGA);
    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]?.message).toMatch(/Adafruit_SSD1306\.h is not available/);
  }, 60_000);
});
