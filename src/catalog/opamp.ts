import { dipBody, dipBounds, dipPins } from './dip';
import type { ElementSpec } from './model';
import { same, type PartDef } from './types';

/** Operational amplifiers in 8-pin DIP packages. */

const OPEN_LOOP_GAIN = 1e5;
/** Resistance in series with the output: it also limits the short-circuit current. */
const OUTPUT_OHMS = 75;

export interface OpampChip {
  type: string;
  name: { es: string; en: string };
  keywords: string[];
  label: string;
  /** Pin ids in pin-number order. */
  pins: string[];
  vPlus: string;
  vMinus: string;
  amplifiers: { name: string; inPlus: string; inMinus: string; out: string }[];
  /** How close the output gets to each supply rail, in volts. */
  headroomHigh: number;
  headroomLow: number;
}

export function opampChip(chip: OpampChip): PartDef {
  return {
    type: chip.type,
    category: 'ic',
    name: chip.name,
    keywords: ['opamp', 'op-amp', 'amplificador', 'operacional', 'amplifier', ...chip.keywords],
    refPrefix: 'U',
    bounds: dipBounds(4),
    pins: dipPins(chip.pins.map((id, index) => ({ id, name: same(`${index + 1} · ${id}`) }))),
    props: [],
    model: (ctx) =>
      chip.amplifiers.flatMap((amplifier): ElementSpec[] => {
        const stage = ctx.internal(`stage:${amplifier.name}`);
        return [
          {
            name: amplifier.name,
            kind: 'opamp',
            inp: ctx.pin(amplifier.inPlus),
            inn: ctx.pin(amplifier.inMinus),
            out: stage,
            vp: ctx.pin(chip.vPlus),
            vn: ctx.pin(chip.vMinus),
            gain: OPEN_LOOP_GAIN,
            headroomHigh: chip.headroomHigh,
            headroomLow: chip.headroomLow,
          },
          {
            name: `rout:${amplifier.name}`,
            kind: 'resistor',
            a: stage,
            b: ctx.pin(amplifier.out),
            ohms: OUTPUT_OHMS,
          },
        ];
      }),
    footprint: () => dipBody(4, chip.label),
  };
}
