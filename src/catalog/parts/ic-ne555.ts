import { dipBody, dipBounds, dipPins } from '../dip';
import { same, type PartDef } from '../types';

const PINS = ['GND', 'TRIG', 'OUT', 'RESET', 'CTRL', 'THR', 'DIS', 'VCC'];

const ne555: PartDef = {
  type: 'ic-ne555',
  category: 'ic',
  name: { es: 'NE555 · temporizador', en: 'NE555 · timer' },
  keywords: ['555', 'ne555', 'temporizador', 'timer', 'astable', 'monoestable', 'monostable', 'oscilador', 'oscillator'],
  refPrefix: 'U',
  bounds: dipBounds(4),
  pins: dipPins(PINS.map((id, index) => ({ id, name: same(`${index + 1} · ${id}`) }))),
  props: [],
  model: (ctx) => [
    // Internal divider: the control pin rests at 2/3 of the supply.
    { name: 'r1', kind: 'resistor', a: ctx.pin('VCC'), b: ctx.pin('CTRL'), ohms: 5000 },
    { name: 'r2', kind: 'resistor', a: ctx.pin('CTRL'), b: ctx.pin('GND'), ohms: 10000 },
    { name: 'OUT:hi', kind: 'switch', a: ctx.pin('VCC'), b: ctx.pin('OUT'), ohms: 20 },
    { name: 'OUT:lo', kind: 'switch', a: ctx.pin('OUT'), b: ctx.pin('GND'), ohms: 10 },
    { name: 'discharge', kind: 'switch', a: ctx.pin('DIS'), b: ctx.pin('GND'), ohms: 10 },
  ],
  behavior: {
    init: () => ({ q: 0 }),
    update: (io, state) => {
      const powered = io.v('VCC', 'GND') > 2;
      const control = io.v('CTRL', 'GND');
      // An unconnected reset pin is pulled high inside the chip.
      if (io.connected('RESET') && io.v('RESET', 'GND') < 0.7) state.q = 0;
      else if (io.v('TRIG', 'GND') < control / 2) state.q = 1;
      else if (io.v('THR', 'GND') > control) state.q = 0;

      const high = powered && state.q === 1;
      io.setSwitch('OUT:hi', high);
      io.setSwitch('OUT:lo', powered && !high);
      io.setSwitch('discharge', powered && !high);
    },
  },
  footprint: () => dipBody(4, 'NE555'),
};

export default ne555;
