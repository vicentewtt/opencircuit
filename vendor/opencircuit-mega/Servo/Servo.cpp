// Servo library for the ATmega2560, written for OpenCircuit.
//
// Timer5 counts in 0.5 us ticks. Its compare interrupt starts each servo's
// pulse in turn and ends it after the servo's width; once every servo had
// its pulse, it waits until 20 ms have passed and starts over.

#include "Servo.h"
#include <avr/interrupt.h>

#define TICKS_PER_US (F_CPU / 8000000L)

struct ServoSlot {
  uint8_t pin;
  volatile uint16_t ticks;
  volatile bool active;
};

static ServoSlot slots[MAX_SERVOS];
static uint8_t slotCount = 0;
static volatile int8_t current = -1;
static bool timerStarted = false;

static void startTimer() {
  TCCR5A = 0;
  TCCR5B = _BV(CS51);  // prescaler 8, normal counting
  TCNT5 = 0;
  TIFR5 = _BV(OCF5A);
  OCR5A = 100;
  TIMSK5 |= _BV(OCIE5A);
  timerStarted = true;
}

ISR(TIMER5_COMPA_vect) {
  if (current < 0) {
    TCNT5 = 0;  // a new 20 ms frame
  } else if (current < slotCount && slots[current].active) {
    digitalWrite(slots[current].pin, LOW);
  }
  current++;
  if (current < slotCount) {
    OCR5A = TCNT5 + slots[current].ticks;
    if (slots[current].active) digitalWrite(slots[current].pin, HIGH);
  } else {
    const uint16_t frame = (uint16_t)(REFRESH_INTERVAL * TICKS_PER_US);
    OCR5A = (uint16_t)(TCNT5 + 4) < frame ? frame : (uint16_t)(TCNT5 + 4);
    current = -1;
  }
}

Servo::Servo() : index(INVALID_SERVO), minUs(MIN_PULSE_WIDTH), maxUs(MAX_PULSE_WIDTH) {
  if (slotCount < MAX_SERVOS) {
    index = slotCount++;
    slots[index].ticks = DEFAULT_PULSE_WIDTH * TICKS_PER_US;
    slots[index].active = false;
  }
}

uint8_t Servo::attach(int pin) {
  return attach(pin, MIN_PULSE_WIDTH, MAX_PULSE_WIDTH);
}

uint8_t Servo::attach(int pin, int min, int max) {
  if (index == INVALID_SERVO) return INVALID_SERVO;
  pinMode(pin, OUTPUT);
  minUs = min;
  maxUs = max;
  slots[index].pin = pin;
  slots[index].active = true;
  if (!timerStarted) startTimer();
  return index;
}

void Servo::detach() {
  if (index == INVALID_SERVO) return;
  slots[index].active = false;
}

void Servo::write(int value) {
  // Small values are angles; larger ones are already pulse widths.
  if (value < MIN_PULSE_WIDTH) {
    value = constrain(value, 0, 180);
    value = map(value, 0, 180, minUs, maxUs);
  }
  writeMicroseconds(value);
}

void Servo::writeMicroseconds(int value) {
  if (index == INVALID_SERVO) return;
  value = constrain(value, minUs, maxUs);
  uint8_t oldSreg = SREG;
  cli();
  slots[index].ticks = (uint16_t)value * TICKS_PER_US;
  SREG = oldSreg;
}

int Servo::readMicroseconds() {
  if (index == INVALID_SERVO) return 0;
  return slots[index].ticks / TICKS_PER_US;
}

int Servo::read() {
  return map(readMicroseconds() + 1, minUs, maxUs, 0, 180);
}

bool Servo::attached() {
  return index != INVALID_SERVO && slots[index].active;
}
