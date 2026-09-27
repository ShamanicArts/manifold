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

The controller currently returns no `IPlugView`. Hosts can show their generic
parameter editor; the original Standalone FX slider and XY widgets are already
embedded in the [CLAP editor](clap-host.md), but are not yet connected to
VST3. A VST3 web editor needs a host UI-thread `IPlugView` bridge so widget
gestures can call `IComponentHandler` safely. This is the next UI boundary.

## Reproduce the checks

```sh
cargo test -p manifold-vst3
./scripts/build-vst3.sh
# With Steinberg VST3 SDK 3.8.1 validator built locally:
/path/to/validator -e target/vst3/ManifoldFX.vst3
```

The three local adapter tests create both classes via the exported factory,
compare a 128-frame processed block sample for sample with `NativeProject`,
and round-trip authored state through the processor and controller. Steinberg's
official SDK 3.8.1 validator reported **537 tests passed, 0 failed** for the
built Linux bundle. This establishes the generic host audio, parameter, and
state path; it does not establish behavior in a production DAW or a VST3
custom editor. The CLAP editor has a separate [visual/host review](../web/public/standalone-fx-editor-bridge-review.html).

## Next host gates

1. Add `IPlugView` with the packaged original widget renderer and an editor
   message pump on the host UI thread. Exercise a physical pointer gesture
   through `beginEdit`, `performEdit`, and `endEdit` in a VST3 host.
2. Test multiple instances, state recall, external automation, editor
   reopen, and varied DAW audio configurations.
3. Export the general graph through fixed 128 macro parameters, typed MIDI
   and sidechain buses, and the authored project import path described in
   [the broader boundary map](native-vst3-boundary.md).
4. Build Windows and macOS bundles and run their host validation. Audio Unit
   remains a separate host adapter.
