import { For, Show, createEffect, createSignal, onCleanup, onMount } from 'solid-js';
import { getPartDef } from '../catalog/registry';
import type { Part } from '../editor/model/types';
import { locale, t } from '../i18n';
import { formatSi, parseSi } from '../lib/si';
import { lowerBound, signalStats, windowStart, type SignalStats } from './analysis';
import {
  CHANNEL_COLORS,
  LOGIC_THRESHOLD,
  TIME_DIVS,
  VOLT_DIVS,
  scopeSettings,
  traceBuffer,
  traceTick,
  updateScopeSettings,
} from './state';

const COLUMNS = 10;
const ROWS = 8;
const SCREEN = '#0e1513';
const GRID = '#24332e';
const AXIS = '#3d5750';

/** Screen and controls of an oscilloscope or logic analyzer. */
export function ScopeView(props: { part: Part }) {
  let canvas!: HTMLCanvasElement;
  const scope = getPartDef(props.part.type)?.scope;
  const channelCount = scope?.channels.length ?? 0;
  const digital = scope?.digital ?? false;
  const settings = () => scopeSettings(props.part.id);
  const update = (patch: Parameters<typeof updateScopeSettings>[1]): void =>
    updateScopeSettings(props.part.id, patch);
  const [stats, setStats] = createSignal<(SignalStats | null)[]>([]);
  let lastStats = 0;

  const draw = (): void => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width;
    const height = canvas.height;
    const config = settings();
    ctx.fillStyle = SCREEN;
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 1;
    ctx.strokeStyle = GRID;
    ctx.beginPath();
    for (let c = 1; c < COLUMNS; c++) {
      const x = Math.round((c * width) / COLUMNS) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    if (!digital) {
      for (let r = 1; r < ROWS; r++) {
        const y = Math.round((r * height) / ROWS) + 0.5;
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
    }
    ctx.stroke();
    if (!digital) {
      ctx.strokeStyle = AXIS;
      ctx.beginPath();
      ctx.moveTo(0, Math.round(height / 2) + 0.5);
      ctx.lineTo(width, Math.round(height / 2) + 0.5);
      ctx.stroke();
    }

    const buffer = traceBuffer(props.part.id);
    if (!buffer || buffer.t.length < 2) return;
    const { t: times, ch } = buffer;
    const span = COLUMNS * config.timeDiv;
    const source = digital ? null : (ch[config.triggerSource] ?? null);
    const start = windowStart(
      times,
      source,
      span,
      source ? { rising: config.triggerRising, level: config.triggerLevel } : null,
    );
    const from = Math.max(0, lowerBound(times, start) - 1);
    const to = Math.min(times.length, lowerBound(times, start + span) + 1);
    // More than two samples per pixel add nothing but work.
    const stride = Math.max(1, Math.floor((to - from) / (2 * width)));
    const xOf = (time: number): number => ((time - start) / span) * width;

    ctx.lineWidth = Math.max(1.5, window.devicePixelRatio || 1);
    ctx.lineJoin = 'round';
    const lane = height / Math.max(1, channelCount);
    const voltPixels = height / ROWS / config.voltDiv;

    for (let k = 0; k < channelCount; k++) {
      const values = ch[k];
      if (!values || !config.enabled[k]) continue;
      ctx.strokeStyle = CHANNEL_COLORS[k % CHANNEL_COLORS.length] as string;
      ctx.beginPath();
      if (digital) {
        const low = (k + 0.8) * lane;
        const high = (k + 0.25) * lane;
        let previousY = 0;
        for (let i = from; i < to; i += stride) {
          const x = xOf(times[i] as number);
          const y = (values[i] as number) > LOGIC_THRESHOLD ? high : low;
          if (i === from) ctx.moveTo(x, y);
          else {
            // Square edges: hold the old level until the new sample.
            ctx.lineTo(x, previousY);
            ctx.lineTo(x, y);
          }
          previousY = y;
        }
      } else {
        for (let i = from; i < to; i += stride) {
          const x = xOf(times[i] as number);
          const y = height / 2 - (values[i] as number) * voltPixels;
          if (i === from) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
      }
      ctx.stroke();
    }

    if (digital) {
      ctx.fillStyle = '#9aa39d';
      ctx.font = `${Math.round(11 * (window.devicePixelRatio || 1))}px monospace`;
      for (let k = 0; k < channelCount; k++) ctx.fillText(`D${k}`, 6, (k + 0.6) * lane);
    } else if (performance.now() - lastStats > 250) {
      // The numbers do not need to change sixty times per second.
      lastStats = performance.now();
      setStats(ch.map((values, k) => (config.enabled[k] ? signalStats(times, values, from, to) : null)));
    }
  };

  onMount(() => {
    const observer = new ResizeObserver(() => {
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(rect.width * ratio));
      canvas.height = Math.max(1, Math.round(rect.height * ratio));
      draw();
    });
    observer.observe(canvas);
    onCleanup(() => observer.disconnect());
  });

  createEffect(() => {
    traceTick();
    settings();
    draw();
  });

  const channels = Array.from({ length: channelCount }, (_, k) => k);

  return (
    <div class="scope">
      <div class="scope-controls">
        <label class="scope-control">
          <span>{t('scope.timeDiv')}</span>
          <select class="select" onChange={(event) => update({ timeDiv: Number(event.currentTarget.value) })}>
            <For each={TIME_DIVS}>
              {(value) => (
                <option value={value} selected={value === settings().timeDiv}>
                  {formatSi(value, 's', locale())}
                </option>
              )}
            </For>
          </select>
        </label>
        <Show when={!digital}>
          <label class="scope-control">
            <span>{t('scope.voltDiv')}</span>
            <select class="select" onChange={(event) => update({ voltDiv: Number(event.currentTarget.value) })}>
              <For each={VOLT_DIVS}>
                {(value) => (
                  <option value={value} selected={value === settings().voltDiv}>
                    {formatSi(value, 'V', locale())}
                  </option>
                )}
              </For>
            </select>
          </label>
          <label class="scope-control">
            <span>{t('scope.trigger')}</span>
            <select
              class="select"
              onChange={(event) => update({ triggerSource: Number(event.currentTarget.value) })}
            >
              <option value={-1} selected={settings().triggerSource === -1}>
                {t('scope.trigger.off')}
              </option>
              <For each={channels}>
                {(k) => (
                  <option value={k} selected={settings().triggerSource === k}>
                    {t('scope.channel', { n: k + 1 })}
                  </option>
                )}
              </For>
            </select>
          </label>
          <label class="scope-control">
            <span>{t('scope.trigger.edge')}</span>
            <select
              class="select"
              onChange={(event) => update({ triggerRising: event.currentTarget.value === 'rising' })}
            >
              <option value="rising" selected={settings().triggerRising}>
                {t('scope.trigger.rising')}
              </option>
              <option value="falling" selected={!settings().triggerRising}>
                {t('scope.trigger.falling')}
              </option>
            </select>
          </label>
          <label class="scope-control">
            <span>{t('scope.trigger.level')}</span>
            <input
              type="text"
              class="scope-level"
              placeholder={t('scope.trigger.auto')}
              autocomplete="off"
              onChange={(event) => {
                const text = event.currentTarget.value.trim();
                const level = text === '' ? null : parseSi(text);
                update({ triggerLevel: level });
                if (level === null) event.currentTarget.value = '';
              }}
            />
          </label>
        </Show>
      </div>

      <canvas ref={canvas} class="scope-screen" />

      <Show when={!digital}>
        <div class="scope-channels">
          <For each={channels}>
            {(k) => (
              <label class="scope-channel" style={{ '--channel': CHANNEL_COLORS[k] }}>
                <input
                  type="checkbox"
                  checked={settings().enabled[k]}
                  onChange={(event) =>
                    update({
                      enabled: settings().enabled.map((on, i) => (i === k ? event.currentTarget.checked : on)),
                    })
                  }
                />
                <span class="scope-channel-name">{t('scope.channel', { n: k + 1 })}</span>
                <Show when={stats()[k]}>
                  {(s) => (
                    <span class="scope-stats">
                      {formatSi(s().max - s().min, 'Vpp', locale())} ·{' '}
                      {t('scope.mean', { value: formatSi(s().mean, 'V', locale()) })}
                      {s().frequency > 0 ? ` · ${formatSi(s().frequency, 'Hz', locale())}` : ''}
                    </span>
                  )}
                </Show>
              </label>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
}
