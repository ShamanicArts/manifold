# Architecture decisions — phase 1

Date: 2026-09-26. These decisions are provisional and deliberately visible for revision.

## Product boundary

Manifold is an environment for authored audio projects, not a single filter. Project descriptors carry stable parameter IDs and graph intent. Host adapters provide I/O and scheduling. The Rust core owns signal processing and eventual graph compilation. JavaScript owns browser interaction and presentation. The old Manifold application remains an executable behavior oracle during migration.

## Runtime shape

```text
Browser: WebAudio input -> AudioWorklet -> Rust/Wasm DSP -> WebAudio output
                                    ^
                   parameter messages / timed note events

Main thread: DOM controls -> control adapter
             AnalyserNode -> Three.js WebGPU/WebGL2 visualizer

Later native host: VST3 process callback -> same Rust DSP crate built natively
                   plug-in editor -> packaged web frontend in a native webview
```

The browser audio callback only copies planar `f32` channel blocks into preallocated Wasm memory, calls `manifold_process`, and copies results out. The worklet compiles and prepares the module asynchronously, emits silence until ready, and connects the input source afterward. Initial buffers support up to 2048 frames; a host must split larger blocks. The DSP path has no Rust heap allocation or lock. We use one Wasm instance per audio node and keep host messages outside `process()`.

The first DSP implementation is the legacy TPT state-variable filter. The original Standalone Filter project creates an `SVFNode`, not `FilterNode`. We port its lowpass, bandpass, highpass, and notch formulas and smoothing. Parameter IDs 0/1/2 are mode/cutoff/resonance. The historical manifest exposes resonance 0.1–2 while `SVFNode` clamps its DSP target at 1; phase 1 preserves that DSP clamp and records this mismatch for a product decision.

## Growth path

The filter now runs inside a prepared `GraphDescription` and compiled `ExecutionPlan`. The plan owns kernels, routing, scratch buffers, and persistent DSP state. The first browser graph compiles before audio input is connected. For live topology editing, build and validate a replacement on a control thread, publish it at a block boundary, then retire the previous plan off the callback. This avoids the old builder/runtime shared-node alias that currently forces a pause during graph mutation. Stateful node migration across plans needs explicit stable node IDs and continuity hooks; it is not silently inferred from topology.

Planar f32 audio buses carry samples. Timed note events now have offsets within a block, and the Rust graph processes spans between them. Parameters have stable host IDs, physical-unit mappings, and smoothing policies; a versioned state format remains to be designed. Browser keyboard messages enter at offset zero of the next callback. External MIDI timestamp mapping and sample-accurate host automation are later contracts before native VST3 release. See the [event contract](event-contract.md).

The old input / monitor / output domains stay explicit. Input may be captured or analysed without becoming audible. A monitor bridge is the intentional route from input to output. No default passthrough should emerge from a disconnected node.

## Rendering and cost

The UI renderer has no authority over audio timing. The primitive workbench uses Canvas 2D for scopes and spectra and reads an `AnalyserNode` at animation-frame cadence; losing frames must not alter DSP. Three.js `WebGPURenderer` remains available for spatial and media views where it earns its cost. We will measure GPU and CPU time before adding shader/video surfaces. Audio and UI data exchange should be bounded summaries (meter/spectrum/control state), not per-sample messages or full graph state every frame. Offline comparison fixtures are intentionally separate from the live audio callback. DSP uses contiguous preallocated planar buffers; graph scratch storage will be sized once at prepare/compile time and reused.

## Native plug-in stance

The same Rust DSP crate builds to native code and Wasm. A VST3 adapter will implement the format's processor/controller, parameter, state, bus, and event contracts directly through the VST3 SDK or a narrow binding. JUCE is not a dependency. We do not require a Wasm interpreter inside a DAW callback. This still provides a Wasm build for browser and other compatible hosts. A packaged web editor will be connected to the native controller; it cannot share the real-time thread.

## Decisions to revisit

1. Which old project/preset versions must import without manual rebuilding?
2. Whether project authoring is declarative graph JSON plus JavaScript control logic, compiled Rust nodes, or also user-supplied Wasm node modules.
3. Native editor shell choice and target platforms for the first VST3 release.
4. Whether resonance should retain the old 0.1–2 public range when DSP saturates at 1.
