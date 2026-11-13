import { batch, createSignal } from 'solid-js';
import { routeWires } from './model/route';
import { moveParts as moveDocParts } from './model/ops';
import { snapPoint } from './model/geometry';
import { getPartDef } from '../catalog/registry';
import type { Bounds } from '../catalog/types';
import {
  GRID,
  boundsIntersect,
  docBounds,
  partBounds,
  pinWorld,
  pointInBounds,
} from './model/geometry';
import {
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
} from './model/history';
import {
  addPart,
  addWire,
  copyItems,
  deleteItems,
  flipParts,
  pasteClip,
  rotateParts,
  setWiresColor,
  type Clip,
} from './model/ops';
import {
  DEFAULT_WIRE_COLOR,
  EMPTY_DOC,
  type CircuitDoc,
  type Part,
  type PinRef,
  type Point,
  type Wire,
} from './model/types';

/** Editor state shared by the canvas, toolbar, panels and shortcuts. */

export interface Viewport {
  /** Screen position of the world origin. */
  x: number;
  y: number;
  zoom: number;
}

export interface WireDraft {
  from: PinRef;
  points: Point[];
}

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 8;
const PASTE_OFFSET = GRID * 2;
const EMPTY_SELECTION: ReadonlySet<string> = new Set();

// ---------- Document and history ----------

const [history, setHistory] = createSignal(createHistory<CircuitDoc>(EMPTY_DOC));

export const doc = (): CircuitDoc => history().present;
export const canUndo = (): boolean => history().past.length > 0;
export const canRedo = (): boolean => history().future.length > 0;

let coalesceKey: string | null = null;

/**
 * Records an edit as one undo step. Consecutive commits with the same key
 * (e.g. dragging a slider) are merged into a single step.
 */
export function commit(next: CircuitDoc, key: string | null = null): void {
  const merge = key !== null && key === coalesceKey;
  setHistory((current) =>
    merge && current.past.length > 0
      ? { ...current, present: next, future: [] }
      : pushHistory(current, next),
  );
  coalesceKey = key;
}

// ---------- Edit lock (simulation running) ----------

const [editLocked, setEditLockedSignal] = createSignal(false);
export { editLocked };

/** While locked, the circuit structure cannot change; property edits still can. */
export function setEditLocked(locked: boolean): void {
  batch(() => {
    if (locked) {
      setPlacingSignal(null);
      setWireDraft(null);
    }
    setEditLockedSignal(locked);
  });
}

// ---------- Selection ----------

const [selection, setSelectionSignal] = createSignal<ReadonlySet<string>>(EMPTY_SELECTION);
export { selection };

export function setSelection(ids: Iterable<string>): void {
  setSelectionSignal(new Set(ids));
}

export function clearSelection(): void {
  if (selection().size > 0) setSelectionSignal(EMPTY_SELECTION);
}

export function toggleSelected(id: string): void {
  const next = new Set(selection());
  if (!next.delete(id)) next.add(id);
  setSelectionSignal(next);
}

export const selectedParts = (): Part[] => doc().parts.filter((part) => selection().has(part.id));
export const selectedWires = (): Wire[] => doc().wires.filter((wire) => selection().has(wire.id));

function selectedPartIds(): Set<string> {
  return new Set(selectedParts().map((part) => part.id));
}

function pruneSelection(): void {
  const current = doc();
  const alive = new Set([...current.parts, ...current.wires].map((item) => item.id));
  setSelectionSignal(new Set([...selection()].filter((id) => alive.has(id))));
}

export function selectAll(): void {
  const current = doc();
  setSelection([...current.parts, ...current.wires].map((item) => item.id));
}

// ---------- Modes and transient interaction state ----------

/** How the circuit is drawn: as the real parts or as a schematic diagram. */
export type ViewMode = 'board' | 'schematic';
const [viewMode, setViewMode] = createSignal<ViewMode>('board');
export { viewMode };

export function toggleViewMode(): void {
  setViewMode((mode) => (mode === 'board' ? 'schematic' : 'board'));
}

/**
 * Wires drawn behind the parts and faded, so a busy circuit stays readable.
 * Remembered per browser; it is only a viewing preference.
 */
const WIRES_BEHIND_KEY = 'oc.wiresBehind';
function readWiresBehind(): boolean {
  try {
    return localStorage.getItem(WIRES_BEHIND_KEY) === '1';
  } catch {
    return false;
  }
}
const [wiresBehind, setWiresBehind] = createSignal(readWiresBehind());
export { wiresBehind };

export function toggleWiresBehind(): void {
  const next = !wiresBehind();
  setWiresBehind(next);
  try {
    localStorage.setItem(WIRES_BEHIND_KEY, next ? '1' : '0');
  } catch {
    // Not remembered, still applied.
  }
}

const [placing, setPlacingSignal] = createSignal<string | null>(null);
const [wireDraft, setWireDraft] = createSignal<WireDraft | null>(null);
const [wireColor, setWireColorSignal] = createSignal(DEFAULT_WIRE_COLOR);
const [pointerWorld, setPointerWorld] = createSignal<Point | null>(null);
const [dragDelta, setDragDelta] = createSignal<Point | null>(null);
const [handleDrag, setHandleDrag] = createSignal<{
  wireId: string;
  index: number;
  pos: Point;
} | null>(null);
const [marquee, setMarquee] = createSignal<{ a: Point; b: Point } | null>(null);

export {
  placing,
  wireDraft,
  wireColor,
  pointerWorld,
  setPointerWorld,
  dragDelta,
  setDragDelta,
  handleDrag,
  setHandleDrag,
  marquee,
  setMarquee,
};

/** Starts (or, for the same type, stops) placing a component. */
export function togglePlacing(type: string): void {
  if (editLocked()) return;
  batch(() => {
    setWireDraft(null);
    setPlacingSignal(placing() === type ? null : type);
  });
}

export function cancelModes(): void {
  batch(() => {
    setPlacingSignal(null);
    setWireDraft(null);
  });
}

export const isModal = (): boolean => placing() !== null || wireDraft() !== null;

// ---------- Viewport ----------

const [viewport, setViewport] = createSignal<Viewport>({ x: 0, y: 0, zoom: 1 });
const [canvasSize, setCanvasSizeSignal] = createSignal({ width: 0, height: 0 });
export { viewport, setViewport, canvasSize };

let pendingFit = false;

const clampZoom = (zoom: number): number => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Zooms keeping the given screen point (canvas coordinates) fixed. */
export function zoomAt(screenX: number, screenY: number, factor: number): void {
  setViewport((v) => {
    const zoom = clampZoom(v.zoom * factor);
    const k = zoom / v.zoom;
    return { zoom, x: screenX - (screenX - v.x) * k, y: screenY - (screenY - v.y) * k };
  });
}

export function zoomBy(factor: number): void {
  const size = canvasSize();
  zoomAt(size.width / 2, size.height / 2, factor);
}

/** Centers the circuit in the canvas (deferred until the canvas has a size). */
export function fitView(): void {
  const { width, height } = canvasSize();
  if (width === 0 || height === 0) {
    pendingFit = true;
    return;
  }
  pendingFit = false;
  const bounds = docBounds(doc());
  if (!bounds) {
    setViewport({ x: width / 2, y: height / 2, zoom: 1 });
    return;
  }
  const margin = 60;
  const zoom = Math.min(
    1.5,
    clampZoom(
      Math.min(
        (width - margin * 2) / Math.max(bounds.width, 1),
        (height - margin * 2) / Math.max(bounds.height, 1),
      ),
    ),
  );
  setViewport({
    zoom,
    x: width / 2 - (bounds.x + bounds.width / 2) * zoom,
    y: height / 2 - (bounds.y + bounds.height / 2) * zoom,
  });
}

export function setCanvasSize(width: number, height: number): void {
  setCanvasSizeSignal({ width, height });
  if (pendingFit) fitView();
}

// ---------- Loading ----------

/** Replaces the document (opening a project): history and selection start clean. */
/** Routes every wire (or only the selected ones) along clean right-angle paths. */
export function tidyWires(): void {
  if (editLocked()) return;
  const selected = new Set([...selection()].filter((id) => doc().wires.some((wire) => wire.id === id)));
  const next = routeWires(doc(), selected.size > 0 ? selected : undefined);
  if (next !== doc()) commit(next);
}

/** Center of the visible canvas, in world coordinates, on the grid. */
export function viewCenter(): Point {
  const { width, height } = canvasSize();
  const v = viewport();
  return snapPoint({ x: (width / 2 - v.x) / v.zoom, y: (height / 2 - v.y) / v.zoom });
}

/** Moves the selected parts by a grid distance. Returns false when no part is selected. */
export function nudgeSelection(dx: number, dy: number): boolean {
  const ids = selectedPartIds();
  if (ids.size === 0) return false;
  if (!editLocked()) commit(moveDocParts(doc(), ids, dx, dy), 'nudge');
  return true;
}

/** Scrolls the view by screen pixels. */
export function panBy(dx: number, dy: number): void {
  setViewport((v) => ({ ...v, x: v.x + dx, y: v.y + dy }));
}

/** Selects the next (or previous) part, in reading order, and returns it. */
export function selectNextPart(step: 1 | -1): Part | undefined {
  const parts = [...doc().parts].sort((a, b) => a.y - b.y || a.x - b.x);
  if (parts.length === 0) return undefined;
  const current = [...selection()].find((id) => parts.some((part) => part.id === id));
  const index = current === undefined ? (step > 0 ? -1 : 0) : parts.findIndex((part) => part.id === current);
  const next = parts[(index + step + parts.length) % parts.length];
  if (next) setSelection([next.id]);
  return next;
}

export function loadDoc(next: CircuitDoc): void {
  coalesceKey = null;
  batch(() => {
    setHistory(createHistory(next));
    setSelectionSignal(EMPTY_SELECTION);
    cancelModes();
    setDragDelta(null);
    setHandleDrag(null);
    setMarquee(null);
  });
  fitView();
}

// ---------- Actions ----------

export function undo(): void {
  if (editLocked()) return;
  batch(() => {
    cancelModes();
    coalesceKey = null;
    setHistory(undoHistory);
    pruneSelection();
  });
}

export function redo(): void {
  if (editLocked()) return;
  batch(() => {
    cancelModes();
    coalesceKey = null;
    setHistory(redoHistory);
    pruneSelection();
  });
}

export function placePart(at: Point): void {
  if (editLocked()) return;
  const type = placing();
  if (!type || !getPartDef(type)) return;
  const result = addPart(doc(), type, at);
  batch(() => {
    commit(result.doc);
    setPlacingSignal(null);
    setSelection([result.id]);
  });
}

export function startWire(from: PinRef): void {
  if (editLocked()) return;
  batch(() => {
    setPlacingSignal(null);
    setSelectionSignal(EMPTY_SELECTION);
    setWireDraft({ from, points: [] });
  });
}

export function addDraftPoint(point: Point): void {
  setWireDraft((draft) => (draft ? { ...draft, points: [...draft.points, point] } : draft));
}

/** Completes the wire being drawn. Ending on the starting pin is ignored. */
export function finishWire(to: PinRef): void {
  const draft = wireDraft();
  if (!draft) return;
  const result = addWire(doc(), draft.from, to, draft.points, wireColor());
  if (!result) return;
  batch(() => {
    commit(result.doc);
    setWireDraft(null);
    setSelection([result.id]);
  });
}

export function rotateSelection(): void {
  if (editLocked()) return;
  commit(rotateParts(doc(), selectedPartIds()));
}

export function flipSelection(): void {
  if (editLocked()) return;
  commit(flipParts(doc(), selectedPartIds()));
}

export function deleteSelection(): void {
  if (editLocked()) return;
  batch(() => {
    commit(deleteItems(doc(), selection()));
    setSelectionSignal(EMPTY_SELECTION);
  });
}

let clipboard: Clip | null = null;
let pasteCount = 0;

export function copySelection(): void {
  const clip = copyItems(doc(), selectedPartIds());
  if (clip.parts.length === 0) return;
  clipboard = clip;
  pasteCount = 0;
}

function insertClip(clip: Clip, offset: number): void {
  const result = pasteClip(doc(), clip, offset, offset);
  batch(() => {
    commit(result.doc);
    setSelection(result.ids);
  });
}

export function pasteClipboard(): void {
  if (editLocked()) return;
  if (!clipboard) return;
  pasteCount += 1;
  insertClip(clipboard, PASTE_OFFSET * pasteCount);
}

export function cutSelection(): void {
  if (editLocked()) return;
  copySelection();
  deleteSelection();
}

export function duplicateSelection(): void {
  if (editLocked()) return;
  const clip = copyItems(doc(), selectedPartIds());
  if (clip.parts.length > 0) insertClip(clip, PASTE_OFFSET);
}

/** Sets the color for new wires and recolors the selected ones. */
export function setWireColor(color: string): void {
  batch(() => {
    setWireColorSignal(color);
    const ids = new Set(selectedWires().map((wire) => wire.id));
    if (ids.size > 0) commit(setWiresColor(doc(), ids, color));
  });
}

// ---------- Display helpers (include in-progress drags) ----------

const ZERO: Point = { x: 0, y: 0 };

/** Offset to draw a part with while its selection is being dragged. */
export function partOffset(partId: string): Point {
  const delta = dragDelta();
  return delta && selection().has(partId) ? delta : ZERO;
}

/** Full polyline of a wire as currently displayed, or null if a pin is missing. */
export function wirePoints(wire: Wire): Point[] | null {
  const current = doc();
  const a = pinWorld(current, wire.from);
  const b = pinWorld(current, wire.to);
  if (!a || !b) return null;
  const offsetA = partOffset(wire.from.partId);
  const offsetB = partOffset(wire.to.partId);
  const shift = (p: Point, by: Point): Point => (by === ZERO ? p : { x: p.x + by.x, y: p.y + by.y });
  let middle = offsetA !== ZERO && offsetB !== ZERO ? wire.points.map((p) => shift(p, offsetA)) : wire.points;
  const drag = handleDrag();
  if (drag && drag.wireId === wire.id) {
    middle = middle.map((p, i) => (i === drag.index ? drag.pos : p));
  }
  return [shift(a, offsetA), ...middle, shift(b, offsetB)];
}

/** Selects everything touching the rectangle, optionally keeping the current selection. */
export function selectInRect(rect: Bounds, additive: boolean): void {
  const ids = new Set(additive ? selection() : []);
  const current = doc();
  for (const part of current.parts) {
    const def = getPartDef(part.type);
    if (def && boundsIntersect(partBounds(part, def), rect)) ids.add(part.id);
  }
  for (const wire of current.wires) {
    if (wirePoints(wire)?.some((point) => pointInBounds(point, rect))) ids.add(wire.id);
  }
  setSelectionSignal(ids);
}
