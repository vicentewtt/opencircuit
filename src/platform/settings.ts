/**
 * Small user preferences (theme, locale, last project) persisted in localStorage.
 * Project data lives in IndexedDB, not here.
 */

const PREFIX = 'oc.';

export type SettingKey = 'theme' | 'locale' | 'lastProject' | 'tutorialSeen';

export function readSetting(key: SettingKey): string | null {
  try {
    return localStorage.getItem(PREFIX + key);
  } catch {
    // Storage can be blocked (private mode, strict policies).
    return null;
  }
}

export function writeSetting(key: SettingKey, value: string): void {
  try {
    localStorage.setItem(PREFIX + key, value);
  } catch {
    // Preference just won't persist across sessions.
  }
}
