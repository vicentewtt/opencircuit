// Servo library for the ATmega2560, written for OpenCircuit.
// Same API as the Arduino Servo library.
#ifndef OPENCIRCUIT_SERVO_H
#define OPENCIRCUIT_SERVO_H

#include <Arduino.h>

#define MIN_PULSE_WIDTH 544
#define MAX_PULSE_WIDTH 2400
#define DEFAULT_PULSE_WIDTH 1500
#define REFRESH_INTERVAL 20000
#define MAX_SERVOS 12
#define INVALID_SERVO 255

class Servo {
public:
  Servo();
  uint8_t attach(int pin);
  uint8_t attach(int pin, int min, int max);
  void detach();
  void write(int value);
  void writeMicroseconds(int value);
  int read();
  int readMicroseconds();
  bool attached();

private:
  uint8_t index;
  int minUs;
  int maxUs;
};

#endif
