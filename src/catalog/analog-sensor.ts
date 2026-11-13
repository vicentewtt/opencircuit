import type { ElementSpec } from './model';
import type { PartDef, PartProps } from './types';

/**
 * Sensors whose output is a voltage that depends on what they measure.
 * The measured quantity is a property the user moves while simulating.
 */

const OUTPUT_OHMS = 100;

export interface AnalogOutput {
  pin: string;
  /** Output voltage for the current properties and supply voltage. */
  volts: (props: PartProps, supply: number) => number;
}

export type AnalogSensor = Pick<
  PartDef,
  'type' | 'name' | 'keywords' | 'bounds' | 'pins' | 'props' | 'footprint'
> & {
  outputs: AnalogOutput[];
  /** Supply voltage below which the sensor gives nothing. */
  minSupply: number;
  /** Resistance that stands for the current the sensor draws. */
  supplyOhms: number;
};

/** Expects supply pins called VCC and GND. */
export function analogSensor(sensor: AnalogSensor): PartDef {
  const { outputs, minSupply, supplyOhms, ...part } = sensor;
  return {
    ...part,
    category: 'sensor',
    refPrefix: 'U',
    model: (ctx) => [
      { name: 'main', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('GND'), ohms: supplyOhms },
      ...outputs.flatMap(({ pin }): ElementSpec[] => {
        const stage = ctx.internal(`stage:${pin}`);
        return [
          { name: `out:${pin}`, kind: 'source', p: stage, n: ctx.pin('GND') },
          { name: `rout:${pin}`, kind: 'resistor', a: stage, b: ctx.pin(pin), ohms: OUTPUT_OHMS },
        ];
      }),
    ],
    behavior: {
      init: () => ({}),
      update: (io) => {
        const supply = io.v('VCC', 'GND');
        for (const { pin, volts } of outputs) {
          const wanted = supply < minSupply ? 0 : volts(io.props, supply);
          io.setSource(`out:${pin}`, Math.max(0, Math.min(supply, wanted)));
        }
      },
    },
    faults: () => [
      { element: 'main', quantity: 'voltage', max: 7, cause: 'overvoltage', action: 'burn' },
    ],
  };
}

/** Three-legged plastic package (TO-92) with a label, legs at x = -10, 0, 10. */
export function to92(label: string, detail: string): string {
  return `
    <path d="M-10 20V6M0 20V6M10 20V6" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M-13 8V-4a13 13 0 0 1 26 0V8z" fill="#24272b" stroke="#0f1113"/>
    <text x="0" y="-2" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#c9cdd2">${label}</text>
    <text x="0" y="5" font-size="5" font-family="monospace" text-anchor="middle" fill="#c9cdd2">${detail}</text>`;
}

export const TO92_BOUNDS = { x: -14, y: -18, width: 28, height: 38 };
