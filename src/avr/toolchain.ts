import { unpack } from './pack';
import { SKETCH_FILE, findIncludes, sketchToCpp } from './sketch';

/**
 * Drives the WebAssembly AVR toolchain: sketch -> C++ -> assembly -> object
 * -> ELF -> Intel HEX. Independent of where it runs: the host supplies file
 * access, so the same code works in a Web Worker and in Node (tests).
 */

export type ChipId = 'atmega328p' | 'atmega2560';

export interface BoardTarget {
  id: string;
  /** Preprocessor define that identifies the board (ARDUINO_AVR_UNO). */
  define: string;
  /** Flash available to the sketch, in bytes. */
  maxFlash: number;
  chip: ChipId;
}

/** How code for each microcontroller is compiled and linked. */
interface Chip {
  /** Pack with its startup code, C libraries and prebuilt objects. */
  runtime: string;
  /** avr-libc's name for the chip and its architecture. */
  device: string;
  deviceDefine: string;
  arch: string;
  /** 64 KB flash segments, for the compiler. */
  flashSegments: number;
  /** ARDUINO version define of the core the chip uses. */
  arduino: string;
  /** Address where SRAM starts (after the I/O registers). */
  dataStart: string;
  libs: string[];
}

const CHIPS: Record<ChipId, Chip> = {
  atmega328p: {
    runtime: 'runtime-atmega328p.json',
    device: 'atmega328p',
    deviceDefine: '__AVR_ATmega328P__',
    arch: 'avr5',
    flashSegments: 1,
    arduino: '10819',
    dataStart: '0x800100',
    libs: ['-lm', '-lc', '-lgcc'],
  },
  atmega2560: {
    runtime: 'runtime-atmega2560.json',
    device: 'atmega2560',
    deviceDefine: '__AVR_ATmega2560__',
    arch: 'avr6',
    flashSegments: 4,
    arduino: '10609',
    dataStart: '0x800200',
    libs: ['-lm', '-lc', '-latmega2560', '-lgcc'],
  },
};

export const BOARD_TARGETS: Record<string, BoardTarget> = {
  uno: { id: 'uno', define: 'ARDUINO_AVR_UNO', maxFlash: 32256, chip: 'atmega328p' },
  nano: { id: 'nano', define: 'ARDUINO_AVR_NANO', maxFlash: 30720, chip: 'atmega328p' },
  // 64 KB of the Mega's 256 KB: its runtime uses avr5 libgcc routines, which
  // are only right below that (see scripts/prepare-avr.mjs).
  mega: { id: 'mega', define: 'ARDUINO_AVR_MEGA2560', maxFlash: 65536, chip: 'atmega2560' },
};

export interface Diagnostic {
  severity: 'error' | 'warning';
  /** 1-based line in the sketch, or 0 when the message has no location. */
  line: number;
  column: number;
  message: string;
}

export interface CompileResult {
  ok: boolean;
  hex: string;
  flashBytes: number;
  maxFlash: number;
  diagnostics: Diagnostic[];
}

interface EmscriptenFS {
  mkdir(path: string): void;
  writeFile(path: string, data: Uint8Array | string): void;
  readFile(path: string): Uint8Array;
}

interface EmscriptenModule {
  FS: EmscriptenFS;
  /** Returns the exit code when the tool returns from main instead of calling exit(). */
  callMain(args: string[]): number | undefined;
}

export type ToolFactory = (options: Record<string, unknown>) => Promise<EmscriptenModule>;

export interface ToolchainHost {
  /** Reads a file of the avr/ directory (e.g. "sysroot.json"). */
  readFile(path: string): Promise<Uint8Array>;
  /** Loads the Emscripten module factory of a tool (e.g. "tools/cc1plus.mjs"). */
  importFactory(path: string): Promise<ToolFactory>;
}

interface ChipManifest {
  includeDirs: string[];
  coreObjects: string[];
  libraries: Record<string, { objects: string[]; requires: string[] }>;
  /** Headers of libraries this chip does not have. */
  unsupported: string[];
}

interface Manifest {
  targets: Record<ChipId, ChipManifest>;
}

type ToolName = 'cc1plus' | 'avr-as' | 'avr-ld' | 'avr-objcopy';

interface Tool {
  factory: ToolFactory;
  module: WebAssembly.Module;
}

interface Assets {
  manifest: Manifest;
  sysroot: Map<string, Uint8Array>;
}

function writeFiles(fs: EmscriptenFS, files: Iterable<[string, Uint8Array | string]>): void {
  const made = new Set<string>(['']);
  for (const [path, data] of files) {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    let dir = '';
    for (const part of parts) {
      dir += `/${part}`;
      if (made.has(dir)) continue;
      made.add(dir);
      try {
        fs.mkdir(dir);
      } catch {
        // Directory already exists.
      }
    }
    fs.writeFile(path, data);
  }
}

const LOCATED = new RegExp(
  `^(?:.*[\\\\/])?${SKETCH_FILE.replace('.', '\\.')}:(\\d+):(?:(\\d+):)? (fatal error|error|warning): (.*)$`,
);
const UNLOCATED = /^(?:.*: )?(fatal error|error): (.*)$/;
const UNDEFINED_REFERENCE = /undefined reference to [`'](.+?)'/;

/** Extracts compiler and linker messages from the tools' stderr. */
export function parseDiagnostics(lines: readonly string[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const seen = new Set<string>();
  const add = (diagnostic: Diagnostic): void => {
    const key = `${diagnostic.line}:${diagnostic.column}:${diagnostic.message}`;
    if (seen.has(key)) return;
    seen.add(key);
    diagnostics.push(diagnostic);
  };
  for (const line of lines) {
    const located = LOCATED.exec(line);
    if (located) {
      add({
        severity: located[3] === 'warning' ? 'warning' : 'error',
        line: Number(located[1]),
        column: Number(located[2] ?? 1),
        message: located[4] ?? '',
      });
      continue;
    }
    const undefinedReference = UNDEFINED_REFERENCE.exec(line);
    if (undefinedReference) {
      add({
        severity: 'error',
        line: 0,
        column: 0,
        message: `undefined reference to '${undefinedReference[1]}'`,
      });
      continue;
    }
    const unlocated = UNLOCATED.exec(line);
    if (unlocated) add({ severity: 'error', line: 0, column: 0, message: unlocated[2] ?? '' });
  }
  return diagnostics;
}

function countHexBytes(hex: string): number {
  let total = 0;
  for (const line of hex.split(/\r?\n/)) {
    if (line.startsWith(':') && line.slice(7, 9) === '00') total += parseInt(line.slice(1, 3), 16);
  }
  return total;
}

export class Toolchain {
  private assets: Promise<Assets> | undefined;
  private readonly tools = new Map<ToolName, Promise<Tool>>();
  /** Runtime packs by chip, loaded the first time a board with that chip compiles. */
  private readonly runtimes = new Map<ChipId, Promise<Map<string, Uint8Array>>>();

  private loadRuntime(chip: ChipId): Promise<Map<string, Uint8Array>> {
    let runtime = this.runtimes.get(chip);
    if (!runtime) {
      runtime = this.host.readFile(CHIPS[chip].runtime).then(unpack);
      runtime.catch(() => this.runtimes.delete(chip));
      this.runtimes.set(chip, runtime);
    }
    return runtime;
  }

  constructor(private readonly host: ToolchainHost) {}

  private loadAssets(): Promise<Assets> {
    this.assets ??= (async () => {
      const [manifest, sysroot] = await Promise.all([
        this.host.readFile('manifest.json'),
        this.host.readFile('sysroot.json'),
      ]);
      return {
        manifest: JSON.parse(new TextDecoder().decode(manifest)) as Manifest,
        sysroot: unpack(sysroot),
      };
    })();
    // A failed download must not be cached forever.
    this.assets.catch(() => {
      this.assets = undefined;
    });
    return this.assets;
  }

  private loadTool(name: ToolName): Promise<Tool> {
    let tool = this.tools.get(name);
    if (!tool) {
      tool = (async () => {
        const [factory, binary] = await Promise.all([
          this.host.importFactory(`tools/${name}.mjs`),
          this.host.readFile(`tools/${name}.wasm`),
        ]);
        // Compiled once; every run instantiates it again with fresh memory.
        return { factory, module: await WebAssembly.compile(binary as BufferSource) };
      })();
      tool.catch(() => this.tools.delete(name));
      this.tools.set(name, tool);
    }
    return tool;
  }

  /** Downloads and compiles everything, so the first build does not wait for it. */
  async warmUp(): Promise<void> {
    await Promise.all([
      this.loadAssets(),
      ...(['cc1plus', 'avr-as', 'avr-ld', 'avr-objcopy'] as const).map((name) => this.loadTool(name)),
    ]);
  }

  /** Runs one tool. Returns the output file, or null when the tool failed. */
  private async run(
    name: ToolName,
    args: string[],
    files: Iterable<[string, Uint8Array | string]>,
    outputPath: string,
    log: string[],
  ): Promise<Uint8Array | null> {
    const tool = await this.loadTool(name);
    const mod = await tool.factory({
      noInitialRun: true,
      print() {},
      printErr: (line: string) => {
        if (line) log.push(line);
      },
      instantiateWasm: (
        imports: WebAssembly.Imports,
        receive: (instance: WebAssembly.Instance, module: WebAssembly.Module) => void,
      ) => {
        void WebAssembly.instantiate(tool.module, imports).then((instance) =>
          receive(instance, tool.module),
        );
        return {};
      },
      // Keep the tool from ending the host process (Node) when it exits.
      quit: (_status: number, toThrow: unknown) => {
        throw toThrow;
      },
    });
    writeFiles(mod.FS, files);
    try {
      if ((mod.callMain(args) ?? 0) !== 0) return null;
    } catch (error) {
      const status = (error as { status?: number } | null)?.status;
      if (status !== 0) {
        if (status === undefined) log.push(`${name}: ${String(error)}`);
        return null;
      }
    }
    try {
      return mod.FS.readFile(outputPath);
    } catch {
      return null;
    }
  }

  /** Compiles an Arduino sketch for the given board. Never throws for sketch errors. */
  async compile(source: string, board: BoardTarget): Promise<CompileResult> {
    const chip = CHIPS[board.chip];
    const [{ manifest: allTargets, sysroot }, runtime] = await Promise.all([
      this.loadAssets(),
      this.loadRuntime(board.chip),
    ]);
    const manifest = allTargets.targets[board.chip];
    const log: string[] = [];
    const failure = (): CompileResult => {
      const diagnostics = parseDiagnostics(log);
      if (!diagnostics.some((d) => d.severity === 'error')) {
        diagnostics.push({
          severity: 'error',
          line: 0,
          column: 0,
          message: log.slice(-5).join('\n') || 'Compilation failed',
        });
      }
      return { ok: false, hex: '', flashBytes: 0, maxFlash: board.maxFlash, diagnostics };
    };

    const missing = findIncludes(source).find((header) => manifest.unsupported.includes(header));
    if (missing) {
      return {
        ok: false,
        hex: '',
        flashBytes: 0,
        maxFlash: board.maxFlash,
        diagnostics: [
          {
            severity: 'error',
            line: 0,
            column: 0,
            message: `${missing} is not available for this board yet (only for the Uno and Nano)`,
          },
        ],
      };
    }

    const assembly = await this.run(
      'cc1plus',
      [
        '-quiet',
        '-imultilib', chip.arch,
        `-D${chip.deviceDefine}`,
        `-D__AVR_DEVICE_NAME__=${chip.device}`,
        '-DF_CPU=16000000L',
        `-DARDUINO=${chip.arduino}`,
        `-D${board.define}`,
        '-DARDUINO_ARCH_AVR',
        '-isystem', '/sysroot/gcc/include',
        '-isystem', '/sysroot/avr/include',
        ...manifest.includeDirs.flatMap((dir) => ['-I', dir]),
        '/build/sketch.cpp',
        `-mn-flash=${chip.flashSegments}`,
        '-mno-skip-bug',
        `-mmcu=${chip.arch}`,
        '-Os',
        '-std=gnu++11',
        '-fpermissive',
        '-fno-exceptions',
        '-fno-threadsafe-statics',
        '-fno-rtti',
        '-ffunction-sections',
        '-fdata-sections',
        '-fno-diagnostics-show-caret',
        '-o', '/build/sketch.s',
      ],
      [...sysroot, ['/build/sketch.cpp', sketchToCpp(source)]],
      '/build/sketch.s',
      log,
    );
    if (!assembly) return failure();

    const object = await this.run(
      'avr-as',
      [`-mmcu=${chip.device}`, '-o', '/build/sketch.o', '/build/sketch.s'],
      [['/build/sketch.s', assembly]],
      '/build/sketch.o',
      log,
    );
    if (!object) return failure();

    // Link only the libraries the sketch includes (and the ones those need).
    const objects = new Set<string>(manifest.coreObjects);
    const pending = findIncludes(source);
    const visited = new Set<string>();
    while (pending.length > 0) {
      const header = pending.pop() as string;
      const library = manifest.libraries[header];
      if (!library || visited.has(header)) continue;
      visited.add(header);
      for (const path of library.objects) objects.add(path);
      pending.push(...library.requires);
    }

    const elf = await this.run(
      'avr-ld',
      [
        '-m', chip.arch,
        // SRAM starts after the I/O registers (0x100 on the ATmega328P, 0x200 on the ATmega2560).
        `-Tdata=${chip.dataStart}`,
        '--gc-sections',
        '-o', '/build/sketch.elf',
        `/libs/crt${chip.device}.o`,
        '/build/sketch.o',
        ...objects,
        '-L/libs',
        ...chip.libs,
      ],
      [...runtime, ['/build/sketch.o', object]],
      '/build/sketch.elf',
      log,
    );
    if (!elf) return failure();

    const hexBytes = await this.run(
      'avr-objcopy',
      ['-O', 'ihex', '-R', '.eeprom', '/build/sketch.elf', '/build/sketch.hex'],
      [['/build/sketch.elf', elf]],
      '/build/sketch.hex',
      log,
    );
    if (!hexBytes) return failure();

    const hex = new TextDecoder().decode(hexBytes);
    const flashBytes = countHexBytes(hex);
    const diagnostics = parseDiagnostics(log);
    if (flashBytes > board.maxFlash) {
      diagnostics.push({
        severity: 'error',
        line: 0,
        column: 0,
        message: `Sketch too big: ${flashBytes} bytes, the limit for this board in OpenCircuit is ${board.maxFlash}`,
      });
      return { ok: false, hex: '', flashBytes, maxFlash: board.maxFlash, diagnostics };
    }
    return { ok: true, hex, flashBytes, maxFlash: board.maxFlash, diagnostics };
  }
}
