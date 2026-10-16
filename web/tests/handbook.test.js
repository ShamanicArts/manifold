import MarkdownIt from 'markdown-it';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildHandbook } from '../handbook/build.js';
import { pages, pagePath, markdownPath, agentPrompt } from '../handbook/catalog.js';
import gain from '../handbook/examples/gain.mjs';
import { lowerDevice } from 'manifold/graph';
import { LiveProjectRuntime } from '@manifold/author/live-project';
import { parameterValue } from '@manifold/author';

const built = await buildHandbook();

test('published lessons, raw Markdown and agent prompts resolve to the same edition and real sources', () => {
  const known = new Set([...built.htmlFiles.keys(), ...built.rawFiles.keys(), '/studio/']);
  for (const page of pages) {
    const html = built.htmlFiles.get(pagePath(page));
    const raw = built.rawFiles.get(markdownPath(page));
    assert.ok(html.includes(built.manifest.edition));
    assert.ok(raw.includes(built.manifest.edition));
    assert.ok(raw.includes('# ' + page.title));
    assert.ok(!raw.includes('{{'), 'No unresolved includes');
    for (const match of html.matchAll(/href="(\/[^"#]*)(#[^"]*)?"/g)) {
      const [, path, hash] = match;
      if (path.startsWith('/src/')) continue;
      assert.ok(known.has(path), 'Broken internal link: ' + path);
      if (hash)
        assert.ok(
          built.htmlFiles.get(path)?.includes(`id="${hash.slice(1)}"`),
          'Missing heading: ' + match[0],
        );
    }
    const prompt = agentPrompt(page, 'https://manifold.example', built.manifest.edition);
    for (const match of prompt.matchAll(/https:\/\/manifold\.example([^\s]+)/g))
      assert.ok(built.rawFiles.has(match[1]), 'Agent source is fetchable: ' + match[1]);
    assert.ok(prompt.includes(built.manifest.edition));
  }
});

test('the website agent reference includes the guide supplied by native MCP', async () => {
  const guide = await readFile(
    new URL('../../docs/rearchitecture/studio-agent-quickstart.md', import.meta.url),
    'utf8',
  );
  assert.ok(built.rawFiles.get('/learn/agents/index.md').includes(guide.replace(/^#/gm, '##')));
});

test('the exact downloadable gain source matches the importable Device and retains edits on Studio recall', async () => {
  const source = built.rawFiles.get('/learn/examples/gain.mjs');
  const runtime = new LiveProjectRuntime(null, source);
  assert.deepEqual(runtime.project, lowerDevice(gain).project);
  assert.equal(runtime.project.signal.io.inputs.length, 0);
  assert.equal(runtime.project.signal.io.outputs[0].id, 'audio');
  await runtime.request({ operation: 'parameter.set', path: '/level', value: 0.25 });
  const saved = runtime.save();
  const recalled = new LiveProjectRuntime(null, saved.source, saved);
  assert.equal(parameterValue(recalled.project, '/level'), 0.25);
  assert.equal(recalled.source, source);
  assert.ok(recalled.presentation().components.some((component) => component.path === '/level'));
});

test('every executable experiment publishes its actual source and retains accepted values on recall', async () => {
  const { examples, examplePath } = await import('../handbook/examples.js');
  for (const [id, spec] of Object.entries(examples)) {
    const source = built.rawFiles.get(examplePath(id));
    assert.equal(
      source,
      await readFile(new URL('../handbook/' + spec.file, import.meta.url), 'utf8'),
    );
    const saved = id === 'field' ? JSON.parse(source) : null;
    const runtime = new LiveProjectRuntime(null, saved?.source ?? source, saved ?? undefined);
    for (const control of spec.controls) {
      const value = control.min + control.step;
      if (control.path)
        await runtime.request({ operation: 'parameter.set', path: control.path, value });
      else {
        const node = runtime
          .save()
          .composition.nodes.find((n) => n.definition === control.definition);
        await runtime.request({
          operation: 'component.update',
          id: node.id,
          changes: { parameters: { [control.parameter]: value } },
        });
      }
    }
    const snapshot = runtime.save();
    const restored = new LiveProjectRuntime(null, snapshot.source, snapshot);
    assert.deepEqual(restored.project, runtime.project, id);
    assert.deepEqual(restored.save().composition, snapshot.composition, id);
    assert.deepEqual(restored.save().files, snapshot.files, id);
    assert.equal(restored.source, runtime.source);
    for (const control of spec.controls) {
      const value = control.path
        ? parameterValue(restored.project, control.path)
        : restored.save().composition.nodes.find((n) => n.definition === control.definition)
            .parameters[control.parameter];
      assert.ok(Math.abs(value - (control.min + control.step)) < 1e-6, id + ' recalled control');
    }
  }
});

test('Device lessons show their actual output routes and source declarations without legacy scaffolding', () => {
  for (const [id, count, connections] of [
    ['gain', 3, 2],
    ['ring', 5, 4],
    ['spectral', 3, 2],
  ]) {
    const source = built.rawFiles.get(`/learn/examples/${id}.mjs`);
    const runtime = new LiveProjectRuntime(null, source);
    const { audioNodes, audioEdges, nodeSources } = runtime.snapshot();
    assert.equal(audioNodes.length, count);
    assert.equal(audioEdges.length, connections);
    const output = audioNodes.find((node) => node.implementationKind === 'interface-output');
    const binding = runtime.project.signal.io.outputBindings[0];
    assert.ok(
      audioEdges.some(
        (edge) =>
          edge.to === output.id &&
          edge.from === binding.nodeId &&
          edge.outputPort === binding.outputPort,
      ),
    );
    assert.equal(nodeSources[output.id][0].path, '/project.mjs');
    for (const node of audioNodes.filter((node) => node.instance.includes('/processors/'))) {
      const link = nodeSources[node.id][0];
      assert.equal(source.slice(link.from, link.to), link.excerpt);
      assert.ok(link.excerpt.includes('.add('));
    }
  }
});

test('published code blocks have lexical tokens in both themes and preserve copyable source text', async () => {
  const { highlight } = await import('../handbook/highlight.js');
  const source = 'const value = "<audio> & signal";\n// Keep symbols and line breaks intact.\n';
  const html = highlight(source, 'js');
  assert.ok(html.includes('--shiki-light:'));
  assert.ok(html.includes('--shiki-dark:'));
  const text = new MarkdownIt().utils.unescapeAll(html.replace(/<[^>]+>/g, ''));
  assert.equal(text, source.trimEnd());
  assert.throws(() => highlight(source, ''), /supported language/);
  assert.throws(() => highlight(source, 'unknown-grammar'), /supported language/);
  for (const [path, html] of built.htmlFiles) {
    for (const block of html.matchAll(/<pre\b([^>]*)>/g))
      assert.ok(block[1].includes('shiki'), 'Unhighlighted block: ' + path);
  }
});
