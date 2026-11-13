import {
  AVRADC,
  AVREEPROM,
  AVRIOPort,
  AVRSPI,
  AVRTWI,
  AVRTimer,
  AVRUSART,
  CPU,
  EEPROMMemoryBackend,
  PinState,
  avrInstruction,
} from 'avr8js';
import type { I2cTarget, McuPin, PinDrive } from '../../catalog/model';
import type { PinDriver } from '../solver/devices';
import { CHIPS, type ChipId, type PortName } from './chips';
import { parseIntelHex } from './intelhex';

/**
 * An emulated ATmega328P or ATmega2560 running a compiled sketch, wired to the circuit
 * through pin drivers: outputs drive voltages, inputs and the ADC read them.
 */

const CLOCK_HZ = 16e6;
const VCC = 5;
/** Schmitt-trigger thresholds of the digital inputs (0.6 and 0.3 of Vcc). */
const INPUT_HIGH = 0.6 * VCC;
const INPUT_LOW = 0.3 * VCC;


interface Binding {
  pin: McuPin;
  driver: PinDriver;
  state: PinState;
  /** CPU cycle of the last state change within the current run. */
  since: number;
  highCycles: number;
  toggled: boolean;
  /** Last digital level fed to the MCU. */
  level: boolean;
  /** Last solved voltage of the pin. */
  volts: number;
  /** Fraction of the last run the pin spent high. */
  duty: number;
}

export class AvrRunner {
  private readonly cpu: CPU;
  private readonly ports: Partial<Record<PortName, AVRIOPort>>;
  private readonly adc: AVRADC;
  private readonly usart: AVRUSART;
  private readonly twi: AVRTWI;
  private readonly spi: AVRSPI;
  /** Modules that follow a pin cycle by cycle. */
  private watches: { pin: McuPin; last: PinDrive; tap: (drive: PinDrive) => void }[] = [];
  /** Input levels forced by modules, by pin id. */
  private readonly overrides = new Map<string, boolean>();
  private readonly i2cTargets = new Map<number, I2cTarget>();
  private spiTargets: ((byte: number) => number)[] = [];
  private bindings: Binding[] = [];
  private readonly rxQueue: number[] = [];
  private txBytes: number[] = [];
  /** Fraction of a CPU cycle left over from previous runs. */
  private cycleDebt = 0;
  /** A bound pin changed state during the current run. */
  private pinChanged = false;

  constructor(hex: string, chip: ChipId = 'atmega328p') {
    const config = CHIPS[chip];
    const flash = parseIntelHex(hex, config.flashBytes);
    this.cpu = new CPU(new Uint16Array(flash.buffer), config.sramBytes);
    for (const timer of config.timers) new AVRTimer(this.cpu, timer);
    this.twi = new AVRTWI(this.cpu, config.twi, CLOCK_HZ);
    this.spi = new AVRSPI(this.cpu, config.spi, CLOCK_HZ);
    this.attachBuses();
    new AVREEPROM(this.cpu, new EEPROMMemoryBackend(config.eepromBytes), config.eeprom);
    this.ports = {};
    for (const [name, port] of Object.entries(config.ports) as [PortName, NonNullable<(typeof config.ports)[PortName]>][]) {
      const io = new AVRIOPort(this.cpu, port);
      io.addListener(() => this.portChanged(name));
      this.ports[name] = io;
    }
    this.adc = new AVRADC(this.cpu, config.adc);
    const [main, ...others] = config.usarts;
    this.usart = new AVRUSART(this.cpu, main ?? config.usarts[0]!, CLOCK_HZ);
    this.usart.onByteTransmit = (byte) => this.txBytes.push(byte);
    this.usart.onRxComplete = () => this.feedSerial();
    // The Mega's other serial ports work, but nothing listens to them.
    for (const extra of others) new AVRUSART(this.cpu, extra, CLOCK_HZ);
  }

  /** Routes the hardware I2C and SPI transfers to the connected modules. */
  private attachBuses(): void {
    const { twi, spi, cpu } = this;
    let target: I2cTarget | undefined;
    twi.eventHandler = {
      start: () => twi.completeStart(),
      stop: () => {
        target?.end?.();
        target = undefined;
        twi.completeStop();
      },
      connectToSlave: (address, write) => {
        target = this.i2cTargets.get(address);
        if (target?.begin?.(!write) === false) target = undefined;
        twi.completeConnect(target !== undefined);
      },
      writeByte: (value) => twi.completeWrite(target ? target.write(value) : false),
      readByte: () => twi.completeRead(target ? target.read() & 0xff : 0xff),
    };
    spi.onByte = (value) => {
      let response = 0;
      for (const transfer of this.spiTargets) response = transfer(value);
      cpu.addClockEvent(() => spi.completeTransfer(response), spi.transferCycles);
    };
  }

  /** Simulated time of the CPU, exact to the cycle. */
  get seconds(): number {
    return this.cpu.cycles / CLOCK_HZ;
  }

  /** Forgets the modules attached to pins and buses (they are attached again after every change). */
  clearLinks(): void {
    this.watches = [];
    this.i2cTargets.clear();
    this.spiTargets = [];
  }

  private driveOf(pin: McuPin): PinDrive {
    if (!pin.port) return 'float';
    const state = (this.ports[pin.port]?.pinState(pin.bit ?? 0) ?? PinState.Input);
    return state === PinState.High ? 'high' : state === PinState.Low ? 'low' : 'float';
  }

  /** Calls `tap` at the exact cycle the pin changes between high, low and input. */
  watch(pin: McuPin, tap: (drive: PinDrive) => void): void {
    this.watches.push({ pin, last: this.driveOf(pin), tap });
  }

  /** Level the pin drives right now, or null while it is an input. */
  outputLevel(pin: McuPin): boolean | null {
    const drive = this.driveOf(pin);
    return drive === 'float' ? null : drive === 'high';
  }

  /** Forces what the program reads on a pin; null returns it to the circuit. */
  override(pin: McuPin, level: boolean | null): void {
    if (!pin.port) return;
    const binding = this.bindings.find((candidate) => candidate.pin.id === pin.id);
    let next = level;
    if (next === null) {
      if (!this.overrides.delete(pin.id)) return;
      const volts = binding?.volts ?? 0;
      next = volts > INPUT_HIGH ? true : volts < INPUT_LOW ? false : (binding?.level ?? false);
    } else {
      this.overrides.set(pin.id, next);
    }
    if (binding) binding.level = next;
    this.ports[pin.port]?.setPin(pin.bit ?? 0, next);
  }

  /** Runs `task` after `seconds` of CPU time. */
  after(seconds: number, task: () => void): void {
    this.cpu.addClockEvent(task, Math.max(1, Math.round(seconds * CLOCK_HZ)));
  }

  addI2c(address: number, target: I2cTarget): void {
    if (!this.i2cTargets.has(address)) this.i2cTargets.set(address, target);
  }

  addSpi(transfer: (byte: number) => number): void {
    this.spiTargets.push(transfer);
  }

  /** Connects the MCU pins to the drivers of the current netlist. */
  bind(pins: readonly { pin: McuPin; driver: PinDriver }[]): void {
    const previous = new Map(this.bindings.map((binding) => [binding.pin.id, binding]));
    this.bindings = pins.map(({ pin, driver }) => {
      const old = previous.get(pin.id);
      const state = pin.port ? (this.ports[pin.port]?.pinState(pin.bit ?? 0) ?? PinState.Input) : PinState.Input;
      return {
        pin,
        driver,
        state,
        since: this.cpu.cycles,
        highCycles: 0,
        toggled: false,
        level: old?.level ?? false,
        volts: old?.volts ?? 0,
        duty: old?.duty ?? 0,
      };
    });
    this.applyOutputs(1);
  }

  private portChanged(name: PortName): void {
    const now = this.cpu.cycles;
    for (const binding of this.bindings) {
      if (binding.pin.port !== name) continue;
      const state = (this.ports[name]?.pinState(binding.pin.bit ?? 0) ?? PinState.Input);
      if (state === binding.state) continue;
      if (binding.state === PinState.High) binding.highCycles += now - binding.since;
      binding.state = state;
      binding.since = now;
      binding.toggled = true;
      this.pinChanged = true;
    }
    for (const entry of this.watches) {
      if (entry.pin.port !== name) continue;
      const drive = this.driveOf(entry.pin);
      if (drive === entry.last) continue;
      entry.last = drive;
      entry.tap(drive);
    }
  }

  /** Pushes the pin states of the last `span` cycles to the drivers. */
  private applyOutputs(span: number): boolean {
    let changed = false;
    const now = this.cpu.cycles;
    for (const binding of this.bindings) {
      if (!binding.pin.port) continue;
      if (binding.state === PinState.High) binding.highCycles += now - binding.since;
      if (binding.state === PinState.Input || binding.state === PinState.InputPullUp) {
        binding.duty = 0;
        changed = binding.driver.setInput(binding.state === PinState.InputPullUp) || changed;
      } else {
        // A pin that switched during the interval drives its average level,
        // which is what makes PWM dim an LED or charge a filter correctly.
        binding.duty = binding.toggled
          ? Math.min(1, binding.highCycles / span)
          : binding.state === PinState.High
            ? 1
            : 0;
        changed = binding.driver.setOutput(VCC * binding.duty) || changed;
      }
      binding.since = now;
      binding.highCycles = 0;
      binding.toggled = false;
    }
    return changed;
  }

  /**
   * Runs the CPU for up to `seconds`. With `stopOnChange` it returns as soon
   * as a pin changes, so the circuit can react before the program reads its
   * inputs again. Reports the time actually run and whether a driver changed.
   */
  run(seconds: number, stopOnChange: boolean): { seconds: number; changed: boolean } {
    const cpu = this.cpu;
    const exact = seconds * CLOCK_HZ + this.cycleDebt;
    const cycles = Math.floor(exact);
    if (cycles <= 0) {
      this.cycleDebt = exact;
      return { seconds, changed: false };
    }
    const start = cpu.cycles;
    const target = start + cycles;
    this.pinChanged = false;
    this.feedSerial();
    let stopped = false;
    while (cpu.cycles < target) {
      avrInstruction(cpu);
      cpu.tick();
      if (stopOnChange && this.pinChanged) {
        stopped = cpu.cycles < target;
        break;
      }
    }
    const ran = cpu.cycles - start;
    this.cycleDebt = stopped ? 0 : exact - cycles;
    const changed = this.applyOutputs(ran);
    return { seconds: stopped ? ran / CLOCK_HZ : seconds, changed };
  }

  /** Feeds the solved pin voltages back to the digital inputs and the ADC. */
  sense(x: Float64Array): void {
    for (const binding of this.bindings) {
      const volts = binding.driver.voltage(x);
      const { pin } = binding;
      if (pin.adc !== undefined) {
        this.adc.channelValues[pin.adc] = Math.min(VCC, Math.max(0, volts));
      }
      binding.volts = volts;
      if (!pin.port || this.overrides.has(pin.id)) continue;
      const level = volts > INPUT_HIGH ? true : volts < INPUT_LOW ? false : binding.level;
      if (level !== binding.level) {
        binding.level = level;
        this.ports[pin.port]?.setPin(pin.bit ?? 0, level);
      }
    }
  }

  private feedSerial(): void {
    while (this.rxQueue.length > 0 && !this.usart.rxBusy) {
      if (this.usart.writeByte(this.rxQueue[0] as number) === false) break;
      this.rxQueue.shift();
    }
  }

  /** Queues bytes for the sketch to read with Serial.read(). */
  serialWrite(bytes: Uint8Array): void {
    for (const byte of bytes) this.rxQueue.push(byte);
  }

  /** Bytes printed by the sketch since the last call. */
  takeSerialOutput(): Uint8Array {
    const bytes = Uint8Array.from(this.txBytes);
    this.txBytes = [];
    return bytes;
  }

  /** Fraction of the last run a pin spent high (0 for inputs). */
  duty(pinId: string): number {
    return this.bindings.find((binding) => binding.pin.id === pinId)?.duty ?? 0;
  }
}
