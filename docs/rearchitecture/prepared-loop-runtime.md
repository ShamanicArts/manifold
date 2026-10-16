# Owned loop and capture history in the public graph

30 September 2026. Change `uqypknxt`, parent `lvmpzxwr` (`c4440031`). This
extends [prepared MIDI](prepared-midi-runtime.md) through the same public
library, compiler Worker, audio owner and Rust plan. The full port stays active.

## Review

- [Live four-layer graph](https://wubulon.tailfac9f9.ts.net:4174/prepared-loops.html):
  record, play, overdub, reverse, speed, and an authored Distortion insert.
  Stop recording and overdub before saving; playback may continue during save.
- **Load the recorded project** reopens four measured takes in a fresh engine.
  [Download the editable graph and PCM](../../web/public/prepared-loops/2026-09-30-prepared-loops-v3/saved-project.json).
  Loop 1 is renumbered to 170 through its stable path; loop 2 retains reverse
  and speed 1.33.
- [Edited WAV](../../web/public/prepared-loops/2026-09-30-prepared-loops-v3/edited.wav)
  and [reference WAV](../../web/public/prepared-loops/2026-09-30-prepared-loops-v3/reference.wav):
  manual playback, one player; playing recordings closes live audio.
- [Measured report](evidence/2026-09-30-prepared-loops-v3.json),
  [playing UI](evidence/2026-09-30-prepared-loops-v3.png),
  [served artifact/live-save proof](evidence/2026-09-30-prepared-loop-deliverables-v2.json),
  [reopened review](evidence/2026-09-30-prepared-loop-deliverables-v2.png).
- [Independent installed library app](https://wubulon.tailfac9f9.ts.net:4174/importable-loop-library/),
  [its actual signal/live-save/edit proof](evidence/2026-09-30-installed-loop-library.json)
  and [playing capture](evidence/2026-09-30-installed-loop-library.png).
  The outside-checkout Vite consumer installs the tarball, passes strict TS,
  reopens the four measured takes, publishes insert/remove edits, saves exact
  PCM, rejects an interrupted snapshot and leaves no Workers after close.
  [Source, lockfile, build manifest and tarball](../../web/public/importable-loop-library/)
  are retained. Tarball SHA-256:
  `ab0788fa27e4ccbfb27e0650558e169f3fc1d7f728b4a89b5bff8addebe67751`.

## Public composition and capabilities

`@manifold/author/examples/loop-authoring` composes Oscillator, Fixed Gain,
four LoopCapture nodes, Mixer9, RetrospectiveCapture and Output. It reuses
`addFourLayerLoopSources` and `createFourLayerLoopController`, disabling Sample
source registration for this audition. The normal Rack helper still registers
its four Sample sources. There is no bespoke DSP processor or new Main path.

Actual catalog constructors: Fixed Gain 4, LoopCapture two seconds,
RetrospectiveCapture 30 seconds; mixer master 0.25. This is an ordinary public
graph audition, not Main's quantized transport, seek/scrub or full instrument.

Prepared ABI is now **3**, normal Wasm ABI remains 5. The prepared host supports
19 kinds: the previous 17 plus LoopCapture and RetrospectiveCapture. It accepts
LoopCapture PCM assets and exposes `snapshotLoop()` and `captureCursor()`.
Sample assets/bindings, directional Main state, capture-window publication and
other resource operations still reject explicitly.

## Ownership and control intent

`ExecutionPlan::transfer_owned_loop_history` takes exclusive access to both
plans and a prepared ID/control table. Sample rate, ring capacity, capture mode
and active staging determine eligibility. An eligible LoopCapture swaps its
entire owned storage and history. The candidate receives PCM, write/start and
playback cursors, revision, transport and smoothing. The retired plan receives
the candidate's prepared buffers, which the compiler destroys later. No PCM
copy, allocation or buffer destruction occurs in publication.

Seven loop targets read back actual Rust state. The control side prepares
which candidate values were unchanged from its accepted baseline. Those
inherit the latest old targets at publication; explicit edits stay candidate
owned. Apply that intent **after moving the take**: applying play to an empty
candidate would stop playback, while reapplying record incorrectly could clear
the take. Unchanged controls avoid those transitions; changed values use the
ordinary LoopCapture setters.

Stable named path and kind allow numeric renumbering, with numeric fallback
for unnamed instances. Resource compatibility separately compares saved asset
presence, rate, frame count and canonical PCM payload outside audio. Labels
and numeric IDs are not PCM identity. Changed or removed assets exclude that
take from history transfer. Incompatible rate/capacity/mode or active staging
also prevent transfer; they do not promise seamless continuation.

The Worker decodes and loads assets, restores declared loop controls and then
relinquishes its candidate. It never reads active audio state. Only the audio
owner swaps live resources. The parameter bank reports actual post-transfer
targets; there is no second editable loop state model.

## Bounded stable-take save

`snapshotLoop(id)` reads a stopped, non-overdubbing take while playback can
continue. The owner returns length, publication ID and revision, then copies
at most 2,048 stereo frames per control message through existing Wasm scratch.
JS transferable buffers are assembled on the main thread. Every chunk and
the final response revalidate ownership, revision and the recording/overdub
gate, including empty takes. A concurrent change rejects the whole request
instead of combining different takes. `project.snapshot()` uses the existing
`snapshotWithLoopAudio` helper to embed the four takes in a portable graph.
This is not a frozen snapshot of actively written PCM. JS port handlers still
allocate; their GC and message latency remain unmeasured performance gates.

## Evidence and scope

All audio probes use a verified private null sink and headless Chromium;
physical H6/speaker routes and desktop focus are untouched.

| Case | Observed result |
| --- | --- |
| Native wrapped recording, playback and overdub | Exact subsequent PCM after storage transfer; speed 1.33, reverse and mix 0.7 match equivalent reference edits |
| Native allocator tracking | Zero allocations and frees during tested transfer/processing blocks |
| Native retrospective ring | Cursor preserved across renumbering; rate/capacity changes and active staging prevent transfer; old staged PCM remains correct |
| Actual browser UI | Record layer 1, insert while recording, stop recording, play and close |
| Paired browser audio | **73,088 stereo frames**, 48 kHz, maximum difference 0, zero differing samples, peak 0.8 |
| Structural edits | Four insert/remove edits while recording, eight while playing, two while overdubbing, one renumber; 16 publications including initial load |
| Four take comparisons | Each 20,992 frames; exact PCM equality, including the overdubbed layer |
| Capture history | Cursor stays 53,504 of 1,440,000 frames through suspended-boundary publication |
| Callback ownership | 571 Rust calls for 571 blocks; zero callback allocations, frees or failures; arena 32.5 MiB |
| Explicit clip replacement | New 32-frame take retained exactly; a three-second asset rejected by the two-second ring leaves the accepted clip intact |
| Fresh saved-project reopen | Four identical takes and play flags; actual signal peak about 0.7896 |
| Live save and concurrent change | Saved PCM equals all four served assets; delayed chunk plus real overdub rejects with `Loop changed during snapshot` |
| Artifact/player verification | Identical served WAV hashes, format and frame count; eleven capsule hashes verify; one player/no autoplay; no compiler Workers after close |

The twelve timed insert edits measured total request-to-accepted publication:
min 11.355 ms, median 14.6725 ms, max 23.595 ms. The two overdub edits and
renumber have diagnostics but no separate wall-clock timing. This short proof
does not establish sustained deadlines, hardware output latency or matched
C++/Rust/Wasm performance. Rust counters exclude JS GC.

### Loaded-project latency and subsequent validation fix

The [loaded-loop authoring follow-up](loaded-loop-authoring.md) removes repeated
validation of identical encoded payloads. Thirty saved-project edits now measure
23.55 ms median and 39.885 ms maximum; a new exact paired audio proof is retained.
The earlier measurements below stay as evidence. Full performance gates remain open.

The installed consumer's last loaded-project edit took **901.705 ms**, with
84.94 ms Worker preparation. Batching UI readback alone still took 446.08 ms
([retained run](evidence/2026-09-30-prepared-loop-batched-ui.json)). These are
four embedded takes, unlike the initially empty graph used for the short paired
recording. Do not use its 11–24 ms edit timings for loaded projects.

The [first focused profile](evidence/2026-09-30-loaded-loop-validation-profile.json)
then measured 1,211.515 / 2,318.8 / 1,681.65 ms total. Main-thread `fromProject`
validation accounted for 93.26 / 250.005 / 390.56 ms; Worker preparation was
87.665 / 159.415 / 214.245 ms. My earlier suspicion that trusted forks decode
PCM was incorrect: `GraphWorkspace.fork()` already shares validated immutable
asset records. External-project validation calls `decodeSampleAsset` again.

The UI also rendered about 900 KiB of base64 PCM text every refresh. It now
shows graph/take metadata, preserving full PCM in the exported project and
download. The [follow-up profile](evidence/2026-09-30-loaded-loop-summary-ui-profile.json)
measures **200.93 / 188.975 / 180.56 ms**, with one main validation call per edit
(88.665 / 85.24 / 81.72 ms) and Worker preparation 87.665 / 82.065 / 82.865 ms.
The displayed graph is 5,789 characters. Publication context-frame offsets
correspond to roughly 171–192 ms from the request. These small, separately run
profiles are not controlled hardware benchmarks or sustained latency bounds.
Both slow runs remain; the installed artifact retains its earlier UI.

The [current live review](evidence/prepared-loops-summary-review.png) shows
the metadata display while the four loaded takes play.

The next task at this checkpoint was repeated validation of unchanged immutable payloads and Worker
asset preparation. Keep metadata/canonical-encoding/nonfinite validation
correct; do not use a mutable decoded buffer as a cache authority. Investigate
skipping redundant candidate asset loads only when owned-history transfer is
guaranteed, including capacity/staging failure policy. Current loaded-project
latency does not meet a demonstrated realtime graph-compilation gate.

Checks: **485 Rust tests**, **56 web tests**, strict author declarations,
normal/shared Wasm and production web builds pass. Eleven recording-time
source/Wasm files remain in `measured-source/`. Later formatting and review
controls do not replace them. The later deliverable proof checks live save and
the served capsule independently.

The packed successor builds after Rust formatting; its shared Wasm SHA-256
`66eacaaceb4e03a4dfd195a0592963a266ba087427bc7c387326ff7f5f48fdec`
differs from the retained recording-time binary
`2da5cd90b00a027f272fe9c2f7a9c2efd97df8c853027b21c50e6bb46f04963f`.
The independent app tests the later build; earlier paired PCM is evidence for
its archived binary and sources, rather than a claim about a substituted hash.

### Retained failures and constructor gap

The first two browser attempts retain failures and source capsules under
`web/public/prepared-loops/2026-09-30-prepared-loops/` and `…-v2/`. My audition
mistakenly treated Fixed Gain as having a mutable parameter and Mixer9 as
exposing individual channel parameters. The catalog supports neither; the
corrected composer uses the constructor and mixer master. No audio was
measured in those startup failures.

Two attempted constructor overrides were ignored because `GraphWorkspace.add`
currently accepts only `id`. The v3 graph uses actual catalog gain 4/capture
30 seconds, recorded in JSON. Those unused fields are removed; direct node
comparison confirms current constructors equal the recorded graph. Follow-up
must reject unknown options and expose bounded configuration through the
shared Rust/JS contract. Callers must not silently believe capacity changed.

The first deliverable probe retains a failed exact assertion on a range input:
it displays 1.33 at its 0.01 step, while Rust stores f32 1.3300000429. The
corrected UI assertion allows its declared display precision. PCM comparisons
remain exact.

## Next tasks and full-port gates

1. Integrate the same owned loop protocol with native control/audio and
   VST3/CLAP publication; their ordinary loops still need live continuity.
   Prove loop controls racing preparation, save/reopen and real callback heap
   behavior. Audit asset transport restoration: this Worker restores all loop
   controls after load; native/direct browser loaders currently restore play.
   The linked validation follow-up improves the tested loaded project; finish
   the wider resource authoring workloads before closing performance gates.
2. Expose constructor configuration with generated bounds in Rust, JS/TS and
   readers; reject unknown options. Capacity changes need resource reset policy.
3. Add prepared SampleRegion/SampleInstrument, capture staging and live source
   changes with held-source ownership and deferred destruction. Recover actual
   Rack Sample behavior instead of creating another project audio processor.
4. Move Main's full synth, dry/monitor, capture selection and quantized four
   layers through the public graph. This does not close Main M2 or UI/state gates.
5. Finish egui, the legacy inventory, native/DAW product behavior, MIDI output,
   failure/quarantine/retirement, long-run memory/GC/snapshot scheduling and
   matched full-project C++/Rust/Wasm benchmarks. Full goal remains active.

Reproduce with fresh labels, preserving existing evidence:

```sh
MANIFOLD_PREPARED_LOOP_PROOF_LABEL=your-new-label \
  python scripts/with-private-null-audio.py node scripts/verify-prepared-loops.mjs
MANIFOLD_LOOP_DELIVERABLE_LABEL=your-new-deliverable-label \
  python scripts/with-private-null-audio.py node scripts/verify-prepared-loop-deliverables.mjs
```
