import { createSignal } from 'solid-js';
import { readSetting, writeSetting } from '../platform/settings';
import {
  resolveInitialLocale,
  translate,
  type Locale,
  type LocalizedText,
  type MessageKey,
  type MessageParams,
} from './translate';

export { LOCALES, LOCALE_NAMES, type Locale, type MessageKey } from './translate';

const [locale, setLocaleSignal] = createSignal<Locale>(
  resolveInitialLocale(readSetting('locale'), navigator.languages ?? [navigator.language]),
);

export { locale };

/** Reactive translation: re-evaluates wherever it is used when the locale changes. */
export function t(key: MessageKey, params?: MessageParams): string {
  return translate(locale(), key, params);
}

/** Reactive pick of a localized text carried by data (catalog names, pin names). */
export function tr(text: LocalizedText): string {
  return text[locale()];
}

export function setLocale(next: Locale): void {
  setLocaleSignal(next);
  writeSetting('locale', next);
  document.documentElement.lang = next;
}

export function initI18n(): void {
  document.documentElement.lang = locale();
}
