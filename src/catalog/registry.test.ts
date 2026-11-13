import { describe, expect, it } from 'vitest';
import { LOCALES } from '../i18n/translate';
import { CATEGORIES } from './categories';
import { PART_DEFS, defaultProps, getPartDef, normalizeProps, requirePartDef } from './registry';

describe('catalog', () => {
  it('has parts', () => {
    expect(PART_DEFS.length).toBeGreaterThan(0);
  });

  it.each(PART_DEFS.map((def) => [def.type, def] as const))('%s is well formed', (_type, def) => {
    expect(CATEGORIES.some((category) => category.id === def.category)).toBe(true);
    expect(def.refPrefix).toMatch(/^[A-Z]+$/);
    for (const locale of LOCALES) {
      expect(def.name[locale].trim()).not.toBe('');
    }

    expect(def.pins.length).toBeGreaterThan(0);
    expect(new Set(def.pins.map((pin) => pin.id)).size).toBe(def.pins.length);
    for (const pin of def.pins) {
      // Pins must sit on the grid so rotated parts still line up.
      expect(Math.abs(pin.x % 10), `${pin.id}.x`).toBe(0);
      expect(Math.abs(pin.y % 10), `${pin.id}.y`).toBe(0);
      for (const locale of LOCALES) expect(pin.name[locale].trim()).not.toBe('');
    }

    expect(new Set(def.props.map((prop) => prop.key)).size).toBe(def.props.length);
    for (const prop of def.props) {
      if (prop.kind === 'number') {
        expect(prop.min).toBeLessThanOrEqual(prop.default);
        expect(prop.max).toBeGreaterThanOrEqual(prop.default);
      } else if (prop.kind === 'select') {
        expect(prop.options.some((option) => option.value === prop.default)).toBe(true);
      } else {
        expect(prop.default).not.toBe('');
      }
    }

    const markup = def.footprint(defaultProps(def));
    expect(markup).toContain('<');
    expect(markup).not.toMatch(/<script|on\w+=|href=/i);
  });
});

describe('normalizeProps', () => {
  const resistor = requirePartDef('resistor');
  const led = requirePartDef('led');

  it('keeps valid values', () => {
    expect(normalizeProps(resistor, { resistance: 470 })).toEqual({ resistance: 470, power: 0.25 });
    expect(normalizeProps(led, { color: 'green' })).toEqual({ color: 'green' });
  });

  it('falls back to defaults for missing or invalid values', () => {
    expect(normalizeProps(resistor, null)).toEqual(defaultProps(resistor));
    expect(normalizeProps(resistor, { resistance: 'big' })).toEqual(defaultProps(resistor));
    expect(normalizeProps(led, { color: '"><img>' })).toEqual(defaultProps(led));
  });

  it('clamps numbers and drops unknown keys', () => {
    expect(normalizeProps(resistor, { resistance: -5, extra: 1 })).toEqual({ resistance: 0.1, power: 0.25 });
  });
});

describe('getPartDef', () => {
  it('returns undefined for unknown types', () => {
    expect(getPartDef('flux-capacitor')).toBeUndefined();
  });
});
