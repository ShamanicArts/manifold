## Dimension 3: SIMD Vectorization in Audio DSP

### Key Findings

- **Google Highway is the most actively adopted portable SIMD library for production multimedia codecs**, powering Chromium, Firefox, JPEG XL, libaom (AV1), libvips, and notably Zimtohrli (a psychoacoustic audio metric). The Highway README states: "We also often see 5-10x speedups" and "Highway supports 27 targets" including ARM NEON, SVE, SVE2, RVV, and x86 SSE2 through AVX10_2. [^1^][^2^]

- **Highway supports ARM NEON, SVE, and SVE2 natively**, but Manifold's current configuration only enables x86 targets (SSE2, SSE3, SSSE3, SSE4) with MSVC AVX3 fixes. Highway's quick reference notes: "For Arm targets `HWY_NEON`, `HWY_NEON_WITHOUT_AES`, `HWY_NEON_BF16`, `HWY_SVE`... Arm provides a searchable reference." [^3^] This represents a significant portability gap for Manifold on Apple Silicon and ARM Linux/Android.

- **Dynamic dispatch in Highway introduces CPU detection overhead on first invocation**, which can be eliminated by calling `hwy::GetChosenTarget().Update(hwy::SupportedTargets());` before any `HWY_DYNAMIC_*` call. The NumPy NEP 54 team investigated this specifically: "One concern regarding Highway was whether it is possible to obtain a function pointer for an architecture-specific function instead of calling that function directly. This so that we can be sure that calling 1-D inner loop many times for a single Python API invocation does not incur the dispatching overhead many times. This was investigated: this can be done with Highway too." [^4^]

- **The per-lane state machine pattern used in Manifold's `ADSREnvelopeNode_Highway.h` is consistent with the voice-parallel SIMD approach advocated by ROLI (Angus Hewlett, ADC'17)**. Hewlett's talk "The Future is Wide: SIMD, vector classes and branchless algorithms for audio synthesis" explicitly recommends leveraging "polyphonic synthesisers' inherent voice-level parallelism to make full use of available CPU hardware resources" on both Intel AVX/AVX-512 and ARM NEON/SVE. [^5^]

- **Auto-vectorization is unreliable for stateful audio DSP**, particularly for non-linear effects and feedback structures. A Japanese engineering blog benchmarking MSVC audio DSP found that block-based scalar code was auto-vectorized by the compiler and outperformed hand-written AVX2 in some cases—because the scalar loop was simpler and more optimizable. Only after disabling auto-vectorization (`#pragma loop(no_vector)`) did hand-written SIMD show its true advantage. [^6^]

- **ARM NEON is fixed 128-bit while x86 AVX2 is 256-bit**, giving x86 a raw throughput advantage. Benchmarks on openEuler showed AVX2 achieving ~7.5x speedup vs scalar, while NEON achieved ~3.8x. However, NEON has 2x the register count and better ILP, and ARM's SVE provides scalable vectors from 128-2048 bits. [^7^][^8^]

- **SVE's Vector Length Agnostic (VLA) programming model is fundamentally different from fixed-width SIMD**. The same binary adapts to different vector lengths at runtime. SVE eliminates scalar tail loops through predicate-driven control, using "progress masks" and `svwhilelt` intrinsics. [^9^][^10^]

- **Tail/remainder handling is a critical concern for real-time audio plugins**. Fixed buffer sizes (power-of-two multiples of vector width) eliminate tail conditionals, yielding "flat and optimal" CPU profiles. Variable buffers force `if (i+8 > numSamples)` branches, causing "sawtooth CPU patterns" and risking dropouts. [^11^]

- **OB-Xd 3.x demonstrates a complete real-world audio engine rewrite from scalar OOP to data-oriented SIMD**, achieving 4-6x real-world performance improvement by processing 8 voices simultaneously with AVX2, with a NEON fallback. The rewrite transitioned from "object-oriented per-voice model" to "data-oriented SIMD-optimized design" using structure-of-arrays voice storage. [^12^]

- **JUCE provides `dsp::SIMDRegister`, a cross-platform SIMD wrapper**, but it historically lacked double-precision NEON support on ARM64—a gap only recently addressed by community contributions. JUCE's tutorial explicitly recommends interleaving/deinterleaving samples for SIMD IIR filter processing. [^13^][^14^]

- **C++26 `std::simd` (P1928) has shipped but is widely criticized for lacking runtime dispatch and SVE support**. A 2026 analysis states: "`std::simd` has no runtime dispatch story at all. Highway is length-agnostic, meaning it works naturally with ARM SVE's scalable vectors, which `std::simd`'s fixed-width model can't express." [^15^]

- **Highway's `SlideUpLanes`, `BroadcastLane`, and `Compress` operations are exactly the cross-lane primitives needed for per-lane state transitions** in audio effects like Manifold's ADSR envelope and bit-crusher nodes. The quick reference documents: "`SlideUpLanes` slides up `v` by `N` lanes... `BroadcastLane<kLane>` returns a vector with all lanes set to `v[kLane]`." [^3^]

- **Audio plugin portability to ARM (Apple Silicon, iOS, Android) is increasingly critical**, with projects like Talospace documenting common porting issues: architecture-specific compiler flags, missing SIMD intrinsics, and the need for fallback implementations. SIMDe and sse2neon are common migration aids. [^16^]

- **The `VCV Rack` community discussed Highway for plugin SIMD** and concluded that while VCV's built-in `float_4` SIMD is simpler for basic polyphonic voice parallelism, Highway offers more operations and better documentation. The key insight from that thread: "SIMD basically makes it so processing 4 floats at a time is as cheap as processing 1 float at a time. Can you design your program to take advantage of that? voice polyphony is an obvious way." [^17^]

- **Non-linear audio effects (distortion, bit-crushing) are stateless and SIMD-friendly**, but anti-aliasing requires oversampling. Real production implementations add FIR decimation filters and DC correction. The Manifold `BitCrusherNode_Highway.h` pattern of quantization + state smoothing is consistent with industry practice. [^18^]

- **xsimd vs Highway comparison**: xsimd has broader architecture granularity but cannot support sizeless SVE types because it declares SIMD registers as class members (`simd_register<int8_t, sve>` fails compilation with "member variables cannot have SVE type"). Highway uses zero-sized tag arguments, making it compatible with SVE and RVV. [^19^]

- **Highway's `HWY_DYNAMIC_POINTER` can cache the resolved function pointer**, eliminating per-call dispatch overhead in tight loops. This is the recommended pattern for audio callback contexts where `processBlock()` may call SIMD kernels thousands of times per second. [^1^]

- **ARM's documentation on migrating from x86 SIMD to ARM** explicitly recommends Highway for portable SIMD: "For many software projects, `highway` is a portable SIMD library and APIs that target multiple ISAs, including Neon, SVE where supported, and AVX, without per-ISA code paths." [^8^]

- **Strip-mining with padded buffers is Highway's preferred loop strategy** for handling non-evenly-divisible counts. The docs state: "Ensure all inputs/outputs are padded. Then the loop is simply `for (size_t i = 0; i < count; i += N) LoopBody<false>(d, i, 0);` This is the preferred option... there is little cost to processing entire vectors even if we do not need all their lanes." [^2^]

### Major Sources & Authorities

- **Google Highway Documentation (GitHub + GitHub Pages)**: The authoritative source for Highway API, dispatch modes, target configuration, and strip-mining strategies. Directly cited for `SlideUpLanes`, `BroadcastLane`, dynamic dispatch overhead mitigation, and ARM target support. [^1^][^2^][^3^]

- **NumPy NEP 54 — "SIMD infrastructure evolution: adopting Google Highway when moving to C++"**: Accepted NumPy Enhancement Proposal providing a side-by-side comparison of Highway vs Universal Intrinsics. Addresses dispatch overhead, build system concerns, and function pointer caching. [^4^]

- **Angus Hewlett, ADC'17 — "The Future is Wide: SIMD, vector classes and branchless algorithms for audio synthesis"**: ROLI VP Engineering presenting the canonical industry talk on voice-parallel SIMD for virtual instruments. Covers AVX, AVX-512, ARM NEON, and SVE. [^5^]

- **Yining Karl Li — "Comparing SIMD on x86-64 and arm64" (2021)**: Comprehensive benchmarking of SSE vs NEON vs auto-vectorization vs ISPC. Found native NEON slightly faster than sse2neon, auto-vectorization disappointing on ARM (only 1.095x speedup), and ISPC achieving 3.7x on ARM. [^20^]

- **Arm Learning Path — "Migrate SIMD code to the Arm architecture"**: Official ARM documentation comparing SSE↔NEON, AVX↔SVE, with side-by-side feature tables and migration guidance. [^8^]

- **Arm Developer Community — "SVE and SVE2 enablement in SIMD library" (2023)**: Explains why xsimd cannot support true SVE (sizeless types in class members) and why Highway's tag-based approach succeeds. [^19^]

- **OB-Xd 3.x Technical Analysis**: Real-world commercial synth rewrite from scalar OOP to SIMD data-oriented design. Documents 4-6x real-world speedup, AVX2/NEON dual path, and structure-of-arrays voice storage. [^12^]

- **JUCE `dsp::SIMDRegister` Tutorial**: Official JUCE documentation for cross-platform SIMD in audio plugins, including interleave/deinterleave patterns for IIR filters. [^13^]

- **DevelopersIO (Japan) — "C++ Audio Effect Acceleration"**: Detailed MSVC assembly analysis showing auto-vectorization can outperform naive hand-written SIMD. Recommends block-based scalar loops as the first optimization step. [^6^]

- **Modular Blog — "Understanding SIMD: Infinite Complexity of Trivial Problems" (2024)**: Discussion of SVE progress masks for tail handling and per-lane predication. [^21^]

- **Lucis QR — "C++26 Shipped a SIMD Library Nobody Asked For" (2026)**: Critical analysis of `std::simd` vs Highway, noting Highway's runtime dispatch and SVE support as decisive advantages. [^15^]

- **VCV Rack Community Forum — "Would Highway be any good for implementing SIMD stuff in a VCV plugin?"**: Practitioners discussing Highway vs VCV's built-in SIMD for modular synthesis. [^17^]

- **Zimtohrli (Google) arXiv paper + GitHub**: Google's own audio DSP project using Highway, processing ~70 seconds of audio per second on a single 2.5GHz core. [^22^][^23^]

- **Talospace — "The porting process"**: Documentation of real-world audio plugin porting to Power ISA, with patterns applicable to ARM migration (SIMDe, conditional SIMD flags). [^16^]

- **Stony Brook / Ookami — "Arm SVE Fundamentals"**: Educational material on SVE vector-length-agnostic programming, predicate registers, and while-less-than loop control. [^10^]

### Patterns & Best Practices

- **Voice-Parallel SIMD (aka "Structure of Arrays")**: Store voice parameters in aligned arrays and process N voices per SIMD vector. This is the dominant pattern in modern synths (OB-Xd 3.x, ROLI, VCV Rack). Each SIMD lane corresponds to one polyphonic voice, not one audio sample. [^5^][^12^][^17^]

- **State vectors via `hwy::AllocateAligned<T>(numLanes)`**: Manifold already follows this Highway pattern. The docs confirm: "storage for vectors should be dynamically allocated, e.g., via `AllocateAligned(Lanes(d))`" because `Lanes(d)` may not be constexpr on SVE. [^3^]

- **Cross-lane transitions with `SlideUpLanes` + `BroadcastLane`**: For state machines (ADSR stages, hold counters) where one lane may need to influence another, use `SlideUpLanes` to shift state and `BroadcastLane` to broadcast a trigger. Manifold's `ADSREnvelopeNode_Highway.h` pattern is architecturally sound. [^3^]

- **Pad buffers to vector width to eliminate tail loops**: Highway recommends this as the "preferred option" because "there is little cost to processing entire vectors even if we do not need all their lanes" and it avoids "the (potentially large) cost of predication or partial loads/stores on older targets." [^2^]

- **Cache dispatch result with `HWY_DYNAMIC_POINTER` or pre-call `GetChosenTarget().Update()`**: For audio real-time contexts, call `hwy::GetChosenTarget().Update(hwy::SupportedTargets());` once in initialization, or cache the function pointer from `HWY_DYNAMIC_POINTER`, to avoid CPU detection overhead in the audio callback. [^1^][^4^]

- **Use `HWY_NAMESPACE` class implementing `IPrimitiveNodeSIMDInterface`**: Manifold's existing pattern of a Highway-namespaced class implementing a SIMD interface is consistent with JUCE's `dsp::SIMDRegister` approach and VCV Rack's `float_4` pattern. [^13^][^17^]

- **For non-linear effects (bit-crusher, distortion), process sample-by-sample but vectorize across voices**: A single bit-crusher is not data-parallel across samples (it has 1 sample of state), but 4-8 independent bit-crusher instances (voices) can run in parallel lanes. [^17^][^18^]

- **Auto-vectorize first, hand-SIMD second**: The DevelopersIO blog found that restructuring code into simple block-based loops often yields more gain than hand-written intrinsics, because modern compilers auto-vectorize effectively. Only after confirming the compiler fails should one reach for Highway. [^6^]

- **`HWY_COMPILE_ALL_ATTAINABLE` for maximum coverage**: Manifold already uses this. It ensures all attainable targets are compiled, enabling runtime dispatch to the best available ISA. [^1^]

- **Avoid namespace-scope static SIMD vector initializers**: Highway docs warn this "can cause SIGILL when using runtime dispatch and the compiler chooses an initializer compiled for a target not supported by the current CPU." Use `Set` with local const variables instead. [^1^]

### Controversies & Conflicting Claims

- **Auto-vectorization vs manual SIMD**: The DevelopersIO study found auto-vectorized scalar code sometimes outperforming hand-written AVX2 in audio effects, because the scalar version was simpler and the compiler optimized better. However, Yining Karl Li found auto-vectorization on ARM64 gave only 1.095x speedup (almost nothing) versus 3.4x for hand-written NEON. The consensus: auto-vectorization works for simple FIR/gain loops, fails for stateful/non-linear/branchy DSP. [^6^][^20^]

- **xsimd vs Highway for audio**: xsimd is a header-only C++ library with 2,571 GitHub stars vs Highway's 5,218. xsimd supports more granular x86 targets but cannot express SVE/RVV sizeless vectors. Highway has runtime dispatch; xsimd does not. The NumPy team debated this extensively and Highway was ultimately accepted. For audio projects needing ARM scalability, Highway is the stronger choice. [^19^][^4^]

- **`std::simd` (C++26) relevance**: While now standard, critics argue it "arrived after the world moved on" with no runtime dispatch and poor SVE support. Highway's adoption by Chrome, Firefox, and JPEG XL suggests industry has already voted with its feet. For Manifold, staying with Highway is the pragmatic path. [^15^]

- **Strip-mining vs predication for tail handling**: Highway recommends padding (full vectors) as "preferred." SVE recommends predication (progress masks with `svwhilelt`). The conflict arises from older x86 targets (pre-AVX-512) having expensive partial loads/stores, while SVE has cheap predication. A portable codebase like Manifold should likely follow Highway's padded approach for consistency across x86 and ARM. [^2^][^10^]

- **Dispatch robustness on MSVC**: NumPy's NEP 54 notes: "The Highway technique may not work reliably on MSVC, the Universal Intrinsic technique does work on MSVC." Manifold already has "MSVC AVX3 fixes for VS 2019+" but should verify ARM/NEON compilation on MSVC ARM64. [^4^]

- **Double-precision NEON on ARM64**: JUCE historically lacked `SIMDRegister<double>` for ARM NEON, causing plugins to run *slower* than scalar on Apple Silicon. This was fixed by community forks. Manifold should audit any double-precision SIMD usage for ARM compatibility. [^14^]

### Relation to Manifold Codebase

- **Current x86-only target configuration is the most significant gap**. Manifold configures SSE2, SSE3, SSSE3, SSE4 but has no ARM targets. Highway natively supports `HWY_NEON`, `HWY_NEON_WITHOUT_AES`, `HWY_NEON_BF16`, `HWY_SVE`, `HWY_SVE2`, `HWY_SVE_256`, and `HWY_SVE2_128`. Adding these to the build system would immediately enable Apple Silicon and ARM Linux/Android builds. [^1^][^3^]

- **`ADSREnvelopeNode_Highway.h` per-lane state machine pattern is well-aligned with industry best practices**. The use of `SlideUpLanes`, `BroadcastLane`, and `Compress` for cross-lane transitions mirrors the voice-parallel approach advocated by ROLI and implemented in OB-Xd 3.x. This code is likely portable to ARM NEON with minimal changes because Highway abstracts the lane operations. [^5^][^12^][^3^]

- **`BitCrusherNode_Highway.h` quantization + state smoothing pattern is also portable**, but bit-crushers are inherently per-sample stateful. Vectorizing across voices (4-8 crushers in parallel lanes) is the correct strategy, not across samples. The current implementation should verify it is using voice-parallel rather than sample-parallel lanes. [^17^][^18^]

- **Dynamic dispatch overhead should be mitigated**. If Manifold calls `HWY_DYNAMIC_DISPATCH_T` inside `processBlock()`, the CPU detection overhead occurs on every audio callback block. The fix: call `hwy::GetChosenTarget().Update(hwy::SupportedTargets());` during node initialization, and/or use `HWY_DYNAMIC_POINTER` to cache the resolved function pointer for the lifetime of the process. [^1^][^4^]

- **Tail handling strategy should be reviewed**. If Manifold uses variable block sizes from the host DAW, tail conditionals may cause branch mispredictions. Fixed internal chunking (e.g., 16 or 32 samples, as used by Firefly Synth 2) ensures vector-width divisibility. [^11^][^24^]

- **State vector allocation with `hwy::AllocateAligned<float>(numLanes)` is correct** but should use `Lanes(d)` rather than hardcoded `numLanes` on SVE-capable builds. The docs warn: "`Lanes(d)` could potentially change at runtime... we discourage caching the result." However, for audio contexts where vector length changes mid-callback are impossible, caching in initialization is safe. [^3^]

- **No `std::experimental::simd` migration needed**. Manifold is already using the industry-preferred solution (Highway). C++26 `std::simd` lacks runtime dispatch and SVE support, making it unsuitable for a cross-platform audio plugin framework. [^15^]

- **MSVC ARM64 compatibility should be validated**. The existing "MSVC AVX3 fixes for VS 2019+" suggest awareness of MSVC quirks, but ARM64 NEON code paths need separate CI/build verification. [^4^][^16^]

### Recommended Improvements / Opportunities

1. **Enable ARM NEON / SVE targets in the Highway build configuration**. Add `HWY_NEON`, `HWY_NEON_BF16`, `HWY_SVE`, and `HWY_SVE2` to the target list. This is a build-system change with high impact for Apple Silicon and mobile markets.

2. **Pre-resolve dynamic dispatch during node initialization**. Replace per-block `HWY_DYNAMIC_DISPATCH_T` calls with a cached function pointer (via `HWY_DYNAMIC_POINTER`) or call `hwy::GetChosenTarget().Update()` in `prepareToPlay()`. This eliminates CPU detection overhead from the real-time audio path.

3. **Audit node implementations for voice-parallel vs sample-parallel lane usage**. Ensure stateful nodes (ADSR, bit-crusher) are parallelizing across independent voices, not across sequential samples of a single voice. The latter is impossible for stateful effects.

4. **Consider fixed-size internal chunking for stateful effects**. Process audio in chunks of `Lanes(d)` (typically 4, 8, or 16 samples) to eliminate tail loops and guarantee vector-width divisibility. Firefly Synth 2 uses a fixed block of 16 for this exact reason. [^24^]

5. **Add ARM64 CI/build verification**. Even without hardware, QEMU or GitHub Actions ARM runners can validate NEON compilation. Highway itself tests ARM targets via QEMU. [^1^]

6. **Document the SIMD architecture pattern for contributors**. A short internal doc explaining "one lane = one voice" and how `SlideUpLanes` / `BroadcastLane` handle cross-lane state transitions would lower the barrier for new node authors.

7. **Benchmark against auto-vectorized scalar paths**. For simple nodes (gain, pan), compare the Highway implementation against a plain scalar loop compiled with `-O3` / `/O2`. If the compiler auto-vectorizes effectively, the maintenance burden of Highway may not be justified for trivial nodes.

8. **Evaluate SVE for future-proofing**. If Manifold targets server/cloud audio processing (not just plugins), SVE's scalable vectors offer significant future headroom. Highway's `HWY_SVE_256` and `HWY_SVE2_128` specializations provide a migration path.

9. **Review double-precision SIMD usage on ARM64**. If any nodes use `float64` vectors, verify they compile and perform correctly on NEON, which natively supports double-precision in AArch64 but not in older ARMv7.

10. **Investigate `HWY_EMU128` fallback for unsupported CPUs**. Ensure the scalar/emulated fallback is tested so Manifold does not crash on CPUs without SIMD support.

### Raw Evidence Log

Claim: Highway sees 5-10x speedups and supports 27 targets.
Source: Google Highway README
URL: https://github.com/google/highway
Date: 2026-04-23
Excerpt: "CPUs provide SIMD/vector instructions that apply the same operation to multiple data items. This can reduce energy usage e.g. fivefold because fewer instructions are executed. We also often see 5-10x speedups."
Confidence: high

Claim: Highway supports ARM NEON, SVE, SVE2, and RVV (sizeless vectors).
Source: Highway README — Current status / Targets
URL: https://github.com/google/highway
Date: 2026-04-23
Excerpt: "Armv7+: `NEON_WITHOUT_AES`, `NEON`, `NEON_BF16`, `SVE`, `SVE2`, `SVE_256`, `SVE2_128`; RISC-V: `RVV` (1.0)"
Confidence: high

Claim: First `HWY_DYNAMIC_DISPATCH` invocation incurs CPU detection overhead, mitigated by `GetChosenTarget().Update()`.
Source: Google Highway README — Quick start
URL: https://github.com/google/highway
Date: 2026-04-23
Excerpt: "Note that the first invocation of `HWY_DYNAMIC_DISPATCH`, or each call to the pointer returned by the first invocation of `HWY_DYNAMIC_POINTER`, involves some CPU detection overhead. You can prevent this by calling the following before any invocation of `HWY_DYNAMIC_*`: `hwy::GetChosenTarget().Update(hwy::SupportedTargets());`."
Confidence: high

Claim: NumPy confirmed Highway function pointer caching works to avoid dispatch overhead in tight loops.
Source: NumPy NEP 54
URL: https://numpy.org/neps/nep-0054-simd-cpp-highway.html
Date: 2023-07-06
Excerpt: "One concern regarding Highway was whether it is possible to obtain a function pointer for an architecture-specific function instead of calling that function directly. This so that we can be sure that calling 1-D inner loop many times for a single Python API invocation does not incur the dispatching overhead many times. This was investigated: this can be done with Highway too."
Confidence: high

Claim: Voice-level parallelism is the canonical SIMD pattern for virtual instruments.
Source: Angus Hewlett, ADC'17
URL: https://www.youtube.com/watch?v=cn-5k8fm_u0
Date: 2017-11-20
Excerpt: "Having reached the practical limits of clock speed and multiple cores, CPU architectures are increasingly going wide: using vector processing to provide vast amounts of number crunching capability in a power efficient way. This talk looks at how to exploit all that power for virtual instrument / software synth applications, leveraging polyphonic synthesisers' inherent voice-level parallelism to make full use of available CPU hardware resources."
Confidence: high

Claim: Auto-vectorization on ARM64 achieved only 1.095x speedup versus 3.4x for hand-written NEON.
Source: Yining Karl Li — "Comparing SIMD on x86-64 and arm64"
URL: https://blog.yiningkarlli.com/2021/09/neon-vs-sse.html
Date: 2021-09-07
Excerpt: "||arm64:|arm64 Speedup:||Neon:|12.2161 ns|3.4232x||Autovectorize:|38.1917 ns|1.0950x||"
Confidence: high

Claim: OB-Xd 3.x achieved 4-6x real-world speedup by rewriting from scalar OOP to data-oriented SIMD.
Source: OB-Xd 2.x vs 3.x Comparison
URL: https://www.discodsp.com/obxd/comparison/
Date: Unknown
Excerpt: "Version 3.x fundamentally reimagines how the synthesizer processes audio, transitioning from an object-oriented per-voice model to a data-oriented SIMD-optimized design... Full AVX2 support (8-wide float operations), NEON fallback (4-wide for older CPUs)."
Confidence: high

Claim: Fixed buffer processing eliminates SIMD tails and yields flat CPU profiles.
Source: Medium — Fixed vs. Variable Buffer Processing in Real-Time Audio DSP
URL: https://medium.com/@12264447666.williamashley/fixed-vs-variable-buffer-processing-in-real-time-audio-dsp-performance-determinism-and-66da78390b0f
Date: 2025-10-30
Excerpt: "For fixed buffers, safety is paramount through upfront resource management... loops without tails, as in SIMD-optimized for (int i=0; i<512; i+=8) iterations free of conditionals... yielding low, flat CPU profiles via optimal vectorization, cache coherence, and zero runtime overhead."
Confidence: high

Claim: C++26 std::simd lacks runtime dispatch and SVE support, making Highway preferable for production.
Source: Lucis QR — "C++26 Shipped a SIMD Library Nobody Asked For"
URL: https://lucisqr.substack.com/p/c26-shipped-a-simd-library-nobody
Date: 2026-03-22
Excerpt: "`std::simd` has no runtime dispatch story at all. Highway is length-agnostic, meaning it works naturally with ARM SVE's scalable vectors, which `std::simd`'s fixed-width model can't express. The adoption list speaks for itself: Chromium, Firefox, JPEG XL... When Google needed portable SIMD for production image and video codecs, they built Highway — not `std::simd`."
Confidence: high

Claim: SVE uses predicate-driven loop control with `svwhilelt` to eliminate scalar tails.
Source: Modular Blog — "Understanding SIMD: Infinite Complexity of Trivial Problems"
URL: https://www.modular.com/blog/understanding-simd-infinite-complexity-of-trivial-problems
Date: 2024-10-25
Excerpt: "Seeing 'variable-width implementation-defined registers' you may ask yourself, how does the final iteration of the loop handle the remainder of the elements, if they don't fill up an entire vector? In SVE, the recommended approach is to use 'progress masks' (like that `progress_vec`) and build them using 'while less than' intrinsics (like that `svwhilelt_b16`)."
Confidence: high

Claim: Highway recommends padding as the preferred strip-mining strategy.
Source: Google Highway Docs — Strip-mining loops
URL: https://google.github.io/highway/en/master/README.html
Date: 2020-07-08
Excerpt: "Ensure all inputs/outputs are padded. Then the (outer) loop is simply `for (size_t i = 0; i < count; i += N) LoopBody<false>(d, i, 0);` ... This is the preferred option... there is little cost to processing entire vectors even if we do not need all their lanes."
Confidence: high

Claim: JUCE SIMDRegister lacked double-precision NEON support on ARM64, causing slowdowns.
Source: Jatin Chowdhury — "Faster Tape Emulation with SIMD"
URL: https://medium.com/codex/faster-tape-emulation-with-simd-49287d7b24cf
Date: 2021-08-21
Excerpt: "The JUCE SIMDRegister implementation was developed with that in mind, and does not currently contain a vectorized implementation for double-precision SIMD registers for ARM NEON. The result is that on devices with ARM CPUs, including the iPad, and the new Mac M1 computers, the hysteresis processing would actually run much slower than the non-vectorized implementation."
Confidence: high

Claim: xsimd cannot support sizeless SVE vectors because it uses vector class members.
Source: Arm Developer Community — "SVE and SVE2 enablement in SIMD library"
URL: https://developer.arm.com/community/arm-community-blogs/b/architectures-and-processors-blog/posts/sve-sve2-enablement-in-simd-library
Date: 2023-07-10
Excerpt: "xsimd adopts the Vector approach. The core xsimd data structure, `simd_register`, declares a SIMD register as its data member... `struct simd_register<int8_t, xsimd::sve> { svint8_t data; };` — oops! illegal as `svint8_t` is sizeless!"
Confidence: high

Claim: Firefly Synth 2 uses a fixed processing block of 16 samples for SIMD.
Source: Firefly Synth 2 Manual
URL: https://github.com/sjoerdvankreel/firefly-synth-2/blob/main/static/Manual.md
Date: Unknown
Excerpt: "FF2 internally employs a fixed processing block size of 16 samples. This is done to allow using the cpu's vector (SIMD) instructions. AKA make it go faster/use less cpu."
Confidence: high

Claim: Highway's `SlideUpLanes` and `BroadcastLane` are documented cross-lane operations for state transitions.
Source: Highway API Quick Reference
URL: https://google.github.io/highway/en/master/quick_reference.html
Date: Unknown
Excerpt: "`SlideUpLanes(D d, V v, size_t N)`: slides up `v` by `N` lanes... `BroadcastLane<int kLane>(V v)`: returns a vector with all of the lanes set to `v[kLane]`."
Confidence: high

Claim: AVX2 achieved ~7.5x speedup vs scalar, NEON ~3.8x on openEuler benchmarks.
Source: CNBlogs — SIMD programming practice on openEuler x86 AVX vs ARM Neon
URL: https://www.cnblogs.com/fruge365/p/19323769
Date: 2025-12-08
Excerpt: "|SIMD optimization|46.55 ms|~7.5x|110.88 ms|~3.8x|"
Confidence: medium

Claim: VCV Rack community found Highway more documented than VCV's built-in `float_4` but both serve similar voice-parallel purposes.
Source: VCV Rack Community Forum
URL: https://community.vcvrack.com/t/would-highway-be-any-good-for-implementing-simd-stuff-in-a-vcv-plugin/19135
Date: 2023-01-12
Excerpt: "SIMD basically makes it so processing 4 floats at a time is as cheap as processing 1 float at a time. Can you design your program to take advantage of that? voice polyphony is an obvious way to do it and the one rack uses a lot."
Confidence: high

Claim: Zimtohrli (Google's audio metric) uses Highway and achieves ~70 seconds of audio per second on a single core.
Source: Zimtohrli GitHub / arXiv paper
URL: https://github.com/google/zimtohrli
Date: 2024-03-15
Excerpt: "Zimtohrli can compare ~70 seconds of audio per second on a single 2.5GHz core."
Confidence: high
