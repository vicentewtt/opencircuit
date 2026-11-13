import { stringProp, type PartDef, type PartProps, type PinDef } from './types';

/**
 * Schematic symbols (IEC 60617 style): black lines on white, no colors.
 * Every symbol keeps the pins exactly where the part has them on the
 * board, so the same wires serve both views.
 */

type Draw = (props: PartProps, def: PartDef) => string;

const fixed = (value: number): string => String(Math.round(value * 100) / 100);

/** Filled arrowhead at (x2, y2), pointing away from (x1, y1). */
function arrow(x1: number, y1: number, x2: number, y2: number, size = 3.2): string {
  const length = Math.hypot(x2 - x1, y2 - y1) || 1;
  const ux = (x2 - x1) / length;
  const uy = (y2 - y1) / length;
  const bx = x2 - ux * size;
  const by = y2 - uy * size;
  const half = size * 0.45;
  return `<path d="M${fixed(x2)} ${fixed(y2)}L${fixed(bx - uy * half)} ${fixed(by + ux * half)}L${fixed(bx + uy * half)} ${fixed(by - ux * half)}z" fill="#000"/>`;
}

const path = (d: string): string => `<path d="${d}"/>`;
const text = (x: number, y: number, content: string, size = 6): string =>
  `<text x="${x}" y="${y}" font-size="${size}" font-family="monospace" text-anchor="middle" fill="#000" stroke="none">${content}</text>`;

const pin = (def: PartDef, id: string): PinDef => def.pins.find((candidate) => candidate.id === id) ?? { id, name: { es: id, en: id }, x: 0, y: 0 };

/** Leads of a part with two pins side by side: up (or down) to y = 0, then in to ±`reach`. */
function legs(def: PartDef, reach: number): string {
  const [first, second] = def.pins;
  if (!first || !second) return '';
  return path(`M${first.x} ${first.y}V0H${-reach}M${second.x} ${second.y}V0H${reach}`);
}

/** Leads of a part lying flat: from each end pin in to ±`reach`. */
const axial = (def: PartDef, reach: number): string => {
  const [first, second] = def.pins;
  return first && second ? path(`M${first.x} ${first.y}H${-reach}M${second.x} ${second.y}H${reach}`) : '';
};

/** Cells drawn between x = -reach and x = reach; the long plate is the positive one. */
function cells(count: number, positiveLeft: boolean): { markup: string; reach: number } {
  const gap = 3;
  const reach = ((count * 2 - 1) * gap) / 2;
  let d = '';
  for (let plate = 0; plate < count * 2; plate++) {
    const x = -reach + plate * gap;
    const long = (plate % 2 === 0) === positiveLeft;
    d += `M${fixed(x)} ${long ? -8 : -4}V${long ? 8 : 4}`;
  }
  const sign = positiveLeft ? -reach - 4 : reach + 4;
  return { markup: path(d) + path(`M${fixed(sign - 2)} -7h4M${fixed(sign)} -9v4`), reach };
}

const battery =
  (count: number): Draw =>
  (_props, def) => {
    const positiveLeft = pin(def, 'positive').x < pin(def, 'negative').x;
    const { markup, reach } = cells(count, positiveLeft);
    const flat = pin(def, 'positive').y === 0;
    const [left, right] = positiveLeft ? ['positive', 'negative'] : ['negative', 'positive'];
    const a = pin(def, left ?? '');
    const b = pin(def, right ?? '');
    return (
      path(
        flat
          ? `M${a.x} ${a.y}H${fixed(-reach)}M${b.x} ${b.y}H${fixed(reach)}`
          : `M${a.x} ${a.y}V0H${fixed(-reach)}M${b.x} ${b.y}V0H${fixed(reach)}`,
      ) + markup
    );
  };

const RESISTOR_BOX = '<rect x="-12" y="-5" width="24" height="10"/>';
const SMALL_RESISTOR = '<rect x="-7" y="-4" width="14" height="8"/>';

const diode =
  (zener: boolean): Draw =>
  (_props, def) =>
    axial(def, 6) +
    path(`M-6 -6V6L6 0zM6 -6V6${zener ? 'M6 -6h-3M6 6h3' : ''}`);

const bjt =
  (npn: boolean): Draw =>
  () =>
    // Base bar across the middle; emitter on the left leg, collector on the right.
    path('M0 20V4M-7 4H7M-10 20V-4L-3 4M10 20V-4L3 4') +
    (npn ? arrow(-3, 4, -9, -2.9) : arrow(-10, -4, -4, 2.9)) +
    text(-14, 14, 'E', 5) +
    text(4, 14, 'B', 5) +
    text(14, 14, 'C', 5);

const mosfet =
  (nChannel: boolean): Draw =>
  () =>
    // Gate plate on the left; drain on the middle leg, source (tied to the body) on the right.
    path('M-10 20V0H-7M-7 -7V7M-4 -8V-4M-4 -2V2M-4 4V8M0 20V6H-4M10 20V-6H-4M-4 0H10') +
    (nChannel ? arrow(6, 0, -3.4, 0) : arrow(-4, 0, 4, 0)) +
    text(-14, 14, 'G', 5) +
    text(4, 14, 'D', 5) +
    text(14, 14, 'S', 5);

const sounder: Draw = (_props, def) =>
  path(
    `M${pin(def, 'positive').x} ${pin(def, 'positive').y}V4M${pin(def, 'negative').x} ${pin(def, 'negative').y}V4M-12 4H12A12 12 0 0 0 -12 4z`,
  ) + path('M-13 12h4M-11 10v4');

/**
 * Vertical contact between a pin at (x, top) and one at (x, bottom).
 * 'no' rests open, 'nc' rests closed; `closed` draws a normally-open one shut.
 */
function contact(x: number, top: number, bottom: number, kind: 'no' | 'nc', closed = false): string {
  if (kind === 'nc') return path(`M${x} ${top}V-7H${x - 7}M${x} ${bottom}V7L${x - 6} -8.5`);
  return path(`M${x} ${top}V-7M${x} ${bottom}V7L${closed ? x : x - 6} ${closed ? -7 : -6}`);
}

/** Dashed line that ties together what moves at once. */
const link = (from: number, to: number, y = 0): string =>
  `<path d="M${from} ${y}H${to}" stroke-dasharray="2 2" stroke-width="0.8"/>`;

/** Terminal numbers of a part, next to each pin. */
const numbers = (def: PartDef): string =>
  def.pins.map((p) => text(p.x + 6.5, p.y < 0 ? p.y + 8 : p.y - 4, p.id, 4.2)).join('');

/** Coil between A1 (top) and A2 (bottom) at column x. */
const coil = (x: number, top: number, bottom: number): string =>
  path(`M${x} ${top}V-5M${x} ${bottom}V5`) + `<rect x="${x - 7}" y="-5" width="14" height="10"/>`;

const breakerSymbol: Draw = (props, def) => {
  const closed = stringProp(props, 'state') !== 'off';
  const columns = def.pins.filter((p) => p.y < 0).map((p) => p.x);
  return (
    columns
      .map(
        (x) =>
          contact(x, -40, 40, 'no', closed) +
          path(`M${x - 2} -9l4 4M${x + 2} -9l-4 4`) +
          // Thermal and magnetic releases.
          path(`M${x} 14h3v4h-3M${x} 24a2.5 2.5 0 0 1 0 5`),
      )
      .join('') +
    (columns.length > 1 ? link((columns[0] ?? 0) - 4, (columns[columns.length - 1] ?? 0) - 4) : '') +
    numbers(def)
  );
};

/** Hand-operated devices with two contacts side by side, and what moves them. */
const operated =
  (actuator: string): Draw =>
  (_props, def) => {
    const tops = def.pins.filter((p) => p.y < 0);
    return (
      tops
        .map((top, index) => contact(top.x, top.y, -top.y, index === 0 && def.type !== 'emergency-stop' ? 'no' : index === 0 ? 'nc' : def.type === 'emergency-stop' ? 'no' : 'nc'))
        .join('') +
      link(-21, 7) +
      actuator +
      numbers(def)
    );
  };

const SYMBOLS: Record<string, Draw> = {
  resistor: (_props, def) => axial(def, 12) + RESISTOR_BOX,
  fuse: (_props, def) => axial(def, 12) + '<rect x="-12" y="-4" width="24" height="8"/>' + path('M-12 0H12'),
  inductor: (_props, def) =>
    axial(def, 12) + path('M-12 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0a3 3 0 0 1 6 0'),
  diode: diode(false),
  zener: diode(true),
  capacitor: (_props, def) => legs(def, 2) + path('M-2 -7V7M2 -7V7'),
  'capacitor-electrolytic': (_props, def) =>
    legs(def, 2) + path('M-2 -7V7M2 -7V7M-8 -7h4M-6 -9v4'),
  crystal: (_props, def) => legs(def, 5) + path('M-5 -6V6M5 -6V6') + '<rect x="-3" y="-7" width="6" height="14"/>',
  led: (_props, def) =>
    path(`M${pin(def, 'anode').x} ${pin(def, 'anode').y}V0H-5M${pin(def, 'cathode').x} ${pin(def, 'cathode').y}V0H4M-5 -5V5L4 0zM4 -5V5M-2 -8l4 -5M3 -7l4 -5`) +
    arrow(-2, -8, 2, -13, 2.6) +
    arrow(3, -7, 7, -12, 2.6),
  'ntc-thermistor': (_props, def) =>
    legs(def, 7) + SMALL_RESISTOR + path('M-9 7h3L7 -8') + text(11, -8, '-t°', 5),
  ldr: (_props, def) =>
    legs(def, 7) + SMALL_RESISTOR + path('M-9 -14l5 6M-3 -15l5 6') + arrow(-9, -14, -4, -8, 2.6) + arrow(-3, -15, 2, -9, 2.6),
  potentiometer: () =>
    path('M-10 20V0H-7M10 20V0H7M0 20V5') + SMALL_RESISTOR + arrow(0, 12, 0, 4.2),
  buzzer: sounder,
  piezo: sounder,
  'motor-dc': (_props, def) =>
    path(`M${pin(def, 'positive').x} ${pin(def, 'positive').y}V0M${pin(def, 'negative').x} ${pin(def, 'negative').y}V0`) +
    '<circle cx="0" cy="0" r="10" fill="#fff"/>' +
    text(0, 2.5, 'M', 8) +
    path('M-15 8h4M-13 6v4'),
  'dc-supply': (_props, def) =>
    path(`M${pin(def, 'positive').x} ${pin(def, 'positive').y}V0M${pin(def, 'negative').x} ${pin(def, 'negative').y}V0`) +
    '<circle cx="0" cy="0" r="10" fill="#fff"/>' +
    path('M-7 0h4M-5 -2v4M3 0h4'),
  'battery-aa': battery(1),
  'battery-liion': battery(1),
  'battery-coin': battery(1),
  'battery-aa-x2': battery(2),
  'battery-aa-x4': battery(3),
  'battery-9v': battery(3),
  'bjt-npn': bjt(true),
  'bjt-pnp': bjt(false),
  'mosfet-n': mosfet(true),
  'mosfet-p': mosfet(false),
  scr: () => path('M0 20V8M-5 8H5L0 -1zM-5 -1H5M-10 20V-8H0V-1M10 20V4L5 -1'),
  triac: () =>
    path('M0 20V8M-8 8H8M-8 -2H8M-7 8H-1L-4 -2zM1 -2H7L4 8zM-10 20V-9H0V-2M10 20V3L6 -2'),
  transformer: () =>
    path(
      'M-30 -10H-6M-30 10H-6M30 -10H6M30 10H6' +
        'M-6 -10a3.33 3.33 0 0 1 0 6.67a3.33 3.33 0 0 1 0 6.67a3.33 3.33 0 0 1 0 6.66' +
        'M6 -10a3.33 3.33 0 0 0 0 6.67a3.33 3.33 0 0 0 0 6.67a3.33 3.33 0 0 0 0 6.66' +
        'M-1 -10V10M1 -10V10',
    ),
  'switch-spst': (props) =>
    path(`M-20 0H-8M20 0H8M-8 0L${stringProp(props, 'state') === 'on' ? '8 0' : '7 -7'}`) +
    '<circle cx="-8" cy="0" r="1.3" fill="#000"/><circle cx="8" cy="0" r="1.3" fill="#000"/>',
  'slide-switch': (props) =>
    path(`M-10 20V-4M10 20V-4M0 20V6M0 6L${stringProp(props, 'position') === '2' ? '9 -3' : '-9 -3'}`) +
    '<circle cx="0" cy="6" r="1.3" fill="#000"/><circle cx="-10" cy="-4" r="1.3" fill="#000"/><circle cx="10" cy="-4" r="1.3" fill="#000"/>',
  pushbutton: () =>
    // Each pair of legs is one terminal; the bar joins both when pressed.
    path('M-20 -10H0M20 -10H0M-20 10H0M20 10H0M-6 -10V1M6 10V1M-9 -3H9M0 -3V-7M-3 -7H3') +
    '<circle cx="-6" cy="1" r="1.3" fill="#000"/><circle cx="6" cy="1" r="1.3" fill="#000"/>',
  'ac-source-1ph': () =>
    path('M-10 40V8M0 40V16M10 40V24H0M0 16V8') +
    '<circle cx="-5" cy="0" r="10" fill="#fff"/>' +
    path('M-10 0q2.5 -5 5 0t5 0') +
    path('M7 27h6M8 29h4M9 31h2'),
  'button-start': () =>
    path('M0 -30V-6M0 30V6M0 6L-6 -5M-3 0H-10M-10 -4V4M-10 -4h-2M-10 4h-2'),
  'button-stop': () =>
    path('M0 -30V-6H4M0 30V6M0 6L5 -7M2.5 0H-10M-10 -4V4M-10 -4h-2M-10 4h-2'),
  'pilot-lamp': () =>
    path('M0 -30V-9M0 30V9M-6.4 -6.4L6.4 6.4M-6.4 6.4L6.4 -6.4') + '<circle cx="0" cy="0" r="9"/>',
  'motor-1ph': () =>
    path('M-10 -40V-4M10 -40V-4') + '<circle cx="0" cy="6" r="14" fill="#fff"/>' + text(0, 6, 'M', 8) + text(0, 13, '1~', 6),
  'motor-3ph': () =>
    path('M-20 -50V-10M0 -50V-15M20 -50V-10M-20 50V10M0 50V15M20 50V10') +
    '<circle cx="0" cy="0" r="22" fill="#fff"/>' +
    text(0, 0, 'M', 9) +
    text(0, 8, '3~', 6) +
    text(-25, -40, 'U1', 4.4) + text(5, -40, 'V1', 4.4) + text(25, -40, 'W1', 4.4) +
    text(-25, 44, 'W2', 4.4) + text(5, 44, 'U2', 4.4) + text(25, 44, 'V2', 4.4),
  contactor: (_props, def) =>
    coil(-50, -40, 40) +
    [-30, -10, 10, 30].map((x) => contact(x, -40, 40, 'no')).join('') +
    contact(50, -40, 40, 'nc') +
    link(-43, 46) +
    numbers(def),
  'thermal-overload': (_props, def) =>
    [-30, -10, 10]
      .map((x) => path(`M${x} -40V-8M${x} 40V8`) + `<rect x="${x - 4}" y="-8" width="8" height="16" fill="#fff"/>` + path(`M${x} -8v5h-2.5v6h2.5v5`))
      .join('') +
    contact(30, -40, 40, 'nc') +
    contact(50, -40, 40, 'no') +
    link(-26, 46) +
    numbers(def),
  'mcb-1p': breakerSymbol,
  'mcb-3p': breakerSymbol,
  'rcd-2p': (props, def) => {
    const closed = stringProp(props, 'state') !== 'off';
    return (
      contact(-10, -40, 40, 'no', closed) +
      contact(10, -40, 40, 'no', closed) +
      link(-14, 6) +
      // The sensing core around both conductors.
      '<ellipse cx="0" cy="22" rx="16" ry="4"/>' +
      `<path d="M-16 22H-20V0" stroke-dasharray="2 2" stroke-width="0.8"/>` +
      numbers(def)
    );
  },
  'emergency-stop': operated(path('M-21 -5a5.5 5.5 0 0 0 0 10z')),
  'selector-switch': operated(path('M-21 -4V4M-21 0h-3M-24 -3v6')),
  'limit-switch': operated('<circle cx="-23" cy="0" r="2.2"/>'),
  'timer-relay': (props, def) =>
    coil(-20, -40, 40) +
    // The small box marks the delay: crossed for on-delay, filled for off-delay.
    (stringProp(props, 'mode') === 'off-delay'
      ? '<rect x="-27" y="5" width="14" height="4" fill="#000"/>'
      : '<rect x="-27" y="5" width="14" height="4"/>' + path('M-27 5l14 4M-27 9l14 -4')) +
    path('M10 -40V-7L1 8M0 40V8M20 40V8') +
    link(-13, 4) +
    numbers(def),
  'panel-ammeter': () => path('M0 -30V-9M0 30V9') + '<circle cx="0" cy="0" r="9"/>' + text(0, 3, 'A', 9),
  'panel-voltmeter': () => path('M0 -30V-9M0 30V9') + '<circle cx="0" cy="0" r="9"/>' + text(0, 3, 'V', 9),
  wattmeter: (_props, def) =>
    path('M-10 -40V-12M-10 40V12M10 -40V0H2') + '<circle cx="-10" cy="0" r="12" fill="#fff"/>' + text(-10, 3.5, 'W', 10) + numbers(def),
  relay: () =>
    path('M-30 -10H-17V-5M-30 10H-17V5M30 0H12L1 -6M30 -10H0V-7M30 10H0V7') +
    '<rect x="-22" y="-5" width="10" height="10"/>' +
    '<path d="M-12 0H5" stroke-dasharray="2 2"/>',
};

/** Longest label that still fits next to its pin. */
const MAX_LABEL = 8;
const INSET = 6;

/** Generic symbol for chips, modules and boards: a box with every pin named. */
function box(def: PartDef, title: string): string {
  const { x, y, width, height } = def.bounds;
  const left = x + INSET;
  const right = x + width - INSET;
  const top = y + INSET;
  const bottom = y + height - INSET;
  let stubs = '';
  let labels = '';
  for (const { id, x: px, y: py } of def.pins) {
    const label = id.length > MAX_LABEL ? `${id.slice(0, MAX_LABEL - 1)}…` : id;
    const escaped = label.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const distances = [px - x, x + width - px, py - y, y + height - py];
    const side = distances.indexOf(Math.min(...distances));
    const attrs = 'font-size="4.2" font-family="monospace" fill="#000" stroke="none"';
    if (side === 0) {
      stubs += `M${px} ${py}H${left}`;
      labels += `<text x="${left + 1.5}" y="${py + 1.5}" ${attrs}>${escaped}</text>`;
    } else if (side === 1) {
      stubs += `M${px} ${py}H${right}`;
      labels += `<text x="${right - 1.5}" y="${py + 1.5}" text-anchor="end" ${attrs}>${escaped}</text>`;
    } else if (side === 2) {
      stubs += `M${px} ${py}V${top}`;
      labels += `<text x="${px + 1.5}" y="${top + 1.5}" text-anchor="end" transform="rotate(-90 ${px + 1.5} ${top + 1.5})" ${attrs}>${escaped}</text>`;
    } else {
      stubs += `M${px} ${py}V${bottom}`;
      labels += `<text x="${px + 1.5}" y="${bottom - 1.5}" transform="rotate(-90 ${px + 1.5} ${bottom - 1.5})" ${attrs}>${escaped}</text>`;
    }
  }
  const boxWidth = right - left;
  const fit = title.length * 3.1 > boxWidth - 4 ? ` textLength="${boxWidth - 4}" lengthAdjust="spacingAndGlyphs"` : '';
  const name = title.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return (
    `<rect x="${left}" y="${top}" width="${boxWidth}" height="${bottom - top}" fill="#fff"/>` +
    path(stubs) +
    labels +
    `<text x="${(left + right) / 2}" y="${top - 2}" font-size="5" font-family="monospace" text-anchor="middle" fill="#000" stroke="none"${fit}>${name}</text>`
  );
}

/** Breadboards disappear in a schematic: only the connections between their holes remain. */
function strips(def: PartDef): string {
  const at = new Map(def.pins.map((candidate) => [candidate.id, candidate]));
  let d = '';
  for (const [from, to] of def.bridges ?? []) {
    const a = at.get(from);
    const b = at.get(to);
    if (a && b) d += `M${a.x} ${a.y}L${b.x} ${b.y}`;
  }
  return `<path d="${d}" stroke-width="0.7" stroke="#8a8a8a"/>`;
}

/** True when the part has a drawn IEC symbol rather than the generic box. */
export const hasOwnSymbol = (type: string): boolean => type in SYMBOLS;

/** Schematic drawing of a part. `title` is shown on parts drawn as a box. */
export function symbolOf(def: PartDef, props: PartProps, title: string): string {
  const draw = SYMBOLS[def.type];
  const body = draw ? draw(props, def) : def.layer === 'base' ? strips(def) : box(def, title);
  return `<g fill="none" stroke="#000" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round">${body}</g>`;
}
