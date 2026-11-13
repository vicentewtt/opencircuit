import { Show } from 'solid-js';
import { CodePanel } from '../../arduino/CodePanel';
import { codePanelOpen } from '../../arduino/state';
import { getPartDef } from '../../catalog/registry';
import { LadderPanel } from '../../plc/LadderPanel';
import { ladderPanelOpen } from '../../plc/state';
import { t, tr } from '../../i18n';
import { InstrumentDock } from '../../instruments/InstrumentDock';
import { dockOpen } from '../../instruments/state';
import { simActive } from '../../sim/simulation';
import { cancelModes, doc, isModal, placing } from '../store';
import { Canvas } from './Canvas';
import { FaultList } from './FaultList';
import { Palette } from './Palette';
import { PropertiesPanel } from './PropertiesPanel';
import { Toolbar } from './Toolbar';

export function EditorView() {
  const hint = (): string => {
    const def = getPartDef(placing() ?? '');
    return def ? t('hint.place', { name: tr(def.name) }) : t('hint.wire');
  };

  return (
    <div class="editor" classList={{ simulating: simActive(), 'with-code': codePanelOpen() || ladderPanelOpen() }}>
      <Palette />
      <main class="canvas-area">
        <div class="canvas-stage">
        <Canvas />
        <Toolbar />
        <Show when={doc().parts.length === 0 && !isModal()}>
          <p class="canvas-empty">{t('canvas.empty')}</p>
        </Show>
        <FaultList />
        <Show when={isModal()}>
          <div class="hint" role="status">
            <span>{hint()}</span>
            <button type="button" class="button" onClick={cancelModes}>
              {t('hint.cancel')}
            </button>
          </div>
        </Show>
        </div>
        <Show when={dockOpen()}>
          <InstrumentDock />
        </Show>
      </main>
      <Show
        when={ladderPanelOpen()}
        fallback={
          <Show when={codePanelOpen()} fallback={<PropertiesPanel />}>
            <CodePanel />
          </Show>
        }
      >
        <LadderPanel />
      </Show>
    </div>
  );
}
