import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SimSession } from '../core/sim/session';
import { addPart, addWire, setPartProp } from '../editor/model/ops';
import { EMPTY_DOC, type CircuitDoc } from '../editor/model/types';
import type { SimInputs, SimSnapshot } from '../core/sim/types';
import { BOARD_TARGETS, Toolchain, type ToolFactory } from './toolchain';

/**
 * End-to-end tests of the Arduino modules: real sketches using the real
 * libraries, talking to each module through its protocol. Needs public/avr/
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

const set = (doc: CircuitDoc, changes: [string, string, number | string][]): CircuitDoc =>
  changes.reduce((current, [id, key, value]) => setPartProp(current, id, key, value), doc);

/** Compiles the sketch, runs it for `seconds` and returns the last snapshot plus everything printed. */
async function simulate(
  doc: CircuitDoc,
  source: string,
  seconds: number,
  inputs?: { at: number; values: SimInputs },
): Promise<{ snapshot: SimSnapshot; printed: string }> {
  const session = start(doc, await compile(source));
  let snapshot = session.snapshot();
  let printed = '';
  let pending = inputs;
  for (let t = 0; t < seconds - 1e-9; t += 0.02) {
    if (pending && t >= pending.at) {
      session.update(doc, pending.values);
      pending = undefined;
    }
    snapshot = session.advance(0.02, 60_000);
    printed += snapshot.serial.p1 ?? '';
  }
  return { snapshot, printed };
}

const text = (aux: Record<string, number> | undefined, from: number, length: number): string =>
  Array.from({ length }, (_, k) => String.fromCharCode(aux?.[`c${from + k}`] ?? 0)).join('');

describe.skipIf(!available)('Arduino modules', () => {
  it('LiquidCrystal writes on a parallel LCD', async () => {
    const doc = build(['arduino-uno', 'lcd-16x2'], [
      ['p1.GND1', 'p2.VSS'], ['p1.5V', 'p2.VDD'], ['p1.GND1', 'p2.RW'],
      ['p1.D12', 'p2.RS'], ['p1.D11', 'p2.E'],
      ['p1.D5', 'p2.D4'], ['p1.D4', 'p2.D5'], ['p1.D3', 'p2.D6'], ['p1.D2', 'p2.D7'],
      ['p1.5V', 'p2.A'], ['p1.GND1', 'p2.K'],
    ]);
    const { snapshot } = await simulate(doc, `
      #include <LiquidCrystal.h>
      LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
      byte heart[8] = {0, 10, 31, 31, 14, 4, 0, 0};
      void setup() {
        lcd.begin(16, 2);
        lcd.createChar(1, heart);
        lcd.setCursor(0, 0);
        lcd.print("Hola");
        lcd.write(byte(1));
        lcd.setCursor(3, 1);
        lcd.print(42);
      }
      void loop() {}
    `, 0.3);
    const aux = snapshot.parts.p2?.aux;
    expect(text(aux, 0, 4)).toBe('Hola');
    expect(aux?.c4).toBe(1);
    expect([aux?.g9, aux?.g10, aux?.g12]).toEqual([10, 31, 14]);
    expect(text(aux, 16 + 3, 2)).toBe('42');
    // Backlight: about 20 mA through the LED.
    expect(snapshot.parts.p2?.i).toBeGreaterThan(0.01);
  }, 120_000);

  it('LiquidCrystal_I2C writes through the I2C adapter', async () => {
    const doc = build(['arduino-uno', 'lcd-16x2-i2c'], [
      ['p1.GND1', 'p2.GND'], ['p1.5V', 'p2.VCC'], ['p1.A4', 'p2.SDA'], ['p1.A5', 'p2.SCL'],
    ]);
    const { snapshot } = await simulate(doc, `
      #include <Wire.h>
      #include <LiquidCrystal_I2C.h>
      LiquidCrystal_I2C lcd(0x27, 16, 2);
      void setup() {
        lcd.init();
        lcd.backlight();
        lcd.print("I2C listo");
        lcd.setCursor(0, 1);
        lcd.print(3.14);
      }
      void loop() {}
    `, 1.4); // The library waits a full second while starting the display.
    const aux = snapshot.parts.p2?.aux;
    expect(text(aux, 0, 9)).toBe('I2C listo');
    expect(text(aux, 16, 4)).toBe('3.14');
    expect(aux?.bl).toBe(1);
  }, 120_000);

  it('Adafruit_SSD1306 draws on the OLED', async () => {
    const doc = build(['arduino-uno', 'oled-ssd1306'], [
      ['p1.GND1', 'p2.GND'], ['p1.5V', 'p2.VCC'], ['p1.A4', 'p2.SDA'], ['p1.A5', 'p2.SCL'],
    ]);
    const { snapshot } = await simulate(doc, `
      #include <Wire.h>
      #include <Adafruit_GFX.h>
      #include <Adafruit_SSD1306.h>
      Adafruit_SSD1306 display(128, 64, &Wire, -1);
      void setup() {
        display.begin(SSD1306_SWITCHCAPVCC, 0x3C);
        display.clearDisplay();
        display.drawPixel(0, 0, SSD1306_WHITE);
        display.drawPixel(127, 63, SSD1306_WHITE);
        display.fillRect(10, 8, 4, 2, SSD1306_WHITE);
        display.display();
      }
      void loop() {}
    `, 0.5);
    const aux = snapshot.parts.p2?.aux ?? {};
    expect(aux.on).toBe(1);
    const pixel = (x: number, y: number): number => {
      const index = (y >> 3) * 128 + x;
      return (((aux[`f${index >> 2}`] ?? 0) >>> ((index & 3) * 8 + (y & 7))) & 1);
    };
    let lit = 0;
    for (let y = 0; y < 64; y++) for (let x = 0; x < 128; x++) lit += pixel(x, y);
    expect(lit).toBe(2 + 8);
    expect([pixel(0, 0), pixel(127, 63), pixel(10, 8), pixel(13, 9), pixel(14, 9)]).toEqual([1, 1, 1, 1, 0]);
  }, 120_000);

  it('Adafruit_NeoPixel sets the color of each LED', async () => {
    const doc = build(['arduino-uno', 'neopixel-strip-8', 'resistor'], [
      ['p1.GND1', 'p2.GND'], ['p1.5V', 'p2.VCC'], ['p1.D6', 'p3.1'], ['p3.2', 'p2.DIN'],
    ]);
    const { snapshot } = await simulate(set(doc, [['p3', 'resistance', 330]]), `
      #include <Adafruit_NeoPixel.h>
      Adafruit_NeoPixel strip(8, 6, NEO_GRB + NEO_KHZ800);
      void setup() {
        strip.begin();
        strip.setPixelColor(0, strip.Color(255, 0, 0));
        strip.setPixelColor(7, strip.Color(0, 16, 255));
        strip.show();
      }
      void loop() {}
    `, 0.1);
    const aux = snapshot.parts.p2?.aux;
    expect([aux?.p0, aux?.p1, aux?.p7]).toEqual([0xff0000, 0, 0x0010ff]);
  }, 120_000);

  it('Servo moves to the angle written', async () => {
    const doc = build(['arduino-uno', 'servo'], [
      ['p1.GND1', 'p2.GND'], ['p1.5V', 'p2.VCC'], ['p1.D9', 'p2.SIG'],
    ]);
    const { snapshot } = await simulate(doc, `
      #include <Servo.h>
      Servo servo;
      void setup() { servo.attach(9); servo.write(30); }
      void loop() {}
    `, 0.6);
    expect(Math.abs((snapshot.parts.p2?.aux?.angle ?? 0) - 30)).toBeLessThan(1.5);
  }, 120_000);

  it('pulseIn() measures the distance of an HC-SR04', async () => {
    const doc = build(['arduino-uno', 'hc-sr04'], [
      ['p1.GND1', 'p2.GND'], ['p1.5V', 'p2.VCC'], ['p1.D9', 'p2.TRIG'], ['p1.D10', 'p2.ECHO'],
    ]);
    const { printed } = await simulate(set(doc, [['p2', 'distance', 123]]), `
      void setup() { Serial.begin(9600); pinMode(9, OUTPUT); pinMode(10, INPUT); }
      void loop() {
        digitalWrite(9, LOW); delayMicroseconds(2);
        digitalWrite(9, HIGH); delayMicroseconds(10);
        digitalWrite(9, LOW);
        Serial.println(pulseIn(10, HIGH) / 58);
        delay(60);
      }
    `, 0.3);
    const readings = printed.trim().split(/\s+/).map(Number);
    expect(readings.length).toBeGreaterThan(1);
    for (const reading of readings) expect(Math.abs(reading - 123)).toBeLessThanOrEqual(2);
  }, 120_000);

  it('the DHT library reads a DHT22 and a DHT11', async () => {
    const doc = build(['arduino-uno', 'dht22', 'dht11'], [
      ['p1.GND1', 'p2.GND'], ['p1.5V', 'p2.VCC'], ['p1.D2', 'p2.DATA'],
      ['p1.GND1', 'p3.GND'], ['p1.5V', 'p3.VCC'], ['p1.D3', 'p3.DATA'],
    ]);
    const { printed } = await simulate(
      set(doc, [['p2', 'temperature', -7.5], ['p2', 'humidity', 61.2], ['p3', 'temperature', 31], ['p3', 'humidity', 40]]),
      `
      #include <DHT.h>
      DHT fine(2, DHT22);
      DHT coarse(3, DHT11);
      void setup() {
        Serial.begin(9600);
        fine.begin();
        coarse.begin();
        delay(50);
        Serial.print(fine.readTemperature(), 1); Serial.print(' ');
        Serial.print(fine.readHumidity(), 1); Serial.print(' ');
        Serial.print(coarse.readTemperature(), 0); Serial.print(' ');
        Serial.println(coarse.readHumidity(), 0);
      }
      void loop() {}
    `, 0.4);
    expect(printed.trim()).toBe('-7.5 61.2 31 40');
  }, 120_000);

  it('a MAX7219 matrix accepts shiftOut() and hardware SPI', async () => {
    const doc = build(['arduino-uno', 'led-matrix-max7219', 'led-matrix-max7219'], [
      ['p1.GND1', 'p2.GND'], ['p1.5V', 'p2.VCC'], ['p1.D2', 'p2.DIN'], ['p1.D3', 'p2.CS'], ['p1.D4', 'p2.CLK'],
      ['p1.GND1', 'p3.GND'], ['p1.5V', 'p3.VCC'], ['p1.D11', 'p3.DIN'], ['p1.D10', 'p3.CS'], ['p1.D13', 'p3.CLK'],
    ]);
    const { snapshot } = await simulate(doc, `
      #include <SPI.h>
      void slow(byte reg, byte value) {
        digitalWrite(3, LOW);
        shiftOut(2, 4, MSBFIRST, reg);
        shiftOut(2, 4, MSBFIRST, value);
        digitalWrite(3, HIGH);
      }
      void fast(byte reg, byte value) {
        digitalWrite(10, LOW);
        SPI.transfer(reg);
        SPI.transfer(value);
        digitalWrite(10, HIGH);
      }
      void setup() {
        pinMode(2, OUTPUT); pinMode(3, OUTPUT); pinMode(4, OUTPUT);
        SPI.begin();
        slow(0x0C, 1); slow(0x0A, 8); slow(0x01, 0x81); slow(0x08, 0xFF);
        fast(0x0C, 1); fast(0x03, 0x3C);
      }
      void loop() {}
    `, 0.1);
    const slow = snapshot.parts.p2?.aux;
    expect([slow?.r0, slow?.r1, slow?.r7, slow?.level]).toEqual([0x81, 0, 0xff, 8]);
    const fast = snapshot.parts.p3?.aux;
    expect([fast?.r2, fast?.r0]).toEqual([0x3c, 0]);
  }, 120_000);

  it('the Keypad library finds the key pressed', async () => {
    const doc = build(['arduino-uno', 'keypad-4x4'], [
      ['p1.D9', 'p2.R1'], ['p1.D8', 'p2.R2'], ['p1.D7', 'p2.R3'], ['p1.D6', 'p2.R4'],
      ['p1.D5', 'p2.C1'], ['p1.D4', 'p2.C2'], ['p1.D3', 'p2.C3'], ['p1.D2', 'p2.C4'],
    ]);
    const { printed } = await simulate(doc, `
      #include <Keypad.h>
      char keys[4][4] = {{'1','2','3','A'},{'4','5','6','B'},{'7','8','9','C'},{'*','0','#','D'}};
      byte rowPins[4] = {9, 8, 7, 6};
      byte colPins[4] = {5, 4, 3, 2};
      Keypad keypad = Keypad(makeKeymap(keys), rowPins, colPins, 4, 4);
      void setup() { Serial.begin(9600); }
      void loop() {
        char key = keypad.getKey();
        if (key) Serial.print(key);
      }
    `, 0.3, { at: 0.1, values: { p2: { k12: 1 } } });
    expect(printed).toBe('6');
  }, 120_000);

  it('Wire reads the MPU6050 once it is awake', async () => {
    const doc = build(['arduino-uno', 'mpu6050'], [
      ['p1.GND1', 'p2.GND'], ['p1.5V', 'p2.VCC'], ['p1.A4', 'p2.SDA'], ['p1.A5', 'p2.SCL'],
    ]);
    const { printed } = await simulate(set(doc, [['p2', 'ax', -0.5], ['p2', 'gz', 100]]), `
      #include <Wire.h>
      int read16() { int high = Wire.read(); return (high << 8) | Wire.read(); }
      void sample() {
        Wire.beginTransmission(0x68); Wire.write(0x3B); Wire.endTransmission(false);
        Wire.requestFrom(0x68, 14);
        int ax = read16(); read16(); int az = read16(); read16(); read16(); read16(); int gz = read16();
        Serial.print(ax); Serial.print(' '); Serial.print(az); Serial.print(' '); Serial.println(gz);
      }
      void setup() {
        Serial.begin(9600);
        Wire.begin();
        sample();
        Wire.beginTransmission(0x68); Wire.write(0x6B); Wire.write(0); Wire.endTransmission();
        sample();
        Wire.beginTransmission(0x29);
        Serial.println(Wire.endTransmission());
      }
      void loop() {}
    `, 0.2);
    // Asleep it reads zeros; then -0.5 g, 1 g and 100 °/s; nobody answers at 0x29.
    expect(printed.trim().split(/\s+/)).toEqual(['0', '0', '0', '-8192', '16384', '13100', '2']);
  }, 120_000);

  it('the Stepper library turns a 28BYJ-48 through a ULN2003', async () => {
    const doc = build(['arduino-uno', 'ic-uln2003', 'stepper-28byj48'], [
      ['p1.GND1', 'p2.GND'], ['p1.5V', 'p2.COM'],
      ['p1.D8', 'p2.IN1'], ['p1.D9', 'p2.IN2'], ['p1.D10', 'p2.IN3'], ['p1.D11', 'p2.IN4'],
      ['p2.OUT1', 'p3.blue'], ['p2.OUT2', 'p3.pink'], ['p2.OUT3', 'p3.yellow'], ['p2.OUT4', 'p3.orange'],
      ['p1.5V', 'p3.red'],
    ]);
    const { snapshot } = await simulate(doc, `
      #include <Stepper.h>
      Stepper motor(2048, 8, 10, 9, 11);
      void setup() { motor.setSpeed(10); motor.step(12); }
      void loop() {}
    `, 0.2);
    const steps = Math.abs(snapshot.parts.p3?.aux?.steps ?? 0);
    expect(steps).toBeGreaterThanOrEqual(11);
    expect(steps).toBeLessThanOrEqual(12.5);
  }, 120_000);

  it('tone() makes a piezo sound at the right pitch', async () => {
    const doc = build(['arduino-uno', 'piezo'], [['p1.D8', 'p2.positive'], ['p1.GND1', 'p2.negative']]);
    const { snapshot } = await simulate(doc, `
      void setup() { tone(8, 440); }
      void loop() {}
    `, 0.1);
    expect(Math.abs((snapshot.parts.p2?.aux?.hertz ?? 0) - 440)).toBeLessThan(5);
  }, 120_000);
});
