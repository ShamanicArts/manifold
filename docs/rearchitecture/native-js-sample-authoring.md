# Native JS Sample authoring

30 September 2026. Change `sxonzprr`, following `lqmkozqm` (`d1a237e7`).

Follow-up: [scripted Sample release hosts](scripted-sample-release-hosts.md)
connects event/batch services to CLAP/VST3 and adds release SDK, browser recall
and a REAPER saved-Instrument render. Limits below describe this earlier checkpoint.

## Review the delivered behavior

- [Live browser review](https://wubulon.tailfac9f9.ts.net:4174/native-sample-authoring.html):
  choose Rack or Instrument, Start, Play, publish new PCM, edit Rack topology,
  download and Stop/Start. Both hosts consume the same public project entries.
- [Native recordings, reports and source](https://wubulon.tailfac9f9.ts.net:4174/native-samples/2026-09-30-native-samples-v3/):
  five manual WAV players, actual native callback test log, saved PCM graphs and
  23 source files checked unchanged before/after recording and against the server.
- Screenshots: [Rack](evidence/2026-09-30-shared-sample-browser-v3-rack.png),
  [Instrument](evidence/2026-09-30-shared-sample-browser-v3-instrument.png),
  [native recordings](evidence/2026-09-30-shared-sample-browser-v3-recordings.png).
- [Browser machine report](evidence/2026-09-30-shared-sample-browser-v3.json).

## What changed and why

Native QuickJS lacked `sendEvent` and `setParameterBatch`, which the shipped Rack
Sample controller needs. Both now submit typed commands to the existing native
control/audio handoff. JS and promises run only on control. The DSP owner receives
timed events and batches of 1–16 public targets between blocks; full graph and PCM
replacement still prepare through `NativeProject` and shared core adoption.

`NativeProcessor::set_parameter_batch` preflights every public descriptor/range
before touching a target. Commands own their vectors on control; callback
completion leaves their disposal to `poll()`. The existing native target readback
updates the authored session. Rack now exposes `adoptPublishedParameters` as a
public JS/TS method, matching the other project modules.

The audio handle preallocates a 1,024-event buffer. A script event merges by offset
with sorted host events, before host events at an equal offset. It is acknowledged
after processing succeeds. Empty/malformed blocks retain a pending event; a full
host event buffer defers it. Unknown targets or offsets outside the actual next
block reject it while host audio continues. A host stop rejects an unrendered
event rather than silently claiming it played. Events use the existing numeric
0/1/2/3 note-on/note-off/all-off/pitch-bend contract and default to offset zero.

The Rack entry delegates to the actual shipped eight-voice Sample author module;
its unity insert and new source are ordinary public graph transactions. The
Instrument entry assembles MIDI input → Sample Instrument → Phase Vocoder → Gain.
Neither entry adds a Sample-specific DSP path. Generated tones are authored PCM
fixtures prepared on control. Both entries restore their accepted graph and PCM.

Multi-step native controls now retain each acknowledged intermediate author state.
For example, if a gain/gate command succeeds but Stop cancels its subsequent note,
the accepted gate intent remains saveable and the controller can lower/raise it
again without reload. Intermediate snapshots are checked against the exact accepted
parameter, batch, route or graph mutation; only existing project control values
may additionally change. An unacknowledged topology change faults the controller.
The snapshot and validation run on control, outside audio. This correction applies
to the native library handoff; the separate release plug-in worker continuation
requires the same recovery audit as part of the next host gate.

## Evidence and limits

| Native callback probe | Recorded stereo frames | Observation |
| --- | ---: | --- |
| Rack | 25,728 | Exact match against an untouched v2 reference through wet vocoders, three-way unison, 12 unity insert/removes, shared PCM replacement and controls |
| Reopened Rack | 10,240 | Fresh QuickJS controller activates all saved gates and renders audio |
| Instrument held interval | 16,384 | Exact match despite eight new-source publications; old held PCM survives |
| Instrument full recording | 40,960 | New notes intentionally use new PCM; maximum difference 0.10186402499675751 |

All measured Rust callbacks allocate/deallocate zero times. Instrument then covers
all-notes-off, another source publication, control-side retirement and reuse of
all eight idle slots. The offset probe compares JS events to direct native events,
checks mixed host/script ordering, invalid batch rollback, empty/malformed blocks,
full-buffer deferral, bad targets/offsets and stop cancellation.

The browser drives the same entries with prepared Wasm. Rack and Instrument both
play, accept PCM replacement, download their actual PCM graph and restart with it
intact. Sampled RMS before/reopen is 0.00546906/0.00519654 for Rack and
0.00429889/0.00400872 for Instrument. Measured Rust callback allocation,
deallocation and processing-failure counters are zero; no compiler Workers remain
after close. Automated browser playback uses a verified private null sink.

Checks: 504 workspace Rust tests, 70 web tests including type/bundle gates,
production web build, and the final five native recording tests. Native recordings
use debug test binaries; this does not establish release callback budgets.
[Durable check logs](evidence/2026-09-30-native-samples-v3-checks.json) record the final gates.
These references are v2, not actual C++ legacy oracles. This slice does not measure
native/Wasm numerical agreement, JS GC, hardware underruns or callback deadlines.
Browser review pages are temporary DOM harnesses; egui migration remains open.

CLAP and VST3 currently reject the new script event/batch commands explicitly.
Existing parameter/route/graph commands continue to work. Their host MIDI path
and shared Sample adoption are already present, but those facts do not prove the
new script services. Native capture/free-window/analysis services remain open.
The prior installed npm consumer and tarball stay immutable; this new slice has
not been repacked as an independently installed consumer.

## Reproduction

```sh
node scripts/build-js-project.mjs examples/projects/rack-sample-project.mjs projects/graph-workspace/rack-sample-project.bundle.js --check
node scripts/build-js-project.mjs examples/projects/sample-instrument-project.mjs projects/graph-workspace/sample-instrument-project.bundle.js --check
cargo test --workspace
npm --prefix web test
npm --prefix web run build
MANIFOLD_NATIVE_SAMPLE_LABEL=your-fresh-native-label python scripts/verify-native-sample-authoring.py
MANIFOLD_SHARED_SAMPLE_LABEL=your-fresh-browser-label \
  python scripts/with-private-null-audio.py node scripts/verify-shared-sample-browser.mjs
```

The original v1 recordings remain intact and predate the intermediate-state fix.
V2 retained a failed adversarial probe: it attempted to mutate the public frozen
snapshot without cloning, so it tested a script exception rather than the intended
publication guard. The corrected probe clones first and verifies rejection of
an actual unpublished topology edit. V3 includes all five final probes.

The browser verifier currently opens the retained v3 native recording directory;
use it to verify that published artifact. Use a fresh label for its new report.
Native recording directories must not be reused. The tmux preview serves
`web/dist`; copy a fresh artifact there or build before verifying its served files.

## Next task: close the release host handoffs

1. Extend shared native publication mailboxes with bounded parameter batches and
   typed event admission. Keep event completion separate from serialized target
   state. No JS, heap disposal or resource preparation in plug-in processing.
2. Connect CLAP and VST3 script dispatch to those shared mailboxes, including
   generation acknowledgements, rejection, host stop, intermediate accepted
   script state and host MIDI ordering.
   A sixteen-target edit must publish its state atomically; ephemeral events must
   not become persistent parameter values or saved playback intent.
3. Package these exact public entries and prove release callbacks with editors
   closed, held/new PCM, stop/recall, callback heap guards and actual DAW renders
   through the private sink. Compare with the native/browser author actions.
4. Continue prepared capture/free-window/source workflows, Main M2–M5 and the
   complete legacy inventory. Actual C++ behavior and matched C++/Rust/Wasm
   performance, native devices, egui and wider creator workflows remain required.
