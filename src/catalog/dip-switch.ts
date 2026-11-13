import type { ClickZone, ElementSpec } from './model';
import { DIP_BOTTOM_Y, DIP_TOP_Y, dipBounds, dipX } from './dip';
import { same, stringProp, type PartDef, type PinDef, type PropDef } from './types';

/** A row of independent on/off switches in a DIP package. */
export function dipSwitch(count: number): PartDef {
  const numbers = Array.from({ length: count }, (_, k) => k + 1);
  const pins: PinDef[] = [];
  const props: PropDef[] = [];
  const zones: ClickZone[] = [];
  for (const n of numbers) {
    const x = dipX(n - 1, count);
    pins.push({ id: `${n}a`, name: same(`${n}A`), x, y: DIP_TOP_Y });
    pins.push({ id: `${n}b`, name: same(`${n}B`), x, y: DIP_BOTTOM_Y });
    props.push({
      kind: 'select',
      key: `sw${n}`,
      label: { es: `Interruptor ${n}`, en: `Switch ${n}` },
      default: 'off',
      options: [
        { value: 'off', label: { es: 'Abierto (OFF)', en: 'Open (OFF)' } },
        { value: 'on', label: { es: 'Cerrado (ON)', en: 'Closed (ON)' } },
      ],
    });
    zones.push({
      x: x - 5,
      y: -6,
      width: 10,
      height: 22,
      action: { kind: 'toggle', prop: `sw${n}`, values: ['off', 'on'] },
    });
  }
  const bounds = dipBounds(count);

  return {
    type: `dip-switch-${count}`,
    category: 'input',
    name: { es: `DIP switch de ${count}`, en: `DIP switch, ${count} positions` },
    keywords: ['dip', 'switch', 'interruptor', 'interruptores', String(count)],
    refPrefix: 'SW',
    bounds,
    pins,
    props,
    model: (ctx) =>
      numbers
        .filter((n) => stringProp(ctx.props, `sw${n}`) === 'on')
        .map(
          (n): ElementSpec => ({
            name: `sw${n}`,
            kind: 'resistor',
            a: ctx.pin(`${n}a`),
            b: ctx.pin(`${n}b`),
            ohms: 0.01,
          }),
        ),
    interactive: { kind: 'zones', zones },
    footprint: (partProps) => {
      let legs = '';
      let sliders = '';
      for (const n of numbers) {
        const x = dipX(n - 1, count);
        const on = stringProp(partProps, `sw${n}`) === 'on';
        legs += `M${x} ${DIP_TOP_Y}v5M${x} ${DIP_BOTTOM_Y}v-5`;
        sliders += `<rect x="${x - 3}" y="-3" width="6" height="16" fill="#0f1113"/>
          <rect x="${x - 2.4}" y="${on ? -2.4 : 6.4}" width="4.8" height="6" fill="#f1eee2"/>`;
      }
      return `
        <path d="${legs}" stroke="#c3c8cd" stroke-width="3" fill="none"/>
        <rect x="${bounds.x + 1}" y="-6" width="${bounds.width - 2}" height="22" rx="1.5" fill="#c0392b" stroke="#7d241b"/>
        ${sliders}
        <text x="${bounds.x + 4}" y="-1.2" font-size="3.6" font-family="monospace" fill="#ffffff">ON</text>`;
    },
  };
}
