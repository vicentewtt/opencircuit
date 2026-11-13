import { For, Show, createEffect, createSignal } from 'solid-js';
import { locale, t, tr } from '../i18n';
import { EXAMPLES } from '../project/examples';
import { FILE_EXTENSION } from '../project/format';
import {
  currentProject,
  exportCurrentProject,
  importProjectFile,
  newProject,
  openExample,
  openProject,
  projectList,
  removeProject,
} from '../project/projects';
import { Icon } from './Icon';
import { menuOpen, setMenuOpen } from './notices';
import { SettingsControls } from './SettingsControls';
import { openTour } from './tour';
import { StatusPanel } from './StatusPanel';

/** Projects, settings and system status. */
export function MenuDialog() {
  let dialog!: HTMLDialogElement;
  let fileInput!: HTMLInputElement;
  const [confirmingId, setConfirmingId] = createSignal<string | null>(null);

  createEffect(() => {
    if (menuOpen() && !dialog.open) dialog.showModal();
    else if (!menuOpen() && dialog.open) dialog.close();
  });

  const close = (): void => {
    setConfirmingId(null);
    setMenuOpen(false);
  };

  const formatDate = (timestamp: number): string =>
    new Date(timestamp).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' });

  const handleImport = async (event: Event & { currentTarget: HTMLInputElement }): Promise<void> => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (file && (await importProjectFile(file))) close();
  };

  return (
    <dialog
      ref={dialog}
      class="menu-dialog"
      aria-labelledby="menu-title"
      onClose={close}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === dialog) close();
      }}
    >
      <header class="dialog-header">
        <h2 id="menu-title">{t('menu.title')}</h2>
        <button type="button" class="icon-button" aria-label={t('menu.close')} onClick={close}>
          <Icon name="close" />
        </button>
      </header>

      <div class="dialog-body">
        <section>
          <h3 class="eyebrow">{t('menu.projects')}</h3>
          <div class="button-row">
            <button
              type="button"
              class="button"
              onClick={() => void newProject().then(close)}
            >
              <Icon name="plus" />
              {t('project.new')}
            </button>
            <button type="button" class="button" onClick={() => fileInput.click()}>
              <Icon name="upload" />
              {t('project.import')}
            </button>
            <button type="button" class="button" onClick={exportCurrentProject}>
              <Icon name="download" />
              {t('project.export')}
            </button>
            <input
              ref={fileInput}
              type="file"
              hidden
              accept={`${FILE_EXTENSION},application/json,.json`}
              onChange={(event) => void handleImport(event)}
            />
          </div>

          <ul class="project-list">
            <For each={projectList()}>
              {(project) => (
                <li class="project-row" data-current={project.id === currentProject().id}>
                  <div class="project-info">
                    <span class="project-title">{project.name}</span>
                    <span class="project-date">{formatDate(project.updatedAt)}</span>
                  </div>
                  <Show
                    when={project.id !== currentProject().id}
                    fallback={<span class="badge">{t('project.current')}</span>}
                  >
                    <button
                      type="button"
                      class="button"
                      onClick={() => void openProject(project.id).then(close)}
                    >
                      {t('project.open')}
                    </button>
                  </Show>
                  <Show
                    when={confirmingId() === project.id}
                    fallback={
                      <button
                        type="button"
                        class="icon-button"
                        aria-label={`${t('project.delete')}: ${project.name}`}
                        title={t('project.delete')}
                        onClick={() => setConfirmingId(project.id)}
                      >
                        <Icon name="trash" />
                      </button>
                    }
                  >
                    <button
                      type="button"
                      class="button button-danger"
                      onClick={() => {
                        setConfirmingId(null);
                        void removeProject(project.id);
                      }}
                    >
                      {t('project.confirmDelete')}
                    </button>
                  </Show>
                </li>
              )}
            </For>
          </ul>
        </section>

        <section>
          <h3 class="eyebrow">{t('menu.examples')}</h3>
          <ul class="example-list">
            <For each={EXAMPLES}>
              {(example) => (
                <li>
                  <button type="button" class="example-item" onClick={() => void openExample(example).then(close)}>
                    <span class="project-title">{tr(example.name)}</span>
                    <span class="example-description">{tr(example.description)}</span>
                  </button>
                </li>
              )}
            </For>
          </ul>
        </section>

        <section>
          <h3 class="eyebrow">{t('menu.settings')}</h3>
          <SettingsControls />
          <div class="button-row">
            <button
              type="button"
              class="button"
              onClick={() => {
                close();
                openTour();
              }}
            >
              {t('tour.replay')}
            </button>
          </div>
        </section>

        <StatusPanel />
      </div>
    </dialog>
  );
}
