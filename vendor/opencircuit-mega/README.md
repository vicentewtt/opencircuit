# OpenCircuit libraries for the Arduino Mega

Written for OpenCircuit (same license as the project). They follow the public
API of the Arduino Servo library and the Adafruit DHT sensor library, so the
same sketches compile for the Uno (which uses those original libraries) and
for the Mega (which uses these).

- `Servo`: up to 12 servos on Timer5, like the original on the Mega
  (PWM on pins 44, 45 and 46 stops while a servo is attached).
- `DHT`: DHT11, DHT12, DHT21/AM2301 and DHT22 over one data wire.
