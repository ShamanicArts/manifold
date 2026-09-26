# Checkpoint 110 — sample phrase contour on Add/Morph

The [playable Main sample blend](http://127.0.0.1:4173/?primitive=main-sample-blend) now has **Sample phrase contour** and **Phrase reference** controls. The [HTML review](http://127.0.0.1:4173/main-sample-blend-review.html) shows the route and nine comparison cases.

The original Main voice sends raw `samplePlayback` to `sampleEnvFollower` while the vocoder processes the audible sample branch. In Add/Morph modes, Lua reads the follower and sets `addPhraseGain` to `1 + (clamp(envelope / reference, 0, 3) - 1) * amount`. The reference comes from source analysis RMS, clamped to 0.05–0.6. The old follower uses 5 ms attack, 80 ms release, sensitivity 2, 40 Hz highpass, and peak mode. These facts come from `UserScripts/projects/Main/lib/sample_synth.lua` in the original project.

The v2 [graph](../../projects/main-sample-blend/project.json) sends raw sample playback to a typed EnvelopeControl node and sends its control output to the new prepared [PhraseGain kernel](../../crates/manifold-core/src/phrase_gain.rs) on the Sine bank branch. The sample branch still passes through the phase vocoder. The gain formula matches the old Main helper, with a per-sample control signal and 10 ms smoothing of live amount/reference changes. The browser initializes reference from the Rust worker's source RMS and allows a manual override; restored states keep their saved reference. Amount defaults to zero, preserving previous Main study output and old saved states. No audio callback allocation was added.

## Measured evidence

- The original compiled C++ `EnvelopeFollowerNode` processed the same 48 kHz source with the Main settings. Its 128 block meter snapshots match the follower meter inside the direct Wasm Main graph exactly for this fixture. The [Main capture manifest](../../web/public/reference/main-sample-blend/manifest.json) includes the C++ meter file and source hash. This proves the detector route for the fixture, not full old Lua voice timing.
- Nine 16,384-frame native Rust ↔ direct Wasm Main audio captures pass. The four original dry branch cases and the two new full/half phrase cases match sample for sample. The three wet vocoder cases remain within 3.68e−6 maximum absolute difference. Full phrase contour produces 0.3580 RMS versus 0.1200 RMS for the unshaped Morph fixture; half contour produces 0.2389 RMS.
- The AudioWorklet verifier starts the Main graph, sounds both branches, changes phrase amount while running, and reads a phrase gain between 1.5 and 3. The headless Chromium flow opened a version-1 six-control state, rebuilt its Morph target, supplied neutral defaults for the new controls, and started playback at 48 kHz.
- A fresh Chromium Main view applied the Rust worker's measured RMS to the phrase reference control (0.15 for the built-in source). A version-2 11-control state retained its saved vocoder value, supplied neutral phrase defaults, rebuilt its target, and also started playback. All nine comparison cases displayed “Match.”
- All 118 Rust workspace tests pass. Version-3 state roundtrips all 13 controls and migrates both version-1 six-control and version-2 11-control files. Wasm and web production builds pass.

## Boundary

The old Lua voice queries the follower and updates the gain at control block rate; v2 applies the same formula per sample. The C++ follower capture and native/Wasm graph captures are distinct comparisons. The authored study still needs note ADSR envelopes, directional crossfades, polyphonic voice routing, and the old Main preset format before it can claim complete project parity. The next graph slice should build note-gated voice envelopes and the old branch selection around these prepared paths.
