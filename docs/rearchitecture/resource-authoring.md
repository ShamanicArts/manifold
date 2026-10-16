# Constructor configuration and Rust PCM authoring

30 September 2026, change `kszptryt`, parent `tuyprmmv` (`19430620`).

This task opens the existing shared graph contract to structural resource
configuration and Rust PCM authoring. It does not add a project-specific DSP
path. The next task is prepared Sample resource publication through that contract.
Main M2 and the complete port remain active.

## Usable builds and proof

- [Live capacity editor](https://wubulon.tailfac9f9.ts.net:4174/prepared-loops.html):
  load the recorded project, start audio, choose a capacity and rebuild a layer.
  A changed capacity rebuilds from its authored clip and controls. Save an
  unsaved live take first; changing the constructor is an explicit resource reset.
- [Native/Wasm recordings and Rust/JS projects](https://wubulon.tailfac9f9.ts.net:4174/configured-resources/2026-09-30-rust-js-resources-v3/).
  Both languages independently reauthor the real saved four-loop and Rack Sample
  graphs. The page has manual players and the raw numeric/source report.
- [Live browser report](evidence/2026-09-30-resource-authoring-browser.json),
  [capacity editor screenshot](evidence/2026-09-30-resource-authoring-browser.png),
  [audio review screenshot](evidence/2026-09-30-resource-authoring-browser-audio.png).
  All four 20,992-frame saved takes survive rebuilding and save exactly. A 0.05 s
  capacity fails because the saved take does not fit; the accepted 3 s graph
  remains audible and accepts later inserts and snapshots. An oversized ring
  request rolls back before Worker preparation. No callback heap events,
  processing failures, page errors or remaining Workers are observed.

## Contract decision

Constructors describe structural resources and immutable coefficients. Runtime
targets remain parameters. Named configuration is generated from Rust metadata,
while existing `a`/`b` fields remain the serialized ABI representation. This keeps
old documents and IDs intact without offering two ways to author the same live
transport or modulation target.

| Primitive | Public configuration | Bounds | Serialized field |
| --- | --- | --- | --- |
| Loop Capture | `capacitySeconds` | 0.05–30 s | `a` |
| Retrospective Capture | `capacitySeconds` | 1–120 s | `a` |
| Fixed Gain | `gain` | 0–4 | `a` |

Other constructor arguments retain their catalog defaults. Their existing live
parameter APIs remain available. Defaults are unchanged. Unknown fields,
nonfinite/out-of-range values and duplicate Rust configuration fields reject
before mutating the author document. The native reader checks raw f64 bounds
before constructing f32 kernels and still requires the exact serialized argument
keys. Generated metadata reports configuration defaults and bounds for humans
and agents; TypeScript checks known constructor names and runtime validates
dynamically discovered nodes.

```js
const loop = graph.add('loop-capture', {
  id: 70, config: { capacitySeconds: 3 },
});
graph.setParameter(loop, 1, 1); // play is a parameter
await project.session.transaction(next => {
  next.configure(next.findInstance('/rack_host/layers/1/loop'), {
    capacitySeconds: 5,
  });
});
```

```rust
graph.add_with_config(70, "loop-capture", &[("capacitySeconds", 3.0)])?;
graph.configure(70, &[("capacitySeconds", 5.0)])?;
graph.set_sample_asset(70, &stereo, 48_000, "authored take")?;
```

The core checks a **128 MiB per-plan stereo capture ring budget** before any
kernel allocation, using the actual f32 sample-rate/capacity product and rounded
frame count. Parked nodes count conservatively. Rust `capture_ring_bytes` and JS
`captureRingBytes` expose the same calculation; browser preparation performs the
check before dispatching a candidate. This budget covers ring PCM only. Staging,
loaded assets, other kernels, scratch, simultaneous old/new plans and host memory
limits are additional costs; this is not a total-memory or realtime guarantee.
The generated catalog exports `GRAPH_RESOURCE_LIMITS`.

## Rust assets and bindings

Rust `GraphWorkspace` now imports `assets` and `sampleBindings`, including empty
arrays, through the existing native document validator. PCM records are private
immutable `Arc<Value>` resources, so graph clones share encoded payloads rather
than copying their strings. Export and native preparation still validate/decode
resources on control; their large-payload cost is not optimized or measured here.

The public API adds `set_sample_asset`, `remove_sample_asset`, `bind_sample_asset`
and `unbind_sample_asset`. Caller PCM is copied into the portable canonical
little-endian f32 asset; later caller mutation cannot affect it. Setting invalid
PCM, assigning an owned asset to a bound region or binding an unowned/incorrect
source rejects. Removing a source or its asset removes affected shared bindings.
It uses the same native asset byte budget. Existing native project/document size
limits still apply; no larger host resource capability is promised.

The actual authored eight-voice Rack Sample document, its one owned PCM asset,
seven shared bindings and controls round-trip through Rust exactly. Tests replace
one binding with independent PCM, mutate the caller, rebind it, and remove the
source. A configured loop records 3,072 frames into a 2,400-frame ring, saves the
last 2,400, and reopens the expected chronological playback. Native and direct
Wasm tests both check that wrap boundary; measured native callbacks allocate and
free nothing.

Rust authoring still rejects capture-window/registry/sidechain metadata outside
its existing supported signal subset. Temporal/directional resources and their
authoring methods remain open; ordinary PCM support does not complete all of R01.

## Real startup mismatch found and corrected

The first native/Wasm loop comparison failed with a maximum difference of
**0.3859488964**. Native preparation applies authored targets and settles core
processing state before loading assets. Wasm applied unavailable constructor
targets after preparation but left the saved loop speed ramping from 1 to 1.33.

The thin additive `manifold_graph_reset_processing` ABI operation invokes the
existing core `ExecutionPlan.reset_processing` on the newly prepared TLS engine.
Direct AudioWorklet, normal Worker and prepared compiler now call it after initial
controls and before resource loading. It runs during preparation; no reset or new
DSP rule was put in the audio callback. Both normal and shared-memory Wasm builds
were rebuilt. Numeric ABI versions remain 5/3; this is an added internal operation,
and the matching package adapter/Wasm pair is required.

The [failed comparison](../../web/public/configured-resources/2026-09-30-rust-js-resources/failure.txt)
retains native project/PCM and the actual failed Wasm binary and pre-fix adapter.
The [second probe](../../web/public/configured-resources/2026-09-30-rust-js-resources-v2/failure.txt)
passed the loop case but exposed an incomplete test setup: Sample voice gains
were still zero. The final probe uses the actual public Rack Sample controller
to open voices 1 and 8; Rust applies the matching authored controls and gains.
Note events occur at offset 16. Failures were retained, not warmed away or hidden
by increasing tolerance.

## Signal comparison

| Reauthored graph | Stereo frames | Differing scalar samples | Maximum absolute error |
| --- | ---: | ---: | ---: |
| Four saved loops, 3 s capacities and fixed gain 0.25 | 8,192 | 0 | 0 |
| Actual eight-voice Rack Sample, voices 1 and 8 at gate 0.8 | 8,192 | 12 | 1.4901161193847656e-8 |

Both Rust and JS independently create equal parsed documents, including PCM,
shared bindings, constructors and controls. The comparison uses release native
Rust rendering and the normal Wasm AudioWorklet adapter under Node, from sample
zero. It is not browser callback timing, legacy C++ parity or a performance
benchmark. The eight-voice topology has two sounding voices in this scenario.
The report archives ten measured source/binary files and their hashes. The browser
checks every served capsule hash and all four WAV frame counts and exercises
single-player playback.

Final checks: **495 Rust tests**, **68 web tests**, strict TypeScript, generated
catalog/three JS bundle/two project-package checks, normal/shared Wasm builds,
production web build and Linux CLAP/VST3 bundles. Test and build logs are retained
beside this report. Actual exported plug-in/DAW resource scenarios remain open.
[Workspace log](evidence/2026-09-30-resource-authoring-workspace.txt),
[web/TS/package log](evidence/2026-09-30-resource-authoring-web.txt),
[normal Wasm build](evidence/2026-09-30-resource-authoring-normal-wasm.txt),
[shared Wasm build](evidence/2026-09-30-resource-authoring-prepared-wasm.txt),
[CLAP build](evidence/2026-09-30-resource-authoring-clap.txt),
[VST3 build](evidence/2026-09-30-resource-authoring-vst3.txt) and
[current binary hashes](evidence/2026-09-30-resource-authoring-builds.json).

```sh
node scripts/verify-configured-resources.mjs your-new-label
MANIFOLD_RESOURCE_REVIEW_LABEL=your-new-browser-label \
  python scripts/with-private-null-audio.py node scripts/verify-resource-authoring-browser.mjs
```

## Next work

1. Extend prepared Sample Region/Instrument resource loading and compatible
   live replacement, shared PCM ownership and voice history; use the actual
   Rack Sample controller and retain state/audio evidence during live edits.
2. Finish Rust capture registry/window/sidechain and temporal/directional authoring
   so it can import the wider shared contract without discarded metadata.
3. Run the new public resource/configuration packages through exported plug-ins
   and actual native/DAW lifecycles. Complete native JS live snapshots, host
   capability/resource budgets and sustained failure/retirement cases.
4. Continue full Main authored composition and egui presentation, the remaining
   legacy inventory, actual C++ comparisons and matched host performance.

No Main or complete-project migration gate is closed by this work.


Follow-up: [prepared Sample publication](prepared-sample-publication.md) implements
and proves the bounded resource-publication part of next-work item 1. Its live
library consumer, recordings and explicit remaining gates supersede that handoff.
