/**
 * Turns an Arduino sketch (.ino) into compilable C++, like the Arduino IDE:
 * adds the Arduino.h include and forward declarations for the sketch's
 * functions, keeping line numbers pointing at the original sketch.
 */

export const SKETCH_FILE = 'sketch.ino';

const NOT_A_TYPE =
  /\b(?:class|struct|enum|union|namespace|typedef|template|operator|return|else|new|delete|using|case|goto|throw|do|extern)\b|[=;{}()]/;
const CONTROL = new Set(['if', 'while', 'for', 'switch', 'catch', 'sizeof', 'defined']);

/**
 * Same text with comments, string/char literals and preprocessor lines
 * blanked out (length and line breaks preserved).
 */
export function maskCode(source: string): string {
  const out = source.split('');
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  let lineStart = true;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (c === '\n') {
      lineStart = true;
      i += 1;
    } else if (c === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? source.length : end;
      blank(i, stop);
      i = stop;
    } else if (c === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(i, stop);
      i = stop;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < source.length && source[j] !== c && source[j] !== '\n') {
        j += source[j] === '\\' ? 2 : 1;
      }
      const stop = Math.min(source.length, j + 1);
      blank(i + 1, stop - 1);
      i = stop;
      lineStart = false;
    } else if (c === '#' && lineStart) {
      // Preprocessor directive, including backslash continuations.
      let j = i;
      for (;;) {
        const end = source.indexOf('\n', j);
        if (end === -1) {
          j = source.length;
          break;
        }
        j = end;
        if (source[end - 1] === '\\' || (source[end - 1] === '\r' && source[end - 2] === '\\')) {
          j = end + 1;
        } else {
          break;
        }
      }
      blank(i, j);
      i = j;
    } else {
      if (c !== ' ' && c !== '\t' && c !== '\r') lineStart = false;
      i += 1;
    }
  }
  return out.join('');
}

export interface SketchFunction {
  prototype: string;
  /** Offset in the source where the definition starts. */
  start: number;
}

/** Top-level function definitions of the sketch. */
export function findFunctions(source: string): SketchFunction[] {
  const masked = maskCode(source);
  const functions: SketchFunction[] = [];
  const pattern =
    /((?:[A-Za-z_][\w<>,]*[\s*&]+)+)([A-Za-z_]\w*)\s*\(([^()]*(?:\([^()]*\)[^()]*)*)\)\s*\{/g;
  // Brace depth before each character, to keep only top-level definitions.
  const depth = new Int32Array(masked.length + 1);
  let level = 0;
  for (let i = 0; i < masked.length; i++) {
    depth[i] = level;
    if (masked[i] === '{') level += 1;
    else if (masked[i] === '}') level = Math.max(0, level - 1);
  }

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(masked)) !== null) {
    const type = match[1] ?? '';
    const name = match[2] ?? '';
    const params = match[3] ?? '';
    if (depth[match.index] !== 0 || CONTROL.has(name) || NOT_A_TYPE.test(type)) continue;
    // Must begin a statement: only whitespace since the previous ; or }.
    const before = masked.slice(0, match.index).trimEnd();
    const last = before[before.length - 1];
    if (last !== undefined && last !== ';' && last !== '}') continue;
    // Default arguments may only appear once, so those keep their own definition.
    if (params.includes('=')) continue;
    const cleanType = type.replace(/\s+/g, ' ').trim();
    const cleanParams = source
      .slice(match.index + match[0].indexOf('(') + 1, match.index + match[0].lastIndexOf(')'))
      .replace(/\s+/g, ' ')
      .trim();
    functions.push({ prototype: `${cleanType} ${name}(${cleanParams});`, start: match.index });
  }
  return functions;
}

/** Headers named in #include lines (<Servo.h> or "Servo.h" -> "Servo.h"). */
export function findIncludes(source: string): string[] {
  const includes = new Set<string>();
  const pattern = /^[ \t]*#[ \t]*include[ \t]*[<"]([^>"\n]+)[>"]/gm;
  // Comments are blanked first so commented-out includes do not count.
  const text = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/\/\/.*$/gm, '');
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[1]) includes.add(match[1]);
  }
  return [...includes];
}

/** C++ translation unit for a sketch. Compiler messages refer to SKETCH_FILE lines. */
export function sketchToCpp(source: string): string {
  const functions = findFunctions(source);
  const header = `#include <Arduino.h>\n#line 1 "${SKETCH_FILE}"\n`;
  const first = functions[0];
  if (!first) return header + source;

  // Insert the prototypes on the line where the first function starts.
  const insertAt = source.lastIndexOf('\n', first.start - 1) + 1;
  const line = source.slice(0, insertAt).split('\n').length;
  return (
    header +
    source.slice(0, insertAt) +
    functions.map((fn) => fn.prototype).join('\n') +
    `\n#line ${line} "${SKETCH_FILE}"\n` +
    source.slice(insertAt)
  );
}
