# OpenCircuit

Browser-based circuit simulator for Automation & Robotics students: electronics + Arduino,
industrial IEC wiring and PLC. 100% static, works offline (PWA), deployable to GitHub Pages.

## Stack

- **Vite + TypeScript (strict)** — fast builds, native Web Worker and WASM bundling.
- **SolidJS** — fine-grained reactivity without a virtual DOM; suits an SVG editor with
  thousands of live nodes updating during simulation.
- **vite-plugin-pwa (Workbox)** — precaches every asset (including future WASM) for offline use.
- **Vitest** — unit tests for the core.

No backend, no external APIs, no third-party requests at runtime.

## Scripts

| Command             | Description                        |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Dev server                         |
| `npm run build`     | Production build into `dist/`      |
| `npm run preview`   | Serve the production build locally |
| `npm run typecheck` | TypeScript check                   |
| `npm test`          | Unit tests                         |

The service worker is only active in production builds (`npm run build && npm run preview`).

## Deploy

1. Push the repository to GitHub (branch `main`).
2. In **Settings → Pages**, set **Source** to **GitHub Actions**.
3. Every push to `main` runs typecheck, tests and build, then publishes `dist/`.

The build uses a relative base path, so it works under any repository name.

## Structure

```
src/
  app/        UI shell (top bar, menu dialog, toasts)
  arduino/    Code panel: editor, build status, serial monitor
  avr/        Sketch -> firmware (WebAssembly toolchain driver, compiler worker)
  catalog/    Component definitions: one file per component in catalog/parts/
  core/       Simulation core: runs in a Web Worker, typed request/response protocol
  editor/     Circuit editor
    model/    Pure document model: types, geometry, edit operations, undo history
    ui/       Canvas, palette, toolbar, properties panel
  i18n/       Locales (es, en) and translation helpers
  instruments/ Oscilloscope and logic analyzer screens, serial plotter, signal analysis
  lib/        Small shared utilities (SI value parsing/formatting)
  platform/   Browser persistence helpers
  project/    Project files (.ocircuit), IndexedDB storage, autosave
  pwa/        Service worker registration and update flow
  sim/        Simulation run loop and live state (UI side)
  styles/     Global CSS and theme tokens
  theme/      Light/dark/system theme
```

Rules:

- `core/` never imports from UI folders. The UI talks to the core only through `core/client.ts`.
- `editor/model/` is pure (no DOM, no framework): every edit returns a new document.
- Adding a component = adding one file in `catalog/parts/` that default-exports a `PartDef`.
  It is picked up automatically.

## Arduino

Sketches are compiled in the browser with AVR GCC 7.3 built for WebAssembly and run on an
emulated ATmega328P or ATmega2560 (avr8js) wired into the circuit solver.

- `scripts/prepare-avr.mjs` builds `public/avr/` (compiler, headers, prebuilt core and
  libraries) from `@horang-corp/avr-gcc-wasm` and `vendor/`. For the Mega it compiles the
  Arduino core and its libraries from source with the same WebAssembly compiler. It runs
  automatically before `dev`, `build` and `test`; `public/avr/` is not committed.
- `src/avr/` turns a sketch into firmware (`sketch.ts` adds prototypes like the Arduino
  IDE, `toolchain.ts` drives the tools). It runs in its own worker.
- `src/core/avr/` runs the firmware; `src/core/sim/session.ts` steps CPU and circuit together.
- Boards: Uno and Nano (ATmega328P), Mega 2560 (ATmega2560: timers 0-5, 16 analog
  inputs, 4 serial ports, INT0-INT7). `src/core/avr/chips.ts` holds each chip's
  peripherals.
- Libraries: Servo, Wire, SPI, LiquidCrystal, LiquidCrystal_I2C, Adafruit NeoPixel, DHT,
  Keypad, Stepper; Adafruit GFX/SSD1306 on the Uno and Nano; SoftwareSerial and EEPROM on
  the Mega.
- Mega sketches are limited to 64 KB of flash: its runtime links GCC's avr5 libgcc,
  whose table jumps and data copying are only right below 64 KB.

The compiler is GPL software shipped as separate files, not linked into the app.
See `THIRD_PARTY_NOTICES.md`.

## Project file format

`.ocircuit` files are JSON: `{ format: "opencircuit", version, name, doc }`. Files are
validated on load. When the format changes, bump `FILE_VERSION` in `project/format.ts`
and add a migration step to `MIGRATIONS`.
