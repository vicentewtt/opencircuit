import { describe, expect, it } from 'vitest';
import { formatSi, parseSi } from './si';

describe('parseSi', () => {
  it('parses plain numbers with dot or comma', () => {
    expect(parseSi('220')).toBe(220);
    expect(parseSi('4.7')).toBe(4.7);
    expect(parseSi('4,7')).toBe(4.7);
    expect(parseSi('1e3')).toBe(1000);
  });

  it('applies SI prefixes', () => {
    expect(parseSi('4.7k')).toBe(4700);
    expect(parseSi('4,7 kΩ')).toBe(4700);
    expect(parseSi('2.2Meg')).toBe(2.2e6);
    expect(parseSi('1M')).toBe(1e6);
    expect(parseSi('100n')).toBeCloseTo(1e-7, 15);
    expect(parseSi('10uF')).toBeCloseTo(1e-5, 15);
    expect(parseSi('15 mA')).toBeCloseTo(0.015, 15);
  });

  it('ignores a unit without prefix', () => {
    expect(parseSi('9V')).toBe(9);
    expect(parseSi('50%')).toBe(50);
  });

  it('rejects text that is not a number', () => {
    expect(parseSi('')).toBeNull();
    expect(parseSi('abc')).toBeNull();
    expect(parseSi('k')).toBeNull();
    expect(parseSi('1.2.3')).toBeNull();
  });
});

describe('formatSi', () => {
  it('picks the prefix that keeps the number readable', () => {
    expect(formatSi(4700, 'Ω')).toBe('4.7 kΩ');
    expect(formatSi(220, 'Ω')).toBe('220 Ω');
    expect(formatSi(1e6, 'Ω')).toBe('1 MΩ');
    expect(formatSi(100e-9, 'F')).toBe('100 nF');
    expect(formatSi(0, 'V')).toBe('0 V');
  });

  it('uses the decimal separator of the locale', () => {
    expect(formatSi(4700, 'Ω', 'es')).toBe('4,7 kΩ');
  });

  it('round-trips through parseSi', () => {
    for (const value of [0.47, 220, 4700, 10e3, 1e6, 22e-12, 100e-9, 9]) {
      expect(parseSi(formatSi(value, ''))).toBeCloseTo(value, 15);
    }
  });
});
