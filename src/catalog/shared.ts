import type { PartDef } from './types';

/** Builders shared by parts that only differ in polarity. */

const LEADS =
  '<path d="M-10 20V6M0 20V6M10 20V6" stroke="#9aa0a6" stroke-width="2" stroke-linecap="round" fill="none"/>';

export function bjtDef(polarity: 1 | -1): PartDef {
  const npn = polarity === 1;
  const tag = npn ? 'NPN' : 'PNP';
  return {
    type: npn ? 'bjt-npn' : 'bjt-pnp',
    category: 'semiconductor',
    name: { es: `Transistor ${tag}`, en: `${tag} transistor` },
    keywords: ['transistor', 'bjt', tag.toLowerCase(), npn ? '2n2222' : '2n2907', npn ? 'bc547' : 'bc557'],
    refPrefix: 'Q',
    bounds: { x: -12, y: -14, width: 24, height: 34 },
    pins: [
      { id: 'e', name: { es: 'Emisor', en: 'Emitter' }, x: -10, y: 20 },
      { id: 'b', name: { es: 'Base', en: 'Base' }, x: 0, y: 20 },
      { id: 'c', name: { es: 'Colector', en: 'Collector' }, x: 10, y: 20 },
    ],
    props: [],
    model: (ctx) => [
      {
        name: 'main',
        kind: 'bjt',
        c: ctx.pin('c'),
        b: ctx.pin('b'),
        e: ctx.pin('e'),
        polarity,
        bf: 200,
        br: 5,
        is: 1e-14,
      },
    ],
    faults: () => [
      { element: 'main', quantity: 'current', max: 0.6, cause: 'overcurrent', action: 'burn' },
      { element: 'main', quantity: 'power', max: 0.6, cause: 'overpower', action: 'burn', tolerance: 0.5 },
    ],
    footprint: () => `
      ${LEADS}
      <path d="M-12 7V-2a12 12 0 0 1 24 0V7z" fill="#24272b" stroke="#0f1113"/>
      <text x="0" y="3" font-size="6" font-family="monospace" text-anchor="middle" fill="#c9cdd2">${tag}</text>`,
  };
}

export function mosfetDef(polarity: 1 | -1): PartDef {
  const nChannel = polarity === 1;
  const tag = nChannel ? 'N' : 'P';
  return {
    type: nChannel ? 'mosfet-n' : 'mosfet-p',
    category: 'semiconductor',
    name: { es: `MOSFET canal ${tag}`, en: `${tag}-channel MOSFET` },
    keywords: ['mosfet', 'fet', 'transistor', nChannel ? 'nmos' : 'pmos', nChannel ? 'irlz44n' : 'irf9540'],
    refPrefix: 'Q',
    bounds: { x: -14, y: -24, width: 28, height: 44 },
    pins: [
      { id: 'g', name: { es: 'Compuerta (G)', en: 'Gate (G)' }, x: -10, y: 20 },
      { id: 'd', name: { es: 'Drenador (D)', en: 'Drain (D)' }, x: 0, y: 20 },
      { id: 's', name: { es: 'Surtidor (S)', en: 'Source (S)' }, x: 10, y: 20 },
    ],
    props: [],
    model: (ctx) => [
      {
        name: 'main',
        kind: 'mosfet',
        d: ctx.pin('d'),
        g: ctx.pin('g'),
        s: ctx.pin('s'),
        polarity,
        vth: 2,
        kp: 1,
        lambda: 0.01,
      },
      // Body diode: conducts when the transistor is reverse biased.
      {
        name: 'body',
        kind: 'diode',
        a: ctx.pin(nChannel ? 's' : 'd'),
        k: ctx.pin(nChannel ? 'd' : 's'),
        is: 1e-12,
        n: 1,
      },
    ],
    faults: () => [
      { element: 'main', quantity: 'power', max: 2, cause: 'overpower', action: 'burn', tolerance: 0.5 },
    ],
    footprint: () => `
      ${LEADS}
      <rect x="-14" y="-24" width="28" height="12" rx="1" fill="#c3c8cd" stroke="#70777e"/>
      <circle cx="0" cy="-18" r="3" fill="#70777e"/>
      <rect x="-14" y="-13" width="28" height="20" rx="1" fill="#24272b" stroke="#0f1113"/>
      <text x="0" y="0" font-size="6" font-family="monospace" text-anchor="middle" fill="#c9cdd2">${tag}-MOS</text>`,
  };
}
