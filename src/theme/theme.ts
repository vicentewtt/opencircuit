import { createSignal } from 'solid-js';
import { readSetting, writeSetting } from '../platform/settings';
import {
  parseThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from './resolve';

export { THEME_PREFERENCES, type ThemePreference } from './resolve';

/** Browser chrome color per theme; must match --surface in global.css. */
const CHROME_COLORS: Record<ResolvedTheme, string> = {
  light: '#ffffff',
  dark: '#1a1e1c',
};

const systemDarkQuery = window.matchMedia('(prefers-color-scheme: dark)');

const [themePreference, setPreferenceSignal] = createSignal<ThemePreference>(
  parseThemePreference(readSetting('theme')),
);
const [systemPrefersDark, setSystemPrefersDark] = createSignal(systemDarkQuery.matches);

export { themePreference };

export function resolvedTheme(): ResolvedTheme {
  return resolveTheme(themePreference(), systemPrefersDark());
}

function applyTheme(): void {
  const theme = resolvedTheme();
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', CHROME_COLORS[theme]);
}

export function setThemePreference(next: ThemePreference): void {
  setPreferenceSignal(next);
  writeSetting('theme', next);
  applyTheme();
}

export function initTheme(): void {
  systemDarkQuery.addEventListener('change', (event) => {
    setSystemPrefersDark(event.matches);
    applyTheme();
  });
  applyTheme();
}
