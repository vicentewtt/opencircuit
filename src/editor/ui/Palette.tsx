import { For, Show, createMemo, createSignal } from 'solid-js';
import { CATEGORIES } from '../../catalog/categories';
import { PART_DEFS, defaultProps } from '../../catalog/registry';
import type { PartDef } from '../../catalog/types';
import { t, tr } from '../../i18n';
import { editLocked, placing, togglePlacing } from '../store';

const normalize = (text: string): string =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function matches(def: PartDef, query: string): boolean {
  if (!query) return true;
  return [def.name.es, def.name.en, ...def.keywords].some((term) =>
    normalize(term).includes(query),
  );
}

function PaletteItem(props: { def: PartDef }) {
  const b = props.def.bounds;
  const viewBox = `${b.x - 4} ${b.y - 4} ${b.width + 8} ${b.height + 8}`;
  let pressedWithMouse = false;

  return (
    <button
      type="button"
      class="palette-item"
      aria-pressed={placing() === props.def.type}
      disabled={editLocked()}
      title={tr(props.def.name)}
      onPointerDown={(event) => {
        // Mouse: act on press so the part can be dragged straight onto the canvas.
        pressedWithMouse = event.pointerType === 'mouse' && event.button === 0;
        if (pressedWithMouse) togglePlacing(props.def.type);
      }}
      onClick={(event) => {
        // Touch and keyboard act on click; mouse already acted on press.
        if (event.detail !== 0 && pressedWithMouse) return;
        togglePlacing(props.def.type);
      }}
    >
      <svg
        class="palette-preview"
        viewBox={viewBox}
        aria-hidden="true"
        innerHTML={props.def.footprint(defaultProps(props.def))}
      />
      <span class="palette-name">{tr(props.def.name)}</span>
    </button>
  );
}

export function Palette() {
  const [query, setQuery] = createSignal('');

  const groups = createMemo(() => {
    const q = normalize(query().trim());
    return CATEGORIES.map((category) => ({
      category,
      defs: PART_DEFS.filter((def) => def.category === category.id && matches(def, q)),
    })).filter((group) => group.defs.length > 0);
  });

  return (
    <aside class="palette" data-tour="palette" aria-label={t('palette.title')}>
      <input
        class="palette-search"
        type="search"
        placeholder={t('palette.search')}
        aria-label={t('palette.search')}
        value={query()}
        onInput={(event) => setQuery(event.currentTarget.value)}
      />
      <Show when={editLocked()}>
        <p class="panel-hint">{t('sim.locked')}</p>
      </Show>
      <div class="palette-groups">
        <For each={groups()}>
          {(group) => (
            <section class="palette-group">
              <h3 class="eyebrow">{tr(group.category.name)}</h3>
              <div class="palette-items">
                <For each={group.defs}>{(def) => <PaletteItem def={def} />}</For>
              </div>
            </section>
          )}
        </For>
        <Show when={groups().length === 0}>
          <p class="panel-hint">{t('palette.empty')}</p>
        </Show>
      </div>
    </aside>
  );
}
