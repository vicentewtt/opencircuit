import { For, Show } from 'solid-js';
import { t } from '../i18n';
import {
  applyUpdate,
  dismissOfflineReadyNotice,
  dismissUpdate,
  offlineReadyNotice,
  updateAvailable,
} from '../pwa/pwa';
import { dismissNotice, notices } from './notices';

export function Toasts() {
  return (
    <div class="toast-region" role="status" aria-live="polite">
      <For each={notices()}>
        {(notice) => (
          <div class="toast">
            <span class="toast-message">{notice.text}</span>
            <div class="toast-actions">
              <button type="button" class="button" onClick={() => dismissNotice(notice.id)}>
                {t('toast.dismiss')}
              </button>
            </div>
          </div>
        )}
      </For>
      <Show when={updateAvailable()}>
        <div class="toast">
          <span class="toast-message">{t('toast.update.message')}</span>
          <div class="toast-actions">
            <button type="button" class="button" onClick={dismissUpdate}>
              {t('toast.update.later')}
            </button>
            <button type="button" class="button button-primary" onClick={applyUpdate}>
              {t('toast.update.apply')}
            </button>
          </div>
        </div>
      </Show>
      <Show when={offlineReadyNotice()}>
        <div class="toast">
          <span class="toast-message">{t('toast.offlineReady')}</span>
          <div class="toast-actions">
            <button type="button" class="button" onClick={dismissOfflineReadyNotice}>
              {t('toast.dismiss')}
            </button>
          </div>
        </div>
      </Show>
    </div>
  );
}
