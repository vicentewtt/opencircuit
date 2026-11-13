import type { BehaviorIo, ElementSpec, ModelContext } from './model';
import { stringProp, type PartDef, type PartProps, type PinDef, type PropDef } from './types';

/**
 * Shared pieces of the industrial parts: devices for mains voltage and
 * 24 V control circuits, drawn like DIN-rail equipment with the terminals
 * on top and at the bottom.
 */

export const SQRT2 = Math.SQRT2;

/**
 * Running RMS of a signal, kept in `state[key]`. Works for AC and DC alike,
 * which is what coils, heaters and trip units respond to.
 */
export function rms(
  state: Record<string, number>,
  key: string,
  value: number,
  dt: number,
  tau = 0.04,
): number {
  const previous = state[key] ?? 0;
  const blend = dt <= 0 ? 1 : 1 - Math.exp(-dt / tau);
  const mean = previous + blend * (value * value - previous);
  state[key] = mean;
  return Math.sqrt(mean);
}

export interface Coil {
  volts: number;
  ohms: number;
  label: string;
}

/** Coil options: rated voltage (RMS for AC) and resistance. */
export const COILS: Record<string, Coil> = {
  '24dc': { volts: 24, ohms: 240, label: '24 V DC' },
  '220ac': { volts: 220, ohms: 7300, label: '220 V AC' },
  '380ac': { volts: 380, ohms: 22000, label: '380 V AC' },
};
const DEFAULT_COIL: Coil = { volts: 220, ohms: 7300, label: '220 V AC' };

export const coilOf = (props: PartProps): Coil => COILS[stringProp(props, 'coil')] ?? DEFAULT_COIL;

export const COIL_PROP: PropDef = {
  kind: 'select',
  key: 'coil',
  label: { es: 'Bobina', en: 'Coil' },
  default: '220ac',
  options: Object.entries(COILS).map(([value, coil]) => ({
    value,
    label: { es: coil.label, en: coil.label },
  })),
};

/** True while the coil between A1 and A2 has enough voltage: pulls in at 75 %, releases at 40 %. */
export function coilEnergized(io: BehaviorIo, state: Record<string, number>): boolean {
  const rated = coilOf(io.props).volts;
  const volts = rms(state, 'coil', io.v('A1', 'A2'), io.dt);
  if (volts > 0.75 * rated) state.on = 1;
  else if (volts < 0.4 * rated) state.on = 0;
  return state.on === 1;
}

export const coilElement = (ctx: ModelContext): ElementSpec => ({
  name: 'main',
  kind: 'resistor',
  a: ctx.pin('A1'),
  b: ctx.pin('A2'),
  ohms: coilOf(ctx.props).ohms,
});

export const coilFault = (props: PartProps) => ({
  element: 'main',
  quantity: 'voltage' as const,
  max: coilOf(props).volts * SQRT2 * 1.3,
  cause: 'overvoltage' as const,
  action: 'burn' as const,
  tolerance: 0.5,
});

/** Thermal memory of a trip unit: rises towards (I / In)² with time constant `tau`. */
export function heat(
  state: Record<string, number>,
  amps: number,
  rated: number,
  dt: number,
  tau: number,
): number {
  const previous = state.heat ?? 0;
  const next = previous + ((amps / rated) ** 2 - previous) * Math.min(1, dt / tau);
  state.heat = next;
  return next;
}

/** A pin on the top or bottom edge of a DIN device. */
export const terminal = (id: string, x: number, y: number, es?: string, en?: string): PinDef => ({
  id,
  name: { es: es ?? `Borne ${id}`, en: en ?? `Terminal ${id}` },
  x,
  y,
});

/**
 * Body of a DIN-rail device: a housing between the two rows of screw
 * terminals, each with its number, plus whatever `extra` draws on the front.
 */
export function dinBody(def: Pick<PartDef, 'pins' | 'bounds'>, label: string, extra = ''): string {
  const { x, width } = def.bounds;
  const top = Math.min(...def.pins.map((pin) => pin.y)) + 8;
  const bottom = Math.max(...def.pins.map((pin) => pin.y)) - 8;
  const screws = def.pins
    .map((pin) => {
      const edge = pin.y < 0 ? top : bottom;
      const inner = pin.y < 0 ? top + 9 : bottom - 5.5;
      return `<path d="M${pin.x} ${pin.y}V${edge}" stroke="#9aa0a6" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="${pin.x}" cy="${pin.y < 0 ? top + 3 : bottom - 3}" r="2.6" fill="#c3c8cd" stroke="#70777e" stroke-width="0.6"/>
        <text x="${pin.x}" y="${inner + (pin.y < 0 ? 2 : 0)}" font-size="4.4" font-family="monospace" text-anchor="middle" fill="#30353a">${pin.id}</text>`;
    })
    .join('');
  return `
    <rect x="${x + 2}" y="${top}" width="${width - 4}" height="${bottom - top}" rx="2.5" fill="#eceef0" stroke="#8f969d"/>
    ${screws}
    <text x="${x + width / 2}" y="${bottom - 12}" font-size="5" font-family="monospace" text-anchor="middle" fill="#30353a">${label}</text>
    ${extra}`;
}

export interface Contact {
  a: string;
  b: string;
  /** Closed while the control is actuated (normally open) or while it rests (normally closed). */
  normallyOpen: boolean;
}

export interface ControlDevice {
  type: string;
  name: { es: string; en: string };
  keywords: string[];
  contacts: Contact[];
  /** momentary: actuated while held. toggle: each click changes it. */
  action: 'momentary' | 'toggle';
  /** Draws the operator (button, mushroom, knob); `active` is its actuated state. */
  head: (active: boolean) => string;
  /** Labels of the two positions, for latching controls. */
  positions?: [{ es: string; en: string }, { es: string; en: string }];
}

/** Pushbuttons, selectors and limit switches: one or two contacts moved by hand. */
export function controlDevice(device: ControlDevice): PartDef {
  const double = device.contacts.length > 1;
  const pins = device.contacts.flatMap((contact, index) => {
    const x = double ? -10 + index * 20 : 0;
    return [terminal(contact.a, x, -30), terminal(contact.b, x, 30)];
  });
  const bounds = { x: double ? -22 : -14, y: -30, width: double ? 44 : 28, height: 60 };
  const toggles = device.action === 'toggle';
  const isActive = (props: PartProps, pressed: boolean): boolean =>
    toggles ? stringProp(props, 'state') === 'on' : pressed;
  return {
    type: device.type,
    category: 'industrial',
    name: device.name,
    keywords: ['industrial', 'control', 'mando', ...device.keywords],
    refPrefix: 'S',
    bounds,
    pins,
    props: toggles
      ? [
          {
            kind: 'select',
            key: 'state',
            label: { es: 'Posición', en: 'Position' },
            default: 'off',
            options: [
              { value: 'off', label: device.positions?.[0] ?? { es: 'Reposo', en: 'Released' } },
              { value: 'on', label: device.positions?.[1] ?? { es: 'Accionado', en: 'Actuated' } },
            ],
          },
        ]
      : [],
    model: (ctx) => {
      const active = isActive(ctx.props, ctx.input('pressed') > 0);
      return device.contacts.flatMap((contact, index): ElementSpec[] =>
        contact.normallyOpen === active
          ? [{ name: index === 0 ? 'main' : `contact${index}`, kind: 'resistor', a: ctx.pin(contact.a), b: ctx.pin(contact.b), ohms: 0.01 }]
          : [],
      );
    },
    interactive: toggles
      ? { kind: 'toggle', prop: 'state', values: ['off', 'on'] }
      : { kind: 'momentary', input: 'pressed' },
    footprint: (props, visual) =>
      dinBody({ pins, bounds }, '', device.head(isActive(props, visual?.pressed === true))),
  };
}

/** Contacts of a relay-like device, all switched together by its behavior. */
export function switchElements(
  ctx: ModelContext,
  contacts: { name: string; a: string; b: string }[],
): ElementSpec[] {
  return contacts.map(({ name, a, b }) => ({ name, kind: 'switch', a: ctx.pin(a), b: ctx.pin(b), ohms: 0.01 }));
}
