import { PORT_CATALOG } from './catalog.generated.js';
import { decodeSampleAsset } from './sample-assets.js';
import { RING_BLOCKS, MAX_FRAMES, 
  WORKER_TIMING_SAMPLES, EVENT_CAPACITY, EVENT_WORDS,
  EVENT_WORDS_PER_WORKER, LIVE_RECORD_BYTES } from './worker-transport.js';

const kinds = Object.fromEntries(Object.entries(PORT_CATALOG).map(([id, spec]) => [id, spec.code]));
let engine = null;
let inputView = null;
let outputView = null;
let control = null;
let counts = null;
let input = null;
let output = null;
let commands = null;
let commandFloats = null;
let workerTiming = null;
let workerServiceTiming = null;
let profiling = false;
let workerEpochs = null;
let generation = 0;
let events = null;
let liveStateTags = null;
let liveStateRecords = null;
let liveRecordCapacity = 0;
let liveBufferBytes = 0;
let wasmByteView = null;
let slot = -1;
let running = false;
let seen = 0;
const parameterValues = new Map();

async function prepare({ wasmBytes, project, transport, workerSlot, sampleRate, identity, profiling: requestedProfiling,
  workerGeneration, liveStateBuffer, previousLiveStateBuffer, commandBuffer }) {
  const started = performance.now();
  const graph = project.signal;
  if (engine || workerSlot !== 0 && workerSlot !== 1) throw new Error('Invalid graph worker slot');
  slot = workerSlot;
  generation = workerGeneration;
  workerEpochs = new Int32Array(transport.workerEpochs);
  const instance = await WebAssembly.instantiate(await WebAssembly.compile(wasmBytes), {});
  const wasm = instance.exports;
  if (Atomics.load(workerEpochs, slot) !== generation) throw new Error('Graph worker preparation cancelled');
  if (wasm.manifold_version() !== 5) throw new Error('Incompatible graph module');
  if (wasm.manifold_graph_begin(graph.nodes.length, graph.connections.length) !== 1
    || wasm.manifold_graph_patchable(1) !== 1) throw new Error('Graph too large');
  for (const node of graph.nodes) {
    if (!(node.type in kinds)
      || wasm.manifold_graph_node(node.id, kinds[node.type], node.a ?? 0, node.b ?? 0) !== 1) {
      throw new Error(`Invalid graph node ${node.id}`);
    }
  }
  for (const edge of graph.connections) {
    if (wasm.manifold_graph_edge_ports(edge.from, edge.outputPort ?? 0,
      edge.to, edge.inputPort) !== 1) throw new Error('Invalid graph edge');
  }
  const afterPrepare = [];
  for (const parameter of graph.initialParameters ?? []) {
    parameterValues.set(`${parameter.nodeId}:${parameter.id}`, parameter.value);
    if (wasm.manifold_graph_initial_parameter(parameter.nodeId, parameter.id, parameter.value) !== 1) {
      afterPrepare.push(parameter);
    }
  }
  if (wasm.manifold_prepare(sampleRate, MAX_FRAMES) !== 1) throw new Error('Graph preparation failed');
  for (const node of graph.nodes) {
    if (node.type !== 'loop-capture' && node.type !== 'retrospective-capture') continue;
    const frames = wasm.manifold_capture_capacity(node.id);
    if (wasm.manifold_capture_stage_reserve(node.id, frames) !== 1) {
      throw new Error(`Capture staging preparation failed: ${node.id}`);
    }
  }
  for (const parameter of afterPrepare) {
    if (wasm.manifold_set_node_parameter(parameter.nodeId, parameter.id, parameter.value) !== 1) {
      throw new Error(`Invalid initial parameter ${parameter.nodeId}/${parameter.id}`);
    }
  }
  if (wasm.manifold_graph_reset_processing() !== 1) throw new Error('Initial graph state reset failed');
  for (const asset of project.assets ?? []) {
    const { nodeId, sourceRate, stereo } = decodeSampleAsset(asset);
    if (wasm.manifold_sample_begin(nodeId, stereo.length / 2, sourceRate) !== 1) {
      throw new Error(`Sample preparation failed: ${nodeId}`);
    }
    const ptr = wasm.manifold_sample_ptr();
    if (!ptr) throw new Error(`Sample storage unavailable: ${nodeId}`);
    new Float32Array(wasm.memory.buffer, ptr, stereo.length).set(stereo);
    if (wasm.manifold_sample_commit() !== 1) throw new Error(`Sample loading failed: ${nodeId}`);
  }
  const restoredLoops = new Set((project.assets ?? []).map(asset => asset.nodeId)
    .filter(id => graph.nodes.some(node => node.id === id && node.type === 'loop-capture')));
  for (const parameter of graph.initialParameters ?? []) {
    if (restoredLoops.has(parameter.nodeId)
      && wasm.manifold_set_node_parameter(parameter.nodeId, parameter.id, parameter.value) !== 1) {
      throw new Error('Loop control restoration failed');
    }
  }
  for (const binding of project.sampleBindings ?? []) {
    if (wasm.manifold_sample_share(binding.sourceNodeId, binding.nodeId) !== 1) {
      throw new Error(`Sample binding failed: ${binding.nodeId}`);
    }
  }
  if (graph.directional && wasm.manifold_main_directional_configure(
    graph.directional.oscillatorId, graph.directional.sampleId) !== 1) {
    throw new Error('Main directional behavior preparation failed');
  }
  if (graph.directional?.vocoderId != null
    && wasm.manifold_main_pitch_configure(graph.directional.vocoderId) !== 1) {
    throw new Error('Main pitch behavior preparation failed');
  }
  inputView = new Float32Array(wasm.memory.buffer, wasm.manifold_input_ptr(), MAX_FRAMES * 4);
  outputView = new Float32Array(wasm.memory.buffer, wasm.manifold_output_ptr(), MAX_FRAMES * 2);
  wasmByteView = new Uint8Array(wasm.memory.buffer);
  control = new Int32Array(transport.control);
  counts = new Int32Array(transport.counts);
  input = new Float32Array(transport.input);
  output = new Float32Array(transport.output);
  commands = new Int32Array(commandBuffer);
  commandFloats = new Float32Array(commandBuffer);
  workerTiming = new Int32Array(transport.workerTiming);
  workerServiceTiming = new Int32Array(transport.workerServiceTiming);
  profiling = Boolean(requestedProfiling);
  events = new Int32Array(transport.events);
  liveStateTags = new Int32Array(transport.liveStateTags);
  liveRecordCapacity = graph.nodes.length;
  liveStateRecords = new Uint8Array(liveStateBuffer);
  liveBufferBytes = liveRecordCapacity * LIVE_RECORD_BYTES;
  if (liveStateRecords.length !== 2 * liveBufferBytes) throw new Error('Invalid prepared state storage');
  slot = workerSlot;
  engine = wasm;
  const state = identity === undefined ? { sequence: Atomics.load(control, 0), transferred: 0 }
    : restoreLiveState(identity, previousLiveStateBuffer);
  running = true;
  seen = state.sequence;
  postMessage({ type: 'ready', slot, preparationMs: performance.now() - started,
    transferred: state.transferred });
  renderLoop();
}

function restoreLiveState(identity, previousBuffer) {
  const previousRecords = new Uint8Array(previousBuffer);
  const previousBufferBytes = previousRecords.byteLength / 2;
  const previousCapacity = previousBufferBytes / LIVE_RECORD_BYTES;
  const map = new Map(identity.map(pair => [pair.previousId, pair.nextId]));
  const ptr = engine.manifold_graph_live_state_ptr();
  if (!ptr) throw new Error('Prepared live state storage is unavailable');
  while (true) {
    if (Atomics.load(workerEpochs, slot) !== generation) throw new Error('Graph worker state transfer cancelled');
    const first = Atomics.load(liveStateTags, 1);
    const second = Atomics.load(liveStateTags, 3);
    const sequence = Math.max(first > 0 ? first : 0, second > 0 ? second : 0);
    if (sequence > 0) {
      const buffer = sequence % 2;
      const tagIndex = 1 + 2 * buffer;
      const count = Atomics.load(liveStateTags, tagIndex + 1);
      if (count < 0 || count > previousCapacity) throw new Error('Invalid live state count');
      const source = buffer * previousBufferBytes;
      const oldView = new DataView(previousRecords.buffer, source, count * LIVE_RECORD_BYTES);
      const newBytes = new Uint8Array(engine.memory.buffer, ptr, liveBufferBytes);
      const newView = new DataView(engine.memory.buffer, ptr, liveBufferBytes);
      let copied = 0;
      for (let index = 0; index < count; index++) {
        const offset = index * LIVE_RECORD_BYTES;
        const nextId = map.get(Number(oldView.getBigUint64(offset, true)));
        if (nextId === undefined) continue;
        if (copied >= liveRecordCapacity) throw new Error('Invalid live state identity mapping');
        newBytes.set(previousRecords.subarray(source + offset,
          source + offset + LIVE_RECORD_BYTES), copied * LIVE_RECORD_BYTES);
        newView.setBigUint64(copied * LIVE_RECORD_BYTES, BigInt(nextId), true);
        copied++;
      }
      if (Atomics.load(liveStateTags, tagIndex) !== sequence) continue;
      return { sequence, transferred: engine.manifold_graph_live_state_import(copied) };
    }
    const observed = Atomics.load(control, 0);
    Atomics.wait(control, 0, observed, 100);
  }
}

function publishLiveState(sequence) {
  if (Atomics.load(liveStateTags, 0) !== slot + 1) return;
  const count = engine.manifold_graph_live_state_export();
  if (count > liveRecordCapacity) throw new Error('Graph live state exceeded capacity');
  const ptr = engine.manifold_graph_live_state_ptr();
  if (!ptr) throw new Error('Graph live state storage is unavailable');
  if (wasmByteView.buffer !== engine.memory.buffer) {
    throw new Error('Graph memory grew during audio rendering');
  }
  const buffer = sequence % 2;
  const tagIndex = 1 + 2 * buffer;
  Atomics.store(liveStateTags, tagIndex, -sequence);
  const destination = buffer * liveBufferBytes;
  for (let index = 0; index < count * LIVE_RECORD_BYTES; index++) {
    liveStateRecords[destination + index] = wasmByteView[ptr + index];
  }
  Atomics.store(liveStateTags, tagIndex + 1, count);
  Atomics.store(liveStateTags, tagIndex, sequence);
}

function applyCommand() {
  const base = 0;
  const request = Atomics.load(commands, base);
  if (request === Atomics.load(commands, base + 1)) return;
  const kind = Atomics.load(commands, base + 3);
  let accepted = false;
  if (kind === 1) {
    accepted = engine.manifold_set_node_parameter(
      Atomics.load(commands, base + 4), Atomics.load(commands, base + 5),
      commandFloats[base + 7]) === 1;
    if (accepted) parameterValues.set(`${Atomics.load(commands, base + 4) >>> 0}:${Atomics.load(commands, base + 5)}`,
      commandFloats[base + 7]);
  } else if (kind === 2) {
    accepted = engine.manifold_set_route_from(
      Atomics.load(commands, base + 4), Atomics.load(commands, base + 5),
      Atomics.load(commands, base + 6), Atomics.load(commands, base + 7)) === 1;
  } else if (kind === 3) {
    const count = Atomics.load(commands, base + 4);
    accepted = count > 0 && count <= (commands.length - 8) / 3;
    const previous = [];
    if (accepted) {
      for (let index = 0; index < count; index++) {
        const offset = base + 8 + index * 3;
        const key = `${commands[offset] >>> 0}:${commands[offset + 1]}`;
        if (!parameterValues.has(key) || previous.some(entry => entry.key === key)) {
          accepted = false;
          break;
        }
        previous.push({ key, nodeId: commands[offset] >>> 0, id: commands[offset + 1],
          value: parameterValues.get(key) });
      }
    }
    if (accepted) {
      let applied = 0;
      for (; applied < count; applied++) {
        const offset = base + 8 + applied * 3;
        if (engine.manifold_set_node_parameter(commands[offset], commands[offset + 1],
          commandFloats[offset + 2]) !== 1) {
          accepted = false;
          break;
        }
      }
      if (accepted) {
        for (let index = 0; index < count; index++) {
          parameterValues.set(previous[index].key, commandFloats[base + 8 + index * 3 + 2]);
        }
      } else {
        for (let index = applied - 1; index >= 0; index--) {
          const old = previous[index];
          if (engine.manifold_set_node_parameter(old.nodeId, old.id, old.value) !== 1) {
            throw new Error('Graph parameter rollback failed');
          }
        }
      }
    }
  }
  Atomics.store(commands, base + 2, accepted ? 1 : 2);
  Atomics.store(commands, base + 1, request);
}

function applyEvents() {
  const base = slot * EVENT_WORDS_PER_WORKER;
  let head = Atomics.load(events, base);
  const tail = Atomics.load(events, base + 1);
  while (head !== tail) {
    const eventBase = base + 2 + ((head >>> 0) % EVENT_CAPACITY) * EVENT_WORDS;
    if (engine.manifold_event_push(events[eventBase], events[eventBase + 1],
      events[eventBase + 2], events[eventBase + 3],
      events[eventBase + 4], events[eventBase + 5]) !== 1) {
      throw new Error('Graph rejected a queued event');
    }
    head++;
    Atomics.store(events, base, head);
  }
}

function renderLoop() {
  try {
    while (running && Atomics.load(workerEpochs, slot) === generation) {
      const serviceStarted = profiling ? performance.now() : 0;
      applyCommand();
      const latest = Atomics.load(control, 0);
      if (latest === seen) {
        // Finite wait also covers a stop notification racing the wait call.
        Atomics.wait(control, 0, seen, 25);
        continue;
      }
      let next = seen + 1;
      if (latest - next >= RING_BLOCKS) next = latest - RING_BLOCKS + 1;
      const ringIndex = next % RING_BLOCKS;
      const frames = Atomics.load(counts, ringIndex);
      if (frames < 1 || frames > MAX_FRAMES) throw new Error('Invalid audio block size');
      const base = ringIndex * MAX_FRAMES * 4;
      for (let channel = 0; channel < 4; channel++) {
        const offset = channel * MAX_FRAMES;
        for (let frame = 0; frame < frames; frame++) {
          inputView[offset + frame] = input[base + offset + frame];
        }
      }
      applyEvents();
      const started = performance.now();
      if (engine.manifold_process(frames) !== 1) throw new Error('Graph processing failed');
      const micros = Math.round((performance.now() - started) * 1000);
      const timingBase = slot * (2 + WORKER_TIMING_SAMPLES);
      const timingCount = Atomics.load(workerTiming, timingBase);
      const timingIndex = timingCount % WORKER_TIMING_SAMPLES;
      Atomics.store(workerTiming, timingBase + 2 + timingIndex, micros);
      if (micros > Atomics.load(workerTiming, timingBase + 1)) {
        Atomics.store(workerTiming, timingBase + 1, micros);
      }
      Atomics.store(workerTiming, timingBase, timingCount + 1);
      const outBase = (slot * RING_BLOCKS + ringIndex) * MAX_FRAMES * 2;
      for (let channel = 0; channel < 2; channel++) {
        const offset = channel * MAX_FRAMES;
        for (let frame = 0; frame < frames; frame++) {
          output[outBase + offset + frame] = outputView[offset + frame];
        }
      }
      publishLiveState(next);
      Atomics.store(control, 5 + slot * RING_BLOCKS + ringIndex, next);
      Atomics.store(control, 1 + slot, next);
      seen = next;
      if (profiling) {
        const serviceUs = Math.round((performance.now() - serviceStarted) * 1000);
        const serviceBase = slot * (2 + WORKER_TIMING_SAMPLES);
        const serviceCount = Atomics.load(workerServiceTiming, serviceBase);
        Atomics.store(workerServiceTiming, serviceBase + 2 + serviceCount % WORKER_TIMING_SAMPLES, serviceUs);
        if (serviceUs > Atomics.load(workerServiceTiming, serviceBase + 1)) Atomics.store(workerServiceTiming, serviceBase + 1, serviceUs);
        Atomics.store(workerServiceTiming, serviceBase, serviceCount + 1);
      }
    }
  } catch (error) {
    running = false;
    postMessage({ type: 'fatal', message: String(error) });
  } finally {
    finishWorker();
  }
}

function finishWorker() {
  running = false;
  // No shared audio/state/timing writes may follow this acknowledgement.
  if (workerEpochs && slot >= 0) Atomics.store(workerEpochs, 2 + slot, generation);
  self.close();
}

self.onmessage = ({ data }) => {
  if (data.type === 'init') {
    prepare(data).catch(error => {
      postMessage({ type: 'error', message: String(error) });
      finishWorker();
    });
  }
};
