import { rms, terminal } from './industrial';
import type { PartDef } from './types';

/** Panel meters with a digital display: true RMS, so they read AC and DC alike. */

/** Three significant digits with the unit, switching to milli- below 1. */
export function reading(value: number, unit: string): string {
  const size = Math.abs(value);
  if (size < 0.0005) return `0.00 ${unit}`;
  if (size < 1) return `${(value * 1000).toFixed(size < 0.1 ? 1 : 0)} m${unit}`;
  if (size < 1000) return `${value.toFixed(size < 10 ? 2 : size < 100 ? 1 : 0)} ${unit}`;
  return `${(value / 1000).toFixed(2)} k${unit}`;
}

export function display(lines: string[], width: number, y: number): string {
  const height = lines.length * 8 + 3;
  return `
    <rect x="${-width / 2}" y="${y}" width="${width}" height="${height}" rx="1.5" fill="#17191b"/>
    ${lines
      .map(
        (line, index) =>
          `<text x="0" y="${y + 8 + index * 8}" font-size="6.5" font-family="monospace" text-anchor="middle" fill="#ff9d2e">${line}</text>`,
      )
      .join('')}`;
}

export interface PanelMeter {
  type: string;
  name: { es: string; en: string };
  keywords: string[];
  unit: string;
  /** Resistance of the meter itself: tiny for an ammeter, huge for a voltmeter. */
  ohms: number;
  quantity: 'current' | 'voltage';
  letter: string;
}

export function panelMeter(meter: PanelMeter): PartDef {
  const pins = [terminal('1', 0, -30), terminal('2', 0, 30)];
  return {
    type: meter.type,
    category: 'industrial',
    name: meter.name,
    keywords: ['medidor', 'meter', 'panel', 'rms', 'industrial', ...meter.keywords],
    refPrefix: 'P',
    bounds: { x: -24, y: -30, width: 48, height: 60 },
    pins,
    props: [],
    model: (ctx) => [
      { name: 'main', kind: 'resistor', a: ctx.pin('1'), b: ctx.pin('2'), ohms: meter.ohms },
    ],
    behavior: {
      init: () => ({}),
      update: (io, state) => {
        const value = meter.quantity === 'current' ? io.i('main') : io.v('1', '2');
        io.aux('value', rms(state, 'value', value, io.dt, 0.08));
      },
    },
    footprint: (_props, visual) => `
      <path d="M0 -30V-18M0 30V18" stroke="#9aa0a6" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="-24" y="-20" width="48" height="40" rx="3" fill="#eceef0" stroke="#8f969d"/>
      ${display([reading(visual?.aux?.value ?? 0, meter.unit)], 42, -9)}
      <text x="0" y="15" font-size="6" font-family="monospace" text-anchor="middle" fill="#30353a">${meter.letter} RMS</text>`,
  };
}
