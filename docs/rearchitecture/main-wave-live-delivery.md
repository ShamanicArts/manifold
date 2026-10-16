# Main Wave in the shared live creator

1 October 2026. This delivers part of V02/Main M2. Full Main and V02 remain open.

## Usable products

- [Main Wave creator](https://wubulon.tailfac9f9.ts.net:4174/main-wave.html):
  highlighted source, retained/egui kit, keyboard/MIDI, Wave/drive/unison/ADSR,
  dry input and monitor/master routing, agent commands, source edits and recall.
- [Independent package consumer](https://wubulon.tailfac9f9.ts.net:4174/examples/instrument-import/?project=main-wave):
  imports public author/UI packages and chooses Main Wave or StandaloneOsc.
- [Native Main Wave update 1](https://wubulon.tailfac9f9.ts.net:4174/main-wave-delivery/2026-10-01/Manifold-main-wave-linux-x86_64-r1.tgz):
  exact optimized executable, original/edited portable packages, source and real
  [screen/audio recording](https://wubulon.tailfac9f9.ts.net:4174/main-wave-delivery/2026-10-01/native-r1/live-native-midi.mp4).

Archive SHA256: `3c8212b4d9341cc0da2eaadda39c15cb3a8b0891110586ed06109a7e23f65a28`.
Executable SHA256: `af736ab02b95b9985952fcc9f9f1bfd5b02bb6efd1159b0ffb95c55c5a6af06e`.
Run `./manifold-app Project.manifold.json`, then Listen. Native instruments default
to silent input; Saw, Noise and No input are explicit choices.

## Composition and changes

The creator embeds the actual public `main-wave-graph.mjs` factories: eight
oscillator/crossfader/mixer voices and Main's dry/monitor/send/master branches.
Eight public Rust ADSRs sit between those voice outputs and the voice mixer.
There is one graph execution plan, no `MainInstrument` or hidden fixed synth.
The common authored keyboard source provides allocation, velocity, sustain and
owner/channel release for Main Wave and the original Rack oscillator.

The old Main voice manager advanced envelopes on a UI/control clock and pushed
amplitudes at about 60 Hz. This creator puts envelope processing in the graph,
so audio envelopes continue independently of UI ticks. The existing core ADSR
ports the old scalar curve and releases from its current level. Allocation and
velocity mapping reuse the Main port. Exact full legacy controller/envelope
trace parity for this new composition is **not** established by the older Wave
branch comparison. Record this as a migration change requiring broader comparison.

Dry inputs remain separate from synth monitoring. No loop is installed in this
increment, so capture-send is inspectable in the graph but has no connected layer.
Full Sample/Blend/Ring/FM/Sync/additive/morph, FX/EQ, four-layer LoopLayer,
quantized transport and dynamic rack are unfinished.

## Actual evidence

- [BB report](../../web/public/main-wave-delivery/2026-10-01/browser-r1/report.json):
  retained keyboard, actual egui pointer note, retained→egui→retained, external
  HTTP agent source edit while the egui note held, edited source reload/recall
  and another sounding keyboard note. Actual retained monitor interaction
  publishes 1.01. Recorded output is non-silent. Callback heap/failure counters
  were zero in this bounded run; no glitch-free claim.
- [Independent importing report](../../web/public/main-wave-delivery/2026-10-01/imported-r1/report.json):
  actual headless Chromium Web MIDI and owned ALSA fixture, two channels, pedal,
  scoped panic/disconnect, held graph edit, real keyboard preserved through a
  waveform preview edit, and the actual global release button. Output RMS
  0.00507218; final quarter-second RMS 0. This is not a BB or physical MIDI test.
- [Native report](../../web/public/main-wave-delivery/2026-10-01/native-r1/report.json):
  actual egui device selection, two channels, pedal, held topology gain insertion,
  agent-owned voice surviving device/channel panic, disconnect and actual global
  release. Output RMS 0.00153931; released RMS 0. Preparation plus GUI publication
  measured 500.15 ms. This remains a latency problem, not a real-time guarantee.
- Native signal test `live_main_wave`: cold portable package recall sounds held
  notes, scoped release retains the other owner, synth monitor mutes/restores,
  and final note release reaches silence. Existing oscillator tests pass after
  factoring its project event source. Web/catalog/package/TS tests: 82 pass.

Initial actual native review failed to reach silence because the creator app
fed its default Saw into Main's dry monitor. The delivered binary fixes that
default and exposes No input. Initial browser start failed until the running
preview server reloaded the new page's isolation headers. An agent edit without
`expectedRevision` was correctly rejected; the recorded accepted edit includes it.
Failed scratch reviews remain private and are not acceptance artifacts.

## Next delivery and remaining scope

Continue original shared synth processing and then V03's real Standalone FX/Main
effect slots through this same creator. Preserve all 28 project and 19 rack-module
rows in the vertical plan: complex Main looper, MidiSynth, dynamic rack and typed
graph connections remain required. Full original faces/animated preview, DAW Main
creator interaction, physical MIDI, timestamp scheduling, arbitrary native device
I/O, matched C++/Rust/Wasm performance and complete port are open.

## Shared Main Filter increment — package 0.2.0

The current creator and importer also compose `addMainSynthFilter` from the
public Main graph module. It follows the voice mixer and feeds synth monitor/send;
Main's dry input stays outside it. Original global paths `/midi/synth/filterType`,
`/midi/synth/cutoff` and `/midi/synth/resonance` retain the old defaults: low pass,
3200 Hz, resonance 0.75, unity drive and fully wet. The Filter is an ordinary
inspectable SVF node; users can replace it and its connections in source.

- [Current native update 2](https://wubulon.tailfac9f9.ts.net:4174/main-wave-delivery/2026-10-01/Manifold-main-wave-linux-x86_64-r2.tgz)
  includes the exact reviewed executable and controller, with
  [real screen/audio video](https://wubulon.tailfac9f9.ts.net:4174/main-wave-delivery/2026-10-01/native-r2/live-native-midi.mp4).
  Archive SHA256 `809f1aea613618f2123acbae726879ef430d02212793c01c5ce8c80686925722`;
  executable SHA256 is unchanged from update 1. Actual native MIDI/held topology
  edit/scoped release/global release passed. Output RMS 0.00151198, release RMS 0;
  preparation plus GUI publication 504.09 ms. Native pointer manipulation of the
  new Filter itself was not exercised by that MIDI recording.
- [BB Filter report](../../web/public/main-wave-delivery/2026-10-01/browser-r2/report.json):
  an external agent starts note 60; actual retained pointer drag sets cutoff to
  80 Hz. Captured-stream RMS falls from 0.0163273 to 0.00127151. Actual egui pointer
  click sets cutoff to 8000 Hz, the note remains held and RMS returns to 0.0162306.
  Shared accepted targets drive both views. The full real recording is published
  as compressed Opus, labelled audio evidence rather than a screen recording.
- [Independent importing report](../../web/public/main-wave-delivery/2026-10-01/imported-r2/report.json):
  current package imports, MIDI/keyboard, held source/preview edit, scoped pedal,
  channel/device release and global release passed in isolated headless Chromium.
- Native signal test now additionally verifies that the shared Filter attenuates
  the sounding voice bus, alongside held recall and monitor/release behavior.
  The common release adapter now updates Main's saved voice gate while allowing
  its core ADSR tail to continue. The original Rack oscillator keeps its existing
  amplitude control semantics. Web tests 82 pass; native Main/oscillator tests 3 pass.

This integrates shared synth filtering. It does not complete Main's post-synth
FX/EQ, original full Source/Filter faces, loop capture/transport or dynamic rack.
Native preparation latency and matched historical signal/performance comparisons
remain open. Proceed with V03's actual effect factories, memory, tails and UI;
do not equate a fixed `effect-slot-legacy` kernel with the authored 21-effect graph.
