// A leased BB automation tab only; never touches a personal browser tab.
// Hidden tabs can pause animation frames; measure each real AnalyserNode directly.
import { connect } from '../web/review-browser-cdp.mjs';
import { strict as assert } from 'node:assert';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
const evidence = resolve(process.argv[2] ?? '/tmp/manifold-device-lessons');
await mkdir(evidence, { recursive: true });
const origin = new URL(process.env.MANIFOLD_REVIEW_URL ?? 'http://127.0.0.1:4174/').origin;
const c = await connect(),
  original = await c.evaluate(() => location.href);
const override = await c.call('Page.addScriptToEvaluateOnNewDocument', {
  source: `
const NativeAudioContext=window.AudioContext;window.__testContexts=[];window.__testMeters=[];
window.AudioContext=class extends NativeAudioContext{
constructor(options={}){if(!('sinkId' in NativeAudioContext.prototype))throw Error('No silent sink');
super({...options,sinkId:{type:'none'}});if(this.sinkId?.type!=='none'){this.close();throw Error('Wrong sink');}window.__testContexts.push(this);}createAnalyser(){const meter=super.createAnalyser();window.__testMeters.push(meter);return meter;}}
`,
});
const pause = (ms) => new Promise((r) => setTimeout(r, ms));
const ready = async () => {
  for (let i = 0; i < 120; i++) {
    if (await c.evaluate(() => document.querySelector('[data-action=audio]')?.disabled === false))
      return;
    await pause(200);
  }
  throw Error('Lesson unavailable');
};
const reports = [];
try {
  await c.call('Emulation.setDeviceMetricsOverride', {
    width: 1450,
    height: 1100,
    deviceScaleFactor: 1,
    mobile: false,
  });
  for (const [slug, id, value, nodeCount, edgeCount] of [
    ['embed-a-gain-stage', 'gain', 0.25, 3, 2],
    ['ring-modulation', 'ring', 330, 5, 4],
    ['spectral-pitch', 'spectral', -12, 3, 2],
    ['play-an-instrument', 'instrument', 1400, 4, 3],
    ['reusable-devices', 'reusable', 2400, 4, 3],
  ]) {
    await c.call('Page.navigate', { url: origin + '/learn/' + slug + '/' });
    await ready();
    await c.evaluate(() => document.querySelector('[data-action=audio]').click());
    await pause(200);
    await ready();
    await pause(600);
    if (id === 'instrument') {
      await c.evaluate(() => document.querySelector('[data-note="60"]').click());
      await pause(120);
    }
    const started = await c.evaluate(() => ({
      button: document.querySelector('[data-action=audio]').textContent,
      status: document.querySelector('[data-example-status]').textContent,
      measurement: document.querySelector('[data-measurement]').textContent,
      rms: (() => {
        const meter = window.__testMeters.at(-1),
          samples = new Float32Array(meter.fftSize);
        meter.getFloatTimeDomainData(samples);
        return Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
      })(),
      sink: window.__testContexts[0]?.sinkId.type,
    }));
    assert.equal(started.button, 'Stop audio', JSON.stringify(started));
    assert.equal(started.sink, 'none');
    assert(started.rms > 0, JSON.stringify(started));
    await c.evaluate((value) => {
      const input = document.querySelector('[data-control="0"]');
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, value);
    await pause(350);
    await c.evaluate(() => document.querySelector('[data-action=audio]').click());
    await pause(200);
    await ready();
    assert.equal(
      await c.evaluate(() => window.__testContexts.every((c) => c.state === 'closed')),
      true,
    );
    await c.evaluate(() => document.querySelector('[data-action=audio]').click());
    await pause(200);
    await ready();
    await pause(350);
    assert.equal(
      await c.evaluate(() => Number(document.querySelector('[data-control="0"]').value)),
      value,
    );
    if (id === 'instrument') {
      await c.evaluate(() => document.querySelector('[data-note="67"]').click());
      await pause(120);
    }
    const restarted = await c.evaluate(() => {
      const meter = window.__testMeters.at(-1),
        samples = new Float32Array(meter.fftSize);
      meter.getFloatTimeDomainData(samples);
      return Math.sqrt(samples.reduce((sum, v) => sum + v * v, 0) / samples.length);
    });
    assert(restarted > 0, String(restarted));
    await c.evaluate(() => document.querySelector('[data-action=audio]').click());
    await pause(200);
    await ready();
    await c.evaluate(() => {
      document.querySelector('[data-action=graph]').click();
      document.querySelector('[data-action=source]').click();
    });
    const graph = await c.evaluate(() => ({
      nodes: [...document.querySelectorAll('[data-node]')].map((n) => n.textContent),
      edges: document.querySelectorAll('[data-graph] path').length,
      source: document.querySelector('#example-source code').textContent,
      closed: window.__testContexts.every((c) => c.state === 'closed'),
    }));
    assert.equal(graph.nodes.length, nodeCount);
    assert.equal(graph.edges, edgeCount);
    assert(!graph.nodes.some((n) => n.includes('Unused input')));
    assert(graph.source.includes("from 'manifold'"));
    assert(graph.closed);
    const chosen = await c.evaluate(() => {
      const node = [...document.querySelectorAll('[data-node]')].find(
        (n) => !/input|Output/.test(n.textContent),
      );
      node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      return {
        text: node.textContent,
        selection: [...document.querySelectorAll('.declaration')]
          .map((l) => l.textContent)
          .join('\n'),
      };
    });
    assert(chosen.selection.includes('.add('), JSON.stringify(chosen));
    if (id === 'reusable') {
      await c.evaluate(() => document.querySelector('[data-enter]').click());
      assert.equal(await c.evaluate(() => document.querySelectorAll('[data-node]').length), 4);
      await c.evaluate(() =>
        [...document.querySelectorAll('[data-node]')]
          .find((n) => n.textContent.startsWith('filter'))
          .dispatchEvent(new MouseEvent('click', { bubbles: true })),
      );
      assert.match(
        await c.evaluate(() =>
          [...document.querySelectorAll('.declaration')].map((n) => n.textContent).join('\n'),
        ),
        /filterStage.add/,
      );
      await c.evaluate(() =>
        document.querySelector('[data-action=graph]').scrollIntoView({ block: 'start' }),
      );
      const shot = await c.call('Page.captureScreenshot', { format: 'png' });
      await writeFile(evidence + '/reusable-inner-source.png', Buffer.from(shot.data, 'base64'));
      await c.evaluate(() => document.querySelector('[data-parent]').click());
      assert.equal(await c.evaluate(() => document.querySelectorAll('[data-enter]').length), 2);
    }
    if (id === 'spectral' || id === 'instrument') {
      await c.evaluate(() =>
        document.querySelector('[data-action=graph]').scrollIntoView({ block: 'start' }),
      );
      const shot = await c.call('Page.captureScreenshot', { format: 'png' });
      await writeFile(evidence + '/' + id + '-source.png', Buffer.from(shot.data, 'base64'));
    }
    await c.call('Emulation.setDeviceMetricsOverride', {
      width: 390,
      height: 844,
      deviceScaleFactor: 1,
      mobile: false,
    });
    const mobile = await c.evaluate(() => ({
      width: innerWidth,
      document: document.documentElement.scrollWidth,
    }));
    assert(mobile.document <= mobile.width, JSON.stringify(mobile));
    await c.call('Emulation.setDeviceMetricsOverride', {
      width: 1450,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    });
    reports.push({
      id,
      started,
      restarted,
      graph: { nodes: graph.nodes, edges: graph.edges },
      chosen,
      mobile,
    });
    console.log(JSON.stringify(reports.at(-1)));
  }
  assert.equal(c.errors.length, 0, JSON.stringify(c.errors));
  await writeFile(evidence + '/lessons.json', JSON.stringify(reports, null, 2));
} finally {
  await c.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: override.identifier });
  await c.call('Emulation.clearDeviceMetricsOverride');
  await c.call('Page.navigate', { url: original });
  c.close();
}
