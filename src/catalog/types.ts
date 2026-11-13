import type { LocalizedText } from '../i18n/translate';
import type {
  Behavior,
  DigitalDef,
  ElementSpec,
  FaultRule,
  Interaction,
  McuDef,
  ModelContext,
  PartSimState,
  ScopeDef,
  PartVisualState,
} from './model';

export type { LocalizedText };

export type CategoryId =
  | 'passive'
  | 'semiconductor'
  | 'ic'
  | 'board'
  | 'instrument'
  | 'input'
  | 'sensor'
  | 'output'
  | 'industrial'
  | 'source';

export type PropValue = number | string;
export type PartProps = Record<string, PropValue>;

export interface NumberPropDef {
  kind: 'number';
  key: string;
  label: LocalizedText;
  unit: string;
  /** True when the value should be shown with SI prefixes (k, m, µ...). */
  si: boolean;
  default: number;
  min: number;
  max: number;
  /** Also offer a slider (for values meant to be adjusted while simulating). */
  slider?: boolean;
}

export interface SelectPropDef {
  kind: 'select';
  key: string;
  label: LocalizedText;
  options: { value: string; label: LocalizedText }[];
  default: string;
}

/** Source code edited in the code panel, not in the properties panel. */
export interface CodePropDef {
  kind: 'code';
  key: string;
  label: LocalizedText;
  default: string;
}

export const MAX_CODE_LENGTH = 200_000;

export type PropDef = NumberPropDef | SelectPropDef | CodePropDef;

export interface PinDef {
  id: string;
  name: LocalizedText;
  /** Position in local coordinates. Must be a multiple of the grid (10). */
  x: number;
  y: number;
}

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Everything the app knows about a component type. Adding a component means
 * adding one file in catalog/parts/ that default-exports a PartDef.
 */
export interface PartDef {
  type: string;
  category: CategoryId;
  name: LocalizedText;
  /** Extra search terms (any language). */
  keywords: string[];
  /** Reference designator prefix: "R" produces R1, R2... */
  refPrefix: string;
  /** Local bounding box of the footprint, origin at the rotation center. */
  bounds: Bounds;
  pins: PinDef[];
  props: PropDef[];
  /**
   * Breadboard-view drawing as SVG markup in local coordinates. Only values
   * derived from validated props may be interpolated into the markup.
   */
  footprint: (props: PartProps, visual?: PartVisualState) => string;
  /** Pairs of pins that are the same electrical node inside the part. */
  bridges?: [string, string][];
  /** Circuit elements the part expands to. Parts without a model are ignored by the solver. */
  model?: (ctx: ModelContext) => ElementSpec[];
  /** Operating limits checked while simulating. */
  faults?: (props: PartProps) => FaultRule[];
  /** Reaction to a click while the simulation runs. */
  interactive?: Interaction;
  /** Present on programmable boards. */
  mcu?: McuDef;
  /** Logic that runs during simulation (chips, relays, motors). */
  behavior?: Behavior;
  /** The part runs a Ladder program (kept in its `program` property). */
  plc?: boolean;
  /** Protocol logic for modules driven by a board (displays, sensors...). */
  digital?: DigitalDef;
  /** 'base' parts (breadboards) are drawn underneath everything else. */
  layer?: 'base';
  /**
   * Extra currents reported to the footprint: aux key -> element name
   * (e.g. one per segment of a display).
   */
  probes?: Record<string, string>;
  /** Present on instruments that record signals. */
  scope?: ScopeDef;
  /** True while the part should sound (e.g. a continuity tester). */
  /** Sound the part makes: true for the default tone, or a frequency in hertz. */
  beep?: (props: PartProps, state: PartSimState) => boolean | number;
}

/** A text that reads the same in every language (pin numbers, symbols). */
export const same = (text: string): LocalizedText => ({ es: text, en: text });

export function numberProp(props: PartProps, key: string, fallback = 0): number {
  const value = props[key];
  return typeof value === 'number' ? value : fallback;
}

export function stringProp(props: PartProps, key: string, fallback = ''): string {
  const value = props[key];
  return typeof value === 'string' ? value : fallback;
}
