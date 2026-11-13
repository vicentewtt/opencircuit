import { controlDevice } from '../industrial';

const head = (active: boolean): string => `
  <circle cx="0" cy="0" r="11" fill="#c3c8cd" stroke="#70777e"/>
  <circle cx="0" cy="0" r="${active ? 7.5 : 8.5}" fill="${active ? '#a8241c' : '#d93025'}" stroke="#7d1a14"/>`;

/** Red pushbutton with a normally-closed contact: opens while pressed. */
export default controlDevice({
  type: 'button-stop',
  name: { es: 'Pulsador de paro (NC)', en: 'Stop pushbutton (NC)' },
  keywords: ['pulsador', 'pushbutton', 'paro', 'parada', 'stop', 'rojo', 'red', 'nc', 'normalmente cerrado'],
  contacts: [{ a: '11', b: '12', normallyOpen: false }],
  action: 'momentary',
  head,
});
