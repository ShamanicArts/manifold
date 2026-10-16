import { BrowserAudioRouting } from '@manifold/author/audio-routing';
import { AudioInputDevice } from '../audio/audio-input-device.js';
import sourceLab from '../../handbook/examples/sources.mjs?raw';
import { LiveProjectRuntime } from 'manifold/live-project';
import { parameterValue } from 'manifold/graph';
import { BrowserGraphHost } from 'manifold/browser';
import { examples } from '../../handbook/examples.js';
import gain from '../../handbook/examples/gain.mjs?raw';
import ring from '../../handbook/examples/ring.mjs?raw';
import spectral from '../../handbook/examples/spectral.mjs?raw';
import instrument from '../../handbook/examples/instrument.mjs?raw';
import reusable from '../../handbook/examples/reusable.mjs?raw';
import field from '../../public/studio/field-rules.manifold.json?raw';
import { mountExampleGraph } from './example-graph.js';

const sources = { sources: sourceLab, gain, ring, spectral, field, instrument, reusable };

export async function mountAudioExample(element, id) {
  const spec = examples[id];
  const saved = id === 'field' ? JSON.parse(sources[id]) : null;
  const find = (selector) => element.querySelector(selector);
  const status = find('[data-example-status]');
  const audioButton = find('[data-action=audio]');
  const canvas = find('[data-scope]');
  let host, context, analyser, presentation, routing;
  const audioDevices = spec.liveInput ? new AudioInputDevice() : null;
  const noteTimers = new Set();
  let busy = false,
    departed = false,
    frame = 0,
    pending = Promise.resolve();
  let observation = null,
    lastReadout = 0;
  const runtime = new LiveProjectRuntime(
    {
      get ready() {
        return host?.ready ?? false;
      },
      setParameter: (edit) => host.setParameter(edit),
    },
    saved?.source ?? sources[id],
    saved ?? undefined,
  );
  const samples = new Float32Array(4096),
    spectrum = new Float32Array(2048);
  const controls = [...element.querySelectorAll('[data-control]')];
  mountExampleGraph(element, runtime, revealPanel);

  const component = (definition) =>
    runtime.snapshot().composition.nodes.find((node) => node.definition === definition);
  const valueOf = (control) =>
    control.path
      ? parameterValue(runtime.project, control.path)
      : component(control.definition).parameters[control.parameter];
  function update() {
    spec.controls.forEach((control, index) => {
      const value = valueOf(control);
      controls[index].value = value;
      controls[index].style.setProperty(
        '--control-fill',
        `${(100 * (value - control.min)) / (control.max - control.min)}%`,
      );
      find(`[data-readout="${index}"]`).textContent =
        `${Number(value.toFixed(2))} ${control.unit}`.trim();
    });
  }
  function enqueue(action) {
    pending = pending
      .then(action)
      .then(update)
      .catch((error) => {
        status.textContent = 'Change was not accepted: ' + error.message;
        update();
      });
    return pending;
  }
  function setValue(index, value) {
    const control = spec.controls[index];
    return enqueue(() =>
      runtime.request(
        control.path
          ? { operation: 'parameter.set', path: control.path, value }
          : {
              operation: 'component.update',
              id: component(control.definition).id,
              changes: { parameters: { [control.parameter]: value } },
            },
      ),
    );
  }
  function setBusy(value) {
    busy = value;
    for (const control of element.querySelectorAll(
      'button[data-action], button[data-preset], input',
    ))
      control.disabled = value;
    for (const key of element.querySelectorAll('[data-note]')) key.disabled = value || !host?.ready;
  }
  function draw(now = 0) {
    const width = canvas.clientWidth,
      height = canvas.clientHeight,
      scale = devicePixelRatio || 1;
    if (
      canvas.width !== Math.round(width * scale) ||
      canvas.height !== Math.round(height * scale)
    ) {
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
    }
    const painter = canvas.getContext('2d'),
      css = getComputedStyle(document.documentElement);
    painter.setTransform(scale, 0, 0, scale, 0, 0);
    painter.clearRect(0, 0, width, height);
    painter.strokeStyle = css.getPropertyValue('--line');
    painter.lineWidth = 1;
    const spectralView = id === 'ring' || id === 'spectral';
    for (let i = 1; i < 4; i++) {
      painter.beginPath();
      painter.moveTo(0, (height * i) / 4);
      painter.lineTo(width, (height * i) / 4);
      painter.stroke();
    }
    if (analyser && context?.state === 'running') {
      analyser.getFloatTimeDomainData(samples);
      analyser.getFloatFrequencyData(spectrum);
      const rms = Math.sqrt(
        samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length,
      );
      observation = { rms, sampleRate: context.sampleRate };
      painter.strokeStyle = css.getPropertyValue('--blue');
      painter.lineWidth = 1.8;
      painter.beginPath();
      const count = spectralView
        ? Math.floor((2400 * analyser.fftSize) / context.sampleRate)
        : 1024;
      for (let i = 0; i < count; i++) {
        const x = (i / (count - 1)) * width;
        const y = spectralView
          ? height * (1 - Math.max(0, Math.min(1, (spectrum[i] + 90) / 90)))
          : height / 2 - (samples[i] / 0.24) * height * 0.45;
        i ? painter.lineTo(x, y) : painter.moveTo(x, y);
      }
      painter.stroke();
      if (now - lastReadout > 200) {
        lastReadout = now;
        const peaks = [];
        for (let i = 1; i < spectrum.length - 1; i++)
          if (spectrum[i] > -65 && spectrum[i] > spectrum[i - 1] && spectrum[i] > spectrum[i + 1])
            peaks.push({ hz: (i * context.sampleRate) / analyser.fftSize, db: spectrum[i] });
        peaks.sort((a, b) => b.db - a.db);
        find('[data-measurement]').textContent = `RMS ${rms.toFixed(4)}${
          spectralView
            ? ' · strongest peaks ≈ ' +
              (peaks
                .slice(0, 3)
                .map((p) => Math.round(p.hz) + ' Hz')
                .join(', ') || 'none')
            : ''
        }`;
      }
    } else observation = null;
    if (context && !departed) frame = requestAnimationFrame(draw);
  }
  async function releaseAudio() {
    cancelAnimationFrame(frame);
    for (const timer of noteTimers) clearTimeout(timer);
    noteTimers.clear();
    const oldContext = context;
    audioDevices?.close();
    await host?.close();
    routing?.close();
    routing = null;
    analyser?.disconnect();
    context = host = analyser = null;
    if (audioDevices) find('[data-action=input]').textContent = 'Connect microphone';
    observation = null;
    if (oldContext && oldContext.state !== 'closed') await oldContext.close();
    audioButton.textContent = 'Start audio';
    find('[data-audio-state]').textContent = 'Audio stopped';
    find('[data-measurement]').textContent = 'Start audio to measure the output.';
    draw();
  }
  async function toggleAudio() {
    if (busy || departed) return;
    setBusy(true);
    try {
      if (context) {
        await pending;
        await releaseAudio();
        status.textContent = 'Audio stopped. Your settings are retained.';
        return;
      }
      context = new AudioContext();
      await context.resume();
      await pending;
      const declaredIo = runtime.project.signal.io;
      host = new BrowserGraphHost(context, declaredIo ? { execution: 'prepared' } : {});
      await host.prepare(runtime.project);
      if (departed) {
        await releaseAudio();
        return;
      }
      analyser = context.createAnalyser();
      analyser.fftSize = samples.length;
      analyser.smoothingTimeConstant = 0.3;
      if (declaredIo) {
        routing = new BrowserAudioRouting(context, host);
        if (audioDevices)
          audioDevices.bind(context, (node) => {
            for (const bus of declaredIo.inputs) routing.connectInput(bus.id, node);
          });
        for (const bus of declaredIo.outputs) host.connectOutput(bus.id, analyser);
      } else host.connect(null, analyser);
      analyser.connect(context.destination);
      audioButton.textContent = 'Stop audio';
      find('[data-audio-state]').textContent = 'Live output';
      status.textContent = spec.description;
      draw();
    } catch (error) {
      await releaseAudio();
      status.textContent = 'Audio could not start: ' + error.message;
    } finally {
      setBusy(false);
    }
  }
  function revealPanel(kind, force) {
    const panel = find('#example-' + kind);
    panel.hidden = !(force ?? panel.hidden);
    find('[data-action=' + kind + ']').setAttribute('aria-expanded', !panel.hidden);
  }
  controls.forEach((slider, index) =>
    slider.addEventListener('input', () => setValue(index, Number(slider.value))),
  );
  find('[data-action=reset]').addEventListener('click', () =>
    spec.controls.forEach((control, index) => setValue(index, control.value)),
  );
  element.querySelectorAll('[data-preset]').forEach((button) =>
    button.addEventListener('click', () => {
      spec.presets[Number(button.dataset.preset)].values.forEach((value, index) =>
        setValue(index, value),
      );
    }),
  );
  for (const key of element.querySelectorAll('[data-note]'))
    key.addEventListener('click', () => {
      if (!host?.ready || busy) return;
      const currentHost = host;
      const nodeId = runtime.project.signal.nodes.find((node) => node.type === 'midi-input').id;
      const note = Number(key.dataset.note);
      enqueue(async () => {
        await currentHost.sendEvent({ nodeId, kind: 0, note, velocity: 100 });
        key.setAttribute('aria-pressed', 'true');
        status.textContent = `Playing ${key.textContent}. Change brightness while it rings.`;
        const timer = setTimeout(() => {
          noteTimers.delete(timer);
          key.setAttribute('aria-pressed', 'false');
          if (host === currentHost) enqueue(() => currentHost.sendEvent({ nodeId, kind: 1, note }));
        }, 450);
        noteTimers.add(timer);
      });
    });
  if (audioDevices) {
    const button = find('[data-action=input]');
    const select = find('[data-audio-input]');
    async function refreshInputs() {
      await audioDevices.refresh();
      const chosen = audioDevices.selected || select.value || 'default';
      select.replaceChildren(
        ...audioDevices
          .snapshot()
          .inputs.filter((d) => d.id)
          .map((d) => new Option(d.name, d.id)),
      );
      select.value = chosen;
    }
    button.addEventListener('click', async () => {
      if (!host?.ready) {
        status.textContent = 'Start audio before connecting a microphone.';
        return;
      }
      button.disabled = true;
      try {
        await audioDevices.select(audioDevices.selected ? '' : select.value);
        await refreshInputs();
        button.textContent = audioDevices.selected ? 'Disconnect microphone' : 'Connect microphone';
        status.textContent = audioDevices.selected
          ? 'Hardware connected to Live. Set Generated → Live to +1 to hear it.'
          : 'Live input disconnected.';
      } catch (error) {
        status.textContent = error.message;
      } finally {
        button.disabled = false;
      }
    });
    select.addEventListener('change', async () => {
      if (!audioDevices.selected) return;
      try {
        await audioDevices.select(select.value);
      } catch (error) {
        select.value = audioDevices.selected;
        status.textContent = error.message;
      }
    });
    await refreshInputs().catch(() => {});
  }
  audioButton.addEventListener('click', toggleAudio);
  for (const kind of ['graph', 'source'])
    find('[data-action=' + kind + ']').addEventListener('click', () => revealPanel(kind));
  find('[data-action=download]').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    await pending;
    try {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(runtime.save(), null, 2)], { type: 'application/json' }),
      );
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${id}.manifold.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent =
        'Project download requested, with the current accepted controls and source.';
    } catch (error) {
      status.textContent = 'Project could not be saved: ' + error.message;
    } finally {
      setBusy(false);
    }
  });
  find('[data-action=studio]').addEventListener('click', async () => {
    if (busy) return;
    setBusy(true);
    try {
      await pending;
      // Studio's draft handoff is absent from the public library build.
      const studio = import.meta.glob('../authoring/project-{launch,storage}.js');
      const launch = studio['../authoring/project-launch.js'], storage = studio['../authoring/project-storage.js'];
      if (!launch || !storage) throw new Error('Manifold Studio is not included in this build');
      const [{ projectStorageKey }, { writeProjectSnapshot }] = await Promise.all([launch(), storage()]);
      const draftId = crypto.randomUUID();
      await writeProjectSnapshot(projectStorageKey({ workspace: 'studio', draftId }), {
        ...runtime.save(),
        studio: { name: spec.title },
      });
      await releaseAudio();
      location.assign('/studio/?draft=' + encodeURIComponent(draftId));
    } catch (error) {
      status.textContent = 'Studio draft could not be opened: ' + error.message;
      setBusy(false);
    }
  });
  async function mountPresentation() {
    if (id !== 'field' || presentation || departed) return;
    const { mountCompositionView } = await import('@manifold/ui-web/composition-view');
    if (departed || presentation) return;
    presentation = mountCompositionView(find('[data-presentation]'), runtime, {
      analysis: () => observation,
      onError: (error) => {
        status.textContent = 'Presentation failed: ' + error.message;
      },
    });
  }
  const resize = new ResizeObserver(() => {
    if (!context) draw();
  });
  resize.observe(canvas);
  window.addEventListener('manifold-theme', () => {
    if (!context) draw();
  });
  window.addEventListener('pagehide', () => {
    departed = true;
    presentation?.dispose();
    presentation = null;
    // Fence pending parameter writes before closing their host.
    pending.finally(releaseAudio);
  });
  window.addEventListener('pageshow', () => {
    departed = false;
    setBusy(false);
    void mountPresentation();
  });
  await mountPresentation();
  audioButton.textContent = 'Start audio';
  setBusy(false);
  update();
  draw();
}
