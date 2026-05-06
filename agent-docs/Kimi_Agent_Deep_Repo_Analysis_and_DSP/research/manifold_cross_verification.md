# Manifold Deep Research — Cross-Verification Results

## High Confidence Findings (Confirmed by ≥2 agents from independent sources)

### HC-1: Lock-free audio thread constraints are universally accepted
- Dim 01 (Bencina 2011, Doumler ADC20/22/24): No allocation, no locks, no I/O in audio callback
- Dim 05 (Medium 2025, Bencina 2011, Android docs): Dynamic memory allocation has unbounded timing
- Dim 08 (SAFE BUFFER checklist, JUCE forum consensus): Atomic parameters with acquire/release

### HC-2: SPSC queues are the canonical lock-free IPC for audio
- Dim 01 (IN-COM Data Systems 2025, JACK ringbuffer): Release-acquire pairing on head/tail indices
- Dim 07 (Paul Adenot Mozilla 2022, JUCE AbstractFifo): "Bread and butter data structure for RT audio"
- Dim 01 (Sarthak Sehgal 2025): `relaxed` ordering unsafe for cross-thread queue sync

### HC-3: Memory ordering must be release-acquire for queue indices, not relaxed
- Dim 01: Sehgal 2025 — relaxed allows reading buffer before producer finishes writing
- Dim 07: Consensus — acquire-release for SPSC indices, `seq_cst` only for global ordering
- Dim 08: Manifold nodes use `memory_order_acquire` for parameter loads (correct)

### HC-4: Google Highway is the industry-preferred SIMD abstraction over C++26 std::simd
- Dim 03 (NumPy NEP 54, Chrome/Firefox adoption): Highway has runtime dispatch, std::simd lacks it
- Dim 03 (Highway README): 5-10x speedups, 27 targets
- Dim 06 (C++26 critics): std::simd "arrived after the world moved on"

### HC-5: Manifold's builder/runtime graph split is industry-validated
- Dim 02 (HISE scriptnode, SuperCollider SynthDef, Tracktion Graph): Same mutable→immutable pattern
- Dim 06 (ADC 2025 C++ constexpr graphs): Compile-time separation is emerging best practice
- Dim 04 (HISE/HiseScript separation): Dual scripting VMs are established pattern

### HC-6: Lua must never run on audio thread; compiled graph is correct approach
- Dim 04 (Cantabile, REAPER, SuperCollider consensus): GC non-determinism makes Lua unsafe in RT
- Dim 01 (Bencina 2011): Scripting VMs are inherently non-deterministic
- Dim 02 (HISE scriptnode rationale): Interpreter overhead must be avoided in production

### HC-7: Pre-allocation in `prepare()` is the only safe memory strategy for RT audio
- Dim 05 (Bencina 2011, Medium 2025, Nathan Blair thesis): `AudioBuffer::setSize()` with `avoidReallocating=true`
- Dim 01 (SuperCollider Doug Lea allocator): Even specialized allocators are risky
- Dim 05 (StackOverflow SIMD): Alignment must be at least cache-line sized

### HC-8: Retirement queues (deferred destruction) are critical for lock-free graph swapping
- Dim 01 (Jatin Chowdhury 2025, Timur Doumler RCU): Old pointers cannot be deleted immediately
- Dim 05 (hazard-pointer philosophy): Scan before reclaim
- Dim 02 (Tracktion Graph continuity concern): State preservation during swaps

### HC-9: ARM NEON / SVE support missing from Manifold's Highway configuration is a significant gap
- Dim 03 (Highway docs): `HWY_NEON`, `HWY_NEON_BF16`, `HWY_SVE`, `HWY_SVE2` available
- Dim 09 (Apple Silicon market): ARM64 is dominant in mobile and increasingly desktop
- Dim 03 (NEP 54 NumPy): Highway chosen specifically for ARM scalability

### HC-10: JUCE + CMake + export system is well-architected but needs CI and modern tooling
- Dim 09 (Pamplejuce, JUCE-Plugin-Starter): CI, sccache, PluginVal, Ninja are standard
- Dim 06 (CLAP gaining adoption): Modern format with per-note modulation
- Dim 09 (Steinberg VST3 MIT license 2025): No urgent legal driver to migrate from VST3

---

## Medium Confidence Findings (1 authoritative source)

### MC-1: SeqLock could outperform 20+ individual atomics in `AtomicState`
- Dim 01 (Doumler ADC24): SeqLock for audio-thread writes, non-RT reads
- Needs benchmarking on Manifold's specific access patterns

### MC-2: Control-rate scheduling (hoisting) could improve efficiency
- Dim 02 (FAUST compiler): Expressions involving slow outputs moved out of inner loop
- Dim 08: Manifold nodes process all parameters at sample rate

### MC-3: Node fusion could yield significant speedups
- Dim 02 (HISE C++ generator): 3 addition nodes → single assembly instruction
- Dim 06 (ADC 2025 expression templates): C++23 constexpr fusion demonstrated

### MC-4: Multi-threaded graph execution could scale on multi-core
- Dim 02 (Tracktion Graph aim, ACE Studio): Independent branches on worker threads
- Dim 01 (Tracktion `LockFreeMultiThreadedNodePlayer`): Spin-based worker scheduling

### MC-5: Virtual-memory mirroring could simplify capture buffers
- Dim 07 (Tasty Pixel TPCircularBuffer, Fons Adriaensen): `mmap` for contiguous ring buffer
- Platform-specific; not viable for Android without MMU

### MC-6: ImGui `thread_local` patch mandatory for multi-instance plugin safety
- Dim 10 (Krasjet imgui_juce): Global `GImGui` causes crashes with multiple instances
- Dim 09: Must verify patch is applied in Manifold's ImGui integration

### MC-7: Generational GC (Lua 5.4) outperforms incremental mode
- Dim 04 (lua-users.org 2018): "VERY GOOD, AWESOME" memory and time improvements
- Needs validation with Manifold's allocation patterns

### MC-8: Denormal handling is missing from reviewed nodes
- Dim 08 (EarLevel Redmon): Practical strategies needed
- Dim 05: `flushDenormalToZero` recommended for x86

---

## Low Confidence Findings (Weak sourcing or single unverified claim)

### LC-1: Firefly Synth fixed 16-sample blocks eliminate tail conditionals
- Dim 03: Single source, specific to one plugin architecture

### LC-2: C++ coroutines for audio async processing
- Dim 06: No audio-specific adoption found; likely unsuitable for RT callbacks

### LC-3: WebGPU as future graphics backend
- Dim 10: HackerNews critique suggests API may be "awkward" long-term

### LC-4: xsimd vs Highway performance for audio specifically
- Dim 03: Limited audio-specific benchmarks; general computing comparisons only

---

## Conflict Zones

### CZ-1: Auto-vectorization vs Manual SIMD
- **Dim 03**: DevelopersIO found auto-vectorized scalar sometimes outperforms hand AVX2
- **Dim 03**: Yining Karl Li found auto-vectorization on ARM64 gave only 1.095x vs 3.4x hand NEON
- **Resolution**: Context-dependent. Simple FIR/gain loops auto-vectorize well. Stateful/branchy/non-linear DSP (ADSR, bit-crusher) requires manual SIMD. Manifold's Highway usage on stateful nodes is justified.

### CZ-2: Lock-free vs mutex for non-RT threads
- **Dim 01**: Bencina/Doumler advocate pure lock-free
- **Dim 07**: Timur Doumler ADC24 argues locks can be safe under specific conditions
- **Resolution**: Audio callback must be lock-free. Background threads may use mutexes with priority inheritance or progressive back-off spinlocks.

### CZ-3: ImGui in production plugins
- **Dim 09**: Some argue ImGui "not typically used for end-user UI"
- **Dim 09**: DISTRHO dear-plugins and CLAP saw demo prove ImGui works in production
- **Resolution**: ImGui is viable for production with proper multi-instance safety (`thread_local` patch) and custom widget styling.

### CZ-4: Fixed vs variable internal block size
- **Dim 02**: Fixed blocks are SIMD/cache-friendly; VST3 permits variable
- **Dim 05**: FL Studio uses variable buffering for PDC
- **Resolution**: Manifold's hybrid chunking strategy is correct — fixed internal blocks with chunking at host block boundaries.

### CZ-5: DMG vs PKG for macOS distribution
- **Dim 09**: DMGs "lightweight and explicit"; Apple broke drag-to-symlink in Gatekeeper
- **Dim 09**: PKG installers more reliable but heavier
- **Resolution**: PKG recommended for 2025+ macOS distribution.

---

## Temporal Notes
- VST3 MIT license: October 2025 (very recent — changes legal calculus)
- Steinberg relicensing removes proprietary constraints
- RTSan (`-fsanitize=realtime`): Clang 20+ (2025) — newly available tooling
- WebGPU: Spec stable but audio-visual adoption nascent
