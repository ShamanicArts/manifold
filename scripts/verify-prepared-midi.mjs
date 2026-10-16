// Real public API, private audio, retained PCM and old Lua event reference.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const requireWeb = createRequire(new URL('../web/package.json', import.meta.url));
const { chromium } = requireWeb('playwright-core');
const site = process.env.MANIFOLD_SITE_URL ?? 'https://wubulon.tailfac9f9.ts.net:4174';
const label = process.env.MANIFOLD_PREPARED_MIDI_PROOF_LABEL ?? '2026-09-30-prepared-midi';
assert.match(label, /^[a-z0-9-]+$/);
const output = new URL(`../web/public/prepared-midi/${label}/`, import.meta.url);
await mkdir(output, { recursive: true }); assert.deepEqual(await readdir(output), [], 'Evidence destination exists');
const sourcePaths = ['crates/manifold-core/src/graph.rs','crates/manifold-core/src/voice.rs',
  'crates/manifold-core/src/midi_transpose.rs','crates/manifold-core/src/midi_note_router.rs',
  'crates/manifold-web/src/lib.rs','crates/manifold-web/src/prepared_worklet.rs',
  'packages/manifold-author/prepared-runtime.js','packages/manifold-author/prepared-processor.js',
  'packages/manifold-author/prepared-compiler.js','packages/manifold-author/browser.js',
  'packages/manifold-author/examples/transpose-audition.mjs','packages/manifold-author/runtime/manifold_prepared.wasm',
  'packages/manifold-author/catalog.generated.js','web/src/prepared-midi.js'];
const hashes = {}; await mkdir(new URL('measured-source/', output));
for (const source of sourcePaths) {
  const bytes = await readFile(new URL(`../${source}`, import.meta.url));
  hashes[source] = createHash('sha256').update(bytes).digest('hex');
  await writeFile(new URL(`measured-source/${source.split('/').at(-1)}`, output), bytes);
}
const legacy = execFileSync('lua', ['tools/legacy-midi-transpose.lua'], { cwd: new URL('../', import.meta.url), encoding: 'utf8' }).trim().split('\n');
await writeFile(new URL('legacy-events.json', output), JSON.stringify(legacy, null, 2));
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true,
  args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
let evidence = null;
function wave(pcm, stream) {
  const frames = pcm.length / 16, bytes = Buffer.alloc(44 + frames * 8);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVE', 8);
  bytes.write('fmt ', 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(3, 20); bytes.writeUInt16LE(2, 22);
  bytes.writeUInt32LE(48000, 24); bytes.writeUInt32LE(384000, 28); bytes.writeUInt16LE(8, 32); bytes.writeUInt16LE(32, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(frames * 8, 40);
  for (let frame = 0; frame < frames; frame++) pcm.copy(bytes, 44 + frame * 8, frame * 16 + stream * 8, frame * 16 + stream * 8 + 8);
  return bytes;
}
try {
  const page = await browser.newPage({ viewport: { width: 1200, height: 1100 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${site}/prepared-midi.html`); assert.equal(await page.evaluate(() => crossOriginIsolated), true);
  await page.locator('#start').click(); await page.waitForFunction(() => window.manifoldPreparedMidi.host?.ready && !document.querySelector('#insert').disabled);
  await page.locator('[data-note="60"]').click();
  await page.waitForFunction(() => window.manifoldPreparedMidi.host.diagnostics.eventsConsumed === 1);
  await page.locator('#insert').click(); await page.waitForFunction(() => !document.querySelector('#insert').disabled);
  await page.locator('#semitones').evaluate(element => { element.value = '7'; element.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => document.querySelector('#interval').textContent === '7');
  await page.locator('#bend').evaluate(element => { element.value = '10000'; element.dispatchEvent(new Event('change')); });
  await page.waitForFunction(() => window.manifoldPreparedMidi.host.diagnostics.eventsConsumed === 2);
  const ui = await page.evaluate(() => ({ graph: window.manifoldPreparedMidi.project.toProject(),
    diagnostics: window.manifoldPreparedMidi.host.diagnostics, held: document.querySelector('[data-note="60"]').getAttribute('aria-pressed') }));
  await page.screenshot({ path: new URL(`../docs/rearchitecture/evidence/${label}.png`, import.meta.url).pathname, fullPage: true });
  await page.locator('[data-note="60"]').click(); await page.waitForFunction(() => window.manifoldPreparedMidi.host.diagnostics.eventsConsumed === 3);
  await page.locator('#stop').click(); await page.waitForFunction(() => !window.manifoldPreparedMidi.host);
  const result = await page.evaluate(async () => {
    const { Host, createProject, TRANSPOSE_PATH, INPUT_PATH, EFFECT_PATH, VOICE_PATH } = window.manifoldPreparedMidi;
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const waitConsumed = async (host, target) => { const end = performance.now() + 3000;
      while (host.diagnostics.eventsConsumed < target) { if (performance.now() > end) throw new Error('Event consumption deadline'); await sleep(2); } };
    const context = new AudioContext({ sampleRate: 48000 }); await context.suspend();
    const a = new Host(context, { execution: 'prepared' }), b = new Host(context, { execution: 'prepared' });
    const primary = createProject(a), reference = createProject(b);
    await a.prepare(primary.toProject()); await b.prepare(reference.toProject());
    for (const project of [primary, reference]) {
      for (const [id, value] of [[0,2],[1,.001],[2,.001],[3,1],[4,.01],[5,.2]]) {
        await project.session.parameter({ nodeId: 6, id, value });
      }
    }
    let invalidOffset = null;
    try { await primary.sendEvents([{ kind: 0, note: 60, velocity: 100, offset: 128 }]); } catch (error) { invalidOffset = error.message; }
    const admissionA = await primary.sendEvents([{ kind: 0, channel: 2, note: 60, velocity: 100, offset: 64 }]);
    const admissionB = await reference.sendEvents([{ kind: 0, channel: 2, note: 60, velocity: 100, offset: 64 }]);
    const pending = { primary: a.diagnostics, reference: b.diagnostics };
    const tape = new SharedArrayBuffer(480000 * 16), control = new SharedArrayBuffer(12);
    const code = `class R extends AudioWorkletProcessor{constructor(o){super();this.t=new Float32Array(o.processorOptions.t);this.c=new Int32Array(o.processorOptions.c)}
      process(i,o){let n=Atomics.load(this.c,0),f=o[0][0].length;if(n===0)Atomics.store(this.c,1,currentFrame);
      if(n+f>this.t.length/4){Atomics.store(this.c,2,1);return true;}for(let k=0;k<f;k++){let p=(n+k)*4;
      this.t[p]=i[0]?.[0]?.[k]??0;this.t[p+1]=i[0]?.[1]?.[k]??0;this.t[p+2]=i[1]?.[0]?.[k]??0;this.t[p+3]=i[1]?.[1]?.[k]??0;
      o[0][0][k]=this.t[p];o[0][1][k]=this.t[p+1];}Atomics.store(this.c,0,n+f);return true;}}registerProcessor('midi-pair-recorder',R);`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    await context.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    const recorder = new AudioWorkletNode(context, 'midi-pair-recorder', { numberOfInputs: 2, outputChannelCount: [2], processorOptions: { t: tape, c: control } });
    const busA = context.createGain(), busB = context.createGain(); a.connect(null, busA); b.connect(null, busB);
    busA.connect(recorder, 0, 0); busB.connect(recorder, 0, 1); recorder.connect(context.destination);
    await context.resume(); await waitConsumed(a,1); await waitConsumed(b,1); await sleep(150);
    const onset = { primary: a.diagnostics, reference: b.diagnostics, trace: await a.readMidiTrace() };
    const edits = [];
    for (let index = 0; index < 8; index++) {
      const start = performance.now(); await primary.setInsert(index % 2 === 0, 0);
      edits.push({ index, totalMs: performance.now() - start, diagnostics: a.diagnostics }); await sleep(60);
    }
    // Admit bend to both while suspended, so its sample deadline matches.
    await context.suspend();
    const bend = { kind: 3, channel: 2, note: 10000 & 127, velocity: 10000 >> 7, offset: 73 };
    await primary.sendEvents([bend]); await reference.sendEvents([bend]); await context.resume();
    await waitConsumed(a,2); await waitConsumed(b,2); await sleep(100);
    // Change the held interval in one structural candidate and one live scalar
    // reference. The core's publication remap must produce identical state.
    await context.suspend();
    await primary.session.transaction(graph => graph.setParameter(graph.findInstance(EFFECT_PATH), 0, 7));
    await reference.set(TRANSPOSE_PATH, 7); await context.resume(); await sleep(100);
    let invalidEdit = null;
    try { const bad = structuredClone(primary.toProject()); bad.signal.nodes.find(n => n.id === 6).a = .123; await a.replaceGraph(bad); }
    catch (error) { invalidEdit = error.message; }
    await context.suspend();
    // Queue an original-key release BEFORE IDs change; admission is not consumption.
    await primary.sendEvents([{ kind: 1, channel: 2, note: 60, offset: 93 }]);
    await reference.sendEvents([{ kind: 1, channel: 2, note: 60, offset: 93 }]);
    const beforeRename = a.diagnostics;
    await primary.session.transaction(graph => {
      const input = graph.findInstance(INPUT_PATH), effect = graph.findInstance(EFFECT_PATH), voice = graph.findInstance(VOICE_PATH);
      const semitones = graph.toProject().signal.initialParameters.find(p => p.nodeId === effect.id && p.id === 0).value;
      graph.remove(input); graph.remove(effect);
      const nextInput = graph.add('midi-input', { id: 14 }), nextEffect = graph.add('midi-transpose', { id: 15 });
      graph.registerInstance(INPUT_PATH, nextInput); graph.registerInstance(EFFECT_PATH, nextEffect);
      graph.setParameter(nextEffect, 0, semitones); graph.registerParameter(TRANSPOSE_PATH, nextEffect, 0, { min: -24, max: 24, default: 0 });
      graph.bindHostSlot(0, nextEffect, 0); graph.connect(nextInput.output('out'), nextEffect.input('midi')); graph.connect(nextEffect.output('out'), voice.input('midi'));
    });
    const afterRename = a.diagnostics;
    await context.resume(); await waitConsumed(a,3); await waitConsumed(b,3); await sleep(200); await context.suspend();
    const c = new Int32Array(control), frames = c[0], pcm = new Float32Array(tape, 0, frames * 4);
    let maxDifference = 0, mismatchedSamples = 0, firstNonzeroFrame = -1, sum = 0, tailPeak = 0;
    for (let frame = 0; frame < frames; frame++) for (let channel = 0; channel < 2; channel++) {
      const value = pcm[frame * 4 + channel], difference = Math.abs(value - pcm[frame * 4 + channel + 2]);
      maxDifference = Math.max(maxDifference, difference); if (difference !== 0) mismatchedSamples++;
      if (firstNonzeroFrame === -1 && value !== 0) firstNonzeroFrame = frame;
      sum += value * value; if (frame >= frames - 4096) tailPeak = Math.max(tailPeak, Math.abs(value));
    }
    const bytes = new Uint8Array(tape, 0, pcm.byteLength); let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    const pair = { frames, firstContextFrame: c[1], overflow: c[2] !== 0, maxDifference, mismatchedSamples,
      firstNonzeroFrame, tailPeak, rms: Math.sqrt(sum / (frames * 2)), admissionA, admissionB, pending,
      onset, beforeRename, afterRename, invalidOffset, invalidEdit, edits, after: { primary: a.diagnostics, reference: b.diagnostics },
      finalGraph: primary.toProject(), pcmBase64: btoa(binary) };
    await a.close(); await b.close(); await context.close();

    // Deterministic suspended queue admission, atomic overflow, stop and close.
    const queueContext = new AudioContext({ sampleRate: 48000 }); await queueContext.suspend();
    const q = new Host(queueContext, { execution: 'prepared' }), qp = createProject(q); await q.prepare(qp.toProject());
    const many = Array.from({ length: 256 }, (_, index) => ({ kind: 0, note: 48 + index % 32, velocity: 80, offset: index % 128 }));
    await qp.sendEvents(many); const full = q.diagnostics;
    let overflow = null; try { await qp.sendEvents([{ kind: 0, note: 60, velocity: 100 }]); } catch (error) { overflow = error.message; }
    const rejected = q.diagnostics;
    await qp.sendEvents([{ kind: 2 }]); const stopped = q.diagnostics;
    await queueContext.resume(); await waitConsumed(q,1); await queueContext.suspend();
    await qp.sendEvents(many); await queueContext.resume(); await waitConsumed(q,257); await queueContext.suspend();
    const consumedFullQueue = q.diagnostics;
    await qp.sendEvents([{ kind: 0, note: 60, velocity: 100 }]);
    await qp.session.transaction(graph => {
      const input = graph.findInstance(INPUT_PATH), effect = graph.findInstance(EFFECT_PATH);
      graph.remove(input); const renamed = graph.add('midi-input', { id: 14 });
      graph.registerInstance('/transpose/audition/nodes/replacement_input', renamed);
      graph.connect(renamed.output('out'), effect.input('midi'));
    });
    await queueContext.resume(); await sleep(100); await queueContext.suspend(); const retiredTarget = q.diagnostics;
    await q.sendEvent({ nodeId: 14, kind: 0, note: 60, velocity: 100 }); const beforeClose = q.diagnostics;
    await q.close(); const afterClose = q.diagnostics; await queueContext.close();
    const queue = { full, overflow, rejected, stopped, consumedFullQueue, retiredTarget, beforeClose, afterClose };

    // Replay the actual old Lua oracle scenario through the real audio graph.
    const oracleContext = new AudioContext({ sampleRate: 48000 }); await oracleContext.resume();
    const h = new Host(oracleContext, { execution: 'prepared' }), p = createProject(h); await h.prepare(p.toProject());
    let accepted = 0;
    const send = async event => { await p.sendEvents([event]); await waitConsumed(h,++accepted); };
    await p.set(TRANSPOSE_PATH,7); await send({ kind:0,channel:2,note:60,velocity:96 });
    await p.set(TRANSPOSE_PATH,-12); await send({ kind:1,channel:2,note:60 });
    await p.set(TRANSPOSE_PATH,24); await send({ kind:0,note:120,velocity:100 }); await send({ kind:1,note:120 });
    await p.set(TRANSPOSE_PATH,0); for(let note=60;note<=68;note++)await send({ kind:0,note,velocity:100 });
    await send({kind:2});await send({kind:3,note:0,velocity:64});
    const trace = await h.readMidiTrace(), diagnostics = h.diagnostics;
    const events = trace.entries.filter(e => e.emitted && e.nodeId === 5).map(e => e.kind === 0 ? `on,${e.channel},${e.note},${e.velocity}`
      : e.kind === 1 ? `off,${e.channel},${e.note}` : e.kind === 3 ? `bend,${e.channel},${(e.velocity << 7) | e.note}` : 'all-off');
    await h.close(); await oracleContext.close();
    return { pair, queue, oracle: { trace, diagnostics, events } };
  });
  const pcm = Buffer.from(result.pair.pcmBase64, 'base64'); delete result.pair.pcmBase64;
  await writeFile(new URL('edited.wav', output), wave(pcm,0)); await writeFile(new URL('reference.wav', output), wave(pcm,1));
  await writeFile(new URL('final-project.json', output), JSON.stringify(result.pair.finalGraph,null,2));
  const cdp = await browser.newBrowserCDPSession();
  const workers = (await cdp.send('Target.getTargets')).targetInfos.filter(t => t.type === 'worker' && t.url.includes('prepared-compiler'));
  evidence = { recordedAt: new Date().toISOString(), site, chromiumVersion: browser.version(), hashes, ui, ...result,
    legacyEvents: legacy, audio: `/prepared-midi/${label}/edited.wav`, referenceAudio: `/prepared-midi/${label}/reference.wav`,
    workersAfterClose: workers, pageErrors: errors };
  await writeFile(new URL('report.json', output), JSON.stringify(evidence,null,2));
  await writeFile(new URL(`../docs/rearchitecture/evidence/${label}.json`,import.meta.url), JSON.stringify(evidence,null,2));
  console.log(JSON.stringify({ frames: result.pair.frames, maxDifference: result.pair.maxDifference,
    firstNonzeroFrame: result.pair.firstNonzeroFrame, pair: result.pair.after, queue: result.queue,
    legacyEventCount: legacy.length, actualEventCount: result.oracle.events.length, legacyExactMatch: JSON.stringify(legacy)===JSON.stringify(result.oracle.events) }));
  assert.equal(ui.held,'true');assert.equal(result.pair.firstNonzeroFrame,65);assert.equal(result.pair.maxDifference,0);
  assert.equal(result.pair.onset.primary.lastEventContextFrame,result.pair.firstContextFrame+64);
  assert.equal(result.pair.onset.trace.entries.find(entry=>entry.emitted&&entry.kind===0).offset,64);
  assert.equal(result.pair.mismatchedSamples,0);assert.equal(result.pair.tailPeak,0);assert.equal(result.pair.overflow,false);
  assert.ok(result.pair.invalidOffset);assert.ok(result.pair.invalidEdit);assert.equal(result.pair.pending.primary.eventsConsumed,0);
  assert.equal(result.pair.beforeRename.eventsPending,1);assert.equal(result.pair.afterRename.eventsPending,1);
  assert.equal(result.pair.after.primary.eventsConsumed,3);assert.equal(result.queue.full.eventsPending,256);
  assert.ok(result.queue.overflow);assert.equal(result.queue.rejected.eventsPending,256);assert.equal(result.queue.rejected.eventsRejected,1);
  assert.equal(result.queue.stopped.eventsPending,1);assert.equal(result.queue.stopped.eventsCancelled,256);
  assert.equal(result.queue.consumedFullQueue.eventsConsumed,257);assert.equal(result.queue.retiredTarget.eventsCancelled,257);
  assert.equal(result.queue.beforeClose.eventsPending,1);assert.equal(result.queue.afterClose.eventsPending,0);assert.equal(result.queue.afterClose.eventsCancelled,258);
  assert.deepEqual(result.oracle.events,legacy);assert.equal(legacy.length,25);
  for(const d of [ui.diagnostics,...Object.values(result.pair.after),result.queue.consumedFullQueue,result.oracle.diagnostics]) {
    assert.equal(d.rustProcessingFailures,0);assert.equal(d.rustCallbackAllocations,0);assert.equal(d.rustCallbackDeallocations,0);
  }
  assert.deepEqual(workers,[]);assert.deepEqual(errors,[]);
} catch(error) {
  await writeFile(new URL('failure.json',output),JSON.stringify({recordedAt:new Date().toISOString(),error:error.stack,evidence},null,2));throw error;
} finally { await browser.close(); }
