import type { BehaviorIo } from './model';
import type { PartDef, PinDef } from './types';

/**
 * Linear voltage regulators in TO-220. The output is a voltage source set by
 * the regulator's logic; its current is mirrored from the input pin, so the
 * supply sees the load.
 */

const DROPOUT = 2;
const MAX_AMPS = 1.5;

export function to220(label: string): string {
  return `
    <path d="M-10 20V6M0 20V6M10 20V6" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>
    <rect x="-14" y="-24" width="28" height="12" rx="1" fill="#c3c8cd" stroke="#70777e"/>
    <circle cx="0" cy="-18" r="3" fill="#70777e"/>
    <rect x="-14" y="-13" width="28" height="20" rx="1" fill="#24272b" stroke="#0f1113"/>
    <text x="0" y="0" font-size="6" font-family="monospace" text-anchor="middle" fill="#c9cdd2">${label}</text>`;
}

export interface RegulatorChip {
  type: string;
  name: { es: string; en: string };
  keywords: string[];
  label: string;
  pins: PinDef[];
  /** Pin the output is referenced to (ground or the adjust pin's ground). */
  ground: string;
  /** Pin where the quiescent current leaves the chip. */
  quiescentTo: string;
  /** Output voltage wanted, before dropout limiting. */
  target: (io: BehaviorIo) => number;
}

export function regulator(chip: RegulatorChip): PartDef {
  return {
    type: chip.type,
    category: 'ic',
    name: chip.name,
    keywords: ['regulador', 'regulator', 'voltaje', 'voltage', 'fuente', ...chip.keywords],
    refPrefix: 'U',
    bounds: { x: -14, y: -24, width: 28, height: 44 },
    pins: chip.pins,
    props: [],
    model: (ctx) => {
      const pass = ctx.internal('pass');
      return [
        { name: 'reg', kind: 'source', p: pass, n: ctx.pin(chip.ground) },
        // 'main' carries the output current and copies it from IN.
        {
          name: 'main',
          kind: 'cccs',
          a: pass,
          b: ctx.pin('OUT'),
          c: ctx.pin('IN'),
          d: ctx.pin(chip.ground),
          gain: 1,
        },
        // Quiescent current.
        { name: 'bias', kind: 'resistor', a: ctx.pin('IN'), b: ctx.pin(chip.quiescentTo), ohms: 2000 },
      ];
    },
    behavior: {
      init: () => ({}),
      update: (io) => {
        const available = io.v('IN', chip.ground) - DROPOUT;
        io.setSource('reg', Math.max(0, Math.min(chip.target(io), available)));
      },
    },
    faults: () => [
      {
        element: 'main',
        quantity: 'current',
        max: MAX_AMPS,
        cause: 'overcurrent',
        action: 'burn',
        tolerance: 0.5,
      },
    ],
    footprint: () => to220(chip.label),
  };
}
