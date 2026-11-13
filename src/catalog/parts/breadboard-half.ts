import { breadboard } from '../breadboard';

export default breadboard({
  type: 'breadboard-half',
  name: { es: 'Protoboard 400 puntos', en: 'Breadboard, 400 points' },
  keywords: ['protoboard', 'breadboard', 'placa de pruebas', '400', 'media'],
  columns: 30,
  originColumn: 15,
  rails: { firstColumn: 1, groups: 5 },
});
