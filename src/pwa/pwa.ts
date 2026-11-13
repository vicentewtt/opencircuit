import { createSignal } from 'solid-js';
import { registerSW } from 'virtual:pwa-register';

export type OfflineState = 'unsupported' | 'disabled' | 'pending' | 'ready' | 'error';

const [offlineState, setOfflineState] = createSignal<OfflineState>('pending');
const [updateAvailable, setUpdateAvailable] = createSignal(false);
const [offlineReadyNotice, setOfflineReadyNotice] = createSignal(false);

export { offlineState, updateAvailable, offlineReadyNotice };

const OFFLINE_NOTICE_MS = 6000;

let updateServiceWorker: ((reloadPage?: boolean) => Promise<void>) | undefined;

export function initPwa(): void {
  if (__SINGLE_FILE__) {
    // The whole app is inside the file already: it works offline as it is.
    setOfflineState('ready');
    return;
  }
  if (!('serviceWorker' in navigator)) {
    setOfflineState('unsupported');
    return;
  }
  if (import.meta.env.DEV) {
    // The service worker is only generated for production builds.
    setOfflineState('disabled');
    return;
  }

  updateServiceWorker = registerSW({
    immediate: true,
    onNeedRefresh: () => setUpdateAvailable(true),
    // Fires once, the first time everything has been precached.
    onOfflineReady: () => {
      setOfflineReadyNotice(true);
      // Informative only: it must not stay on top of the workspace.
      setTimeout(() => setOfflineReadyNotice(false), OFFLINE_NOTICE_MS);
    },
    onRegisterError: (error) => {
      console.error('Service worker registration failed', error);
      setOfflineState('error');
    },
  });

  // An active worker means precaching finished (it happens during install).
  void navigator.serviceWorker.ready.then(() => setOfflineState('ready'));
}

/** Activates the waiting service worker and reloads into the new version. */
export function applyUpdate(): void {
  setUpdateAvailable(false);
  void updateServiceWorker?.(true);
}

export function dismissUpdate(): void {
  setUpdateAvailable(false);
}

export function dismissOfflineReadyNotice(): void {
  setOfflineReadyNotice(false);
}
