import type { ProjectFile } from './format';

/** Thin promise wrapper over IndexedDB for locally saved projects. */

const DB_NAME = 'opencircuit';
const DB_VERSION = 1;
const STORE = 'projects';

export interface ProjectRecord {
  id: string;
  name: string;
  updatedAt: number;
  file: ProjectFile;
}

export type ProjectSummary = Pick<ProjectRecord, 'id' | 'name' | 'updatedAt'>;

let dbPromise: Promise<IDBDatabase> | undefined;

function openDb(): Promise<IDBDatabase> {
  dbPromise ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is not available'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the database'));
    request.onblocked = () => reject(new Error('Database upgrade blocked by another tab'));
  });
  // A failed open must not poison every later attempt.
  dbPromise.catch(() => {
    dbPromise = undefined;
  });
  return dbPromise;
}

async function run<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onerror = () => reject(transaction.error ?? new Error('Transaction failed'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Transaction aborted'));
  });
}

/** Saved projects, most recently edited first. */
export async function listProjects(): Promise<ProjectSummary[]> {
  const records = await run<ProjectRecord[]>('readonly', (store) => store.getAll());
  return records
    .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getProject(id: string): Promise<ProjectRecord | undefined> {
  return run<ProjectRecord | undefined>('readonly', (store) => store.get(id));
}

export async function putProject(record: ProjectRecord): Promise<void> {
  await run('readwrite', (store) => store.put(record));
}

export async function deleteProject(id: string): Promise<void> {
  await run('readwrite', (store) => store.delete(id));
}
