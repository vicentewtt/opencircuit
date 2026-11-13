import { createSignal } from 'solid-js';
import { compileSketch } from '../avr/compiler';
import type { CompileResult } from '../avr/toolchain';
import { getPartDef } from '../catalog/registry';
import type { Part } from '../editor/model/types';
import { doc } from '../editor/store';

/** State of the code panel: which board is being edited and its last build. */

export type BuildReport =
  | { status: 'compiling' }
  | { status: 'done'; result: CompileResult }
  /** The compiler itself could not run (e.g. it could not be downloaded). */
  | { status: 'unavailable'; detail: string };

const [codePanelOpen, setCodePanelOpen] = createSignal(false);
const [activeBoardId, setActiveBoardId] = createSignal<string | null>(null);
const [reports, setReports] = createSignal<Record<string, BuildReport>>({});

export { codePanelOpen, setCodePanelOpen, setActiveBoardId };

/** Programmable boards in the circuit. */
export const boards = (): Part[] =>
  doc().parts.filter((part) => getPartDef(part.type)?.mcu !== undefined);

/** The board shown in the code panel: the chosen one, or the first available. */
export function activeBoard(): Part | undefined {
  const all = boards();
  return all.find((part) => part.id === activeBoardId()) ?? all[0];
}

export function openCodePanel(partId?: string): void {
  if (partId) setActiveBoardId(partId);
  setCodePanelOpen(true);
}

export const sketchOf = (part: Part): string =>
  typeof part.props.code === 'string' ? part.props.code : '';

export const buildReport = (partId: string): BuildReport | undefined => reports()[partId];

function setReport(partId: string, report: BuildReport): void {
  setReports((current) => ({ ...current, [partId]: report }));
}

/** Compiles a board's sketch and records the outcome for the code panel. */
export async function buildBoard(part: Part): Promise<CompileResult | null> {
  const board = getPartDef(part.type)?.mcu?.board;
  if (!board) return null;
  setReport(part.id, { status: 'compiling' });
  try {
    const result = await compileSketch(sketchOf(part), board);
    setReport(part.id, { status: 'done', result });
    return result;
  } catch (error) {
    console.error('Compiler unavailable', error);
    setReport(part.id, {
      status: 'unavailable',
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
