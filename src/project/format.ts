import { getPartDef, normalizeProps } from '../catalog/registry';
import { MAX_LABEL_LENGTH } from '../editor/model/ops';
import {
  DEFAULT_WIRE_COLOR,
  type CircuitDoc,
  type Part,
  type PinRef,
  type Point,
  type Rotation,
  type Wire,
} from '../editor/model/types';

/** `.ocircuit` project files: versioned JSON validated on every load. */

export const FILE_FORMAT = 'opencircuit';
export const FILE_VERSION = 1;
export const FILE_EXTENSION = '.ocircuit';
export const MAX_NAME_LENGTH = 80;
const MAX_WIRE_POINTS = 500;

export interface ProjectFile {
  format: typeof FILE_FORMAT;
  version: number;
  name: string;
  doc: CircuitDoc;
}

export type ProjectErrorCode =
  | 'invalid-json'
  | 'not-a-project'
  | 'newer-version'
  | 'corrupt'
  | 'unknown-part';

export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  readonly detail: string;

  constructor(code: ProjectErrorCode, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'ProjectError';
    this.code = code;
    this.detail = detail;
  }
}

type RawRecord = Record<string, unknown>;
type Migration = (data: RawRecord) => RawRecord;

/**
 * MIGRATIONS[n] upgrades project data from version n to n + 1.
 * When the format changes: bump FILE_VERSION and add the step here.
 */
const MIGRATIONS: Record<number, Migration> = {};

const isRecord = (value: unknown): value is RawRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const corrupt = (detail: string): ProjectError => new ProjectError('corrupt', detail);

function readPoint(raw: unknown, where: string): Point {
  if (!isRecord(raw) || !isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) {
    throw corrupt(`${where}: invalid point`);
  }
  return { x: raw.x, y: raw.y };
}

function readPart(raw: unknown, seen: Set<string>): Part {
  if (!isRecord(raw)) throw corrupt('part is not an object');
  const { id, type } = raw;
  if (typeof id !== 'string' || id === '') throw corrupt('part without id');
  if (seen.has(id)) throw corrupt(`duplicate id ${id}`);
  if (typeof type !== 'string') throw corrupt(`part ${id}: missing type`);
  const def = getPartDef(type);
  if (!def) throw new ProjectError('unknown-part', type);
  const { x, y } = readPoint(raw, `part ${id}`);
  const rotation = raw.rotation;
  if (rotation !== 0 && rotation !== 90 && rotation !== 180 && rotation !== 270) {
    throw corrupt(`part ${id}: invalid rotation`);
  }
  seen.add(id);
  return {
    id,
    type,
    x,
    y,
    rotation: rotation as Rotation,
    flipped: raw.flipped === true,
    label: typeof raw.label === 'string' ? raw.label.slice(0, MAX_LABEL_LENGTH) : '',
    props: normalizeProps(def, raw.props),
  };
}

function readPinRef(raw: unknown, parts: Map<string, Part>): PinRef | null {
  if (!isRecord(raw) || typeof raw.partId !== 'string' || typeof raw.pinId !== 'string') {
    return null;
  }
  const part = parts.get(raw.partId);
  const pinId = raw.pinId;
  if (!part || !getPartDef(part.type)?.pins.some((pin) => pin.id === pinId)) return null;
  return { partId: raw.partId, pinId };
}

/** Validates untrusted data into a document. Wires to missing pins are dropped. */
export function validateDoc(raw: unknown): CircuitDoc {
  if (!isRecord(raw) || !Array.isArray(raw.parts) || !Array.isArray(raw.wires)) {
    throw corrupt('missing parts or wires');
  }
  const seen = new Set<string>();
  const parts = raw.parts.map((item) => readPart(item, seen));
  const byId = new Map(parts.map((part) => [part.id, part]));

  const wires: Wire[] = [];
  for (const item of raw.wires as unknown[]) {
    if (!isRecord(item)) throw corrupt('wire is not an object');
    const id = item.id;
    if (typeof id !== 'string' || id === '') throw corrupt('wire without id');
    if (seen.has(id)) throw corrupt(`duplicate id ${id}`);
    const from = readPinRef(item.from, byId);
    const to = readPinRef(item.to, byId);
    if (!from || !to || (from.partId === to.partId && from.pinId === to.pinId)) continue;
    const rawPoints = Array.isArray(item.points) ? item.points : [];
    if (rawPoints.length > MAX_WIRE_POINTS) throw corrupt(`wire ${id}: too many points`);
    seen.add(id);
    wires.push({
      id,
      from,
      to,
      points: rawPoints.map((point) => readPoint(point, `wire ${id}`)),
      color:
        typeof item.color === 'string' && /^#[0-9a-f]{6}$/i.test(item.color)
          ? item.color.toLowerCase()
          : DEFAULT_WIRE_COLOR,
    });
  }
  return { parts, wires };
}

/** Validates (and migrates, when needed) already-parsed project data. */
export function readProjectData(raw: unknown): ProjectFile {
  if (!isRecord(raw) || raw.format !== FILE_FORMAT) throw new ProjectError('not-a-project');
  const version = raw.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw corrupt('invalid version');
  }
  if (version > FILE_VERSION) throw new ProjectError('newer-version', String(version));

  let data: RawRecord = raw;
  for (let v = version; v < FILE_VERSION; v++) {
    const migrate = MIGRATIONS[v];
    if (!migrate) throw corrupt(`no migration from version ${v}`);
    data = migrate(data);
  }

  return {
    format: FILE_FORMAT,
    version: FILE_VERSION,
    name: typeof data.name === 'string' ? data.name.trim().slice(0, MAX_NAME_LENGTH) : '',
    doc: validateDoc(data.doc),
  };
}

export function parseProject(text: string): ProjectFile {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProjectError('invalid-json');
  }
  return readProjectData(raw);
}

export function createProjectFile(name: string, doc: CircuitDoc): ProjectFile {
  return { format: FILE_FORMAT, version: FILE_VERSION, name, doc };
}

export function serializeProject(name: string, doc: CircuitDoc): string {
  return JSON.stringify(createProjectFile(name, doc), null, 2);
}

/** Safe file name for an exported project. */
export function projectFileName(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[^\w\- ]+/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
  return (base || 'project') + FILE_EXTENSION;
}
