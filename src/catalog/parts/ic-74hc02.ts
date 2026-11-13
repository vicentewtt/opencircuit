import { quadGate } from '../logic';

export default quadGate('02', { es: 'NOR', en: 'NOR' }, (a, b) => !(a || b));
