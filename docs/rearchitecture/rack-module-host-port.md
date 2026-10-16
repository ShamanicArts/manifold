# RackModuleHost migration: authored Oscillator / Sample / Blend / Filter / FX / EQ

Status: partial, 29 September 2026. The historical source is the read-only
`UserScripts/projects/RackModuleHost` tree and its reused Main
`lib/rack_modules/oscillator.lua`, `blend_simple.lua`, `filter.lua`, `fx.lua`,
and `eq.lua` factories in `my-plugin`.

## Behavior and authored boundary

The old `buildPlugin(ctx)` creates a shared input A source and independent
module processors, then selects the audible module through project logic.
The [JS project module](../../packages/manifold-author/examples/rack-filter-eq.mjs)
and an independent Rust authoring test now construct both source buses with
prepared oscillator, quarter-width Pulse, host input, and noise branches,
four equal-power crossfaders and paired directional ring, audio FM, and audio
sync nodes for Blend, one SVF Filter, one legacy FX slot, and one eight-band EQ from public graph
primitives. The old Filter defaults (low pass, 3200 Hz, resonance 0.75), FX
defaults (Chorus selected, mix 0, controls 0.5/0.5/0.2/0.6/0.4), and EQ defaults (bands
disabled, first and last Q 0.8, mix 1, output 0 dB) appear in the portable
[Filter](../../projects/graph-workspace/authored-rack-filter.json),
[FX](../../projects/graph-workspace/authored-rack-fx.json), and
[EQ](../../projects/graph-workspace/authored-rack-eq.json) snapshots. The same
graph also saves [Noise](../../projects/graph-workspace/authored-rack-noise.json)
and [External](../../projects/graph-workspace/authored-rack-external.json) input
routes, plus [Pulse](../../projects/graph-workspace/authored-rack-pulse.json)
and [Blend crossfade](../../projects/graph-workspace/authored-rack-blend.json)
plus [Blend ring](../../projects/graph-workspace/authored-rack-blend-ring.json),
[Blend FM](../../projects/graph-workspace/authored-rack-blend-fm.json), and
[Blend sync](../../projects/graph-workspace/authored-rack-blend-sync.json).

The composed [RackModuleHost project](../../packages/manifold-author/examples/rack-module-host.mjs)
adds the same [authored nine-source oscillator module](../../packages/manifold-author/examples/rack-oscillator.mjs)
used by its standalone audition. Its nine `extended-oscillator` primitives feed
the public `mixer9` and gain nodes. With a prepared sample source, it also
adds the reusable [eight-voice Sample module](../../packages/manifold-author/examples/rack-sample-eight-voice.mjs)
at selection 2. The combined [Sample fixture](../../projects/graph-workspace/authored-rack-module-host-sample.json)
has 63 nodes, one PCM asset, and seven shared bindings; its output cable
starts at the Sample gain. The project keeps `/rack_host/module/index` as a
saved control. Values 1–6 now select Oscillator, Sample, Blend, Filter, FX,
and EQ. `LiveGraphSession.routeWithControl` and Rust
`LiveGraphSession::route_control` submit one output cable change and commit its
selection only after the prepared host accepts the route. Invalid values or a
host rejection leave both the saved selection and cable intact. Named Filter,
FX, EQ, Blend, and source branch paths survive JS/Rust save and reopen; fifteen dynamic
parameter paths bind to stable host slots. No Rack-specific DSP processor was
added.

The [live Rack page](https://wubulon.tailfac9f9.ts.net:4173/rack-filter-eq.html)
prepares that combined graph and switches into Sample while audio runs. Voice
1/8 gates and pitch and shared vocoder mode call the same Sample project script
used by the standalone module. A [browser capture](evidence/web-rack-module-host-sample-live.png)
shows selection 2, voice 8 at MIDI 72 and 70% gate, voice 1 at 40%, and
Vocoder mode. The new Chromium stream used private null sink 150080; the H6
remained at its two prior streams. The sink was removed, with no page errors.
Wasm and native block tests play the eighth sample voice through this 63-node
graph. CLAP/VST3 import and save the combined fixture while processing. This
is the selected graph and control surface; the historical capture, source,
retrigger, and unison behaviors remain open.

Input A now keeps `/rack_host/input_a/mode` and `/rack_host/input_a/pitch` as
project controls and `/rack_host/input_a/level` as the common bus gain endpoint.
It maps all seven old input A modes to typed branches, including Pulse mode 6
through a separate public pulse oscillator with a fixed 0.25 width. Existing
oscillator project documents retain their three-parameter contract. The module
maps MIDI pitch 24–84 to oscillator frequency. JS
`parameterWithControl` and
Rust `parameter_control` commit a derived DSP parameter with its saved control
only after the host accepts it. Returning to an oscillator mode from another
branch prepares its waveform while that branch is inaudible, then commits the
cable and saved mode on route acknowledgement. A rejected route can leave the
inactive oscillator waveform prepared for the requested mode; the audible
cable and selected control remain intact. Input B now uses the same seven-mode
project logic with original Saw/MIDI 67/level 0.5 defaults. Blend mode 0 maps
`blendAmount` 0–1 to the reusable crossfader position -1–1, with equal-power
curve and a separate output gain. Mode 1 uses A→B and B→A public ring
modulators feeding a second equal-power crossfader. `blendModAmount` drives
both ring depths and disables both nodes at or below 0.001, matching the old
project script. Modes 2 and 3 use the original two-direction modulated-delay
FM and positive-crossing replay sync behavior, each with a separate crossfader.
Their histories are allocated during graph preparation, before the audio
callback. The modulation-depth edit uses one bounded, acknowledged batch for
all three directional pairs and the two ring enable flags. The browser host
applies the eight DSP edits in one worklet message between blocks and rolls
them back if the engine rejects any edit. The project control and parameter
snapshot commit only after that acknowledgement.
Native plug-ins can import the resulting authored state,
but their editor does not yet run this JS project module to interpret pitch or
mode gestures.

The original project starts with module index 1, its rack oscillator. The
combined project's default is now index 1; the review page starts at Filter
index 4 to preserve its existing input audition. The oscillator's manual
controls and all slot-wide waveform, unison, drive, and additive controls use
the same JS interpreter in the standalone and combined projects. The other
module selections, MIDI
voices, sample capture, FX type switching and remembered per-effect controls,
GUI, legacy state import, and host-side
project event dispatch remain open. The current browser page runs the JS
project control logic; CLAP and VST3 import its authored snapshots but do not
yet execute that JS project module internally. Its route switch is immediate,
whereas the old host changed parallel output gains; click and transition
behavior still need comparison with the original executable.
The patchable core orders the output after every prepared node. A later
prepared source can now feed any compatible target: a route edit checks the
proposed graph for a real cycle, reorders prepared kernels, remaps their
stored indices, and recomputes active reachability. In native hosts the control
thread validates the document; the audio callback applies the prepared edit
using preallocated ordering scratch. A regression checks that a paused
oscillator retains its phase after reordering and reactivation, and an
allocation counter checks backward/forward edits with audio blocks.

## Executable evidence

- `web/tests/authoring.test.js` builds the Filter, FX, EQ, and all four Blend
  mode snapshots, rejects a
  route without changing state, accepts selection, reopens the graph, and
  measures different Wasm audio. It renders Noise and External input and proves
  Silence is silent. `manifold-native` independently authors the same documents
  and switches the prepared native route. CLAP and VST3 tests import all ten
  snapshots while audio runs and save the selected module and source cables.
- `web/tests/rack-module-host.test.js` starts at the old index 1, edits the
  manual oscillator level, switches to Filter and back through acknowledged
  routes, and reopens with the edited level intact. Rejected routing preserves
  both selection and cable. The [combined fixture](../../projects/graph-workspace/authored-rack-module-host-oscillator.json)
  renders the selected oscillator in native Rust and Wasm with identical output
  checksums; its [offline timing report](evidence/2026-09-29-rack-module-host-oscillator-native-wasm.json)
  measures median 47.14/54.73 µs native/Wasm per 128-frame block at 48 kHz,
  with no measured deadline misses. This is a comparison of current Rust
  targets, not of the historical C++ implementation.
- The [combined live page](https://wubulon.tailfac9f9.ts.net:4173/rack-filter-eq.html)
  accepted manual level, waveform, and additive mode edits, switched
  Oscillator → Filter → Oscillator while playing, and saved index 1 and the
  edited manual level. Its [running capture](evidence/web-rack-module-host-oscillator-live.png)
  shows the oscillator route. The new Chromium audio stream went only to the
  temporary private null sink; the physical H6 gained no stream. The sink was
  removed after the run and there were no page errors.
- [Voice control evidence](rack-oscillator-port.md#2026-09-29-voice-control-checkpoint)
  covers gate retrigger, pitch/FM, and pulse CV in Wasm blocks and in the live
  combined page, plus a voiced snapshot rendered by native Rust, Wasm, CLAP,
  and VST3. The [running capture](evidence/web-rack-module-host-voice-live.png)
  shows the saved voice controls.
- The [live browser audition](https://wubulon.tailfac9f9.ts.net:4173/rack-filter-eq.html)
  starts a real Rust/Wasm AudioWorklet graph, switches Filter → FX → EQ → FX
  through acknowledged routes, edits FX mix to 100%, and downloads the
  accepted portable project. [Running capture](evidence/web-rack-filter-fx-eq-live.png).
  Headless Chromium's new audio stream was verified on a private PipeWire null
  sink (148216), with no new stream on the physical H6. The sink was removed
  after the run; no page errors occurred.
- The [input A browser capture](evidence/web-rack-input-a-live.png) shows Saw,
  MIDI 69, and 30% level in the running worklet. The downloaded project saves
  those controls plus the derived 440 Hz oscillator frequency. Its new stream
  was on private null sink 148297; the physical H6 had no new stream. That
  sink was also removed after the run.
- The [Blend browser capture](evidence/web-rack-blend-input-b-live.png) shows a
  running worklet selecting Blend and switching input B to Pulse, MIDI 69,
  level 80%, with amount 100%. The saved output cable points to node 18,
  input B to node 16, and pulse frequency is 440 Hz. Its only new audio stream
  was on private null sink 148598; the physical H6 still had two preexisting
  streams. The null sink was removed after the run.
- The [Ring browser capture](evidence/web-rack-blend-ring-live.png) shows Blend
  mode 1 with ring depth 80% in the real worklet. The saved cable points from
  ring crossfader 21 to Blend output 18 and then to project output 3; both
  directional ring depths are 0.8. Its audio stream was on private null sink
  148705 with no new H6 stream. The sink was removed after the run.
- The [batch edit browser capture](evidence/web-rack-blend-batch-live.png)
  shows a single acknowledged 80% modulation-depth gesture in the running
  worklet; both ring depths and the saved control became 0.8. Its new stream
  was on private null sink 148859 with no new H6 stream. The sink was removed.
  `web/tests/live-authoring.test.js` also forces a Rust rejection after an
  earlier edit and verifies that the worklet rolls that earlier edit back.
- [FM](evidence/web-rack-blend-fm-live.png) and
  [Sync](evidence/web-rack-blend-sync-live.png) captures show live mode changes
  into node 24 and node 27, respectively, with each saved mode/cable in the
  running worklet. Their only new audio stream was on private null sink 148792;
  the H6 stream count stayed at two. The sink was removed after the run.
- The current page's [Noise](evidence/web-rack-input-noise-live.png),
  [External](evidence/web-rack-input-external-live.png),
  [Pulse](evidence/web-rack-input-pulse-live.png),
  [Silence](evidence/web-rack-input-silence-live.png), and
  [Saw](evidence/web-rack-input-saw-live.png) captures show the running worklet
  accepting each cable and saved control. Pulse at MIDI 69 saved 440 Hz; the
  return from Silence to Saw retuned its oscillator to the same pitch.
  The new stream was confined to private null sink 148479; the physical H6
  stream count stayed at two. The sink was removed after the run.
- The [Filter](evidence/2026-09-29-rack-filter-native-wasm.json),
  [FX](evidence/2026-09-29-rack-fx-native-wasm.json), and
  [EQ](evidence/2026-09-29-rack-eq-native-wasm.json) timing reports, plus
  [Noise](evidence/2026-09-29-rack-noise-native-wasm.json) and
  [External](evidence/2026-09-29-rack-external-native-wasm.json) and
  [Pulse](evidence/2026-09-29-rack-pulse-native-wasm.json) and
  [Blend crossfade](evidence/2026-09-29-rack-blend-native-wasm.json) and
  [Blend ring](evidence/2026-09-29-rack-blend-ring-native-wasm.json),
  [Blend FM](evidence/2026-09-29-rack-blend-fm-native-wasm.json), and
  [Blend sync](evidence/2026-09-29-rack-blend-sync-native-wasm.json), compare
  patchable native Rust and Wasm graphs at 48 kHz/128 frames. Their output
  checksums agree within the 0.1% gate. Median offline p50 (native/Wasm) is
  6.84/8.57 µs Filter, 22.84/23.90 µs FX, 6.62/12.17 µs EQ,
  6.22/10.24 µs Noise, 5.37/10.06 µs External, 6.75/11.47 µs Pulse,
  7.47/10.77 µs Blend crossfade, 8.25/11.93 µs Ring,
  13.55/15.52 µs FM, and 11.11/14.49 µs Sync. The largest checksum difference
  is about 0.0014%. These do not measure the old C++ host,
  actual browser callback scheduling, or a DAW callback.

## Next port slices

1. Measure route edit latency and transition discontinuities with the general
   route planner. Provide the same batch gesture contract in native host editors.
2. Finish Sample behavior at selection 2 and the remaining module registry. Import an
   actual old project state and compare control events, output, and save/reopen
   at each module boundary. The [Sample port ledger](rack-sample-port.md)
   records the authored eight-voice graph and the remaining capture, source,
   retrigger, unison, and control behavior. Complete oscillator voice event and
   sync behavior.
3. Give CLAP/VST3 a project orchestration runner or equivalent authored command
   dispatcher so native editor gestures use the same path semantics as browser
   JS. Today those hosts import the resolved project snapshots only.
4. Build a matched C++ reference harness from the read-only source outside the
   old checkout. Its existing `GraphRuntimePerfHarness` is fixed at 44.1 kHz
   and 512 frames; the current native/Wasm reports use 48 kHz and 128 frames.
   Run the same graph and input under equal settings before claiming a speed
   comparison. Also measure browser and DAW callback timing and mode-switch
   discontinuities on a private sink.
