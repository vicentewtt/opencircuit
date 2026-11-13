import { For, Show } from 'solid-js';
import { t } from '../../i18n';
import { burned, faultText, repairAll, simConverged, warnings } from '../../sim/simulation';

/** Explains what went wrong in the circuit: failed parts, overloads, no solution. */
export function FaultList() {
  const visible = (): boolean =>
    burned().length > 0 || warnings().length > 0 || !simConverged();

  return (
    <Show when={visible()}>
      <div class="fault-list" role="alert">
        <Show when={!simConverged()}>
          <p class="fault" data-kind="warn">
            {t('sim.notConverged')}
          </p>
        </Show>
        <For each={burned()}>
          {(info) => (
            <p class="fault" data-kind="burn">
              {faultText(info)}
            </p>
          )}
        </For>
        <For each={warnings()}>
          {(info) => (
            <p class="fault" data-kind="warn">
              {faultText(info)}
            </p>
          )}
        </For>
        <Show when={burned().length > 0}>
          <button type="button" class="button" onClick={repairAll}>
            {t('sim.repair')}
          </button>
        </Show>
      </div>
    </Show>
  );
}
