import { announce } from '../app/announce';
import { getPartDef } from '../catalog/registry';
import { t, tr } from '../i18n';
import { GRID } from './model/geometry';
import {
  cancelModes,
  clearSelection,
  copySelection,
  cutSelection,
  deleteSelection,
  duplicateSelection,
  flipSelection,
  doc,
  fitView,
  isModal,
  nudgeSelection,
  panBy,
  placePart,
  placing,
  selectNextPart,
  viewCenter,
  zoomBy,
  pasteClipboard,
  redo,
  rotateSelection,
  selectAll,
  undo,
} from './store';

/** Keyboard shortcuts of the editor. Ignored while typing or with a dialog open. */
export function handleEditorKeydown(event: KeyboardEvent): void {
  const target = event.target;
  if (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
  ) {
    return;
  }
  if (document.querySelector('dialog[open]')) return;

  const mod = event.ctrlKey || event.metaKey;
  const key = event.key.toLowerCase();
  let handled = true;

  if (mod) {
    if (key === 'z') (event.shiftKey ? redo : undo)();
    else if (key === 'y') redo();
    else if (key === 'c') copySelection();
    else if (key === 'x') cutSelection();
    else if (key === 'v') pasteClipboard();
    else if (key === 'd') duplicateSelection();
    else if (key === 'a') selectAll();
    else handled = false;
  } else if (key === 'enter' && placing()) {
    const type = placing();
    const before = doc().parts.length;
    placePart(viewCenter());
    const part = doc().parts[before];
    const def = type ? getPartDef(type) : undefined;
    if (part && def) announce(t('a11y.placed', { label: part.label, name: tr(def.name) }));
  } else if (key === 'arrowup' || key === 'arrowdown' || key === 'arrowleft' || key === 'arrowright') {
    const dx = key === 'arrowleft' ? -1 : key === 'arrowright' ? 1 : 0;
    const dy = key === 'arrowup' ? -1 : key === 'arrowdown' ? 1 : 0;
    const distance = event.shiftKey ? 5 : 1;
    // Moves the selection; with nothing selected, scrolls the view.
    if (!nudgeSelection(dx * GRID * distance, dy * GRID * distance)) panBy(-dx * 40 * distance, -dy * 40 * distance);
  } else if (key === 'n') {
    const part = selectNextPart(event.shiftKey ? -1 : 1);
    const def = part ? getPartDef(part.type) : undefined;
    if (part && def) announce(t('a11y.selected', { label: part.label, name: tr(def.name) }));
  } else if (key === '+' || key === '=') zoomBy(1.25);
  else if (key === '-') zoomBy(1 / 1.25);
  else if (key === '0') fitView();
  else if (key === 'delete' || key === 'backspace') deleteSelection();
  else if (key === 'escape') (isModal() ? cancelModes : clearSelection)();
  else if (key === 'r') rotateSelection();
  else if (key === 'f' || key === 'm') flipSelection();
  else handled = false;

  if (handled) event.preventDefault();
}
