// Exercise the workbench's actual offline comparison renderer.
import fs from 'node:fs';
import path from 'node:path';
import { renderWasm } from '../web/src/reference/comparison.js';

const root = path.resolve(import.meta.dirname, '..');
const family = path.join(root, 'web/public/reference/midi-velocity-mapper');
const manifest = JSON.parse(fs.readFileSync(path.join(family, 'manifest.json')));
const selected = manifest.cases[0];
const bytes = fs.readFileSync(path.join(root, 'web/public/manifold_filter.wasm'));
const { instance } = await WebAssembly.instantiate(bytes, {});
const inputBytes = fs.readFileSync(path.join(family, manifest.input));
const input = new Float32Array(inputBytes.buffer, inputBytes.byteOffset, inputBytes.byteLength / 4);
const rendered = renderWasm(instance.exports, 'midi-velocity-mapper', manifest, input, selected);
const reference = fs.readFileSync(path.join(family, selected.output));
let max = 0;
for (let frame = 0; frame < rendered.length; frame++) {
  max = Math.max(max, Math.abs(rendered[frame] - reference.readFloatLE(frame * 4)));
}
if (max > 1e-6) throw new Error(`Comparison renderer mismatch: ${max}`);
console.log(`MIDI Velocity Mapper comparison renderer: max Δ ${max}`);
