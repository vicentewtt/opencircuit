import { BOARD_TARGETS, Toolchain, type CompileResult, type ToolFactory } from './toolchain';

/** Runs the AVR toolchain off the main thread. */

export interface CompileRequest {
  id: number;
  /** Absolute URL of the avr/ directory. */
  baseUrl: string;
  source: string;
  board: string;
}

export type CompileResponse =
  | { id: number; ok: true; result: CompileResult }
  | { id: number; ok: false; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;
let toolchain: Toolchain | undefined;

function getToolchain(baseUrl: string): Toolchain {
  toolchain ??= new Toolchain({
    readFile: async (path) => {
      const response = await fetch(new URL(path, baseUrl));
      if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status})`);
      return new Uint8Array(await response.arrayBuffer());
    },
    importFactory: async (path) => {
      const module = (await import(/* @vite-ignore */ new URL(path, baseUrl).href)) as {
        default: ToolFactory;
      };
      return module.default;
    },
  });
  return toolchain;
}

scope.addEventListener('message', (event: MessageEvent<CompileRequest>) => {
  const { id, baseUrl, source, board } = event.data;
  const respond = (response: CompileResponse): void => scope.postMessage(response);
  const target = BOARD_TARGETS[board];
  if (!target) {
    respond({ id, ok: false, error: `Unknown board: ${board}` });
    return;
  }
  getToolchain(baseUrl)
    .compile(source, target)
    .then(
      (result) => respond({ id, ok: true, result }),
      (error: unknown) =>
        respond({ id, ok: false, error: error instanceof Error ? error.message : String(error) }),
    );
});
