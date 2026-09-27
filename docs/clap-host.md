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

## Evidence

- `cargo test -p manifold-native standalone_fx_module_loads_the_authored_project_and_roundtrips_host_state`
  opens the authored project, processes in-place host buffers, applies type and
  mix automation at exact frame offsets, saves project state, and reopens it.
- `cargo test -p manifold-clap` creates the CLAP plug-in through its factory,
  activates it, sends a host parameter event, and compares its stereo output
  sample for sample with the native project adapter. It also switches between
  Chorus and Reverb and checks that the generic host controls follow each
  effect's remembered values.
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
the browser reconstruction is not yet visible inside a DAW. The DSP graph has
no allocation-free reset hook; `clap_plugin::reset` currently does not clear
effect history, though deactivation and state publication prepare new kernels.
State load while active prepares the replacement on the main thread and swaps
at the next process block; old runtime retirement stays off the callback.
Multiple queued state loads before a process block are currently rejected.
The browser remembers per-effect control values in JavaScript; that per-type
memory is now reflected in the live CLAP parameter values on type switches,
with a host value rescan requested on the main thread. Saved state still only
contains the selected effect's five controls; reopening a DAW project resets
the other effects' remembered controls to their defaults. CLAP automation and audio
processing cover f32 stereo; f64 audio and sidechain ports are not advertised.
VST3, Audio Unit, and other format bundles remain separate host adapters.
