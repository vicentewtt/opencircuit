import { logicChip, risingEdge } from '../logic';

/** 4-bit up/down counter with separate clocks, parallel load and clear. */
export default logicChip({
  type: 'ic-74hc193',
  name: { es: '74HC193 · contador ascendente/descendente', en: '74HC193 · up/down counter' },
  keywords: ['74hc193', '193', 'contador', 'counter', 'up', 'down', 'ascendente', 'descendente', 'binario', 'binary'],
  label: '74HC193',
  pins: [
    'B', 'QB', 'QA', 'DOWN', 'UP', 'QC', 'QD', 'GND',
    'D', 'C', 'nLOAD', 'nCO', 'nBO', 'CLR', 'A', 'VCC',
  ],
  vcc: 'VCC',
  gnd: 'GND',
  outputs: ['QA', 'QB', 'QC', 'QD', 'nCO', 'nBO'],
  init: () => ({ count: 0 }),
  logic: (input, state) => {
    const up = input('UP');
    const down = input('DOWN');
    const countUp = risingEdge(state, 'up', up);
    const countDown = risingEdge(state, 'down', down);
    let count = state.count ?? 0;
    if (input('CLR')) {
      count = 0;
    } else if (!input('nLOAD')) {
      count =
        (input('A') ? 1 : 0) | (input('B') ? 2 : 0) | (input('C') ? 4 : 0) | (input('D') ? 8 : 0);
    } else if (countUp && down) {
      // Each clock only counts while the other one rests high.
      count = (count + 1) & 15;
    } else if (countDown && up) {
      count = (count + 15) & 15;
    }
    state.count = count;
    return {
      QA: (count & 1) !== 0,
      QB: (count & 2) !== 0,
      QC: (count & 4) !== 0,
      QD: (count & 8) !== 0,
      // Carry and borrow pulse low to clock the next stage.
      nCO: !(count === 15 && !up),
      nBO: !(count === 0 && !down),
    };
  },
});
