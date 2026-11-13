import { controlDevice } from '../industrial';

const head = (active: boolean): string => `
  <rect x="-14" y="-6" width="28" height="14" rx="2" fill="#2f6fbf" stroke="#1d4780"/>
  <g transform="rotate(${active ? 0 : -25} -10 -6)">
    <path d="M-10 -6H8" stroke="#8f969d" stroke-width="2.4" stroke-linecap="round"/>
    <circle cx="10" cy="-8" r="3.2" fill="#c3c8cd" stroke="#70777e"/>
  </g>`;

/** Limit switch with a roller lever: while something pushes it, 13-14 closes and 21-22 opens. */
export default controlDevice({
  type: 'limit-switch',
  name: { es: 'Final de carrera', en: 'Limit switch' },
  keywords: ['final de carrera', 'limit switch', 'fin de carrera', 'microswitch', 'rodillo', 'roller', 'posicion'],
  contacts: [
    { a: '13', b: '14', normallyOpen: true },
    { a: '21', b: '22', normallyOpen: false },
  ],
  action: 'momentary',
  head,
});
