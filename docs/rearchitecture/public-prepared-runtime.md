# Public prepared graph runtime

Checkpoint: 30 September 2026, change `ovmlsmmn`, parent `wlkrkwqo 03badb79`.
This implements an opt-in browser library runtime. The full project port,
Main M1–M5, egui presentation, and matched host performance remain open.

Successor change `pwukokyz` expands the public mode to fourteen kinds and fixes
endpoint-range inheritance. The [Rack oscillator follow-up](rack-oscillator-port.md#2026-09-30-live-prepared-runtime-checkpoint)
records actual browser controls and twelve topology edits with bit-identical
paired PCM. The eight-kind list and npm consumer below describe the original
checkpoint; its retained recordings and packed binary remain unchanged.

## Reviewable deliverables

- [Independent npm consumer](https://wubulon.tailfac9f9.ts.net:4174/importable-prepared-library/): install the packed library, start an authored graph, insert Distortion while sounding, inspect the accepted graph.
- [Two-project runtime review and four recordings](https://wubulon.tailfac9f9.ts.net:4174/prepared-worklet-prototype.html?execution=prepared).
- [Creator/package surface](https://wubulon.tailfac9f9.ts.net:4174/package-project.html?execution=prepared): open the retained saved packages and continue editing.
- [Independent consumer screenshot](evidence/imported-prepared-library.png) and [retained recording review](evidence/public-prepared-retained-review.png).

These are technical review surfaces. They do not close the egui product UI gate.

## Public API and ownership

```js
import { BrowserGraphHost } from '@manifold/author/browser';
import { createProject } from '@manifold/author/examples/dsp-live-scripting';

const context = new AudioContext();
const host = new BrowserGraphHost(context, { execution: 'prepared' });
const project = createProject(host);
await host.prepare(project.toProject());
host.connect(yourStereoAudioNode);
await context.resume();
await project.setDistortion(true);
await project.synchronizeParameters();
const savedGraph = project.toProject();
await host.close(); // relinquish audio ownership before closing the context
await context.close();
```

The default execution mode is unchanged. `prepared` uses one persistent compiler
Worker and one AudioWorklet per host. A shared Wasm arena contains explicitly
owned Rust engine handles. Each Wasm instance has its own TLS and stack. The
compiler validates and builds the candidate off callback, then stops accessing
it. The AudioWorklet claims it between blocks, transfers supported history,
renders the existing Rust `process_engine`, and acknowledges the old handle for
off-thread retirement. The compiler has no DSP render loop.

Supported kinds at this checkpoint: `input.raw`, `input.sidechain`, `output`,
`gain`, `fixed-gain`, `sum2`, `stereo-widener`, `distortion`. At most 128 identity
pairs, 512 initial parameter entries, and 16 updates per scalar batch are
accepted. Assets, sample bindings, directional graphs, timed MIDI, captures,
and other kinds reject explicitly. The broad authoring catalog is not yet the
prepared runtime capability set.

Serve both the document and compiler Worker with
`Cross-Origin-Opener-Policy: same-origin` and
`Cross-Origin-Embedder-Policy: require-corp`. Assets must satisfy the browser's
cross-origin isolation rules. The module imports shared memory; a normal Wasm
binary cannot be substituted. `preparedWasmUrl`, `preparedWorkletUrl`, and
`preparedCompilerUrl` allow explicit deployment URLs. Imported memory identity,
normal ABI version 5 and prepared ABI version 1 are checked at initialization.
`scripts/build-prepared-wasm.sh` rebuilds Rust std with atomics using nightly;
`npm pack` builds both normal and shared binaries.

## One accepted parameter authority

Rust getters read actual kernel targets. The AudioWorklet publishes them to a
double-buffered shared snapshot. Host and project snapshots adopt accepted f32
values before and after asynchronous commits; a JS mirror cannot override a
newer accepted DSP target.

Compatible named nodes match by instance path and type, even after numeric ID
changes. Unnamed nodes can match by numeric ID only if the old node was also
unnamed. An explicit empty identity map transfers no history. Candidate values
unchanged from the accepted baseline inherit the latest target at publication;
explicit candidate changes take precedence. Gain and Widener processing history
transfer is bounded. Other DSP state continuity remains open.

Scalar batches resolve logical identity again on the audio side, including
endpoint ranges; route changes require the current publication revision.
Suspended contexts can publish between callbacks without waiting for a render
that cannot occur. `close()` is asynchronous and idempotent: it relinquishes
AudioWorklet ownership before releasing compiler handles. Callers must await it.

## Evidence and limits

All browser audio probes used the private null audio wrapper. No physical
speaker or H6 routing was used.

| Proof | Observed result | Raw evidence |
| --- | --- | --- |
| Public lifecycle, automation during delayed preparation, named ID renumbering, explicit override, routes, rejection/recovery, suspended and cold load, close while context runs, close during preparation | Actual f32 targets adopted; old callbacks stop; pending edit rejects; no compiler Workers after close; no page errors | [Lifecycle v2](evidence/2026-09-30-public-prepared-runtime-v2.json) |
| Rename every instance while keeping numeric IDs | Zero histories transferred; constant-input mean changes from 0.175 to 0.02155 in the first resumed block, demonstrating a fresh Gain fade | [128-sample identity proof](evidence/2026-09-30-prepared-identity-reset.json) |
| DspLiveScripting, two hosts, 24 edits | Four-node final graph, zero recorded zero blocks in both streams; total edit p50 18.335 ms, p95 28.235 ms, max 28.985 ms | [Recordings and hashes](evidence/2026-09-30-public-prepared-recordings.json) |
| FX harness, two hosts, 24 edits | Fourteen-node final graph, zero recorded zero blocks; total edit p50 27.710 ms, p95 83.015 ms, **max 238.645 ms** | Same report; outlier retained |
| Saved packages and audio deliverables | Four WAVs load; both saved graphs restore exactly, gain 0.375; playback produces signal | [Deliverables](evidence/2026-09-30-public-prepared-deliverables.json) |
| Independent npm consumer, outside checkout | Public imports; four-to-five-node live change; audible signal; strict TS consumer compiles | [Consumer](evidence/2026-09-30-imported-prepared-library.json) |

The npm tarball SHA-256 is
`b7d530f403a4be888e593accaa86037e7d76fc243187f1c8cd12cdccffc68508`.
Its [tarball and standalone source](../../web/public/importable-prepared-library/)
are retained with the built app. The recording job retains eleven exact
source/package/Wasm artifacts under
`web/public/prepared-worklet-prototype/2026-09-30-public-prepared-recordings/measured-source/`.
The measured browser source corresponds to snapshot `52051f89`. ABI compatibility
guards and the Worker diagnostic discriminator were added after that recording;
the independent packed consumer verifies the later guarded build. The old
measured Wasm is retained, rather than replacing its hash with the new binary.

All four measured hosts report zero Rust processing failures and zero Rust
allocator/deallocator calls inside `process()`. The previous internal experiment
has a discriminating one-allocation/one-free negative control. These counters
do not cover JavaScript port-handler allocation or GC. Four short recordings
cannot establish sustained deadline safety, callback CPU percentiles, resource
leak bounds, or perceptual continuity. Rust workspace tests were running during
the public recordings; the latency outlier has no established cause. The old
Worker-rendering deadline failures remain linked in the review.

Checks: 481 Rust workspace tests, 56 web tests, both Wasm builds, production web
build, independent strict TypeScript compile, and the linked browser probes
passed. These are not a matched C++/Rust/browser performance comparison, nor a
new VST3/CLAP callback proof.

## Next work and open gates

Follow-up: [prepared timed MIDI](prepared-midi-runtime.md) adds three kinds,
atomic event queues and eligible voice/transpose history. Its legacy comparison
and installed consumer are separate evidence from this original eight-kind
tarball and four recordings. Earlier capability and benchmark numbers here
describe their measured checkpoint.

1. Expand actual kernel readback and eligible state continuity, then run an
   authored oscillator/control project through this public runtime.
2. Keep endpoint constraints correct during concurrent structural preparation;
   prove narrow-range publication cannot inherit an out-of-range old target.
3. Add timed events and resources through the same prepared ownership protocol;
   recover unlike Sample/Rack behavior without a separate project DSP path.
4. Prove fatal compiler/processor failure, cancellation and retirement timeouts;
   avoid freeing a possibly audible handle or reusing a poisoned shared arena.
5. Migrate Main voice/capture/looper composition and lifecycle via the public
   graph contract, preserving the legacy graph and state behavior.
6. Complete egui, the 28-project inventory, actual native/plug-in lifecycle and
   matched C++/Rust/Wasm benchmarks. Long-session counters, startup while another
   graph sounds, JS allocation, wider effect/voice/capture continuity and memory
   growth remain unmeasured.
