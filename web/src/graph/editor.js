import { NODE_TYPES, SAMPLE_NODE_TYPES, addNode, removeNode, setConnection, setInitialParameter,
  setInputSource, setSidechainSource, captureGraphProject, parseGraphProject, parseGraphBundle, validateGraphAssets,
  validateGraphTargets, validateGraphTemporal, defaultGraphTemporal, deriveGraphHostBindings,
  reassignGraphHostSlot, HOST_SLOT_COUNT } from './topology.js';
import { parseMainVoiceBankState } from '../state/main-voice-bank.js';
import { parseProjectDocument } from '../state/project-document.js';
import { analyzeMainSource } from './main-source.js';
import mainVoiceBankProject from '../../../projects/main-voice-bank/project.json';
import toneTexture from '../../../projects/graph-workspace/tone-texture.json';
import noteVoice from '../../../projects/graph-workspace/note-voice.json';
import sampleVoice from '../../../projects/graph-workspace/sample-voice.json';
import regionVoice from '../../../projects/graph-workspace/region-voice.json';
import granularSource from '../../../projects/graph-workspace/granular-source.json';
import mainBank from '../../../projects/graph-workspace/main-bank.json';
import liveSampler from '../../../projects/graph-workspace/live-sampler.json';
import sidechainSampler from '../../../projects/graph-workspace/sidechain-sampler.json';
import retrospectiveSampler from '../../../projects/graph-workspace/retrospective-sampler.json';
import retrospectiveMultisource from '../../../projects/graph-workspace/retrospective-multisource.json';

const defaultMainTargets = (nodeId) => [mainVoiceBankProject.partials, ...mainVoiceBankProject.extraPartials]
  .map((target) => ({ ...target, nodeId }));
const MOTION_FIELDS = [
  { key: 'smooth', label: 'Smoothing', min: 0, max: 1, step: .01 },
  { key: 'contrast', label: 'Contrast', min: 0, max: 2, step: .01 },
  { index: 9, label: 'Stretch', min: 0, max: 1, step: .01 },
  { index: 10, label: 'Spectral tilt', choices: ['Neutral', 'Brighter', 'Darker'] },
  { index: 5, label: 'Add source', choices: ['Source partials', 'Driven wave'] },
  { index: 0, label: 'Driven wave', choices: ['Sine', 'Saw', 'Square', 'Triangle', 'Blend', 'Noise cloud', 'Pulse', 'SuperSaw'] },
  { index: 4, label: 'Pulse width', min: .01, max: .99, step: .01 },
  { index: 6, label: 'Morph amount', min: 0, max: 1, step: .01 },
  { index: 7, label: 'Morph depth', min: 0, max: 1, step: .01 },
  { index: 8, label: 'Morph curve', choices: ['Linear', 'Cosine', 'Equal power'] },
];
function temporalFromMainState(nodeId, controls) {
  return { nodeId, mode: controls.mode === 3 ? 2 : 1,
    speed: controls.speed, smooth: controls.smooth, contrast: controls.contrast,
    recipe: [controls.waveform, 8, 0, 0, controls.pulseWidth,
      controls.mode === 2 ? 1 : 0, controls.morphAmount, controls.morphDepth,
      controls.morphCurve, controls.stretch, controls.tiltMode] };
}

// Edits a project description outside the AudioWorklet. The next start compiles it in Rust.
export function mountGraphEditor(section, project, { isRunning, isActive, onChange, onParameter, onTemporalSpeed, onCapturePublish, onTemplateLoaded, decodeSample, builtinSample }) {
  const nodesRoot = section.querySelector('#graph-nodes');
  const status = section.querySelector('#graph-status');
  const addType = section.querySelector('#graph-add-type');
  const addButton = section.querySelector('#graph-add-node');
  const sourceMode = section.querySelector('#graph-source-mode');
  const sidechainMode = section.querySelector('#graph-sidechain-mode');
  const sidechainRow = section.querySelector('#graph-sidechain-row');
  const loadTone = section.querySelector('#graph-load-tone');
  const loadNote = section.querySelector('#graph-load-note');
  const loadSample = section.querySelector('#graph-load-sample');
  const loadRegion = section.querySelector('#graph-load-region');
  const loadGranular = section.querySelector('#graph-load-granular');
  const loadMain = section.querySelector('#graph-load-main');
  const loadLiveSampler = section.querySelector('#graph-load-live-sampler');
  const loadSidechainSampler = section.querySelector('#graph-load-sidechain-sampler');
  const loadRetrospectiveSampler = section.querySelector('#graph-load-retrospective-sampler');
  const loadRetrospectiveMultisource = section.querySelector('#graph-load-retrospective-multisource');
  const fileInput = section.querySelector('#graph-project-file');
  const exportButton = section.querySelector('#graph-project-export');
  const listeners = new AbortController();
  let busy = false;
  let destroyed = false;
  let revision = 0;
  let sourceRequest = 0;
  const pendingParameters = new Set();

  project.graphHostBindings = deriveGraphHostBindings(project.signal, project.graphHostBindings ?? []);

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
    section.querySelectorAll('.graph-capture-action').forEach((control) => {
      control.disabled = !canChangeParameter() || (control.tagName === 'BUTTON' && !isRunning());
    });
    fileInput.disabled = disabled;
    if (updateStatus && isActive()) status.textContent = `${project.signal.nodes.length} nodes · ${project.signal.connections.length} connections · ${isRunning() ? 'parameters update live; stop audio to edit topology' : 'start audio to compile this graph in Rust'}`;
  }
  function commit(signal, message, assets = project.graphAssets ?? [], targets = project.graphTargets ?? [], temporal = project.graphTemporal ?? [], hostBindings = project.graphHostBindings ?? []) {
    const checked = validateGraphAssets(signal, assets.filter((asset) => signal.nodes.some((node) => node.id === asset.nodeId && SAMPLE_NODE_TYPES.has(node.type))));
    const partials = validateGraphTargets(signal, targets.filter((target) => signal.nodes.some((node) => node.id === target.nodeId && node.type === 'main-voice-bank')));
    const motion = validateGraphTemporal(signal, checked, temporal.filter((entry) =>
      signal.nodes.some((node) => node.id === entry.nodeId && node.type === 'main-voice-bank')
      && checked.some((asset) => asset.nodeId === entry.nodeId)));
    revision++;
    project.signal = signal;
    project.graphAssets = checked;
    project.graphTargets = partials;
    project.graphTemporal = motion;
    project.graphHostBindings = deriveGraphHostBindings(signal, hostBindings);
    render();
    status.textContent = message;
    onChange?.(signal);
  }
  function fail(error) {
    status.textContent = `Graph unchanged: ${error.message ?? String(error)}`;
  }

  function render() {
    const expanded = new Set([...nodesRoot.querySelectorAll('details[open]')].map((item) => item.dataset.key));
    sourceMode.value = project.signal.inputSource === 'none' ? 'none' : 'external';
    sidechainMode.value = project.signal.sidechainSource ?? 'none';
    sidechainRow.hidden = !project.signal.nodes.some((node) => node.type === 'input.sidechain');
    const reachable = new Set([3, ...project.signal.nodes.filter((node) =>
      node.type === 'retrospective-capture').map((node) => node.id)]);
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
          const startingRevision = revision;
          const request = ++sourceRequest;
          try {
            if (!canEdit()) throw new Error('Stop audio before loading a sample.');
            status.textContent = `Decoding ${file.name}…`;
            const decoded = await decodeSample(file);
            if (!canEdit() || revision !== startingRevision || request !== sourceRequest) return;
            let targets = project.graphTargets ?? [];
            if (node.type === 'main-voice-bank') {
              status.textContent = `Preparing ${file.name} source spectrum in Rust/Wasm…`;
              const analyzed = await analyzeMainSource(decoded);
              if (!canEdit() || revision !== startingRevision || request !== sourceRequest) return;
              targets = targets.map((target) => target.nodeId === node.id && target.target === 1
                ? { nodeId: node.id, target: 1, ...analyzed } : target);
            }
            const assets = [...(project.graphAssets ?? []).filter((item) => item.nodeId !== node.id),
              { nodeId: node.id, sourceRate: decoded.sourceRate, stereo: decoded.stereo, label: decoded.label }];
            validateGraphAssets(project.signal, assets);
            commit(project.signal, `Loaded ${file.name} into ${spec.label.toLowerCase()} ${node.id}${node.type === 'main-voice-bank' ? ' with a new prepared source target' : ''}. Start audio to hear it.`, assets, targets);
          } catch (error) { if (revision === startingRevision && request === sourceRequest) fail(error); }
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
        const useBuiltin = document.createElement('button');
        useBuiltin.type = 'button';
        useBuiltin.className = 'graph-edit graph-remove';
        useBuiltin.textContent = 'Use built-in source';
        useBuiltin.setAttribute('aria-label', `Use built-in source for ${spec.label} ${node.id}`);
        useBuiltin.addEventListener('click', () => {
          if (!canEdit()) return;
          try {
            const source = builtinSample();
            const assets = [...(project.graphAssets ?? []).filter((item) => item.nodeId !== node.id),
              { nodeId: node.id, sourceRate: source.sourceRate, stereo: source.stereo, label: 'Built-in two-tone source' }];
            const targets = node.type === 'main-voice-bank'
              ? (project.graphTargets ?? []).map((target) => target.nodeId === node.id && target.target === 1
                ? defaultMainTargets(node.id)[1] : target)
              : project.graphTargets ?? [];
            commit(project.signal, `Restored built-in source for ${spec.label.toLowerCase()} ${node.id}. Start audio to hear it.`, assets, targets);
          } catch (error) { fail(error); }
        });
        article.appendChild(useBuiltin);
      }
      if (node.type === 'sample-instrument') {
        const captures = project.signal.nodes.filter((item) =>
          ['loop-capture', 'retrospective-capture'].includes(item.type) && reachable.has(item.id));
        if (captures.length) {
          const row = document.createElement('div');
          row.className = 'graph-capture-controls';
          const source = document.createElement('select');
          source.className = 'graph-capture-action';
          source.setAttribute('aria-label', `Capture source for sample instrument ${node.id}`);
          const sourceName = (capture) => {
            if (capture.type !== 'retrospective-capture') return `Loop capture ${capture.id}`;
            let upstream = project.signal.connections.find((edge) => edge.to === capture.id)?.from;
            if (project.signal.nodes.find((item) => item.id === upstream)?.type === 'fixed-gain') {
              upstream = project.signal.connections.find((edge) => edge.to === upstream)?.from;
            }
            const role = project.signal.nodes.find((item) => item.id === upstream)?.type;
            return `${role === 'input.sidechain' ? 'Sidechain' : role === 'input.raw' ? 'Audio input' : 'Retrospective'} · ${capture.id}`;
          };
          for (const capture of captures) source.add(new Option(sourceName(capture), String(capture.id)));
          source.value = String(project.signal.selectedCaptureNodeId ?? captures[0].id);
          source.addEventListener('change', () => {
            if (!canChangeParameter()) return;
            const chosen = selectedCapture();
            if (!chosen) return;
            commit({ ...project.signal, selectedCaptureNodeId: chosen.id }, `${sourceName(chosen)} selected for the next capture.`);
          });
          const windowSeconds = document.createElement('input');
          windowSeconds.type = 'number';
          windowSeconds.className = 'graph-capture-action';
          windowSeconds.min = '0.05';
          windowSeconds.max = '30';
          windowSeconds.step = '0.05';
          windowSeconds.value = String(project.signal.captureWindowSeconds ?? 2);
          windowSeconds.setAttribute('aria-label', `Recent window seconds for sample instrument ${node.id}`);
          windowSeconds.addEventListener('change', () => {
            if (!canChangeParameter()) return;
            const seconds = Number(windowSeconds.value);
            if (!Number.isFinite(seconds) || seconds < .05 || seconds > 30) {
              windowSeconds.value = String(project.signal.captureWindowSeconds ?? 2);
              fail(new Error('Choose a capture window from 0.05 to 30 seconds.'));
              return;
            }
            commit({ ...project.signal, captureWindowSeconds: seconds }, `Recent capture window: ${seconds} seconds.`);
          });
          const windowLabel = document.createElement('label');
          windowLabel.className = 'graph-capture-window';
          windowLabel.append('Recent window', windowSeconds, 'seconds');
          const publish = document.createElement('button');
          publish.type = 'button';
          publish.className = 'gate-button graph-capture-action';
          publish.textContent = 'Use stopped take';
          publish.setAttribute('aria-label', `Use stopped take for sample instrument ${node.id}`);
          const publishLive = document.createElement('button');
          publishLive.type = 'button';
          publishLive.className = 'gate-button graph-capture-action';
          publishLive.textContent = 'Use current recording';
          publishLive.setAttribute('aria-label', `Use current recording for sample instrument ${node.id}`);
          const selectedCapture = () => captures.find((item) => item.id === Number(source.value));
          const syncCaptureControls = () => {
            const retrospective = selectedCapture()?.type === 'retrospective-capture';
            windowLabel.hidden = !retrospective;
            publish.hidden = retrospective;
            publishLive.textContent = retrospective ? 'Capture recent window' : 'Use current recording';
            publishLive.setAttribute('aria-label', `${retrospective ? 'Capture recent window' : 'Use current recording'} for sample instrument ${node.id}`);
          };
          source.addEventListener('change', syncCaptureControls);
          syncCaptureControls();
          const useCapture = async (live) => {
            if (!isRunning() || !canChangeParameter()) return;
            const startingRevision = revision;
            const retrospective = selectedCapture()?.type === 'retrospective-capture';
            const seconds = retrospective ? Number(windowSeconds.value) : 0;
            if (retrospective && (!Number.isFinite(seconds) || seconds < .05 || seconds > 30)) {
              fail(new Error('Choose a capture window from 0.05 to 30 seconds.'));
              return;
            }
            busy = true;
            refreshRunning(false);
            status.textContent = `Publishing ${retrospective ? 'recent history' : live ? 'recording window' : 'stopped take'} ${source.value} to sample instrument ${node.id}…`;
            try {
              const asset = await onCapturePublish(Number(source.value), node.id, live, seconds);
              if (destroyed || revision !== startingRevision || !isActive() || !isRunning()) return;
              const label = `${retrospective ? 'Recent history' : live ? 'Recording window' : 'Loop take'} ${source.value}`;
              const assets = [...(project.graphAssets ?? []).filter((item) => item.nodeId !== node.id),
                { nodeId: node.id, sourceRate: asset.sourceRate, stereo: asset.stereo,
                  label }];
              const signal = { ...project.signal, selectedCaptureNodeId: Number(source.value),
                ...(retrospective ? { captureWindowSeconds: seconds } : {}) };
              commit(signal, `${label} is now the source for new notes. Held notes keep their previous source; project bundle includes the take.`, assets);
            } catch (error) { if (revision === startingRevision) fail(error); }
            finally { busy = false; refreshRunning(false); }
          };
          publish.addEventListener('click', () => useCapture(false));
          publishLive.addEventListener('click', () => useCapture(true));
          row.append(source, windowLabel, publish, publishLive);
          article.append(row);
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
          const startingRevision = revision;
          try {
            if (!canEdit()) throw new Error('Stop audio before opening a Main bank state.');
            if (file.size > 45 * 1024 * 1024) throw new Error('Main bank state must be smaller than 45 MB.');
            const parsed = parseProjectDocument(JSON.parse(await file.text()), mainVoiceBankProject, parseMainVoiceBankState).state;
            if (!canEdit() || revision !== startingRevision) return;
            const source = parsed.source.kind === 'builtin' ? builtinSample() : parsed.source;
            const signal = structuredClone(project.signal);
            for (const parameter of mainVoiceBankProject.parameters) {
              signal.initialParameters.find((entry) => entry.nodeId === node.id && entry.id === parameter.nodeParameterId).value = parsed.parameters[parameter.hostId];
            }
            const targets = [...(project.graphTargets ?? []).filter((target) => target.nodeId !== node.id),
              ...parsed.targets.map((target) => ({ ...target, nodeId: node.id }))];
            const assets = [...(project.graphAssets ?? []).filter((asset) => asset.nodeId !== node.id),
              { nodeId: node.id, sourceRate: source.sourceRate, stereo: source.stereo, label: source.label ?? 'Built-in two-tone source' }];
            const temporal = [...(project.graphTemporal ?? []).filter((entry) => entry.nodeId !== node.id),
              ...(parsed.targetControls.active && parsed.targetControls.followPlayback
                ? [temporalFromMainState(node.id, parsed.targetControls)] : [])];
            commit(signal, `Imported ${file.name} into Main bank ${node.id}. Its prepared targets and controls are ready; start audio to hear it.`, assets, targets, temporal);
          } catch (error) { if (revision === startingRevision) fail(error); }
          finally { importInput.value = ''; }
        });
        importLabel.append(importInput);
        article.append(importLabel);
        const motion = (project.graphTemporal ?? []).find((entry) => entry.nodeId === node.id);
        const followRow = document.createElement('label');
        followRow.className = 'graph-field';
        const followText = document.createElement('span');
        followText.textContent = 'Source follow';
        followText.title = 'Each voice follows its sample position through prepared source frames in Add or Morph mode.';
        const follow = document.createElement('input');
        follow.type = 'checkbox';
        follow.className = 'graph-edit';
        follow.checked = Boolean(motion);
        follow.setAttribute('aria-label', `Main voice bank ${node.id} follow source position`);
        follow.addEventListener('change', () => {
          if (!canEdit()) return;
          try {
            if (follow.checked && !(project.graphAssets ?? []).some((asset) => asset.nodeId === node.id)) {
              throw new Error('Load a Main source before enabling motion.');
            }
            const temporal = [...(project.graphTemporal ?? []).filter((entry) => entry.nodeId !== node.id),
              ...(follow.checked ? [motion ?? defaultGraphTemporal(node.id)] : [])];
            commit(project.signal, `${follow.checked ? 'Enabled' : 'Disabled'} source motion for Main bank ${node.id}.`,
              project.graphAssets, project.graphTargets, temporal);
          } catch (error) { follow.checked = Boolean(motion); fail(error); }
        });
        followRow.append(followText, follow);
        article.append(followRow);
        if (motion) {
          const speedRow = document.createElement('label');
          speedRow.className = 'graph-field';
          const speedText = document.createElement('span');
          speedText.textContent = 'Motion speed';
          const speed = document.createElement('input');
          speed.type = 'number';
          speed.min = '0';
          speed.max = '4';
          speed.step = '0.1';
          speed.value = String(motion.speed);
          speed.className = 'graph-parameter';
          speed.setAttribute('aria-label', `Main voice bank ${node.id} motion speed`);
          speed.addEventListener('change', () => {
            if (!canChangeParameter()) return;
            try {
              const temporal = (project.graphTemporal ?? []).map((entry) => entry.nodeId === node.id
                ? { ...entry, speed: Number(speed.value) } : entry);
              validateGraphTemporal(project.signal, project.graphAssets ?? [], temporal);
              if (isRunning()) onTemporalSpeed?.(node.id, Number(speed.value));
              commit(project.signal, `Updated Main bank ${node.id} source motion to ${speed.value}×.`,
                project.graphAssets, project.graphTargets, temporal);
            } catch (error) { speed.value = String(motion.speed); fail(error); }
          });
          speedRow.append(speedText, speed);
          article.append(speedRow);
          const shape = document.createElement('details');
          shape.className = 'graph-motion';
          shape.dataset.key = `motion-${node.id}`;
          shape.open = expanded.has(shape.dataset.key);
          const shapeTitle = document.createElement('summary');
          shapeTitle.textContent = 'Source shape · worker recipe';
          shape.append(shapeTitle);
          for (const field of MOTION_FIELDS) {
            const current = field.key ? motion[field.key] : motion.recipe[field.index];
            const row = document.createElement('label');
            row.className = 'graph-field graph-motion-field';
            const label = document.createElement('span');
            label.textContent = field.label;
            let input;
            if (field.choices) {
              input = document.createElement('select');
              field.choices.forEach((choice, index) => input.add(new Option(choice, String(index))));
            } else {
              input = document.createElement('input');
              input.type = 'range';
              input.min = String(field.min);
              input.max = String(field.max);
              input.step = String(field.step);
            }
            input.value = String(current);
            input.className = 'graph-edit';
            input.setAttribute('aria-label', `Main voice bank ${node.id} ${field.label}`);
            const control = document.createElement('span');
            control.className = 'graph-motion-control';
            control.append(input);
            if (!field.choices) {
              const readout = document.createElement('output');
              readout.value = Number(current).toFixed(2);
              input.addEventListener('input', () => { readout.value = Number(input.value).toFixed(2); });
              control.append(readout);
            }
            input.addEventListener('change', () => {
              if (!canEdit()) return;
              try {
                const updated = { ...motion, recipe: [...motion.recipe] };
                if (field.key) updated[field.key] = Number(input.value);
                else updated.recipe[field.index] = Number(input.value);
                const temporal = (project.graphTemporal ?? []).map((entry) => entry.nodeId === node.id ? updated : entry);
                commit(project.signal, `Updated Main bank ${node.id} ${field.label.toLowerCase()} source shape. Start audio to rebuild frames.`,
                  project.graphAssets, project.graphTargets, temporal);
              } catch (error) { input.value = String(current); fail(error); }
            });
            row.append(label, control);
            shape.append(row);
          }
          article.append(shape);
        }
        const targets = (project.graphTargets ?? []).filter((target) => target.nodeId === node.id);
        for (const target of targets) {
          const details = document.createElement('details');
          details.className = 'graph-target';
          details.dataset.key = `target-${node.id}-${target.target}`;
          details.open = expanded.has(details.dataset.key);
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
        const row = document.createElement('div');
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
        const controls = document.createElement('span');
        controls.className = 'graph-parameter-controls';
        controls.append(input);
        const binding = (project.graphHostBindings ?? []).find((item) => item.nodeId === node.id && item.id === parameter.id);
        if (binding) {
          const slotLabel = document.createElement('span');
          slotLabel.className = 'graph-slot-label';
          slotLabel.textContent = 'Host slot';
          const slotInput = document.createElement('input');
          slotInput.type = 'number';
          slotInput.className = 'graph-edit graph-slot-input';
          slotInput.min = '1';
          slotInput.max = String(HOST_SLOT_COUNT);
          slotInput.step = '1';
          slotInput.value = String(binding.slot + 1);
          slotInput.setAttribute('aria-label', `Host slot for ${spec.label} ${node.id} ${parameter.label}`);
          slotInput.addEventListener('change', () => {
            if (!canEdit()) return;
            try {
              if (slotInput.value.trim() === '') throw new Error('Enter a host slot number.');
              const requested = Number(slotInput.value) - 1;
              const occupied = (project.graphHostBindings ?? []).find((item) => item.slot === requested);
              const bindings = reassignGraphHostSlot(project.signal, project.graphHostBindings ?? [], node.id, parameter.id, requested);
              const displacedNode = project.signal.nodes.find((item) => item.id === occupied?.nodeId);
              const displaced = NODE_TYPES[displacedNode?.type]?.parameters?.find((item) => item.id === occupied?.id);
              const swap = occupied && occupied !== binding
                ? `; ${NODE_TYPES[displacedNode.type].label} ${occupied.nodeId} ${displaced?.label ?? occupied.id} moved to slot ${binding.slot + 1}` : '';
              commit(project.signal, `Assigned ${spec.label} ${node.id} ${parameter.label} to host slot ${requested + 1}${swap}. Download the graph project to use this mapping in a host.`,
                project.graphAssets, project.graphTargets, project.graphTemporal, bindings);
            } catch (error) { slotInput.value = String(binding.slot + 1); fail(error); }
          });
          controls.append(slotLabel, slotInput);
        }
        row.append(text, controls);
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
  sidechainMode.addEventListener('change', () => {
    if (!canEdit()) return;
    try {
      commit(setSidechainSource(project.signal, sidechainMode.value),
        `Sidechain bus: ${sidechainMode.selectedOptions[0].textContent}. Start audio to connect its separate worklet input.`);
    } catch (error) { sidechainMode.value = project.signal.sidechainSource ?? 'none'; fail(error); }
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
        [{ nodeId: 5, sourceRate: source.sourceRate, stereo: source.stereo, label: 'Built-in two-tone source' }], bundle.targets, bundle.temporal);
      onTemplateLoaded?.('main-bank');
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  loadLiveSampler.addEventListener('click', () => {
    if (!canEdit()) return;
    try {
      const source = builtinSample();
      const signal = parseGraphProject(liveSampler);
      commit(signal, 'Loaded the live sampler. Start audio and record Loop capture 6. Publish the current recording window to Sample instrument 5 at any time, or stop and use the completed take.',
        [{ nodeId: 5, sourceRate: source.sourceRate, stereo: source.stereo, label: 'Built-in two-tone source' }]);
      onTemplateLoaded?.('live-sampler');
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  loadSidechainSampler.addEventListener('click', () => {
    if (!canEdit()) return;
    try {
      const source = builtinSample();
      const signal = parseGraphProject(sidechainSampler);
      commit(signal, 'Loaded separate main and sidechain inputs. Start audio and record Loop capture 6; publish its current window while recording continues, or stop and use the completed sidechain take.',
        [{ nodeId: 5, sourceRate: source.sourceRate, stereo: source.stereo, label: 'Built-in two-tone source' }]);
      onTemplateLoaded?.('sidechain-sampler');
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  loadRetrospectiveSampler.addEventListener('click', () => {
    if (!canEdit()) return;
    try {
      const source = builtinSample();
      const signal = parseGraphProject(retrospectiveSampler);
      commit(signal, 'Loaded the always-on retrospective sampler. Start audio, wait for input, then choose a recent window under Sample instrument 5.',
        [{ nodeId: 5, sourceRate: source.sourceRate, stereo: source.stereo, label: 'Built-in two-tone source' }]);
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  loadRetrospectiveMultisource.addEventListener('click', () => {
    if (!canEdit()) return;
    try {
      const source = builtinSample();
      const signal = parseGraphProject(retrospectiveMultisource);
      commit(signal, 'Loaded Audio Input and Sidechain retrospective sources. Both record while audio runs; select either source under Sample instrument 5 to publish its recent window.',
        [{ nodeId: 5, sourceRate: source.sourceRate, stereo: source.stereo, label: 'Built-in two-tone source' }]);
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  exportButton.addEventListener('click', () => {
    if (!isActive()) return;
    try {
      const bundle = captureGraphProject(project.signal, project.graphAssets ?? [], project.graphTargets ?? [], project.graphTemporal ?? [], project.graphHostBindings ?? null);
      const url = URL.createObjectURL(new Blob([`${JSON.stringify(bundle, null, 2)}\n`], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = 'manifold-graph-workspace-project.json';
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      status.textContent = `Downloaded ${bundle.signal.nodes.length} nodes, ${bundle.signal.connections.length} connections, ${bundle.hostBindings.length} host control slots, ${bundle.assets?.length ?? 0} sample assets, ${bundle.targets?.length ?? 0} partial targets, and ${bundle.temporal?.length ?? 0} motion recipes.`;
    } catch (error) { fail(error); }
  }, { signal: listeners.signal });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    const startingRevision = revision;
    try {
      if (!canEdit()) throw new Error('Stop audio before opening a graph.');
      if (file.size > 45 * 1024 * 1024) throw new Error('Graph project must be smaller than 45 MB.');
      const contents = await file.text();
      if (!canEdit() || revision !== startingRevision) return;
      const bundle = parseGraphBundle(JSON.parse(contents));
      commit(bundle.signal, `Opened ${file.name} with ${bundle.hostBindings.length} host slots, ${bundle.assets.length} sample assets, ${bundle.targets.length} partial targets, and ${bundle.temporal.length} motion recipes. Start audio to compile the restored graph.`, bundle.assets, bundle.targets, bundle.temporal, bundle.hostBindings);
    } catch (error) { if (revision === startingRevision) fail(error); }
    finally { fileInput.value = ''; }
  }, { signal: listeners.signal });
  render();
  return { refreshRunning, setBusy(value) { busy = value; refreshRunning(); },
    destroy() { destroyed = true; listeners.abort(); } };
}
