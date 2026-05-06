## Dimension: Modern C++ Audio Framework Patterns

### Key Findings

- **C++23 `constexpr` and `consteval` are being actively explored for compile-time DSP graph compilation and optimization**, with the ADC 2025 talk "Building an Optimized DSP Framework in Modern C++" by Scott Carver presenting a prototype library that leverages these features to construct and optimize directed graphs representing DSP signal flows, including feedback loops and delays, at compile time [^1^]. The talk, inspired by Halide and Eigen, demonstrates "zero-cost Compile-time / Runtime Variant Values" and "Compile-time Graph Transformations" as practical techniques applicable to existing audio codebases [^1^].

- **JUCE's `dsp::AudioBlock` already provides a `std::span`-like non-owning view abstraction for audio buffers**, predating widespread `std::span` adoption. The documentation states it is a "Minimal and lightweight data-structure which contains a list of pointers to channels containing some kind of sample data. This class doesn't own any of the data which it points to, it's simply a view into data that is owned elsewhere" [^2^]. This pattern enables zero-copy sub-block processing, multi-channel views, and SIMD-friendly alignment without heap allocation in the real-time path.

- **`std::span` is gaining traction in audio SDKs as a replacement for raw pointer+length pairs**, with the `rt-vamp-plugin-sdk` (C++20) explicitly adopting it to eliminate heap allocations during processing: "The input buffer is provided either as a `TimeDomainBuffer` (`std::span<const float>`) or a `FrequencyDomainBuffer` (`std::span<const std::complex<float>>`)" [^3^]. The C++ Standards Committee's P1386R0 "A Standard Audio API for C++" (2019) proposed `std::experimental::audio::strided_span` as a native buffer view primitive [^4^].

- **Expression templates and CRTP are established patterns in high-performance DSP libraries**, with the Eigen library using CRTP to implement expression templates for optimized linear algebra [^5^], and the ADC 2025 talk explicitly listing "Expression Templates: Using C++'s template metaprogramming to defer computation, enabling optimized evaluation and graph transformations" as a core technique for modern audio frameworks [^1^]. A Computing and Informatics paper on policy-based DSP design notes that "template metaprogramming techniques... become very powerful tools for highly optimised code generation during compile time" and proves their applicability in real-world multimedia problems [^6^].

- **CLAP has emerged as a technically superior alternative to VST3**, offering per-note automation/modulation, non-destructive parameter modulation, collaborative multicore thread-pool support, and faster plugin scanning via metadata manifests [^7^]. However, Steinberg's October 2025 move to relicense VST3 under MIT (v3.8.0) — adding MIDI 2.0 support and Wayland preview — removes the primary friction that drove CLAP's creation [^8^]. Industry consensus on HackerNews notes that "having gone through implementation of pretty much every plug-in api in existence... there's no question that the whole world should just drop VST3 and move on to CLAP" [^9^], while simultaneously acknowledging that "you can wrap a clap plugin as a vst3 or AU today" as the lowest-friction path [^9^].

- **Lock-free and wait-free programming remain the dominant paradigms for audio thread state management**, with Jatin Chowdhury's widely-cited article demonstrating that `std::atomic<Envelope_Params>` is not lock-free for structs larger than 128 bits, and presenting atomic pointer exchange with delayed deletion as a pattern — while warning that naive `exchange`/`delete` risks use-after-free on the audio thread [^10^]. Dave Rowland's ADC 2025 talk "Lock-free Queues in the Multiverse of Madness" provides a comprehensive survey of SPSC, SPMc, and MPMC queue variants specifically for audio [^11^].

- **RealtimeSanitizer (RTSan) has landed in LLVM/Clang 20+ as a runtime tool to detect real-time safety violations**, using the `[[clang::nonblocking]]` attribute to mark real-time contexts and intercepting calls to `malloc`, `free`, `pthread_mutex_lock` and other blocking functions [^12^]. ADC 2024 also introduced Clang's compile-time "Performance Constraints" system to prevent blocking calls from non-blocking functions at compile time [^13^]. These tools represent a major shift toward automated enforcement of real-time safety rules that were previously only documented as best practices.

- **C++20 concepts and strongly-typed units are beginning to appear in professional audio codebases**, with Roth Michaels (Native Instruments) presenting "Using Strongly-Typed Units in Digital Audio Software" at ADC 2025, advocating for mp-units and the proposed C++29 quantities library (P3045) to prevent "API or math mistakes with units" that "can cause problems ranging from a digital audio processing outputting silence to crashing your Mars rover" [^14^].

- **C++ coroutines are not yet widely adopted for audio real-time processing**, with discussions on r/cpp revealing skepticism: "Coroutines don't solve making a program asynchronous. They don't really solve any part of it, except for maybe being able to suspend a function" [^15^]. The C++20 coroutine specification requires significant boilerplate (promise types, awaitables), and only C++23's `std::generator` provides a usable standard type [^16^]. No authoritative audio-specific coroutine frameworks were found.

- **Tracktion Engine requires C++20 and provides a full open-source DAW engine as a JUCE module**, offering "multitrack audio and MIDI, plugin hosting, realtime safe processing, editing model and transport, routing and rendering" [^17^]. This represents a higher-level architectural pattern than JUCE alone, enabling single developers to build full DAWs — as demonstrated by the solo-built Signals & Sorcery generative DAW [^18^].

- **FAUST and HISE represent two divergent DSL-to-C++ compilation approaches**: FAUST is a functional DSL compiling to C++, C, LLVM IR, WebAssembly, Rust, etc., with "code generated by Faust... usually more efficient than handwritten code" [^19^]. HISE's scriptnode allows visual DSP network construction that compiles to C++ nodes using heavy template metaprogramming (`scriptnode::container::chain`, `scriptnode::wrap::fix<N, T>`) [^20^].

- **Benchmarks of C++ standard evolution show mixed results for audio-relevant workloads**: A Packt study comparing arithmetic mean implementations across C++98 to C++23 found "C++11 and C++14 perform the best, while C++17's `std::reduce` introduces a significant slowdown" and "C++23 improves over C++17 but does not fully regain the efficiency of C++11 and C++14" [^21^]. This suggests that newer standard features may introduce overhead unless used carefully.

### Major Sources & Authorities

- **ADC 2025 "Building an Optimized DSP Framework in Modern C++" (Scott Carver)**: The primary authoritative source for this dimension. Scott Carver (ex-Native Instruments, ex-Adobe, SuperCollider contributor) presented a prototype C++23/26 framework with constexpr graph compilation, expression templates, and Halide/Eigen-inspired separation of algorithm from execution strategy. The talk abstract is the most detailed public description of cutting-edge compile-time audio DSP patterns [^1^].

- **JUCE `dsp::AudioBlock` Documentation**: Official reference for JUCE's existing non-owning audio buffer view abstraction, demonstrating that Manifold's JUCE base already has span-like patterns available without C++20 [^2^].

- **Jatin Chowdhury "Wait-Free Programming From Scratch" (2025)**: Highly practical, code-rich article on lock-free audio parameter passing. Chowdhury is a respected audio DSP developer (creator of CHOW plugins, contributor to Surge XT) [^10^].

- **Dave Rowland (Tracktion/Waveform CTO) ADC 2025 Lock-free Queues Talk**: Authoritative survey of lock-free queue variants for audio, with downloadable slides. Rowland is a regular C++ and audio conference speaker with deep real-time engine experience [^11^].

- **David Trevelyan & Chris Apple ADC 2024 "LLVM's Real-Time Safety Revolution"**: Introduced RTSan and Clang compile-time real-time constraints to the audio developer community [^13^].

- **CLAP Official Announcement (Bitwig/u-he, 2022) and HackerNews VST3 MIT Thread (Oct 2025)**: Primary sources for the plugin format landscape. The HackerNews thread includes direct commentary from developers who have implemented every major plugin API [^7^][^9^].

- **FAUST Documentation (Grame) and HAL Paper**: Authoritative on functional DSL compilation to multiple backends including WebAssembly and LLVM IR [^19^].

- **HISE Scriptnode Documentation and Forum**: Shows practical template-metaprogramming-based DSP node compilation in a JUCE-based open-source framework [^20^].

- **Roth Michaels (Native Instruments) ADC 2025 Strongly-Typed Units Talk**: Demonstrates adoption of C++20-era type safety patterns in commercial audio software [^14^].

- **rt-vamp-plugin-sdk (C++20)**: Real-world example of `std::span` adoption for zero-allocation audio feature extraction [^3^].

### Patterns & Best Practices

- **Non-owning buffer views (span-like)**: JUCE's `dsp::AudioBlock` and the proposed `std::experimental::audio::strided_span` both follow the pattern of carrying pointer+size without ownership, enabling zero-copy sub-block extraction and cache-friendly SIMD access. The rt-vamp-plugin-sdk returns computed features "by reference (as a `std::span`) to prevent heap allocations during processing" [^3^]. Manifold could adopt `std::span` via a C++17 polyfill (e.g., `gsl::span` or a custom implementation) for cross-cutting buffer APIs.

- **Compile-time / runtime variant values**: The ADC 2025 talk describes "approaches to building scalar compile-time-constant and runtime-variant values... without incurring memory or performance penalties" [^1^]. This pattern allows a single DSP algorithm to be instantiated with compile-time constants (e.g., filter order, channel count) for maximum optimization, while still supporting runtime variation via template specialization or `if constexpr`.

- **Lock-free atomic pointer exchange with hazard pointers / RCU**: For passing parameter structs larger than 128 bits across threads, the pattern is: (1) UI thread allocates new struct, (2) `atomic.exchange(new_ptr)`, (3) audio thread reads pointer, (4) deferred deletion of old struct when safe. Jatin Chowdhury's article and Timur Doumler's ADC talk on Read-Copy-Update both advocate variants of this pattern for wait-free audio state [^10^].

- **Expression templates for deferred DSP graph evaluation**: Rather than evaluating `y = (a * b) + c` as two separate loops (multiply then add), expression templates build a type representing the entire expression and evaluate it in a single fused loop. The ADC 2025 talk explicitly includes this as a framework technique, and Eigen's CRTP-based `MatrixBase<Derived>` is the canonical implementation [^1^][^5^].

- **Separating algorithm description from execution strategy**: Inspired by Halide and Eigen, the ADC 2025 prototype achieves "clean separation between algorithm description, data structures, and execution strategies... preserving algorithm clarity without embedding machine-specific details" [^1^]. This enables the same DSP graph to be executed time-parallel, voice-parallel, or block-based with different optimized schedules.

- **Fixed internal block processing with FIFO**: The "SAFE BUFFER" pattern (Separate, Allocate-once, Fixed internal, Eliminate unbounded) is widely documented as best practice for JUCE plugins, using a FIFO to handle variable host buffer sizes while internally processing fixed power-of-2 blocks for SIMD efficiency [^22^].

- **Strongly typed units for DSP quantities**: Roth Michaels advocates using mp-units to encode sample rate (`sample_rate`), frequency (`Hz`), gain (`dB`), time (`seconds`) in the type system, preventing unit-mismatch bugs at compile time [^14^].

- **Template metaprogramming for compile-time unrolling**: A Computing and Informatics paper demonstrates using recursive template instantiation to generate unrolled fast Walsh-Hadamard transforms at compile time, with assembly "closely matching optimised code written by a skilled programmer" [^6^].

### Controversies & Conflicting Claims

- **C++23/26 constexpr DSP: proven technique or premature optimization?** The ADC 2025 talk presents compile-time graph transformations as practical and immediately applicable: "These strategies will be presented individually so they can be applied immediately in existing audio code-bases" [^1^]. However, the benchmark results in the Packt C++98-to-C++23 study show that newer standard features can degrade performance if misused — C++17 `std::reduce` was ~2x slower than C++11 range-based loops [^21^]. There is an open question whether the compile-time complexity of constexpr DSP graphs pays off in real-world audio workloads vs. simpler hand-optimized approaches.

- **CLAP vs VST3: technical superiority vs market inertia**. HackerNews commentary from the OSSIA developer (who has implemented every plugin API) states "there's no question that the whole world should just drop VST3 and move on to CLAP" [^9^], citing CLAP's simpler C-based ABI, lack of COM-like interfaces, and better MIDI/parameter handling. Conversely, forum discussions note that "Betamax was better, too, than VHS. So better isn't always the winner" [^23^], and that Steinberg's MIT relicensing (Oct 2025) may reinvigorate VST3 adoption. JUCE has also committed to native CLAP support, which could accelerate adoption [^9^].

- **Coroutines for audio: promising or irrelevant?** The general C++ community sees coroutines as transformative for async I/O and game engines [^24^], but no audio-specific coroutine adoption was found. The r/cpp skepticism — "Coroutines don't solve making a program asynchronous" [^15^] — combined with the boilerplate-heavy C++20 implementation and lack of standard library support until C++23, suggests coroutines are not yet a practical pattern for real-time audio.

- **Zero-cost abstractions: compile-time vs binary-size tradeoffs**. The zero-overhead principle states "what you do use, you couldn't hand code any better" [^25^], but HackerNews commentary on the topic notes that "a very concrete example... was a C++ unit test suite where templates were used to generate several combinations... At one point our cloud builders ran out of memory" [^26^]. Heavy template metaprogramming for DSP can cause code bloat and excessive compile times, even if runtime performance is optimal.

- **std::span adoption in C++17 codebases**. While `std::span` is a C++20 feature, JUCE's `AudioBlock` (introduced in JUCE 5/6) already provides equivalent functionality. There is debate about whether backporting `std::span` to C++17 (via GSL or custom implementation) is worthwhile given that JUCE already has a working abstraction.

### Relation to Manifold Codebase

Manifold is currently C++17 with JUCE, using `std::atomic`, `std::shared_ptr` (builder thread), `std::unique_ptr` (PImpl), and standard containers. No `std::span`, concepts, coroutines, or C++20/23 features are used. The following analysis connects research findings directly to Manifold's architecture:

- **Buffer views**: Manifold should evaluate whether JUCE's `dsp::AudioBlock` can replace raw pointer+length patterns in node `process()` methods. `AudioBlock` provides `getSubBlock()`, `getSingleChannelBlock()`, and SIMD-aligned operations — equivalent to `std::span` but available today in C++17. If Manifold ever upgrades to C++20, `std::span` could serve as a cross-framework abstraction decoupled from JUCE.

- **Compile-time graph optimizations**: The ADC 2025 prototype's "Compile-time Graph Transformations" and "Expression Templates" are directly relevant to Manifold's node graph architecture. Manifold's builder thread already constructs a directed graph; moving some graph analysis (e.g., dead-node elimination, execution order caching, or buffer reuse planning) to `constexpr` evaluation could reduce runtime overhead. However, Manifold's feedback-loop handling and dynamic graph restructuring may limit how much can be done at compile time.

- **Lock-free state management**: Manifold's extensive use of `std::atomic` aligns with industry best practice. The research confirms that for parameter structs larger than 128 bits (common in Manifold nodes), atomic pointer exchange with deferred deletion is the standard wait-free pattern [^10^]. Manifold should audit its `std::atomic` usage for lock-freedom guarantees (`atomic.is_lock_free()`) and ensure that any pointer-based exchange avoids use-after-free on the audio thread.

- **Template metaprogramming for node types**: HISE's scriptnode demonstrates that JUCE-based frameworks can use heavy template metaprogramming (`container::chain`, `wrap::fix<N,T>`) for type-safe DSP node composition [^20^]. Manifold's node system could adopt CRTP for compile-time node interface enforcement, eliminating virtual function overhead in the inner processing loop while preserving runtime polymorphism at the graph level.

- **Plugin format strategy**: Manifold's JUCE base provides VST3, AU, and AAX support out of the box. CLAP support is coming to JUCE natively [^9^], and with VST3 now MIT-licensed [^8^], there is no urgent legal driver to migrate. However, CLAP's per-note modulation and thread-pool APIs are technically compelling for a modern synth framework. Manifold could evaluate adding CLAP as an output format once JUCE support stabilizes.

- **Realtime safety tooling**: Manifold should consider integrating RTSan (`-fsanitize=realtime`) into CI builds to automatically catch `malloc`, mutex locks, or other blocking calls in the audio callback. The `[[clang::nonblocking]]` attribute can document real-time contracts directly in code.

- **Strongly typed units**: Manifold's parameter system (sample rates, frequencies, decibel gains) could benefit from compile-time unit checking via mp-units or a lightweight custom strong type wrapper, preventing the "Mars rover" category of unit-conversion bugs [^14^].

- **Coroutines**: Not recommended for Manifold at this time. No audio-specific adoption was found, and the C++20 coroutine implementation requires too much custom promise/awaitable boilerplate for limited benefit in deterministic real-time callbacks.

- **C++ standard upgrade path**: Tracktion Engine's requirement of C++20 [^17^] demonstrates that major JUCE-based audio projects have successfully migrated. Manifold could incrementally adopt C++20 features (concepts for node type constraints, `std::span` for buffer views, `requires` clauses for template interfaces) without a full framework rewrite. However, the Packt benchmark caution — that newer features can degrade performance if misused [^21^] — argues for careful, measured adoption with profiling.

### Recommended Improvements / Opportunities

1. **Adopt `dsp::AudioBlock` or a C++17 `span` polyfill for all node process methods**: Replace raw `float*` + `numSamples` parameters with non-owning view types that carry size information, enable bounds-checking in debug builds, and support zero-copy sub-block extraction. This is zero runtime cost and improves safety.

2. **Audit `std::atomic` usage for lock-freedom and apply pointer-exchange pattern for large structs**: Verify `std::atomic<T>::is_lock_free()` for all types used in audio-thread communication. For non-lock-free structs, switch to `std::atomic<T*>` exchange with a delayed-free queue (or JUCE's `AbstractFifo` / `SingleWriterSingleReader` patterns) to achieve wait-free behavior.

3. **Experiment with `constexpr` for graph topology analysis**: Move graph validation, execution order computation, and buffer allocation planning to compile-time or builder-time `constexpr` evaluation. Even if full compile-time graph compilation is not feasible for Manifold's dynamic graphs, static node configuration (channel counts, buffer sizes) can be promoted to template non-type parameters for better optimization.

4. **Add RTSan to CI/debug builds**: Compile Manifold with `-fsanitize=realtime` (Clang 20+) and mark `processBlock` and internal node `process()` methods with `[[clang::nonblocking]]` to catch real-time violations automatically during testing.

5. **Evaluate CRTP for node base classes**: Replace virtual `process()` dispatch with CRTP-based static dispatch in performance-critical inner loops, while keeping virtual dispatch at the graph/wiring level where flexibility is needed. This eliminates vtable overhead and enables inlining across node boundaries.

6. **Track JUCE CLAP support and plan format addition**: Once JUCE natively supports CLAP, Manifold should evaluate adding CLAP as a target format to take advantage of per-note modulation, thread-pool collaboration, and faster plugin scanning.

7. **Pilot strongly-typed units for a subset of parameters**: Introduce a lightweight `SampleRate`, `Frequency`, `Decibel` strong type wrapper (or mp-units) for a single node type to evaluate compile-time unit safety with minimal ecosystem disruption.

8. **Defer C++20 concepts and coroutines**: These features offer limited immediate value for Manifold's real-time path. Concepts could be useful for template node interface constraints during a C++20 migration, but coroutines should not be pursued for audio processing given the lack of industry adoption and real-time unsafety concerns.

9. **Follow the "algorithm / schedule / data" separation pattern**: Inspired by Halide/Eigen and the ADC 2025 prototype, separate Manifold's DSP algorithm definitions from execution strategy (block size, parallelism, buffer layout). This enables empirical benchmarking of different execution strategies on the same graph.

10. **Investigate expression templates for simple graph fusion**: For linear chains of nodes (e.g., gain → filter → gain), expression templates could fuse the operations into a single loop at compile time, reducing memory bandwidth and cache pressure. Start with a limited proof-of-concept on a two-node chain.

### Raw Evidence Log

Claim: C++23 constexpr can construct and optimize directed DSP signal flow graphs at compile time, including feedback loops and delays.
Source: ADC 2025 - Building an Optimized DSP Framework in Modern C++ (Scott Carver)
URL: https://conference.audio.dev/session/2025/building-an-optimized-dsp-framework-in-modern-c/
Date: 2025-11-12
Excerpt: "Compile-time Graph Transformations: Leveraging `constexpr` to construct and optimize directed graphs representing DSP signal flows, including handling feedback loops and delays."
Confidence: high

Claim: JUCE's dsp::AudioBlock is a non-owning view into audio data, providing span-like semantics without C++20.
Source: JUCE Documentation - dsp::AudioBlock
URL: https://docs.juce.com/master/classjuce_1_1dsp_1_1AudioBlock.html
Date: unknown
Excerpt: "This class doesn't own any of the data which it points to, it's simply a view into data that is owned elsewhere."
Confidence: high

Claim: std::span is being adopted in audio SDKs to eliminate heap allocations during processing.
Source: rt-vamp-plugin-sdk (GitHub)
URL: https://github.com/lukasberbuer/rt-vamp-plugin-sdk
Date: 2021-12-28
Excerpt: "The computed features are returned by reference (as a `std::span`) to prevent heap allocations during processing."
Confidence: high

Claim: CLAP offers technical advantages over VST3: simpler C-based ABI, no COM-like interfaces, better MIDI/parameter handling, per-note modulation, and thread-pool collaboration.
Source: HackerNews discussion on VST3 MIT license
URL: https://news.ycombinator.com/item?id=45678549
Date: 2025-10-23
Excerpt: "there's no question that the whole world should just drop VST3 and move on to CLAP... CLAP is much simpler and doesn't use COM-like system (VST3 resembles a Windows COM library with endless interfaces and GUIDs)."
Confidence: high

Claim: Steinberg relicensed VST3 SDK under MIT in October 2025 (v3.8.0), removing proprietary license requirements.
Source: Steinberg Official Press Release
URL: https://www.steinberg.net/press/2025/vst-3-8/
Date: 2025-10-28
Excerpt: "By releasing the VST 3.8 SDK, Steinberg transitions to the MIT Open Source License... Developers can adopt the MIT license for full open-source integration. Neither fees nor memberships are required."
Confidence: high

Claim: std::atomic for structs larger than 128 bits is not lock-free on most CPUs; atomic pointer exchange is the standard workaround.
Source: Jatin Chowdhury - Wait-Free Programming From Scratch
URL: https://jatinchowdhury18.medium.com/wait-free-programming-from-scratch-5ac6a65c23c4
Date: 2025-03-14
Excerpt: "most C++ compilers will fail to compile a `std::atomic<Envelope_Params>` if we assert that the atomic must also be lock-free... Since pointers are 64 bits on most modern CPUs, this type *will* be lock-free on most CPUs."
Confidence: high

Claim: Dave Rowland surveyed lock-free queue variants (SPSC, SPMc, MPMC) specifically for audio real-time systems at ADC 2025.
Source: ADC 2025 - Lock-free Queues in the Multiverse of Madness
URL: https://conference.audio.dev/session/2025/lock-free-queues-in-the-multiverse-of-madness/
Date: 2025-11-12
Excerpt: "Lock-free queues are the unsung heroes of audio software systems, quietly enabling ultra-low latency and thread-safe communication across a dizzying variety of scenarios."
Confidence: high

Claim: RealtimeSanitizer (RTSan) in Clang 20+ detects blocking calls in real-time contexts using `[[clang::nonblocking]]`.
Source: RealtimeSanitizer GitHub / LLVM Docs
URL: https://github.com/realtime-sanitizer/rtsan
Date: 2023-11-07
Excerpt: "RTSan considers any function marked with the `[[clang::nonblocking]]` attribute to be a real-time function. At run-time, if RTSan detects a call to `malloc`, `free`, `pthread_mutex_lock`, or anything else known to have a non-deterministic execution time... it raises an error."
Confidence: high

Claim: FAUST-generated code is "usually more efficient than handwritten code" for C and C++ backends.
Source: FAUST Documentation (Grame)
URL: https://faustdoc.grame.fr/manual/introduction/
Date: 2020-04-10
Excerpt: "Code generated by Faust is extremely optimized and usually more efficient than handwritten code (at least for C and C++)."
Confidence: medium (authoritative source but self-reported)

Claim: HISE scriptnode compiles visual DSP networks to C++ using template metaprogramming (container::chain, wrap::fix).
Source: HISE Forum - Compiling C++ nodes and Scriptnode Networks
URL: https://forum.hise.audio/topic/13470/compiling-c-nodes-and-scriptnode-networks
Date: 2025-09-17
Excerpt: "scriptnode::container::chain<scriptnode::parameter::plain<int,0>,scriptnode::wrap::fix<2,int>>"
Confidence: high

Claim: C++17 std::reduce can be ~2x slower than C++11/C++14 range-based loops, and C++23 does not fully recover performance.
Source: Packt Hub - From C++98 to C++23: The Arithmetic Mean, Benchmarked and Optimized
URL: https://medium.com/packt-hub/from-c-98-to-c-23-the-arithmetic-mean-benchmarked-and-optimized-048798e77ca4
Date: 2025-03-20
Excerpt: "C++11 and C++14 perform the best, while C++17's `std::reduce` introduces a significant slowdown. C++23 improves over C++17 but does not fully regain the efficiency of C++11 and C++14."
Confidence: medium (single benchmark, arithmetic mean only)

Claim: Tracktion Engine requires C++20 and provides a full open-source DAW engine as a JUCE module.
Source: Tracktion Engine GitHub
URL: https://github.com/Tracktion/tracktion_engine
Date: 2018-11-09
Excerpt: "Tracktion Engine is a fully featured, open source C++ audio engine that already powers a commercial DAW... N.B. Tracktion Engine requires C++20"
Confidence: high

Claim: Roth Michaels (Native Instruments) presented strongly-typed units for digital audio at ADC 2025 using mp-units.
Source: ADC 2025 - Using Strongly-Typed Units in Digital Audio Software
URL: https://conference.audio.dev/session/2025/using-strongly-typed-units-in-digital-audio-software/
Date: 2025-11-12
Excerpt: "The combination of user-defined types, conversion operators/constructors, and operator overloading in C++ give us the tools to use strong-types and avoid unit mistakes; std::chrono is a great example of this that everyone should be using."
Confidence: high

Claim: The C++ Standards Committee proposed std::experimental::audio::strided_span as a buffer view primitive in P1386R0.
Source: P1386R0 - A Standard Audio API for C++
URL: https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2019/p1386r0.pdf
Date: 2019-01-21
Excerpt: "std::experimental::audio::strided_span — A view into a buffer that has a known length and has a 'stride' into the underlying data such that all of the channels of a single frame, or all of the individual channels of the buffer are iterated over."
Confidence: high

Claim: Eigen uses CRTP to implement expression templates for compile-time optimization.
Source: parsiad.ca - An introduction to the curiously repeating template pattern
URL: https://parsiad.ca/blog/an-introduction-to-the-curiously-repeating-template-pattern/
Date: 2024-09-11
Excerpt: "the Eigen library uses CRTP to implement expression templates in order to optimize its usage."
Confidence: high

Claim: C++ coroutines are not widely adopted in serious production C++ code as of 2024.
Source: r/cpp - Is anyone using coroutines seriously?
URL: https://www.reddit.com/r/cpp/comments/18b8zpy/is_anyone_using_coroutines_seriously/
Date: unknown
Excerpt: "Coroutines don't solve making a program asynchronous. They don't really solve any part of it, except for maybe being able to suspend a function."
Confidence: medium (community opinion, not authoritative)

Claim: Template metaprogramming can generate fast Walsh-Hadamard transforms with assembly matching hand-optimized code.
Source: Computing and Informatics - Meta-programming and Policy-based Design as DSP Implementations
URL: https://www.cai.sk/ojs/index.php/cai/article/download/2018_2_269/884/10660
Date: unknown
Excerpt: "As many fast transform algorithms express a recursive nature, they are fairly easy to implement using template meta-programming, which results in assembly closely matching optimised code written by a skilled programmer."
Confidence: high (peer-reviewed paper)

Claim: Expression templates reduce temporary allocations by deferring evaluation until assignment.
Source: Medium - Write faster code with C++ Expression Templates
URL: https://aniketbiprojit.medium.com/write-faster-code-with-c-expression-templates-for-optimized-compile-time-evaluation-aff817de04ee
Date: 2025-09-21
Excerpt: "The problem is the wasted space every time x * x, y * y and their sum. More efficient way of calculating would be `(x[2]*x[2]) + (y[2]*y[2])`, but doing this impractical in most cases where n is much greater."
Confidence: medium (educational blog)

Claim: Lock-free code can be 2-3x faster than mutex-based code under high contention.
Source: dev.to - Multithreading in Modern C++: Lock-Free Programming
URL: https://dev.to/cear/multithreading-in-modern-c-lock-free-programming-memory-ordering-and-atomics-4cek
Date: 2025-11-04
Excerpt: "Results show: lock-free code can be 2-3 times faster under high contention."
Confidence: medium (synthetic benchmark)

Claim: VST3's parameter queue abstraction is harder to implement and has worse performance than sparse time-stamped events.
Source: HackerNews VST3 MIT Thread (comment by experienced plugin dev)
URL: https://news.ycombinator.com/item?id=45678549
Date: 2025-10-23
Excerpt: "The parameter value queue abstraction is harder to implement on both sides of the API, has worse performance, and doesn't provide much in benefit over sending a sparse list of time-stamped events and delegating smoothing to the plugin."
Confidence: high
