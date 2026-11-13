import { createSignal, onCleanup, onMount } from 'solid-js';
import { getCoreClient } from '../core/client';
import { t, type MessageKey } from '../i18n';
import { offlineState, type OfflineState } from '../pwa/pwa';

type CheckState = 'ok' | 'pending' | 'warn' | 'error';

type EngineStatus =
  | { state: 'pending' }
  | { state: 'ready'; protocolVersion: number; roundTripMs: number }
  | { state: 'error'; message: string };

const OFFLINE_CHECK: Record<OfflineState, { state: CheckState; label: MessageKey }> = {
  ready: { state: 'ok', label: 'status.offline.ready' },
  pending: { state: 'pending', label: 'status.offline.pending' },
  disabled: { state: 'warn', label: 'status.offline.disabled' },
  unsupported: { state: 'warn', label: 'status.offline.unsupported' },
  error: { state: 'error', label: 'status.offline.error' },
};

function StatusRow(props: { label: string; state: CheckState; detail: string }) {
  return (
    <li class="status-row">
      <span class="status-dot" data-state={props.state} aria-hidden="true" />
      <span class="status-label">{props.label}</span>
      <span class="status-detail">{props.detail}</span>
    </li>
  );
}

export function StatusPanel() {
  const [engine, setEngine] = createSignal<EngineStatus>({ state: 'pending' });
  const [online, setOnline] = createSignal(navigator.onLine);
  const storageAvailable = typeof indexedDB !== 'undefined';

  const handleOnline = () => setOnline(true);
  const handleOffline = () => setOnline(false);

  onMount(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    void (async () => {
      try {
        const client = getCoreClient();
        const { protocolVersion } = await client.call('handshake', null);
        const start = performance.now();
        await client.call('ping', { payload: 1 });
        setEngine({ state: 'ready', protocolVersion, roundTripMs: performance.now() - start });
      } catch (error) {
        setEngine({
          state: 'error',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    })();
  });

  onCleanup(() => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  });

  const engineState = (): CheckState => {
    const status = engine();
    return status.state === 'ready' ? 'ok' : status.state;
  };

  const engineDetail = (): string => {
    const status = engine();
    switch (status.state) {
      case 'ready':
        return t('status.engine.ready', {
          version: status.protocolVersion,
          ms: status.roundTripMs.toFixed(1),
        });
      case 'error':
        return t('status.engine.error', { message: status.message });
      case 'pending':
        return t('status.engine.pending');
    }
  };

  return (
    <section class="status-panel" aria-labelledby="status-title">
      <h3 id="status-title" class="eyebrow">
        {t('status.title')}
      </h3>
      <ul class="status-list">
        <StatusRow label={t('status.engine')} state={engineState()} detail={engineDetail()} />
        <StatusRow
          label={t('status.offline')}
          state={OFFLINE_CHECK[offlineState()].state}
          detail={t(OFFLINE_CHECK[offlineState()].label)}
        />
        <StatusRow
          label={t('status.storage')}
          state={storageAvailable ? 'ok' : 'error'}
          detail={t(storageAvailable ? 'status.storage.ok' : 'status.storage.missing')}
        />
        <StatusRow
          label={t('status.network')}
          state={online() ? 'ok' : 'warn'}
          detail={t(online() ? 'status.network.online' : 'status.network.offline')}
        />
        <StatusRow label={t('status.version')} state="ok" detail={__APP_VERSION__} />
      </ul>
    </section>
  );
}
