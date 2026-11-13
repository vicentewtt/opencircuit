import { logicChip, risingEdge, type LogicOutputs } from '../logic';

const OUTPUTS = ['QA', 'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH'];

/** 8-bit shift register with output latch. Active-low pins carry an "n" prefix. */
export default logicChip({
  type: 'ic-74hc595',
  name: { es: '74HC595 · registro de desplazamiento', en: '74HC595 · shift register' },
  keywords: ['74hc595', '595', 'registro', 'desplazamiento', 'shift', 'register', 'serie', 'serial'],
  label: '74HC595',
  pins: [
    'QB', 'QC', 'QD', 'QE', 'QF', 'QG', 'QH', 'GND',
    "QH'", 'nSRCLR', 'SRCLK', 'RCLK', 'nOE', 'SER', 'QA', 'VCC',
  ],
  vcc: 'VCC',
  gnd: 'GND',
  outputs: [...OUTPUTS, "QH'"],
  init: () => ({ shift: 0, latch: 0 }),
  logic: (input, state) => {
    const shiftClock = risingEdge(state, 'srclk', input('SRCLK'));
    const latchClock = risingEdge(state, 'rclk', input('RCLK'));
    if (!input('nSRCLR')) state.shift = 0;
    else if (shiftClock) state.shift = (((state.shift ?? 0) << 1) | (input('SER') ? 1 : 0)) & 0xff;
    if (latchClock) state.latch = state.shift ?? 0;

    const enabled = !input('nOE');
    const levels: LogicOutputs = { "QH'": ((state.shift ?? 0) & 0x80) !== 0 };
    OUTPUTS.forEach((pin, bit) => {
      levels[pin] = enabled ? (((state.latch ?? 0) >> bit) & 1) === 1 : null;
    });
    return levels;
  },
});
