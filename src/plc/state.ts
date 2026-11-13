import { createSignal } from 'solid-js';
import { setCodePanelOpen } from '../arduino/state';
import { getPartDef } from '../catalog/registry';
import type { Part } from '../editor/model/types';
import { doc } from '../editor/store';
import { programOf, type Program } from './ladder';

/** State of the Ladder panel: whether it is open and which PLC it shows. */

const [ladderPanelOpen, setLadderOpen] = createSignal(false);
const [activePlcId, setActivePlcId] = createSignal<string | null>(null);

export { ladderPanelOpen, setActivePlcId };

/** PLCs in the circuit. */
export const plcs = (): Part[] => doc().parts.filter((part) => getPartDef(part.type)?.plc === true);

/** The PLC shown in the panel: the chosen one, or the first available. */
export function activePlc(): Part | undefined {
  const all = plcs();
  return all.find((part) => part.id === activePlcId()) ?? all[0];
}

/** Opens or closes the panel. It shares its place with the code panel, so that one closes. */
export function setLadderPanelOpen(open: boolean): void {
  if (open) setCodePanelOpen(false);
  setLadderOpen(open);
}

export function openLadderPanel(partId?: string): void {
  if (partId) setActivePlcId(partId);
  setLadderPanelOpen(true);
}

export const programOfPart = (part: Part): Program =>
  programOf(typeof part.props.program === 'string' ? part.props.program : '');
