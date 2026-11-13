/** Parsing and formatting of engineering values with SI prefixes ("4.7k", "100n"). */

const PREFIX_FACTORS: Record<string, number> = {
  G: 1e9,
  M: 1e6,
  k: 1e3,
  K: 1e3,
  m: 1e-3,
  u: 1e-6,
  'µ': 1e-6,
  'μ': 1e-6,
  n: 1e-9,
  p: 1e-12,
};

const FORMAT_PREFIXES: ReadonlyArray<readonly [number, string]> = [
  [1e9, 'G'],
  [1e6, 'M'],
  [1e3, 'k'],
  [1, ''],
  [1e-3, 'm'],
  [1e-6, 'µ'],
  [1e-9, 'n'],
  [1e-12, 'p'],
];

/**
 * Parses values like "4.7k", "4,7 kΩ", "100n", "2.2Meg", "9V" or "1e-6".
 * A trailing unit is ignored. Returns null when the text is not a number.
 */
export function parseSi(input: string): number | null {
  const text = input.replace(/\s+/g, '').replace(',', '.');
  const match = /^([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([a-zA-ZµμΩΩ%°]*)$/.exec(text);
  if (!match) return null;
  const mantissa = Number(match[1]);
  const suffix = match[2] ?? '';
  let factor = 1;
  if (/^meg/i.test(suffix)) {
    factor = 1e6;
  } else if (suffix.length > 0) {
    const first = suffix.charAt(0);
    if (Object.hasOwn(PREFIX_FACTORS, first)) factor = PREFIX_FACTORS[first] ?? 1;
  }
  const value = mantissa * factor;
  return Number.isFinite(value) ? value : null;
}

/** Formats 4700 as "4.7 kΩ" (or "4,7 kΩ" for locales with a decimal comma). */
export function formatSi(value: number, unit = '', locale = 'en'): string {
  if (!Number.isFinite(value)) return '';
  let factor = 1;
  let prefix = '';
  if (value !== 0) {
    const abs = Math.abs(value);
    const smallest = FORMAT_PREFIXES[FORMAT_PREFIXES.length - 1];
    const found = FORMAT_PREFIXES.find(([f]) => abs >= f) ?? smallest;
    if (found) [factor, prefix] = found;
  }
  const text = formatNumber(value / factor, locale);
  const tail = prefix + unit;
  return tail ? `${text} ${tail}` : text;
}

/** Plain number with up to 4 significant digits in the given locale. */
export function formatNumber(value: number, locale = 'en'): string {
  return Number(value.toPrecision(4)).toLocaleString(locale, {
    maximumSignificantDigits: 4,
    useGrouping: false,
  });
}
