/**
 * Stand-in for 'virtual:pwa-register' in the single-file build: a page
 * opened from disk cannot register a service worker, so this does nothing.
 */
export function registerSW(_options?: unknown): (reload?: boolean) => Promise<void> {
  return async () => undefined;
}
