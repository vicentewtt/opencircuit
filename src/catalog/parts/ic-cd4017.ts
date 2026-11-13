import { logicChip, risingEdge, type LogicOutputs } from '../logic';

/** Decade counter with ten decoded outputs: one is high at a time. */
export default logicChip({
  type: 'ic-cd4017',
  name: { es: 'CD4017 · contador de décadas', en: 'CD4017 · decade counter' },
  keywords: ['4017', 'cd4017', 'contador', 'counter', 'decada', 'decade', 'secuenciador', 'sequencer'],
  label: 'CD4017',
  pins: [
    'Q5', 'Q1', 'Q0', 'Q2', 'Q6', 'Q7', 'Q3', 'GND',
    'Q8', 'Q4', 'Q9', 'CO', 'INH', 'CLK', 'RST', 'VCC',
  ],
  vcc: 'VCC',
  gnd: 'GND',
  outputs: ['Q0', 'Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'CO'],
  init: () => ({ count: 0 }),
  logic: (input, state) => {
    const clock = risingEdge(state, 'clk', input('CLK'));
    if (input('RST')) state.count = 0;
    else if (clock && !input('INH')) state.count = ((state.count ?? 0) + 1) % 10;

    const count = state.count ?? 0;
    // Carry out is high during the first half of the cycle.
    const levels: LogicOutputs = { CO: count < 5 };
    for (let n = 0; n < 10; n++) levels[`Q${n}`] = n === count;
    return levels;
  },
});
