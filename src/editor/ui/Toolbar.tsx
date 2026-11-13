import { For, Show, createSignal } from 'solid-js';
import { Icon, type IconName } from '../../app/Icon';
import { locale, t, type MessageKey } from '../../i18n';
import { formatNumber, formatSi } from '../../lib/si';
import {
  SIM_SPEEDS,
  setSimSpeed,
  simActive,
  simSpeed,
  simStatus,
  simTime,
  stepSim,
  togglePause,
} from '../../sim/simulation';
import {
  canRedo,
  canUndo,
  deleteSelection,
  duplicateSelection,
  fitView,
  flipSelection,
  redo,
  rotateSelection,
  selectedParts,
  selection,
  setWireColor,
  editLocked,
  tidyWires,
  toggleViewMode,
  toggleWiresBehind,
  undo,
  viewMode,
  viewport,
  wiresBehind,
  wireColor,
  zoomBy,
} from '../store';
import { ColorSwatches } from './ColorSwatches';

function ToolButton(props: {
  icon: IconName;
  label: MessageKey;
  shortcut?: string;
  disabled?: boolean;
  class?: string;
  onClick: () => void;
}) {
  const title = (): string =>
    props.shortcut ? `${t(props.label)} (${props.shortcut})` : t(props.label);
  return (
    <button
      type="button"
      class={`icon-button ${props.class ?? ''}`}
      aria-label={t(props.label)}
      title={title()}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <Icon name={props.icon} />
    </button>
  );
}

function EditTools() {
  const [colorsOpen, setColorsOpen] = createSignal(false);
  const noParts = (): boolean => selectedParts().length === 0;
  return (
    <>
      <ToolButton icon="undo" label="tool.undo" shortcut="Ctrl+Z" disabled={!canUndo()} onClick={undo} />
      <ToolButton icon="redo" label="tool.redo" shortcut="Ctrl+Y" disabled={!canRedo()} onClick={redo} />
      <span class="toolbar-separator" />
      <ToolButton icon="rotate" label="tool.rotate" shortcut="R" disabled={noParts()} onClick={rotateSelection} />
      <ToolButton icon="flip" label="tool.flip" shortcut="F" disabled={noParts()} onClick={flipSelection} />
      <ToolButton icon="duplicate" label="tool.duplicate" shortcut="Ctrl+D" disabled={noParts()} onClick={duplicateSelection} />
      <ToolButton icon="trash" label="tool.delete" shortcut="Del" disabled={selection().size === 0} onClick={deleteSelection} />
      <span class="toolbar-separator" />
      <div class="toolbar-popover-anchor">
        <button
          type="button"
          class="icon-button"
          aria-label={t('tool.wireColor')}
          title={t('tool.wireColor')}
          aria-expanded={colorsOpen()}
          onClick={() => setColorsOpen((open) => !open)}
        >
          <span class="swatch-dot" style={{ background: wireColor() }} />
        </button>
        <Show when={colorsOpen()}>
          <div class="toolbar-popover">
            <ColorSwatches
              value={wireColor()}
              onPick={(color) => {
                setWireColor(color);
                setColorsOpen(false);
              }}
            />
          </div>
        </Show>
      </div>
    </>
  );
}

function SimTools() {
  const paused = (): boolean => simStatus() === 'paused';
  return (
    <>
      <ToolButton
        icon={paused() ? 'play' : 'pause'}
        label={paused() ? 'sim.resume' : 'sim.pause'}
        onClick={togglePause}
      />
      <ToolButton icon="step" label="sim.step" disabled={!paused()} onClick={stepSim} />
      <select
        class="select speed-select"
        aria-label={t('sim.speed')}
        title={t('sim.speed')}
        onChange={(event) => setSimSpeed(Number(event.currentTarget.value))}
      >
        <For each={SIM_SPEEDS}>
          {(speed) => (
            <option value={speed} selected={speed === simSpeed()}>
              ×{formatNumber(speed, locale())}
            </option>
          )}
        </For>
      </select>
      <span class="sim-time" title={t('sim.time')}>
        {formatSi(simTime(), 's', locale())}
      </span>
    </>
  );
}

export function Toolbar() {
  return (
    <div class="toolbar" role="toolbar" data-tour="toolbar" aria-label={t('a11y.toolbar')}>
      <Show when={simActive()} fallback={<EditTools />}>
        <SimTools />
      </Show>
      <span class="toolbar-separator" />
      <ToolButton icon="zoomOut" label="tool.zoomOut" class="desktop-only" onClick={() => zoomBy(1 / 1.25)} />
      <span class="zoom-level desktop-only">{Math.round(viewport().zoom * 100)}%</span>
      <ToolButton icon="zoomIn" label="tool.zoomIn" class="desktop-only" onClick={() => zoomBy(1.25)} />
      <ToolButton icon="fit" label="tool.fit" onClick={fitView} />
      <span class="toolbar-separator" />
      <ToolButton
        icon={viewMode() === 'schematic' ? 'board' : 'schematic'}
        label={viewMode() === 'schematic' ? 'tool.boardView' : 'tool.schematicView'}
        class={viewMode() === 'schematic' ? 'active' : ''}
        onClick={toggleViewMode}
      />
      <ToolButton
        icon="wiresBehind"
        label={wiresBehind() ? 'tool.wiresFront' : 'tool.wiresBehind'}
        class={wiresBehind() ? 'active' : ''}
        onClick={toggleWiresBehind}
      />
      <ToolButton icon="route" label="tool.routeWires" disabled={editLocked()} onClick={tidyWires} />
    </div>
  );
}
