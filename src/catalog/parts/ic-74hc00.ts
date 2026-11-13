import { quadGate } from '../logic';

export default quadGate('00', { es: 'NAND', en: 'NAND' }, (a, b) => !(a && b));
