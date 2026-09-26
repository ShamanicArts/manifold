# Legacy Manifold migration map

Source checkout: `/home/shamanic/dev/my-plugin` (read-only behavior oracle). Its README predates much of the current ImGui, video, shader, rack, and export work. Inventory based on source and jj history on 2026-09-26.

| Legacy area | JUCE or other dependency | v2 direction | Order |
|---|---|---|---|
| `dsp/core/graph/PrimitiveNode.h`, `GraphRuntime.*`, DSP nodes | `juce::AudioBuffer`, JUCE math, shared builder nodes; Highway SIMD | Rust buffers, owned compiled kernels, native/Wasm scalar reference first; SIMD after parity | 1–3 |
| `BehaviorCoreProcessor.*` | `juce::AudioProcessor`, bus layouts, MIDI buffer, state, host parameters | thin browser/native host adapters and versioned Rust project state | 1–4 |
| `DSPPluginScriptHost`, `PrimitiveGraph`, Lua bindings | Lua 5.4, sol2, JUCE file/types | declarative project graph plus JavaScript control-side authoring; map legacy behavior APIs explicitly | 2–5 |
| `BehaviorCoreEditor`, Canvas, ImGui hosts | `juce::Component`, OpenGL context, ImGui | DOM UI, Three.js WebGPU scene; packaged web editor in plug-in host | 1–5 |
| `ControlServer`, OSC/OSCQuery, endpoint registry | JUCE sockets, JSON, threading | separate control service/transport around stable parameter paths | 4 |
| Ableton Link, transport/quantizer | Link, JUCE scheduling/clock | explicit transport events and Rust timing; Link host service | 4 |
| MIDI manager and modules | JUCE MIDI types, hardware callbacks | typed timestamped MIDI events, host adapters | 3–4 |
| capture/looper/sampler | JUCE buffers/files and graph nodes | Rust bounded sample storage, streaming/decoding service outside callback | 3–5 |
| video/shaders/composite surfaces | JUCE graphics/OpenGL, camera APIs | GPU presentation and media workers, separate from DSP | 5 |
| ONNX/ML and gRPC | ONNX Runtime, gRPC | optional side services; never required for base DSP build | later |
| plug-in exports and presets | JUCE VST3 wrapper, state XML/JSON | direct VST3 adapter, stable parameter IDs, explicit legacy importer | 4 |

Other build dependencies include Dear ImGui, ImGuiColorTextEdit, Boost regex, OpenGL/EGL, and Google Highway. None are foundational dependencies in v2. The old project has 28 `manifold.project.json5` descriptors; classify each as behavior to port, interface to redesign, or experiment before deletion.

## Migration sequence

1. **Standalone Filter**: port the actual SVF algorithm and public parameters. Browser microphone/oscillator input, audible output, mode/cutoff/resonance controls, renderer detached from audio. This repository contains the first implementation. Next prove an offline/native versus Wasm fixture for each mode and parameter step.
2. **General graph**: input/monitor/output roles, validation, topology, scratch allocation, stateful kernel ownership, block-boundary publication. Use legacy graph contract fixtures as the oracle.
3. **MIDI/synth and looper**: timestamped events, voices, capture and retrospective commit, speed/pitch, time quantization. Port one existing project per family, not every Lua file line by line.
4. **Host/product contracts**: complete project state, native VST3, browser/desktop packaging, automation, OSCQuery, multiple instances, failure recovery.
5. **Visual/media projects**: sampler/rack editor, video, shaders, compositing, ML services. Keep media/GPU latency and lifecycle independent of the audio callback.

Before retiring a behavior, capture an observable old-project scenario (audio/MIDI output, parameter responses, state roundtrip, and UI intent) and replay it through v2. Floating-point agreement should use measured tolerances rather than bit equality across native and Wasm.
