import { For, Show } from 'solid-js';
import { Icon } from '../app/Icon';
import { t } from '../i18n';
import { simActive } from '../sim/simulation';
import { ScopeView } from './ScopeView';
import { activeInstrument, recorders, setActiveInstrumentId, setDockOpen } from './state';

/** Bottom panel with the screens of the oscilloscopes and logic analyzers in the circuit. */
export function InstrumentDock() {
  return (
    <section class="dock" aria-label={t('instruments.title')}>
      <header class="dock-header">
        <div class="tabs" role="tablist">
          <For each={recorders()}>
            {(part) => (
              <button
                type="button"
                role="tab"
                class="tab"
                aria-selected={part.id === activeInstrument()?.id}
                onClick={() => setActiveInstrumentId(part.id)}
              >
                {part.label}
              </button>
            )}
          </For>
        </div>
        <Show when={recorders().length > 0 && !simActive()}>
          <span class="dock-note">{t('instruments.idle')}</span>
        </Show>
        <button
          type="button"
          class="icon-button"
          aria-label={t('instruments.close')}
          title={t('instruments.close')}
          onClick={() => setDockOpen(false)}
        >
          <Icon name="close" />
        </button>
      </header>
      <Show
        when={activeInstrument()}
        keyed
        fallback={<p class="panel-hint dock-empty">{t('instruments.empty')}</p>}
      >
        {(part) => <ScopeView part={part} />}
      </Show>
    </section>
  );
}
