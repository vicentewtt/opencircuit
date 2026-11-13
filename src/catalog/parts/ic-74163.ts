import { logicChip, risingEdge } from '../logic';

/**
 * Synchronous 4-bit binary counter. Everything happens on the rising edge
 * of the clock: clear (nCLR low), load A-D (nLOAD low) or count (ENP and
 * ENT high). RCO goes high at 15 to chain a second counter.
 */
export default logicChip({
  type: 'ic-74163',
  name: { es: '74163 · contador síncrono de 4 bits', en: '74163 · synchronous 4-bit counter' },
  keywords: ['74163', '74ls163', '163', 'contador', 'counter', 'sincrono', 'synchronous', 'binario', 'binary'],
  label: '74163',
  pins: ['nCLR', 'CLK', 'A', 'B', 'C', 'D', 'ENP', 'GND', 'nLOAD', 'ENT', 'QD', 'QC', 'QB', 'QA', 'RCO', 'VCC'],
  vcc: 'VCC',
  gnd: 'GND',
  outputs: ['QA', 'QB', 'QC', 'QD', 'RCO'],
  ttl: true,
  init: () => ({ count: 0 }),
  logic: (input, state) => {
    let count = state.count ?? 0;
    if (risingEdge(state, 'clk', input('CLK'))) {
      if (!input('nCLR')) count = 0;
      else if (!input('nLOAD')) {
        count = (input('A') ? 1 : 0) | (input('B') ? 2 : 0) | (input('C') ? 4 : 0) | (input('D') ? 8 : 0);
      } else if (input('ENP') && input('ENT')) count = (count + 1) & 15;
    }
    state.count = count;
    return {
      QA: (count & 1) !== 0,
      QB: (count & 2) !== 0,
      QC: (count & 4) !== 0,
      QD: (count & 8) !== 0,
      RCO: count === 15 && input('ENT'),
    };
  },
});
