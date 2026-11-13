import { describe, expect, it } from 'vitest';
import { bandColors } from './resistor';

const BLACK = '#1b1b1b';
const BROWN = '#7a4a21';
const RED = '#d32f2f';
const ORANGE = '#ef7d1a';
const YELLOW = '#f4d21f';
const GREEN = '#2e9e4f';
const VIOLET = '#8e44ad';
const GOLD = '#c9a227';

describe('bandColors', () => {
  it('encodes common values', () => {
    expect(bandColors(220)).toEqual([RED, RED, BROWN]);
    expect(bandColors(4700)).toEqual([YELLOW, VIOLET, RED]);
    expect(bandColors(10_000)).toEqual([BROWN, BLACK, ORANGE]);
    expect(bandColors(1e6)).toEqual([BROWN, BLACK, GREEN]);
    expect(bandColors(10)).toEqual([BROWN, BLACK, BLACK]);
  });

  it('uses gold as multiplier below 10 ohm', () => {
    expect(bandColors(4.7)).toEqual([YELLOW, VIOLET, GOLD]);
  });

  it('handles values that round up to the next decade', () => {
    expect(bandColors(999)).toEqual([BROWN, BLACK, RED]);
  });
});
