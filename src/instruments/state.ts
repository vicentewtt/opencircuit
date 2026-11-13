import { createSignal } from 'solid-js';
import { getPartDef } from '../catalog/registry';
import type { SimSnapshot, Trace } from '../core/sim/types';
import type { Part } from '../editor/model/types';
import { doc } from '../editor/store';

/** Instrument dock state: recorded signals and how each instrument displays them. */

export const TIME_DIVS = [0.0002, 0.0005, 0.001, 0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5];
export const VOLT_DIVS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10];
export const CHANNEL_COLORS = ['#e2b340', '#3fb6c9', '#d264c8', '#5fbf5f', '#ef7d1a', '#8ea2ff', '#ff7b72', '#c9cdd2'];
/** Voltage above which a logic analyzer channel reads high. */
export const LOGIC_THRESHOLD = 2.5;

export interface ScopeSettings {
  timeDiv: number;
  voltDiv: number;
  enabled: boolean[];
  /** Channel index, or -1 for free running. */
  triggerSource: number;
  triggerRising: boolean;
  /** Volts; null = automatic (middle of the signal). */
  triggerLevel: number | null;
}

const DEFAULT_SETTINGS: ScopeSettings = {
  timeDiv: 0.005,
  voltDiv: 2,
  enabled: [true, true, true, true, true, true, true, true],
  triggerSource: 0,
  triggerRising: true,
  triggerLevel: null,
};

/** Samples kept per instrument: three simulated seconds at full rate. */
const MAX_SAMPLES = 60_000;

const [dockOpen, setDockOpen] = createSignal(false);
const [activeInstrumentId, setActiveInstrumentId] = createSignal<string | null>(null);
const [settings, setSettings] = createSignal<Record<string, ScopeSettings>>({});
/** Bumped whenever new samples arrive, to redraw the displays. */
const [traceTick, setTraceTick] = createSignal(0);

export { dockOpen, setDockOpen, setActiveInstrumentId, traceTick };

const buffers = new Map<string, Trace>();

/** Recording instruments in the circuit. */
export const recorders = (): Part[] =>
  doc().parts.filter((part) => getPartDef(part.type)?.scope !== undefined);

export function activeInstrument(): Part | undefined {
  const all = recorders();
  return all.find((part) => part.id === activeInstrumentId()) ?? all[0];
}

export const scopeSettings = (partId: string): ScopeSettings =>
  settings()[partId] ?? DEFAULT_SETTINGS;

export function updateScopeSettings(partId: string, patch: Partial<ScopeSettings>): void {
  setSettings((current) => ({ ...current, [partId]: { ...scopeSettings(partId), ...patch } }));
}

export const traceBuffer = (partId: string): Trace | undefined => buffers.get(partId);

export function clearTraces(): void {
  buffers.clear();
  setTraceTick((tick) => tick + 1);
}

export function appendTraces(traces: SimSnapshot['traces']): void {
  let changed = false;
  for (const [partId, chunk] of Object.entries(traces)) {
    let buffer = buffers.get(partId);
    if (!buffer || buffer.ch.length !== chunk.ch.length) {
      buffer = { t: [], ch: chunk.ch.map(() => []) };
      buffers.set(partId, buffer);
    }
    for (const time of chunk.t) buffer.t.push(time);
    chunk.ch.forEach((values, k) => {
      const target = buffer.ch[k];
      if (target) for (const value of values) target.push(value);
    });
    // Trim in blocks so it does not happen on every frame.
    if (buffer.t.length > MAX_SAMPLES * 1.5) {
      const drop = buffer.t.length - MAX_SAMPLES;
      buffer.t.splice(0, drop);
      for (const values of buffer.ch) values.splice(0, drop);
    }
    changed = true;
  }
  if (changed) setTraceTick((tick) => tick + 1);
}
