import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const session = JSON.parse(await readFile(new URL('../crates/manifold-native/tests/fixtures/main-browser-v15-empty.json', import.meta.url)));
session.rack.fx1.selected = 5;
session.rack.fx1.mix = .35;
session.rack.fx1.parameters[5] = [.32, .7, .5, .5, .5];
session.rack.fx2.selected = 1;
session.rack.fx2.mix = .2;
session.rack.fx2.parameters[1] = [.4, .6, .2, .4, .3];
session.rack.filter.cutoff = 1800;
session.rack.adsr.attack = 8;
const native = spawnSync('cargo', ['run', '--quiet', '-p', 'manifold-native', '--example', 'main_session_render'],
  { cwd: new URL('..', import.meta.url).pathname, input: Buffer.from(JSON.stringify(session)), maxBuffer: 1024 * 1024 });
if (native.status !== 0) throw new Error(native.stderr.toString());
assert.equal(native.stdout.length, 8 * 128 * 8);

const wasm = await readFile(new URL('../web/public/manifold_filter.wasm', import.meta.url));
const { instance } = await WebAssembly.instantiate(wasm, {});
const e = instance.exports;
assert.equal(e.manifold_looper_prepare(48_000, 128), 1);
const set = (id, value) => assert.equal(e.manifold_looper_synth_parameter(id, value), 1, `parameter ${id}`);
const source = session.rack.source;
for (const [id, value] of [[0, source.waveform], [19, source.waveRender], [2, source.sampleRoot],
  [20, source.sampleXfade / 100], [16, source.sampleStretch], [5, source.pitchMode],
  [4, source.samplePitch], [6, source.blendMode], [3, source.keytrack],
  [7, source.blendDepth], [15, source.output], [1, source.sampleBlend * 2 - 1]]) set(id, value);
const adsr = session.rack.adsr;
for (const [id, value] of [[11, adsr.attack / 1000], [12, adsr.decay / 1000],
  [13, adsr.sustain / 100], [14, adsr.release / 1000]]) set(id, value);
const filter = session.rack.filter;
for (const [id, value] of [[21, filter.mode], [22, filter.cutoff], [23, filter.resonance]]) set(id, value);
for (const [base, fx] of [[128, session.rack.fx1], [136, session.rack.fx2]]) {
  set(base, fx.selected); set(base + 1, fx.mix);
  fx.parameters[fx.selected].forEach((value, index) => set(base + 2 + index, value));
}
session.rack.eq.bands.forEach((band, index) => {
  const base = 64 + index * 5;
  for (const [offset, value] of [[0, Number(band.enabled)], [1, band.type],
    [2, band.freq], [3, band.gain], [4, band.q]]) set(base + offset, value);
});
const output = new Float32Array(e.memory.buffer, e.manifold_looper_output_ptr(), 256);
let maximum = 0, energy = 0;
for (let block = 0; block < 8; block++) {
  if (block === 0) assert.equal(e.manifold_looper_synth_note(0, 60, 100), 1);
  if (block === 6) assert.equal(e.manifold_looper_synth_note(1, 60, 0), 1);
  assert.equal(e.manifold_looper_process(128), 1);
  for (let frame = 0; frame < 128; frame++) {
    for (let channel = 0; channel < 2; channel++) {
      const actual = output[frame + channel * 128];
      const expected = native.stdout.readFloatLE((block * 128 + frame) * 8 + channel * 4);
      maximum = Math.max(maximum, Math.abs(actual - expected));
      energy += Math.abs(actual);
    }
  }
}
assert.ok(energy > 1, `Main output should be audible: ${energy}`);
assert.ok(maximum < 1e-5, `native/Wasm session output differs by ${maximum}`);
console.log(`Main browser v15 session: native/Wasm eight-block audio max difference ${maximum}`);
