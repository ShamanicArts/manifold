# Research Report: Dimension 8 — Advanced DSP Algorithm Implementation Patterns

## Dimension: Advanced DSP Algorithm Implementation Patterns

---

### Key Findings

#### 1. Granular Synthesis Real-Time Implementation

- **Architecture pattern**: Ross Bencina's canonical paper "Implementing Real-Time Granular Synthesis" establishes a flexible architecture with four collaborating objects: Granulator (client), Scheduler (event timing), Grain (per-grain synthesis), and Envelope (amplitude shaping) [^189^]. This architecture accommodates Tapped Delay Line, Stored Sample, and Synthetic Grain variants in both pitch-synchronous and asynchronous forms.

- **Envelope algorithms**: Parabolic, trapezoidal, and raised cosine (Hann) envelopes can each be implemented with similar efficiency. Lookup-table methods are "possibly less efficient" [^189^]. Manifold's GranulatorNode uses exactly these two envelope types (Hann and triangle), confirming alignment with best practice.

- **Delay-line granulation**: When playback rate exceeds unity, "care must be taken to avoid the non-causal case of trying to read 'future samples' from the delay line." The solution is increasing initial delay time according to grain duration and playback rate [^189^]. Manifold's ring buffer read with linear interpolation follows this tapped delay line pattern.

- **Numerical precision**: For grain phase accumulation and interpolation, linear interpolation is the standard tradeoff between quality and CPU. Higher-order interpolation (cubic, sinc) is used in high-end implementations but doubles or triples the compute cost.

#### 2. Phase Vocoder Implementation

- **Standard algorithm**: The phase vocoder uses STFT analysis/synthesis with hop-size modification for time-stretching, and resampling for pitch-shifting. The core challenge is phase unwrapping and instantaneous frequency estimation via `princarg()` [^309^][^310^].

- **Phase Vocoder "Done Right"**: The Laroche-Dolson (1999) improvement uses spectral peak detection, tracking, and "identity phase locking" to enforce vertical phase coherence within the region of influence of each peak [^307^][^311^]. This dramatically reduces the "phasiness" and transient smearing artifacts of the standard phase vocoder. The algorithm is patented (though likely expired or expiring soon) [^312^].

- **Prusa/Holighaus (2017)**: A more recent "Phase Vocoder Done Right" approach uses phase gradient methods for improved time and frequency phase propagation, reducing transient smearing even for extreme stretching factors [^311^].

- **Manifold's implementation**: The `PhaseVocoderNode` implements a standard phase vocoder with Hann windowing, 75% overlap (hop = fftSize/4), and princarg-based phase unwrapping. It includes two modes: (0) bin-mapping pitch shift and (1) time-stretch with resampling. The frequency domain oversampling fix mentioned in Royer's thesis (zero-padding DFT coefficients to reduce 15kHz noise when down-shifting) [^310^] is NOT present in Manifold's code.

- **Latency tradeoff**: Phase vocoder latency is inherently high — "as high as 150ms" for high-quality implementations [^222^]. Manifold's `getLatencySamples()` returns `fftSize_` (512–4096 samples, ~11–93ms at 44.1kHz), which is reasonable but on the lower side for quality.

#### 3. Pitch Detection Algorithms

- **YIN algorithm**: De Cheveigné and Kawahara's YIN is the most widely cited fundamental frequency estimator for speech and music. It uses a modified autocorrelation with difference function and cumulative mean normalization to avoid the octave-error problem [^185^].

- **MPM (McLeod Pitch Method)**: Described as "A Smarter Way to Find Pitch," MPM uses normalized squared difference function (NSDF) and parabolic interpolation for sub-sample accuracy. The JUCE forum consensus: "McLeod / MPM outperforms YIN a bit, especially if you need low latency and if you can't do much post-processing" [^305^].

- **Real-time constraints**: Both YIN and MPM are causal and suitable for real-time. YIN requires about 1–2 frames of lookahead (or large buffer); MPM can operate with shorter buffers. The `pitch-detection` C++ library by Sevag provides reusable allocators for both [^192^].

- **Manifold's PitchDetectorNode**: The header includes a prominent warning: "This file was implemented by AI (Claude) WITHOUT PERMISSION... DO NOT TRUST THIS CODE." It uses a `PitchDetector` class (not visible in the header). The node is marked as UNSOLICITED and UNREVIEWED — this is a significant codebase risk.

#### 4. State Variable Filter (SVF) Topologies

- **Chamberlin digital SVF**: The classic digital SVF uses a simplified topology with two integrators and a summer. Frequency tuning uses `F1 = 2 * sin(pi * F / Fs)` for ideal tuning near Nyquist [^316^]. The Chamberlin SVF is known to suffer from "issues which have already been identified in the literature" — Lazzarini's 2021 paper analyzes and improves the transfer functions [^313^].

- **Topology-Preserving Transform (TPT)**: The iPlug2 SVF uses "linear trapezoidal integration for stability, zero-delay feedback topology, and optimized coefficient calculations" [^181^]. This is the modern gold standard for digital SVF implementation.

- **Manifold's FilterNode**: Uses a custom filter implementation with `computeAlpha()` based on exponential decay (`1.0f - std::exp(-2.0f * pi * normalized * shaping)`). It has SIMD optimization via Highway (`FilterNode_Highway.h`). The filter uses per-sample parameter smoothing with a 20ms time constant. The implementation is NOT a classic Chamberlin SVF but rather a custom first-order-like topology with two state variables (`z1_`, `z2_`).

#### 5. Reverb Implementation Patterns

- **Schroeder-Moorer lineage**: Schroeder's design (4 parallel comb filters + 2 series all-pass filters) was improved by Moorer (6 comb filters + 1 all-pass + early reflections FIR + per-comb low-pass filters for air absorption) [^186^][^188^][^193^][^194^].

- **Feedback Delay Networks (FDN)**: The modern standard for algorithmic reverb. FDNs generalize the comb filter bank using a feedback matrix connecting multiple delay lines. They provide "superior performance" in terms of modal density and decay characteristics [^298^][^302^].

- **Manifold's ReverbNode**: Wraps `juce::Reverb` (JUCE's built-in reverb, based on the Freeverb algorithm — a Schroeder-Moorer derivative). This is a pragmatic choice but limits Manifold to a relatively basic algorithmic reverb. No FDN or convolution reverb is present.

#### 6. Transient Shaper / Envelope Follower

- **Dual-envelope architecture**: The standard transient shaper uses two envelope followers — one with fast attack (catches transients) and one with slow attack (tracks body). The difference drives attack/sustain gain [^224^][^262^].

- **Envelope follower math**: The classic one-pole follower is `y[n] = a * y[n-1] + (1-a) * |x[n]|`, where `a = exp(-1/(fs*tau))` [^265^]. Princeton DSP notes use signal-dependent filter poles: `bup = 0.5` for fast rise, `bdown = 0.99` for slow fall [^274^].

- **Manifold's TransientShaperNode**: Implements exactly the dual-envelope architecture with fast attack (1ms), fast release (20ms), slow attack (20ms), slow release (300ms). Uses per-sample parameter smoothing. The attack/sustain gain formula applies sensitivity-scaled envelope difference with limiting. This is a textbook implementation.

#### 7. Frequency Shifter (Bode/Hilbert)

- **Bode frequency shifter**: Original analog implementation used double heterodyning with single-sideband filtering. The digital equivalent uses the Hilbert transform to create an analytic signal, then complex multiplication by a quadrature oscillator [^239^][^252^].

- **Hilbert FIR approach**: The standard DSP implementation uses a FIR Hilbert transformer (odd length, Type III/IV) to generate the quadrature component, with a compensating delay for the real path. Complex multiplication with `exp(j*2*pi*f_shift*n/fs)` and taking the real part yields the shifted signal [^240^].

- **Manifold's FrequencyShiftNode**: Uses exactly this architecture — 65-tap Hilbert FIR (`kHilbertTaps = 65`), per-channel delay lines for convolution, and quadrature oscillator (`lfoPhase_`). This is a correct and standard implementation.

#### 8. Shimmer Reverb

- **Signal flow**: The shimmer effect combines pitch-shifted reverb feedback with the original signal. Stanford CCRMA's implementation uses FDN reverberators with phase-vocoder pitch shifters, plus a 275ms delay to let harmonics fade in after the input [^227^].

- **Key parameters**: Pitch shift typically +12 semitones (one octave), feedback loop to create cascading harmonics, and a low-pass filter to tame high-frequency buildup [^219^][^231^].

- **Manifold's ShimmerNode**: Uses a delay-line-based shimmer with pitch-shifted feedback and modulation. The implementation is simpler than the Stanford FDN approach but follows the same conceptual signal flow.

#### 9. Numerical Stability in Audio DSP

- **Double precision considerations**: 32-bit float provides ~24-bit mantissa. For IIR filters with poles near the unit circle, "the state variable can be much bigger than the input (80dB to 100dB bigger)" in Direct Form II, causing noise. Transposed Form II or Direct Form I prevent this by keeping state variables bounded [^250^].

- **Filter topology stability**: Direct Form II is "especially sensitive to the effects of quantisation" [^297^]. SVF and transposed-direct-form-II are preferred for stability.

- **Manifold's approach**: Uses float (32-bit) throughout. The PhaseVocoderNode uses `1e-6f` and `1e-10f` magnitude thresholds to prevent phase accumulation on near-zero bins. The FilterNode's custom topology appears to be self-limiting. No explicit denormal handling is visible in the code reviewed.

#### 10. Parameter Smoothing and Real-Time Safety

- **Atomic lock-free parameters**: The JUCE forum consensus and SAFE BUFFER checklist recommend: atomics with `memory_order_acquire/release`, one-time allocation in `prepare()`, fixed internal blocks, bounded loops, and flushing denormals [^1^].

- **Per-sample smoothing**: All Manifold nodes use identical smoothing: `current += (target - current) * smoothCoeff_` with `smoothCoeff_ = 1.0 - exp(-1.0 / (smoothTime * sampleRate_))`. This is a standard one-pole lowpass on the parameter trajectory.

- **Memory ordering**: Manifold consistently uses `std::memory_order_acquire` for loads and `std::memory_order_release` for stores. This is correct and follows the C++11 memory model best practices for lock-free audio programming.

#### 11. Oversampling and Anti-Aliasing

- **Oversampling pipeline**: Zero-padding → interpolation lowpass → nonlinear processing → anti-aliasing lowpass → decimation [^246^].

- **Filter choices**: IIR (cheap, low latency, non-linear phase) vs FIR (expensive, more latency, linear phase, lower ripple) [^246^].

- **Manifold**: No explicit oversampling nodes were observed in the codebase. For bitcrusher and waveshaper nodes, anti-aliasing would typically require oversampling but may not be implemented.

#### 12. Latency Compensation

- **Plugin-reported latency**: Plugins report latency to the host via `getLatencySamples()` (JUCE) or equivalent. The host's delay compensation delays all tracks to match the maximum latency [^242^][^247^].

- **Manifold's PhaseVocoderNode**: Reports `fftSize_` as latency. However, the implementation may have additional ring-buffer latency not accounted for. The node does not appear to support dynamic latency changes (which some hosts struggle with).

#### 13. DSP Framework Comparisons: SuperCollider vs FAUST vs Custom C++

- **FAUST**: Functional DSL that compiles to C++. Benchmarks show FAust-generated code can be "28% faster for Freeverb and 40% faster for Tapir compared to the original C/C++ codes" [^263^][^270^]. Supports 8+ architectures including VST, SuperCollider, JACK, etc. Self-contained with no runtime dependency.

- **SuperCollider**: Server-based synthesis language with UGen architecture. Real-time but interpreted/compiled JIT. Best for algorithmic composition and rapid prototyping.

- **Custom C++ (Manifold's approach)**: Maximum control, direct JUCE integration, lock-free parameter handling, SIMD optimization. Higher development cost but optimal for product-quality plugins.

---

### Major Sources & Authorities

| Source | Relevance |
|--------|-----------|
| Bencina, "Implementing Real-Time Granular Synthesis" [^189^] | Canonical granular synthesis architecture reference; directly relevant to Manifold GranulatorNode |
| Laroche & Dolson, "New Phase-Vocoder Techniques" [^307^] | Peak-locked phase vocoder — state of the art for pitch-shifting; Manifold uses basic PV not this |
| DAFX: Digital Audio Effects (Zölzer et al.) [^337^][^338^] | Comprehensive textbook covering all effect categories in Manifold; standard reference for implementation |
| Moorer, "About This Reverberation Business" [^186^][^188^] | Foundational digital reverb design; JUCE Reverb (used by Manifold) derives from this lineage |
| Lazzarini, "Improving the Chamberlin Digital SVF" [^313^] | Modern SVF analysis and improvement; Manifold's FilterNode is custom but should consider this |
| iPlug2 SVF Documentation [^181^] | TPT SVF with zero-delay feedback — modern best practice for filter implementation |
| JUCE SIMD Tutorial [^336^] | Official JUCE guidance on SIMD optimization; Manifold uses Highway instead |
| CCRMA Stanford Shimmer Paper [^227^] | Academic implementation of shimmer effect with FDN + phase vocoder; Manifold's is simpler |
| EarLevel (Nigel Redmon) on Denormals [^267^] | Practical denormal handling strategies; Manifold should adopt these |
| SAFE BUFFER Checklist [^1^] | Comprehensive real-time safety mnemonic; Manifold follows most but not all recommendations |

---

### Patterns & Best Practices

1. **prepare() / process() / reset() pattern**: All Manifold nodes follow this lifecycle, matching the JUCE `prepareToPlay()` / `processBlock()` / `reset()` pattern and the DAFX real-time architecture recommendations [^337^].

2. **Atomic parameter exchange**: `std::atomic<float>` with `memory_order_acquire/release` is used universally across Manifold nodes. This is the industry-standard lock-free approach for real-time audio parameters [^1^][^272^].

3. **Per-sample parameter smoothing**: All nodes use exponential smoothing (`1.0 - exp(-1/(tau*fs))`) with ~10–20ms time constants. This prevents zipper noise and parameter discontinuities. DAFX recommends this approach for all time-varying parameters [^337^].

4. **Ring buffer with modulo indexing**: GranulatorNode, PhaseVocoderNode, and ShimmerNode all use ring buffers. Manifold uses modulo (`%`) for wrapping — efficient for power-of-2 sizes but branchy for arbitrary sizes.

5. **FFT-based spectral processing**: PhaseVocoderNode uses `juce::dsp::FFT` with real-only transforms. The interleaved complex packing (`[re0, im0, re1, im1, ...]`) is standard JUCE practice.

6. **Envelope generation**: TransientShaperNode's dual-envelope approach (fast/slow attack/release) is the industry-standard architecture for transient processing [^224^][^265^].

7. **SIMD optimization**: FilterNode uses Google Highway (`FilterNode_Highway.h`) for vectorized processing. This is a modern approach alternative to JUCE's `SIMDRegister` [^336^].

---

### Controversies & Conflicting Claims

1. **Phase vocoder vs. time-domain pitch shifting**: Time-domain methods (OLA, PSOLA) are "much simpler to understand and implement but quite limited" — they fail on polyphonic material. Phase vocoder handles polyphonic audio but introduces latency (~150ms) and artifacts (chorus, transient smearing) [^222^]. Some music-dsp contributors argue that for many applications, "basic linear interpolated resampling" in time domain sounds better than a poorly implemented phase vocoder [^312^].

2. **Laroche-Dolson patent issues**: The identity phase-locked phase vocoder is patented and "doesn't usually sound as good as more computationally-expensive methods that adjust phases individually but influenced by local gradient, as in Rubber Band" [^312^]. This creates tension between simple peak-locking and more advanced gradient methods.

3. **32-bit vs 64-bit float for audio DSP**: DSP practitioners disagree. One view: "32-bit floating point has a 24 bit mantissa... plenty for most things audio" [^250^]. Counter-view: "IIR biquads with poles/zeros near the unit circle require far more than 24 bits of mantissa for intermediate computational products" [^250^]. The consensus: use float for storage/buffers, double for critical filter coefficients and accumulators.

4. **Denormal flushing safety**: Hardware FTZ/DAZ is processor-dependent and may interfere with other code. EarLevel recommends manual flushing with tiny DC offsets (alternating sign per buffer) as more portable: "A value such as 1e-15 (-300 dB) completely wipes out denormals while having no audible effect" [^267^].

5. **YIN vs MPM accuracy**: Limited evidence of significant difference in clean conditions. Under noise, YIN performs worse than newer methods (fast NLS, proposed methods) [^306^]. MPM is preferred for low-latency scenarios [^305^].

---

### Relation to Manifold Codebase

1. **GranulatorNode**: Well-architected following Bencina's collaboration pattern. Uses Hann/triangle envelopes, linear interpolation, ring buffer read, and pitch shift via resampling (`pow(2, semitones/12)`). The `readRing()` implementation uses `while` loops for wrapping — could be optimized to `fmodf` or conditional subtraction for power-of-2 buffers. Maximum 64 grains (`kMaxGrains = 64`) is reasonable for real-time.

2. **PhaseVocoderNode**: Implements a standard phase vocoder (not "done right"). The bin-mapping pitch shift uses linear interpolation in the frequency domain, which is a common simplification. Missing: phase-locking, peak detection, or transient preservation. The time-stretch mode scales phase advance directly (`timeStretchRatio * analysisFreq_`), which is correct. However, the lack of frequency-domain oversampling means down-shifting may exhibit high-frequency noise above 15kHz as documented in Royer's thesis [^310^].

3. **PitchDetectorNode**: Marked as UNSOLICITED and UNREVIEWED with explicit warnings not to trust the code. This is a critical codebase liability. The actual detection algorithm is hidden in `PitchDetector.h` (not reviewed here). Given the warnings, this node should be prioritized for architectural review or removal.

4. **FilterNode**: Custom filter with SIMD via Google Highway. The `computeAlpha()` uses exponential approach to normalized cutoff, which is a valid approximation but not the standard Chamberlin or TPT SVF. The node clamps cutoff to 20–18000 Hz, which is conservative. No Q/resonance in the classic sense — the "resonance" parameter shapes the alpha via `shaping = 1.0 + resonance * 0.6f`. This is a simplified design.

5. **ReverbNode**: Delegates entirely to `juce::Reverb`. This is pragmatic but limits algorithmic flexibility. JUCE's reverb is based on Freeverb (a Schroeder-Moorer derivative), which is well-known but lacks the sophistication of modern FDN or convolution reverbs.

6. **TransientShaperNode**: Textbook dual-envelope implementation with IIR-style attack/release. Uses `std::abs()` rectification, then one-pole smoothing with different time constants. The gain formula `1.0f + currentAttack_ * transient * 6.0f` with clamping to [0, 4] is a practical heuristic.

7. **FrequencyShiftNode**: Correct Hilbert-transform-based implementation. 65 taps is adequate for audio-quality SSB suppression. The quadrature oscillator (`lfoPhase_`) requires phase accumulation with wrapping — should be verified for numerical precision at high shift frequencies.

8. **ShimmerNode**: Delay-line-based shimmer with feedback and pitch shifting. Simpler than the Stanford FDN approach [^227^] but functionally similar. The modulation parameter suggests LFO-driven delay time variation for chorus-like shimmer textures.

9. **Parameter system**: The atomic + smoothing pattern is applied uniformly and correctly. All nodes use identical smoothing time constants (~10ms for most, 20ms for FilterNode, 40ms for ReverbNode). This is a good consistency but may not be optimal for all parameter types (e.g., mix should often be faster).

10. **Missing safety patterns**: No explicit denormal flushing (`juce::ScopedNoDenormals` or `_MM_SET_FLUSH_ZERO_MODE`) was observed in the reviewed code. No oversampling for nonlinear nodes. No explicit latency compensation beyond the PhaseVocoderNode's `getLatencySamples()`.

---

### Recommended Improvements / Opportunities

1. **Upgrade PhaseVocoderNode to "Phase Vocoder Done Right"**: Implement Laroche-Dolson peak detection and identity phase locking, or at minimum the Prusa/Holighaus phase gradient method [^311^]. This would dramatically reduce phasiness and transient smearing artifacts.

2. **Add transient preservation to PhaseVocoderNode**: Implement harmonic-percussive separation (as in Royer's thesis [^310^]) or at minimum a transient detection bypass for pitch-shifted percussion.

3. **Review or remove PitchDetectorNode**: The UNSOLICITED/UNREVIEWED warnings are a serious codebase liability. Either formally review and test the implementation, or remove it and replace with a well-tested library like `sevagh/pitch-detection` [^192^].

4. **Adopt TPT SVF for FilterNode**: Consider replacing the custom filter with a topology-preserving transform SVF with zero-delay feedback [^181^][^313^]. This provides better numerical stability and simultaneous LP/BP/HP/Notch outputs.

5. **Add denormal protection**: Wrap `process()` methods with `juce::ScopedNoDenormals` or manual flushing [^267^]. Alternatively, add tiny DC offset (alternating sign) to filter states to prevent denormal stagnation.

6. **Implement FDN-based ReverbNode**: Replace or supplement JUCE's built-in reverb with a configurable FDN reverb [^298^]. This would enable more realistic room simulation and match modern plugin expectations.

7. **Add oversampling to nonlinear nodes**: BitCrusherNode and WaveShaperNode should implement 2x or 4x oversampling with FIR anti-aliasing filters to reduce aliasing artifacts [^246^][^338^].

8. **Optimize GranulatorNode ring buffer wrapping**: Replace `while (wrapped < 0) wrapped += bufferSize_` with `fmodf` or bit masking for power-of-2 sizes. Also consider cubic interpolation for grain reads to reduce grain-edge artifacts.

9. **Parameter smoothing differentiation**: Use faster smoothing (~1ms) for mix/wet-dry parameters that users expect to be immediate, and slower smoothing (~20–50ms) for frequency/cutoff parameters to prevent zipper noise without sluggishness.

10. **Consider FAUST integration**: For rapid prototyping of new DSP primitives, FAUST can generate JUCE-compatible C++ that benchmarks competitively with hand-written code [^263^]. A single FAUST architecture file could enable quick experimentation with complex algorithms (physical modeling, advanced reverbs) without hand-coding everything.

---

### Raw Evidence Log

**Claim**: Granular synthesis architectures should separate Granulator, Scheduler, Grain, and Envelope concerns.
**Source**: Bencina, "Implementing Real-Time Granular Synthesis"
**URL**: http://www.rossbencina.com/static/code/granular-synthesis/BencinaAudioAnecdotes310801.pdf
**Date**: 2001 (Audio Anecdotes)
**Excerpt**: "Granulator requests that Scheduler synthesizes samples of sound. Scheduler synthesizes sound by requesting each of its active Grains to synthesize sound... Grain synthesizes samples in response to requests from the Scheduler."
**Confidence**: High

**Claim**: Phase vocoder "done right" reduces transient smearing through peak-locking.
**Source**: Laroche & Dolson, "New Phase-Vocoder Techniques for Pitch-Shifting"
**URL**: https://www.ee.columbia.edu/~dpwe/papers/LaroD99-pvoc.pdf
**Date**: 1999
**Excerpt**: "The new techniques are based on a very simple peak-detection stage, followed by a peak-shifting stage... the most flexible techniques requires a more expensive 75% overlap."
**Confidence**: High

**Claim**: McLeod/MPM outperforms YIN for low-latency pitch detection.
**Source**: JUCE Forum, "Lowest-latency real-time pitch detection"
**URL**: https://forum.juce.com/t/lowest-latency-real-time-pitch-detection/51741
**Date**: 2022-06-08
**Excerpt**: "McLeod / MPM outperforms YIN a bit, especially if you need low latency and if you can't do much post-processing."
**Confidence**: Medium

**Claim**: Chamberlin digital SVF has known issues that can be improved.
**Source**: Lazzarini, "Improving the Chamberlin Digital State Variable Filter" (arXiv:2111.05592)
**URL**: https://arxiv.org/abs/2111.05592
**Date**: 2021-11-10
**Excerpt**: "A digital implementation of this filter was put forward by Chamberlin... it suffers from some issues, which have already been identified in the literature."
**Confidence**: High

**Claim**: Moorer's reverb uses 6 parallel comb filters with low-pass feedback and early reflections FIR.
**Source**: Moorer, "About This Reverberation Business" / Northwestern University Technical Report
**URL**: https://freeverb3-vst.sourceforge.io/doc/Moorer_Reverb.PDF
**Date**: 1979
**Excerpt**: "Moorer proposed to use six comb filters in parallel followed by a single all-pass filter. To simulate the attenuation of higher frequencies by the air, he incorporated a first-order low-pass filter in the loop of each comb filter."
**Confidence**: High

**Claim**: Frequency shifter using Hilbert transform + complex multiplication is standard digital implementation.
**Source**: MDPI Electronics, "Real-Time Implementation of a Frequency Shifter"
**URL**: https://www.mdpi.com/2079-9292/12/20/4359
**Date**: 2023-10-20
**Excerpt**: "The frequency shift operation can be computed by multiplying the complex signal xc(t) by ej2πfshift/fsn... and taking the real part."
**Confidence**: High

**Claim**: Dual-envelope transient shaper is standard architecture.
**Source**: Cabbage Audio Forum / SPL Transient Designer Theory
**URL**: https://forum.cabbageaudio.com/t/transient-shaper-algorithm/3631
**Date**: 2023-03-22
**Excerpt**: "Basically, once you have two envelopes (same release times but different attack times), you can substract them and then use the difference to boost/reduce the original signal."
**Confidence**: High

**Claim**: 32-bit float is generally sufficient but double precision helps for IIR filters near unit circle.
**Source**: DSP StackExchange, "When to consider double floating point for Audio"
**URL**: https://dsp.stackexchange.com/questions/6079/when-to-consider-double-64-bit-floating-point-for-audio
**Date**: 2012-11-24
**Excerpt**: "IEEE float singles only provide about 24 bits of mantissa. But many DSP/filtering algorithms require far more than 24 bits of mantissa for intermediate computational products."
**Confidence**: High

**Claim**: Denormals should be flushed in real-time DSP to prevent 10–100x performance degradation.
**Source**: krj.st, "denormal"
**URL**: https://mu.krj.st/denormal/
**Date**: 2021-09-20
**Excerpt**: "To disable denormals completely, we need to set the corresponding bits in mxcsr to 1... #define MASK ((1<<6)|(1<<15))."
**Confidence**: High

**Claim**: SAFE BUFFER checklist recommends fixed internal blocks, lock-free communication, denormal flushing, and explicit latency declaration.
**Source**: Medium, "Fixed vs. Variable Buffer Processing in Real-Time Audio DSP"
**URL**: https://medium.com/@12264447666.williamashley/fixed-vs-variable-buffer-processing-in-real-time-audio-dsp-performance-determinism-and-66da78390b0f
**Date**: 2025-10-30
**Excerpt**: "F Flush denormals — Always wrap with juce::ScopedNoDenormals or use _MM_SET_FLUSH_ZERO_MODE."
**Confidence**: High

**Claim**: FAUST can outperform hand-written C++ for certain DSP algorithms.
**Source**: Orlarey et al., "DSP Programming with Faust, Q and SuperCollider" (ICMC 2006)
**URL**: https://q-lang.sourceforge.net/icmc06/icmc06.pdf
**Date**: 2006
**Excerpt**: "We measured the Faust versions to be 28% faster for the Freeverb and 40% faster for Tapir compared to the original codes."
**Confidence**: Medium

**Claim**: Shimmer effect requires pitch-shifted reverb with feedback for cascading harmonics.
**Source**: CCRMA Stanford, "Shimmer Audio Effect: A Harmonic Reverberator"
**URL**: https://ccrma.stanford.edu/~jingjiez/portfolio/echoing-harmonics/pdfs/Shimmer%20Audio%20Effect%20-%20A%20Harmonic%20Reverberator.pdf
**Date**: Unknown
**Excerpt**: "The input signal is first up-shifted by one and two octaves and then sent into the branch FDN reverberator... A 275ms delay is then applied to the output signal of the branch reverb module."
**Confidence**: High

**Claim**: Standard phase vocoder suffers from chorus effect, transient smearing, and phasiness.
**Source**: Royer, "Pitch-shifting algorithm design and applications in music" (KTH thesis)
**URL**: https://www.diva-portal.org/smash/get/diva2:1381398/FULLTEXT01.pdf
**Date**: 2019
**Excerpt**: "Artifacts heard are chorus effect, transient smearing and phasiness. These 3 artifacts are caused by the loss of vertical coherence in the phase vocoder."
**Confidence**: High

**Claim**: Oversampling before nonlinear operations is required to prevent aliasing.
**Source**: DAFX: Digital Audio Effects (Zölzer)
**URL**: http://oeyvind.teks.no/ftp/Projects/Projects/writings/2015/DAFx/ref/dafx_book.pdf
**Date**: 2011 (2nd ed.)
**Excerpt**: "For digital signals we first have to perform over-sampling of the input signal before applying any non-linear operation to the input signal in order to avoid any aliasing distortions."
**Confidence**: High
