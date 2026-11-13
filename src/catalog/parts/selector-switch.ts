import { controlDevice } from '../industrial';

const head = (active: boolean): string => `
  <circle cx="0" cy="0" r="12" fill="#c3c8cd" stroke="#70777e"/>
  <g transform="rotate(${active ? 40 : -40})">
    <rect x="-3.5" y="-11" width="7" height="22" rx="3" fill="#17191b"/>
    <path d="M0 -9V-4" stroke="#ffffff" stroke-width="1.5" stroke-linecap="round"/>
  </g>`;

/** Two-position selector that stays where it is left. Position 1 closes 13-14 and opens 21-22. */
export default controlDevice({
  type: 'selector-switch',
  name: { es: 'Selector de 2 posiciones', en: 'Two-position selector switch' },
  keywords: ['selector', 'conmutador', 'llave', 'posiciones', 'manual', 'automatico', 'switch', 'rotary'],
  contacts: [
    { a: '13', b: '14', normallyOpen: true },
    { a: '21', b: '22', normallyOpen: false },
  ],
  action: 'toggle',
  head,
  positions: [
    { es: 'Posición 0', en: 'Position 0' },
    { es: 'Posición 1', en: 'Position 1' },
  ],
});
