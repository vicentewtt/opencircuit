import type { PartProps } from '../../catalog/types';

export type Rotation = 0 | 90 | 180 | 270;

export interface Point {
  x: number;
  y: number;
}

export interface Part {
  /** Unique across parts and wires. */
  id: string;
  /** PartDef.type from the catalog. */
  type: string;
  x: number;
  y: number;
  rotation: Rotation;
  /** Mirrored horizontally (applied before rotation). */
  flipped: boolean;
  /** Reference designator shown next to the part ("R1"). */
  label: string;
  props: PartProps;
}

export interface PinRef {
  partId: string;
  pinId: string;
}

export interface Wire {
  id: string;
  from: PinRef;
  to: PinRef;
  /** Bend points between both pins, in world coordinates. */
  points: Point[];
  /** #rrggbb */
  color: string;
}

/** The circuit itself. Treated as immutable: every edit returns a new document. */
export interface CircuitDoc {
  parts: Part[];
  wires: Wire[];
}

export const EMPTY_DOC: CircuitDoc = { parts: [], wires: [] };

export const WIRE_COLORS = [
  '#d32f2f',
  '#1b1b1b',
  '#f2c81e',
  '#2e9e4f',
  '#2962c9',
  '#ef7d1a',
  '#8e44ad',
  '#f5f5f5',
] as const;

export const DEFAULT_WIRE_COLOR: string = WIRE_COLORS[3];
