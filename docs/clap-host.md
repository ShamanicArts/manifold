# CLAP host proof

## Graph instrument checkpoint

The same Linux `.clap` module now exports a second class,
`arts.shamanic.manifold.graph`. It accepts the authored graph project JSON
through the CLAP state stream, prepares native Rust DSP outside the audio
callback, and exposes 128 stable normalized host slots. Its audio callback
supports stereo input/output, sidechain input, CLAP note events, and timed
parameter values. The browser and VST3 graph project bytes are portable to
this class. The first default is the authored Note Voice graph.

`cargo test -p manifold-clap graph_clap_note_and_automation_match_native_and_state_reopens`
checks a note plus a parameter change at frame 32, compares both CLAP output
channels sample for sample with `manifold-native`, then saves and reopens state.
`scripts/probe-clap-graph.py` loads the **packaged** module in a separate
process, discovers both classes, restores a project through CLAP state,
renders a block, and saves it again. Successful local runs:

| Project | Loaded bytes | Output peak | Saved bytes |
| --- | ---: | ---: | ---: |
| Note Voice | 1,153 | 0.027285 | 879 |
| Tone Texture | 1,471 | 0.122184 | 1,091 |
| Four-source sampler | 44,742,408 | 0.175362 | 44,742,624 |

The four-source input can be reproduced with
`python scripts/probe-reaper-graph-vst3-gui.py --emit-project /tmp/manifold-four-source-bench.json`
followed by `python scripts/probe-clap-graph.py --project /tmp/manifold-four-source-bench.json`.
The current Graph CLAP class has generic host controls; its custom graph editor
bridge is the next host-format task. The Standalone FX CLAP editor described
below is already present, and the Graph VST3 editor remains the visual reference.

## Standalone FX

The Linux CLAP module is the first loadable native host for the authored
Standalone FX project. It uses the same `projects/standalone-fx-module/project.json`
as the browser page. `manifold-native` validates that project and prepares the
same `manifold-core` persistent FX graph. The CLAP callback copies planar host
audio through preallocated buffers, translates seven public parameters to the
fixed host slots, and processes timed automation in native Rust. It does not
execute Lua or depend on JUCE.

Build a loadable file with `./scripts/build-clap.sh`. It prints the path under
`target/clap/ManifoldFX.clap`. The bundle also contains `ManifoldFX-editor` and
the built browser assets. The CLAP GUI extension embeds the ported widgets in
an X11 child window; generic host parameters remain available.

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
- `scripts/probe-clap-gui.py` loads the actual `.clap` binary under a disposable
  Weston/Xwayland host, loads Reverb through the CLAP state stream, creates a
  500 × 246 native child window, captures its rendered widgets, sends host Mix
  automation and captures the updated window, then exercises show, hide, and
  destroy. The captures are in `web/public/standalone-fx-clap-editor.png` and
  `web/public/standalone-fx-clap-automation.png`.
  The validator still reports 33 successes, 11 skips, and no failures after
  adding the GUI extension.

The [CLAP specification](https://github.com/free-audio/clap) defines the C ABI
used here. The adapter uses the raw `clap-sys` bindings. The
[validator](https://github.com/free-audio/clap-validator) is an independent host
and test tool; no CLAP framework runs the DSP.

## Remaining host work

The custom editor is embedded in the disposable X11 host, but a real DAW
gesture and automation pass remains. This isolated Xwayland compositor did
not permit XTEST pointer injection, so the complete native pointer-to-host
path has not been exercised. The CLAP reset callback clears all 21 prepared
effect histories in place while preserving
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
The first [VST3 Standalone FX bundle](vst3-host.md) now runs the same native DSP
and authored state through Steinberg's processor/controller ABI. Audio Unit and
broader graph project exports remain separate host adapters.
