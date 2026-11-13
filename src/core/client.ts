import { LocalCore } from './local-core';
import type { CoreMethod, CoreParams, CoreRequest, CoreResponse, CoreResult } from './protocol';

interface PendingCall {
  resolve: (value: CoreResult<CoreMethod>) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/** Promise-based RPC client for the core worker. The only door from UI to core. */
export class CoreClient {
  private readonly worker: Worker;
  private readonly timeoutMs: number;
  private readonly pending = new Map<number, PendingCall>();
  private nextId = 1;

  constructor(worker: Worker, timeoutMs: number = DEFAULT_TIMEOUT_MS) {
    this.worker = worker;
    this.timeoutMs = timeoutMs;
    worker.addEventListener('message', (event: MessageEvent<CoreResponse>) => {
      this.settle(event.data);
    });
    worker.addEventListener('error', (event) => {
      this.rejectAll(new Error(event.message || 'Core worker crashed'));
    });
    worker.addEventListener('messageerror', () => {
      this.rejectAll(new Error('Core worker sent an unreadable message'));
    });
  }

  call<M extends CoreMethod>(method: M, params: CoreParams<M>): Promise<CoreResult<M>> {
    return new Promise<CoreResult<M>>((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Core call "${method}" timed out after ${this.timeoutMs} ms`));
      }, this.timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (value: CoreResult<CoreMethod>) => void,
        reject,
        timer,
      });
      this.worker.postMessage({ id, method, params } as CoreRequest);
    });
  }

  dispose(): void {
    this.rejectAll(new Error('Core client disposed'));
    this.worker.terminate();
  }

  private settle(response: CoreResponse): void {
    const call = this.pending.get(response.id);
    if (!call) return;
    this.pending.delete(response.id);
    clearTimeout(call.timer);
    if (response.ok) {
      call.resolve(response.result);
    } else {
      call.reject(new Error(response.error));
    }
  }

  private rejectAll(reason: Error): void {
    for (const call of this.pending.values()) {
      clearTimeout(call.timer);
      call.reject(reason);
    }
    this.pending.clear();
  }
}

let sharedClient: CoreClient | undefined;

/** Lazily spawns the single core worker shared by the whole app. */
export function getCoreClient(): CoreClient {
  sharedClient ??= new CoreClient(
    __SINGLE_FILE__
      ? (new LocalCore() as unknown as Worker)
      : new Worker(new URL('./core.worker.ts', import.meta.url), { type: 'module', name: 'oc-core' }),
  );
  return sharedClient;
}
