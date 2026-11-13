import { controlDevice } from '../industrial';

const head = (active: boolean): string => `
  <circle cx="0" cy="0" r="11" fill="#c3c8cd" stroke="#70777e"/>
  <circle cx="0" cy="0" r="${active ? 7.5 : 8.5}" fill="${active ? '#2c8a45' : '#3aa655'}" stroke="#1f6b3a"/>`;

/** Green pushbutton with a normally-open contact: closes while pressed. */
export default controlDevice({
  type: 'button-start',
  name: { es: 'Pulsador de marcha (NA)', en: 'Start pushbutton (NO)' },
  keywords: ['pulsador', 'pushbutton', 'marcha', 'start', 'verde', 'green', 'na', 'no', 'normalmente abierto'],
  contacts: [{ a: '13', b: '14', normallyOpen: true }],
  action: 'momentary',
  head,
});
