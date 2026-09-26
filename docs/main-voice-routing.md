# Main voice route reconstruction

Source: `UserScripts/projects/Main/lib/sample_synth.lua` and `UserScripts/projects/Main/dsp/midisynth_integration.lua` in the original `my-plugin` checkout. This note distinguishes the old live graph from the authored v2 Main study.

## What the old voice actually connects

| Old route | Sources | Selection and gain | v2 status |
| --- | --- | --- | --- |
| Normal base | Standard oscillator; sample playback through phase vocoder and `sampleBlendGain` | `mixCrossfade`, curve 1, position `2 × blendAmount − 1` | One equal-power crossfade, checkpoint 111. The sample stage gain is explicit, checkpoint 114; the shared voice-amplitude control and old oscillator features still differ. |
| FM/Sync base | Same two sources, then a second `directionCrossfade` | `basePathSelect` picks this branch for modes 2/3. A per-block update changes frequency/sample speed or retriggers sample. | The raw sample → oscillator hard-sync input is ported and isolated against C++, checkpoint 116. Mode selection, speed/frequency updates, and retrigger policy remain. A duplicate crossfade by itself would add no behavior. |
| Add/Morph branch | `blendAddOsc` and `morphWaveAdditiveGain` on crossfader A; `sampleAdditiveGain` on B | `addCrossfade` uses blend position for Add (mode 4), full B for Morph (mode 5). `addPhraseGain` follows it. | Two worker-prepared Sine banks now feed a crossfade and phrase gain. Recipes and old amplitude staging still differ. Morph's forced B endpoint remains manual in v2. |
| Branch mix | Normal base, ring branch, Add/Morph branch | In Add/Morph, base gain `1 − depth` and additive gain `depth`; ring gain zero. In other modes, one branch is selected. | Two-bus Rust mixer can link the depth targets atomically or restore independent audition gains. Old three-bus mode selection remains. |
| Canonical output | `branchMixer` on `voiceMix` input 4 | Other direct voiceMix inputs muted; fourth gain one. | Authored study now uses a four-bus mixer with only input 4 active. C++ sample-only gain-chain captures confirm the two centre-pan stages. |

The old integration sets oscillator amplitude to `amp` and `sampleBlendGain` to `amp × 2`; sample-derived additive amplitude is also `amp × 2`. The old `MixerNode` and oscillator each have their own gain conventions, so full old-project audio comparisons require all these stages, not only matching crossfade positions.

## Next graph slice

1. **Done, checkpoint 112:** Prepare two simultaneous bounded partial sets outside the audio callback: wave/additive A and source/additive B. Keep node IDs explicit in the worker message.
2. **Done, checkpoint 112:** Put the two banks into the existing Rust `Crossfader` kernel, then feed its output into `PhraseGain`. Keep prior Main cases at the B endpoint and compare native Rust ↔ Wasm wave-only and midpoint captures. Exercise a live AudioWorklet position change.
3. **Done, checkpoint 113:** One depth parameter sets base gain `1 − depth` and additive gain `depth` as an atomic Rust mixer target update. Independent gains remain as explicitly labelled v2 audition controls. Depth 0, midpoint, and 1 have native Rust/Wasm graph captures, while full old voice gain staging still needs calibration.
4. **Done, checkpoint 114 for sample-only routing:** An explicit gain after the vocoder takes `amp × 2`; the base crossfade enters the linked branch mixer, which enters a four-bus voice mixer on input 4. Three compiled old C++ sample-only stage captures at amp 0.25, 0.5, and 0.75 match native Rust and direct Wasm sample for sample. This isolates the original stages; it is not a full old Main voice render.
5. **Done, checkpoint 115 for authored v2 routes:** Optional voice amplitude linking sends one bounded update batch: oscillator `amp`, sample stage `2 × amp`, and both prepared Sine banks `2 × amp` (clamped at 1 by the node). Unlinking restores separate audition controls. Five wave/Add/mixed native Rust ↔ Wasm graph cases match exactly, and the AudioWorklet responds on all three source paths. The old Add voice uses a waveform oscillator plus a spectral bank; the current dual prepared-bank study remains an approximation of that branch. Full old Main mode output has not been compared.
6. **Done, checkpoint 116 for the oscillator sync kernel:** An optional audio input on the Rust oscillator resets phase at a raw-sample rising zero crossing. The original compiled C++ OscillatorNode and native Rust graph match exactly over 16,384 frames on the common sync fixture. Two Main native/Wasm graph captures and a live worklet toggle exercise this route. In old mode 3, this kernel is enabled only if blend position is below zero.
7. Add FM/Sync per-block frequency/speed and retrigger behavior, then per-voice allocation and gate semantics. The old code reads `voice.adsr` conditionally but does not construct it in `createVoiceGraph`; any ADSR in v2 needs its own spec and test evidence.

The [Main review](../web/public/main-sample-blend-review.html) is the current playable checkpoint. The next slice should implement old FM/Sync mode updates and compare assembled voice output against old Main.
