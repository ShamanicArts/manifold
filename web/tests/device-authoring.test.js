import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createDevice,
  createEffect,
  createInstrument,
  audio,
  midi,
  gain,
  phaseVocoder,
  voiceSynth,
} from 'manifold';
import { lowerDevice, GraphWorkspace, parameterValue } from 'manifold/graph';
import { LiveProjectRuntime, evaluateProjectSource } from '@manifold/author/live-project';
import { sourceSelection } from '@manifold/author/node-sources';

const source = await readFile(
  new URL('../../packages/manifold/examples/spectral.js', import.meta.url),
  'utf8',
);
const explicit = await readFile(
  new URL('../../packages/manifold/examples/explicit-device.js', import.meta.url),
  'utf8',
);
const identity = { id: 'hybrid', name: 'Hybrid' };

test('all real modules import through manifold and match the shared source evaluator', async () => {
  for (const name of ['gain', 'tone', 'spectral', 'explicit-device']) {
    const url = new URL(`../../packages/manifold/examples/${name}.js`, import.meta.url);
    const { default: device } = await import(url);
    const compiled = lowerDevice(device);
    const evaluated = evaluateProjectSource(await readFile(url, 'utf8'));
    assert.deepEqual(evaluated.project, compiled.project);
    assert.deepEqual(evaluated.view, compiled.view);
    assert.deepEqual(GraphWorkspace.fromProject(compiled.project).toProject(), compiled.project);
  }
});

test('roles are convenience boundaries on the same Device, including mixed audio and MIDI', () => {
  const effect = createEffect(identity);
  const notes = effect.input('midi', midi.events);
  const synth = effect.add('voice', voiceSynth);
  effect.connect(notes, synth.inputs.midi);
  effect.connect(synth.outputs.out, effect.outputs.audio);
  const base = createDevice(identity);
  base.input('audio', audio.stereo);
  const input = base.input('midi', midi.events);
  const output = base.output('audio', audio.stereo);
  const voice = base.add('voice', voiceSynth);
  base.connect(input, voice.inputs.midi);
  base.connect(voice.outputs.out, output);
  assert.deepEqual(lowerDevice(effect).project, lowerDevice(base).project);
  const instrument = createInstrument(identity);
  instrument.input('audio', audio.stereo);
  const instrumentVoice = instrument.add('voice', voiceSynth);
  instrument.connect(instrument.inputs.midi, instrumentVoice.inputs.midi);
  instrument.connect(instrumentVoice.outputs.out, instrument.outputs.audio);
  assert.deepEqual(lowerDevice(instrument).project, lowerDevice(base).project);
});

test('control declarations produce endpoints, explicit host slots and default presentation once', () => {
  const { project, view } = evaluateProjectSource(source);
  assert.equal(project.endpoints.length, 2);
  assert.equal(project.hostBindings.length, 2);
  assert.equal(view.length, 2);
  assert.deepEqual(
    view.find((v) => v.id === 'pitch'),
    { id: 'pitch', type: 'parameter', path: '/pitch', label: 'Pitch', unit: 'semitones' },
  );
  assert.equal(parameterValue(project, '/pitch'), 7);
  assert.equal(parameterValue(project, '/mix'), 1);
  assert.equal(
    project.signal.initialParameters.find(
      (p) =>
        p.nodeId === project.instances.find((i) => i.path.endsWith('/spectral')).nodeId &&
        p.id === phaseVocoder.parameters.find((parameter) => parameter.name === 'fftOrder').id,
    )?.value,
    11,
  );
});

test('reordering declarations and renaming local variables preserve fresh identity', async () => {
  const first = evaluateProjectSource(source);
  const reordered = source
    .replace(/const pitch =[^]*?\n\}\);\nconst mix =[^]*?\n\}\);/, (block) => {
      const at = block.indexOf('const mix');
      return block.slice(at) + '\n' + block.slice(0, at);
    })
    .replaceAll('const spectral =', 'const shiftedSound =')
    .replaceAll('spectral.parameters', 'shiftedSound.parameters')
    .replaceAll('spectral.inputs', 'shiftedSound.inputs')
    .replaceAll('spectral.outputs', 'shiftedSound.outputs')
    .replaceAll('spectral.configure', 'shiftedSound.configure');
  assert.notEqual(source, reordered);
  assert.deepEqual(evaluateProjectSource(reordered).project, first.project);
  const tone = await readFile(
    new URL('../../packages/manifold/examples/tone.js', import.meta.url),
    'utf8',
  );
  const swapped = tone.replace(/const voice =[^\n]+\nconst filter =[^\n]+/, (block) =>
    block.split('\n').reverse().join('\n'),
  );
  assert.notEqual(swapped, tone);
  assert.deepEqual(evaluateProjectSource(swapped).project, evaluateProjectSource(tone).project);
});

test('accepted values, stable node IDs and automation slots survive additions, source changes and recall', async () => {
  const runtime = new LiveProjectRuntime(null, source);
  await runtime.request({ operation: 'parameter.set', path: '/pitch', value: 3 });
  const before = runtime.project;
  const withGain = source
    .replace('createEffect, phaseVocoder', 'createEffect, phaseVocoder, gain')
    .replace(
      'export default effect;',
      `
const extra = effect.add('a-new-level', gain);
effect.control('a-new-volume', extra.parameters.level, {label:'Extra',min:0,max:1,default:0.4});
export default effect;`,
    );
  await runtime.request({ operation: 'source.apply', source: withGain });
  for (const named of before.instances)
    assert.deepEqual(
      runtime.project.instances.find((i) => i.path === named.path),
      named,
    );
  for (const binding of before.hostBindings)
    assert.deepEqual(
      runtime.project.hostBindings.find((b) => b.slot === binding.slot),
      binding,
    );
  assert.equal(parameterValue(runtime.project, '/pitch'), 3);
  const saved = runtime.save();
  const reopened = new LiveProjectRuntime(null, saved.source, saved);
  await reopened.request({ operation: 'source.apply', source: '// reloaded\n' + saved.source });
  assert.deepEqual(reopened.project, runtime.project);
  await reopened.request({ operation: 'source.apply', source: explicit });
  assert.equal(parameterValue(reopened.project, '/pitch'), 3);
  assert.equal(
    reopened.project.instances.find((i) => i.path.endsWith('/processors/spectral')).nodeId,
    before.instances.find((i) => i.path.endsWith('/processors/spectral')).nodeId,
  );
});

test('invalid source is rejected without publishing partial graph or losing accepted targets', async () => {
  const runtime = new LiveProjectRuntime(null, source);
  await runtime.request({ operation: 'parameter.set', path: '/pitch', value: 4 });
  const before = runtime.save();
  for (const bad of [
    source.replace('fftOrder: 11', 'fftOrder: 200'),
    source.replace('wetMix', 'notAParameter'),
    source.replace("'spectral', phaseVocoder", "'spectral', phaseVocoder.type"),
  ]) {
    await assert.rejects(runtime.request({ operation: 'source.apply', source: bad }));
    assert.deepEqual(runtime.save(), before);
  }
});

test('expert lowering is detached and configure only changes future declarations', () => {
  const device = createEffect(identity);
  const level = device.add('level', gain);
  level.configure({ level: 0.5 });
  device.connect(device.inputs.audio, level.inputs.audio);
  device.connect(level.outputs.out, device.outputs.audio);
  const first = lowerDevice(device);
  const instance = first.graph.findInstance('/device/hybrid/processors/level');
  first.graph.setParameter(instance, 0, 0.2);
  const second = lowerDevice(device);
  assert.equal(
    second.project.signal.initialParameters.find((p) => p.nodeId === instance.id && p.id === 0)
      .value,
    0.5,
  );
  level.configure({ level: 0.8 });
  assert.equal(
    second.project.signal.initialParameters.find((p) => p.nodeId === instance.id && p.id === 0)
      .value,
    0.5,
  );
  assert.equal(
    lowerDevice(device).project.signal.initialParameters.find(
      (p) => p.nodeId === instance.id && p.id === 0,
    ).value,
    0.8,
  );
});

test('wrong owners, duplicate names and incompatible port domains fail clearly', () => {
  const effect = createEffect(identity),
    other = createEffect({ id: 'other', name: 'Other' });
  const level = effect.add('level', gain);
  const notes = effect.input('midi', midi.events);
  assert.throws(() => effect.add('level', gain), /Duplicate/);
  assert.throws(() => effect.connect(notes, level.inputs.audio), /same signal/);
  assert.throws(() => effect.connect(other.inputs.audio, level.inputs.audio), /belong/);
  assert.throws(
    () =>
      effect.control('bad', other.add('spectral', phaseVocoder).parameters.wetMix, {
        label: 'Bad',
        min: 0,
        max: 1,
        default: 1,
      }),
    /belong/,
  );
});

test('Studio source navigation follows explicit semantic declarations and aliases after source edits', async () => {
  const runtime = new LiveProjectRuntime(null, source);
  const nodeId = runtime.project.instances.find((i) =>
    i.path.endsWith('/processors/spectral'),
  ).nodeId;
  const link = runtime.snapshot().nodeSources[nodeId][0];
  assert.equal(link.excerpt, "const spectral = effect.add('spectral', phaseVocoder);");
  assert.deepEqual(sourceSelection(source, link), { anchor: link.from, head: link.to });
  const renamed = source
    .replace('createEffect,', 'createEffect as makeEffect,')
    .replace('= createEffect(', '= makeEffect(');
  await runtime.request({ operation: 'source.apply', source: renamed });
  assert.equal(runtime.snapshot().nodeSources[nodeId][0].excerpt, link.excerpt);
});

test('the source laboratory wraps into a reusable Device with live boundaries and accepted controls intact', async () => {
  const source = await readFile(new URL('../handbook/examples/sources.mjs', import.meta.url), 'utf8');
  const runtime = new LiveProjectRuntime(null, source);
  await runtime.request({ operation: 'parameter.set', path: '/frequency', value: 440 });
  await runtime.request({ operation: 'parameter.set', path: '/source-blend', value: 1 });
  const before = runtime.project;
  const ids = before.instances.filter(instance => instance.path.includes('/processors/')
    && !instance.path.endsWith('/output-level')).map(instance => instance.nodeId);
  await runtime.request({ operation: 'graph.wrap', ids, label: 'Reusable sources' });
  const nested = runtime.snapshot().audioNodes.find(node => node.implementationKind === 'composition');
  assert.ok(nested);
  assert.ok(runtime.snapshot().audioNodes.some(node => node.scope === nested.instance && node.type === 'oscillator'));
  assert.deepEqual(runtime.project.signal.io, before.signal.io);
  assert.deepEqual(runtime.project.hostAssignments, before.hostAssignments);
  assert.deepEqual(runtime.project.hostBindings, before.hostBindings);
  assert.equal(parameterValue(runtime.project, '/frequency'), 440);
  assert.equal(parameterValue(runtime.project, '/source-blend'), 1);
  const saved = runtime.save();
  assert.ok(saved.source.includes('sawOscillator'));
  const recalled = new LiveProjectRuntime(null, saved.source, saved);
  assert.deepEqual(recalled.project, runtime.project);
});
