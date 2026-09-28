# Main VST3 boundary

This is the next host adapter for the existing `manifold.main-looper` product. The audio and state owner remains `manifold-native::MainAudioRuntime`; Main VST3 must not load the generic Graph class or implement a second instrument engine.

## Decisions for the first class

1. Register a distinct Main processor/controller pair with stable class IDs. The controller enumerates only IDs accepted by `MainParameter::spec`; the IDs match the Main CLAP and browser project contract. It presents VST3 normalized values, while the native runtime receives authored physical values. `crates/manifold-vst3/src/main_values.rs` implements this conversion, including the sparse LFO route enum. Every declared ID is checked at normalized endpoints.
2. Prepare `MainAudioRuntime` and `MainHostBuffers` in setup, then translate stereo host input/output, VST3 note events, and parameter point offsets into one sorted `MainHostAudioBlock`. The audio callback uses prepared scratch and fixed-capacity event storage. Invalid input leaves host output untouched. Transport/looper commands need a separate explicit adapter; they are not persistent automatable parameters.
3. Load browser version-15 Main JSON through the native session loader and publish it after a valid audio block. Save with the existing coherent Main snapshot and bounded PCM handoff. The controller receives the same state envelope so its parameter values and original editor presentation follow the processor. Avoid waiting for an audio block from a host UI callback without a defined stopped-processing path.
4. Package the original `main-looper.html?editor=1` surface in the VST3 `IPlugView`. Reuse the Main widget action map and packaged child editor, with VST3 controller/processor messages replacing CLAP IPC. Sample Retro/Free, session Open/Download, notes, and all fixed controls must reach the same native runtime before this editor is called complete.

## Review gates

- A fresh VST3 factory reports the distinct Main pair, stereo input/output, note input, stable parameter count and IDs, and matching processor/controller class IDs.
- A host probe tests timed MIDI and automation, First Loop record/stop, in-place audio buffers, state save/reopen with identical loop and Sample PCM, and invalid state rejection while processing.
- The official VST3 validator and a real DAW run check host lifecycle and editor embedding. The DAW run opens the original Source and session controls, captures a Sample, saves and reopens it, and measures callback cost under repeated FX type changes.

The first implementation should register the class only when its processor, controller, and state path are loadable. The original web editor is a separate completion gate for that class. The class category and support for hosts that restrict audio input on an instrument require direct DAW checks before declaring portable host behavior.
