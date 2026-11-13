import { For, Show, createMemo, onCleanup, onMount } from 'solid-js';
import { defaultProps, getPartDef } from '../../catalog/registry';
import { symbolOf } from '../../catalog/symbols';
import type { ClickAction } from '../../catalog/model';
import { t, tr } from '../../i18n';
import {
  boundsFromPoints,
  localToWorld,
  nearestSegmentIndex,
  partBounds,
  partTransform,
  pinWorld,
  snapPoint,
  worldToLocal,
} from '../model/geometry';
import { burnedInfo, partVisual, setInput, warningInfo } from '../../sim/simulation';
import {
  insertWirePoint,
  moveParts,
  removeWirePoint,
  setPartProp,
  setWirePoint,
} from '../model/ops';
import type { Part, Point, Wire } from '../model/types';
import {
  MAX_ZOOM,
  MIN_ZOOM,
  addDraftPoint,
  cancelModes,
  clearSelection,
  commit,
  doc,
  dragDelta,
  editLocked,
  finishWire,
  handleDrag,
  isModal,
  marquee,
  partOffset,
  placePart,
  placing,
  pointerWorld,
  selectInRect,
  selectedParts,
  selectedWires,
  selection,
  setCanvasSize,
  setDragDelta,
  setHandleDrag,
  setMarquee,
  setPointerWorld,
  setSelection,
  setViewport,
  startWire,
  toggleSelected,
  viewport,
  wireColor,
  wireDraft,
  wirePoints,
  zoomAt,
  type Viewport,
  viewMode,
  wiresBehind,
} from '../store';

/** Screen pixels a pointer may travel and still count as a tap. */
const TAP_SLOP = 4;
const DOUBLE_TAP_MS = 350;

type Hit =
  | { kind: 'canvas' }
  | { kind: 'part'; id: string }
  | { kind: 'pin'; partId: string; pinId: string }
  | { kind: 'wire'; id: string }
  | { kind: 'handle'; id: string; index: number };

type Gesture =
  | { kind: 'pan'; startX: number; startY: number; origin: Viewport; moved: boolean }
  | {
      kind: 'move';
      startX: number;
      startY: number;
      startWorld: Point;
      moved: boolean;
      partId: string;
      /** Tapping an already-selected part of a group selects just that part. */
      collapseOnTap: boolean;
    }
  | { kind: 'handle'; startX: number; startY: number; wireId: string; index: number; moved: boolean }
  | { kind: 'wireTap'; wireId: string }
  | { kind: 'marquee'; start: Point }
  | { kind: 'pinDrag'; startX: number; startY: number; moved: boolean }
  | { kind: 'pinch'; distance: number; midX: number; midY: number; origin: Viewport }
  | { kind: 'press'; partId: string; input: string }
  | { kind: 'ignore' };

function hitFromTarget(target: EventTarget | null): Hit {
  const element = target instanceof Element ? target.closest<SVGElement>('[data-kind]') : null;
  const data = element?.dataset;
  switch (data?.kind) {
    case 'part':
      return { kind: 'part', id: data.id ?? '' };
    case 'pin':
      return { kind: 'pin', partId: data.part ?? '', pinId: data.pin ?? '' };
    case 'wire':
      return { kind: 'wire', id: data.id ?? '' };
    case 'handle':
      return { kind: 'handle', id: data.id ?? '', index: Number(data.index) };
    default:
      return { kind: 'canvas' };
  }
}

const toPath = (points: readonly Point[]): string =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join('');

function PartView(props: { part: Part }) {
  const def = getPartDef(props.part.type);
  if (!def) return null;
  const bounds = partBounds(props.part, def);
  const offset = (): string => {
    const o = partOffset(props.part.id);
    return `translate(${o.x} ${o.y})`;
  };
  // The markup only changes when the drawing does, so the DOM is not rebuilt every frame.
  const markup = createMemo(() =>
    viewMode() === 'schematic'
      ? symbolOf(def, props.part.props, tr(def.name).split(' · ')[0] ?? '')
      : def.footprint(props.part.props, partVisual(props.part.id)),
  );
  // A blown fuse did its job: it is not drawn as a burned part.
  const scorched = (): boolean => {
    const info = burnedInfo(props.part.id);
    return info !== undefined && info.cause !== 'fuse-blown';
  };
  return (
    <g data-kind="part" data-id={props.part.id} transform={offset()} class="part">
      <g transform={partTransform(props.part)}>
        <rect
          x={def.bounds.x}
          y={def.bounds.y}
          width={def.bounds.width}
          height={def.bounds.height}
          fill="transparent"
        />
        <g classList={{ scorched: scorched() }} innerHTML={markup()} />
      </g>
      <Show when={scorched()}>
        <g class="smoke" transform={`translate(${bounds.x + bounds.width / 2} ${bounds.y})`}>
          <circle r="4" />
          <circle r="5" />
          <circle r="3.5" />
        </g>
      </Show>
      <Show when={warningInfo(props.part.id)}>
        <g class="warn-badge" transform={`translate(${bounds.x + bounds.width} ${bounds.y})`}>
          <path d="M0 -9L8 5H-8z" />
          <path class="warn-mark" d="M0 -4V1M0 3.2V3.4" />
        </g>
      </Show>
      <Show when={selection().has(props.part.id)}>
        <rect
          class="selection-box"
          x={bounds.x - 4}
          y={bounds.y - 4}
          width={bounds.width + 8}
          height={bounds.height + 8}
          rx="3"
        />
      </Show>
      <text class="part-label" x={bounds.x + bounds.width / 2} y={bounds.y + bounds.height + 12}>
        {props.part.label}
      </text>
    </g>
  );
}

function WireView(props: { wire: Wire }) {
  const path = (): string => toPath(wirePoints(props.wire) ?? []);
  return (
    <g data-kind="wire" data-id={props.wire.id}>
      <path class="wire-hit" d={path()} />
      <Show when={selection().has(props.wire.id)}>
        <path class="wire-halo" d={path()} />
      </Show>
      <path class="wire-outline" d={path()} />
      <path class="wire" d={path()} stroke={props.wire.color} />
    </g>
  );
}

export function Canvas() {
  let svg!: SVGSVGElement;
  const pointers = new Map<number, Point>();
  let gesture: Gesture | null = null;
  let lastTap = { key: '', time: 0 };
  const pinRadius = window.matchMedia('(pointer: coarse)').matches ? 7 : 5;

  const localPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = svg.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const toWorld = (event: { clientX: number; clientY: number }): Point => {
    const p = localPoint(event);
    const v = viewport();
    return { x: (p.x - v.x) / v.zoom, y: (p.y - v.y) / v.zoom };
  };

  const isDoubleTap = (key: string): boolean => {
    const now = performance.now();
    const double = key === lastTap.key && now - lastTap.time < DOUBLE_TAP_MS;
    lastTap = double ? { key: '', time: 0 } : { key, time: now };
    return double;
  };

  const resetTransient = (): void => {
    setDragDelta(null);
    setHandleDrag(null);
    setMarquee(null);
  };

  const releasePress = (): void => {
    if (gesture?.kind === 'press') setInput(gesture.partId, gesture.input, 0);
  };

  /** While simulating, a press operates the part instead of editing the circuit. */
  const pressWhileLocked = (hit: Hit, startX: number, startY: number, world: Point): Gesture => {
    if (hit.kind === 'canvas') {
      return { kind: 'pan', startX, startY, origin: viewport(), moved: false };
    }
    if (hit.kind === 'wire') setSelection([hit.id]);
    if (hit.kind !== 'part') return { kind: 'ignore' };

    setSelection([hit.id]);
    const part = doc().parts.find((candidate) => candidate.id === hit.id);
    const interaction = part && getPartDef(part.type)?.interactive;
    if (!part || !interaction || burnedInfo(part.id)) return { kind: 'ignore' };
    let action: ClickAction | undefined;
    if (interaction.kind === 'zones') {
      // Parts with several controls: find the one under the pointer.
      const local = worldToLocal(part, world.x, world.y);
      action = interaction.zones.find(
        (zone) =>
          local.x >= zone.x &&
          local.x <= zone.x + zone.width &&
          local.y >= zone.y &&
          local.y <= zone.y + zone.height,
      )?.action;
    } else {
      action = interaction;
    }
    if (!action) return { kind: 'ignore' };
    if (action.kind === 'momentary') {
      setInput(part.id, action.input, 1);
      return { kind: 'press', partId: part.id, input: action.input };
    }
    const index = action.values.indexOf(String(part.props[action.prop]));
    const next = action.values[(index + 1) % action.values.length];
    if (next !== undefined) commit(setPartProp(doc(), part.id, action.prop, next));
    return { kind: 'ignore' };
  };

  const startPinch = (): void => {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return;
    releasePress();
    resetTransient();
    const rect = svg.getBoundingClientRect();
    gesture = {
      kind: 'pinch',
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      midX: (a.x + b.x) / 2 - rect.left,
      midY: (a.y + b.y) / 2 - rect.top,
      origin: viewport(),
    };
  };

  const updatePinch = (g: Extract<Gesture, { kind: 'pinch' }>): void => {
    const [a, b] = [...pointers.values()];
    if (!a || !b) return;
    const rect = svg.getBoundingClientRect();
    const midX = (a.x + b.x) / 2 - rect.left;
    const midY = (a.y + b.y) / 2 - rect.top;
    const scale = Math.hypot(a.x - b.x, a.y - b.y) / g.distance;
    const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, g.origin.zoom * scale));
    const worldX = (g.midX - g.origin.x) / g.origin.zoom;
    const worldY = (g.midY - g.origin.y) / g.origin.zoom;
    setViewport({ zoom, x: midX - worldX * zoom, y: midY - worldY * zoom });
  };

  const tapCanvas = (world: Point): void => {
    if (placing()) placePart(snapPoint(world));
    else if (wireDraft()) addDraftPoint(snapPoint(world));
    else clearSelection();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'mouse' && event.button === 2) {
      cancelModes();
      return;
    }
    if (event.pointerType === 'mouse' && event.button !== 0 && event.button !== 1) return;

    svg.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      startPinch();
      return;
    }
    if (pointers.size > 2) return;

    const startX = event.clientX;
    const startY = event.clientY;
    const world = toWorld(event);
    const rawHit = hitFromTarget(event.target);
    // While placing, everything is canvas; while wiring, only pins are special.
    const hit: Hit =
      event.button === 1 || placing() || (wireDraft() && rawHit.kind !== 'pin')
        ? { kind: 'canvas' }
        : rawHit;

    if (editLocked()) {
      gesture = pressWhileLocked(hit, startX, startY, world);
      return;
    }

    switch (hit.kind) {
      case 'pin':
        if (wireDraft()) {
          finishWire(hit);
          gesture = { kind: 'ignore' };
        } else {
          startWire(hit);
          gesture = { kind: 'pinDrag', startX, startY, moved: false };
        }
        break;
      case 'part': {
        const wasSelected = selection().has(hit.id);
        if (event.shiftKey) toggleSelected(hit.id);
        else if (!wasSelected) setSelection([hit.id]);
        gesture = {
          kind: 'move',
          startX,
          startY,
          startWorld: world,
          moved: false,
          partId: hit.id,
          collapseOnTap: wasSelected && !event.shiftKey,
        };
        break;
      }
      case 'wire':
        if (event.shiftKey) toggleSelected(hit.id);
        else setSelection([hit.id]);
        gesture = { kind: 'wireTap', wireId: hit.id };
        break;
      case 'handle':
        gesture = { kind: 'handle', startX, startY, wireId: hit.id, index: hit.index, moved: false };
        break;
      case 'canvas':
        gesture =
          event.shiftKey && !isModal() && event.button === 0
            ? { kind: 'marquee', start: world }
            : { kind: 'pan', startX, startY, origin: viewport(), moved: false };
        break;
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    const tracked = pointers.has(event.pointerId);
    if (tracked) pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const world = toWorld(event);
    if (event.pointerType !== 'touch' || tracked) setPointerWorld(world);

    const g = gesture;
    if (!g || !tracked) return;
    if (g.kind === 'pinch') {
      updatePinch(g);
      return;
    }
    if (g.kind === 'ignore' || g.kind === 'wireTap' || g.kind === 'press') return;
    if (g.kind === 'marquee') {
      setMarquee({ a: g.start, b: world });
      return;
    }

    const dx = event.clientX - g.startX;
    const dy = event.clientY - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < TAP_SLOP) return;
    g.moved = true;

    switch (g.kind) {
      case 'pan':
        setViewport({ ...g.origin, x: g.origin.x + dx, y: g.origin.y + dy });
        break;
      case 'move':
        setDragDelta(snapPoint({ x: world.x - g.startWorld.x, y: world.y - g.startWorld.y }));
        break;
      case 'handle':
        setHandleDrag({ wireId: g.wireId, index: g.index, pos: snapPoint(world) });
        break;
      case 'pinDrag':
        break;
    }
  };

  const onPointerUp = (event: PointerEvent): void => {
    const tracked = pointers.delete(event.pointerId);
    if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId);
    if (event.pointerType === 'touch') setPointerWorld(null);

    const g = gesture;
    if (g?.kind === 'pinch') {
      // The finger that stays down after a pinch must not act as a tap or drag.
      gesture = pointers.size === 0 ? null : { kind: 'ignore' };
      return;
    }
    if (pointers.size > 0) return;
    gesture = null;

    const world = toWorld(event);
    if (!g) {
      // Mouse button released over the canvas after pressing on a palette item.
      if (!tracked && placing() && event.button === 0) placePart(snapPoint(world));
      return;
    }

    switch (g.kind) {
      case 'pan':
        if (!g.moved) tapCanvas(world);
        break;
      case 'move': {
        const delta = dragDelta();
        setDragDelta(null);
        if (g.moved && delta && (delta.x !== 0 || delta.y !== 0)) {
          const ids = new Set(selectedParts().map((part) => part.id));
          commit(moveParts(doc(), ids, delta.x, delta.y));
        } else if (!g.moved && g.collapseOnTap) {
          setSelection([g.partId]);
        }
        break;
      }
      case 'handle': {
        const drag = handleDrag();
        setHandleDrag(null);
        if (g.moved && drag) {
          commit(setWirePoint(doc(), g.wireId, g.index, drag.pos));
        } else if (!g.moved && isDoubleTap(`handle:${g.wireId}:${g.index}`)) {
          commit(removeWirePoint(doc(), g.wireId, g.index));
        }
        break;
      }
      case 'wireTap': {
        if (!isDoubleTap(`wire:${g.wireId}`)) break;
        const wire = doc().wires.find((candidate) => candidate.id === g.wireId);
        const points = wire && wirePoints(wire);
        if (wire && points) {
          commit(
            insertWirePoint(doc(), wire.id, nearestSegmentIndex(points, world), snapPoint(world)),
          );
        }
        break;
      }
      case 'marquee': {
        const rect = marquee();
        setMarquee(null);
        if (rect) selectInRect(boundsFromPoints(rect.a, rect.b), true);
        break;
      }
      case 'pinDrag':
        if (g.moved) {
          // Dragged from a pin: connect if released over another pin.
          const hit = hitFromTarget(document.elementFromPoint(event.clientX, event.clientY));
          if (hit.kind === 'pin') finishWire(hit);
        }
        break;
      case 'press':
        setInput(g.partId, g.input, 0);
        break;
      case 'ignore':
        break;
    }
  };

  const onPointerCancel = (event: PointerEvent): void => {
    pointers.delete(event.pointerId);
    releasePress();
    resetTransient();
    gesture = pointers.size === 0 ? null : { kind: 'ignore' };
  };

  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const pixels = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    const p = localPoint(event);
    // ctrlKey is set for trackpad pinch gestures, which report small deltas.
    zoomAt(p.x, p.y, Math.exp(-pixels * (event.ctrlKey ? 0.01 : 0.0015)));
  };

  onMount(() => {
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect) setCanvasSize(rect.width, rect.height);
    });
    observer.observe(svg);
    onCleanup(() => observer.disconnect());
  });

  const isBase = (part: Part): boolean => getPartDef(part.type)?.layer === 'base';
  const baseParts = createMemo(() => doc().parts.filter(isBase));
  const topParts = createMemo(() => doc().parts.filter((part) => !isBase(part)));

  /** Points where pins of different parts touch (and are therefore connected). */
  const junctions = createMemo(() => {
    const count = new Map<string, number>();
    const points: Point[] = [];
    for (const part of doc().parts) {
      for (const pin of getPartDef(part.type)?.pins ?? []) {
        const at = localToWorld(part, pin.x, pin.y);
        const key = `${at.x},${at.y}`;
        const seen = (count.get(key) ?? 0) + 1;
        count.set(key, seen);
        if (seen === 2) points.push(at);
      }
    }
    return points;
  });

  const worldTransform = (): string => {
    const v = viewport();
    return `translate(${v.x} ${v.y}) scale(${v.zoom})`;
  };

  const draftPath = (): string => {
    const draft = wireDraft();
    const start = draft && pinWorld(doc(), draft.from);
    if (!draft || !start) return '';
    const cursor = pointerWorld();
    return toPath([start, ...draft.points, ...(cursor ? [snapPoint(cursor)] : [])]);
  };

  const ghost = (): { markup: string; transform: string } | null => {
    const def = getPartDef(placing() ?? '');
    const cursor = pointerWorld();
    if (!def || !cursor) return null;
    const at = snapPoint(cursor);
    return { markup: def.footprint(defaultProps(def)), transform: `translate(${at.x} ${at.y})` };
  };

  const marqueeBounds = () => {
    const rect = marquee();
    return rect ? boundsFromPoints(rect.a, rect.b) : null;
  };

  return (
    <svg
      ref={svg}
      data-tour="canvas"
      role="application"
      tabindex="0"
      aria-label={t('a11y.canvas')}
      class="canvas"
      classList={{
        wiring: wireDraft() !== null,
        placing: placing() !== null,
        schematic: viewMode() === 'schematic',
        'wires-behind': wiresBehind(),
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => setPointerWorld(null)}
      onWheel={onWheel}
      onContextMenu={(event) => event.preventDefault()}
    >
      <defs>
        <pattern
          id="oc-grid"
          width="50"
          height="50"
          patternUnits="userSpaceOnUse"
          patternTransform={worldTransform()}
        >
          <Show when={viewport().zoom >= 0.6}>
            <path
              class="grid-minor"
              d="M10 0V50M20 0V50M30 0V50M40 0V50M0 10H50M0 20H50M0 30H50M0 40H50"
            />
          </Show>
          <path class="grid-major" d="M0 0V50M0 0H50" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#oc-grid)" />

      <g transform={worldTransform()}>
        <For each={baseParts()}>{(part) => <PartView part={part} />}</For>
        {/* Wires go over breadboards always; over the other parts unless sent behind. */}
        <Show when={wiresBehind()}>
          <For each={doc().wires}>{(wire) => <WireView wire={wire} />}</For>
        </Show>
        <For each={topParts()}>{(part) => <PartView part={part} />}</For>
        <For each={junctions()}>
          {(point) => <circle class="junction" cx={point.x} cy={point.y} r="2.6" />}
        </For>
        <Show when={!wiresBehind()}>
          <For each={doc().wires}>{(wire) => <WireView wire={wire} />}</For>
        </Show>

        <Show when={!placing() && !editLocked()}>
          <For each={doc().parts}>
            {(part) => (
              <g transform={`translate(${partOffset(part.id).x} ${partOffset(part.id).y})`}>
                <For each={getPartDef(part.type)?.pins ?? []}>
                  {(pin) => {
                    const at = localToWorld(part, pin.x, pin.y);
                    return (
                      <circle
                        class="pin"
                        data-kind="pin"
                        data-part={part.id}
                        data-pin={pin.id}
                        cx={at.x}
                        cy={at.y}
                        r={pinRadius}
                      >
                        <title>{`${part.label} · ${tr(pin.name)}`}</title>
                      </circle>
                    );
                  }}
                </For>
              </g>
            )}
          </For>
        </Show>

        <Show when={wireDraft()}>
          <path class="wire-draft" d={draftPath()} stroke={wireColor()} />
        </Show>

        <For each={selectedWires()}>
          {(wire) => (
            <For each={wire.points}>
              {(_, index) => {
                const at = (): Point => wirePoints(wire)?.[index() + 1] ?? { x: 0, y: 0 };
                return (
                  <circle
                    class="wire-handle"
                    data-kind="handle"
                    data-id={wire.id}
                    data-index={index()}
                    cx={at().x}
                    cy={at().y}
                    r={pinRadius}
                  />
                );
              }}
            </For>
          )}
        </For>

        <Show when={marqueeBounds()}>
          {(bounds) => (
            <rect
              class="marquee"
              x={bounds().x}
              y={bounds().y}
              width={bounds().width}
              height={bounds().height}
            />
          )}
        </Show>

        <Show when={ghost()}>
          {(preview) => (
            <g class="ghost" transform={preview().transform} innerHTML={preview().markup} />
          )}
        </Show>
      </g>
    </svg>
  );
}
