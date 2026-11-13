import { controlDevice } from '../industrial';

const head = (active: boolean): string => `
  <circle cx="0" cy="0" r="16" fill="#f2c200" stroke="#a98700"/>
  <circle cx="0" cy="0" r="${active ? 10 : 12}" fill="${active ? '#a8241c' : '#d93025'}" stroke="#7d1a14"/>
  <path d="M-5 -4a6.5 6.5 0 0 1 10 0M5 -4l1 -3M5 -4l-3 -0.5" fill="none" stroke="#ffffff" stroke-width="1.2" stroke-linecap="round"/>`;

/** Mushroom button that stays pressed until it is clicked again. Opens 11-12 and closes 23-24. */
export default controlDevice({
  type: 'emergency-stop',
  name: { es: 'Parada de emergencia', en: 'Emergency stop' },
  keywords: ['emergencia', 'emergency', 'parada', 'stop', 'seta', 'hongo', 'mushroom', 'seguridad', 'safety', 'e-stop'],
  contacts: [
    { a: '11', b: '12', normallyOpen: false },
    { a: '23', b: '24', normallyOpen: true },
  ],
  action: 'toggle',
  head,
  positions: [
    { es: 'Liberada', en: 'Released' },
    { es: 'Presionada (enclavada)', en: 'Pressed (latched)' },
  ],
});
