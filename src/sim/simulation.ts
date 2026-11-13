import { batch, createSignal } from 'solid-js';
import { notify } from '../app/notices';
import { boards, buildBoard, openCodePanel } from '../arduino/state';
import type { PartVisualState } from '../catalog/model';
import { getPartDef } from '../catalog/registry';
import { getCoreClient } from '../core/client';
import type { FaultInfo, Firmware, SimInputs, SimSnapshot } from '../core/sim/types';
import type { CircuitDoc } from '../editor/model/types';
import { doc, setEditLocked } from '../editor/store';
import { locale, t } from '../i18n';
import { primeAudio, setBeep } from '../instruments/beep';
import { appendTraces, clearTraces, recorders, setDockOpen } from '../instruments/state';
import { formatSi } from '../lib/si';

/** UI side of the simulation: run loop, speed control and live part state. */

/** starting = compiling the boards' sketches before the first step. */
export type SimStatus = 'stopped' | 'starting' | 'running' | 'paused';

export const SIM_SPEEDS = [0.1, 0.25, 0.5, 1, 2, 5, 10] as const;
/** Simulated time advanced by the "step" button. */
const STEP_SECONDS = 1e-3;
/** Wall time the worker may spend per frame before the simulation slows down. */
const FRAME_BUDGET_MS = 12;
const MAX_FRAME_SECONDS = 0.1;
const MAX_SERIAL_CHARS = 50_000;

const [simStatus, setSimStatus] = createSignal<SimStatus>('stopped');
const [simTime, setSimTime] = createSignal(0);
const [simSpeed, setSimSpeed] = createSignal<number>(1);
const [simConverged, setSimConverged] = createSignal(true);
const [partStates, setPartStates] = createSignal<SimSnapshot['parts']>({});
const [burned, setBurned] = createSignal<FaultInfo[]>([]);
const [warnings, setWarnings] = createSignal<FaultInfo[]>([]);
const [inputs, setInputs] = createSignal<SimInputs>({});
const [serial, setSerial] = createSignal<Record<string, string>>({});

export { simStatus, simTime, simSpeed, setSimSpeed, simConverged, burned, warnings };

export const simActive = (): boolean => simStatus() !== 'stopped';

/** Changes whenever a run starts or stops, so stale async results are dropped. */
let generation = 0;
let sentDoc: CircuitDoc | null = null;
let sentInputs: SimInputs | null = null;
let lastFrame = 0;

function apply(snapshot: SimSnapshot): void {
  batch(() => {
    setSimTime(snapshot.time);
    setSimConverged(snapshot.converged);
    setPartStates(snapshot.parts);
    setBurned(snapshot.burned);
    setWarnings(snapshot.warnings);
    appendTraces(snapshot.traces);
    let sound: boolean | number = false;
    for (const part of doc().parts) {
      const state = snapshot.parts[part.id];
      sound = (state && getPartDef(part.type)?.beep?.(part.props, state)) ?? false;
      if (sound !== false && sound !== 0) break;
    }
    if (typeof sound === 'number') setBeep(sound > 0, sound > 0 ? sound : undefined);
    else setBeep(sound);
    const printed = Object.entries(snapshot.serial);
    if (printed.length > 0) {
      setSerial((current) => {
        const next = { ...current };
        for (const [partId, text] of printed) {
          next[partId] = ((next[partId] ?? '') + text).slice(-MAX_SERIAL_CHARS);
        }
        return next;
      });
    }
  });
}

/** Sends pending edits and inputs, then advances the simulation. */
async function advance(run: number, seconds: number): Promise<void> {
  const client = getCoreClient();
  const currentDoc = doc();
  const currentInputs = inputs();
  if (currentDoc !== sentDoc || currentInputs !== sentInputs) {
    sentDoc = currentDoc;
    sentInputs = currentInputs;
    await client.call('sim.update', { doc: currentDoc, inputs: currentInputs });
  }
  const snapshot = await client.call('sim.advance', { dt: seconds, budgetMs: FRAME_BUDGET_MS });
  if (run === generation) apply(snapshot);
}

function fail(error: unknown): void {
  console.error('Simulation failed', error);
  notify(t('sim.failed'));
  stopSim();
}

function frame(run: number, timestamp: number): void {
  if (run !== generation || simStatus() !== 'running') return;
  const wallSeconds = Math.min(MAX_FRAME_SECONDS, Math.max(0, (timestamp - lastFrame) / 1000));
  lastFrame = timestamp;
  advance(run, wallSeconds * simSpeed()).then(
    () => requestAnimationFrame((next) => frame(run, next)),
    (error: unknown) => {
      if (run === generation) fail(error);
    },
  );
}

function startLoop(run: number): void {
  lastFrame = performance.now();
  requestAnimationFrame((timestamp) => frame(run, timestamp));
}

/**
 * Compiles the sketch of every board. Returns null (after pointing the user
 * at the problem) when one of them does not build.
 */
async function buildFirmware(run: number): Promise<Firmware | null> {
  const firmware: Firmware = {};
  for (const board of boards()) {
    const result = await buildBoard(board);
    if (run !== generation) return null;
    if (!result?.ok) {
      openCodePanel(board.id);
      notify(t(result ? 'code.compileFailed' : 'code.toolchainError', { label: board.label }));
      return null;
    }
    firmware[board.id] = result.hex;
  }
  return firmware;
}

export async function startSim(): Promise<void> {
  if (simActive()) return;
  const run = ++generation;
  // Started by a click, so this is the moment audio may be enabled.
  primeAudio();
  batch(() => {
    setEditLocked(true);
    setInputs({});
    setSerial({});
    clearTraces();
    if (recorders().length > 0) setDockOpen(true);
    setSimStatus('starting');
  });
  try {
    const firmware = await buildFirmware(run);
    if (run !== generation) return;
    if (!firmware) {
      stopSim();
      return;
    }
    sentDoc = doc();
    sentInputs = inputs();
    const snapshot = await getCoreClient().call('sim.load', {
      doc: sentDoc,
      inputs: sentInputs,
      burned: burned(),
      firmware,
    });
    if (run !== generation) return;
    apply(snapshot);
    setSimStatus('running');
    startLoop(run);
  } catch (error) {
    if (run === generation) fail(error);
  }
}

export function stopSim(): void {
  if (!simActive()) return;
  const wasLoaded = simStatus() !== 'starting';
  generation += 1;
  batch(() => {
    setSimStatus('stopped');
    setPartStates({});
    setWarnings([]);
    setInputs({});
    setSimConverged(true);
    setEditLocked(false);
  });
  setBeep(false);
  if (wasLoaded) {
    getCoreClient()
      .call('sim.stop', null)
      .catch(() => undefined);
  }
}

export function toggleSim(): void {
  if (simActive()) stopSim();
  else void startSim();
}

export function togglePause(): void {
  if (simStatus() === 'running') {
    setSimStatus('paused');
  } else if (simStatus() === 'paused') {
    setSimStatus('running');
    startLoop(generation);
  }
}

/** While paused, advances a fixed small amount of simulated time. */
export function stepSim(): void {
  if (simStatus() !== 'paused') return;
  const run = generation;
  advance(run, STEP_SECONDS).catch((error: unknown) => {
    if (run === generation) fail(error);
  });
}

const isLoaded = (): boolean => simStatus() === 'running' || simStatus() === 'paused';

/** Restores every burned part. */
export function repairAll(): void {
  setBurned([]);
  if (!isLoaded()) return;
  const run = generation;
  getCoreClient()
    .call('sim.repair', { partIds: null })
    .catch((error: unknown) => {
      if (run === generation) fail(error);
    });
}

/** Sets a live input of a part (e.g. a pushbutton being held). */
export function setInput(partId: string, name: string, value: number): void {
  setInputs((current) => {
    const next = { ...current };
    if (value === 0) delete next[partId];
    else next[partId] = { ...current[partId], [name]: value };
    return next;
  });
}

/** Text a board has printed on its serial port during this run. */
export const serialText = (partId: string): string => serial()[partId] ?? '';

export function clearSerial(partId: string): void {
  setSerial((current) => ({ ...current, [partId]: '' }));
}

/** Types text into a board's serial port. */
export function sendSerial(partId: string, text: string): void {
  if (!isLoaded()) return;
  const run = generation;
  getCoreClient()
    .call('sim.serialWrite', { partId, text })
    .catch((error: unknown) => {
      if (run === generation) fail(error);
    });
}

export function burnedInfo(partId: string): FaultInfo | undefined {
  return burned().find((info) => info.partId === partId);
}

export function warningInfo(partId: string): FaultInfo | undefined {
  return warnings().find((info) => info.partId === partId);
}

/** Everything a footprint needs to draw the part's live state. */
export function partVisual(partId: string): PartVisualState {
  const visual: PartVisualState = { ...partStates()[partId] };
  if (burnedInfo(partId)) visual.burned = true;
  if ((inputs()[partId]?.pressed ?? 0) > 0) visual.pressed = true;
  return visual;
}

export function partMeasurement(partId: string): SimSnapshot['parts'][string] | undefined {
  return partStates()[partId];
}

/** Human-readable explanation of a fault, with the measured values. */
export function faultText(info: FaultInfo): string {
  const label = doc().parts.find((part) => part.id === info.partId)?.label || info.partId;
  return t(`fault.${info.cause}`, {
    label,
    value: formatSi(info.value, info.unit, locale()),
    limit: formatSi(info.limit, info.unit, locale()),
  });
}
