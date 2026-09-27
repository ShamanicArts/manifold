# Native VST3 boundary

Status: native Rust processor adapter exists; a loadable VST3 module does not yet exist. The same `manifold-core::ExecutionPlan` runs under the browser Wasm adapter and `manifold-native::NativeProcessor`. No JUCE or Lua is involved in either path.

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
| Parameter automation | `ExecutionPlan::set_parameter` currently changes between blocks | Define public stable IDs and physical/normalized mapping; apply sample-offset queues without callback allocation |
| Component state | Browser graph bundles carry routes, PCM, partial targets, and source recipes | Parse and validate the canonical bundle in native Rust, migrate supported legacy versions, publish replacement state at a block boundary |
| Controller/editor | Browser JavaScript workbench exists | Implement `IEditController` and native `IPlugView` shell with a packaged web frontend and bounded control/meter transport |
| Test host | Native unit tests and browser comparisons run | Run Steinberg validator and at least one DAW against a real `.vst3` bundle |

The [official API documentation](https://steinbergmedia.github.io/vst3_dev_portal/pages/Technical%2BDocumentation/API%2BDocumentation/Index.html) separates processor and edit controller, defines bus activation and state handling, and says hosts may supply different block lengths up to the prepared maximum. It also warns that input and output pointers can alias. The [processing FAQ](https://steinbergmedia.github.io/vst3_dev_portal/pages/FAQ/Processing.html) says hosts can call `process` without audio buffers to flush parameters and that an inactive trailing bus may be absent. Those cases need explicit behavior in the loadable adapter.

Steinberg publishes a [generated VST3 C API](https://github.com/steinbergmedia/vst3_c_api) that can provide a narrow Rust FFI boundary without JUCE. The current C API repository includes its [own license file](https://github.com/steinbergmedia/vst3_c_api/blob/master/LICENSE.txt); the [VST3 SDK licensing page](https://steinbergmedia.github.io/vst3_dev_portal/pages/VST%2B3%2BLicensing/VST3%2BLicense) says SDK version 3.8 is MIT-licensed. Pinning the exact interface/header revision and keeping its notice belong to the module build step.

## Order of work

1. Move the v2 graph project and asset schema into a native Rust state loader, using the browser validator's bounds and version as the fixture contract. Capture old state mappings separately rather than guessing Lua execution.
2. Define stable host parameters with ID, unit, range, normalization, default, and node target. Add timed automation to the native adapter and verify offsets against native/Wasm audio.
3. Implement the VST3 factory, processor, bus and event adapters using the official C API. Exercise inactive and in-place buffers, variable block sizes, flush calls, multiple instances, state round-trips, and validator checks.
4. Implement the controller and web editor bridge. Keep rendering and file/analysis work outside the process callback.
5. Build platform bundles and test in real hosts with physical devices, recording timing and underrun telemetry.
