// Builds public/avr/: the in-browser AVR toolchain and everything it needs.
//
// Inputs:
//   - node_modules/@horang-corp/avr-gcc-wasm: AVR GCC 7.3 + binutils compiled to
//     WebAssembly (GPL v3), avr-libc, Arduino core headers and prebuilt objects.
//   - vendor/arduino-libraries: sources of extra Arduino libraries.
// Outputs (served as static files, never bundled into the app's JS):
//   - tools/*.{mjs,wasm}        the compiler, assembler, linker and objcopy
//   - sysroot.json              headers, packed into one file
//   - runtime-atmega328p.json   startup code, libc/libgcc, core and library objects (Uno, Nano)
//   - runtime-atmega2560.json   the same for the Mega, compiled here from source
//   - manifest.json             per chip: include paths and the header -> objects table
//
// The Mega runtime comes from:
//   - vendor/avr6: avr-libc 2.0.0 for the ATmega2560 and its linker script
//     (from the GCC 7.3 toolchain in the "quirkbot-avr-gcc" npm package)
//   - vendor/arduino-core-avr: Arduino AVR core 1.6.9 and the Mega pin map (LGPL 2.1)
//   - vendor/opencircuit-mega: OpenCircuit's own Servo and DHT libraries
//
// Runs automatically before `npm run dev` and `npm run build`.

import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PKG = join(ROOT, 'node_modules/@horang-corp/avr-gcc-wasm');
const VENDOR = join(ROOT, 'vendor/arduino-libraries');
const OUT = join(ROOT, 'public/avr');
const AVR6 = join(ROOT, 'vendor/avr6');
const CORE = join(ROOT, 'vendor/arduino-core-avr');
const MEGA_LIBRARIES = join(ROOT, 'vendor/opencircuit-mega');
const TOOLS = ['cc1plus', 'avr-as', 'avr-ld', 'avr-objcopy'];

/** Extra libraries compiled here from source: name -> C++ files. */
const VENDOR_LIBRARIES = {
  LiquidCrystal: ['LiquidCrystal.cpp'],
  LiquidCrystal_I2C: ['LiquidCrystal_I2C.cpp'],
  Adafruit_NeoPixel: ['Adafruit_NeoPixel.cpp'],
  Keypad: ['Keypad.cpp', 'Key.cpp'],
  Stepper: ['Stepper.cpp'],
};

/** Which objects to link when a sketch includes a header. */
const LIBRARIES = {
  'Servo.h': { objects: ['lib_Servo.o'], requires: [] },
  'Wire.h': { objects: ['lib_Wire.o', 'lib_twi.o'], requires: [] },
  'SPI.h': { objects: ['lib_SPI.o'], requires: [] },
  'DHT.h': { objects: ['lib_DHT.o'], requires: [] },
  'Adafruit_GFX.h': { objects: ['lib_GFX.o'], requires: [] },
  'Adafruit_SSD1306.h': {
    objects: ['lib_SSD1306.o', 'lib_GFX.o', 'lib_I2CDevice.o', 'lib_SPIDevice.o', 'lib_BusIO_Register.o'],
    requires: ['Wire.h', 'SPI.h'],
  },
  'LiquidCrystal.h': { objects: ['lib_LiquidCrystal.o'], requires: [] },
  'LiquidCrystal_I2C.h': { objects: ['lib_LiquidCrystal_I2C.o'], requires: ['Wire.h'] },
  'Adafruit_NeoPixel.h': { objects: ['lib_Adafruit_NeoPixel.o'], requires: [] },
  'Keypad.h': { objects: ['lib_Keypad.o', 'lib_Key.o'], requires: [] },
  'Stepper.h': { objects: ['lib_Stepper.o'], requires: [] },
};

const DROPPED_HEADER_DIRS = [
  '/libraries/Firmata',
  '/libraries/Adafruit_BMP085_Library',
  '/libraries/VL53L0X',
  '/libraries/Adafruit_GFX_Library/Fonts',
];
const DROPPED_OBJECTS = /^lib_(Firmata|FirmataMarshaller|FirmataParser|BMP085|VL53L0X)\.o$/;
/** avr-libc ships one I/O header per chip (30 MB); only these are needed. */
const KEPT_IO_HEADERS = new Set(['io.h', 'iom328p.h', 'iom328.h', 'iomx8.h', 'iom2560.h', 'iomxx0_1.h']);

export const INCLUDE_DIRS = [
  '/arduino/core',
  '/arduino/variant',
  '/arduino/libraries/Wire/src',
  '/arduino/libraries/Wire/src/utility',
  '/arduino/libraries/SPI/src',
  '/libraries/Servo/src',
  '/libraries/DHT_sensor_library',
  '/libraries/Adafruit_GFX_Library',
  '/libraries/Adafruit_SSD1306',
  '/libraries/Adafruit_BusIO',
  '/libraries/Adafruit_Unified_Sensor',
  ...Object.keys(VENDOR_LIBRARIES).map((name) => `/libraries/${name}`),
];

/** Include paths of Mega sketches: its own core and libraries, plus the shared ones. */
export const MEGA_INCLUDE_DIRS = [
  '/mega/core',
  '/mega/variant',
  '/mega/libraries/Wire',
  '/mega/libraries/Wire/utility',
  '/mega/libraries/SPI',
  '/mega/libraries/SoftwareSerial',
  '/mega/libraries/EEPROM',
  '/mega/libraries/Servo',
  '/mega/libraries/DHT',
  ...Object.keys(VENDOR_LIBRARIES).map((name) => `/libraries/${name}`),
];

/** Mega sources compiled here: virtual source path -> object name. */
const MEGA_LIBRARY_SOURCES = {
  '/mega/libraries/Wire/Wire.cpp': 'lib_Wire.o',
  '/mega/libraries/Wire/utility/twi.c': 'lib_twi.o',
  '/mega/libraries/SPI/SPI.cpp': 'lib_SPI.o',
  '/mega/libraries/SoftwareSerial/SoftwareSerial.cpp': 'lib_SoftwareSerial.o',
  '/mega/libraries/Servo/Servo.cpp': 'lib_Servo.o',
  '/mega/libraries/DHT/DHT.cpp': 'lib_DHT.o',
};

const MEGA_LIBRARIES_TABLE = {
  'Servo.h': { objects: ['lib_Servo.o'], requires: [] },
  'Wire.h': { objects: ['lib_Wire.o', 'lib_twi.o'], requires: [] },
  'SPI.h': { objects: ['lib_SPI.o'], requires: [] },
  'SoftwareSerial.h': { objects: ['lib_SoftwareSerial.o'], requires: [] },
  'DHT.h': { objects: ['lib_DHT.o'], requires: [] },
  'LiquidCrystal.h': { objects: ['lib_LiquidCrystal.o'], requires: [] },
  'LiquidCrystal_I2C.h': { objects: ['lib_LiquidCrystal_I2C.o'], requires: ['Wire.h'] },
  'Adafruit_NeoPixel.h': { objects: ['lib_Adafruit_NeoPixel.o'], requires: [] },
  'Keypad.h': { objects: ['lib_Keypad.o', 'lib_Key.o'], requires: [] },
  'Stepper.h': { objects: ['lib_Stepper.o'], requires: [] },
};

/** Libraries of the Uno that the Mega does not have (only prebuilt for the ATmega328P). */
const MEGA_UNSUPPORTED = ['Adafruit_GFX.h', 'Adafruit_SSD1306.h'];

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files.push(...walk(path));
    else files.push(path);
  }
  return files.sort();
}

/** Pack: a JSON object mapping each virtual path to its content in base64. */
function pack(entries) {
  const object = {};
  for (const [path, data] of entries) object[path] = Buffer.from(data).toString('base64');
  return JSON.stringify(object);
}

/** cc1plus arguments for the Mega (ATmega2560, avr6 architecture). */
function megaCompileArgs(input, output) {
  return [
    '-quiet',
    '-imultilib', 'avr6',
    '-D__AVR_ATmega2560__',
    '-D__AVR_DEVICE_NAME__=atmega2560',
    '-DF_CPU=16000000L',
    '-DARDUINO=10609',
    '-DARDUINO_AVR_MEGA2560',
    '-DARDUINO_ARCH_AVR',
    '-isystem', '/sysroot/gcc/include',
    '-isystem', '/sysroot/avr/include',
    ...MEGA_INCLUDE_DIRS.flatMap((dir) => ['-I', dir]),
    input,
    '-mn-flash=4',
    '-mno-skip-bug',
    '-mmcu=avr6',
    '-Os',
    '-w',
    '-std=gnu++11',
    '-fpermissive',
    '-fno-exceptions',
    '-fno-threadsafe-statics',
    '-fno-rtti',
    '-ffunction-sections',
    '-fdata-sections',
    '-o', output,
  ];
}

function compileArgs(input, output) {
  return [
    '-quiet',
    '-imultilib', 'avr5',
    '-D__AVR_ATmega328P__',
    '-D__AVR_DEVICE_NAME__=atmega328p',
    '-DF_CPU=16000000L',
    '-DARDUINO=10819',
    '-DARDUINO_AVR_UNO',
    '-DARDUINO_ARCH_AVR',
    '-isystem', '/sysroot/gcc/include',
    '-isystem', '/sysroot/avr/include',
    ...INCLUDE_DIRS.flatMap((dir) => ['-I', dir]),
    input,
    '-mn-flash=1',
    '-mno-skip-bug',
    '-mmcu=avr5',
    '-Os',
    '-w',
    '-std=gnu++11',
    '-fpermissive',
    '-fno-exceptions',
    '-fno-threadsafe-statics',
    '-fno-rtti',
    '-ffunction-sections',
    '-fdata-sections',
    '-o', output,
  ];
}

async function runTool(name, args, files, outputPath) {
  const { default: factory } = await import(pathToFileURL(join(PKG, 'tools', `${name}.mjs`)).href);
  const stderr = [];
  const mod = await factory({
    noInitialRun: true,
    wasmBinary: readFileSync(join(PKG, 'tools', `${name}.wasm`)),
    print() {},
    printErr: (line) => stderr.push(line),
    quit: (_status, toThrow) => {
      throw toThrow;
    },
  });
  const made = new Set(['/']);
  for (const [path, data] of files) {
    const parts = path.split('/').filter(Boolean).slice(0, -1);
    let dir = '';
    for (const part of parts) {
      dir += `/${part}`;
      if (!made.has(dir)) {
        try {
          mod.FS.mkdir(dir);
        } catch {
          // already exists
        }
        made.add(dir);
      }
    }
    mod.FS.writeFile(path, data);
  }
  let status = 0;
  try {
    status = mod.callMain(args) ?? 0;
  } catch (error) {
    status = error?.status ?? 1;
  }
  if (status !== 0) throw new Error(`${name} failed:\n${stderr.join('\n')}`);
  try {
    return mod.FS.readFile(outputPath);
  } catch {
    throw new Error(`${name} produced no ${outputPath}:\n${stderr.join('\n')}`);
  }
}

async function main() {
  if (!existsSync(PKG)) {
    throw new Error('Missing @horang-corp/avr-gcc-wasm. Run "npm install" first.');
  }

  // Skip when the inputs have not changed.
  const stamp = createHash('sha256')
    .update(readFileSync(fileURLToPath(import.meta.url)))
    .update(readFileSync(join(PKG, 'package.json')))
    .update(
      [VENDOR, AVR6, CORE, MEGA_LIBRARIES]
        .flatMap((dir) => walk(dir))
        .map((file) => `${file}:${statSync(file).size}`)
        .join('|'),
    )
    .digest('hex');
  const stampFile = join(OUT, 'stamp.txt');
  if (existsSync(stampFile) && readFileSync(stampFile, 'utf8') === stamp) return;

  console.log('Preparing AVR toolchain assets...');
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, 'tools'), { recursive: true });
  for (const tool of TOOLS) {
    for (const ext of ['mjs', 'wasm']) {
      cpSync(join(PKG, 'tools', `${tool}.${ext}`), join(OUT, 'tools', `${tool}.${ext}`));
    }
  }

  // Headers.
  const sysroot = new Map();
  const fsRoot = join(PKG, 'assets/fs');
  for (const file of walk(fsRoot)) {
    const virtual = `/${relative(fsRoot, file).split(sep).join('/')}`;
    if (DROPPED_HEADER_DIRS.some((dir) => virtual.startsWith(`${dir}/`))) continue;
    const name = virtual.slice(virtual.lastIndexOf('/') + 1);
    if (virtual.startsWith('/sysroot/avr/include/avr/io') && !KEPT_IO_HEADERS.has(name)) continue;
    sysroot.set(virtual, readFileSync(file));
  }
  for (const library of Object.keys(VENDOR_LIBRARIES)) {
    for (const file of readdirSync(join(VENDOR, library))) {
      if (file.endsWith('.h')) {
        sysroot.set(`/libraries/${library}/${file}`, readFileSync(join(VENDOR, library, file)));
      }
    }
  }

  // Runtime: startup code, C libraries, linker script, prebuilt objects.
  const runtime = new Map();
  for (const file of readdirSync(join(PKG, 'assets/libs'))) {
    runtime.set(`/libs/${file}`, readFileSync(join(PKG, 'assets/libs', file)));
  }
  runtime.set('/ldscripts/avr5.xn', readFileSync(join(PKG, 'assets/ldscripts/avr5.xn')));
  const coreObjects = [];
  for (const file of readdirSync(join(PKG, 'assets/objects')).sort()) {
    if (DROPPED_OBJECTS.test(file)) continue;
    runtime.set(`/objects/${file}`, readFileSync(join(PKG, 'assets/objects', file)));
    if (file.startsWith('core_')) coreObjects.push(`/objects/${file}`);
  }

  // Extra libraries, compiled with the same WebAssembly compiler users will run.
  for (const [library, sources] of Object.entries(VENDOR_LIBRARIES)) {
    for (const source of sources) {
      const base = source.replace(/\.cpp$/, '');
      const files = new Map(sysroot);
      files.set(`/build/${source}`, readFileSync(join(VENDOR, library, source)));
      const assembly = await runTool(
        'cc1plus',
        compileArgs(`/build/${source}`, `/build/${base}.s`),
        files,
        `/build/${base}.s`,
      );
      const object = await runTool(
        'avr-as',
        ['-mmcu=atmega328p', '-o', `/build/${base}.o`, `/build/${base}.s`],
        new Map([[`/build/${base}.s`, assembly]]),
        `/build/${base}.o`,
      );
      runtime.set(`/objects/lib_${base}.o`, Buffer.from(object));
      console.log(`  compiled ${library}/${source} (${object.length} bytes)`);
    }
  }

  const libraries = {};
  for (const [header, entry] of Object.entries(LIBRARIES)) {
    for (const object of entry.objects) {
      if (!runtime.has(`/objects/${object}`)) throw new Error(`Missing object ${object} for ${header}`);
    }
    libraries[header] = {
      objects: entry.objects.map((object) => `/objects/${object}`),
      requires: entry.requires,
    };
  }

  const mega = await buildMega(sysroot);

  writeFileSync(join(OUT, 'sysroot.json'), pack(sysroot));
  writeFileSync(join(OUT, 'runtime-atmega328p.json'), pack(runtime));
  writeFileSync(join(OUT, 'runtime-atmega2560.json'), pack(mega.runtime));
  writeFileSync(
    join(OUT, 'manifest.json'),
    JSON.stringify(
      {
        gcc: '7.3.0',
        targets: {
          atmega328p: { includeDirs: INCLUDE_DIRS, coreObjects, libraries, unsupported: [] },
          atmega2560: {
            includeDirs: MEGA_INCLUDE_DIRS,
            coreObjects: mega.coreObjects,
            libraries: mega.libraries,
            unsupported: MEGA_UNSUPPORTED,
          },
        },
      },
      null,
      2,
    ),
  );
  cpSync(join(ROOT, 'THIRD_PARTY_NOTICES.md'), join(OUT, 'THIRD_PARTY_NOTICES.md'));
  writeFileSync(stampFile, stamp);

  const size = (file) => `${(statSync(join(OUT, file)).size / 1e6).toFixed(1)} MB`;
  console.log(
    `  sysroot ${size('sysroot.json')} (${sysroot.size} files), runtime ${size('runtime-atmega328p.json')} (${runtime.size} files), mega ${size('runtime-atmega2560.json')} (${mega.runtime.size} files)`,
  );
}

/**
 * Marks every object of an ar archive as built for another AVR architecture
 * (the low 7 bits of the ELF header's e_flags). Used to link GCC 7.3's avr5
 * libgcc into ATmega2560 programs: its routines only differ from the avr6
 * ones beyond 64 KB of flash (table jumps, copying initialized data,
 * constructors), so Mega sketches are limited to 64 KB.
 */
function retargetArchive(archive, arch) {
  const data = Buffer.from(archive);
  if (data.toString('latin1', 0, 8) !== '!<arch>\n') throw new Error('Not an ar archive');
  let offset = 8;
  let patched = 0;
  while (offset + 60 <= data.length) {
    const size = Number.parseInt(data.toString('latin1', offset + 48, offset + 58).trim(), 10);
    const body = offset + 60;
    if (data.readUInt32BE(body) === 0x7f454c46) {
      const flags = data.readUInt32LE(body + 36);
      data.writeUInt32LE((flags & ~0x7f) | arch, body + 36);
      patched += 1;
    }
    offset = body + size + (size % 2);
  }
  if (patched === 0) throw new Error('No objects found in the archive');
  return data;
}

/** Compiles one Mega source (C, C++ or preprocessed assembly) to an object file. */
async function compileMega(path, sysroot) {
  try {
    return await compileMegaUnchecked(path, sysroot);
  } catch (error) {
    throw new Error(`Compiling ${path} for the Mega: ${error.message}`);
  }
}

async function compileMegaUnchecked(path, sysroot) {
  const base = path.slice(path.lastIndexOf('/') + 1).replace(/\.(c|cpp|S)$/, '');
  let assembly;
  if (path.endsWith('.S')) {
    // Assembly with C preprocessor directives: the compiler only preprocesses it.
    const args = megaCompileArgs(path, `/build/${base}.s`).filter((arg) => arg !== '-quiet');
    // __ASSEMBLER__ makes the avr-libc headers leave out their C declarations.
    assembly = await runTool('cc1plus', ['-E', '-D__ASSEMBLER__', ...args], sysroot, `/build/${base}.s`);
  } else if (path.endsWith('.c')) {
    // Only the C++ compiler is available: a C file is compiled inside extern "C",
    // after Arduino.h so the C++ parts of that header stay outside the block.
    const wrapper = `/build/${base}_c.cpp`;
    const files = new Map(sysroot);
    // A file that defines ARDUINO_MAIN gets the pin tables from pins_arduino.h:
    // the define must come before the first Arduino.h.
    const main = sysroot.get(path)?.toString().includes('#define ARDUINO_MAIN') ? '#define ARDUINO_MAIN\n' : '';
    files.set(wrapper, `${main}#include <Arduino.h>\nextern "C" {\n#include "${path}"\n}\n`);
    assembly = await runTool('cc1plus', megaCompileArgs(wrapper, `/build/${base}.s`), files, `/build/${base}.s`);
  } else {
    assembly = await runTool('cc1plus', megaCompileArgs(path, `/build/${base}.s`), sysroot, `/build/${base}.s`);
  }
  return runTool(
    'avr-as',
    ['-mmcu=atmega2560', '-o', `/build/${base}.o`, `/build/${base}.s`],
    new Map([[`/build/${base}.s`, assembly]]),
    `/build/${base}.o`,
  );
}

/** Builds the Mega runtime from source and adds its headers to the sysroot. */
async function buildMega(sysroot) {
  const sources = new Map();
  const addTree = (dir, virtualDir) => {
    for (const file of walk(dir)) {
      const virtual = `${virtualDir}/${relative(dir, file).split(sep).join('/')}`;
      if (/\.(h|c|cpp|S)$/.test(virtual)) {
        sources.set(virtual, readFileSync(file));
        if (virtual.endsWith('.h')) sysroot.set(virtual, readFileSync(file));
      }
    }
  };
  addTree(join(CORE, 'cores/arduino'), '/mega/core');
  addTree(join(CORE, 'variants/mega'), '/mega/variant');
  addTree(join(CORE, 'libraries'), '/mega/libraries');
  addTree(MEGA_LIBRARIES, '/mega/libraries');

  const runtime = new Map();
  // avr-libc for the ATmega2560; libgcc's routines are the avr5 ones of the same GCC
  // (they only use registers, and sketches stay below 128 KB where the jumps are the same).
  for (const file of ['libc.a', 'libm.a', 'libatmega2560.a', 'crtatmega2560.o']) {
    runtime.set(`/libs/${file}`, readFileSync(join(AVR6, file)));
  }
  runtime.set('/libs/libgcc.a', retargetArchive(readFileSync(join(PKG, 'assets/libs/libgcc.a')), 6));
  runtime.set('/ldscripts/avr6.xn', readFileSync(join(AVR6, 'avr6.xn')));

  const files = new Map([...sysroot, ...sources]);
  // The tools write their output in /build, which must exist.
  files.set('/build/.keep', new Uint8Array());
  const coreObjects = [];
  for (const path of [...sources.keys()].filter((path) => path.startsWith('/mega/core/') && /\.(c|cpp|S)$/.test(path))) {
    const name = `core_${path.slice(path.lastIndexOf('/') + 1).replace(/\./g, '_')}.o`;
    runtime.set(`/objects/${name}`, Buffer.from(await compileMega(path, files)));
    coreObjects.push(`/objects/${name}`);
  }
  for (const [path, name] of Object.entries(MEGA_LIBRARY_SOURCES)) {
    runtime.set(`/objects/${name}`, Buffer.from(await compileMega(path, files)));
  }
  for (const [library, list] of Object.entries(VENDOR_LIBRARIES)) {
    for (const source of list) {
      const path = `/libraries/${library}/${source}`;
      files.set(path, readFileSync(join(VENDOR, library, source)));
      runtime.set(`/objects/lib_${source.replace(/\.cpp$/, '')}.o`, Buffer.from(await compileMega(path, files)));
    }
  }

  const libraries = {};
  for (const [header, entry] of Object.entries(MEGA_LIBRARIES_TABLE)) {
    for (const object of entry.objects) {
      if (!runtime.has(`/objects/${object}`)) throw new Error(`Missing Mega object ${object} for ${header}`);
    }
    libraries[header] = { objects: entry.objects.map((object) => `/objects/${object}`), requires: entry.requires };
  }
  console.log(`  compiled the Mega core and libraries (${coreObjects.length} core objects)`);
  return { runtime, coreObjects, libraries };
}

await main();
