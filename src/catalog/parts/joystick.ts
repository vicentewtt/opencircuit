import { numberProp, type PartDef, type PropDef } from '../types';

const TRACK_OHMS = 10e3;

const axis = (key: string, es: string, en: string): PropDef => ({
  kind: 'number',
  key,
  label: { es, en },
  unit: '%',
  si: false,
  default: 0,
  min: -100,
  max: 100,
  slider: true,
});

/** Thumb joystick module: two potentiometers (X and Y) and a push button. */
const joystick: PartDef = {
  type: 'joystick',
  category: 'input',
  name: { es: 'Joystick analógico', en: 'Analog joystick' },
  keywords: ['joystick', 'palanca', 'analogico', 'analog', 'ky-023', 'mando', 'thumbstick'],
  refPrefix: 'JOY',
  bounds: { x: -40, y: -30, width: 76, height: 60 },
  pins: [
    { id: 'GND', name: { es: 'GND', en: 'GND' }, x: -40, y: -20 },
    { id: 'VCC', name: { es: '+5 V', en: '+5 V' }, x: -40, y: -10 },
    { id: 'VRX', name: { es: 'VRx (eje X)', en: 'VRx (X axis)' }, x: -40, y: 0 },
    { id: 'VRY', name: { es: 'VRy (eje Y)', en: 'VRy (Y axis)' }, x: -40, y: 10 },
    { id: 'SW', name: { es: 'SW (botón)', en: 'SW (button)' }, x: -40, y: 20 },
  ],
  props: [axis('x', 'Posición X', 'X position'), axis('y', 'Posición Y', 'Y position')],
  model: (ctx) => {
    const track = (name: string, pin: string, value: number) => {
      const ratio = Math.max(0, Math.min(1, (value + 100) / 200));
      return [
        { name: `${name}:top`, kind: 'resistor' as const, a: ctx.pin('VCC'), b: ctx.pin(pin), ohms: Math.max(1, TRACK_OHMS * (1 - ratio)) },
        { name: `${name}:bottom`, kind: 'resistor' as const, a: ctx.pin(pin), b: ctx.pin('GND'), ohms: Math.max(1, TRACK_OHMS * ratio) },
      ];
    };
    return [
      ...track('x', 'VRX', numberProp(ctx.props, 'x', 0)),
      ...track('y', 'VRY', numberProp(ctx.props, 'y', 0)),
      ...(ctx.input('pressed') > 0
        ? [{ name: 'button', kind: 'resistor' as const, a: ctx.pin('SW'), b: ctx.pin('GND'), ohms: 1 }]
        : []),
    ];
  },
  interactive: { kind: 'momentary', input: 'pressed' },
  footprint: (props, visual) => {
    const x = 6 + numberProp(props, 'x', 0) * 0.08;
    const y = -numberProp(props, 'y', 0) * 0.08;
    return `
      <path d="M-40 -20H-32M-40 -10H-32M-40 0H-32M-40 10H-32M-40 20H-32" stroke="#c9a227" stroke-width="2.4" stroke-linecap="round"/>
      <rect x="-34" y="-30" width="70" height="60" rx="3" fill="#17191b" stroke="#000000"/>
      <circle cx="6" cy="0" r="22" fill="#30353a" stroke="#0f1113"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${visual?.pressed ? 12 : 13}" fill="${visual?.pressed ? '#15181b' : '#4a4f55'}" stroke="#0f1113"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="#5d646b"/>`;
  },
};

export default joystick;
