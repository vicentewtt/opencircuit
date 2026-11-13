import { createEffect, on, onCleanup, onMount } from 'solid-js';
import { getPartDef } from '../catalog/registry';
import { doc } from '../editor/store';
import { t, tr } from '../i18n';
import { burned } from '../sim/simulation';
import { announce, announcement } from './announce';
import { Tour } from './Tour';
import { openTourOnFirstVisit } from './tour';
import { handleEditorKeydown } from '../editor/shortcuts';
import { EditorView } from '../editor/ui/EditorView';
import { initProjects } from '../project/projects';
import { MenuDialog } from './MenuDialog';
import { Toasts } from './Toasts';
import { TopBar } from './TopBar';

export function App() {
  onMount(() => {
    void initProjects().then(() => setTimeout(openTourOnFirstVisit, 400));
    window.addEventListener('keydown', handleEditorKeydown);
  });
  onCleanup(() => window.removeEventListener('keydown', handleEditorKeydown));

  // Tell screen readers when a part burns: it is only visible as smoke on the canvas.
  createEffect(
    on(burned, (now, before) => {
      const known = new Set((before ?? []).map((info) => info.partId));
      for (const info of now) {
        if (known.has(info.partId)) continue;
        const part = doc().parts.find((candidate) => candidate.id === info.partId);
        const def = part ? getPartDef(part.type) : undefined;
        if (part && def) announce(t('a11y.burned', { label: part.label, name: tr(def.name) }));
      }
    }),
  );

  return (
    <div class="app-shell">
      <TopBar />
      <EditorView />
      <MenuDialog />
      <Toasts />
      <Tour />
      <div class="sr-only" aria-live="polite" aria-atomic="true">
        {announcement()}
      </div>
    </div>
  );
}
