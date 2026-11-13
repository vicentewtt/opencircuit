import { createEffect, createRoot, createSignal, on } from 'solid-js';
import { notify } from '../app/notices';
import { EMPTY_DOC, type CircuitDoc } from '../editor/model/types';
import { doc, loadDoc } from '../editor/store';
import { t, tr } from '../i18n';
import type { Example } from './examples';
import { readSetting, writeSetting } from '../platform/settings';
import {
  deleteProject,
  getProject,
  listProjects,
  putProject,
  type ProjectSummary,
} from './db';
import {
  MAX_NAME_LENGTH,
  ProjectError,
  createProjectFile,
  parseProject,
  projectFileName,
  readProjectData,
  serializeProject,
} from './format';

/** Current project, autosave and the project list. */

export type SaveState = 'saved' | 'unsaved' | 'saving' | 'error';

const SAVE_DELAY_MS = 600;

const [currentProject, setCurrentProject] = createSignal({ id: '', name: '' });
const [saveState, setSaveState] = createSignal<SaveState>('saved');
const [projectList, setProjectList] = createSignal<ProjectSummary[]>([]);

export { currentProject, saveState, projectList };

let lastSavedDoc: CircuitDoc | null = null;
let lastSavedName = '';
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function newId(): string {
  // randomUUID only exists in secure contexts (not on plain-http LAN addresses).
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

async function refreshList(): Promise<void> {
  try {
    setProjectList(await listProjects());
  } catch {
    // Keep the previous list; the save state already reports storage problems.
  }
}

function scheduleSave(): void {
  setSaveState('unsaved');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void saveNow(), SAVE_DELAY_MS);
}

/** Writes the current project immediately (no-op when nothing changed). */
export async function saveNow(): Promise<void> {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  const { id, name } = currentProject();
  const snapshot = doc();
  if (!id || (snapshot === lastSavedDoc && name === lastSavedName)) return;
  setSaveState('saving');
  try {
    await putProject({ id, name, updatedAt: Date.now(), file: createProjectFile(name, snapshot) });
    if (currentProject().id !== id) return;
    lastSavedDoc = snapshot;
    lastSavedName = name;
    // An edit may have landed while the write was in flight.
    if (doc() === snapshot && currentProject().name === name) setSaveState('saved');
    await refreshList();
  } catch (error) {
    console.error('Autosave failed', error);
    setSaveState('error');
  }
}

function activate(id: string, name: string, document: CircuitDoc, alreadySaved: boolean): void {
  clearTimeout(saveTimer);
  lastSavedDoc = alreadySaved ? document : null;
  lastSavedName = alreadySaved ? name : '';
  setCurrentProject({ id, name });
  loadDoc(document);
  writeSetting('lastProject', id);
  setSaveState('saved');
}

async function createProject(name: string, document: CircuitDoc): Promise<void> {
  activate(newId(), name, document, false);
  await saveNow();
}

function describeError(error: unknown): string {
  if (error instanceof ProjectError) {
    return t(`import.error.${error.code}`, { detail: error.detail });
  }
  return t('import.error.read');
}

async function tryOpen(id: string): Promise<boolean> {
  try {
    const record = await getProject(id);
    if (!record) return false;
    const file = readProjectData(record.file);
    activate(record.id, record.name, file.doc, true);
    return true;
  } catch (error) {
    notify(describeError(error));
    return false;
  }
}

export async function initProjects(): Promise<void> {
  createRoot(() => {
    createEffect(
      on(
        doc,
        (current) => {
          if (current !== lastSavedDoc) scheduleSave();
        },
        { defer: true },
      ),
    );
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void saveNow();
  });
  window.addEventListener('pagehide', () => void saveNow());

  await refreshList();
  const list = projectList();
  const lastId = readSetting('lastProject');
  const candidates = [
    ...list.filter((project) => project.id === lastId),
    ...list.filter((project) => project.id !== lastId),
  ];
  for (const candidate of candidates) {
    if (await tryOpen(candidate.id)) return;
  }
  await createProject(t('project.untitled'), EMPTY_DOC);
}

export async function newProject(): Promise<void> {
  await saveNow();
  await createProject(t('project.untitled'), EMPTY_DOC);
}

/** Opens a ready-made example as a new project of its own. */
export async function openExample(example: Example): Promise<void> {
  await saveNow();
  await createProject(tr(example.name), example.build());
}

export async function openProject(id: string): Promise<void> {
  if (id === currentProject().id) return;
  await saveNow();
  await tryOpen(id);
}

export async function removeProject(id: string): Promise<void> {
  const wasCurrent = id === currentProject().id;
  if (wasCurrent) {
    clearTimeout(saveTimer);
    setCurrentProject({ id: '', name: '' });
  }
  try {
    await deleteProject(id);
  } catch (error) {
    console.error('Delete failed', error);
  }
  await refreshList();
  if (!wasCurrent) return;
  for (const candidate of projectList()) {
    if (await tryOpen(candidate.id)) return;
  }
  await createProject(t('project.untitled'), EMPTY_DOC);
}

export function renameProject(name: string): void {
  const clean = name.trim().slice(0, MAX_NAME_LENGTH) || t('project.untitled');
  if (clean === currentProject().name) return;
  setCurrentProject((project) => ({ ...project, name: clean }));
  scheduleSave();
}

/** Downloads the current project as a .ocircuit file. */
export function exportCurrentProject(): void {
  const { name } = currentProject();
  const blob = new Blob([serializeProject(name, doc())], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = projectFileName(name);
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Imports a .ocircuit file as a new project. Returns false when it is not valid. */
export async function importProjectFile(file: File): Promise<boolean> {
  try {
    const parsed = parseProject(await file.text());
    await saveNow();
    await createProject(parsed.name || t('project.untitled'), parsed.doc);
    return true;
  } catch (error) {
    notify(describeError(error));
    return false;
  }
}
