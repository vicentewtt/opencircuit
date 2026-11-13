import { For, Match, Show, Switch, createSignal } from 'solid-js';
import { getPartDef } from '../../catalog/registry';
import type { NumberPropDef, SelectPropDef } from '../../catalog/types';
import { openCodePanel } from '../../arduino/state';
import { openLadderPanel } from '../../plc/state';
import { locale, t, tr } from '../../i18n';
import { formatNumber, formatSi, parseSi } from '../../lib/si';
import {
  burnedInfo,
  faultText,
  partMeasurement,
  simActive,
  warningInfo,
} from '../../sim/simulation';
import { MAX_LABEL_LENGTH, setPartLabel, setPartProp } from '../model/ops';
import type { Part } from '../model/types';
import { commit, doc, selectedParts, selectedWires, selection, setWireColor } from '../store';
import { ColorSwatches } from './ColorSwatches';

function NumberField(props: { part: Part; def: NumberPropDef }) {
  const [invalid, setInvalid] = createSignal(false);
  const current = (): number => {
    const value = props.part.props[props.def.key];
    return typeof value === 'number' ? value : props.def.default;
  };
  // With SI prefixes the prefix is part of the editable text: "4.7 k" + unit "Ω".
  const display = (): string =>
    props.def.si ? formatSi(current(), '', locale()) : formatNumber(current(), locale());
  const set = (value: number, coalesce: boolean): void =>
    commit(
      setPartProp(doc(), props.part.id, props.def.key, value),
      coalesce ? `prop:${props.part.id}:${props.def.key}` : null,
    );

  return (
    <label class="field">
      <span class="field-label">{tr(props.def.label)}</span>
      <span class="field-input">
        <input
          type="text"
          inputMode="text"
          autocomplete="off"
          spellcheck={false}
          value={display()}
          aria-invalid={invalid()}
          onInput={() => setInvalid(false)}
          onChange={(event) => {
            const parsed = parseSi(event.currentTarget.value);
            if (parsed === null) {
              setInvalid(true);
              return;
            }
            set(parsed, false);
            event.currentTarget.value = display();
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur();
          }}
        />
        <span class="field-unit">{props.def.unit}</span>
      </span>
      {/* Plain ranges (like a wiper position) are easier to drag than to type. */}
      <Show when={!props.def.si || props.def.slider}>
        <input
          type="range"
          min={props.def.min}
          max={props.def.max}
          step={(props.def.max - props.def.min) / 100}
          value={current()}
          aria-label={tr(props.def.label)}
          onInput={(event) => set(Number(event.currentTarget.value), true)}
        />
      </Show>
      <Show when={invalid()}>
        <span class="field-error">{t('props.invalid')}</span>
      </Show>
    </label>
  );
}

function SelectField(props: { part: Part; def: SelectPropDef }) {
  return (
    <label class="field">
      <span class="field-label">{tr(props.def.label)}</span>
      <select
        class="select"
        onChange={(event) =>
          commit(setPartProp(doc(), props.part.id, props.def.key, event.currentTarget.value))
        }
      >
        <For each={props.def.options}>
          {(option) => (
            <option value={option.value} selected={props.part.props[props.def.key] === option.value}>
              {tr(option.label)}
            </option>
          )}
        </For>
      </select>
    </label>
  );
}

function Measurements(props: { partId: string }) {
  const fault = () => burnedInfo(props.partId) ?? warningInfo(props.partId);
  const measurement = () => partMeasurement(props.partId);
  const row = (label: string, value: number, unit: string) => (
    <div class="measure-row">
      <span>{label}</span>
      <span class="measure-value">{formatSi(value, unit, locale())}</span>
    </div>
  );
  return (
    <>
      <Show when={fault()}>
        {(info) => (
          <p class="fault" data-kind={burnedInfo(props.partId) ? 'burn' : 'warn'}>
            {faultText(info())}
          </p>
        )}
      </Show>
      <Show when={measurement()}>
        {(m) => (
          <div class="measurements">
            <h3 class="eyebrow">{t('sim.measurements')}</h3>
            {row(t('sim.voltage'), m().v, 'V')}
            {row(t('sim.current'), m().i, 'A')}
            {row(t('sim.power'), m().p, 'W')}
          </div>
        )}
      </Show>
    </>
  );
}

/** Editor for one part. Keyed by id so inputs survive edits to the part itself. */
function PartEditor(props: { partId: string }) {
  const part = (): Part | undefined => doc().parts.find((p) => p.id === props.partId);
  return (
    <Show when={part()}>
      {(current) => {
        const def = getPartDef(current().type);
        if (!def) return null;
        return (
          <>
            <p class="panel-heading">{tr(def.name)}</p>
            <Show when={simActive() || burnedInfo(props.partId)}>
              <Measurements partId={props.partId} />
            </Show>
            <label class="field">
              <span class="field-label">{t('props.label')}</span>
              <input
                type="text"
                maxLength={MAX_LABEL_LENGTH}
                autocomplete="off"
                spellcheck={false}
                value={current().label}
                onChange={(event) =>
                  commit(setPartLabel(doc(), props.partId, event.currentTarget.value))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.currentTarget.blur();
                }}
              />
            </label>
            <For each={def.props}>
              {(prop) =>
                prop.kind === 'number' ? (
                  <NumberField part={current()} def={prop} />
                ) : prop.kind === 'select' ? (
                  <SelectField part={current()} def={prop} />
                ) : (
                  <button
                    type="button"
                    class="button"
                    onClick={() => (def.plc ? openLadderPanel(props.partId) : openCodePanel(props.partId))}
                  >
                    {t(def.plc ? 'plc.edit' : 'code.edit')}
                  </button>
                )
              }
            </For>
          </>
        );
      }}
    </Show>
  );
}

export function PropertiesPanel() {
  const singlePartId = (): string | undefined =>
    selectedParts().length === 1 && selectedWires().length === 0
      ? selectedParts()[0]?.id
      : undefined;
  const onlyWires = (): boolean => selectedParts().length === 0 && selectedWires().length > 0;
  const sharedWireColor = (): string | null => {
    const colors = new Set(selectedWires().map((wire) => wire.color));
    return colors.size === 1 ? ([...colors][0] ?? null) : null;
  };

  return (
    <aside class="properties" data-empty={selection().size === 0} aria-label={t('props.title')}>
      <h2 class="eyebrow">{t('props.title')}</h2>
      <Switch fallback={<p class="panel-hint">{t('props.multiple', { count: selection().size })}</p>}>
        <Match when={selection().size === 0}>
          <p class="panel-hint">{t(simActive() ? 'props.emptySim' : 'props.empty')}</p>
        </Match>
        <Match when={singlePartId()} keyed>
          {(partId) => <PartEditor partId={partId} />}
        </Match>
        <Match when={onlyWires()}>
          <p class="panel-heading">
            {selectedWires().length === 1
              ? t('props.wire')
              : t('props.wires', { count: selectedWires().length })}
          </p>
          <div class="field">
            <span class="field-label">{t('props.color')}</span>
            <ColorSwatches value={sharedWireColor()} onPick={setWireColor} />
          </div>
        </Match>
      </Switch>
    </aside>
  );
}
