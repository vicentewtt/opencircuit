/**
 * Reader for the pack files produced by scripts/prepare-avr.mjs: a JSON
 * object mapping each virtual path to its content encoded in base64.
 */
export function unpack(data: Uint8Array): Map<string, Uint8Array> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(data));
  } catch {
    throw new Error('Not a pack file');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('Not a pack file');
  }
  const entries = new Map<string, Uint8Array>();
  for (const [path, encoded] of Object.entries(parsed)) {
    if (typeof encoded !== 'string') throw new Error(`Invalid pack entry: ${path}`);
    const binary = atob(encoded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    entries.set(path, bytes);
  }
  return entries;
}
