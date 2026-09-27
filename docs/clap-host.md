# Standalone FX CLAP host proof

The Linux CLAP module is the first loadable native host for the authored
Standalone FX project. It uses the same `projects/standalone-fx-module/project.json`
as the browser page. `manifold-native` validates that project and prepares the
same `manifold-core` persistent FX graph. The CLAP callback copies planar host
audio through preallocated buffers, translates seven public parameters to the
fixed host slots, and processes timed automation in native Rust. It does not
execute Lua or depend on JUCE.

Build a loadable file with `./scripts/build-clap.sh`. It prints the path under
`target/clap/ManifoldFX.clap`. This is an audio and host state proof; the
module currently uses the host's generic parameter UI. The browser widget
surface has not been embedded in a native editor.

The browser's **Save host project** action exports the authored project JSON
with all seven current public values and `typeParameters` for all 21 effects.
The CLAP state stream writes the same JSON envelope. Both the browser's
**Open state** action and `NativeProject::parse_fx_module` accept it. Browser
state files remain available through the existing **Save state** action.

## Evidence

- `cargo test -p manifold-native standalone_fx_module_loads_the_authored_project_and_roundtrips_host_state`
  opens the authored project, processes in-place host buffers, applies type and
  mix automation at exact frame offsets, saves project state, and reopens it.
- `cargo test -p manifold-clap` creates the CLAP plug-in through its factory,
  activates it, sends a host parameter event, and compares its stereo output
  sample for sample with the native project adapter. It also switches between
  Chorus and Reverb, checks that the generic host controls follow each effect's
  remembered values, saves through the CLAP stream callbacks, and reopens the
  saved state with both effects' controls intact. A second test changes types
  and controls while inactive, then activates and verifies the saved values.
- `node web/tests/fx-module.browser.mjs` exports a host project from the
  actual browser controls, reads its state, and reopens it in the browser.
- `cargo test -p manifold-native fx_host_reset_clears_reverb_tail_and_keeps_controls`
  excites a Reverb tail, calls the host reset path, and verifies silent input
  stays silent while type and mix retain their host values.
- `cargo test -p manifold-clap gui_messages_flush_as_host_gesture_and_parameter_events`
  drives the pending native editor message queue through the CLAP params flush
  callback, checks begin/value/end output events and public values, and checks
  that rejected host output can be retried.
- The official `free-audio/clap-validator` v0.4.1 test suite loads the built
  `.clap` module. On this Linux machine it reports 44 tests run: 33 passed,
  0 failed, 0 warnings, 11 skipped. The passing tests include in-place and
  separate buffers, sample accurate parameters, saved state reproduction,
  varied block sizes and sample rates, and repeated activation.

The [CLAP specification](https://github.com/free-audio/clap) defines the C ABI
used here. The adapter uses the raw `clap-sys` bindings. The
[validator](https://github.com/free-audio/clap-validator) is an independent host
and test tool; no CLAP framework runs the DSP.

## Remaining host work

The plug-in exposes seven generic host controls but no custom CLAP editor, so
the browser reconstruction is not yet visible inside a DAW. The CLAP reset
callback now clears all 21 prepared effect histories in place while preserving
controls and visited routing. Its cost includes clearing Reverb's prepared
delay lines, so worst-case reset timing still needs measurement.
State load while active prepares the replacement on the main thread and swaps
at the next process block; old runtime retirement stays off the callback.
Multiple queued state loads before a process block are currently rejected.
The CLAP state saver reads atomic public controls and per-effect memories while
audio may be running; a save concurrent with a control-changing block can
capture values from adjacent blocks. A coherent control-thread snapshot is
needed before treating live saves as production-ready.

The browser's per-effect control memory is now reflected in the live CLAP
parameter values and its saved project state. Type switches request a host
value rescan on the main thread. CLAP automation and audio
processing cover f32 stereo; f64 audio and sidechain ports are not advertised.
VST3, Audio Unit, and other format bundles remain separate host adapters.
