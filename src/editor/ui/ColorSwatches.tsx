import { For } from 'solid-js';
import { t, type MessageKey } from '../../i18n';
import { WIRE_COLORS } from '../model/types';

const COLOR_NAMES: Record<(typeof WIRE_COLORS)[number], MessageKey> = {
  '#d32f2f': 'color.red',
  '#1b1b1b': 'color.black',
  '#f2c81e': 'color.yellow',
  '#2e9e4f': 'color.green',
  '#2962c9': 'color.blue',
  '#ef7d1a': 'color.orange',
  '#8e44ad': 'color.purple',
  '#f5f5f5': 'color.white',
};

export function ColorSwatches(props: { value: string | null; onPick: (color: string) => void }) {
  return (
    <div class="swatches" role="radiogroup" aria-label={t('props.color')}>
      <For each={WIRE_COLORS}>
        {(color) => (
          <button
            type="button"
            role="radio"
            class="swatch"
            style={{ background: color }}
            aria-checked={props.value === color}
            aria-label={t(COLOR_NAMES[color])}
            title={t(COLOR_NAMES[color])}
            onClick={() => props.onPick(color)}
          />
        )}
      </For>
    </div>
  );
}
