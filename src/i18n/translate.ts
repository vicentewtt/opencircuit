import { en } from './locales/en';
import { es, type MessageKey } from './locales/es';

export type { MessageKey };

export const LOCALES = ['es', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'es';

/** Text carried by data (catalog entries) instead of the dictionaries. */
export type LocalizedText = Record<Locale, string>;

/** Native names shown in the language selector (never translated). */
export const LOCALE_NAMES: Record<Locale, string> = {
  es: 'Español',
  en: 'English',
};

export const dictionaries: Record<Locale, Record<MessageKey, string>> = { es, en };

export type MessageParams = Record<string, string | number>;

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/** Returns the message for `key`, replacing `{name}` placeholders with `params`. */
export function translate(locale: Locale, key: MessageKey, params?: MessageParams): string {
  const template = dictionaries[locale][key];
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.hasOwn(params, name) ? String(params[name]) : match,
  );
}

/**
 * Picks the startup locale: a valid stored choice wins, otherwise the first
 * browser language we support (matching by primary subtag, e.g. "es-CL" -> "es").
 */
export function resolveInitialLocale(stored: string | null, preferred: readonly string[]): Locale {
  if (isLocale(stored)) return stored;
  for (const tag of preferred) {
    const primary = tag.toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}
