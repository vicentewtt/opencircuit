import { logicChip, type LogicOutputs } from '../logic';

const SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
/** Segments lit for each input value; 10 to 15 give the chip's odd symbols and a blank. */
const PATTERNS = [
  'abcdef', 'bc', 'abdeg', 'abcdg', 'bcfg', 'acdfg', 'cdefg', 'abc',
  'abcdefg', 'abcfg', 'deg', 'cdg', 'bfg', 'adfg', 'defg', '',
];

/**
 * BCD to 7-segment decoder for common-anode displays: each output pulls
 * its segment to ground to light it (it never drives high), through a
 * resistor per segment. nLT lights everything, nBI blanks the display and
 * nRBI blanks only a zero.
 */
export default logicChip({
  type: 'ic-7447',
  name: { es: '7447 · decodificador BCD a 7 segmentos', en: '7447 · BCD to 7-segment decoder' },
  keywords: ['7447', '74ls47', 'decodificador', 'decoder', 'deco', 'bcd', '7 segmentos', 'display', 'anodo comun'],
  label: '7447',
  pins: ['B', 'C', 'nLT', 'nBI', 'nRBI', 'D', 'A', 'GND', 'e', 'd', 'c', 'b', 'a', 'g', 'f', 'VCC'],
  vcc: 'VCC',
  gnd: 'GND',
  outputs: SEGMENTS,
  ttl: true,
  logic: (input) => {
    const value = (input('A') ? 1 : 0) | (input('B') ? 2 : 0) | (input('C') ? 4 : 0) | (input('D') ? 8 : 0);
    const blank = !input('nBI') || (value === 0 && !input('nRBI'));
    const lit = blank ? '' : !input('nLT') ? 'abcdefg' : (PATTERNS[value] ?? '');
    const levels: LogicOutputs = {};
    // Open collector: low to light a segment, released otherwise.
    for (const segment of SEGMENTS) levels[segment] = lit.includes(segment) ? false : null;
    return levels;
  },
});
