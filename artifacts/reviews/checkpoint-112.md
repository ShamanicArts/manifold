# Checkpoint 112 — dual prepared additive sources

The [playable Main study](http://127.0.0.1:4173/?primitive=main-sample-blend) now exposes **Add wave ↔ source**. The [HTML review](http://127.0.0.1:4173/main-sample-blend-review.html) shows all fourteen audio comparisons, and the [sitrep](http://127.0.0.1:4173/manifold-sitrep.html) shows the wider reconstruction status.

The old Main `sample_synth.lua` feeds `addCrossfade` from a wave-derived additive source on A and sample-derived additive source on B, then sends that output through `addPhraseGain`. Add mode uses the mapped blend position; Morph mode forces B. V2 now has separate worker-prepared wave and source partial sets and two Sine bank nodes. They feed the existing equal-power Crossfader, whose output enters PhraseGain. The default position is B. The UI allows manual Add position even while auditioning Morph for comparison; old Morph's forced B endpoint is not yet enforced.

## Evidence

- Fourteen 16,384-frame native Rust ↔ direct Wasm Main graph captures pass. New Add wave-only audio has 0.0795 RMS and Add midpoint has 0.1254 RMS; both have zero maximum sample difference. Comparing this checkpoint's twelve earlier-case native files directly with checkpoint 111 shows at most 5.96e−8 sample difference from the added endpoint crossfade; the three wet vocoder native/Wasm cases remain within 3.68e−6.
- The Rust/Wasm analysis worker returns two separate bounded targets in one request when Main asks for them, each with its own transferred float buffer. The AudioWorklet accepts both partial sets at preparation and produces audible wave-only, midpoint, and source-only additive routes during live position changes.
- Original compiled C++ follower meters still match the Wasm Main graph meter exactly for the fixture. All 118 Rust workspace tests pass, as do the temporal-worker, Main AudioWorklet, state, and offline graph comparison checks. The production web build succeeds.
- Version-5 state roundtrips 18 controls and accepts v1 six-control, v2 11-control, v3 13-control, and v4 17-control files. Older files default to the source endpoint.

## Boundary

The bank recipes and sample-derived targets are authored v2 preparations, and old `blendAddOsc` has further oscillator settings. The old branch mixer links base and additive gains to one depth value; v2 still exposes independent gains. Old sample/oscillator amplitude staging, FM/Sync directional behavior, polyphonic voice routing, and preset migration remain. The legacy Main graph does not construct the optional `voice.adsr` it tests, so any v2 note ADSR must be specified as a new behavior. The [routing note](../../docs/main-voice-routing.md) records these boundaries and the next depth step.
