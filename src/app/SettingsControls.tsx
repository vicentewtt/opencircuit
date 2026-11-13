import { For, type JSX } from 'solid-js';
import { LOCALES, LOCALE_NAMES, locale, setLocale, t, type Locale, type MessageKey } from '../i18n';
import {
  THEME_PREFERENCES,
  setThemePreference,
  themePreference,
  type ThemePreference,
} from '../theme/theme';

const THEME_LABELS: Record<ThemePreference, MessageKey> = {
  system: 'theme.system',
  light: 'theme.light',
  dark: 'theme.dark',
};

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': 2,
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
  'aria-hidden': true,
} as const;

const THEME_ICONS: Record<ThemePreference, () => JSX.Element> = {
  system: () => (
    <svg {...iconProps}>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </svg>
  ),
  light: () => (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  ),
  dark: () => (
    <svg {...iconProps}>
      <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
    </svg>
  ),
};

/** Language selector and theme switch. */
export function SettingsControls() {
  return (
    <div class="settings-controls">
      <select
        class="select"
        aria-label={t('settings.language')}
        onChange={(event) => setLocale(event.currentTarget.value as Locale)}
      >
        <For each={LOCALES}>
          {(code) => (
            <option value={code} selected={code === locale()}>
              {LOCALE_NAMES[code]}
            </option>
          )}
        </For>
      </select>

      <div class="segmented" role="radiogroup" aria-label={t('settings.theme')}>
        <For each={THEME_PREFERENCES}>
          {(preference) => (
            <button
              type="button"
              role="radio"
              class="segmented-option"
              aria-checked={themePreference() === preference}
              aria-label={t(THEME_LABELS[preference])}
              title={t(THEME_LABELS[preference])}
              onClick={() => setThemePreference(preference)}
            >
              {THEME_ICONS[preference]()}
            </button>
          )}
        </For>
      </div>
    </div>
  );
}
