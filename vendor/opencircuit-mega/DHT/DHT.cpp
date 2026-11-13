// DHT temperature and humidity sensors, written for OpenCircuit.
//
// The board holds the data line low to ask for a reading, then releases it.
// The sensor answers with 80 us low and 80 us high, then 40 bits: each one
// is 50 us low followed by a high pulse, short for a 0 and long for a 1.

#include "DHT.h"

#define MIN_INTERVAL 2000
#define TIMEOUT UINT32_MAX

DHT::DHT(uint8_t pin, uint8_t type, uint8_t count)
    : pin(pin), type(type), pullTime(55), lastReadTime(0), maxCycles(0), lastResult(false), ranOnce(false) {
  (void)count;
  for (uint8_t i = 0; i < 5; i++) data[i] = 0;
}

void DHT::begin(uint8_t usec) {
  pinMode(pin, INPUT_PULLUP);
  maxCycles = microsecondsToClockCycles(1000);
  pullTime = usec;
  ranOnce = false;
}

float DHT::readTemperature(bool fahrenheit, bool force) {
  float value = NAN;
  if (!read(force)) return value;
  switch (type) {
    case DHT11:
      value = data[2];
      if (data[3] & 0x80) value = -1 - value;
      value += (data[3] & 0x0f) * 0.1;
      break;
    case DHT12:
      value = data[2] + (data[3] & 0x0f) * 0.1;
      if (data[2] & 0x80) value *= -1;
      break;
    default:
      value = (((uint16_t)(data[2] & 0x7f)) << 8 | data[3]) * 0.1;
      if (data[2] & 0x80) value *= -1;
      break;
  }
  return fahrenheit ? convertCtoF(value) : value;
}

float DHT::readHumidity(bool force) {
  if (!read(force)) return NAN;
  if (type == DHT11 || type == DHT12) return data[0] + data[1] * 0.1;
  return (((uint16_t)data[0]) << 8 | data[1]) * 0.1;
}

float DHT::convertCtoF(float celsius) { return celsius * 1.8 + 32; }

float DHT::convertFtoC(float fahrenheit) { return (fahrenheit - 32) * 0.55555; }

float DHT::computeHeatIndex(float temperature, float humidity, bool fahrenheit) {
  if (!fahrenheit) temperature = convertCtoF(temperature);
  float index = 0.5 * (temperature + 61.0 + ((temperature - 68.0) * 1.2) + (humidity * 0.094));
  if (index > 79) {
    index = -42.379 + 2.04901523 * temperature + 10.14333127 * humidity +
            -0.22475541 * temperature * humidity + -0.00683783 * pow(temperature, 2) +
            -0.05481717 * pow(humidity, 2) + 0.00122874 * pow(temperature, 2) * humidity +
            0.00085282 * temperature * pow(humidity, 2) +
            -0.00000199 * pow(temperature, 2) * pow(humidity, 2);
  }
  return fahrenheit ? index : convertFtoC(index);
}

/** Loops while the line stays at `level`; returns the count, or TIMEOUT. */
uint32_t DHT::expectPulse(bool level) {
  uint32_t count = 0;
  while (digitalRead(pin) == level) {
    if (count++ >= maxCycles) return TIMEOUT;
  }
  return count;
}

bool DHT::read(bool force) {
  uint32_t now = millis();
  if (!force && ranOnce && (now - lastReadTime) < MIN_INTERVAL) return lastResult;
  ranOnce = true;
  lastReadTime = now;
  for (uint8_t i = 0; i < 5; i++) data[i] = 0;

  // Ask for a reading: the line goes low for long enough, then is released.
  pinMode(pin, INPUT_PULLUP);
  delay(1);
  pinMode(pin, OUTPUT);
  digitalWrite(pin, LOW);
  if (type == DHT22 || type == DHT21) delayMicroseconds(1100);
  else delay(20);

  uint32_t cycles[80];
  {
    noInterrupts();
    pinMode(pin, INPUT_PULLUP);
    delayMicroseconds(pullTime);
    if (expectPulse(LOW) == TIMEOUT || expectPulse(HIGH) == TIMEOUT) {
      interrupts();
      lastResult = false;
      return lastResult;
    }
    for (int i = 0; i < 80; i += 2) {
      cycles[i] = expectPulse(LOW);
      cycles[i + 1] = expectPulse(HIGH);
    }
    interrupts();
  }

  for (int i = 0; i < 40; ++i) {
    uint32_t low = cycles[2 * i];
    uint32_t high = cycles[2 * i + 1];
    if (low == TIMEOUT || high == TIMEOUT) {
      lastResult = false;
      return lastResult;
    }
    data[i / 8] <<= 1;
    if (high > low) data[i / 8] |= 1;
  }
  lastResult = data[4] == ((data[0] + data[1] + data[2] + data[3]) & 0xff);
  return lastResult;
}
