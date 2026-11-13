import { For, Match, Show, Switch, createEffect, createSignal, on, onCleanup, onMount } from 'solid-js';
import { Icon } from '../app/Icon';
import { setPartProp } from '../editor/model/ops';
import { commit, doc } from '../editor/store';
import { t } from '../i18n';
import { SerialPlotter } from '../instruments/SerialPlotter';
import { clearSerial, sendSerial, serialText, simActive } from '../sim/simulation';
import { resolvedTheme } from '../theme/theme';
import type { CodeEditor } from './editor';
import {
  activeBoard,
  boards,
  buildBoard,
  buildReport,
  setActiveBoardId,
  setCodePanelOpen,
  sketchOf,
} from './state';

type Tab = 'code' | 'serial' | 'plotter';

function SerialMonitor(props: { partId: string }) {
  let output!: HTMLPreElement;
  const [text, setText] = createSignal('');
  const received = (): string => serialText(props.partId);

  // Keep the newest output in view.
  createEffect(
    on(received, () => {
      output.scrollTop = output.scrollHeight;
    }),
  );

  const send = (): void => {
    if (!simActive()) return;
    sendSerial(props.partId, `${text()}\n`);
    setText('');
  };

  return (
    <div class="serial">
      <pre ref={output} class="serial-output" aria-live="off">
        {received() || <span class="panel-hint">{t('serial.empty')}</span>}
      </pre>
      <form
        class="serial-input"
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        <input
          type="text"
          autocomplete="off"
          spellcheck={false}
          placeholder={t('serial.placeholder')}
          aria-label={t('serial.placeholder')}
          value={text()}
          disabled={!simActive()}
          onInput={(event) => setText(event.currentTarget.value)}
        />
        <button type="submit" class="button" disabled={!simActive()}>
          {t('serial.send')}
        </button>
        <button type="button" class="button" onClick={() => clearSerial(props.partId)}>
          {t('serial.clear')}
        </button>
      </form>
    </div>
  );
}

function SketchEditor(props: { partId: string; onReady: (editor: CodeEditor) => void }) {
  let host!: HTMLDivElement;
  let editor: CodeEditor | undefined;
  const code = (): string => {
    const part = doc().parts.find((candidate) => candidate.id === props.partId);
    return part ? sketchOf(part) : '';
  };

  onMount(() => {
    let disposed = false;
    void import('./editor').then(({ createCodeEditor }) => {
      if (disposed) return;
      editor = createCodeEditor(host, {
        text: code(),
        dark: resolvedTheme() === 'dark',
        readOnly: simActive(),
        onChange: (text) =>
          commit(setPartProp(doc(), props.partId, 'code', text), `code:${props.partId}`),
      });
      props.onReady(editor);
    });
    onCleanup(() => {
      disposed = true;
      editor?.destroy();
    });
  });

  // Undo, redo and project changes arrive through the document.
  createEffect(() => editor?.setText(code()));
  createEffect(() => editor?.setDark(resolvedTheme() === 'dark'));
  createEffect(() => editor?.setReadOnly(simActive()));

  return <div ref={host} class="code-editor" />;
}

export function CodePanel() {
  const [tab, setTab] = createSignal<Tab>('code');
  const [editor, setEditor] = createSignal<CodeEditor | undefined>();
  const board = activeBoard;
  const report = () => {
    const current = board();
    return current ? buildReport(current.id) : undefined;
  };
  const diagnostics = () => {
    const current = report();
    return current?.status === 'done' ? current.result.diagnostics : [];
  };

  createEffect(() => editor()?.setDiagnostics(diagnostics()));

  return (
    <aside class="code-panel" aria-label={t('code.title')}>
      <header class="code-header">
        <div class="tabs" role="tablist">
          <button
            type="button"
            role="tab"
            class="tab"
            aria-selected={tab() === 'code'}
            onClick={() => setTab('code')}
          >
            {t('code.tab.editor')}
          </button>
          <button
            type="button"
            role="tab"
            class="tab"
            aria-selected={tab() === 'serial'}
            onClick={() => setTab('serial')}
          >
            {t('code.tab.serial')}
          </button>
          <button
            type="button"
            role="tab"
            class="tab"
            aria-selected={tab() === 'plotter'}
            onClick={() => setTab('plotter')}
          >
            {t('code.tab.plotter')}
          </button>
        </div>
        <Show when={boards().length > 1}>
          <select
            class="select"
            aria-label={t('code.board')}
            onChange={(event) => setActiveBoardId(event.currentTarget.value)}
          >
            <For each={boards()}>
              {(part) => (
                <option value={part.id} selected={part.id === board()?.id}>
                  {part.label}
                </option>
              )}
            </For>
          </select>
        </Show>
        <button
          type="button"
          class="icon-button"
          aria-label={t('code.close')}
          title={t('code.close')}
          onClick={() => setCodePanelOpen(false)}
        >
          <Icon name="close" />
        </button>
      </header>

      <Show when={board()} keyed fallback={<p class="panel-hint code-empty">{t('code.noBoard')}</p>}>
        {(current) => (
          <>
            <div class="code-body" hidden={tab() !== 'code'}>
              <Show when={simActive()}>
                <p class="code-note">{t('code.readOnly')}</p>
              </Show>
              <SketchEditor partId={current.id} onReady={setEditor} />
              <footer class="code-footer">
                <div class="code-actions">
                  <button
                    type="button"
                    class="button"
                    disabled={report()?.status === 'compiling'}
                    onClick={() => void buildBoard(current)}
                  >
                    {t('code.verify')}
                  </button>
                  <span class="code-status" role="status">
                    <Switch>
                      <Match when={report()?.status === 'compiling'}>{t('code.compiling')}</Match>
                      <Match when={report()?.status === 'unavailable'}>
                        {t(__SINGLE_FILE__ ? 'code.singleFile' : 'code.toolchainError')}
                      </Match>
                      <Match when={report()} keyed>
                        {(done) =>
                          done.status === 'done' && done.result.ok
                            ? t('code.ok', {
                                used: done.result.flashBytes,
                                max: done.result.maxFlash,
                                percent: Math.round(
                                  (100 * done.result.flashBytes) / done.result.maxFlash,
                                ),
                              })
                            : t('code.failed')
                        }
                      </Match>
                    </Switch>
                  </span>
                </div>
                <Show when={diagnostics().length > 0}>
                  <ul class="diagnostics">
                    <For each={diagnostics()}>
                      {(diagnostic) => (
                        <li data-severity={diagnostic.severity}>
                          <button
                            type="button"
                            disabled={diagnostic.line === 0}
                            onClick={() => editor()?.goToLine(diagnostic.line)}
                          >
                            {diagnostic.line > 0
                              ? t('code.line', { line: diagnostic.line, message: diagnostic.message })
                              : diagnostic.message}
                          </button>
                        </li>
                      )}
                    </For>
                  </ul>
                </Show>
              </footer>
            </div>
            <Show when={tab() === 'serial'}>
              <SerialMonitor partId={current.id} />
            </Show>
            <Show when={tab() === 'plotter'}>
              <SerialPlotter partId={current.id} />
            </Show>
          </>
        )}
      </Show>
    </aside>
  );
}
