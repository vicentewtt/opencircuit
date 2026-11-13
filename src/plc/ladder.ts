/**
 * Ladder programs for the PLC: the data model, its validation and the
 * interpreter that runs one scan. Pure code, shared by the simulation
 * (inside the worker) and the editor (to show the power flow live).
 */

/** Contact columns of every rung; the output sits in one more column at the end. */
export const COLUMNS = 5;
export const MAX_RUNGS = 60;
export const MAX_ROWS = 6;

export const INPUTS = 8;
export const OUTPUTS = 4;
export const MARKERS = 16;
export const TIMERS = 8;
export const COUNTERS = 8;
export const ANALOG = 2;
/** Analog inputs read 0 to 10 V as 0 to 1000. */
export const ANALOG_FULL_SCALE = 1000;
export const NAME_LENGTH = 16;

/** Normally open, normally closed, rising edge, falling edge. */
export type ContactKind = 'no' | 'nc' | 'p' | 'n';
export type CompareOp = '>' | '>=' | '<' | '<=' | '=' | '<>';
export const COMPARE_OPS: CompareOp[] = ['>', '>=', '<', '<=', '=', '<>'];
export type CoilKind = 'coil' | 'set' | 'reset';
export type TimerKind = 'ton' | 'tof';

export type Cell =
  | { t: 'wire' }
  | { t: ContactKind; a: string }
  /** Conducts while the value at `a` compares true against the constant `k`. */
  | { t: 'cmp'; a: string; op: CompareOp; k: number }
  | null;

/** A cell that does something (not empty, not a plain wire). */
export type Element = Exclude<Cell, null | { t: 'wire' }>;

export type Output =
  | { t: CoilKind; a: string }
  /** `pt`: preset time in seconds. */
  | { t: TimerKind; a: string; pt: number }
  /** `pv`: count at which the counter bit turns on. */
  | { t: 'ctu'; a: string; pv: number }
  /** Counts the same counter down; with a CTU on the same address it counts both ways. */
  | { t: 'ctd'; a: string; pv: number }
  | null;

export interface Rung {
  /** Rows of COLUMNS cells. Row 0 is the main line; the others are branches. */
  cells: Cell[][];
  /**
   * links[r][b]: rows r and r+1 are joined at boundary b, where boundary 0
   * is the left rail and boundary c is the right edge of column c-1.
   */
  links: boolean[][];
  /** What each row drives at its right end. */
  outputs: Output[];
}

export interface Program {
  rungs: Rung[];
  /** Names the user gave to addresses ("Start", "Tank level"). */
  names?: Record<string, string>;
}

const range = (prefix: string, count: number): string[] =>
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

export const ADDRESSES = {
  inputs: range('I', INPUTS),
  outputs: range('Q', OUTPUTS),
  markers: range('M', MARKERS),
  timers: range('T', TIMERS),
  counters: range('C', COUNTERS),
  analog: range('AI', ANALOG),
};

/** Addresses a contact may read, a coil may write, and a reset may clear. */
export const CONTACT_ADDRESSES = [
  ...ADDRESSES.inputs,
  ...ADDRESSES.outputs,
  ...ADDRESSES.markers,
  ...ADDRESSES.timers,
  ...ADDRESSES.counters,
];
export const COIL_ADDRESSES = [...ADDRESSES.outputs, ...ADDRESSES.markers];
export const RESET_ADDRESSES = [...COIL_ADDRESSES, ...ADDRESSES.counters];
/** Values a comparator can read: analog inputs, elapsed times (s) and counts. */
export const COMPARE_ADDRESSES = [...ADDRESSES.analog, ...ADDRESSES.timers, ...ADDRESSES.counters];

/** Memory key holding the number behind an address used in a comparator. */
export function valueKey(address: string): string {
  if (address.startsWith('T')) return `${address}:et`;
  if (address.startsWith('C')) return `${address}:cv`;
  return address;
}

export function compare(op: CompareOp, value: number, constant: number): boolean {
  switch (op) {
    case '>':
      return value > constant;
    case '>=':
      return value >= constant;
    case '<':
      return value < constant;
    case '<=':
      return value <= constant;
    case '=':
      return Math.abs(value - constant) < 1e-9;
    case '<>':
      return Math.abs(value - constant) >= 1e-9;
  }
}

export function addressesFor(kind: NonNullable<Cell | Output>['t']): string[] {
  switch (kind) {
    case 'no':
    case 'nc':
    case 'p':
    case 'n':
      return CONTACT_ADDRESSES;
    case 'cmp':
      return COMPARE_ADDRESSES;
    case 'coil':
    case 'set':
      return COIL_ADDRESSES;
    case 'reset':
      return RESET_ADDRESSES;
    case 'ton':
    case 'tof':
      return ADDRESSES.timers;
    case 'ctu':
    case 'ctd':
      return ADDRESSES.counters;
    default:
      return [];
  }
}

const emptyRow = (): Cell[] => Array.from({ length: COLUMNS }, () => null);
const noLinks = (): boolean[] => Array.from({ length: COLUMNS + 1 }, () => false);

export const emptyRung = (): Rung => ({ cells: [emptyRow()], links: [], outputs: [null] });

/** Adds a branch under the last row, joined to the left rail like most branches are. */
export function addRow(rung: Rung): Rung {
  if (rung.cells.length >= MAX_ROWS) return rung;
  const links = noLinks();
  links[0] = true;
  return {
    cells: [...rung.cells, emptyRow()],
    links: [...rung.links, links],
    outputs: [...rung.outputs, null],
  };
}

export function removeRow(rung: Rung): Rung {
  if (rung.cells.length <= 1) return rung;
  return {
    cells: rung.cells.slice(0, -1),
    links: rung.links.slice(0, -1),
    outputs: rung.outputs.slice(0, -1),
  };
}

/**
 * Draws the wires a rung obviously needs: from the start of each row to
 * its first element, between elements, and on to the output if it has one.
 */
export function tidy(rung: Rung): Rung {
  const cells = rung.cells.map((row, r) => {
    const used = row.map((cell, index) => (cell && cell.t !== 'wire' ? index : -1)).filter((index) => index >= 0);
    const hasOutput = rung.outputs[r] != null;
    const fromRail = r === 0 || rung.links[r - 1]?.[0] === true;
    if (used.length === 0 && !hasOutput) return row;
    // A branch that starts further right begins at its first link from above.
    const firstLink = r === 0 ? 0 : (rung.links[r - 1]?.findIndex(Boolean) ?? -1);
    const first = used[0] ?? COLUMNS;
    const start = fromRail ? 0 : firstLink >= 0 ? Math.min(firstLink, first) : first;
    const end = hasOutput ? COLUMNS - 1 : (used[used.length - 1] ?? -1);
    return row.map((cell, index) => (cell === null && index >= start && index <= end ? { t: 'wire' as const } : cell));
  });
  return { ...rung, cells };
}

/** The example every new PLC starts with: start (I1) and stop (I2) with self-holding of Q1. */
export function defaultProgram(): Program {
  const rung = addRow(emptyRung());
  rung.cells[0]![0] = { t: 'no', a: 'I1' };
  rung.cells[0]![1] = { t: 'nc', a: 'I2' };
  rung.cells[1]![0] = { t: 'no', a: 'Q1' };
  rung.links[0]![1] = true;
  rung.outputs[0] = { t: 'coil', a: 'Q1' };
  return { rungs: [tidy(rung)] };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function readCell(value: unknown): Cell {
  if (!isRecord(value)) return null;
  if (value.t === 'wire') return { t: 'wire' };
  const { t, a } = value;
  if ((t === 'no' || t === 'nc' || t === 'p' || t === 'n') && typeof a === 'string' && CONTACT_ADDRESSES.includes(a)) {
    return { t, a };
  }
  if (
    t === 'cmp' &&
    typeof a === 'string' &&
    COMPARE_ADDRESSES.includes(a) &&
    COMPARE_OPS.includes(value.op as CompareOp) &&
    typeof value.k === 'number' &&
    Number.isFinite(value.k)
  ) {
    return { t, a, op: value.op as CompareOp, k: Math.max(-99999, Math.min(99999, value.k)) };
  }
  return null;
}

function readOutput(value: unknown): Output {
  if (!isRecord(value) || typeof value.t !== 'string' || typeof value.a !== 'string') return null;
  const { t, a } = value;
  const number = (key: string, fallback: number, max: number): number => {
    const raw = value[key];
    return typeof raw === 'number' && Number.isFinite(raw) ? Math.min(max, Math.max(0, raw)) : fallback;
  };
  if ((t === 'coil' || t === 'set') && COIL_ADDRESSES.includes(a)) return { t, a };
  if (t === 'reset' && RESET_ADDRESSES.includes(a)) return { t, a };
  if ((t === 'ton' || t === 'tof') && ADDRESSES.timers.includes(a)) return { t, a, pt: number('pt', 1, 3600) };
  if ((t === 'ctu' || t === 'ctd') && ADDRESSES.counters.includes(a)) {
    return { t, a, pv: Math.round(number('pv', 1, 9999)) };
  }
  return null;
}

/** Reads a stored program, dropping anything that is not valid. Never throws. */
export function parseProgram(text: string): Program {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { rungs: [] };
  }
  if (!isRecord(data) || !Array.isArray(data.rungs)) return { rungs: [] };
  const named = new Set([...CONTACT_ADDRESSES, ...ADDRESSES.analog]);
  const names: Record<string, string> = {};
  if (isRecord(data.names)) {
    for (const [address, name] of Object.entries(data.names)) {
      if (named.has(address) && typeof name === 'string' && name.trim()) {
        names[address] = name.trim().slice(0, NAME_LENGTH);
      }
    }
  }
  const rungs = data.rungs.slice(0, MAX_RUNGS).map((raw: unknown): Rung => {
    const source = isRecord(raw) ? raw : {};
    const rawCells = Array.isArray(source.cells) ? source.cells.slice(0, MAX_ROWS) : [];
    const rows = Math.max(1, rawCells.length);
    const rawLinks = Array.isArray(source.links) ? source.links : [];
    const rawOutputs = Array.isArray(source.outputs) ? source.outputs : [];
    return {
      cells: Array.from({ length: rows }, (_, r) => {
        const row: unknown = rawCells[r];
        return Array.from({ length: COLUMNS }, (_unused, c) => readCell(Array.isArray(row) ? row[c] : null));
      }),
      links: Array.from({ length: rows - 1 }, (_, r) => {
        const row: unknown = rawLinks[r];
        return Array.from({ length: COLUMNS + 1 }, (_unused, b) => Array.isArray(row) && row[b] === true);
      }),
      outputs: Array.from({ length: rows }, (_, r) => readOutput(rawOutputs[r])),
    };
  });
  return Object.keys(names).length > 0 ? { rungs, names } : { rungs };
}

export const serializeProgram = (program: Program): string => JSON.stringify(program);

/**
 * Power flow of a rung. Result[r][b] tells whether boundary b of row r is
 * energized (see Rung.links for the numbering); the last boundary is what
 * the row's output receives. Power moves left to right and through links.
 */
export function flow(
  rung: Rung,
  conducts: (cell: Element, row: number, column: number) => boolean,
): boolean[][] {
  const rows = rung.cells.length;
  const power = Array.from({ length: rows }, () => Array.from({ length: COLUMNS + 1 }, () => false));
  for (let b = 0; b <= COLUMNS; b++) {
    for (let r = 0; r < rows; r++) {
      if (b === 0) {
        power[r]![0] = r === 0;
        continue;
      }
      const cell = rung.cells[r]?.[b - 1] ?? null;
      const closed = cell === null ? false : cell.t === 'wire' ? true : conducts(cell, r, b - 1);
      power[r]![b] = closed && power[r]![b - 1] === true;
    }
    // Rows joined at this boundary share their power.
    let r = 0;
    while (r < rows) {
      let last = r;
      while (last < rows - 1 && rung.links[last]?.[b] === true) last += 1;
      if (last > r) {
        let any = false;
        for (let k = r; k <= last; k++) any = any || power[k]![b] === true;
        for (let k = r; k <= last; k++) power[k]![b] = any;
      }
      r = last + 1;
    }
  }
  return power;
}

/**
 * How contacts conduct given bits and values, for showing a running program.
 * Edge contacts only pass power for one scan, too short to show: they read as open.
 */
export function liveTest(
  bit: (address: string) => boolean,
  value: (address: string) => number = () => 0,
): (cell: Element) => boolean {
  return (cell) => {
    if (cell.t === 'cmp') return compare(cell.op, value(cell.a), cell.k);
    if (cell.t === 'p' || cell.t === 'n') return false;
    return bit(cell.a) === (cell.t === 'no');
  };
}

/** Memory of the PLC: bits by address, plus timer and counter values under "<address>:<name>". */
export type Memory = Record<string, number>;

/** Runs the whole program once. Later rungs see what earlier ones wrote. */
export function scan(program: Program, memory: Memory, dt: number): void {
  program.rungs.forEach((rung, index) => {
    const power = flow(rung, (cell, r, c) => {
      if (cell.t === 'cmp') return compare(cell.op, memory[valueKey(cell.a)] ?? 0, cell.k);
      const on = memory[cell.a] === 1;
      if (cell.t === 'p' || cell.t === 'n') {
        // Each edge contact remembers the bit it saw on the previous scan.
        const key = `#edge:${index}:${r}:${c}`;
        const before = memory[key] === 1;
        memory[key] = on ? 1 : 0;
        return cell.t === 'p' ? on && !before : !on && before;
      }
      return on === (cell.t === 'no');
    });
    rung.outputs.forEach((output, r) => {
      if (!output) return;
      const on = power[r]?.[COLUMNS] === true;
      const { a } = output;
      switch (output.t) {
        case 'coil':
          memory[a] = on ? 1 : 0;
          break;
        case 'set':
          if (on) memory[a] = 1;
          break;
        case 'reset':
          if (on) {
            memory[a] = 0;
            memory[`${a}:cv`] = 0;
          }
          break;
        case 'ton': {
          const elapsed = on ? Math.min(output.pt, (memory[`${a}:et`] ?? 0) + dt) : 0;
          memory[`${a}:et`] = elapsed;
          memory[a] = on && elapsed >= output.pt ? 1 : 0;
          break;
        }
        case 'tof':
          if (on) {
            memory[a] = 1;
            memory[`${a}:et`] = 0;
          } else if (memory[a] === 1) {
            const elapsed = (memory[`${a}:et`] ?? 0) + dt;
            memory[`${a}:et`] = elapsed;
            if (elapsed >= output.pt) memory[a] = 0;
          }
          break;
        case 'ctu': {
          // Counts each time the row goes from off to on.
          if (on && memory[`${a}:in`] !== 1) memory[`${a}:cv`] = (memory[`${a}:cv`] ?? 0) + 1;
          memory[`${a}:in`] = on ? 1 : 0;
          memory[a] = (memory[`${a}:cv`] ?? 0) >= output.pv ? 1 : 0;
          break;
        }
        case 'ctd': {
          if (on && memory[`${a}:dn`] !== 1) memory[`${a}:cv`] = Math.max(0, (memory[`${a}:cv`] ?? 0) - 1);
          memory[`${a}:dn`] = on ? 1 : 0;
          memory[a] = (memory[`${a}:cv`] ?? 0) >= output.pv ? 1 : 0;
          break;
        }
      }
    });
  });
}

const cache = new Map<string, Program>();

/** Parsed program for a stored text, remembered so it is not parsed on every scan. */
export function programOf(text: string): Program {
  let program = cache.get(text);
  if (!program) {
    if (cache.size > 32) cache.clear();
    program = parseProgram(text);
    cache.set(text, program);
  }
  return program;
}
