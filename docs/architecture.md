# Architecture decisions — phase 1

Date: 2026-09-26. These decisions are provisional and deliberately visible for revision.

## Product boundary

Manifold is an environment for authored audio projects, not a single filter. Project descriptors carry stable parameter IDs and graph intent. Host adapters provide I/O and scheduling. The Rust core owns signal processing and eventual graph compilation. JavaScript owns browser interaction and presentation. The old Manifold application remains an executable behavior oracle during migration.

## Runtime shape

```text
Browser: main + sidechain WebAudio inputs -> AudioWorklet -> Rust/Wasm DSP -> WebAudio output
                                    ^
                   parameter messages / timed note events

Main thread: DOM controls -> control adapter
             AnalyserNode -> Three.js WebGPU/WebGL2 visualizer

Native boundary: host stereo buses -> manifold-native -> same Rust DSP crate
VST3 module: process callback -> native boundary
                   plug-in editor -> packaged web frontend in a native webview
```

The browser audio callback only copies planar `f32` channel blocks into preallocated Wasm memory, calls `manifold_process`, and copies results out. At startup, the worklet compiles the Wasm module asynchronously and prepares the Rust graph before connecting the input source; it emits silence until ready. Initial buffers support up to 2048 frames; a host must split larger blocks. The DSP path has no Rust heap allocation or lock. LoopCapture likewise allocates its bounded stereo ring at graph preparation; record/play/overdub state changes perform no heap work in the callback. StereoDelay owns two bounded five-second ring buffers (about 1.9 MB for stereo samples plus 0.96 MB of generation tags at 48 kHz), allocated during graph preparation; processing reads and writes them without allocation. We use one Wasm instance per audio node and keep host messages outside `process()`.

The first DSP implementation is the legacy TPT state-variable filter. The original Standalone Filter project creates an `SVFNode`, not `FilterNode`. We port its lowpass, bandpass, highpass, and notch formulas and smoothing. Parameter IDs 0/1/2 are mode/cutoff/resonance. The historical manifest exposes resonance 0.1–2 while `SVFNode` clamps its DSP target at 1; phase 1 preserves that DSP clamp and records this mismatch for a product decision.

## Growth path

The filter now runs inside a prepared `GraphDescription` and compiled `ExecutionPlan`. The plan owns kernels, routing, scratch buffers, and persistent DSP state. The first browser graph compiles before audio input is connected. The CV rack and Ring Modulator support a narrower live edit: all fixed nodes are prepared once, and typed Control or Audio source indices change between blocks without allocation or plan replacement. Disconnected nodes are parked with their state frozen. For live node addition, removal, or reorder, build and validate a replacement on a control thread, publish it at a block boundary, then retire the previous plan off the callback. This avoids the old builder/runtime shared-node alias that currently forces a pause during graph mutation. Stateful node migration across plans needs explicit stable node IDs and continuity hooks; it is not silently inferred from topology. The [Web Audio specification](https://www.w3.org/TR/webaudio/) places AudioWorklet code on the rendering thread, so a full compile in its message handler would not be an acceptable live replacement path.

Planar f32 audio buses carry samples. The legacy rise/fall slew kernel now has both stereo audio and typed CV graph forms; its CV form smooths an LFO before gain modulation at sample rate. The Main rack scalar CV slice adds typed sample/hold, attenuverter/bias, and a four-input mixer, all evaluated in the audio graph. Their bounded stage meters are read by the browser at 10 Hz without feeding the signal path. The graph now also has typed bipolar control ports; a Rust LFO drives ModulatedGain at sample rate, with incompatible audio/control connections rejected at compilation. Timed note events now have offsets within a block, and the Rust graph processes spans between them. Parameters have stable host IDs, physical-unit mappings, and smoothing policies; a versioned state format remains to be designed. Browser keyboard messages enter at offset zero of the next callback. After explicit user permission, hardware MIDI messages carry their browser timestamps into a bounded AudioWorklet frame queue. Late messages clamp to the next available block. The browser tracks per-device sustain pedal state and note ownership across devices and its keyboard; other controllers, device jitter, output latency, and sample-accurate host automation still need work before native VST3 release. See the [event contract](event-contract.md).

The old input / monitor / output domains stay explicit. Input may be captured or analysed without becoming audible. A monitor bridge is the intentional route from input to output. No default passthrough should emerge from a disconnected node.

## Rendering and cost

The UI renderer has no authority over audio timing. The primitive workbench uses Canvas 2D for scopes and spectra and reads an `AnalyserNode` at animation-frame cadence; losing frames must not alter DSP. Three.js `WebGPURenderer` remains available for spatial and media views where it earns its cost. We will measure GPU and CPU time before adding shader/video surfaces. Audio and UI data exchange should be bounded summaries (meter/spectrum/control state), not per-sample messages or full graph state every frame. Offline comparison fixtures are intentionally separate from the live audio callback. DSP uses contiguous preallocated planar buffers; graph scratch storage will be sized once at prepare/compile time and reused.

The first Rust analyzer preserves the legacy eight-band one-pole estimator and stereo passthrough. A separate FFT node now uses a prepared 2048-point Hann window and 1024-sample hop, publishes 32 logarithmic bands and peak Hz, and keeps all scratch inside its kernel. The Envelope Follower uses the same meter path for one normalized peak/RMS/hybrid level. After each block, the compiled plan retains the meter values. The browser requests a bounded snapshot from the worklet at about 10 Hz; the request handler reads one, eight, or thirty-three floats and posts one message, outside `process()`. Offline fixtures compare both the C++ audio output and every block's meter snapshot. For audio-rate use, `EnvelopeControl` runs the same detector in the graph and sends a typed value directly to a gain or future CV consumer. Main-thread meter polling is independent of that route.

The first cross-project sample transfer exports a stopped Loop Capture take through a message handler. Rust copies oldest-to-newest ring frames into the worklet's prepared output scratch in bounded chunks. The handler assembles a transferable `Float32Array` outside `process()`; the browser host keeps that PCM while it closes the capture graph and prepares the Sample instrument graph. The source rate travels with the PCM. This is a host transaction between projects, not a per-sample graph edge, and the capture is rejected while recording continues.

The editable graph also exposes an explicit recording-window publication. A request fixes the current Loop Capture ring start and length. Before each following block writes new samples, Rust copies a bounded slice into a staging buffer; at 128 frames per block, a two-second window takes 47 blocks to freeze. Copying advances faster than the ring write cursor, so even a full, wrapped ring retains the requested window until that slice has been copied. Restarting recording, resetting the graph, or enabling overdub cancels an unfinished snapshot. The browser polls readiness, transfers frozen PCM in chunks of at most 16,384 frames, and only then asks Rust to move the staged buffer into the SampleInstrument. Existing notes retain their previous PCM; subsequent notes use the new source. The browser assembles the project asset on its main thread. The stopped-take API retains its recording gate.

The separate RetrospectiveCapture graph kind reuses that ring and staging mechanism but records as soon as its prepared graph runs. It is an explicit processing root: compilation retains the capture node and its input ancestors even when neither reaches the audible Output. This replaces the original project's zero-gain sink arrangement, which leaked a startup transient through v2's smoothed Gain node. The Rust ring supports 1–120 seconds; the authored browser study uses the original 30-second default. A request chooses a trailing window, with leading zeros before enough history exists, matching the original node's cleared buffer. The browser limits publication to 30 seconds because SampleRegion currently caps decoded PCM there. The requested window, ring capacity, and published instrument source are separate states. The [two-source sampler study](../projects/graph-workspace/retrospective-multisource.json) adds a prepared fixed gain of four before each independent 30-second capture root, matching the old Standalone Sample source chain. Stable graph capture node IDs 6 and 10 replace the old source IDs 0 and 1 in this authored graph. The selected ID and requested timing mode live in portable project metadata; the browser uses them when requesting a snapshot, and the native loader validates them. Browser bars use a manual tempo, then Rust/Wasm calculates the exact frame count before staging; a DAW adapter can supply its actual samples-per-bar value through the same core timing helper. Source choice does not affect the DSP callback until a user requests publication. The source rings remain distinct while notes use the most recently published sample.

The native processor now exposes begin/status/copy/cancel for a frozen capture under exclusive host ownership. A synchronized control transaction copies the staged PCM, prepares a complete portable replacement with the selected capture ID, and can publish it at a host block boundary. A native test covers the sidechain ring, ×4 gain, 9,600-frame window, embedded PCM, MIDI playback, and save/reopen. This is the data path for a future DAW capture gesture. Host adapters still need a safe command and result handoff while their audio callbacks are running; replacing the complete graph currently resets its live capture rings. The [native capture review](../web/public/native-sampler-capture-review.html) records that boundary.

`scripts/probe-live-capture-publication.mjs` runs the actual Wasm handler in a synthetic Node worklet with a full 96,000-frame stereo window at 48 kHz. In one 30-publication run, staged render calls measured 0.0115 ms median and 0.0138 ms p95, versus 0.0055 and 0.0080 ms for baseline render calls. The begin handler measured 0.38 ms p95, chunk handlers 0.12 ms p95, and final source moves 0.09 ms p95, against a 2.67 ms 128-frame quantum. This replaces the earlier single-handler copy whose p95 was 1.83 ms in the same kind of synthetic probe. These measurements exclude browser transfer and physical-device scheduling; they do not establish an underrun rate. Publication stays user-triggered pending browser/device measurement and the broader retrospective capture contract.

Source analysis uses a separate Web Worker with its own Rust/Wasm instance. The browser transfers a copy of decoded PCM to that worker; Rust computes 256 stereo peak bins, peak, RMS, and a bounded YIN-style pitch estimate. The result is 512 peak floats plus four scalars. The main thread draws the waveform and may offer the detected MIDI root as an explicit control action; analysis never changes pitch mapping on its own. The worker and its allocations are isolated from the live audio worklet. If workers are unavailable, the page computes waveform peaks locally and leaves the analysis readout unavailable.

The sampler prepares eight note slots with four `SampleRegion` cursors each. Cursors share immutable PCM buffers; when a stopped take is published in a running graph, held notes keep the prior buffer and later notes adopt the new one. The callback visits only active subvoices. This caps worst-case work and leaves note allocation free of heap operations. Pan and normalization gains are calculated when parameters change, so the sample loop only multiplies by prepared values. The first v2 unison slice supports one to four subvoices; changing the count affects new notes, while detune and pan spread update sounding notes. The legacy playback node permits eight subvoices and smooths their gain and spread, so increasing this ceiling and matching its transitions remain separate steps.

## Native plug-in stance

The same Rust DSP crate builds to native code and Wasm. `manifold-native` wraps the graph with explicit main/sidechain buses, bounded variable blocks, timed MIDI events, and silent missing buses. Its bounded loader restores authored browser graph workspace bundles, including parameters, embedded PCM, Main targets, and temporal recipes. The VST3 bundle uses the MIT/Apache `vst3` Rust bindings and now contains separate Linux Standalone FX and general Graph processor/controller pairs. Standalone FX exposes seven stable controls and embeds the original web widgets in its `IPlugView`. Graph exposes 128 fixed host slots, MIDI, optional sidechain, portable project state, and a standard `.vstpreset` export path. Both render through prepared native Rust DSP; JUCE and a Wasm interpreter are absent from the DAW callback. The browser still runs the Wasm build of the same core. Graph CLAP and VST3 share a fixed-size, versioned host-value bank so state saves observe one complete audio block without locking the callback. CLAP alternates two banks because it accepts one pending import; VST3 gives every imported runtime its own bank because repeated pending imports are allowed. The Linux VST3 editor IPC receiver queues gestures for a host UI run loop timer, outside the real-time thread. The [native boundary plan](native-vst3-boundary.md) lists the remaining host contracts and validation gates.

The Graph editor also accepts browser project JSON. Bounded browser-to-companion
chunks are reassembled off the callback, then a host-created VST3 `IMessage`
carries the project over `IConnectionPoint` to the Rust processor. The processor
prepares replacement state off the callback and publishes it at a block
boundary; the controller updates visible bindings only after acceptance.

The first loadable native format is now CLAP on Linux. `manifold-clap` uses the
raw CLAP C ABI bindings and loads the authored Standalone FX project through
`manifold-native`, with seven stable controls, stereo f32 processing, and host
state callbacks. The browser and CLAP host can exchange the authored project
JSON with all 21 effects' remembered control sets; the native reader validates
and prepares it before publication to the audio callback. Its audio callback
runs prepared native Rust DSP; the browser
still runs the Wasm build of the same core. The Linux CLAP bundle now packages
the same Standalone FX widgets in an X11 child webview owned by a separate
editor process. CLAP GUI callbacks manage its lifecycle; IPC carries state
snapshots and bounded gestures outside the audio callback. See the
[CLAP host proof](clap-host.md) for tests and remaining work.
The second CLAP class, Graph, accepts portable authored project state, 128
stable host slots, CLAP note events, timed automation, and optional sidechain
audio. Its process callback also uses prepared native DSP. The Linux Graph
CLAP editor now embeds the same compact browser widgets as Graph VST3; project
imports and slot reassignment prepare complete replacement graphs off the
callback. Presentation snapshots cache the node and control description so
ordinary host automation repaints do not reparse embedded audio assets.
The native automation boundary reserves up to 4,096 ordered points per block,
while its MIDI split limit remains 1,024 events. The CLAP adapter converts a
wildcard note release to an all-notes-off core event until filtered releases
and CLAP note IDs have a native event representation.
The [native editor boundary](native-editor-plan.md) records the exact widget
reuse, CLAP GUI lifecycle, and proposed browser process bridge.

## Decisions to revisit

1. Which old project/preset versions must import without manual rebuilding?
2. Whether project authoring is declarative graph JSON plus JavaScript control logic, compiled Rust nodes, or also user-supplied Wasm node modules.
3. Native editor shell choice and target platforms for the first VST3 release.
4. Whether resonance should retain the old 0.1–2 public range when DSP saturates at 1.
