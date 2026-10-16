export const SAMPLE_TYPES = new Set(['sample-region', 'sample-instrument', 'granulator', 'main-voice-bank']);
export const PCM_ASSET_TYPES = new Set([...SAMPLE_TYPES, 'loop-capture']);

// Cache successful validation of immutable encoded strings, never decoded
// buffers or caller-owned objects. Bound both entry count and UTF-16 storage;
// large assets still validate normally without being retained here.
const VALIDATED_PAYLOAD_BUDGET = 8 * 1024 * 1024;
const validatedPayloads = new Map();
let validatedPayloadBytes = 0;

function rememberPayload(payload) {
  if (validatedPayloads.has(payload)) return;
  const bytes = payload.length * 2;
  if (bytes > VALIDATED_PAYLOAD_BUDGET) return;
  while (validatedPayloads.size >= 8 || validatedPayloadBytes + bytes > VALIDATED_PAYLOAD_BUDGET) {
    const oldest = validatedPayloads.keys().next().value;
    validatedPayloads.delete(oldest);
    validatedPayloadBytes -= oldest.length * 2;
  }
  validatedPayloads.set(payload, true);
  validatedPayloadBytes += bytes;
}

function encodedBytes(bytes) {
  const parts = [];
  for (let start = 0; start < bytes.length; start += 8190) {
    const chunk = bytes.subarray(start, start + 8190);
    if (typeof btoa === 'function') parts.push(btoa(String.fromCharCode(...chunk)));
    else {
      const encoded = new Uint8Array(4 * Math.ceil(chunk.length / 3));
      let position = 0;
      for (let index = 0; index < chunk.length; index += 3) {
        const value = (chunk[index] << 16) | ((chunk[index + 1] ?? 0) << 8) | (chunk[index + 2] ?? 0);
        for (const shift of [18, 12]) encoded[position++] = BASE64.charCodeAt((value >>> shift) & 63);
        encoded[position++] = index + 1 < chunk.length ? BASE64.charCodeAt((value >>> 6) & 63) : 61;
        encoded[position++] = index + 2 < chunk.length ? BASE64.charCodeAt(value & 63) : 61;
      }
      // Keep argument lists bounded in native JS engines as well as browsers.
      let part = '';
      for (let offset = 0; offset < encoded.length; offset += 8190) {
        part += String.fromCharCode(...encoded.subarray(offset, offset + 8190));
      }
      parts.push(part);
    }
  }
  return parts.join('');
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function validMetadata({ sourceRate, frames, label }) {
  return Number.isInteger(sourceRate) && sourceRate >= 8000 && sourceRate <= 384000
    && Number.isSafeInteger(frames) && frames >= 1
    && Number.isSafeInteger(frames * 8)
    && typeof label === 'string';
}

export function encodeSampleAsset(nodeId, stereo, sourceRate, label) {
  const frames = stereo?.length / 2;
  if (!(stereo instanceof Float32Array) || !validMetadata({ sourceRate, frames, label })
    || stereo.some(sample => !Number.isFinite(sample))) {
    throw new TypeError('Invalid decoded stereo sample');
  }
  const bytes = new Uint8Array(stereo.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < stereo.length; index++) view.setFloat32(index * 4, stereo[index], true);
  return { nodeId, sourceRate, frames, label, pcmF32Base64: encodedBytes(bytes) };
}

function checkAssetMetadata(asset) {
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)
    || Object.keys(asset).length !== 5
    || !['nodeId', 'sourceRate', 'frames', 'label', 'pcmF32Base64']
      .every(key => Object.hasOwn(asset, key))) {
    throw new TypeError('Invalid portable sample asset');
  }
  // Read caller-owned fields once. Cache decisions and the retained record
  // must describe the same payload even when input properties are accessors.
  const value = { nodeId: asset.nodeId, sourceRate: asset.sourceRate,
    frames: asset.frames, label: asset.label, pcmF32Base64: asset.pcmF32Base64 };
  if (!Number.isInteger(value.nodeId) || value.nodeId < 1 || value.nodeId > 0xffffffff
    || !validMetadata(value) || typeof value.pcmF32Base64 !== 'string'
    || value.pcmF32Base64.length !== 4 * Math.ceil(value.frames * 8 / 3)) {
    throw new TypeError('Invalid portable sample asset');
  }
  return value;
}

function decodeBytes(asset, knownValid) {
  if (!knownValid && !/^[A-Za-z0-9+/]*={0,2}$/.test(asset.pcmF32Base64)) {
    throw new TypeError('Invalid portable sample asset');
  }
  let bytes;
  if (typeof atob === 'function') {
    const binary = atob(asset.pcmF32Base64);
    if (binary.length !== asset.frames * 8) throw new TypeError('Invalid PCM byte count');
    bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  } else {
    bytes = new Uint8Array(asset.frames * 8);
    let position = 0;
    for (let index = 0; index < asset.pcmF32Base64.length; index += 4) {
      const part = asset.pcmF32Base64.slice(index, index + 4);
      const value = (BASE64.indexOf(part[0]) << 18) | (BASE64.indexOf(part[1]) << 12)
        | ((part[2] === '=' ? 0 : BASE64.indexOf(part[2])) << 6)
        | (part[3] === '=' ? 0 : BASE64.indexOf(part[3]));
      bytes[position++] = value >>> 16;
      if (part[2] !== '=') bytes[position++] = value >>> 8;
      if (part[3] !== '=') bytes[position++] = value;
    }
    if (position !== bytes.length) throw new TypeError('Invalid PCM byte count');
  }
  if (!knownValid && encodedBytes(bytes) !== asset.pcmF32Base64) {
    throw new TypeError('Noncanonical PCM encoding');
  }
  return bytes;
}

// Internal project validation does not need to materialize a Float32Array.
// Metadata is checked on every call even when the identical payload is known.
export function validateSampleAsset(asset) {
  asset = checkAssetMetadata(asset);
  if (validatedPayloads.has(asset.pcmF32Base64)) return asset;
  const bytes = decodeBytes(asset, false);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < asset.frames * 2; index++) {
    if (!Number.isFinite(view.getFloat32(index * 4, true))) throw new TypeError('Nonfinite PCM sample');
  }
  rememberPayload(asset.pcmF32Base64);
  return asset;
}

export function decodeSampleAsset(asset) {
  asset = checkAssetMetadata(asset);
  const knownValid = validatedPayloads.has(asset.pcmF32Base64);
  const bytes = decodeBytes(asset, knownValid);
  const view = new DataView(bytes.buffer);
  const stereo = new Float32Array(asset.frames * 2);
  for (let index = 0; index < stereo.length; index++) {
    const value = view.getFloat32(index * 4, true);
    if (!Number.isFinite(value)) throw new TypeError('Nonfinite PCM sample');
    stereo[index] = value;
  }
  rememberPayload(asset.pcmF32Base64);
  return { nodeId: asset.nodeId, sourceRate: asset.sourceRate, stereo };
}
