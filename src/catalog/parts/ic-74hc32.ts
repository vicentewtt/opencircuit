import { quadGate } from '../logic';

export default quadGate('32', { es: 'OR', en: 'OR' }, (a, b) => a || b);
