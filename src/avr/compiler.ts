import type { CompileRequest, CompileResponse } from './compiler.worker';
import type { CompileResult } from './toolchain';

/** Main-thread access to the compiler worker, with a cache of finished builds. */

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<
  number,
  { resolve: (result: CompileResult) => void; reject: (error: Error) => void }
>();
const cache = new Map<string, CompileResult>();
const MAX_CACHED = 20;

function getWorker(): Worker {
  if (worker) return worker;
  const created = new Worker(new URL('./compiler.worker.ts', import.meta.url), {
    type: 'module',
    name: 'oc-compiler',
  });
  created.addEventListener('message', (event: MessageEvent<CompileResponse>) => {
    const call = pending.get(event.data.id);
    if (!call) return;
    pending.delete(event.data.id);
    if (event.data.ok) call.resolve(event.data.result);
    else call.reject(new Error(event.data.error));
  });
  created.addEventListener('error', (event) => {
    for (const call of pending.values()) call.reject(new Error(event.message || 'Compiler crashed'));
    pending.clear();
    created.terminate();
    worker = undefined;
  });
  worker = created;
  return created;
}

/**
 * Compiles a sketch for a board. Resolves with diagnostics when the sketch has
 * errors; rejects only when the compiler itself could not run.
 */
export function compileSketch(source: string, board: string): Promise<CompileResult> {
  const key = `${board}\n${source}`;
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  return new Promise<CompileResult>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, {
      resolve: (result) => {
        if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
        cache.set(key, result);
        resolve(result);
      },
      reject,
    });
    const request: CompileRequest = {
      id,
      baseUrl: new URL('avr/', document.baseURI).href,
      source,
      board,
    };
    getWorker().postMessage(request);
  });
}
