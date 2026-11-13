import type { CategoryId, LocalizedText } from './types';

/** Display order of the component panel. Empty categories are hidden. */
export const CATEGORIES: { id: CategoryId; name: LocalizedText }[] = [
  { id: 'source', name: { es: 'Fuentes', en: 'Sources' } },
  { id: 'instrument', name: { es: 'Instrumentos', en: 'Instruments' } },
  { id: 'board', name: { es: 'Placas', en: 'Boards' } },
  { id: 'passive', name: { es: 'Pasivos', en: 'Passives' } },
  { id: 'semiconductor', name: { es: 'Semiconductores', en: 'Semiconductors' } },
  { id: 'ic', name: { es: 'Circuitos integrados', en: 'Integrated circuits' } },
  { id: 'input', name: { es: 'Entrada', en: 'Input' } },
  { id: 'sensor', name: { es: 'Sensores', en: 'Sensors' } },
  { id: 'output', name: { es: 'Salida', en: 'Output' } },
  { id: 'industrial', name: { es: 'Industrial IEC', en: 'Industrial IEC' } },
];
