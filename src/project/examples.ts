import type { LocalizedText } from '../catalog/types';
import { addPart, addWire, setPartLabel, setPartProp } from '../editor/model/ops';
import { routeWires } from '../editor/model/route';
import { EMPTY_DOC, type CircuitDoc } from '../editor/model/types';
import { defaultProgram, emptyRung, serializeProgram, tidy } from '../plc/ladder';

/** Ready-made circuits to open from the menu, built in code and routed tidy. */

export interface Example {
  id: string;
  name: LocalizedText;
  description: LocalizedText;
  build: () => CircuitDoc;
}

const RED = '#d93025';
const BLACK = '#202124';
const YELLOW = '#f2c200';
const BLUE = '#2f6fbf';
const GREEN = '#22a559';
const ORANGE = '#f29900';
const BROWN = '#7a4a21';
const GREY = '#8f969d';

/** Small helper to place parts and wire them by "partId.pinId". */
class Builder {
  doc: CircuitDoc = EMPTY_DOC;

  place(type: string, x: number, y: number, label?: string, props: Record<string, number | string> = {}): string {
    const result = addPart(this.doc, type, { x, y });
    this.doc = result.doc;
    if (label) this.doc = setPartLabel(this.doc, result.id, label);
    for (const [key, value] of Object.entries(props)) this.doc = setPartProp(this.doc, result.id, key, value);
    return result.id;
  }

  wire(from: string, to: string, color: string): void {
    const [fromPart = '', fromPin = ''] = from.split('.');
    const [toPart = '', toPin = ''] = to.split('.');
    const result = addWire(this.doc, { partId: fromPart, pinId: fromPin }, { partId: toPart, pinId: toPin }, [], color);
    if (!result) throw new Error(`Example wire ${from} -> ${to} is not valid`);
    this.doc = result.doc;
  }

  done(): CircuitDoc {
    return routeWires(this.doc);
  }
}

function ledBasic(): CircuitDoc {
  const b = new Builder();
  const battery = b.place('battery-9v', -160, 0, 'B1');
  const button = b.place('switch-spst', -40, -100, 'S1');
  const resistor = b.place('resistor', 80, -100, 'R1', { resistance: 470 });
  const led = b.place('led', 180, 0, 'D1', { color: 'red' });
  b.wire(`${battery}.positive`, `${button}.1`, RED);
  b.wire(`${button}.2`, `${resistor}.1`, ORANGE);
  b.wire(`${resistor}.2`, `${led}.anode`, ORANGE);
  b.wire(`${led}.cathode`, `${battery}.negative`, BLACK);
  return b.done();
}

function blinker555(): CircuitDoc {
  const b = new Builder();
  const battery = b.place('battery-9v', -300, 40, 'B1');
  const timer = b.place('ic-ne555', 0, 40, 'U1');
  const r1 = b.place('resistor', -120, -100, 'R1', { resistance: 1000 });
  const r2 = b.place('resistor', 0, -100, 'R2', { resistance: 68000 });
  const capacitor = b.place('capacitor-electrolytic', -120, 180, 'C1', { capacitance: 10e-6 });
  const resistor = b.place('resistor', 160, -40, 'R3', { resistance: 470 });
  const led = b.place('led', 260, 40, 'D1', { color: 'green' });
  const vcc = `${battery}.positive`;
  const gnd = `${battery}.negative`;
  b.wire(`${timer}.VCC`, vcc, RED);
  b.wire(`${timer}.RESET`, vcc, RED);
  b.wire(`${timer}.GND`, gnd, BLACK);
  b.wire(`${r1}.1`, vcc, RED);
  b.wire(`${r1}.2`, `${timer}.DIS`, ORANGE);
  b.wire(`${r2}.1`, `${timer}.DIS`, ORANGE);
  b.wire(`${r2}.2`, `${timer}.THR`, ORANGE);
  b.wire(`${timer}.THR`, `${timer}.TRIG`, ORANGE);
  b.wire(`${capacitor}.positive`, `${timer}.TRIG`, ORANGE);
  b.wire(`${capacitor}.negative`, gnd, BLACK);
  b.wire(`${timer}.OUT`, `${resistor}.1`, YELLOW);
  b.wire(`${resistor}.2`, `${led}.anode`, YELLOW);
  b.wire(`${led}.cathode`, gnd, BLACK);
  return b.done();
}

function counter09(): CircuitDoc {
  const b = new Builder();
  const supply = b.place('dc-supply', -460, 60, 'FUENTE', { voltage: 5 });
  const timer = b.place('ic-ne555', -240, 60, 'RELOJ');
  const r1 = b.place('resistor', -320, -80, 'R1', { resistance: 1000 });
  const r2 = b.place('resistor', -200, -80, 'R2', { resistance: 33000 });
  const capacitor = b.place('capacitor-electrolytic', -320, 200, 'C1', { capacitance: 10e-6 });
  const counter = b.place('ic-74163', 0, 60, 'CONTADOR');
  const nand = b.place('ic-74hc00', 0, -120, 'NAND');
  const decoder = b.place('ic-7447', 240, 60, 'DECO');
  const segments = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
  const resistors = segments.map((segment, index) =>
    b.place('resistor', 400, -100 + index * 50, `R${segment}`, { resistance: 330 }),
  );
  const display = b.place('seven-segment', 560, 60, 'DISPLAY', { common: 'anode' });
  const vcc = `${supply}.positive`;
  const gnd = `${supply}.negative`;
  for (const chip of [timer, counter, nand, decoder]) {
    b.wire(`${chip}.VCC`, vcc, RED);
    b.wire(`${chip}.GND`, gnd, BLACK);
  }
  b.wire(`${timer}.RESET`, vcc, RED);
  b.wire(`${display}.com1`, vcc, RED);
  b.wire(`${r1}.1`, vcc, RED);
  b.wire(`${r1}.2`, `${timer}.DIS`, ORANGE);
  b.wire(`${r2}.1`, `${timer}.DIS`, ORANGE);
  b.wire(`${r2}.2`, `${timer}.THR`, ORANGE);
  b.wire(`${timer}.THR`, `${timer}.TRIG`, ORANGE);
  b.wire(`${capacitor}.positive`, `${timer}.TRIG`, ORANGE);
  b.wire(`${capacitor}.negative`, gnd, BLACK);
  b.wire(`${timer}.OUT`, `${counter}.CLK`, YELLOW);
  // At 9 (QA and QD high) the NAND pulls nCLR low: the next clock goes to 0.
  b.wire(`${counter}.QA`, `${nand}.1A`, GREEN);
  b.wire(`${counter}.QD`, `${nand}.1B`, GREEN);
  b.wire(`${nand}.1Y`, `${counter}.nCLR`, GREEN);
  for (const input of ['2A', '2B', '3A', '3B', '4A', '4B']) b.wire(`${nand}.${input}`, gnd, BLACK);
  for (const bit of ['A', 'B', 'C', 'D']) b.wire(`${counter}.Q${bit}`, `${decoder}.${bit}`, BLUE);
  segments.forEach((segment, index) => {
    b.wire(`${decoder}.${segment}`, `${resistors[index]}.1`, BLUE);
    b.wire(`${resistors[index]}.2`, `${display}.${segment}`, BLUE);
  });
  return b.done();
}

const TRAFFIC_LIGHT = `// Traffic light: green, yellow, red.
const int RED_LED = 12;
const int YELLOW_LED = 11;
const int GREEN_LED = 10;

void setup() {
  pinMode(RED_LED, OUTPUT);
  pinMode(YELLOW_LED, OUTPUT);
  pinMode(GREEN_LED, OUTPUT);
}

void light(int pin, unsigned long ms) {
  digitalWrite(pin, HIGH);
  delay(ms);
  digitalWrite(pin, LOW);
}

void loop() {
  light(GREEN_LED, 3000);
  light(YELLOW_LED, 1000);
  light(RED_LED, 3000);
}
`;

function trafficLight(): CircuitDoc {
  const b = new Builder();
  const board = b.place('arduino-uno', 0, 0, 'ARDUINO', { code: TRAFFIC_LIGHT });
  const lights = [
    { pin: 'D12', color: 'red' },
    { pin: 'D11', color: 'yellow' },
    { pin: 'D10', color: 'green' },
  ];
  lights.forEach(({ pin, color }, index) => {
    const x = -80 + index * 80;
    const resistor = b.place('resistor', x, -260, `R${index + 1}`, { resistance: 220 });
    const led = b.place('led', x, -360, `D${index + 1}`, { color });
    b.wire(`${board}.${pin}`, `${resistor}.1`, ORANGE);
    b.wire(`${resistor}.2`, `${led}.anode`, ORANGE);
    b.wire(`${led}.cathode`, `${board}.GND1`, BLACK);
  });
  return b.done();
}

function motorStarter(): CircuitDoc {
  const b = new Builder();
  const mains = b.place('ac-source-3ph', -520, -260, 'RED');
  const breaker = b.place('mcb-3p', -260, -260, 'Q1', { rating: '6' });
  const contactor = b.place('contactor', -260, -60, 'KM1');
  const overload = b.place('thermal-overload', -260, 140, 'F1', { setting: 2.5 });
  const motor = b.place('motor-3ph', -260, 360, 'M1');
  const control = b.place('mcb-1p', 120, -260, 'Q2', { rating: '2' });
  const stop = b.place('button-stop', 120, -60, 'S0');
  const start = b.place('button-start', 260, -60, 'S1');
  const lamp = b.place('pilot-lamp', 400, 140, 'H1', { color: 'green' });
  const phases = ['L1', 'L2', 'L3'];
  const colors = [BROWN, BLACK, GREY];
  phases.forEach((phase, index) => {
    const color = colors[index] ?? BLACK;
    b.wire(`${mains}.${phase}`, `${breaker}.${index * 2 + 1}`, color);
    b.wire(`${breaker}.${index * 2 + 2}`, `${contactor}.${index * 2 + 1}L${index + 1}`, color);
    b.wire(`${contactor}.${index * 2 + 2}T${index + 1}`, `${overload}.${index * 2 + 1}L${index + 1}`, color);
    b.wire(`${overload}.${index * 2 + 2}T${index + 1}`, `${motor}.${['U1', 'V1', 'W1'][index]}`, color);
  });
  // Star connection in the terminal box.
  b.wire(`${motor}.W2`, `${motor}.U2`, BLACK);
  b.wire(`${motor}.U2`, `${motor}.V2`, BLACK);
  // Control circuit at 220 V: L1 - Q2 - stop - start // KM1 13-14 - F1 95-96 - coil - N.
  b.wire(`${mains}.L1`, `${control}.1`, RED);
  b.wire(`${control}.2`, `${stop}.11`, RED);
  b.wire(`${stop}.12`, `${start}.13`, RED);
  b.wire(`${stop}.12`, `${contactor}.13`, RED);
  b.wire(`${start}.14`, `${overload}.95`, RED);
  b.wire(`${contactor}.14`, `${overload}.95`, RED);
  b.wire(`${overload}.96`, `${contactor}.A1`, RED);
  b.wire(`${contactor}.A2`, `${mains}.N`, BLUE);
  b.wire(`${lamp}.X1`, `${contactor}.A1`, RED);
  b.wire(`${lamp}.X2`, `${mains}.N`, BLUE);
  return b.done();
}

function plcLatch(): CircuitDoc {
  const b = new Builder();
  // Start (I1) and stop (I2, NC button: high at rest) latch Q1; AI1 over 500 lights Q2.
  const latch = defaultProgram().rungs[0]!;
  latch.cells[0]![1] = { t: 'no', a: 'I2' };
  const level = emptyRung();
  level.cells[0]![0] = { t: 'cmp', a: 'AI1', op: '>', k: 500 };
  level.outputs[0] = { t: 'coil', a: 'Q2' };
  const program = serializeProgram({
    rungs: [latch, tidy(level)],
    names: { I1: 'Marcha', I2: 'Paro', Q1: 'Motor', Q2: 'Alarma', AI1: 'Nivel' },
  });
  const supply = b.place('dc-supply', -380, 0, 'FUENTE', { voltage: 24 });
  const plc = b.place('plc', 60, 0, 'PLC', { program });
  const start = b.place('button-start', -140, -200, 'S1');
  const stop = b.place('button-stop', -20, -200, 'S0');
  const resistor = b.place('resistor', 230, -200, 'R1', { resistance: 14000 });
  const pot = b.place('potentiometer', 330, -200, 'NIVEL', { resistance: 10000, position: 70 });
  const running = b.place('pilot-lamp', -40, 220, 'H1', { color: 'green', voltage: '24' });
  const alarm = b.place('pilot-lamp', 80, 220, 'H2', { color: 'red', voltage: '24' });
  const plus = `${supply}.positive`;
  const minus = `${supply}.negative`;
  b.wire(plus, `${plc}.L+`, RED);
  b.wire(minus, `${plc}.M`, BLUE);
  b.wire(plus, `${start}.13`, RED);
  b.wire(`${start}.14`, `${plc}.I1`, ORANGE);
  b.wire(plus, `${stop}.11`, RED);
  b.wire(`${stop}.12`, `${plc}.I2`, ORANGE);
  b.wire(plus, `${resistor}.1`, RED);
  b.wire(`${resistor}.2`, `${pot}.1`, ORANGE);
  b.wire(`${pot}.2`, minus, BLUE);
  b.wire(`${pot}.wiper`, `${plc}.AI1`, YELLOW);
  b.wire(plus, `${plc}.Q1A`, RED);
  b.wire(`${plc}.Q1B`, `${running}.X1`, ORANGE);
  b.wire(`${running}.X2`, minus, BLUE);
  b.wire(plus, `${plc}.Q2A`, RED);
  b.wire(`${plc}.Q2B`, `${alarm}.X1`, ORANGE);
  b.wire(`${alarm}.X2`, minus, BLUE);
  return b.done();
}

export const EXAMPLES: Example[] = [
  {
    id: 'led',
    name: { es: 'LED con interruptor', en: 'LED with a switch' },
    description: { es: 'Lo básico: pila, interruptor, resistencia y LED.', en: 'The basics: battery, switch, resistor and LED.' },
    build: ledBasic,
  },
  {
    id: 'blinker-555',
    name: { es: 'Intermitente con 555', en: '555 blinker' },
    description: { es: 'Un 555 astable hace parpadear un LED una vez por segundo.', en: 'An astable 555 blinks an LED once a second.' },
    build: blinker555,
  },
  {
    id: 'counter-0-9',
    name: { es: 'Contador 0-9', en: '0-9 counter' },
    description: { es: '555, 74163, 7400 y 7447 con display de ánodo común.', en: '555, 74163, 7400 and 7447 with a common-anode display.' },
    build: counter09,
  },
  {
    id: 'traffic-light',
    name: { es: 'Semáforo con Arduino', en: 'Arduino traffic light' },
    description: { es: 'Tres LEDs y un programa listo para compilar.', en: 'Three LEDs and a sketch ready to compile.' },
    build: trafficLight,
  },
  {
    id: 'motor-starter',
    name: { es: 'Partida directa de motor trifásico', en: 'Direct-on-line motor starter' },
    description: { es: 'Termomagnético, contactor con enclavamiento, relé térmico y luz piloto.', en: 'Breaker, self-holding contactor, overload relay and pilot light.' },
    build: motorStarter,
  },
  {
    id: 'plc-latch',
    name: { es: 'PLC: marcha/paro y nivel', en: 'PLC: start/stop and level' },
    description: { es: 'Enclavamiento en Ladder y alarma con entrada analógica.', en: 'Ladder self-holding and an alarm on an analog input.' },
    build: plcLatch,
  },
];
