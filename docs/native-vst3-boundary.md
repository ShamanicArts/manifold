# Native VST3 boundary

Status: native Rust processor and bounded browser-project loader exist; a loadable VST3 module does not yet exist. The same `manifold-core::ExecutionPlan` runs under the browser Wasm adapter and `manifold-native::NativeProcessor`. No JUCE or Lua is involved in either path.

`manifold_native::project::NativeProject::parse` accepts the browser's `manifold.project` schema v1 for all eight authored graph workspace bundles. The `project.json` in that directory is an older standalone format, not a graph workspace bundle. The loader validates graph shape, node arguments, routes, parameter IDs and ranges, asset limits, source rate, frame count, base64 byte count, finite PCM, and Main partial targets. `prepare` compiles and installs parameters, PCM, and partial targets away from the audio callback. The supported node kinds are `input.raw`, `input.sidechain`, `output`, `midi-input`, `midi-transpose`, `voice-synth`, `gain`, `sum2`, `svf`, `loop-capture`, `sample-instrument`, `sample-region`, `granulator`, `oscillator`, `noise`, `lfo`, `modulated-gain`, and `main-voice-bank`. Tests render audible native output from the note, region, granular, texture, and Main bank routes. An embedded Main sample also restores and sounds. Nonempty temporal source recipes remain unsupported and fail explicitly; browser source recipes are metadata, since the native host supplies its own main and sidechain buses.

Each restored control has an internal graph-scoped 32-bit ID, `(nodeId << 8) | localParameterId`, plus physical minimum, maximum, initial value, and discrete or continuous mapping. `NativeProcessor::process_automated` accepts ordered normalized points at frame offsets, validates the complete queue before touching output, then renders audio and MIDI in bounded segments. It reuses event scratch reserved in `prepare` and accepts up to 1024 MIDI events when automation splits a block. A zero-frame call can flush parameter changes.

The public VST3-facing plan is **128 fixed macro slots**, IDs `0x01000000` through `0x0100007f`, with generic names and normalized 0–1 values that do not change as graph nodes change. The optional `hostBindings` array in browser project schema v1 maps slots to node-local controls; both browser and native loaders fill unassigned slots deterministically in ascending node/control order. Existing mappings keep their slot across a browser topology edit, then new controls take free slots. Native `process_host_automated` translates the fixed slot to the prepared graph control at the requested frame. The slot list and IDs can stay fixed for the controller; the binding and its physical range live in project state. A future editor should show this mapping and allow deliberate reassignment. The [official VST3 parameter documentation](https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical%2BDocumentation/Parameters%2BAutomation/Index.html) requires a unique 32-bit ID per exported parameter and says plug-ins cannot reconfigure the automatable parameter set during normal use. This fixed-slot choice follows that constraint. A host controller and DAW round-trip still need implementation and validation.

## Contract already exercised

`NativeProcessor::prepare` compiles the graph and allocates scratch before processing. `process` accepts variable-length planar `f32` blocks up to the prepared maximum, optional main and sidechain stereo buses, stereo output, and timed MIDI events. Missing buses read as silence. Buffer shape and event offsets are checked before output is changed. The native adapter tests main/sidechain separation, missing buses, block sizes 16/31/128, and a note at frame 40. Existing graph comparisons exercise the same core natively and in Wasm.

## VST3 adapter map

| VST3 contract | Manifold boundary | Remaining work |
|---|---|---|
| Module factory | `GetPluginFactory` exposes processor and controller classes | Implement through a pinned official C API binding; build and validate a loadable module |
| Audio buses | Main input, optional sidechain auxiliary input, stereo output | Declare bus layouts and activation; translate null, inactive, mono, and in-place host buffers |
| Processing lifecycle | `NativeProcessor::prepare` owns the graph and scratch | Map `setupProcessing`, `setActive`, and `setProcessing`; rebuild only outside callback |
| `ProcessData` audio | `NativeProcessor::process` handles planar `f32`, missing buses, variable blocks | Wrap raw host pointers safely and support hosts that use identical input/output buffers |
| MIDI events | `TimedEvent` reaches the graph at a frame offset | Convert VST3 event list and MIDI controller mapping to stable project routes |
| Parameter automation | Native sampler projects have 128 fixed host slots, saved graph bindings, physical/normalized mapping, and frame-offset queues | Implement the controller's fixed slot list, test physical host queues, and persist edited parameter state |
| Component state | Native Rust loads all eight authored browser graph bundles, including Main partial targets, parameters, bindings, and embedded PCM | Restore temporal source recipes; serialize changed state and publish replacements at a block boundary |
| Controller/editor | Browser JavaScript workbench exists | Implement `IEditController` and native `IPlugView` shell with a packaged web frontend and bounded control/meter transport |
| Test host | Native unit tests and browser comparisons run | Run Steinberg validator and at least one DAW against a real `.vst3` bundle |

The [official API documentation](https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical%2BDocumentation/API%2BDocumentation/Index.html) separates processor and edit controller, defines bus activation and state handling, and says hosts may supply different block lengths up to the prepared maximum. It also warns that input and output pointers can alias. The [processing FAQ](https://steinbergmedia.github.io/vst3_dev_portal/pages/FAQ/Processing.html) says hosts can call `process` without audio buffers to flush parameters and that an inactive trailing bus may be absent. Those cases need explicit behavior in the loadable adapter.

Steinberg publishes a [generated VST3 C API](https://github.com/steinbergmedia/vst3_c_api) that can provide a narrow Rust FFI boundary without JUCE. The current C API repository includes its [own license file](https://github.com/steinbergmedia/vst3_c_api/blob/master/LICENSE.txt); the [VST3 SDK licensing page](https://steinbergmedia.github.io/vst3_dev_portal/pages/VST%2B3%2BLicensing/VST3%2BLicense) says SDK version 3.8 is MIT-licensed. Pinning the exact interface/header revision and keeping its notice belong to the module build step.

## Order of work

1. Restore the Main voice bank's optional temporal source recipe in native Rust, using a browser export as a fixture contract. Capture old state mappings separately rather than guessing Lua execution.
2. Implement the fixed VST3 macro-slot controller and editor bindings; persist edits, expose units in the editor, and compare native timed automation with Wasm and host queues.
3. Implement the VST3 factory, processor, bus and event adapters using the official C API. Exercise inactive and in-place buffers, variable block sizes, flush calls, multiple instances, state round-trips, and validator checks.
4. Implement the controller and web editor bridge. Keep rendering and file/analysis work outside the process callback.
5. Build platform bundles and test in real hosts with physical devices, recording timing and underrun telemetry.
