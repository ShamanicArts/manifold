# Scripted Sample release hosts

30 September 2026, change `wnmuzvyt`, following `sxonzprr` / `3e8bba78`.
This closes the Sample script event/batch handoff slice. The complete port,
Main M2–M5, egui and the full legacy inventory remain unfinished.

## Review

- [Live browser authoring and plug-in package recall](https://wubulon.tailfac9f9.ts.net:4174/native-sample-authoring.html).
  Choose a CLAP/VST3 saved Rack or Instrument package, Load, Start, then edit,
  replace PCM and download the complete package. Instrument needs Play for a note.
- [Release recordings, source, binaries, reports and REAPER render](https://wubulon.tailfac9f9.ts.net:4174/scripted-samples/2026-09-30-scripted-samples-release-v2/).

The browser now imports the actual bundled controller with the generic package
API. The loader requires `toProject()`; authored methods such as `set()`, `event()`
and `replaceSource()` belong to the project. Requiring `set()` prevented the
Instrument package from being portable. JS/TS host bindings now include optional
batch/event services, and TS consumers can name their controller interface.

## Implementation and ownership

`manifold-native` owns a bounded event mailbox and a fixed 16-edit parameter
payload. JS runs and prepares candidates on control. CLAP/VST3 merge a pending
script event into the prepared host event vector, sorted by offset, then
acknowledge it after rendering. Invalid targets/offsets reject without changing
the host's audio or saved state. Stops cancel unrendered events. Parameter
batches preflight every public target before the callback changes any target.
Control-side state staging decodes the project once per batch.

Events have their own completion generation and are never serialized as parameter
values. A multi-step gate call remains pending until its note finishes. The
worker retains each accepted intermediate snapshot, so rejection of a later note
preserves accepted gate intent. Shared publication verification checks that only
the acknowledged DSP mutation and existing controller values changed. Hosts merge
verified controller values without replacing audio-owned PCM or target readback.

Both hosts reject live parameter commands after deactivation, retain saved state
on rejection, and permit retry after reactivation. A CLAP admission discrepancy
was found and corrected before the final release recording. VST3 status polling
also retires replaced runtimes on control, including when subsequent edits are
only parameters or notes. No DSP algorithm was added to either adapter.

## Evidence

| Case | Evidence |
| --- | --- |
| Rack through release CLAP/VST3 and their exported SDKs | 24,704 stereo frames match native JS exactly; eight gates, 16-target batches, three-way unison, wet FFT, twelve unity edits and PCM replacement |
| Fresh Rack controller recall | 11,264 frames match native JS exactly and produce audible output |
| Instrument through all four paths | 41,088 recorded frames match native JS exactly; nine source publications, held/new notes, all-off and idle-slot reuse |
| Rejection/lifecycle | Invalid target/offset leaves audio/state intact; author can continue; stop between gate and note retains accepted gate; deactivated parameter rejection/retry passes in both hosts |
| Callback heap | Separate optimized Rust callback tests guard every render and observe zero allocations/deallocations |
| Browser recall | All four SDK-saved packages restore the same controller hash and PCM, play, accept new edits, export, and restart; Rust callback heap/failure counters zero |
| REAPER 7.79 Linux VST3 | The SDK-saved Instrument controller/PCM survives actual DAW save and reopen; 48,000 frames with MIDI at frames 6,000/24,000 differ from native by at most 5.96e-8 |

The exported SDK probes dynamically load the frozen release libraries, invoke
the public factory/process/state/script interfaces, and never open an editor or
audio device. Their allocator counters are `null`, because a host-side allocator
does not observe a shared library's private Rust allocator. They are separate
from the release callback heap guards. The recorded WAVs match byte-for-byte
across CLAP/VST3, direct callback and exported SDK paths. Reports retain source,
binary, recording and package hashes.

REAPER ran on a disposable Weston/Xwayland display with a verified private audio
server. Its process map identifies the exact archived VST3 binary. The native
reference uses the actual DAW-saved graph. This proves DAW package recall and
host MIDI, not DAW invocation of script calls. No physical audio routing or user
projects were modified. Runtime profiles stay outside the served evidence tree.
The first DAW harness attempt mistook creation of an empty ready file for
completion and stopped the host early; the retained failure explains the corrected
wait. The v2 DAW probe waits for its completed marker.

These comparisons are against v2 native rendering. They do not prove complete
C++ legacy project parity, browser/native numerical agreement, JS GC behavior,
real-time deadlines, multiple-instance stress or full product completion.
The DOM page is still a review harness; egui remains required.

Final gates: 510 Rust workspace tests, 70 web tests including TypeScript and
package/bundle checks, production web build, both optimized callback comparison
tests, both optimized inactive rejection/retry tests, exported SDK probes,
browser recall and the isolated REAPER render. The live capsule retains the
workspace and web test logs alongside its recording logs.

## Reproduce

```sh
cargo test --workspace
npm --prefix web test
MANIFOLD_SCRIPT_SAMPLE_LABEL=your-fresh-label python scripts/verify-scripted-sample-hosts.py
MANIFOLD_SCRIPT_SAMPLE_LABEL=your-fresh-label python scripts/with-headless-weston.py \
  python scripts/with-private-null-audio.py python scripts/verify-scripted-sample-reaper.py
npm --prefix web run build
MANIFOLD_SCRIPT_SAMPLE_LABEL=your-fresh-label python scripts/with-private-null-audio.py \
  node scripts/verify-scripted-sample-browser.mjs
```

The live review page currently selects the retained v2 capsule. For another label,
point its package options at that capsule before running the browser probe. The
DAW probe writes an additional folder; its render must be added to the review
page explicitly. Never reuse destinations. SDK source/binary recording enforces
unchanged sources during the probe; generated browser screenshots/reports must
be copied into `web/dist` after verification or included by a subsequent build.

## Next task: advance authored Main composition

The current infrastructure can author graphs, mutate them while rendering,
publish owned Sample/loop resources and recall project code across hosts. It is
now sufficient to begin a substantive Main M2 composition slice while recording
remaining capability gaps. This is not a claim that R01–R09 are complete.

Read actual legacy `Main/dsp/main.lua`, `looper_baseline.lua`,
`midisynth_integration.lua`, `voice_pool.lua` and their voice/module factories.
Port the authored dry/monitor/synth-send/four-layer/master branches and their
lookup/control identities through the public contract. Expose missing reusable
transport, voice and capture behavior as required by those actual branches.
Keep signal/state oracles and live creator evidence for each translated behavior.
Do not substitute the fixed `MainInstrument` or a new Main-only graph kernel for
the scripted composition. Complete Main M2–M5 and the 28-project inventory remain
the objective; remaining capture/source services, device lifecycle, egui and
performance work must stay tracked.
