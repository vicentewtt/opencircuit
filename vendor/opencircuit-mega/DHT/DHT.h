// DHT temperature and humidity sensors, written for OpenCircuit.
// Same API as the Adafruit DHT sensor library.
#ifndef OPENCIRCUIT_DHT_H
#define OPENCIRCUIT_DHT_H

#include <Arduino.h>

#define DHT11 11
#define DHT12 12
#define DHT21 21
#define DHT22 22
#define AM2301 21

class DHT {
public:
  DHT(uint8_t pin, uint8_t type, uint8_t count = 6);
  void begin(uint8_t usec = 55);
  float readTemperature(bool fahrenheit = false, bool force = false);
  float readHumidity(bool force = false);
  float convertCtoF(float celsius);
  float convertFtoC(float fahrenheit);
  float computeHeatIndex(float temperature, float humidity, bool fahrenheit = true);
  bool read(bool force = false);

private:
  uint8_t data[5];
  uint8_t pin;
  uint8_t type;
  uint8_t pullTime;
  uint32_t lastReadTime;
  uint32_t maxCycles;
  bool lastResult;
  bool ranOnce;

  uint32_t expectPulse(bool level);
};

#endif
