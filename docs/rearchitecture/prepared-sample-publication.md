# Prepared Sample publication

30 September 2026. Change `lqmkozqm`, parent `kszptryt` (`a3076149`).

This extends the shared Rust graph and public author API with live Sample and
vocoder resources. The complete port, Main M2–M5, egui presentation and legacy
behavior/performance gates remain active. No new project-specific DSP path was added.

## Open these builds

- [Authored Rack Sample](https://wubulon.tailfac9f9.ts.net:4174/rack-sample-eight-voice.html).
  Start, raise gates, choose vocoder/unison and insert/remove a unity dry Distortion.
  Replace shared PCM, lower/raise a gate to trigger it, and download/open the graph.
- [Independent installed library and runtime script editor](https://wubulon.tailfac9f9.ts.net:4174/importable-sample-library/2026-09-30-sample-library-v1/).
  Start two voices, edit/run JavaScript that changes their graph, and save it.
  This separate Vite project installs the packed `@manifold/author` tarball; its
  package/lockfile, source, build logs and tarball are downloadable there.
- [Recordings, saved graphs, reports and recorded sources](https://wubulon.tailfac9f9.ts.net:4174/prepared-samples/2026-09-30-prepared-samples-v5/).
  Seven manual players cover native, browser and Instrument source ownership.
  Only one player runs at a time. All automated playback used a private null sink.
- [Live editor screenshot](evidence/2026-09-30-prepared-samples-v5.png),
  [independent consumer](evidence/2026-09-30-imported-sample-library.png),
  [recording review](evidence/2026-09-30-imported-sample-library-recordings.png).

Save/open retains graph, PCM, targets and controls. Start retriggers saved gates.
Playback cursors and FFT rings are live continuity, not serialized saved state.

## Ownership and authoring changes

Core publication swaps Sample playback/unison histories and vocoder FFT rings;
it does not copy PCM/FFT buffers, allocate, lock or dispose resources in audio.
A preallocated compatibility scratch visits each compiled node/input once, avoiding
recursive audio traversal through reconvergent graphs. Identity lookups still
scan bounded tables; no overall realtime-performance guarantee is claimed.

Region identity requires matching effective authored PCM, including shared bindings.
Labels and numeric IDs do not define the sound. Source changes reset Regions and
incompatible downstream spectral tails. MIDI rewiring changes note ownership and
prevents carrying the affected voices. FFT order changes rebuild storage off audio.
Accepted new scalar targets remain candidate intent; unchanged targets can inherit
later automation from the old core at publication.

Instrument replacement has different resource semantics: held/releasing notes
finish on their old PCM, while subsequent notes use the newly prepared source.
The entire voice bank, playback objects, bend/serial state and retirement owners
move together. Preparation reserves retirement capacity for 32 subvoice sources
plus two spare owners. Unused sources move to the old plan for control retirement.
Idle subvoices are rebound before old retirement owners move, so later note-on
cannot free the last stale PCM Arc in the callback.

Native prepared adoption and shared-memory Wasm call the same core transfer.
Rust author sessions, native JS graph replacement, CLAP and VST3 already share this
adoption path. This does not establish native JS Sample event/capture services or
actual release plug-in/DAW lifecycle parity; those gates remain open.

Prepared browser execution now accepts Sample Region, Sample Instrument and Phase
Vocoder, owned PCM and shared region bindings. Decode/load/compile remain in the
persistent control Worker. Parameter target readback is separate from display
meters, including vocoder FFT order. Shared prepared ABI is **4**, normal ABI **5**;
matching adapters and binary are required. Other unsupported kinds and the existing
Worker capture-window service reject. This is 22 supported prepared kinds, not all
core kernels or every legacy project.

The public Rack controller resolves accepted instance paths instead of caching a
contiguous voice-ID layout. Gate events await admission; `activate()` returns a
Promise. Users can replace/renumber individual primitives while keeping the same
controller. Its public author module, parameters and topology remain inspectable
and editable. Review pages are temporary DOM harnesses, not the final egui UI.

## Actual evidence and its scope

| Probe | Stereo frames | Maximum difference | Scope |
| --- | ---: | ---: | --- |
| Native Rack | 32,640 | 0 | Eight wet vocoders, three-way unison, five complete bank renumberings |
| Browser Rack | 42,368 | 0 | Ten live insert/remove/noncontiguous-instance edits, then controller changes |
| Browser held Instrument | 24,576 | 0 | Eight PCM publications; held notes remain on old PCM |

Instrument new notes intentionally differ from the untouched old-source reference
(maximum difference 0.06229858286678791 in this run). The WAV contains both the
matching held interval and subsequent new-source interval. Its idle-reuse probe
consumes all eight new notes in 7,808 recorded frames after the old plan retires.
All measured Rust callback allocations, deallocations and processing failures are
zero. Region replacement stops output exactly, retrigger produces audio, save/open
produces audio, unsupported candidates roll back, and no compiler Workers remain.

The independent npm consumer starts 28 nodes, scripts a new gain to make 29, rejects
an invalid constructor without changing the accepted graph, downloads the saved
project and restarts with that scripted graph intact. Its measured RMS is
0.016750738016406624. Package SHA-256 is
`8de21ae914ef06c35d0d27da5c281895cdf43e6a451d9fde54a4365391cdcfbe`.
Both tarball Wasm binaries exactly equal the binaries retained with the v5 probe.
Twenty served source files are checked against their recorded hashes.

These are comparisons against untouched **v2** references, not C++ legacy parity.
Native/browser are not compared to one another in this new wet-voice recording.
Core failure counters and exact recorder PCM do not measure hardware underruns,
JS GC, callback deadlines, DAW timing, long-run reclamation or matched host speed.
Those claims require additional evidence.

Machine reports: [browser/native resources](evidence/2026-09-30-prepared-samples-v5.json)
and [independent consumer](evidence/2026-09-30-imported-sample-library.json).
The live recording page includes raw reports, WAVs, saved documents and the actual
source/binary capsule, hashed before the probe and rechecked unchanged afterward.

## Failures were retained and fixed

The v1 probe used an unsupported Playwright fill operation on a range input. V2
caught a review-page Stop reference to an out-of-scope diagnostics variable. V3
caught non-unity Distortion insertion: its default post gain is 0.8, even when dry.
The authored unity insert now explicitly sets both mix=0 and output level=1.
Their failure records/source capsules remain in the original v1–v3 directories.
V4 passed the recorded sound comparisons, but did not exercise idle reuse.

The subsequent idle-ownership audit failed with **16 callback deallocations** after
all-notes-off, source publication, old-plan retirement and reuse of every slot.
Rebinding idle subvoices while old owners are still held fixes that lifetime gap.
The final native test and v5 browser both cover it. Before/after native logs and
the old v4 source capsule are retained for inspection.

## Verification and continuation

Completed checks after the ownership fix: 499 Rust workspace tests, 70 web tests,
fresh normal/prepared Wasm, clean npm install, production web build and Linux
CLAP/VST3 bundle builds. Release bundles contain the shared adoption change;
passing a build does not prove their actual Sample DAW lifecycle.
[Durable logs and binary hashes](evidence/2026-09-30-prepared-sample-builds.json)
record those checks.

Reproduce with fresh evidence labels (existing recordings must stay immutable):

```sh
cargo test --workspace
./scripts/build-wasm.sh
bash scripts/build-prepared-wasm.sh
npm --prefix web ci
npm --prefix web test
npm --prefix web run build
MANIFOLD_SAMPLE_PROOF_LABEL=your-fresh-label \
  python scripts/with-private-null-audio.py node scripts/verify-prepared-samples.mjs
MANIFOLD_SAMPLE_CONSUMER_REVIEW=your-fresh-label \
  python scripts/with-private-null-audio.py node scripts/verify-imported-sample-library.mjs
```

Next work:

1. Prepared capture-window/free-capture publication and wider Rust registry,
   sidechain, directional and temporal authoring; preserve the legacy workflows.
2. Native JS Sample events/live resource services and actual exported plug-in/DAW
   lifecycle evidence, sustained retirement/failure and host budget gates.
3. Continue [Main M2–M5](main-recovery-ledger.md), the complete legacy project
   inventory, egui primary presentation, actual C++ behavior oracles and matched
   C++/Rust/Wasm performance. Keep those gates open until their evidence exists.

## BB restart recovery

The working-copy edits survived BB's restart; the tmux review server also survived.
Interrupted test handles were confirmed absent, then their gates were rerun to
completion. Source and evidence were described in Jujutsu throughout this recovery.
Recent system journal checks found no OOM kill; BB's crash cause was not established
by this task. This record and the retained artifacts make progress reviewable
independently of chat history.
