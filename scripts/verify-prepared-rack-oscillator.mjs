// Compare actual paired AudioWorklet PCM through live authored topology changes.
// Launch only through with-private-null-audio.py.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const requireWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireWeb('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'https://wubulon.tailfac9f9.ts.net:4174';
const label = process.env.MANIFOLD_RACK_OSCILLATOR_PROOF_LABEL ?? '2026-09-30-prepared-rack-oscillator';
assert.match(label, /^[a-z0-9-]+$/);
const output = new URL(`../web/public/prepared-rack-oscillator/${label}/`, import.meta.url);
await mkdir(output, { recursive: true }); assert.deepEqual(await readdir(output), []);
const sources = ['crates/manifold-core/src/graph.rs', 'crates/manifold-core/src/oscillator.rs',
  'crates/manifold-core/src/lfo.rs', 'crates/manifold-core/src/distortion.rs',
  'crates/manifold-web/src/prepared_worklet.rs', 'packages/manifold-author/prepared-runtime.js',
  'packages/manifold-author/prepared-processor.js', 'packages/manifold-author/prepared-compiler.js',
  'packages/manifold-author/examples/rack-oscillator.mjs', 'packages/manifold-author/runtime/manifold_prepared.wasm'];
const hashes = {};
await mkdir(new URL('measured-source/', output));
for (const source of sources) {
  const bytes = await readFile(new URL(`../${source}`, import.meta.url));
  hashes[source] = createHash('sha256').update(bytes).digest('hex');
  await writeFile(new URL(`measured-source/${source.split('/').at(-1)}`, output), bytes);
}
function wav(pcm, stream) {
  const frames = pcm.length / 16, bytes = Buffer.alloc(44 + frames * 8);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(3, 20);
  bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(48000, 24); bytes.writeUInt32LE(384000, 28);
  bytes.writeUInt16LE(8, 32); bytes.writeUInt16LE(32, 34); bytes.write('data', 36);
  bytes.writeUInt32LE(frames * 8, 40);
  for (let frame = 0; frame < frames; frame++) pcm.copy(bytes, 44 + frame * 8, frame * 16 + stream * 8, frame * 16 + stream * 8 + 8);
  return bytes;
}
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
let evidence = null;
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 1000 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${site}/rack-oscillator.html?execution=prepared`);
  assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  // First use the actual creator controls, including the live insert button.
  await page.locator('#start').click();
  await page.waitForFunction(() => window.manifoldRackOscillator.host?.ready && !document.querySelector('#manualLevel').disabled);
  for (const [id, value] of [['manualLevel', '.5'], ['voiceGate', '.3'], ['unison', '4'], ['detune', '23'], ['spread', '.7'], ['renderMode', '1']]) {
    await page.locator(`#${id}`).evaluate((element, value) => { element.value = value; element.dispatchEvent(new Event('change')); }, value);
    await page.waitForFunction(id => !document.querySelector(`#${id}`).disabled, id);
  }
  await page.locator('#insert').click();
  await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Live insert changed'));
  const ui = await page.evaluate(() => ({ graph: window.manifoldRackOscillator.project.toProject(),
    diagnostics: window.manifoldRackOscillator.host.diagnostics }));
  await page.screenshot({ path: new URL(`../docs/rearchitecture/evidence/${label}.png`, import.meta.url).pathname, fullPage: true });
  await page.locator('#stop').click(); await page.waitForFunction(() => !window.manifoldRackOscillator.host);
  const result = await page.evaluate(async () => {
    const context = new AudioContext({ sampleRate: 48000 }); await context.suspend();
    const Host = window.manifoldRackOscillator.Host;
    const a = new Host(context, { execution: 'prepared' }), b = new Host(context, { execution: 'prepared' });
    const primary = window.manifoldRackOscillator.createProject(a), reference = window.manifoldRackOscillator.createProject(b);
    await a.prepare(primary.toProject()); await b.prepare(reference.toProject());
    const base = '/midi/synth/rack/osc/1';
    for (const project of [primary, reference]) {
      for (const [suffix, value] of [['manualLevel', .5], ['voice/1/gate', .3], ['unison', 4], ['detune', 23], ['spread', .7], ['renderMode', 1]]) {
        await project.set(`${base}/${suffix}`, value);
      }
    }
    const capacity = 480000, tape = new SharedArrayBuffer(capacity * 16), control = new SharedArrayBuffer(12);
    const recorderSource = `class Recorder extends AudioWorkletProcessor {
      constructor(o){super();this.t=new Float32Array(o.processorOptions.tape);this.c=new Int32Array(o.processorOptions.control);}
      process(i,o){const a=i[0],b=i[1],out=o[0],frames=out[0].length,start=Atomics.load(this.c,0);
        if(start===0)Atomics.store(this.c,1,currentFrame);
        if(start+frames>this.t.length/4){Atomics.store(this.c,2,1);return true;}
        for(let f=0;f<frames;f++){const p=(start+f)*4;this.t[p]=a?.[0]?.[f]??0;this.t[p+1]=(a?.[1]??a?.[0])?.[f]??0;
          this.t[p+2]=b?.[0]?.[f]??0;this.t[p+3]=(b?.[1]??b?.[0])?.[f]??0;out[0][f]=this.t[p];out[1][f]=this.t[p+1];}
        Atomics.store(this.c,0,start+frames);return true;}}
      registerProcessor('paired-rack-recorder',Recorder);`;
    const url = URL.createObjectURL(new Blob([recorderSource], { type: 'text/javascript' }));
    await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    const recorder = new AudioWorkletNode(context, 'paired-rack-recorder', { numberOfInputs: 2,
      outputChannelCount: [2], processorOptions: { tape, control } });
    const busA = context.createGain(), busB = context.createGain();
    a.connect(null, busA); b.connect(null, busB);
    busA.connect(recorder, 0, 0); busB.connect(recorder, 0, 1); recorder.connect(context.destination);
    await context.resume(); await new Promise(resolve => setTimeout(resolve, 200));
    const before = { primary: a.diagnostics, reference: b.diagnostics }, edits = [];
    for (let index = 0; index < 12; index++) {
      const started = performance.now();
      await primary.session.transaction(graph => {
        const path = `${base}/nodes/transparent_insert`, existing = graph.findInstance(path);
        const output = graph.findInstance(`${base}/nodes/output`);
        graph.disconnect(graph.output.input('in'));
        if (existing) { graph.remove(existing); graph.connect(output.output('out'), graph.output.input('in')); }
        else {
          const insert = graph.add('distortion', { id: 22 }); graph.registerInstance(path, insert);
          graph.setParameter(insert, 0, 1); graph.setParameter(insert, 1, 0); graph.setParameter(insert, 2, 1);
          graph.connect(output.output('out'), insert.input('audio')); graph.connect(insert.output('out'), graph.output.input('in'));
        }
      });
      edits.push({ index, totalMs: performance.now() - started, diagnostics: a.diagnostics });
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    await new Promise(resolve => setTimeout(resolve, 200)); await context.suspend();
    const c = new Int32Array(control), frames = c[0], pcm = new Float32Array(tape, 0, frames * 4);
    let maxDifference = 0, mismatchedSamples = 0, sum = 0, zeroBlocks = 0;
    for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < 2; channel++) {
      const value = pcm[frame * 4 + channel], error = Math.abs(value - pcm[frame * 4 + channel + 2]);
      maxDifference = Math.max(maxDifference, error); if (error !== 0) mismatchedSamples++;
      sum += value * value;
    }
    for (let start = 0; start + 128 <= frames; start += 128) {
      let zero = true; for (let frame = start; frame < start + 128; frame++) if (pcm[frame * 4] !== 0 || pcm[frame * 4 + 1] !== 0) { zero = false; break; }
      if (zero) zeroBlocks++;
    }
    const bytes = new Uint8Array(tape, 0, pcm.byteLength); let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    const after = { primary: a.diagnostics, reference: b.diagnostics }, finalGraph = primary.toProject();
    await a.close(); await b.close(); await context.close();
    return { pcmBase64: btoa(binary), frames, firstContextFrame: c[1], overflow: c[2] !== 0,
      maxDifference, mismatchedSamples, rms: Math.sqrt(sum / (frames * 2)), zeroBlocks,
      before, after, edits, finalGraph, controls: ['manual + gated voice', 'four unison voices', 'additive', 'stereo spread'] };
  });
  const pcm = Buffer.from(result.pcmBase64, 'base64'); delete result.pcmBase64;
  await writeFile(new URL('edited.wav', output), wav(pcm, 0));
  await writeFile(new URL('reference.wav', output), wav(pcm, 1));
  await writeFile(new URL('final-project.json', output), JSON.stringify(result.finalGraph, null, 2));
  const cdp = await browser.newBrowserCDPSession();
  const workers = (await cdp.send('Target.getTargets')).targetInfos.filter(t => t.type === 'worker' && t.url.includes('prepared-compiler'));
  evidence = { recordedAt: new Date().toISOString(), site, chromiumVersion: browser.version(), hashes, ui, ...result,
    audio: `/prepared-rack-oscillator/${label}/edited.wav`, referenceAudio: `/prepared-rack-oscillator/${label}/reference.wav`,
    workersAfterClose: workers, pageErrors: errors };
  await writeFile(new URL('report.json', output), JSON.stringify(evidence, null, 2));
  await writeFile(new URL(`../docs/rearchitecture/evidence/${label}.json`, import.meta.url), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ frames: result.frames, maxDifference: result.maxDifference, mismatchedSamples: result.mismatchedSamples,
    rms: result.rms, zeroBlocks: result.zeroBlocks, edits: result.edits.map(e => ({ totalMs: e.totalMs, transferred: e.diagnostics.lastTransferredNodes })), after: result.after }));
  assert.equal(result.maxDifference, 0); assert.equal(result.mismatchedSamples, 0);
  assert.equal(result.zeroBlocks, 0); assert.equal(result.overflow, false); assert.ok(result.rms > .001);
  assert.equal(ui.graph.signal.nodes.length, 14);
  for (const host of Object.values(result.after)) {
    assert.equal(host.rustProcessingFailures, 0); assert.equal(host.rustCallbackAllocations, 0); assert.equal(host.rustCallbackDeallocations, 0);
  }
  for (const edit of result.edits) assert.equal(edit.diagnostics.lastTransferredNodes, 11);
  assert.deepEqual(workers, []); assert.deepEqual(errors, []);
} catch (error) {
  await writeFile(new URL('failure.json', output), JSON.stringify({ recordedAt: new Date().toISOString(), error: error.stack, evidence }, null, 2));
  throw error;
} finally { await browser.close(); }
