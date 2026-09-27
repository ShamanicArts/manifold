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
# For the real pointer gate, use a disposable Xvfb display with XTEST:
DISPLAY=:88 MANIFOLD_ISOLATED_DISPLAY=1 python3 scripts/probe-vst3-gui.py \
  target/vst3/ManifoldFX.vst3/Contents/x86_64-linux/ManifoldFX.so --gesture
# With REAPER installed, on the same disposable Xvfb/XTEST display:
DISPLAY=:88 MANIFOLD_ISOLATED_DISPLAY=1 python3 scripts/probe-reaper-vst3.py
```

The five local adapter tests create both classes via the exported factory,
compare a 128-frame processed block sample for sample with `NativeProject`,
round-trip authored state through the processor and controller, and drive
ordered widget gestures through a mock host run loop. A regression test covers
REAPER's widened `f32` normalized effect selector: the controller quantizes
it and the editor snapshot sends the browser an integer effect ID. Steinberg's
official SDK 3.8.1 validator reported **537 tests passed, 0 failed** for the
built Linux bundle. The isolated host probe attached the packaged VST3 editor
as a child X11 window and captured a visible Mix update from 0.72 to 0.20.
The [visual review](../web/public/standalone-fx-vst3-host-review.html) contains
those captures. With an isolated Xvfb server and XTEST, a physical pointer
drag on the Room slider produced `beginEdit(2)`, normalized values 0.26 and
0.72, then `endEdit(2)` in the host. The controller and visible widget both
settled at 0.72. The same display also delivered a full CLAP gesture.

The [REAPER proof](../web/public/standalone-fx-reaper-proof.html) uses a
private REAPER configuration and project on the disposable Xvfb display.
It inserts the packaged VST3, changes Mix from 0.72 to 0.20 via the host with
the editor open, and uses a real pointer drag to change Room from 0.50 to
approximately 0.69. REAPER reads that parameter back. After saving the
project and launching a fresh REAPER process, the selected Reverb effect,
Mix 0.20, and Room 0.69 reappear in both host parameter queries and the
visible editor. The same probe creates a five-point REAPER Mix automation
envelope, plays the transport, and observes the host parameter and the open
widget reach 0.80 and return to 0.20. Then it arms a Room envelope, switches
the track to Write mode, and drags the original Room slider during transport.
REAPER records seven points spanning 0.24–0.69. The probe switches to Read,
replays the recorded interval, and observes the plug-in parameter traverse
the same range. Captures of all seven stages are included in the review.

## Next host gates

1. Test multiple instances, editor close/reopen, and varied DAW audio
   configurations.
2. Export the general graph through fixed 128 macro parameters, typed MIDI
   and sidechain buses, and the authored project import path described in
   [the broader boundary map](native-vst3-boundary.md).
3. Build Windows and macOS bundles and run their host validation. Audio Unit
   remains a separate host adapter.
