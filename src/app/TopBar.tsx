import { Show } from 'solid-js';
import { t, type MessageKey } from '../i18n';
import { currentProject, renameProject, saveState, type SaveState } from '../project/projects';
import { codePanelOpen, setCodePanelOpen } from '../arduino/state';
import { dockOpen, setDockOpen } from '../instruments/state';
import { ladderPanelOpen, plcs, setLadderPanelOpen } from '../plc/state';
import { simActive, simStatus, toggleSim } from '../sim/simulation';
import { Icon } from './Icon';
import { setMenuOpen } from './notices';
import { SettingsControls } from './SettingsControls';

const SAVE_LABELS: Record<SaveState, MessageKey> = {
  saved: 'save.saved',
  unsaved: 'save.unsaved',
  saving: 'save.saving',
  error: 'save.error',
};

export function TopBar() {
  return (
    <header class="topbar">
      <div class="brand">
        <svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true">
          <path
            d="M8 32h10l4-10 7 20 7-20 7 20 3-10h10"
            fill="none"
            stroke="currentColor"
            stroke-width="5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="brand-name">OpenCircuit</span>
      </div>

      <input
        class="project-name"
        type="text"
        maxLength={80}
        spellcheck={false}
        aria-label={t('project.name')}
        value={currentProject().name}
        onChange={(event) => {
          renameProject(event.currentTarget.value);
          event.currentTarget.value = currentProject().name;
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur();
        }}
      />
      <span class="save-state" data-state={saveState()}>
        {t(SAVE_LABELS[saveState()])}
      </span>

      <button
        type="button"
        class="button code-button"
        aria-pressed={codePanelOpen()}
        title={t('code.open')}
        onClick={() => {
          setLadderPanelOpen(false);
          setCodePanelOpen(!codePanelOpen());
        }}
      >
        <Icon name="code" />
        <span class="button-label">{t('code.open')}</span>
      </button>
      <Show when={plcs().length > 0}>
        <button
          type="button"
          class="button code-button"
          aria-pressed={ladderPanelOpen()}
          title={t('plc.title')}
          onClick={() => setLadderPanelOpen(!ladderPanelOpen())}
        >
          <Icon name="ladder" />
          <span class="button-label">{t('plc.open')}</span>
        </button>
      </Show>
      <button
        type="button"
        class="button code-button"
        aria-pressed={dockOpen()}
        data-tour="instruments"
        title={t('instruments.open')}
        onClick={() => setDockOpen(!dockOpen())}
      >
        <Icon name="wave" />
        <span class="button-label">{t('instruments.open')}</span>
      </button>
      <button
        type="button"
        data-tour="simulate"
        class="button sim-button"
        classList={{ 'button-primary': !simActive(), 'button-danger': simActive() }}
        onClick={toggleSim}
      >
        <Icon name={simActive() ? 'stop' : 'play'} />
        {t(simStatus() === 'starting' ? 'sim.compiling' : simActive() ? 'sim.stop' : 'sim.start')}
      </button>

      <div class="topbar-settings">
        <SettingsControls />
      </div>
      <button
        type="button"
        class="icon-button"
        data-tour="menu"
        aria-label={t('menu.open')}
        title={t('menu.open')}
        onClick={() => setMenuOpen(true)}
      >
        <Icon name="menu" />
      </button>
    </header>
  );
}
