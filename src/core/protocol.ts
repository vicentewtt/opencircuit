import type { CircuitDoc } from '../editor/model/types';
import type { FaultInfo, Firmware, SimInputs, SimSnapshot } from './sim/types';

/**
 * Typed message protocol between the UI thread and the core worker.
 * New core features (AVR emulator, ladder runtime) add entries to CoreApi;
 * requests and responses are derived from it.
 */

export const PROTOCOL_VERSION = 3;

export interface CoreApi {
  /** First call after startup: lets the UI verify it talks to a compatible core. */
  handshake: {
    params: null;
    result: { protocolVersion: number };
  };
  /** Echo used to measure the worker round-trip time. */
  ping: {
    params: { payload: number };
    result: { payload: number };
  };
  /** Starts a simulation at the DC operating point of the circuit. */
  'sim.load': {
    params: { doc: CircuitDoc; inputs: SimInputs; burned: FaultInfo[]; firmware: Firmware };
    result: SimSnapshot;
  };
  /** Applies an edited document or new inputs, keeping the electrical state. */
  'sim.update': {
    params: { doc: CircuitDoc; inputs: SimInputs };
    result: null;
  };
  /** Advances `dt` simulated seconds, or less when `budgetMs` of wall time runs out. */
  'sim.advance': {
    params: { dt: number; budgetMs: number };
    result: SimSnapshot;
  };
  /** Restores burned parts (all of them when partIds is null). */
  'sim.repair': {
    params: { partIds: string[] | null };
    result: null;
  };
  /** Sends text to a board's serial port (what the serial monitor types). */
  'sim.serialWrite': {
    params: { partId: string; text: string };
    result: null;
  };
  'sim.stop': {
    params: null;
    result: null;
  };
}

export type CoreMethod = keyof CoreApi;
export type CoreParams<M extends CoreMethod> = CoreApi[M]['params'];
export type CoreResult<M extends CoreMethod> = CoreApi[M]['result'];

export type CoreRequest = {
  [M in CoreMethod]: { id: number; method: M; params: CoreParams<M> };
}[CoreMethod];

export type CoreResponse =
  | { id: number; ok: true; result: CoreResult<CoreMethod> }
  | { id: number; ok: false; error: string };
