# Sine bank and spectral sample path — implementation map

The next wave 6 target is the old `SineBankNode`, which the Main sample synth uses for **Add** and **Morph** blend modes. The legacy node is more than a bank of oscillators: it accepts up to 32 partials with frequency, amplitude, phase, and decay fields; it retains up to eight unison phase sets; and it can derive partial targets from a sample playback object's analysis frames. The Main project also routes phase vocoder, sample playback, envelope, additive bank, and blend gains around it. Porting only a bare oscillator would leave the intended sample project behavior inaccessible.

## Boundaries

| Domain | Owner in v2 | Contract to establish |
| --- | --- | --- |
| Partial analysis and temporal frames | Rust/Wasm Worker, next to `sample_analysis.rs` | Produce at most 32 finite partials per frame, fundamental, confidence, source rate, and source region. File decode and analysis stay outside the audio callback. |
| Spectral target recipes | Rust control-side preparation | Manual partials; sample-derived Add; waveform/sample Morph with curve, depth, tilt, stretch, and temporal position. Precompute when a source or control changes. |
| Sine bank audio kernel | `manifold-core` graph node | Fixed 32 × 8 phase state; smoothed frequency, amplitude, detune, spread, phrase gain, and per-partial amplitudes; optional sync edge; drive and stereo pan. No callback allocation or lock. |
| Target publication | Browser host → AudioWorklet → Wasm | Versioned, bounded partial upload into preallocated storage; validate then commit between process blocks. A failed upload keeps the previous target. Parameters stay separate from bulk partial data. |
| Project composition | JavaScript project descriptor plus Rust graph | Sample playback, phase vocoder, additive branch, morph branch, envelopes, and blend gains with explicit routing and state. User controls may be JavaScript; no Lua runtime. |
| Inspection | Workbench | Playable manual partial bank, source and target partial bars, temporal position, unison/spread controls, output scope, and C++/Rust/difference playback. UI reads bounded snapshots and cannot drive sample timing. |

## Legacy facts to preserve or decide explicitly

- `PartialData::kMaxPartials` is 32; the sine bank has eight unison voices. `setPartial` writes frequency, amplitude, phase, and decay, and sets the active count to the highest written slot plus one. The old audio loop uses partial frequency, amplitude, and phase. The decay value is stored but is not applied in that loop; v2 should report this distinction before assigning decay a new meaning.
- `prepare` starts the current frequency and amplitude at target values, but resets smoothed partial amplitudes to zero. It uses 20 ms frequency, 10 ms amplitude, 12 ms detune/spread, 8 ms unison/phrase, and 5 ms partial amplitude smoothing. Phase is `f64`, with an explicit wrap, while audio accumulation is `f32`.
- The manual mode uses supplied partials. Add mode reads sample partials and normalizes frequencies to the source fundamental. Morph mode builds waveform partials and morphs them against sample partials. Temporal sample frames, shaping, and the driven Add flavor are part of the old contract, so the long path must include them.
- The old node reads a shared sample playback pointer during `process()` and can rebuild targets per block. V2 should use a prepared, fixed-size target snapshot. The analysis worker and control side may allocate; the audio callback may only copy or swap bounded prepared data between blocks.
- The node's optional input is a sync trigger: a nonpositive-to-positive crossing calls `reset()` and restarts phases. Inactive or disabled partial sets output silence. Source sample playback is a separate audio branch, not the sine bank's audio input.
- The sample synth creates separate sample additive and morph wave additive nodes, a phase vocoder, envelopes, and branch gains. The graph must expose those routes before an old-project parity claim is made.

## Comparison sequence

1. Capture isolated C++ manual-partial output for a single partial, a 32-partial spectrum, parameter ramps, disabled/empty states, sync, unison up/down, drive shapes, and stereo spread. Record native Rust, Wasm, and AudioWorklet differences and callback cost. This establishes the fixed audio kernel and partial upload path.
2. Extend the worker's source summary with partial/temporal frames and compare against the old analysis output on selected tonal and transient sources. Preserve the source region and confidence metadata alongside each capture.
3. Capture Add and Morph cases with the same sample analysis source, then replay the old Main sample synth branch selection and gain routing. Include source changes, temporal position, missing sample, and state roundtrip.
4. Integrate the phase vocoder branch and compare whole project scenarios before describing the Main sample synth as ported.

The first playable manual bank is an entry point into this path. The completion evidence is the composed sample project behaving correctly across Add, Morph, sample playback, and phase vocoder routes, with documented intentional differences and saved state.

## Manual-mode checkpoint

The [manual Sine bank workbench](../projects/sine-bank/project.json) now runs the fixed-capacity Rust node in Wasm and exposes 32 harmonic amplitude slots, unison, detune, spread, and drive. A bounded partial upload validates the complete set and commits it between process blocks; a rejected upload keeps the previous sound. The browser UI currently supplies harmonic frequencies based on 440 Hz and leaves arbitrary inharmonic frequencies, phase, and decay editing for a later target editor. The old node stores decay but does not apply it in manual audio rendering.

Nine [C++ manual-mode captures](../web/public/reference/sine-bank/manifest.json) compare native source output against direct Wasm and the AudioWorklet transport. They cover one, eight, and 32 partial slots; pitch movement; unison/spread; fold drive; sync; disabled state; and an empty bank. The [checkpoint 104 review](../artifacts/reviews/checkpoint-104.md) records the measured differences. This evidence is for the isolated manual bank, not for source-derived Add, Morph, temporal analysis, or the Main sample synth.

## Temporal-analysis checkpoint

The [checkpoint 105 review](../artifacts/reviews/checkpoint-105.md) and [browser comparison](../web/public/temporal-partials-review.html) cover source-derived temporal frames. A Rust/Wasm worker analyzes up to 128 frames with up to 32 partials each, and the Sine bank workbench can audition one selected frame. The original extractor's selected frequencies, levels, phases, RMS, and brightness match across tonal, broadband, transient, and silent fixtures. The C++ runner supplies a pitch decision, so this proves the extractor path given that decision; the old pitch detector and Add/Morph target recipes remain open.

## Prepared-target checkpoint

The [checkpoint 106 review](../artifacts/reviews/checkpoint-106.md) and [recipe comparison](../web/public/spectral-target-review.html) cover the old Add and Morph target helpers plus temporal selection. A dedicated Rust/Wasm worker prepares a target from the retained source analysis; the Sine bank workbench plays Source, Add self, Add driven, and Morph variants. Seventeen C++ cases match native Rust across 108 ordered partial slots. The old per-block source pull has deliberately become worker-side preparation and validated block-boundary publication. Full Main sample branch routing, phase vocoder, and state remain open.

The [checkpoint 107 review](../artifacts/reviews/checkpoint-107.md) introduces an authored [Main sample blend study](../projects/main-sample-blend/project.json): the same decoded source feeds stereo sample playback and worker-prepared Add/Morph Sine bank targets, mixed as two adjustable branches. Four native Rust renders and direct Wasm graph renders match exactly for the fixture source. The sample branch and prepared bank are now composed, while the legacy Main graph's phase vocoder, envelopes, directional crossfades, polyphonic voice structure, and saved state remain to be built and compared.
