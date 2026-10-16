// One persistent control Worker owns preparation and retired Rust handles.
import { PORT_CATALOG } from './catalog.generated.js';
import { decodeSampleAsset } from './sample-assets.js';
let wasm;
const handles = new Set();
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      wasm = (await WebAssembly.instantiate(data.module, { env: {
        memory: data.memory, manifold_allocation_probe() {},
      } })).exports;
      if (wasm.memory !== data.memory || wasm.manifold_version?.() !== 5
        || wasm.manifold_prepared_version?.() !== 4) throw new Error('Incompatible shared prepared graph module');
      const tls = wasm.manifold_prepared_allocate(wasm.__tls_size.value, wasm.__tls_align.value);
      if (!tls) throw new Error('Compiler TLS allocation failed');
      wasm.__wasm_init_tls(tls);
      const stack = wasm.manifold_prepared_allocate(1048576, 16);
      if (!stack) throw new Error('Compiler stack allocation failed');
      wasm.__stack_pointer.value = stack + 1048576;
      postMessage({ type: 'initialized' });
    } else if (data.type === 'prepare') {
      const started = performance.now(), graph = data.project.signal;
      if (!wasm || wasm.manifold_graph_begin(graph.nodes.length, graph.connections.length) !== 1
        || wasm.manifold_graph_patchable(1) !== 1) throw new Error('Graph capacity exceeded');
      for (const node of graph.nodes) {
        if (wasm.manifold_graph_node(node.id, PORT_CATALOG[node.type].code, node.a ?? 0, node.b ?? 0) !== 1) {
          throw new Error(`Rust rejected node ${node.id}`);
        }
      }
      for (const edge of graph.connections) {
        if (wasm.manifold_graph_edge_ports(edge.from, edge.outputPort ?? 0, edge.to, edge.inputPort) !== 1) {
          throw new Error('Rust rejected edge');
        }
      }
      if (graph.io) {
        const bytes = new TextEncoder().encode(JSON.stringify(graph.io));
        if (wasm.manifold_graph_io_begin?.(bytes.length) !== 1) throw new Error('I/O layout upload unavailable');
        new Uint8Array(wasm.memory.buffer, wasm.manifold_graph_io_ptr(), bytes.length).set(bytes);
        if (wasm.manifold_graph_io_commit() !== 1) throw new Error('Rust rejected I/O layout');
      }
      const later = [];
      for (const parameter of graph.initialParameters ?? []) {
        if (wasm.manifold_graph_initial_parameter(parameter.nodeId, parameter.id, parameter.value) !== 1) later.push(parameter);
      }
      if (wasm.manifold_prepare(data.sampleRate, 2048) !== 1) throw new Error('Rust rejected graph preparation');
      for (const parameter of later) {
        if (wasm.manifold_set_node_parameter(parameter.nodeId, parameter.id, parameter.value) !== 1) {
          throw new Error('Rust rejected initial parameter');
        }
      }
      if (wasm.manifold_graph_reset_processing() !== 1) throw new Error('Initial graph state reset failed');
      for (const asset of data.project.assets ?? []) {
        const { nodeId, stereo, sourceRate } = decodeSampleAsset(asset);
        if (wasm.manifold_sample_begin(nodeId, stereo.length / 2, sourceRate) !== 1) throw new Error('Sample asset preparation failed');
        new Float32Array(wasm.memory.buffer, wasm.manifold_sample_ptr(), stereo.length).set(stereo);
        if (wasm.manifold_sample_commit() !== 1) throw new Error('Loop asset loading failed');
        // Loading a stopped take clears transport. Restore all authored
        // controls afterward, in declared parameter order.
        for (const parameter of graph.initialParameters.filter(p => p.nodeId === nodeId && graph.nodes.find(node => node.id === nodeId).type === 'loop-capture')) {
          if (wasm.manifold_set_node_parameter(nodeId, parameter.id, parameter.value) !== 1) throw new Error('Loop transport restoration failed');
        }
      }
      for (const binding of data.project.sampleBindings ?? []) {
        if (wasm.manifold_sample_share(binding.sourceNodeId, binding.nodeId) !== 1) throw new Error('Sample binding failed');
      }
      for (const node of graph.nodes.filter(node => node.type === 'retrospective-capture')) {
        const frames = wasm.manifold_capture_capacity(node.id);
        if (wasm.manifold_capture_stage_reserve(node.id, frames) !== 1) throw new Error('Capture staging preparation failed');
      }
      const handle = wasm.manifold_prepared_take();
      if (!handle) throw new Error('Missing prepared engine');
      handles.add(handle);
      try {
        if (wasm.manifold_prepared_identity_begin(handle) !== 1) throw new Error('Identity preparation failed');
        for (const pair of data.identity ?? []) {
          if (wasm.manifold_prepared_identity(handle, pair.nextId, pair.previousId) !== 1) throw new Error('Identity table exceeded capacity');
        }
        for (const parameter of data.inheritance ?? []) {
          if (wasm.manifold_prepared_inherit(handle, parameter.nextId, parameter.id, parameter.previousId) !== 1) throw new Error('Parameter inheritance exceeded capacity');
        }
        for (const loop of data.loops ?? []) {
          if (wasm.manifold_prepared_loop_identity(handle, loop.nextId, loop.previousId) !== 1) throw new Error('Loop identity preparation failed');
          for (const parameter of loop.parameters) {
            if (wasm.manifold_prepared_loop_parameter(handle, loop.nextId, parameter.id, parameter.value, Number(parameter.inherit)) !== 1) throw new Error('Loop control preparation failed');
          }
        }
        for (const pair of data.resources ?? []) {
          if (wasm.manifold_prepared_resource_identity(handle, pair.nextId, pair.previousId) !== 1) throw new Error('Resource identity exceeded capacity');
        }
        const values = new Float32Array(data.parameterBank, 4);
        for (let index = 0; index < graph.initialParameters.length; index++) {
          const parameter = graph.initialParameters[index];
          const value = wasm.manifold_prepared_parameter_target(handle, parameter.nodeId, parameter.id);
          if (!Number.isFinite(value)) throw new Error(`DSP target readback unavailable: ${parameter.nodeId}/${parameter.id}`);
          values[index] = value;
        }
      } catch (error) {
        handles.delete(handle); wasm.manifold_prepared_release(handle); throw error;
      }
      // No compiler access to this engine follows until an explicit retire.
      postMessage({ type: 'prepared', requestId: data.requestId, handle,
        inputPtr: wasm.manifold_prepared_input_ptr(handle), outputPtr: wasm.manifold_prepared_output_ptr(handle),
        preparationMs: performance.now() - started, memoryBytes: wasm.memory.buffer.byteLength });
    } else if (data.type === 'retire') {
      if (!handles.delete(data.handle)) throw new Error('Invalid retired handle');
      wasm.manifold_prepared_release(data.handle);
      postMessage({ type: 'retired', requestId: data.requestId });
    } else if (data.type === 'close') {
      for (const handle of handles) wasm.manifold_prepared_release(handle);
      handles.clear(); postMessage({ type: 'closed', requestId: data.requestId }); self.close();
    }
  } catch (error) { postMessage({ type: 'error', requestId: data.requestId, message: String(error) }); }
};
