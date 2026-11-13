import { describe, expect, it } from 'vitest';
import { PART_DEFS, defaultProps, requirePartDef } from './registry';
import { hasOwnSymbol, symbolOf } from './symbols';

describe('schematic symbols', () => {
  it('every part draws something valid', () => {
    for (const def of PART_DEFS) {
      const markup = symbolOf(def, defaultProps(def), def.name.en);
      expect(markup.length, def.type).toBeGreaterThan(60);
      expect(markup, def.type).not.toMatch(/undefined|NaN/);
      // Black on white only.
      const colors = new Set(markup.match(/#[0-9a-fA-F]{3,8}/g) ?? []);
      for (const color of colors) expect(['#000', '#fff', '#8a8a8a'], def.type).toContain(color);
    }
  });

  it('basic parts have their own IEC symbol', () => {
    for (const type of [
      'resistor', 'potentiometer', 'capacitor', 'capacitor-electrolytic', 'inductor', 'fuse', 'transformer',
      'crystal', 'diode', 'zener', 'led', 'bjt-npn', 'bjt-pnp', 'mosfet-n', 'mosfet-p', 'scr', 'triac',
      'pushbutton', 'switch-spst', 'slide-switch', 'ldr', 'ntc-thermistor', 'buzzer', 'piezo', 'motor-dc',
      'relay', 'dc-supply', 'battery-9v', 'battery-aa', 'battery-aa-x2', 'battery-aa-x4', 'battery-liion',
      'battery-coin', 'contactor', 'thermal-overload', 'mcb-1p', 'mcb-3p', 'rcd-2p', 'emergency-stop',
      'selector-switch', 'limit-switch', 'timer-relay', 'button-start', 'button-stop', 'pilot-lamp',
      'motor-3ph', 'motor-1ph', 'ac-source-1ph', 'panel-ammeter', 'panel-voltmeter', 'wattmeter',
    ]) {
      expect(hasOwnSymbol(type), type).toBe(true);
    }
  });

  it('symbol leads start exactly at the pins, so wires stay attached', () => {
    for (const def of PART_DEFS) {
      if (!hasOwnSymbol(def.type)) continue;
      const markup = symbolOf(def, defaultProps(def), '');
      for (const pin of def.pins) {
        expect(markup, `${def.type}.${pin.id}`).toContain(`M${pin.x} ${pin.y}`);
      }
    }
  });

  it('chips are boxes with every pin named, and breadboards are just their strips', () => {
    const chip = requirePartDef('ic-ne555');
    const markup = symbolOf(chip, {}, 'NE555');
    for (const pin of chip.pins) expect(markup).toContain(`>${pin.id}<`);
    expect(markup).toContain('>NE555<');

    const board = requirePartDef('breadboard-mini');
    const lines = symbolOf(board, {}, '');
    expect(lines).not.toContain('<rect');
    expect(lines.split('M').length - 1).toBe(board.bridges?.length);
  });

  it('switches show their position', () => {
    const def = requirePartDef('switch-spst');
    expect(symbolOf(def, { state: 'on' }, '')).not.toBe(symbolOf(def, { state: 'off' }, ''));
  });
});
