import { handleRequest } from './handlers';
import type { CoreRequest } from './protocol';

/**
 * The simulation core running on the page itself, behind the same
 * interface as its worker. Used by the single-file build: some places that
 * open a saved page (file previews in apps, strict browsers) never start
 * the embedded worker, and a page that cannot simulate is useless.
 */
export class LocalCore extends EventTarget {
  postMessage(request: CoreRequest): void {
    // Answer later, like a worker would, so callers never re-enter themselves.
    setTimeout(() => {
      try {
        this.dispatchEvent(new MessageEvent('message', { data: handleRequest(request) }));
      } catch (error) {
        console.error('Simulation core failed', error);
        this.dispatchEvent(new ErrorEvent('error', { message: String(error) }));
      }
    }, 0);
  }

  terminate(): void {
    // Nothing to stop.
  }
}
