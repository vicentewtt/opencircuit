import { describe, expect, it } from 'vitest';
import { unpack } from './pack';
import { findFunctions, findIncludes, maskCode, sketchToCpp } from './sketch';

describe('maskCode', () => {
  it('blanks comments, strings and directives but keeps the layout', () => {
    const source = '#define X {\nint a; // } {\nchar *s = "{\\"}"; /* { */ int b;\n';
    const masked = maskCode(source);
    expect(masked).toHaveLength(source.length);
    expect(masked.split('\n')).toHaveLength(source.split('\n').length);
    expect(masked).not.toContain('{');
    expect(masked).toContain('int a;');
    expect(masked).toContain('int b;');
  });
});

describe('findFunctions', () => {
  const prototypes = (source: string): string[] => findFunctions(source).map((fn) => fn.prototype);

  it('finds top-level functions', () => {
    const source = `
int led = 13;
void setup() {
  blink(3);
}
void loop() {}
void blink(int times) {
  for (int i = 0; i < times; i++) { digitalWrite(led, HIGH); }
}
unsigned long since(unsigned long t0)
{
  return millis() - t0;
}
static bool   ready ( const char *name , int& out ) { return true; }
`;
    expect(prototypes(source)).toEqual([
      'void setup();',
      'void loop();',
      'void blink(int times);',
      'unsigned long since(unsigned long t0);',
      'static bool ready(const char *name , int& out);',
    ]);
  });

  it('ignores control flow, calls, methods and nested code', () => {
    const source = `
struct Point { int x; int length() { return x; } };
class Motor { public: void run() { if (on) { go(); } } bool on; };
void Motor::stop() { }
int table[] = { 1, 2 };
void loop() {
  if (digitalRead(2)) { }
  while (ready()) { }
  auto f = [](int a) { return a; };
}
`;
    expect(prototypes(source)).toEqual(['void loop();']);
  });

  it('ignores code inside comments and strings', () => {
    const source = `
// void fake() {
/* int alsoFake() { } */
const char *text = "void no() {";
void real() { }
`;
    expect(prototypes(source)).toEqual(['void real();']);
  });

  it('skips functions with default arguments', () => {
    expect(prototypes('void beep(int ms = 100) { }\nvoid loop() { }')).toEqual(['void loop();']);
  });
});

describe('findIncludes', () => {
  it('lists included headers once, ignoring commented lines', () => {
    const source = `
#include <Servo.h>
  #  include "LiquidCrystal.h"
// #include <Wire.h>
/* #include <SPI.h> */
#include <Servo.h>
`;
    expect(findIncludes(source)).toEqual(['Servo.h', 'LiquidCrystal.h']);
  });
});

describe('sketchToCpp', () => {
  it('adds Arduino.h and prototypes, keeping sketch line numbers', () => {
    const source = '#include <Servo.h>\nint n;\n\nvoid setup() { hello(); }\nvoid loop() {}\nvoid hello() {}\n';
    const lines = sketchToCpp(source).split('\n');
    expect(lines[0]).toBe('#include <Arduino.h>');
    expect(lines[1]).toBe('#line 1 "sketch.ino"');
    expect(lines.slice(2, 5)).toEqual(['#include <Servo.h>', 'int n;', '']);
    expect(lines.slice(5, 8)).toEqual(['void setup();', 'void loop();', 'void hello();']);
    // "void setup()" is line 4 of the sketch.
    expect(lines[8]).toBe('#line 4 "sketch.ino"');
    expect(lines[9]).toBe('void setup() { hello(); }');
  });

  it('leaves sketches without functions untouched after the header', () => {
    expect(sketchToCpp('int x;\n')).toBe('#include <Arduino.h>\n#line 1 "sketch.ino"\nint x;\n');
  });
});

describe('unpack', () => {
  const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

  it('decodes the base64 entries of a pack', () => {
    const entries = unpack(encode({ '/a/b.h': btoa('hello'), '/c.o': btoa('\u0000\u00ff\u0001') }));
    expect([...entries.keys()]).toEqual(['/a/b.h', '/c.o']);
    expect(new TextDecoder().decode(entries.get('/a/b.h'))).toBe('hello');
    expect([...(entries.get('/c.o') ?? [])]).toEqual([0, 255, 1]);
  });

  it('rejects other files', () => {
    expect(() => unpack(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => unpack(encode([1, 2]))).toThrow();
    expect(() => unpack(encode({ '/a': 5 }))).toThrow();
  });
});
