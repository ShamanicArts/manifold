import { NODE_TYPES, SAMPLE_NODE_TYPES, addNode, removeNode, setConnection, setInitialParameter,
  setInputSource, captureGraphProject, parseGraphProject, parseGraphBundle, validateGraphAssets,
  validateGraphTargets } from './topology.js';
import { parseMainVoiceBankState } from '../state/main-voice-bank.js';
import { parseProjectDocument } from '../state/project-document.js';
import mainVoiceBankProject from '../../../projects/main-voice-bank/project.json';
import toneTexture from '../../../projects/graph-workspace/tone-texture.json';
import noteVoice from '../../../projects/graph-workspace/note-voice.json';
import sampleVoice from '../../../projects/graph-workspace/sample-voice.json';
import regionVoice from '../../../projects/graph-workspace/region-voice.json';
import granularSource from '../../../projects/graph-workspace/granular-source.json';
import mainBank from '../../../projects/graph-workspace/main-bank.json';

const defaultMainTargets = (nodeId) => [mainVoiceBankProject.partials, ...mainVoiceBankProject.extraPartials]
  .map((target) => ({ ...target, nodeId }));

// Edits a project description outside the AudioWorklet. The next start compiles it in Rust.
export function mountGraphEditor(section, project, { isRunning, isActive, onChange, onParameter, onTemplateLoaded, decodeSample, builtinSample }) {
  const nodesRoot = section.querySelector('#graph-nodes');
  const status = section.querySelector('#graph-status');
  const addType = section.querySelector('#graph-add-type');
  const addButton = section.querySelector('#graph-add-node');
  const sourceMode = section.querySelector('#graph-source-mode');
  const loadTone = section.querySelector('#graph-load-tone');
  const loadNote = section.querySelector('#graph-load-note');
  const loadSample = section.querySelector('#graph-load-sample');
  const loadRegion = section.querySelector('#graph-load-region');
  const loadGranular = section.querySelector('#graph-load-granular');
  const loadMain = section.querySelector('#graph-load-main');
  const fileInput = section.querySelector('#graph-project-file');
  const exportButton = section.querySelector('#graph-project-export');
  const listeners = new AbortController();
  let busy = false;
  let destroyed = false;
  const pendingParameters = new Set();

  addType.replaceChildren(...Object.entries(NODE_TYPES).filter(([, spec]) => !spec.fixedId)
    .map(([type, spec]) => new Option(spec.label, type)));

  const canEdit = () => !destroyed && isActive() && !isRunning() && !busy;
  const canChangeParameter = () => !destroyed && isActive() && !busy;
  function refreshRunning(updateStatus = true) {
    const disabled = !canEdit();
    section.querySelectorAll('.graph-edit').forEach((control) => { control.disabled = disabled; });
    section.querySelectorAll('.graph-parameter').forEach((control) => {
      control.disabled = !canChangeParameter() || pendingParameters.has(`${control.dataset.node}:${control.dataset.parameter}`);
    });
    fileInput.disabled = disabled;
    if (updateStatus && isActive()) status.textContent = `${project.signal.nodes.length} nodes · ${project.signal.connections.length} connections · ${isRunning() ? 'parameters update live; stop audio to edit topology' : 'start audio to compile this graph in Rust'}`;
  }
  function commit(signal, message, assets = project.graphAssets ?? [], targets = project.graphTargets ?? []) {
    const checked = validateGraphAssets(signal, assets.filter((asset) => signal.nodes.some((node) => node.id === asset.nodeId && SAMPLE_NODE_TYPES.has(node.type))));
    const partials = validateGraphTargets(signal, targets.filter((target) => signal.nodes.some((node) => node.id === target.nodeId && node.type === 'main-voice-bank')));
    project.signal = signal;
    project.graphAssets = checked;
    project.graphTargets = partials;
    render();
    status.textContent = message;
    onChange?.(signal);
  }
  function fail(error) {
    status.textContent = `Graph unchanged: ${error.message ?? String(error)}`;
  }

  function render() {
    sourceMode.value = project.signal.inputSource === 'none' ? 'none' : 'external';
    const reachable = new Set([3]);
    let changed;
    do {
      changed = false;
      for (const edge of project.signal.connections) {
        if (reachable.has(edge.to) && !reachable.has(edge.from)) {
          reachable.add(edge.from);
          changed = true;
        }
      }
    } while (changed);
    nodesRoot.replaceChildren();
    for (const node of project.signal.nodes) {
      const spec = NODE_TYPES[node.type];
      const article = document.createElement('article');
      article.className = 'graph-node';
      if (!reachable.has(node.id)) article.classList.add('graph-node-parked');
      const heading = document.createElement('div');
      heading.className = 'graph-node-heading';
      const name = document.createElement('strong');
      name.textContent = `${node.id} · ${spec.label}`;
      const signal = document.createElement('span');
      signal.className = `graph-signal graph-signal-${spec.output ?? 'sink'}`;
      signal.textContent = spec.output ?? 'sink';
      heading.append(name, signal);
      if (!reachable.has(node.id)) {
        const parked = document.createElement('span');
        parked.className = 'graph-parked';
        parked.textContent = 'parked';
        parked.title = 'This node is disconnected from Output and does not run until its route is connected on a stopped edit.';
        heading.append(parked);
      }
      if (!spec.fixedId) {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'graph-edit graph-remove';
        remove.textContent = 'Remove';
        remove.setAttribute('aria-label', `Remove ${spec.label} node ${node.id}`);
        remove.addEventListener('click', () => {
          if (!canEdit()) return;
          try { commit(removeNode(project.signal, node.id), `Removed ${spec.label} ${node.id}. Start audio to compile.`); }
          catch (error) { fail(error); }
        });
        heading.append(remove);
      }
      article.appendChild(heading);
      if (SAMPLE_NODE_TYPES.has(node.type)) {
        const asset = project.graphAssets?.find((item) => item.nodeId === node.id);
        const source = document.createElement('label');
        source.className = 'sample-file graph-sample-file';
        source.textContent = asset ? `Source: ${asset.label} · ${(asset.stereo.length / 2 / asset.sourceRate).toFixed(2)} s · replace file`
          : node.type === 'granulator' ? 'Live input capture · choose a file to use a fixed source'
            : 'No source loaded · choose audio file';
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'audio/*,.wav,.aiff,.aif,.flac,.mp3,.ogg';
        input.className = 'graph-edit';
        input.setAttribute('aria-label', `${spec.label} ${node.id} audio file`);
        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;
          try {
            if (!canEdit()) throw new Error('Stop audio before loading a sample.');
            status.textContent = `Decoding ${file.name}…`;
            const decoded = await decodeSample(file);
            if (!canEdit()) throw new Error('Project view changed while decoding the sample.');
            const assets = [...(project.graphAssets ?? []).filter((item) => item.nodeId !== node.id),
              { nodeId: node.id, sourceRate: decoded.sourceRate, stereo: decoded.stereo, label: decoded.label }];
            validateGraphAssets(project.signal, assets);
            commit(project.signal, `Loaded ${file.name} into ${spec.label.toLowerCase()} ${node.id}. Start audio to hear it.`, assets);
          } catch (error) { fail(error); }
          finally { input.value = ''; }
        });
        source.append(input);
        article.appendChild(source);
        if (asset) {
          const clear = document.createElement('button');
          clear.type = 'button';
          clear.className = 'graph-edit graph-remove';
          clear.textContent = 'Remove source';
          clear.setAttribute('aria-label', `Remove source from ${spec.label} ${node.id}`);
          clear.addEventListener('click', () => {
            if (!canEdit()) return;
            commit(project.signal, `Removed source from ${spec.label.toLowerCase()} ${node.id}. Start audio to compile.`,
              project.graphAssets.filter((item) => item.nodeId !== node.id));
          });
          article.appendChild(clear);
        }
      }
      if (node.type === 'main-voice-bank') {
        const importLabel = document.createElement('label');
        importLabel.className = 'sample-file graph-sample-file';
        importLabel.textContent = 'Open standalone Main bank state or project';
        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = 'application/json,.json';
        importInput.className = 'graph-edit';
        importInput.setAttribute('aria-label', `Main voice bank ${node.id} state`);
        importInput.addEventListener('change', async () => {
          const file = importInput.files?.[0];
          if (!file) return;
          try {
            if (!canEdit()) throw new Error('Stop audio before opening a Main bank state.');
            if (file.size > 45 * 1024 * 1024) throw new Error('Main bank state must be smaller than 45 MB.');
            const parsed = parseProjectDocument(JSON.parse(await file.text()), mainVoiceBankProject, parseMainVoiceBankState).state;
            if (!canEdit()) throw new Error('Project view changed while opening the Main bank state.');
            const source = parsed.source.kind === 'builtin' ? builtinSample() : parsed.source;
            const signal = structuredClone(project.signal);
            for (const parameter of mainVoiceBankProject.parameters) {
              signal.initialParameters.find((entry) => entry.nodeId === node.id && entry.id === parameter.nodeParameterId).value = parsed.parameters[parameter.hostId];
            }
            const targets = [...(project.graphTargets ?? []).filter((target) => target.nodeId !== node.id),
              ...parsed.targets.map((target) => ({ ...target, nodeId: node.id }))];
            const assets = [...(project.graphAssets ?? []).filter((asset) => asset.nodeId !== node.id),
              { nodeId: node.id, sourceRate: source.sourceRate, stereo: source.stereo, label: source.label ?? 'Built-in two-tone source' }];
            commit(signal, `Imported ${file.name} into Main bank ${node.id}. Its prepared targets and controls are ready; start audio to hear it.`, assets, targets);
          } catch (error) { fail(error); }
          finally { importInput.value = ''; }
        });
        importLabel.append(importInput);
        article.append(importLabel);
        const targets = (project.graphTargets ?? []).filter((target) => target.nodeId === node.id);
        for (const target of targets) {
          const details = document.createElement('details');
          details.className = 'graph-target';
          const summary = document.createElement('summary');
          summary.textContent = `${target.target === 0 ? 'Wave' : 'Source'} target · ${target.values.length / 4} partials`;
          const values = document.createElement('textarea');
          values.className = 'graph-edit';
          values.rows = 4;
          values.value = JSON.stringify({ fundamental: target.fundamental, values: target.values });
          values.setAttribute('aria-label', `Main voice bank ${node.id} ${target.target === 0 ? 'wave' : 'source'} target JSON`);
          const apply = document.createElement('button');
          apply.type = 'button';
          apply.className = 'graph-edit gate-button';
          apply.textContent = 'Apply target';
          apply.addEventListener('click', () => {
            if (!canEdit()) return;
            try {
              const updated = { ...JSON.parse(values.value), nodeId: node.id, target: target.target };
              const next = (project.graphTargets ?? []).map((item) => item === target ? updated : item);
              commit(project.signal, `Updated ${target.target === 0 ? 'wave' : 'source'} target for Main bank ${node.id}. Start audio to compile.`, project.graphAssets, next);
            } catch (error) { fail(error); }
          });
          details.append(summary, values, apply);
          article.append(details);
        }
      }
      for (let port = 0; port < spec.inputs.length; port++) {
        const kind = spec.inputs[port];
        const row = document.createElement('label');
        row.className = 'graph-field';
        const text = document.createElement('span');
        text.textContent = `${kind === 'control' ? 'CV' : kind === 'midi' ? 'MIDI' : 'Audio'} input ${port + 1}`;
        const select = document.createElement('select');
        select.className = 'graph-edit';
        select.dataset.to = String(node.id);
        select.dataset.port = String(port);
        select.setAttribute('aria-label', `${spec.label} ${node.id} ${kind} input ${port + 1}`);
        select.add(new Option('Unconnected', ''));
        for (const source of project.signal.nodes) {
          if (source.id !== node.id && NODE_TYPES[source.type].output === kind) {
            select.add(new Option(`${source.id} · ${NODE_TYPES[source.type].label}`, String(source.id)));
          }
        }
        const current = project.signal.connections.find((edge) => edge.to === node.id && edge.inputPort === port);
        select.value = current ? String(current.from) : '';
        select.addEventListener('change', () => {
          if (!canEdit()) return;
          try {
            const from = select.value === '' ? null : Number(select.value);
            commit(setConnection(project.signal, node.id, port, from), `Updated ${spec.label} ${node.id} input ${port + 1}. Start audio to compile.`);
          } catch (error) { select.value = current ? String(current.from) : ''; fail(error); }
        });
        row.append(text, select);
        article.appendChild(row);
      }
      for (const parameter of spec.parameters ?? []) {
        const entry = project.signal.initialParameters.find((item) => item.nodeId === node.id && item.id === parameter.id);
        const row = document.createElement('label');
        row.className = 'graph-field';
        const text = document.createElement('span');
        text.textContent = parameter.label;
        let input;
        if (parameter.choices) {
          input = document.createElement('select');
          for (const [index, choice] of parameter.choices.entries()) input.add(new Option(choice, String(index)));
        } else {
          input = document.createElement('input');
          input.type = 'number';
          input.min = String(parameter.min);
          input.max = String(parameter.max);
          input.step = 'any';
        }
        input.className = 'graph-parameter';
        input.dataset.node = String(node.id);
        input.dataset.parameter = String(parameter.id);
        input.setAttribute('aria-label', `${spec.label} ${node.id} ${parameter.label}`);
        input.value = String(entry.value);
        input.addEventListener('change', async () => {
          if (!canChangeParameter()) return;
          const key = `${node.id}:${parameter.id}`;
          try {
            if (input.value.trim() === '') throw new Error('Enter a parameter value.');
            const value = Number(input.value);
            setInitialParameter(project.signal, node.id, parameter.id, value);
            if (isRunning()) {
              pendingParameters.add(key);
              input.disabled = true;
              await onParameter(node.id, parameter.id, value);
            }
            if (!canChangeParameter()) return;
            commit(setInitialParameter(project.signal, node.id, parameter.id, value),
              `Updated ${spec.label} ${node.id} ${parameter.label}${isRunning() ? ' in Rust and project state.' : '. Start audio to compile.'}`);
          }
          catch (error) { input.value = String(project.signal.initialParameters.find((item) => item.nodeId === node.id && item.id === parameter.id)?.value ?? entry.value); fail(error); }
          finally { pendingParameters.delete(key); refreshRunning(false); }
        });
        row.append(text, input);
        article.appendChild(row);
      }
      nodesRoot.appendChild(article);
    }
    refreshRunning();
  }

  addButton.addEventListener('click', () => {
    if (!canEdit()) return;
    try {
      const signal = addNode(project.signal, addType.value);
      const added = signal.nodes.at(-1);
      const targets = added.type === 'main-voice-bank' ? [...(project.graphTargets ?? []), ...defaultMainTargets(added.id)] : project.graphTargets ?? [];
      commit(signal, `Added ${NODE_TYPES[addType.value].label}. Connect its ports, then start audio.`, project.graphAssets, targets);
    }
    catch (error) { fail(error); }
  }, { signal: listeners.signal });
  sourceMode.addEventListener('change', () => {
    if (!canEdit()) return;
    try { commit(setInputSource(project.signal, sourceMode.value),
      sourceMode.value === 'none' ? 'External input off. Internal graph sources will play on the next start.' : 'External input on. Choose the test oscillator or microphone above.'); }
    catch (error) { sourceMode.value = project.signal.inputSource === 'none' ? 'none' : 'external'; fail(error); }
  }, { signal: listeners.signal });
  loadTone.addEventListener('click', () => {
    if (!canEdit()) return;
    try {
      commit(parseGraphProject(toneTexture), 'Loaded the tone and noise study. Start the instrument to hear its Rust graph.', []);
      onTemplateLoaded?.('texture');
    }
    catch (error) { fail(error); }
  }, { signal: listeners.signal });
  loadNote.addEventListener('click', () => {
    if (!canEdit()) return;
    try {
      commit(parseGraphProject(noteVoice), 'Loaded the note voice. Start the instrument, then play the on-screen keyboard.', []);
      onTemplateLoaded?.('note-voice');
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  loadSample.addEventListener('click', () => {
    if (!canEdit()) return;
    try {
      const source = builtinSample();
      const signal = parseGraphProject(sampleVoice);
      commit(signal, 'Loaded the sample voice study with a built-in source. Start the instrument, then play the keyboard.',
        [{ nodeId: 5, sourceRate: source.sourceRate, stereo: source.stereo, label: 'Built-in two-tone source' }]);
      onTemplateLoaded?.('sample-voice');
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  loadRegion.addEventListener('click', () => {
    if (!canEdit()) return;
    try {
      const source = builtinSample();
      const signal = parseGraphProject(regionVoice);
      commit(signal, 'Loaded the sample region study. Notes retrigger one region playhead.',
        [{ nodeId: 5, sourceRate: source.sourceRate, stereo: source.stereo, label: 'Built-in two-tone source' }]);
      onTemplateLoaded?.('region-voice');
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  loadGranular.addEventListener('click', () => {
    if (!canEdit()) return;
    try {
      const source = builtinSample();
      const signal = parseGraphProject(granularSource);
      commit(signal, 'Loaded the granulator with a built-in source. Start audio to hear its grains.',
        [{ nodeId: 5, sourceRate: source.sourceRate, stereo: source.stereo, label: 'Built-in two-tone source' }]);
      onTemplateLoaded?.('granular-source');
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  loadMain.addEventListener('click', () => {
    if (!canEdit()) return;
    try {
      const source = builtinSample();
      const bundle = parseGraphBundle(mainBank);
      commit(bundle.signal, 'Loaded the Main voice bank with prepared wave/source targets. Start audio and play the keyboard.',
        [{ nodeId: 5, sourceRate: source.sourceRate, stereo: source.stereo, label: 'Built-in two-tone source' }], bundle.targets);
      onTemplateLoaded?.('main-bank');
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  exportButton.addEventListener('click', () => {
    if (!isActive()) return;
    try {
      const bundle = captureGraphProject(project.signal, project.graphAssets ?? [], project.graphTargets ?? []);
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'manifold-graph-workspace-project.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = `Downloaded ${bundle.signal.nodes.length} nodes, ${bundle.signal.connections.length} connections, ${bundle.assets?.length ?? 0} sample assets, and ${bundle.targets?.length ?? 0} partial targets.`;
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    try {
      if (!canEdit()) throw new Error('Stop audio before opening a graph.');
      if (file.size > 45 * 1024 * 1024) throw new Error('Graph project must be smaller than 45 MB.');
      const contents = await file.text();
      if (!canEdit()) throw new Error('Project view changed while opening the graph.');
      const bundle = parseGraphBundle(JSON.parse(contents));
      commit(bundle.signal, `Opened ${file.name} with ${bundle.assets.length} sample assets and ${bundle.targets.length} partial targets. Start audio to compile the restored graph.`, bundle.assets, bundle.targets);
    } catch (error) { fail(error); }
    finally { fileInput.value = ''; }
  }, { signal: listeners.signal });
  render();
  return { refreshRunning, setBusy(value) { busy = value; refreshRunning(); },
    destroy() { destroyed = true; listeners.abort(); } };
}
