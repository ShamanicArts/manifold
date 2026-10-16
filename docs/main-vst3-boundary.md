# Main VST3 boundary

This host adapter uses the existing `manifold.main-looper` product. The audio and state owner remains `manifold-native::MainAudioRuntime`; Main VST3 does not load the generic Graph class or implement a second instrument engine.

## Current checkpoint

The packaged VST3 factory exposes a distinct Main processor and controller. The controller advertises the 204 authored Main parameter IDs with physical to normalized conversion, including the sparse LFO route enum. The processor passes stereo input/output, offset MIDI and parameter events, portable version-15 loop and Sample PCM loading, and coherent state save while another thread processes audio. The shared native runtime is checked sample by sample against the VST3 adapter in unit tests. Dense host automation caused the first official SDK validator run to fail two tests because its 4,096 event workspace was too small; a 65,536-event workspace prepared on activation resolved this. The rebuilt bundle passes **1,611 validator tests, zero failures**. `cargo test --workspace`, `./scripts/build-wasm.sh`, and the VST3 release bundle build pass.

The original Main HTML is included in the VST3 bundle, but `IPlugView` still needs the Main-specific command bridge before the original editor can be opened. The isolated REAPER probe in `scripts/probe-reaper-main-vst3.py` now discovers Main, reports 207 host controls (204 authored plus 3 REAPER controls), saves and reopens Source Output at normalized 0.1, and renders a MIDI note from the reopened project. It compares that render against the same host's saved default: the edited note peak is 0.2179 of default, with silence before MIDI starts. This caught two host-only lifecycle gaps: REAPER requests state after `setProcessing(true)` before the first audio block, and a controller edit must reach both the controller save and the processor's audio path. The prepared-state fast path and VST3 connection message now cover them. This is a REAPER parameter/audio/state proof; loop recording, Sample capture, original editor interaction, and portable PCM recall in a DAW remain separate gates.

## Decisions for the first class

1. Register a distinct Main processor/controller pair with stable class IDs. The controller enumerates only IDs accepted by `MainParameter::spec`; the IDs match the Main CLAP and browser project contract. It presents VST3 normalized values, while the native runtime receives authored physical values. `crates/manifold-vst3/src/main_values.rs` implements this conversion, including the sparse LFO route enum. Every declared ID is checked at normalized endpoints.
2. Prepare `MainAudioRuntime` and `MainHostBuffers` in setup, then translate stereo host input/output, VST3 note events, and parameter point offsets into one sorted `MainHostAudioBlock`. The audio callback uses prepared scratch and fixed-capacity event storage. Invalid input leaves host output untouched. Transport/looper commands need a separate explicit adapter; they are not persistent automatable parameters.
3. Load browser version-15 Main JSON through the native session loader and publish it after a valid audio block. Save with the existing coherent Main snapshot and bounded PCM handoff. The controller receives the same state envelope so its parameter values and original editor presentation follow the processor. Avoid waiting for an audio block from a host UI callback without a defined stopped-processing path.
4. Package the original `main-looper.html?editor=1` surface in the VST3 `IPlugView`. Reuse the Main widget action map and packaged child editor, with VST3 controller/processor messages replacing CLAP IPC. Sample Retro/Free, session Open/Download, notes, and all fixed controls must reach the same native runtime before this editor is called complete.

## Review gates

- A fresh VST3 factory reports the distinct Main pair, stereo input/output, note input, stable parameter count and IDs, and matching processor/controller class IDs.
- A host probe tests timed MIDI and automation, First Loop record/stop, in-place audio buffers, state save/reopen with identical loop and Sample PCM, and invalid state rejection while processing.
- The official VST3 validator and a real DAW run check host lifecycle and editor embedding. The DAW run opens the original Source and session controls, captures a Sample, saves and reopens it, and measures callback cost under repeated FX type changes.

The original web editor is a separate completion gate for this registered class. The class category and support for hosts that restrict audio input on an instrument require direct DAW checks before declaring portable host behavior.
