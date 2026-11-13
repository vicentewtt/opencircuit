# Third-party notices

OpenCircuit's own code depends only on permissively licensed libraries (SolidJS, avr8js,
CodeMirror, Workbox: MIT).

The Arduino compiler is different. It is **not linked into the application**: it is a set
of separate programs and data files in `avr/`, downloaded at runtime and run in a Web
Worker to turn the user's sketch into firmware. They keep their own licenses.

## Compiler toolchain (`avr/tools/`)

| Component | Files | License |
| --- | --- | --- |
| GCC 7.3.0, AVR C++ compiler | `cc1plus.wasm`, `cc1plus.mjs` | GNU GPL v3 or later |
| GNU binutils (as, ld, objcopy) | `avr-as.*`, `avr-ld.*`, `avr-objcopy.*` | GNU GPL v3 or later |

These binaries are redistributed unmodified from the npm package
[`@horang-corp/avr-gcc-wasm`](https://www.npmjs.com/package/@horang-corp/avr-gcc-wasm)
(build scripts: <https://github.com/horang-corp/avr-gcc-wasm>).

Corresponding source code:

- GCC: <https://gcc.gnu.org/> (release 7.3.0), with the Arduino patches at
  <https://github.com/arduino/toolchain-avr>
- GNU binutils: <https://www.gnu.org/software/binutils/>

The GPL covers these tools, not the programs they compile and not OpenCircuit.

## Runtime linked into the user's firmware (`avr/runtime-*.json`, `avr/sysroot.json`)

| Component | License |
| --- | --- |
| libgcc | GPL v3 with the GCC Runtime Library Exception |
| avr-libc | BSD-style (<https://github.com/avrdudes/avr-libc>) |
| Arduino AVR core, Wire, SPI | LGPL 2.1 (<https://github.com/arduino/ArduinoCore-avr>) |
| Servo | LGPL 2.1 (<https://github.com/arduino-libraries/Servo>) |
| LiquidCrystal, Stepper | LGPL 2.1 (<https://github.com/arduino-libraries>) |
| Adafruit NeoPixel | LGPL 3 (<https://github.com/adafruit/Adafruit_NeoPixel>) |
| Adafruit GFX, SSD1306, BusIO | BSD (<https://github.com/adafruit>) |
| DHT sensor library, Adafruit Unified Sensor | MIT / Apache 2.0 (<https://github.com/adafruit>) |
| Keypad | GPL v3 (<https://github.com/Chris--A/Keypad>) |
| LiquidCrystal_I2C | no license file published (<https://github.com/johnrickman/LiquidCrystal_I2C>) |

Sources of the libraries compiled by this project are in `vendor/arduino-libraries/`,
with the exact upstream commits listed in `SOURCES.txt`.

### Arduino Mega (ATmega2560)

| Component | License | Origin |
| --- | --- | --- |
| avr-libc 2.0.0 for the ATmega2560 (`vendor/avr6/`) | BSD-style | built with AVR GCC 7.3, taken from the `quirkbot-avr-gcc` npm package |
| ATmega2560 linker script `avr6.xn` | GPL v3 with the GNU ld script exception (scripts may be used freely) | same package |
| libgcc (the avr5 build of GCC 7.3, its objects marked as avr6) | GPL v3 with the GCC Runtime Library Exception | `@horang-corp/avr-gcc-wasm` |
| Arduino AVR core 1.6.9, Mega pin map, Wire, SPI, SoftwareSerial, EEPROM (`vendor/arduino-core-avr/`) | LGPL 2.1 | `npm-arduino-hardware-avr` npm package (<https://github.com/arduino/ArduinoCore-avr>) |
| Servo and DHT for the Mega (`vendor/opencircuit-mega/`) | same license as OpenCircuit | written for this project |

The Adafruit GFX and SSD1306 libraries are only available for the Uno and Nano: they
are shipped prebuilt for the ATmega328P, without sources to build them for the Mega.

These components end up inside the firmware built from a sketch. Firmware that uses the
Keypad library is subject to the GPL if it is distributed.
