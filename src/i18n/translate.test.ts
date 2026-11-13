import { describe, expect, it } from 'vitest';
import { dictionaries, LOCALES, resolveInitialLocale, translate } from './translate';

const placeholders = (text: string): string[] =>
  [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1] ?? '').sort();

describe('dictionaries', () => {
  const referenceKeys = Object.keys(dictionaries.es).sort();

  it.each(LOCALES)('%s has exactly the same keys as the source locale', (locale) => {
    expect(Object.keys(dictionaries[locale]).sort()).toEqual(referenceKeys);
  });

  it.each(LOCALES)('%s has no empty messages', (locale) => {
    for (const [key, value] of Object.entries(dictionaries[locale])) {
      expect(value.trim(), key).not.toBe('');
    }
  });

  it.each(LOCALES)('%s uses the same placeholders as the source locale', (locale) => {
    for (const [key, value] of Object.entries(dictionaries.es)) {
      const other = dictionaries[locale][key as keyof typeof dictionaries.es];
      expect(placeholders(other), key).toEqual(placeholders(value));
    }
  });
});

describe('translate', () => {
  it('returns the message for the given locale', () => {
    expect(translate('es', 'theme.dark')).toBe('Oscuro');
    expect(translate('en', 'theme.dark')).toBe('Dark');
  });

  it('replaces placeholders', () => {
    expect(translate('en', 'status.engine.ready', { version: 1, ms: '0.4' })).toBe(
      'Ready · protocol v1 · 0.4 ms',
    );
  });

  it('keeps placeholders that have no value', () => {
    expect(translate('en', 'status.engine.error', {})).toBe('Error: {message}');
    expect(translate('en', 'props.multiple', { count: 3 })).toBe('3 items selected');
  });
});

describe('resolveInitialLocale', () => {
  it('prefers a valid stored locale', () => {
    expect(resolveInitialLocale('en', ['es-CL'])).toBe('en');
  });

  it('ignores an invalid stored locale', () => {
    expect(resolveInitialLocale('fr', ['en-US'])).toBe('en');
  });

  it('matches browser languages by primary subtag', () => {
    expect(resolveInitialLocale(null, ['pt-BR', 'es-CL', 'en'])).toBe('es');
  });

  it('falls back to the default locale', () => {
    expect(resolveInitialLocale(null, ['de', 'fr'])).toBe('es');
    expect(resolveInitialLocale(null, [])).toBe('es');
  });
});
