# Authored MIDI through the prepared runtime

30 September 2026; working change `lvmpzxwr`, parent `pwukokyz` (`079064ea`).
This extends the [public prepared host](public-prepared-runtime.md) and
[Rack oscillator continuity](rack-oscillator-port.md). It advances reusable
graph authoring and publication. The complete legacy project port stays open.

## Review the deliverables

- [Live authored MIDI graph](https://wubulon.tailfac9f9.ts.net:4174/prepared-midi.html):
  latch a key, change its interval, bend pitch, toggle the authored insert,
  release the original key, stop and restart.
- [Independent installed npm consumer](https://wubulon.tailfac9f9.ts.net:4174/importable-midi-library/):
  public imports from an installed tarball in a project outside this checkout.
  Source, lockfile, tarball, built assets and hashes are retained
  [alongside the app](../../web/public/importable-midi-library/).
- [Edited recording](../../web/public/prepared-midi/2026-09-30-prepared-midi-v2/edited.wav)
  and [reference](../../web/public/prepared-midi/2026-09-30-prepared-midi-v2/reference.wav),
  playable on the live page: no autoplay, one recording at a time. Starting a
  recording closes the live graph; starting the graph pauses the recordings.
- [Measured browser report](evidence/2026-09-30-prepared-midi-v2.json),
  [authored graph](../../web/public/prepared-midi/2026-09-30-prepared-midi-v2/final-project.json),
  [actual playing UI](evidence/2026-09-30-prepared-midi-v2.png),
  and [legacy events](../../web/public/prepared-midi/2026-09-30-prepared-midi-v2/legacy-events.json).

## Ownership and scripting contract

The opt-in host accepts 17 existing public kinds: raw and sidechain input,
output, Gain, Fixed Gain, Sum2, Widener, Distortion, scalar/extended/pulse
Oscillator, LFO, Modulated Gain, Mixer9, MidiInput, MidiTranspose and VoiceSynth.
Prepared ABI version 2 rejects the earlier version-1 binary. The normal Wasm
ABI remains version 5. An isolated document and compiler Worker are required;
graph validation, allocation and compilation run in the Worker. The audio
owner calls the same Rust plan and bounded core event processing. There is no
project-specific audio processor or JavaScript synthesis.

`@manifold/author/examples/transpose-audition` constructs an ordinary
MidiInput → MidiTranspose → VoiceSynth → Output graph. The author registers
named instances, the actual legacy
`/midi/synth/rack/transpose/1/semitones` endpoint and host slot 0. Insert
composition uses the same `LiveGraphSession.transaction` API available to
users. VoiceSynth is an audition voice; it does not recover Main's instrument
or complete Standalone Transpose's product, UI and export behavior.

`host.sendEventBatch(events)` admits 1–256 events atomically. `sendEvent(event)`
in prepared mode is a one-event admission promise. Kinds are note-on 0,
note-off 1, all-notes-off 2 and pitch bend 3. Channel is zero-based 0–15;
`note` and `velocity` are bytes 0–127. Bend uses `note` for its low seven bits
and `velocity` for its high seven bits. Events are stably sorted by offset;
ties keep admission order. Offsets refer to the next available block and must
fit its render quantum: currently 0–127. They are not absolute hardware MIDI
timestamps or a promise about wall-clock sound latency.

An admission receipt reports request ID, admitted count, pending count and
publication ID. It is **not a rendered-event acknowledgement**. Shared
diagnostics separately count admitted, pending, consumed, cancelled and
rejected events, plus the last event's AudioContext frame. Consumed means the
event entered a successful Rust render block; it does not guarantee an audible
output from a disconnected or muted graph. A suspended context can acknowledge
admission and publish a graph while consuming zero events.

The Worklet prepares fixed 256-row typed storage before processing. Events
retain a logical target: named instance path and kind, or numeric ID and kind
for an unnamed instance. On publication the callback resolves that target
against the accepted graph. Removed targets cancel their pending events.
All-notes-off cancels previously queued events for its target before admitting
the entire new batch; an explicit later onset in that new batch remains valid.
Overflow rejects without partially applying the batch or its cancellations.
Close cancels pending events before relinquishing audio ownership.

`readMidiTrace()` reads Rust's 32-entry diagnostic ring outside `process()`;
publication ID distinguishes traces from replacement engines. This ring is not
a lossless MIDI export service. Port handling allocates in JavaScript; the
Rust callback allocation measurements do not cover JS allocation or GC.

## Compatible histories and deliberate reset behavior

Rust transfers the fixed eight VoiceSynth voices, serials and channel bend
ratios without replacing candidate controls. MidiTranspose transfers its
fixed original-key router. Eligible identities require the same kind and
stable named path (or both unnamed with matching numeric ID).

Voice and transpose history additionally require a corresponding upstream
MIDI chain: mapped instances, kinds and input/output port connections must
match. This walk uses the compiled acyclic graph without allocation. It is
bounded by the public prepared host's node limit; large-graph callback cost
still needs measurement.

When an authored candidate deliberately changes the transpose interval, a
second pass runs after downstream voice histories transfer. It emits old-note
offs and remapped held-note ons into the candidate's normal core MIDI route.
This ordering avoids copying stale voice state over the new remap. An original
key release continues to find the correct held slot after numeric IDs change.

**Changing the upstream MIDI chain resets affected voice ownership.** A
prepared public MIDI route edit prepares a structural candidate through this
compatibility check. It does not preserve a voice whose note-off owner changed.
Audio route edits can still use the prepared route fast path. Native/default
browser route fast paths have not yet adopted an equivalent ownership policy;
that cross-host gate remains open.

## Actual evidence

All audio tests ran through `scripts/with-private-null-audio.py`, which verifies
a disposable null sink before launching headless Chromium. Physical H6 and
speaker routing was untouched.

| Case | Observed result |
| --- | --- |
| Actual UI | Latched C, insert, +7 semitones, bend 10000, original-key release and stop work |
| Paired Rust graphs in one AudioContext | 55,808 stereo frames at 48 kHz; zero differing samples; maximum difference 0; release tail ends at 0 |
| Transparent graph edits while held | Eight Distortion insert/remove edits, then an authored +7 interval candidate; reference stays structurally unchanged and receives the equivalent scalar edit |
| Frame scheduling | Rust trace and context diagnostic place onset at frame 64; envelope starts at zero, so first nonzero PCM is frame 65 |
| Queued release across ID changes | Input 4→14, transpose 5→15; stable named paths retain two histories and pending original-key off at offset 93; consumed at context frame 45,661 |
| Processing ownership | Each graph reports 436 Rust calls for 436 audio blocks; edited graph has 11 publications; zero Rust callback allocations, frees or failures |
| Atomic overflow and stop | 256 pending events while suspended; event 257 rejects with queue unchanged; all-off cancels the 256 and later consumes one Stop |
| Full queue consumed | A second 256-event batch actually processes with no Rust callback allocation or failure |
| Target removal and close | Removed logical target cancels its event; close cancels the final pending event and releases host memory; no compiler Workers remain |
| Actual old Lua adapter scenario | All 25 emitted events match the browser core graph: held remap, pitch clamp, oldest-of-nine eviction, all-off and bend |

The native signal test
`live_midi_chain_retains_original_note_ownership_and_resets_rewired_voices`
compares continuous sample output, candidate interval changes, renumbering,
original-key release and rewired-note reset. Workspace tests total 483; web
tests total 56. Both Wasm builds, production web build and strict installed
TypeScript checks pass.

The old comparison runs `tools/legacy-midi-transpose.lua` against actual
read-only Lua files with stubbed Midi, `getParam` and parameter-binder services.
The [legacy source sidecar](../../web/public/prepared-midi/2026-09-30-prepared-midi-v2/legacy-source/manifest.json)
archives those files, helper and interpreter version after the completed run;
the original measured report is not rewritten. This is an offline event
oracle, not execution of the old C++ audio engine or UI. Lua does not enter v2.

Fourteen recording-time source/catalog/Wasm artifacts are retained under
`web/public/prepared-midi/2026-09-30-prepared-midi-v2/measured-source/` with hashes
in the report. The later page adds recordings; it does not replace those
measured files. The installed consumer separately checks the later page and
actual tarball.

The [installed-consumer proof](evidence/2026-09-30-installed-midi-library-v3.json)
records actual signal, insert/interval/bend edits, original-key release to
silence, a public MIDI route replacement that resets the old voice, zero Rust
callback allocations/frees/failures, both served WAVs with identical hashes,
all fourteen served capsule hashes, player policy and no Workers after close.
Its [playing app](evidence/2026-09-30-installed-midi-library-v3.png) and
[review page](evidence/2026-09-30-installed-midi-library-v3-review.png) are retained.
The tarball SHA-256 is
`37bd509960ddf16072126612e7f4396dc827966d17e07e2af8cbd0e6f4aad109`.

Reproduce with a new evidence label (existing destinations are not overwritten):

```sh
MANIFOLD_PREPARED_MIDI_PROOF_LABEL=your-new-label \
  python scripts/with-private-null-audio.py node scripts/verify-prepared-midi.mjs
MANIFOLD_INSTALLED_MIDI_PROOF_LABEL=your-new-consumer-label \
  python scripts/with-private-null-audio.py node scripts/verify-installed-midi-library.mjs
```

### Retained failed probes

The [first MIDI comparison](evidence/2026-09-30-prepared-midi.json) retains its
56,832 frames, source capsule and
[failure](../../web/public/prepared-midi/2026-09-30-prepared-midi/failure.json).
The insert inherited the catalog's 0.8 output trim despite a dry mix of 0.
Its active spans therefore attenuated the reference by 20%; maximum difference
was 0.0222711. The probe also incorrectly expected the envelope's first audible
sample on event frame 64. The corrected author module explicitly sets insert
output to 1; the probe checks event frame 64 separately from PCM frame 65.
The passing run retains both paired WAVs without discarding silent or
mismatched samples. The prior failed recordings remain.

Installed-consumer failures are also retained. The first incorrectly expected
one history after MIDI rewiring: transposer and Distortion retain state while
the downstream voice resets. The corrected probe checks two transfers and
actual silent PCM. The second probe awaited the initial recording `play()`
promise, which the page deliberately interrupts while closing live audio.
The final probe checks resumed playback and the one-player policy explicitly.

## Next tasks and full-port gates

The [owned loop/capture follow-up](prepared-loop-runtime.md) now adds loop
assets/history and retrospective history in prepared mode. Its live save and
paired PCM proof is separate evidence; Sample/native plug-in gates remain open.

1. Add prepared Sample/Retrospective Capture/Loop resources through this same
   ownership protocol. Transfer or swap prepared storage without allocation or
   dropping unused candidate resources in the callback. Retain held playback,
   loop audio, capture cursor and correct failure behavior with real Rack/Main
   compositions.
2. Give native JS project controllers and VST3/CLAP adapters the same bounded
   timed-event admission, ordering, identity, cancellation and route ownership
   semantics. Prove MIDI reaches the actual native callback and saved
   controllers survive reopening. Existing core JSON event rendering does not
   prove the complete live host API.
3. Recover Main's authored synth, dry/monitor, capture and four-layer loop graph
   from its scripts. The fixed voice/capture/looper path remains; this audition
   advances M1/M3, not M2 completion.
4. Finish the legacy inventory, MIDI export, script/UI lifecycle, egui creator
   surface, legacy state import and native/DAW product behavior.
5. Measure matched C++/Rust/Wasm workloads, request-to-audible edit latency,
   sustained callback CPU percentiles, JS GC, long-session queue/frame counter
   rollover, resource memory bounds and hardware event jitter. Exact short
   paired PCM and zero Rust allocation do not close performance gates.
6. Prove fatal compiler/processor recovery and retirement timeouts without
   freeing a possibly audible engine or reusing a poisoned shared arena.

Do not add a second Main audio path or bypass resource gates with a bespoke
project processor. The public graph stays the source of composition.
