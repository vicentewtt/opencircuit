import type { PartProps } from './types';

/**
 * Electrical side of a component: the circuit elements it expands to and the
 * limits beyond which it fails. Pure data, consumed by the simulation core.
 */

export const THERMAL_VOLTAGE = 0.025852;

export interface Waveform {
  type: 'sine' | 'square' | 'triangle';
  amplitude: number;
  frequency: number;
  offset: number;
  /** Radians. */
  phase: number;
}

interface Named {
  /** Unique within the part. The element called "main" is the one reported as measurement. */
  name: string;
}

export type ElementSpec =
  | (Named & { kind: 'resistor'; a: number; b: number; ohms: number })
  | (Named & { kind: 'capacitor'; a: number; b: number; farads: number })
  | (Named & { kind: 'inductor'; a: number; b: number; henries: number })
  | (Named & { kind: 'vsource'; p: number; n: number; volts: number; wave?: Waveform })
  | (Named & { kind: 'diode'; a: number; k: number; is: number; n: number })
  /** Switch operated by the part's behavior: `ohms` when closed, open otherwise. */
  | (Named & { kind: 'switch'; a: number; b: number; ohms: number })
  /** Voltage source whose value is set by the part's behavior (starts at 0 V). */
  | (Named & { kind: 'source'; p: number; n: number })
  /**
   * Operational amplifier: out = gain · (inp − inn), limited to stay
   * `headroomHigh` below the positive rail and `headroomLow` above the negative one.
   */
  | (Named & {
      kind: 'opamp';
      inp: number;
      inn: number;
      out: number;
      vp: number;
      vn: number;
      gain: number;
      headroomHigh: number;
      headroomLow: number;
    })
  /** Two magnetically coupled windings (p1-p2 and s1-s2). */
  | (Named & {
      kind: 'transformer';
      p1: number;
      p2: number;
      s1: number;
      s2: number;
      /** Inductance of each winding, in henries. */
      l1: number;
      l2: number;
      /** Coupling coefficient, 0..1. */
      k: number;
    })
  /**
   * Current-controlled current source: the current through the sense path
   * a -> b (a short circuit) appears, times `gain`, flowing from c to d.
   */
  | (Named & { kind: 'cccs'; a: number; b: number; c: number; d: number; gain: number })
  /** Microcontroller I/O pin, driven by the emulator. `b` is the board ground. */
  | (Named & { kind: 'pin'; a: number; b: number })
  | (Named & {
      kind: 'bjt';
      c: number;
      b: number;
      e: number;
      /** 1 = NPN, -1 = PNP. */
      polarity: 1 | -1;
      bf: number;
      br: number;
      is: number;
    })
  | (Named & {
      kind: 'mosfet';
      d: number;
      g: number;
      s: number;
      /** 1 = N-channel, -1 = P-channel. */
      polarity: 1 | -1;
      vth: number;
      kp: number;
      lambda: number;
    });

export interface ModelContext {
  props: PartProps;
  /** Node connected to one of the part's pins. */
  pin: (pinId: string) => number;
  /** Node private to this part (e.g. between a source and its internal resistance). */
  internal: (name: string) => number;
  /** Live user input during simulation (e.g. "pressed"), 0 when absent. */
  input: (name: string) => number;
}

export type FaultCause =
  | 'led-overcurrent'
  | 'overcurrent'
  | 'overpower'
  | 'reverse-polarity'
  | 'overvoltage'
  | 'fuse-blown'
  | 'short-circuit'
  | 'pin-overcurrent';

export interface FaultRule {
  /** Element name whose measurement is checked. */
  element: string;
  /** current = |i|, power = |p|, voltage = |v|, reverse-voltage = max(0, -v). */
  quantity: 'current' | 'power' | 'voltage' | 'reverse-voltage';
  max: number;
  cause: FaultCause;
  /** burn: the part fails open and stays so until repaired. warn: only reported. */
  action: 'burn' | 'warn';
  /** Seconds of overload it survives at a small excess (default 0.2). */
  tolerance?: number;
}

/** Electrical measurement of a part's main element. */
export interface PartSimState {
  v: number;
  i: number;
  p: number;
  /** Extra values a footprint can show (e.g. the level of an on-board LED). */
  aux?: Record<string, number>;
  /**
   * Slow averages (about 0.2 s), steady enough to read on a meter:
   * mean and RMS of voltage and current.
   */
  vMean?: number;
  iMean?: number;
  vRms?: number;
  iRms?: number;
}

/** Marks a part whose elements are sampled over time (oscilloscope, logic analyzer). */
export interface ScopeDef {
  /** Element names, one per channel; each element's voltage is the signal. */
  channels: string[];
  /** Draw the channels as logic levels in separate lanes. */
  digital: boolean;
}

/** One pin of a microcontroller board. */
export interface McuPin {
  /** Pin id of the part ("D13", "A0"). */
  id: string;
  /** I/O port and bit; absent for analog-only pins. */
  port?: 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L';
  bit?: number;
  /** ADC channel, when the pin can be read with analogRead(). */
  adc?: number;
}

/** Marks a part as a programmable board. Its pin elements are named `pin:<id>`. */
export interface McuDef {
  /** Key of the compile target (see BOARD_TARGETS). */
  board: string;
  /** Microcontroller the board emulates. */
  chip: 'atmega328p' | 'atmega2560';
  pins: McuPin[];
  /** Pin wired to the on-board LED. */
  led?: string;
  /** Pins of the hardware I2C bus. */
  i2c?: { sda: string; scl: string };
  /** Pins of the hardware SPI bus. */
  spi?: { mosi: string; sck: string };
}

/** What a footprint may react to while simulating. */
export interface PartVisualState extends Partial<PartSimState> {
  burned?: boolean;
  pressed?: boolean;
}

/** What a part's behavior can see and do on each simulation step. */
export interface BehaviorIo {
  props: PartProps;
  /** Simulated seconds since the previous update (0 while settling at start). */
  dt: number;
  /** Voltage of a pin relative to another pin of the part. Unconnected pins read 0. */
  v(pin: string, ref: string): number;
  /** False when nothing is attached to the pin. */
  connected(pin: string): boolean;
  /** Current through one of the part's elements. */
  i(element: string): number;
  /** Value of a control operated by the user (see ClickAction), 0 when idle. */
  input(name: string): number;
  setSwitch(element: string, closed: boolean): void;
  setSource(element: string, volts: number): void;
  /** Reports a value to the part's footprint. */
  aux(key: string, value: number): void;
}

/**
 * Logic of parts that are more than fixed circuit elements: digital chips,
 * relays, motors. It runs after every solved step, so its reaction arrives
 * one step (50 µs at most) later, like a propagation delay.
 */
export interface Behavior {
  init(props: PartProps): Record<string, number>;
  update(io: BehaviorIo, state: Record<string, number>): void;
}

/** What a click does: hold an input while pressed, or step a property through values. */
export type ClickAction =
  | { kind: 'momentary'; input: string }
  | { kind: 'toggle'; prop: string; values: string[] };

/** A clickable area of a part, in local coordinates. */
export interface ClickZone {
  x: number;
  y: number;
  width: number;
  height: number;
  action: ClickAction;
}

/** How a part reacts to a click while the simulation runs. */
export type Interaction = ClickAction | { kind: 'zones'; zones: ClickZone[] };

/** Saturation current that gives forward voltage `vf` at current `i`. */
export function saturationCurrent(vf: number, i: number, n: number): number {
  return i / Math.expm1(vf / (n * THERMAL_VOLTAGE));
}

/** What a board does with one of its pins: drives it high or low, or leaves it as an input. */
export type PinDrive = 'high' | 'low' | 'float';

/**
 * What a digital module sees. Signals that come straight from a board are
 * followed cycle by cycle, far faster than the electrical simulation.
 */
export interface DigitalIo {
  props: PartProps;
  /** Simulated time in seconds, exact to the CPU cycle while a board is connected. */
  now(): number;
  /** Solved voltage between two pins of the part. */
  v(pin: string, ref: string): number;
  /** Logic level of a pin: what the board drives, or else its solved voltage against `ref`. */
  level(pin: string, ref: string): boolean;
  /** True when the pin reaches a board pin (directly or through a small resistor). */
  linked(pin: string): boolean;
  /** Forces the level the board reads on that pin; null lets the circuit decide again. */
  drive(pin: string, level: boolean | null): void;
  /** Runs `task` after that much simulated time. Needs a connected board. */
  after(seconds: number, task: () => void): void;
  /** Reports a value to the footprint. */
  aux(key: string, value: number): void;
}

/** A module on the I2C bus. */
export interface I2cTarget {
  /** Start of a transfer; return false to stay silent (for example without power). */
  begin?(read: boolean): boolean | void;
  /** A byte from the board; return true to acknowledge it. */
  write(byte: number): boolean;
  /** Next byte for the board. */
  read(): number;
  end?(): void;
}

export interface DigitalDevice {
  /** A watched pin changed. Only called for pins connected to a board. */
  edge?(pin: string, drive: PinDrive): void;
  i2c?: I2cTarget;
  /** A byte sent over hardware SPI; returns the byte answered. */
  spi?(byte: number): number;
  /** Called on every simulation step. */
  tick?(dt: number): void;
}

/** Protocol logic of a module that talks to a board. */
export interface DigitalDef {
  /** Pins whose changes are reported to `edge`. */
  watch?: string[];
  i2c?: { sda: string; scl: string; address: (props: PartProps) => number };
  spi?: { mosi: string; sck: string };
  create(io: DigitalIo): DigitalDevice;
}
