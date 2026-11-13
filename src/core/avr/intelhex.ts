/** Loads an Intel HEX image into a flash-sized byte array (erased flash is 0xFF). */
export function parseIntelHex(hex: string, flashSize: number): Uint8Array {
  const flash = new Uint8Array(flashSize).fill(0xff);
  let base = 0;
  for (const raw of hex.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    if (!/^:[0-9a-fA-F]{10,}$/.test(line) || line.length % 2 === 0) {
      throw new Error(`Invalid Intel HEX record: ${line.slice(0, 20)}`);
    }
    const bytes: number[] = [];
    for (let i = 1; i < line.length; i += 2) bytes.push(parseInt(line.slice(i, i + 2), 16));
    const count = bytes[0] ?? 0;
    if (bytes.length !== count + 5) throw new Error('Intel HEX record with wrong length');
    if (bytes.reduce((sum, byte) => sum + byte, 0) % 256 !== 0) {
      throw new Error('Intel HEX checksum mismatch');
    }
    const address = ((bytes[1] ?? 0) << 8) | (bytes[2] ?? 0);
    const type = bytes[3];
    if (type === 0x00) {
      for (let i = 0; i < count; i++) {
        const target = base + address + i;
        if (target >= flashSize) throw new Error('Program does not fit in flash');
        flash[target] = bytes[4 + i] ?? 0xff;
      }
    } else if (type === 0x01) {
      break;
    } else if (type === 0x02) {
      base = (((bytes[4] ?? 0) << 8) | (bytes[5] ?? 0)) << 4;
    } else if (type === 0x04) {
      base = (((bytes[4] ?? 0) << 8) | (bytes[5] ?? 0)) << 16;
    }
    // Start address records (03, 05) carry nothing to load.
  }
  return flash;
}
