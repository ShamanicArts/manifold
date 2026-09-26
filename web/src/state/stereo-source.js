// Bounded interleaved stereo float32 PCM for portable project state.
export function encodePcm(stereo) {
  const bytes = new Uint8Array(stereo.length * 4);
  const view = new DataView(bytes.buffer);
  stereo.forEach((value, index) => view.setFloat32(index * 4, value, true));
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  return btoa(chunks.join(''));
}

export function decodePcm(encoded, frames) {
  const bytesLength = frames * 8;
  if (typeof encoded !== 'string' || encoded.length !== 4 * Math.ceil(bytesLength / 3)
    || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)) {
    throw new Error('Invalid embedded stereo PCM.');
  }
  const binary = atob(encoded);
  if (binary.length !== bytesLength) throw new Error('Embedded PCM length does not match its frame count.');
  const bytes = new Uint8Array(bytesLength);
  for (let index = 0; index < bytesLength; index++) bytes[index] = binary.charCodeAt(index);
  const view = new DataView(bytes.buffer);
  const stereo = new Float32Array(frames * 2);
  for (let index = 0; index < stereo.length; index++) {
    const value = view.getFloat32(index * 4, true);
    if (!Number.isFinite(value)) throw new Error('Embedded PCM contains a non-finite sample.');
    stereo[index] = value;
  }
  return stereo;
}
