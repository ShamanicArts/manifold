# Checkpoint 109 — Phase vocoder and Main sample branch

The [Phase vocoder workbench](http://127.0.0.1:4173/?primitive=phase-vocoder) plays a Rust/Wasm port of the original `PhaseVocoderNode`. The [HTML review](http://127.0.0.1:4173/phase-vocoder-review.html) summarizes the signal path and measured cases; its workbench comparison lets you hear and plot original C++ against the new output. The [Main sample blend](http://127.0.0.1:4173/?primitive=main-sample-blend) now routes sample playback through the vocoder before the sample/additive mixer.

## What moved

- The prepared [Rust kernel](../../crates/manifold-core/src/phase_vocoder.rs) supports bin mapping and time stretch plus resampling, ±24 semitones, 0.25–4× time, wet mix, and FFT orders 9–12 (512–4096). Stereo input/output rings, FFT arrays, twiddles, and windows are allocated when the graph is prepared. FFT size changes require graph preparation; the browser disables that control during playback.
- The [graph](../../crates/manifold-core/src/graph.rs), Wasm export, and AudioWorklet kind map accept type 62. The isolated [project](../../projects/phase-vocoder/project.json) has five controls and an offline C++ comparison. The [Main project](../../projects/main-sample-blend/project.json) adds the node on the sample branch and exposes five new controls alongside its six existing ones.
- Main study state is now version 2 with 11 controls. Version-1 six-control states open with vocoder defaults. The separate state verifier covers migration and invalid values.

## Evidence

The [capture manifest](../../web/public/reference/phase-vocoder/manifest.json) contains nine 48 kHz stereo cases, each 16,384 frames, produced by compiling the original JUCE node in a [standalone C++ harness](../../tools/legacy-phase-vocoder-reference.cpp). The [comparison report](checkpoint-109-phase-vocoder-comparison.json) records exact measurements. Dry bypass is exact. Bin-mapping C++ ↔ native Rust maximum difference is at most **4.44e−5** across unison, ±7 semitones, 512-point FFT, and 4096-point FFT. Native Rust ↔ direct Wasm is at most **1.85e−5**, and native Rust ↔ AudioWorklet is also at most **1.85e−5** across all nine cases. Browser Chromium comparison rendered nine selectable cases; the three stretch cases displayed “Intentional change,” and live oscillator playback started at 48 kHz.

The original stretch/resample loop advances its read cursor inside the stereo channel loop. This reads left and right at different times and advances the cursor twice per frame. Rust shares one cursor per frame. For the +7 semitone fixture, the measured right-channel error relative to the scaled left channel is **0.0449 RMS** in C++ and **1.72e−6 RMS** in Rust. C++ ↔ Rust maximum sample difference is therefore **0.374** in that case. The comparison presents this as a deliberate correction, not parity. Native Rust ↔ Wasm remains below **6e−6** across the three stretch cases.

Seven [Main blend captures](../../web/public/reference/main-sample-blend/manifest.json) now include dry sample, Add, Morph, blend, bin +7, stretch +7, and 1.5× time cases. Four dry native Rust ↔ Wasm outputs remain exact; the three wet cases differ by at most **3.68e−6**. The Main AudioWorklet verifier passed with the inserted dry node. All **116** Rust workspace tests passed, as did Wasm compilation, web build, state migration, and the new isolated AudioWorklet verifier.

A local Node Wasm timing probe on this machine measured the 4096-point wet node at up to **1.55 ms** in 1,500 observed 128-frame calls after warmup, below the **2.67 ms** 48 kHz callback interval. This is a local execution measurement, not a browser scheduling guarantee; the 2048-point default showed an observed maximum of 1.13 ms.

## Decisions and next boundary

The FFT is a small dependency-free radix-2 Rust implementation so the audio kernel can compile natively and to Wasm without JUCE. Analysis and synthesis buffers are fixed at prepare. The old stretch cursor bug is corrected rather than replicated. The Main sample path is still an authored v2 study: envelopes, directional crossfades, polyphonic voice routing, old Main project semantics, and preset migration remain open. The next reconstruction slice should add the old Main branch envelope and crossfade network around these proven sample and additive paths.
