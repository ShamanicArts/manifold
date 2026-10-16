// Experimental: one control Worker, one shared arena, exclusive handles.
import { PORT_CATALOG } from '../catalog.generated.js';
let wasm;
const handles = new Set();
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      wasm = (await WebAssembly.instantiate(data.module, { env: {
        memory: data.memory, manifold_allocation_probe() {},
      } })).exports;
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
      const handle = wasm.manifold_prepared_take();
      if (!handle) throw new Error('Missing prepared engine');
      handles.add(handle);
      // No compiler access to this engine follows until an explicit retire.
      postMessage({ type: 'prepared', requestId: data.requestId, handle,
        inputPtr: wasm.manifold_prepared_input_ptr(handle), outputPtr: wasm.manifold_prepared_output_ptr(handle),
        preparationMs: performance.now() - started, memoryBytes: wasm.memory.buffer.byteLength });
    } else if (data.type === 'probe-stall') {
      const started = performance.now();
      const duration = Math.max(0, Math.min(1000, data.durationMs));
      while (performance.now() - started < duration) { /* scheduling experiment */ }
      postMessage({ type: 'stalled', requestId: data.requestId, durationMs: performance.now() - started });
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
