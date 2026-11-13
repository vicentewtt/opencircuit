import { describe, expect, it } from 'vitest';
import { addPart, addWire } from '../editor/model/ops';
import { DEFAULT_WIRE_COLOR, EMPTY_DOC, type CircuitDoc } from '../editor/model/types';
import {
  FILE_VERSION,
  ProjectError,
  parseProject,
  projectFileName,
  readProjectData,
  serializeProject,
} from './format';

function sample(): CircuitDoc {
  let doc = addPart(EMPTY_DOC, 'resistor', { x: 100, y: 100 }).doc;
  doc = addPart(doc, 'led', { x: 200, y: 100 }).doc;
  const wired = addWire(
    doc,
    { partId: 'p1', pinId: '2' },
    { partId: 'p2', pinId: 'anode' },
    [{ x: 150, y: 140 }],
    '#d32f2f',
  );
  if (!wired) throw new Error('wire not created');
  return wired.doc;
}

function errorCode(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    if (error instanceof ProjectError) return error.code;
    throw error;
  }
  return 'no-error';
}

const fileWith = (doc: unknown, extra: Record<string, unknown> = {}): unknown => ({
  format: 'opencircuit',
  version: FILE_VERSION,
  name: 'Test',
  doc,
  ...extra,
});

describe('project file', () => {
  it('round-trips a document', () => {
    const doc = sample();
    const file = parseProject(serializeProject('My circuit', doc));
    expect(file.name).toBe('My circuit');
    expect(file.version).toBe(FILE_VERSION);
    expect(file.doc).toEqual(doc);
  });

  it('rejects text that is not JSON', () => {
    expect(errorCode(() => parseProject('not json'))).toBe('invalid-json');
  });

  it('rejects JSON that is not a project', () => {
    expect(errorCode(() => parseProject('{"hello":1}'))).toBe('not-a-project');
    expect(errorCode(() => parseProject('[]'))).toBe('not-a-project');
  });

  it('rejects files from a newer version', () => {
    const raw = fileWith(sample(), { version: FILE_VERSION + 1 });
    expect(errorCode(() => readProjectData(raw))).toBe('newer-version');
  });

  it('rejects invalid versions and structures', () => {
    expect(errorCode(() => readProjectData(fileWith(sample(), { version: 0 })))).toBe('corrupt');
    expect(errorCode(() => readProjectData(fileWith({ parts: [] })))).toBe('corrupt');
    expect(errorCode(() => readProjectData(fileWith(null)))).toBe('corrupt');
  });

  it('reports unknown part types', () => {
    const doc = sample();
    const raw = fileWith({ ...doc, parts: [{ ...doc.parts[0], type: 'warp-core' }] });
    expect(errorCode(() => readProjectData(raw))).toBe('unknown-part');
  });

  it('rejects duplicate ids and bad geometry', () => {
    const doc = sample();
    const duplicated = fileWith({ ...doc, parts: [doc.parts[0], doc.parts[0]] });
    expect(errorCode(() => readProjectData(duplicated))).toBe('corrupt');
    const badRotation = fileWith({ ...doc, parts: [{ ...doc.parts[0], rotation: 45 }] });
    expect(errorCode(() => readProjectData(badRotation))).toBe('corrupt');
    const badPosition = fileWith({ ...doc, parts: [{ ...doc.parts[0], x: 'left' }] });
    expect(errorCode(() => readProjectData(badPosition))).toBe('corrupt');
  });

  it('drops wires that point to missing parts or pins', () => {
    const doc = sample();
    const dangling = fileWith({
      parts: [doc.parts[0]],
      wires: doc.wires,
    });
    expect(readProjectData(dangling).doc.wires).toEqual([]);

    const badPin = fileWith({
      ...doc,
      wires: [{ ...doc.wires[0], to: { partId: 'p2', pinId: 'gate' } }],
    });
    expect(readProjectData(badPin).doc.wires).toEqual([]);
  });

  it('sanitizes props, labels and colors', () => {
    const doc = sample();
    const raw = fileWith({
      parts: [
        { ...doc.parts[0], props: { resistance: 1e30, hack: '<script>' }, label: 42 },
        { ...doc.parts[1], props: { color: '"><svg onload=alert(1)>' } },
      ],
      wires: [{ ...doc.wires[0], color: 'url(javascript:alert(1))' }],
    });
    const clean = readProjectData(raw).doc;
    expect(clean.parts[0]?.props).toEqual({ resistance: 1e9, power: 0.25 });
    expect(clean.parts[0]?.label).toBe('');
    expect(clean.parts[1]?.props).toEqual({ color: 'red' });
    expect(clean.wires[0]?.color).toBe(DEFAULT_WIRE_COLOR);
  });
});

describe('projectFileName', () => {
  it('builds a safe file name', () => {
    expect(projectFileName('Semáforo con Arduino')).toBe('Semaforo-con-Arduino.ocircuit');
    expect(projectFileName('../../etc/passwd')).toBe('etcpasswd.ocircuit');
    expect(projectFileName('   ')).toBe('project.ocircuit');
  });
});
