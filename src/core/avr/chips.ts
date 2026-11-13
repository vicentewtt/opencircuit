import {
  AVRUSART,
  ADCMuxInputType,
  ADCReference,
  adcConfig,
  eepromConfig,
  portAConfig,
  portBConfig,
  portCConfig,
  portDConfig,
  portEConfig,
  portFConfig,
  portGConfig,
  portHConfig,
  portJConfig,
  portKConfig,
  portLConfig,
  spiConfig,
  timer0Config,
  timer1Config,
  timer2Config,
  twiConfig,
  usart0Config,
  type ADCConfig,
  type ADCMuxConfiguration,
  type AVREEPROMConfig,
  type AVRExternalInterrupt,
  type AVRPortConfig,
  type AVRTimerConfig,
  type SPIConfig,
  type TWIConfig,
} from 'avr8js';

type USARTConfig = ConstructorParameters<typeof AVRUSART>[1];

/**
 * Peripherals of each emulated microcontroller. avr8js ships the ATmega328P
 * ones; the ATmega2560 ones below take their register addresses and
 * interrupt vectors from avr-libc's iomxx0_1.h.
 */

export type ChipId = 'atmega328p' | 'atmega2560';
export type PortName = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'J' | 'K' | 'L';

export interface ChipConfig {
  flashBytes: number;
  /**
   * Data memory past the first 256 bytes (avr8js adds those). It must reach
   * RAMEND, where the stack starts: 0x8FF on the ATmega328P, 0x21FF on the
   * ATmega2560, whose 8 KB of SRAM start after 512 bytes of registers.
   */
  sramBytes: number;
  eepromBytes: number;
  ports: Partial<Record<PortName, AVRPortConfig>>;
  timers: AVRTimerConfig[];
  /** The first one is wired to the serial monitor. */
  usarts: USARTConfig[];
  adc: ADCConfig;
  twi: TWIConfig;
  spi: SPIConfig;
  eeprom: AVREEPROMConfig;
}

const ATMEGA328P: ChipConfig = {
  flashBytes: 0x8000,
  sramBytes: 8192,
  eepromBytes: 1024,
  ports: { B: portBConfig, C: portCConfig, D: portDConfig },
  timers: [timer0Config, timer1Config, timer2Config],
  usarts: [usart0Config],
  adc: adcConfig,
  twi: twiConfig,
  spi: spiConfig,
  eeprom: eepromConfig,
};

/** Program address of interrupt vector `n` (_VECTOR(n) in avr-libc). */
const vector = (n: number): number => n * 2;

const externalInterrupt = (index: number): AVRExternalInterrupt => ({
  EICR: index < 4 ? 0x69 : 0x6a,
  EIMSK: 0x3d,
  EIFR: 0x3c,
  index,
  iscOffset: (index % 4) * 2,
  interrupt: vector(1 + index),
});

const pinChange = (index: number, pcmsk: number) => ({
  PCIE: index,
  PCICR: 0x68,
  PCIFR: 0x3b,
  PCMSK: pcmsk,
  pinChangeInterrupt: vector(9 + index),
  mask: 0xff,
  offset: 0,
});

/** A 16-bit timer of the ATmega2560 (3, 4 and 5 share a layout). */
function timer16(
  base: number,
  tifr: number,
  timsk: number,
  firstVector: number,
  port: AVRPortConfig,
  externalClockPin: number,
): AVRTimerConfig {
  return {
    ...timer1Config,
    TCCRA: base,
    TCCRB: base + 1,
    TCCRC: base + 2,
    TCNT: base + 4,
    ICR: base + 6,
    OCRA: base + 8,
    OCRB: base + 10,
    OCRC: base + 12,
    TIFR: tifr,
    TIMSK: timsk,
    captureInterrupt: vector(firstVector),
    compAInterrupt: vector(firstVector + 1),
    compBInterrupt: vector(firstVector + 2),
    compCInterrupt: vector(firstVector + 3),
    ovfInterrupt: vector(firstVector + 4),
    compPortA: port.PORT,
    compPinA: 3,
    compPortB: port.PORT,
    compPinB: 4,
    compPortC: port.PORT,
    compPinC: 5,
    externalClockPort: port.PORT,
    externalClockPin,
  };
}

const usart = (base: number, firstVector: number): USARTConfig => ({
  rxCompleteInterrupt: vector(firstVector),
  dataRegisterEmptyInterrupt: vector(firstVector + 1),
  txCompleteInterrupt: vector(firstVector + 2),
  UCSRA: base,
  UCSRB: base + 1,
  UCSRC: base + 2,
  UBRRL: base + 4,
  UBRRH: base + 5,
  UDR: base + 6,
});

/** ADC inputs: MUX4..0 picks ADC0-7; with MUX5 (0x20) the same codes pick ADC8-15. */
const ATMEGA2560_CHANNELS: ADCMuxConfiguration = {
  ...Object.fromEntries(
    Array.from({ length: 8 }, (_, n) => [
      [n, { type: ADCMuxInputType.SingleEnded, channel: n }],
      [0x20 + n, { type: ADCMuxInputType.SingleEnded, channel: 8 + n }],
    ]).flat(),
  ),
  0x1e: { type: ADCMuxInputType.Constant, voltage: 1.1 },
  0x1f: { type: ADCMuxInputType.Constant, voltage: 0 },
};

const ATMEGA2560: ChipConfig = {
  flashBytes: 0x40000,
  sramBytes: 0x2200 - 0x100,
  eepromBytes: 4096,
  ports: {
    A: portAConfig,
    B: { ...portBConfig, pinChange: pinChange(0, 0x6b), externalInterrupts: [] },
    C: { ...portCConfig, pinChange: undefined, externalInterrupts: [] },
    D: { ...portDConfig, pinChange: undefined, externalInterrupts: [0, 1, 2, 3].map(externalInterrupt) },
    E: { ...portEConfig, externalInterrupts: [null, null, null, null, ...[4, 5, 6, 7].map(externalInterrupt)] },
    F: portFConfig,
    G: portGConfig,
    H: portHConfig,
    J: portJConfig,
    K: { ...portKConfig, pinChange: pinChange(2, 0x6d), externalInterrupts: [] },
    L: portLConfig,
  },
  timers: [
    {
      ...timer0Config,
      compAInterrupt: vector(21),
      compBInterrupt: vector(22),
      ovfInterrupt: vector(23),
      compPortA: portBConfig.PORT,
      compPinA: 7,
      compPortB: portGConfig.PORT,
      compPinB: 5,
      externalClockPort: portDConfig.PORT,
      externalClockPin: 7,
    },
    {
      ...timer1Config,
      OCRC: 0x8c,
      captureInterrupt: vector(16),
      compAInterrupt: vector(17),
      compBInterrupt: vector(18),
      compCInterrupt: vector(19),
      ovfInterrupt: vector(20),
      compPortA: portBConfig.PORT,
      compPinA: 5,
      compPortB: portBConfig.PORT,
      compPinB: 6,
      compPortC: portBConfig.PORT,
      compPinC: 7,
      externalClockPort: portDConfig.PORT,
      externalClockPin: 6,
    },
    {
      ...timer2Config,
      compAInterrupt: vector(13),
      compBInterrupt: vector(14),
      ovfInterrupt: vector(15),
      compPortA: portBConfig.PORT,
      compPinA: 4,
      compPortB: portHConfig.PORT,
      compPinB: 6,
    },
    timer16(0x90, 0x38, 0x71, 31, portEConfig, 6),
    timer16(0xa0, 0x39, 0x72, 41, portHConfig, 7),
    timer16(0x120, 0x3a, 0x73, 46, portLConfig, 2),
  ],
  usarts: [usart(0xc0, 25), usart(0xc8, 36), usart(0xd0, 51), usart(0x130, 54)],
  adc: {
    ...adcConfig,
    adcInterrupt: vector(29),
    numChannels: 16,
    muxInputMask: 0x3f,
    muxChannels: ATMEGA2560_CHANNELS,
    adcReferences: [ADCReference.AREF, ADCReference.AVCC, ADCReference.Internal1V1, ADCReference.Internal2V56],
  },
  twi: { ...twiConfig, twiInterrupt: vector(39) },
  spi: { ...spiConfig, spiInterrupt: vector(24) },
  eeprom: { ...eepromConfig, eepromReadyInterrupt: vector(30) },
};

export const CHIPS: Record<ChipId, ChipConfig> = {
  atmega328p: ATMEGA328P,
  atmega2560: ATMEGA2560,
};
