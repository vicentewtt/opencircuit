/** Pure helpers for drawing recorded signals: windowing, triggering, statistics. */

/** First index whose value is >= target in an ascending array. */
export function lowerBound(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = (low + high) >> 1;
    if ((values[mid] as number) < target) low = mid + 1;
    else high = mid;
  }
  return low;
}

export interface TriggerOptions {
  rising: boolean;
  /** Volts; null uses the midpoint of the signal. */
  level: number | null;
}

/** Share of the screen shown before the trigger point. */
export const PRE_TRIGGER = 0.2;

/**
 * Start time of the window to display. Without a trigger (or when no crossing
 * is found) the window simply ends at the newest sample; with one, the most
 * recent crossing that still leaves a full screen is placed at PRE_TRIGGER.
 */
export function windowStart(
  t: readonly number[],
  signal: readonly number[] | null,
  span: number,
  trigger: TriggerOptions | null,
): number {
  const newest = t[t.length - 1] ?? 0;
  const freeRun = newest - span;
  if (!trigger || !signal || t.length < 3) return freeRun;

  const latest = newest - (1 - PRE_TRIGGER) * span;
  const earliest = Math.max((t[0] ?? 0) + PRE_TRIGGER * span, newest - 4 * span);
  let level = trigger.level;
  if (level === null) {
    let min = Infinity;
    let max = -Infinity;
    for (let i = lowerBound(t, newest - 2 * span); i < signal.length; i++) {
      const v = signal[i] as number;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (max - min < 1e-6) return freeRun;
    level = (min + max) / 2;
  }

  for (let i = Math.min(lowerBound(t, latest), t.length - 1); i > 0; i--) {
    if ((t[i] as number) < earliest) break;
    const before = signal[i - 1] as number;
    const after = signal[i] as number;
    const crossed = trigger.rising ? before < level && after >= level : before > level && after <= level;
    if (crossed) return (t[i] as number) - PRE_TRIGGER * span;
  }
  return freeRun;
}

export interface SignalStats {
  min: number;
  max: number;
  mean: number;
  /** Hertz, or 0 when fewer than two cycles are visible. */
  frequency: number;
}

/** Statistics of the samples with index in [from, to). */
export function signalStats(
  t: readonly number[],
  signal: readonly number[],
  from: number,
  to: number,
): SignalStats | null {
  if (to - from < 2) return null;
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  for (let i = from; i < to; i++) {
    const v = signal[i] as number;
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }
  const mean = sum / (to - from);
  // Count upward crossings of the middle level, ignoring noise near it.
  const mid = (min + max) / 2;
  const band = (max - min) * 0.1;
  let frequency = 0;
  if (band > 1e-6) {
    let armed = false;
    let first = -1;
    let last = -1;
    let crossings = 0;
    for (let i = from; i < to; i++) {
      const v = signal[i] as number;
      if (v < mid - band) armed = true;
      else if (armed && v > mid + band) {
        armed = false;
        crossings += 1;
        if (first < 0) first = t[i] as number;
        last = t[i] as number;
      }
    }
    if (crossings >= 2 && last > first) frequency = (crossings - 1) / (last - first);
  }
  return { min, max, mean, frequency };
}

/**
 * Columns of numbers found in serial text, for the plotter. Each line is one
 * sample; values are separated by spaces, commas, tabs or semicolons and may
 * be written as "label:value".
 */
export function parsePlotData(text: string, maxPoints: number): number[][] {
  const lines = text.split(/\r?\n/);
  // The last line may still be arriving.
  lines.pop();
  const series: number[][] = [];
  for (const line of lines.slice(-maxPoints)) {
    const values = line
      .trim()
      .split(/[\s,;]+/)
      .map((token) => Number(token.replace(/^[^:]*:/, '')));
    if (values.length === 0 || values.some((value) => !Number.isFinite(value))) continue;
    if (line.trim() === '') continue;
    values.forEach((value, column) => {
      (series[column] ??= []).push(value);
    });
  }
  return series;
}
