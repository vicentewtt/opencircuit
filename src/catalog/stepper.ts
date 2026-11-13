import type { BehaviorIo, ElementSpec, ModelContext } from './model';
import type { PartDef, PinDef } from './types';

/**
 * Stepper motors. The rotor follows the magnetic field of the energized
 * coils: each change of the coil pattern moves it one step, and a wrong
 * sequence (opposite coils at once) leaves it shaking in place.
 */

/** Coil current that counts as energized. */
const ON_AMPS = 0.02;
const QUARTER_TURN = Math.PI / 2;

export interface StepperMotor {
  type: string;
  name: { es: string; en: string };
  keywords: string[];
  pins: PinDef[];
  /** Full steps per revolution of the output shaft. */
  stepsPerTurn: number;
  coils: (ctx: ModelContext) => ElementSpec[];
  /** Direction of the field (x, y), each between -1 and 1. */
  field: (io: BehaviorIo) => [number, number];
  /** Colors of the wires, in pin order. */
  wires: string[];
  label: string;
}

export function stepper(motor: StepperMotor): PartDef {
  return {
    type: motor.type,
    category: 'output',
    name: motor.name,
    keywords: ['motor', 'paso a paso', 'pasos', 'stepper', 'step', ...motor.keywords],
    refPrefix: 'M',
    bounds: { x: -30, y: -32, width: 60, height: 72 },
    pins: motor.pins,
    props: [],
    model: motor.coils,
    behavior: {
      init: () => ({ phase: 0 }),
      update: (io, state) => {
        const [x, y] = motor.field(io);
        const phase = state.phase ?? 0;
        if (Math.hypot(x, y) > 0.5) {
          const wanted = Math.atan2(y, x);
          const turn = Math.atan2(Math.sin(wanted - phase), Math.cos(wanted - phase));
          // A field exactly opposite to the rotor pulls it neither way.
          if (Math.abs(turn) < Math.PI - 0.2) state.phase = phase + turn;
        }
        const steps = (state.phase ?? 0) / QUARTER_TURN;
        io.aux('steps', Math.round(steps * 2) / 2);
        io.aux('angle', (((steps / motor.stepsPerTurn) * 360) % 360 + 360) % 360);
      },
    },
    footprint: (_props, visual) => {
      const angle = visual?.aux?.angle ?? 0;
      const steps = visual?.aux?.steps ?? 0;
      const leads = motor.pins
        .map((pin, index) => `<path d="M${pin.x} 40V26" stroke="${motor.wires[index] ?? '#9aa0a6'}" stroke-width="2.4" stroke-linecap="round"/>`)
        .join('');
      return `
        ${leads}
        <rect x="-30" y="-4" width="60" height="8" rx="3" fill="#aeb4ba"/>
        <circle cx="0" cy="0" r="26" fill="#c3c8cd" stroke="#70777e"/>
        <rect x="-14" y="16" width="28" height="12" rx="2" fill="#2f6fbf"/>
        <g transform="rotate(${angle.toFixed(1)})">
          <circle cx="0" cy="0" r="9" fill="#e6e9ec" stroke="#8f969d"/>
          <path d="M0 0V-20" stroke="#b3541e" stroke-width="4" stroke-linecap="round"/>
        </g>
        <circle cx="0" cy="0" r="3" fill="#30353a"/>
        <text x="0" y="-13" font-size="5" font-family="monospace" text-anchor="middle" fill="#30353a">${motor.label}</text>
        <text x="0" y="25" font-size="5.5" font-family="monospace" text-anchor="middle" fill="#e9f1fb">${steps}</text>`;
    },
  };
}
