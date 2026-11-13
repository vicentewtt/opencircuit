import type { FaultCause, PartSimState } from '../../catalog/model';

/** Live user input per part: { partId: { pressed: 1 } }. */
export type SimInputs = Record<string, Record<string, number>>;

/** Compiled programs (Intel HEX) per board part id. */
export type Firmware = Record<string, string>;

export interface FaultInfo {
  partId: string;
  cause: FaultCause;
  /** Measured value that broke the limit. */
  value: number;
  limit: number;
  /** Unit of value and limit: A, W or V. */
  unit: string;
}

/** Samples recorded by an instrument: times and one array of volts per channel. */
export interface Trace {
  t: number[];
  ch: number[][];
}

export interface SimSnapshot {
  /** Simulated seconds since the start. */
  time: number;
  /** False when the solver could not find a solution for the last step. */
  converged: boolean;
  parts: Record<string, PartSimState>;
  /** Parts that failed and stay open until repaired. */
  burned: FaultInfo[];
  /** Limits currently exceeded by parts that do not fail (e.g. a shorted battery). */
  warnings: FaultInfo[];
  /** Text each board printed on its serial port since the previous snapshot. */
  serial: Record<string, string>;
  /** Samples each recording instrument captured since the previous snapshot. */
  traces: Record<string, Trace>;
}
