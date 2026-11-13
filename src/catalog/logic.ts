import { dipBody, dipBounds, dipPins } from './dip';
import type { ElementSpec } from './model';
import { same, type LocalizedText, type PartDef } from './types';

/**
 * Digital chips in DIP packages. Inputs are read against the supply with
 * hysteresis; each output is a pair of switches, to the supply pin and to
 * ground, so the current it delivers really comes from the supply.
 */

const OUTPUT_OHMS = 30;
/** Below this supply voltage the chip does nothing. */
const MIN_SUPPLY = 1.5;

export type LogicState = Record<string, number>;
/** Output levels by pin; null (or absent) leaves the output in high impedance. */
export type LogicOutputs = Record<string, boolean | null>;

export interface LogicChip {
  type: string;
  name: LocalizedText;
  keywords: string[];
  /** Text printed on the package. */
  label: string;
  /** Pin ids in pin-number order, starting at pin 1. */
  pins: string[];
  vcc: string;
  gnd: string;
  outputs: string[];
  /** Pins without function (not connected inside). */
  unused?: string[];
  /**
   * Classic TTL inputs (74xx, 74LSxx): fixed thresholds of 0.8 V and 2 V,
   * and an input left unconnected reads as high.
   */
  ttl?: boolean;
  init?: () => LogicState;
  /** Computes the outputs from the input levels; `state` persists between calls. */
  logic: (input: (pin: string) => boolean, state: LogicState) => LogicOutputs;
}

export function logicChip(chip: LogicChip): PartDef {
  const perRow = chip.pins.length / 2;
  const passive = new Set([chip.vcc, chip.gnd, ...chip.outputs, ...(chip.unused ?? [])]);
  const inputs = chip.pins.filter((pin) => !passive.has(pin));

  return {
    type: chip.type,
    category: 'ic',
    name: chip.name,
    keywords: ['ic', 'chip', 'integrado', ...chip.keywords],
    refPrefix: 'U',
    bounds: dipBounds(perRow),
    pins: dipPins(chip.pins.map((id, index) => ({ id, name: same(`${index + 1} · ${id}`) }))),
    props: [],
    model: (ctx) =>
      chip.outputs.flatMap((pin): ElementSpec[] => [
        { name: `${pin}:hi`, kind: 'switch', a: ctx.pin(chip.vcc), b: ctx.pin(pin), ohms: OUTPUT_OHMS },
        { name: `${pin}:lo`, kind: 'switch', a: ctx.pin(pin), b: ctx.pin(chip.gnd), ohms: OUTPUT_OHMS },
      ]),
    behavior: {
      init: () => chip.init?.() ?? {},
      update: (io, state) => {
        const supply = io.v(chip.vcc, chip.gnd);
        const powered = supply > MIN_SUPPLY;
        for (const pin of inputs) {
          const key = `in:${pin}`;
          const volts = io.v(pin, chip.gnd);
          const high = chip.ttl ? 2 : 0.6 * supply;
          const low = chip.ttl ? 0.8 : 0.4 * supply;
          // Between the thresholds the previous level holds.
          const level =
            chip.ttl && !io.connected(pin)
              ? true
              : volts > high
                ? true
                : volts < low
                  ? false
                  : state[key] === 1;
          state[key] = powered && level ? 1 : 0;
        }
        const levels = powered ? chip.logic((pin) => state[`in:${pin}`] === 1, state) : {};
        for (const pin of chip.outputs) {
          const level = levels[pin] ?? null;
          io.setSwitch(`${pin}:hi`, level === true);
          io.setSwitch(`${pin}:lo`, level === false);
        }
      },
    },
    footprint: () => dipBody(perRow, chip.label),
  };
}

/**
 * True on the call where `level` has just gone from low to high. A pin that
 * is already high the first time it is read does not count as an edge.
 */
export function risingEdge(state: LogicState, key: string, level: boolean): boolean {
  const rose = level && state[key] === 0;
  state[key] = level ? 1 : 0;
  return rose;
}

const QUAD_PINS = ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'];
/** The 74HC02 has its outputs first. */
const QUAD_NOR_PINS = ['1Y', '1A', '1B', '2Y', '2A', '2B', 'GND', '3A', '3B', '3Y', '4A', '4B', '4Y', 'VCC'];

/** 74HC chip with four two-input gates. */
export function quadGate(
  number: string,
  gate: { es: string; en: string },
  fn: (a: boolean, b: boolean) => boolean,
): PartDef {
  return logicChip({
    type: `ic-74hc${number}`,
    name: { es: `74HC${number} · 4 compuertas ${gate.es}`, en: `74HC${number} · quad ${gate.en} gate` },
    keywords: [`74hc${number}`, `74${number}`, 'compuerta', 'gate', 'logica', 'logic', gate.es, gate.en],
    label: `74HC${number}`,
    pins: number === '02' ? QUAD_NOR_PINS : QUAD_PINS,
    vcc: 'VCC',
    gnd: 'GND',
    outputs: ['1Y', '2Y', '3Y', '4Y'],
    logic: (input) =>
      Object.fromEntries([1, 2, 3, 4].map((n) => [`${n}Y`, fn(input(`${n}A`), input(`${n}B`))])),
  });
}
