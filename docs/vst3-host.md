# Standalone FX VST3 host proof

The first VST3 export is the authored Standalone FX project. `manifold-vst3`
is a Rust VST3 processor and controller around the same prepared
`manifold-core` graph used by browser Wasm, `manifold-native`, and CLAP. It
does not load the Wasm binary in the audio callback and has no JUCE or Lua
dependency. The Linux x86_64 bundle is built with `./scripts/build-vst3.sh`
at `target/vst3/ManifoldFX.vst3`.

## Implemented host contract

- A factory exposes distinct audio processor and edit controller classes.
  The module accepts stereo planar `f32` main input and output. Its host buffer
  adapter tolerates missing or aliased pointers and uses prepared scratch.
- Seven stable parameter IDs (0–6) expose effect type, wet mix, and five
  controls. Host normalized parameter queues become bounded, sample-offset
  automation in the Rust graph. The queue holds at most 1,024 points per
  block; an invalid queue rejects that process call.
- VST3 component state contains the authored browser project JSON, including
  the 21 effects' remembered control sets. The processor parses and prepares
  replacements outside `process`, publishes at a block boundary, and retires
  old runtimes off the audio callback. The controller reads component state
  to synchronize the seven host parameters.
- The first module has one stereo audio bus pair. MIDI and sidechain buses
  belong to the later general graph export.

On Linux the controller now returns an `IPlugView` that embeds the same
packaged original slider and XY widget module as the [CLAP editor](clap-host.md).
The companion process reads editor IPC on its own thread. A bounded queue and
the host's `Linux::IRunLoop` timer deliver begin/value/end gestures to
`IComponentHandler` on the host UI thread. The editor sends an explicit ready
message after its JavaScript receiver is registered, so the initial host state
is not lost during webview navigation. A host parameter update refreshes the
visible controls in the same window.

## Reproduce the checks

```sh
cargo test -p manifold-vst3
./scripts/build-vst3.sh
# With Steinberg VST3 SDK 3.8.1 validator built locally:
/path/to/validator -e target/vst3/ManifoldFX.vst3
# Under an isolated headless Weston/Xwayland display:
MANIFOLD_ISOLATED_DISPLAY=1 python3 scripts/probe-vst3-gui.py
```

The four local adapter tests create both classes via the exported factory,
compare a 128-frame processed block sample for sample with `NativeProject`,
round-trip authored state through the processor and controller, and drive
ordered widget gestures through a mock host run loop. Steinberg's
official SDK 3.8.1 validator reported **537 tests passed, 0 failed** for the
built Linux bundle. The isolated host probe attached the packaged VST3 editor
as a child X11 window and captured a visible Mix update from 0.72 to 0.20.
The [visual review](../web/public/standalone-fx-vst3-host-review.html) contains
both captures. A production DAW and a real pointer through the native VST3
window remain untested.

## Next host gates

1. Exercise a physical pointer gesture through `beginEdit`, `performEdit`, and
   `endEdit` in a production VST3 host.
2. Test multiple instances, state recall, external automation, editor
   reopen, and varied DAW audio configurations.
3. Export the general graph through fixed 128 macro parameters, typed MIDI
   and sidechain buses, and the authored project import path described in
   [the broader boundary map](native-vst3-boundary.md).
4. Build Windows and macOS bundles and run their host validation. Audio Unit
   remains a separate host adapter.
