# Loaded loop graph authoring

30 September 2026, change `wywppltq`, parent `uqypknxt` (`3fba0ec1`).
The [live public loop build](https://wubulon.tailfac9f9.ts.net:4174/prepared-loops.html)
now uses the updated importable authoring library. Load the recorded project,
start playback, then insert/remove the authored Distortion or change loop controls.
[Playing screenshot](evidence/2026-09-30-prepared-loop-bounded-validation.png).

## Change and ownership

`GraphWorkspace.fromProject` now validates portable PCM without constructing a
discarded Float32Array. Successful validation retains only the immutable encoded
payload string in a per-JS-realm FIFO cache: at most eight entries and 8 MiB of
UTF-16 payload storage, excluding small Map/object overhead. Larger payloads
validate normally without retention. IDs, rate, frame count, label and exact keys
are checked every time; changed bytes must pass canonical base64, byte-count and
finite-sample validation again. No decoded mutable buffer is cached.

Metadata fields are captured once. The graph retains an independent validated
record, so caller mutation or an accessor cannot change the payload after the
cache decision. Public `decodeSampleAsset` always produces fresh PCM storage.
Its byte conversion uses a direct loop instead of the previous per-character
`Uint8Array.from` mapper. The persistent compiler Worker benefits from the same
validation cache but still decodes and loads candidate assets. Resource history
transfer, compatibility checks and fallback assets retain their existing rules.
No compiler work or resource disposal was added to audio processing.

The generated native JS bundles and two project packages were rebuilt. Historical
installed-library archives and slow measurements remain unchanged.

## Measurements

The same four embedded 20,992-frame takes (671,744 decoded bytes total) and live
transparent insert/remove action were profiled at 48 kHz with 128-frame quanta.
These are small observational runs on this machine, not matched C++/Rust/Wasm
benchmarks or sustained deadline guarantees. The thirty-edit run was started
alongside final web/native checks; it is not an isolated hardware benchmark.

| Run | Request through accepted public action | Main project validation | Compiler preparation |
| --- | --- | --- | --- |
| [Previous metadata UI, three edits](evidence/2026-09-30-loaded-loop-summary-ui-profile.json) | 200.93 / 188.975 / 180.56 ms | 88.665 / 85.24 / 81.72 ms | 87.665 / 82.065 / 82.865 ms |
| [First updated probe, three edits](evidence/2026-09-30-loaded-loop-bounded-validation-profile.json) | 42.26 / 30.485 / 32.885 ms | 3.84 / 3.505 / 4.645 ms | 11.26 / 6.94 / 7.765 ms |
| [Final thirty edits](evidence/2026-09-30-loaded-loop-validation-30-edits.json) | median 23.55, p95 31.495, max 39.885 ms | median 1.96, max 2.695 ms | median 5.745, max 12.325 ms |

The last row uses empirical nearest-rank percentiles. Request-to-publication
AudioContext frame offsets were 10.667–21.333 ms. This is neither physical output
latency nor callback execution duration. Every observed edit reports zero Rust
callback allocations, frees and processing failures; JS GC remains unmeasured.
The final profile includes source/Wasm hashes and all raw edit diagnostics.
The cache is warm after loading; cold imports and payload churn still need their
own workload measurements.

## Signal and retained evidence

- [New paired recording proof](evidence/2026-09-30-prepared-loops-bounded-validation.json):
  **73,472 stereo frames exactly equal**, zero differing samples, across recording,
  playback, overdub, renumbering and sixteen publications. All four 20,864-frame
  takes match their reference and reopen exactly. Explicit 32-frame replacement
  and oversized-asset rejection still work. The take lengths differ from the old
  run because this browser recording is realtime paced.
- [Edited WAV](https://wubulon.tailfac9f9.ts.net:4174/prepared-loops/2026-09-30-prepared-loops-bounded-validation/edited.wav),
  [reference WAV](https://wubulon.tailfac9f9.ts.net:4174/prepared-loops/2026-09-30-prepared-loops-bounded-validation/reference.wav),
  [editable project](https://wubulon.tailfac9f9.ts.net:4174/prepared-loops/2026-09-30-prepared-loops-bounded-validation/saved-project.json).
  Thirteen measured source/Wasm files are archived with recording-time hashes,
  including the changed codec and authoring module. [Served artifact verification](evidence/2026-09-30-loop-validation-served-artifacts.json)
  checks all thirteen hashes, both identical WAVs and the downloaded four-take project.
- [Loaded-project/save/player proof](evidence/2026-09-30-prepared-loop-bounded-validation.json):
  two structural edits retain all four original served takes exactly; real
  overdub during snapshot rejects the interrupted save; zero callback heap
  events/failures; no Workers after close or page errors. The primary page keeps
  its earlier recordings and loaded project as stable review fixtures.

All automated browser audio used the verified disposable private null sink.
Seven new tests cover warm validation, changed and nonfinite payloads, metadata,
canonical padding aliases, decoded-buffer mutation, accessor capture, independent
records, eight-entry eviction and the byte-budget bypass. **63 web tests** and
**214 native/CLAP/VST3 tests** pass; strict TS, generated catalog/package checks
and the production build pass. The Rust DSP and Wasm ABI did not change here.

## Next work

This resolves the measured repeated-validation bottleneck for the tested saved
loop project. Full realtime compilation, larger resources, churn, JS GC,
failure recovery and matched host performance remain open. The next ownership
work is native/control/VST3/CLAP loop publication, including actual racing
controls and asset-load transport restoration. Constructor configuration and
prepared Sample resources remain necessary for full Rack/Main authoring.
Main M2 and the full-port goal remain active.

```sh
MANIFOLD_LOOP_PROFILE_LABEL=your-fresh-profile MANIFOLD_LOOP_PROFILE_EDITS=30 \
  python scripts/with-private-null-audio.py node scripts/profile-loaded-loop-authoring.mjs
MANIFOLD_PREPARED_LOOP_PROOF_LABEL=your-fresh-recording \
  python scripts/with-private-null-audio.py node scripts/verify-prepared-loops.mjs
MANIFOLD_LOOP_DELIVERABLE_LABEL=your-fresh-review \
  python scripts/with-private-null-audio.py node scripts/verify-prepared-loop-deliverables.mjs
```
