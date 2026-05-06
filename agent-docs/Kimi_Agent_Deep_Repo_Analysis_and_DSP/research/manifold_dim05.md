# Dimension 5: Memory Management & Allocation-free Constraints

## Key Findings

- **Absolute prohibition of heap allocation in `processBlock`** is the foundational rule of real-time audio programming. Ross Bencina's canonical essay "Real-time audio programming 101: time waits for nothing" enumerates three critical reasons: (1) allocators may use locks contended by all threads, (2) the OS may page memory to/from disk, and (3) allocation algorithms have unpredictable worst-case timing [^20^]. The JUCE `AudioBuffer::setSize()` method, while providing an `avoidReallocating` flag, defaults it to `false` — a well-documented foot-gun for beginners [^218^][^239^].

- **Pre-allocation in `prepareToPlay` (or equivalent initialization scope)** is the universally accepted pattern. The "3-scope rule" — Initialization Scope, Real-time Scope, Non-real-time Scope — is now standard JUCE doctrine, formalized in both community blog posts and Nathan Blair's thesis [^1^][^218^]. All scratch buffers, FFT plans, delay lines, and temporary working memory must be allocated before the audio callback begins.

- **JUCE `AudioBuffer`'s `avoidReallocating` flag is dangerous when misunderstood**. The flag only avoids reallocation if *neither* the channel count *nor* the length in samples increases. If the new size is larger, it *will* allocate regardless of the flag [^159^][^239^]. Furthermore, `setSize()` throws `std::bad_alloc` if allocation fails — an exception in the audio thread, which itself is a real-time violation [^239^].

- **Custom real-time allocators exist at multiple maturity levels**. SuperCollider implements Doug Lea's allocator algorithm in a thread-specific real-time allocator (`RTAlloc`/`RTFree`) [^20^][^281^]. AudioMulch uses per-thread size-segregated memory pools [^20^][^282^]. The modern `detalloc` library provides O(1) deterministic allocation with configurable pool presets including `DET_USE_CASE_AUDIO` [^157^]. Timur Doumler's CppCon 2021 talk demonstrates `std::pmr::monotonic_buffer_resource` backed by pre-allocated stack memory as a real-time-safe STL-compatible approach [^285^].

- **SIMD alignment is critical for performance, not just correctness**. Highway's `HWY_ALIGN` and `HWY_ALIGN_MAX` macros ensure arrays are suitable for `Load()`/`Store()` operations, with `HWY_ALIGN_MAX` aligning to an upper bound for all targets on the platform [^36^]. Cache-line alignment (typically 64 bytes) prevents false sharing in multi-threaded DSP code [^284^]. The `hwy::AllocateAligned<float>()` function used in Manifold provides platform-portable aligned allocation.

- **Deferred destruction / retirement patterns are essential for object lifetime management across threads**. When a non-real-time thread replaces an object that the audio thread may still reference, immediate deletion risks use-after-free. The accepted solutions include: (1) SPSC queues for queuing retired objects to a cleanup thread [^241^][^290^], (2) RCU (Read-Copy-Update) for wait-free reads with deferred reclamation [^90^], (3) SeqLock for wait-free writes [^95^], and (4) Hazard Pointers for lock-free memory reclamation [^197^]. The JUCE forum explicitly recommends: "just have the main thread do the deallocation when it needs to 'overwrite' a position on the queue" [^290^].

- **STL containers are generally unsafe on the audio thread without custom allocators**. The C++ standard specifies nothing about execution time, memory allocation, or lock usage for STL containers [^218^]. `std::stable_sort` is a notable real-time hazard. The only safe way to use STL containers in real-time code is with a custom allocator mapped to a pre-allocated memory pool — as SuperCollider's documentation explicitly states: "The only way the STL containers can be used is by providing an Allocator, which maps to the allocating functions of the server" [^280^].

- **Placement `new` enables object reconstruction in pre-allocated memory without heap allocation**. This is the standard technique for using C++ objects in heap-banned contexts (embedded, real-time audio). The memory buffer must be properly aligned using `alignas`, and destruction must be manual (`ptr->~T()`) since `delete` must never be called on placement-new pointers [^160^][^286^][^288^].

- **Memory profiling and allocation tracking are critical for verifying real-time safety**. The Tracy profiler supports memory allocation tracking with callstacks, enabling detection of heap fragmentation and long-lived allocations [^276^][^279^]. Interrupt/MemFault's blog describes implementing a custom allocator with `mmap()` on startup and managing free/used lists to eliminate OS allocation unpredictability [^164^].

- **RAII vs manual memory management is a nuanced debate in real-time audio**. While RAII dramatically reduces memory bug rates, real-time constraints require careful design: `std::unique_ptr` is safe for ownership transfer during initialization but must never be constructed/destroyed in `processBlock`; `std::shared_ptr` reference counting is atomic but introduces overhead and potential non-lock-free implementations [^243^][^218^]. Manual placement-new with explicit lifetime management is often preferred for objects that must be reconstructed in pre-allocated memory.

## Major Sources & Authorities

| Source | Authority | Relevance |
|--------|-----------|-----------|
| Ross Bencina, "Real-time audio programming 101: time waits for nothing" (2011) | **Landmark** | The canonical essay on real-time audio constraints; defines the "no malloc in audio callback" rule [^20^] |
| Nathan Blair, "Developing Audio Plugins" thesis (2023) | **Academic / Practitioner** | Comprehensive JUCE-specific analysis of real-time safety, library hazards, and thread synchronization [^218^] |
| Timur Doumler, ADC talks (2020-2024) + Crill library | **Industry Expert / ISO C++** | Wait-free synchronization, RCU, SeqLock, and `std::pmr` for real-time; reference implementations [^90^][^92^][^95^][^285^] |
| SuperCollider docs / Ross Bencina chapter | **Open-source Authority** | Thread-specific real-time allocator (`RTAlloc`) and dynamic graph manipulation via lock-free queues [^281^][^280^] |
| JUCE `AudioBuffer` documentation + forums | **Framework Authority** | Official semantics of `setSize()`, `avoidReallocating`, and `setDataToReferTo()` [^239^][^159^][^161^] |
| "Fixed vs. Variable Buffer Processing in Real-Time Audio DSP" (Medium, 2025) | **Practitioner** | JUCE-specific 3-scope rule, SAFE BUFFER checklist, hybrid FIFO architecture [^1^] |
| Michael Maged, "Hazard Pointers" (IBM Research) | **Academic** | Seminal paper on lock-free memory reclamation; constant expected amortized time per retired node [^197^] |
| `detalloc` GitHub project | **Open-source Tool** | O(1) deterministic allocator with audio-specific preset [^157^] |
| Highway (`hwy`) documentation | **Google OSS** | SIMD alignment primitives and portable aligned allocation [^36^] |
| "Design Patterns for Real-Time Computer Music Systems" (ICMC 2005) | **Academic** | Fixed up-front allocations, per-thread memory pools, real-time garbage collection patterns [^282^] |
| Sudara Williams / Melatonin JUCE tips | **Community Authority** | Avoid static memory in plugins, treat drawing like audio thread [^22^] |

## Patterns & Best Practices

- **The 3-Scope Rule**: All memory allocation in `prepareToPlay` / constructor; zero allocation in `processBlock`; all heavy/non-deterministic work in GUI/background threads [^1^][^218^].

- **Pre-allocate for worst-case**: Allocate buffers for `maxSamplesPerBlock` (or a fixed internal block size) in `prepareToPlay`, then reuse with `avoidReallocating=true` only when the size does not exceed the pre-allocated capacity [^1^][^242^].

- **Hybrid FIFO-to-fixed-block processing**: Accept variable host buffer sizes, accumulate into a FIFO, process fixed internal blocks (e.g., 64-512 samples) for SIMD/cache coherence, and report latency via `setLatencySamples()` [^1^].

- **Use `setDataToReferTo()` for view semantics**: When pre-allocated memory is owned elsewhere (e.g., a memory pool), `AudioBuffer` can be made to point to it without taking ownership — but beware that resizing will cause internal reallocation and copying, breaking the external reference [^239^].

- **Per-thread memory pools**: Allocate a large block per thread at startup; use deterministic O(1) allocation algorithms (free lists, segregated sizes) within the audio callback. No locks, no OS calls [^20^][^282^].

- **Placement `new` + manual destruction for pool objects**: Pre-allocate raw aligned buffers; construct objects in-place with placement `new`; destroy with explicit destructor calls; never use `delete` [^160^][^286^].

- **SPSC queue for deferred destruction**: Retire objects by enqueueing pointers to a single-producer single-consumer lock-free queue; consume and actually delete from a non-real-time thread [^241^][^290^].

- **Avoid `static` and `thread_local` in plugins**: DAWs may run multiple plugin instances in the same process or sandbox them; `static` creates shared mutable state that breaks isolation [^22^].

- **Cache-line alignment for thread-shared data**: Place producer/consumer indices on separate cache lines using `alignas(64)` to prevent false sharing in lock-free queues [^241^][^284^].

- **Use `std::pmr::monotonic_buffer_resource` for temporary allocations**: Backed by pre-allocated stack or thread-local storage, with `std::pmr::null_memory_resource()` as the upstream to guarantee no fallback to heap [^285^].

## Controversies & Conflicting Claims

- **`avoidReallocating` semantics confusion**: Multiple JUCE forum threads document confusion about when `avoidReallocating` actually prevents allocation. The official docs state it only works if *neither* channels nor samples increase, yet many developers assume it is a general safety flag [^161^][^162^][^245^]. Fabian Renn-Giles (JUCE core dev) amended `makeCopyOf` to support `avoidReallocating` after forum pressure, but changing the default assignment operator would break existing code [^161^].

- **Are spinlocks acceptable on the audio thread?**: Timur Doumler's ADC 2020 talk demonstrates that `try_lock` on a spinlock is real-time-safe (single atomic operation), but `lock` on the non-audio thread spins at ~200M ops/sec, maxing out CPU. Progressive backoff spinlocks are presented as a better solution, but the community remains divided between "no locks ever" and "try-lock-only is fine" [^89^][^92^].

- **STL containers in real-time code**: SuperCollider's docs say "generally not recommended" but possible with custom allocators [^280^]. Timur Doumler's CppCon talk shows `std::pmr::vector` with `monotonic_buffer_resource` as viable [^285^]. However, the general consensus remains: even with custom allocators, STL containers introduce indirection and code bloat that may harm cache coherence in tight DSP loops.

- **Atomic `shared_ptr` for cross-thread object sharing**: `atomic_shared_ptr` is theoretically appealing but "correct and lock-free implementations are hard to come by" and "suffer from slow performance, poor portability, and more complexity" [^90^]. RCU and SeqLock are presented as superior alternatives, but RCU has higher memory overhead and requires grace-period tracking.

- **Real-time garbage collection**: The ICMC 2005 paper notes that SuperCollider and Serpent use real-time GC, while AudioMulch and Aura use per-thread pools [^282^]. Most modern audio developers reject GC entirely for DSP threads due to unpredictability, but the academic computer-music community has proven it can work with incremental collectors.

- **Is `std::vector::reserve()` sufficient for real-time safety?**: In theory, `reserve()` plus bounded `push_back` avoids reallocation. In practice, the C++ standard does not guarantee that `reserve()` will not reallocate (though `std::vector` growth is documented as amortized O(1)), and `bulk insertion methods may reallocate even when not necessary` [^198^]. Audio developers generally avoid `std::vector` mutation in `processBlock` entirely.

## Relation to Manifold Codebase

Manifold's architecture demonstrates sophisticated adherence to real-time memory constraints, with some areas worthy of deeper scrutiny:

1. **Pre-allocated scratch buffers**: Manifold's `inputViews_`, `outputViews_`, `inputAccumulators_`, `chunkBuffer_`, `rawChunkBuffer_`, and `sidechainChunkBuffer_` are all pre-allocated in `prepare()` — consistent with the 3-scope rule [^1^]. The use of `juce::AudioBuffer<float>` for these buffers is idiomatic JUCE, but care must be taken that `setSize()` is never called in `process()` with `avoidReallocating=false` (the default). If Manifold resizes any `AudioBuffer` member during processing, it must pass `true` for `avoidReallocating` and guarantee the new size never exceeds the `prepare()` pre-allocation.

2. **Highway-aligned state**: The use of `hwy::AllocateAligned<float>(numLanes)` aligns with Highway's documented best practices for SIMD memory [^36^]. This ensures cache-line-friendly access patterns and avoids the alignment-related performance penalties documented in StackOverflow SIMD discussions [^168^]. Manifold should verify alignment is at least 64 bytes (cache line size) for multi-core scenarios to prevent false sharing if these buffers are accessed by multiple threads [^284^].

3. **Retirement pattern (`SPSCQueuePtr` + `pendingSlotDestroy`)**: This is a textbook implementation of deferred destruction. By queuing old `GraphRuntime` instances and `DSPPluginScriptHost` slots for later cleanup, Manifold avoids use-after-free without blocking the audio thread. This pattern maps directly to Timur Doumler's recommended SPSC queue approach [^290^] and the hazard-pointer-style "scan before reclaim" philosophy [^197^]. However, the implementation should be audited to ensure the consumer thread (doing actual destruction) is truly non-real-time and that the queue length is bounded.

4. **CaptureBuffer circular buffer**: The per-channel `offsetToNow` design in a `juce::AudioBuffer` backing is a common circular buffer pattern. Potential concerns: (a) ensure `juce::AudioBuffer` was pre-allocated to the full circular buffer size in `prepare()`, not grown incrementally; (b) per-channel offsets should be cache-line-aligned if multiple threads write to different channels concurrently; (c) the modulo arithmetic for wraparound should use power-of-2 sizes with bitwise masking rather than `%` for deterministic performance.

5. **No heap in `process()` — verification challenge**: While Manifold's architecture enforces this rule, there is no substitute for runtime verification. Tools like Tracy profiler with memory allocation tracking [^276^], or overriding `operator new`/`delete` with assertions in debug builds, would provide automated enforcement. The SuperCollider community's `RTAlloc` model includes `ClearUnitIfMemFailed` macros that degrade gracefully on allocation failure — Manifold could adopt similar defensive patterns for its initialization scope.

6. **Memory fragmentation risk**: If Manifold allocates many small `hwy::AllocateAligned` blocks and `juce::AudioBuffer` objects independently, fragmentation could become an issue over long sessions. Consolidating into a single arena or using a `std::pmr::monotonic_buffer_resource` upstream for related allocations [^285^] would improve locality and reduce allocator overhead.

## Recommended Improvements / Opportunities

1. **Implement allocation-tracking debug instrumentation**: Override global `operator new`/`delete` (or use Tracy's `TracyAllocS`/`TracyFreeS` macros [^276^]) to assert-fail if any allocation occurs on the audio thread in debug builds. This converts the "no heap in process()" rule from convention to enforced invariant.

2. **Audit all `AudioBuffer::setSize()` calls**: Ensure every call in the codebase uses `avoidReallocating=true` when invoked outside `prepare()`, and that the size never exceeds the `prepare()` pre-allocation. Consider wrapping `AudioBuffer` in a `FixedSizeAudioBuffer` utility class that deletes `setSize()` from the public API.

3. **Add cache-line alignment annotations**: Use `alignas(64)` on thread-shared state (FIFO indices, retirement queue heads, atomic counters) to prevent false sharing. Verify that `hwy::AllocateAligned` alignment is at least cache-line sized for buffers that may be accessed concurrently.

4. **Consolidate scratch buffers into a single arena**: Instead of independent `chunkBuffer_`, `rawChunkBuffer_`, `sidechainChunkBuffer_`, etc., allocate one large contiguous block in `prepare()` and partition it manually. This improves cache locality, eliminates multiple allocator calls, and makes memory profiling simpler.

5. **Document the retirement queue bound**: Ensure `SPSCQueuePtr` has a documented maximum depth and that overflow behavior (drop oldest? block? assert?) is specified and tested. Unbounded queues are themselves a memory risk.

6. **Consider `std::pmr::monotonic_buffer_resource` for non-DSP allocations**: For allocations that happen during initialization or on background threads (e.g., UI state, parameter trees), using `std::pmr` with deterministic upstream resources provides better observability than raw `new`/`delete` [^285^].

7. **Adopt SuperCollider-style `ClearUnitIfMemFailed` pattern**: In `prepare()`, if any allocation fails, degrade gracefully (set the processor to pass-through, log an error) rather than throwing exceptions that may propagate through host code unpredictably [^280^].

## Raw Evidence Log

---

**Claim**: Dynamic memory allocation (malloc, new, STL container growth) is never permitted in the audio callback because heap operations have unbounded and unpredictable timing.
**Source**: "Fixed vs. Variable Buffer Processing in Real-Time Audio DSP" (Medium)
**URL**: https://medium.com/@12264447666.williamashley/fixed-vs-variable-buffer-processing-in-real-time-audio-dsp-performance-determinism-and-66da78390b0f
**Date**: 2025-10-30
**Excerpt**: "Dynamic memory allocation (malloc, new, STL container growth) is never permitted because heap operations have unbounded and unpredictable timing, which can cause audio dropouts. While some hosts might tolerate it, the practice is universally considered dangerous."
**Confidence**: High

---

**Claim**: Ross Bencina identifies three reasons memory allocation is unsafe in the audio callback: allocator locks, OS paging, and unpredictable allocation algorithms.
**Source**: Ross Bencina, "Real-time audio programming 101: time waits for nothing"
**URL**: http://www.rossbencina.com/code/real-time-audio-programming-101-time-waits-for-nothing
**Date**: 2011-07-05
**Excerpt**: "The memory allocator may use a lock to protect some data it shares between threads. Aside from priority inversion, trying to lock a mutex that's potentially contended by every other thread that allocates memory is clearly not a good idea. The memory allocator may have to ask the OS for more memory. The OS may also have it's own locks, or worse, it may decide to page some memory to/from disk and make you wait while it happens. The memory allocator may use algorithms that take unpredictable amounts of time to decide how to allocate a block — and you know you don't want that."
**Confidence**: High

---

**Claim**: JUCE `AudioBuffer::setSize()` with `avoidReallocating=true` only avoids reallocation if neither channel count nor sample length increases.
**Source**: JUCE `AudioBuffer` documentation (juce.com)
**URL**: https://docs.juce.com/master/classjuce_1_1AudioBuffer.html
**Date**: N/A (framework doc)
**Excerpt**: "Note that if keepExistingContent and avoidReallocating are both true, then it will only avoid reallocating if neither the channel count or length in samples increase."
**Confidence**: High

---

**Claim**: Beginners may not know to set `avoidReallocating` because it is off by default, making `AudioBuffer::setSize()` a real-time safety hazard.
**Source**: Nathan Blair, "Developing Audio Plugins" thesis
**URL**: https://nthnblair.com/thesis/
**Date**: 2023-06-12
**Excerpt**: "Despite AudioBuffer's usage on the audio thread, its setSize method may allocate additional memory to expand the size of the buffer's internal arrays. To JUCE's credit, this method does include a flag, avoidReallocating, which prevents this behavior. Still, beginners who do not know the danger of reallocating in the audio callback may not know to set this flag, which is off by default."
**Confidence**: High

---

**Claim**: SuperCollider uses a thread-specific real-time memory allocator (Doug Lea's algorithm) for dynamic allocation within the audio callback.
**Source**: Ross Bencina, SuperCollider internals chapter
**URL**: http://www.rossbencina.com/code/supercollider-internals-book-chapter
**Date**: 2011-04-23
**Excerpt**: "When required, dynamic memory allocation is performed in the audio thread using a special-purpose thread-specific real-time memory allocator."
**Confidence**: High

---

**Claim**: AudioMulch uses per-thread size-segregated memory pools for dynamic allocation; Aura also uses this pattern.
**Source**: "Design Patterns for Real-Time Computer Music Systems" (ICMC 2005)
**URL**: https://www.cs.cmu.edu/~rbd/doc/icmc2005workshop/real-time-systems-concepts-design-patterns.pdf
**Date**: N/A
**Excerpt**: "Aura and AudioMulch use per-thread size-segregated memory pools. AudioMulch allocates in a non-real-time context for many types of dynamic objects, especially large ones."
**Confidence**: High

---

**Claim**: `detalloc` provides O(1) deterministic allocation with a preset specifically for audio processing.
**Source**: `lvntky/detalloc` GitHub repository
**URL**: https://github.com/lvntky/detalloc
**Date**: 2025-10-06
**Excerpt**: "Detalloc is a constant-time (O(1)), deterministic memory allocator built for hard real-time systems and latency-critical applications... cfg = det_config_for_use_case(DET_USE_CASE_AUDIO) // Audio processing (low latency)"
**Confidence**: Medium (relatively new project)

---

**Claim**: Timur Doumler advocates `std::pmr::monotonic_buffer_resource` backed by pre-allocated memory as a real-time-safe way to use STL containers.
**Source**: Timur Doumler, CppCon 2021 talk slides
**URL**: https://cppcon.digital-medium.co.uk/wp-content/uploads/2021/09/talk.pdf
**Date**: 2021-10-29
**Excerpt**: "'real-time safe' allocator: constant time, single-threaded, only use memory allocated upfront... std::pmr::monotonic_buffer_resource monotonic_buffer(stack_memory.data(), stack_memory.size(), std::pmr::null_memory_resource()); std::pmr::vector<float> my_vector(b.size(), 0.0f, allocator);"
**Confidence**: High

---

**Claim**: RCU solves the cross-thread object lifetime problem elegantly, avoiding atomic_shared_ptr's portability and performance issues.
**Source**: Timur Doumler, ADC 2022 talk "Thread Synchronisation in Real-Time Audio Processing With RCU"
**URL**: https://www.youtube.com/watch?v=7fKxIZOyBCE
**Date**: 2023-02-13
**Excerpt**: "One possibility is to use atomic_shared_ptr, but correct and lock-free implementations are hard to come by. And even if you have such an implementation, this approach typically suffers from slow performance, has poor portability across platforms, and introduces even more complexity. Is there an alternative solution? ... RCU (Read-Copy-Update)."
**Confidence**: High

---

**Claim**: SPSC lock-free queues should place producer and consumer indices on separate cache lines to prevent false sharing.
**Source**: `joz-k/LockFreeSpscQueue` C++23 implementation
**URL**: https://github.com/joz-k/LockFreeSpscQueue
**Date**: 2025-08-06
**Excerpt**: "It uses alignas to place producer and consumer data on separate cache lines, preventing 'false sharing.' It implements a performance optimization by caching indices per core."
**Confidence**: High

---

**Claim**: Placement `new` allows constructing objects in pre-allocated memory without heap allocation; manual destructor call is required.
**Source**: JUCE Forum, "How to avoid allocation of dynamic objects on audio thread"
**URL**: https://forum.juce.com/t/how-to-avoid-allocation-of-dynamic-objects-on-audio-thread/23149
**Date**: 2017-07-01
**Excerpt**: "You can allocate the needed memory for dynamicObject beforehand and use this each time you (re)create it by using placement new instead of ordinary new."
**Confidence**: High

---

**Claim**: Tracy profiler tracks every allocation and deallocation, enabling detection of heap fragmentation and memory leaks.
**Source**: Callstack blog, "Profiling React Native Internals with Tracy"
**URL**: https://www.callstack.com/blog/profiling-react-native-internals-with-tracy-for-peak-performance
**Date**: 2025-04-11
**Excerpt**: "Not only does Tracy profiler graph how much memory was allocated, but actually it tracks every single allocation and deallocation. This allows Tracy to list all active allocations and helps you spot memory leaks... this can also help you spot heap fragmentation."
**Confidence**: High

---

**Claim**: Static memory and singletons should be avoided in plugins because DAWs may run multiple instances in the same process or sandbox them separately.
**Source**: Melatonin blog, "The big list of JUCE tips and tricks"
**URL**: https://melatonin.dev/blog/big-list-of-juce-tips-and-tricks/
**Date**: 2024-07-16
**Excerpt**: "Avoid static memory and singletons in plugins. static memory can create issues when there are multiple instances of your plugin in a DAW. This is because they could be run within the same process. Or they could be in different processes. You can't know. You won't know."
**Confidence**: High

---

**Claim**: Highway's `HWY_ALIGN_MAX` aligns to an upper bound suitable for all SIMD targets on the platform.
**Source**: Chromium Highway documentation
**URL**: https://chromium.googlesource.com/external/github.com/google/highway/+/refs/tags/upstream/0.12.2/g3doc/quick_reference.md
**Date**: N/A
**Excerpt**: "HWY_ALIGN_MAX: As HWY_ALIGN, but aligns to an upper bound suitable for all targets on this platform. Use this for caller of SIMD modules, e.g. for arrays used as arguments."
**Confidence**: High

---

**Claim**: False sharing occurs when threads write to different variables in the same cache line, causing unnecessary cache invalidation.
**Source**: dev.to article on false sharing
**URL**: https://dev.to/ariasdiniz/understanding-and-solving-false-sharing-in-multi-threaded-applications-with-an-actual-issue-i-had-57c
**Date**: 2024-12-01
**Excerpt**: "False sharing happens when multiple threads work on different parts of a shared array, but their data resides in the same cache line (typically 64 bytes). If one thread writes to part of a cache line, it invalidates the line for other threads — even if they're working on logically independent data."
**Confidence**: High

---

**Claim**: The JUCE forum recommends using a single queue where the main thread does deallocation when it needs to 'overwrite' a position.
**Source**: JUCE Forum, "Timur Doumler Talks on C++ Audio (Sharing data across threads)"
**URL**: https://forum.juce.com/t/timur-doumler-talks-on-c-audio-sharing-data-across-threads/26311?page=4
**Date**: 2018-02-08
**Excerpt**: "You can do this with a single queue - just have the main thread do the deallocation when it needs to 'overwrite' a position on the queue."
**Confidence**: Medium (forum post, but aligns with expert recommendation)

---

**Claim**: `std::vector::push_back` and `insert` will never reallocate if the reported capacity is sufficient, but bulk insertion methods may reallocate even when not necessary.
**Source**: Rust `Vec` documentation (equivalent semantics to C++ `std::vector`)
**URL**: https://doc.rust-lang.org/std/vec/struct.Vec.html
**Date**: 2026-04-14
**Excerpt**: "push and insert will never (re)allocate if the reported capacity is sufficient... Bulk insertion methods may reallocate, even when not necessary."
**Confidence**: Medium (Rust semantics; C++ standard leaves growth strategy unspecified but current libc++/libstdc++ behavior is consistent)

---

**Claim**: SuperCollider's UGen documentation explicitly warns against STL containers unless provided with a custom real-time allocator.
**Source**: SuperCollider "Writing Unit Generators" documentation
**URL**: https://depts.washington.edu/dxscdoc/Help/Guides/WritingUGens.html
**Date**: N/A
**Excerpt**: "STL Containers: It is generally not recommended to use STL containers, since they internally allocate memory. The only way the STL containers can be used is by providing an Allocator, which maps to the allocating functions of the server."
**Confidence**: High

---

**Claim**: The `AudioBuffer::setSize()` method throws `std::bad_alloc` if required memory cannot be allocated.
**Source**: JUCE `AudioBuffer` documentation (Stanford CCRMA mirror)
**URL**: https://ccrma.stanford.edu/~jos/juce_modules/classAudioBuffer.html
**Date**: N/A
**Excerpt**: "If the required memory can't be allocated, this will throw a std::bad_alloc exception."
**Confidence**: High

---

**Claim**: `std::shared_ptr` reference count increments/decrements are atomic, adding overhead; `std::unique_ptr` has no time overhead on dereference.
**Source**: StackOverflow, "How much is the overhead of smart pointers"
**URL**: https://stackoverflow.com/questions/22295665/how-much-is-the-overhead-of-smart-pointers-compared-to-normal-pointers-in-c
**Date**: 2014-12-15
**Excerpt**: "std::shared_ptr always has memory overhead for reference counter... Due to thread-safety guarantees of std::shared_ptr, these increments/decrements are atomic, thus adding some more overhead. Note that none of them has time overhead in dereferencing."
**Confidence**: High

---

**Claim**: `placement new` requires manual destructor invocation; `delete` must never be used on placement-new pointers.
**Source**: GeeksforGeeks, "Placement new operator in C++"
**URL**: https://www.geeksforgeeks.org/cpp/placement-new-operator-cpp/
**Date**: 2025-07-23
**Excerpt**: "The deallocation is done using delete operation when allocation is done by new but there is no placement delete, but if it is needed one can write it with the help of destructor."
**Confidence**: High

---

**Claim**: Memory allocation behavior of third-party libraries (including tracing/profiling code) must be audited, as it can affect real-time behavior.
**Source**: Interrupt/MemFault, "How Memory Usage Patterns Can Derail Real-time Performance"
**URL**: https://interrupt.memfault.com/blog/memory-debugging
**Date**: 2024-08-29
**Excerpt**: "I also reviewed my code and re-architected parts of it to pre-allocate pools of objects on startup, which are then re-used as much as possible... one needs to be mindful of the tracing features enabled and the volume of data being collected to avoid affecting the real-time behavior of the application being traced."
**Confidence**: High
