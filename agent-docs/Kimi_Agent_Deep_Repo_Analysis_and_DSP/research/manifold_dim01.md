## Dimension: Lock-free Real-time Audio Architecture

### Key Findings

- **The zero-lock, zero-heap audio thread rule is universally accepted.** Ross Bencina's seminal 2011 article codified the fundamental constraints: "Don't allocate or deallocate memory, don't lock a mutex, don't read or write to the filesystem..."[^14^]. Timur Doumler reiterates: "The time between subsequent audio processing callbacks is typically between 1-10 ms... If your process does not compute its audio output... before this deadline, you will get an audible glitch"[^12^].

- **SPSC queues are the canonical lock-free inter-thread communication mechanism for audio.** Both JACK's ringbuffer and Boost.Lockfree's `spsc_queue` are widely referenced implementations. The key correctness requirement is proper memory ordering: producer writes must use `memory_order_release` (or stronger) on the tail index, and consumer reads must use `memory_order_acquire` on the same index[^16^][^18^]. Manifold's `SPSCQueue<256>` for Control→Audio dispatch and `EventRing<256>` for Audio→Control broadcast both fit this pattern.

- **`memory_order_relaxed` is safe only in very specific cases and is generally discouraged for audio synchronization.** Paul J. Lucas warns: "you should *never* use it unless you can *prove* your use of it is correct *and* it actually significantly improves performance. Correct use of `memory_order_relaxed` is *very hard* to do"[^59^]. In an audio SPSC queue, using `relaxed` for the index synchronization can allow the consumer to read buffer data before the producer has finished writing it, leading to undefined behavior[^16^]. Manifold's use of `relaxed` for audio-thread reads/writes within `AtomicState` may be acceptable for independent scalar fields, but carries risk if any field is used to guard access to others.

- **RCU (Read-Copy-Update) and SeqLock are emerging as best-practice patterns for complex state sharing.** Timur Doumler's ADC22 talk introduced RCU for audio: "How can we synchronise reads and writes to C++ objects across threads, and manage the lifetime of these objects, while remaining wait-free on the real-time thread?"[^90^]. His ADC24 talk introduced SeqLock for the reverse case (audio thread writes, non-RT thread reads)[^95^]. Both patterns enable safe swapping of entire data structures without locks.

- **Priority inversion is the primary reason to avoid locks, not just latency.** Bencina explains: "Your GUI thread will be running with a much lower priority than the audio thread, so it could be interrupted by pretty much any other process on the system... the callback will have to first wait for this other process"[^14^][^20^]. Android's audio team explicitly states: "Priority inversion typically manifests as a glitch (click, pop, dropout)"[^17^].

- **Verification tools exist but are fragmented.** `pluginval` (Tracktion) detects memory allocations/deallocations in the audio thread[^68^][^69^]. Dave Rowland's "Catching Real-time Safety Violations" talk (Cpp on Sea 2024) demonstrated intercepting `operator new`/`free` and mutex operations to detect violations[^69^]. System-level tools like `cyclictest`, `hwlatdetector`, and `LatencyMon` help diagnose OS-level scheduling issues[^98^][^100^].

- **Ableton Link provides a lock-free capture/commit API specifically designed for audio thread use.** "Link provides lock-free `capture()` and `commit()` functions to be used in the audio thread, and a similar thread-safe pair of functions to be used in other threads"[^51^][^87^]. The audio-thread API must *only* be used from the audio thread; application-thread versions may block[^88^].

- **CLAP explicitly separates audio-thread from main-thread callbacks.** The CLAP header documentation marks `process()` as `[audio-thread]` and prohibits dynamic allocation, file I/O, and locking within it[^64^]. CLAP also provides a thread-pool extension for offloading compute-heavy tasks.

- **False sharing of atomic variables on the same cache line can degrade performance.** Even atomic operations are subject to cache coherency traffic. Two cores modifying different atomics on the same cache line will cause "cache line bouncing"[^56^][^64^]. Manifold's `AtomicState` with 20+ atomic fields should be audited for cache line alignment.

- **Deferred destruction (retirement queue) is a critical but under-documented audio pattern.** When the audio thread needs to atomically swap a graph or data structure, the old version cannot be `delete`d immediately because the audio thread may still be reading it. A retirement queue (SPSC queue of pointers to be freed by the non-RT thread after a grace period) solves this. Manifold's `SPSCQueuePtr<64>` serves this exact purpose for retired `GraphRuntime` objects.

---

### Major Sources & Authorities

| Source | Authority | Relevance |
|--------|-----------|-----------|
| Ross Bencina, "Real-time audio programming 101: time waits for nothing" (2011) | **Seminal / High** | Foundational text for RT audio constraints; cited by virtually all subsequent work[^14^]. |
| Timur Doumler, ADC20/ADC22/ADC24 talks on locks, RCU, SeqLock | **High** | Leading C++ audio expert; practical lock-free patterns for complex state[^12^][^90^][^95^]. |
| Jatin Chowdhury, "Wait-Free Programming From Scratch" (2025) | **High** | Step-by-step walkthrough of atomic pointer exchange, deferred deletion for parameter updates[^10^]. |
| Bruce.audio, "Efficient Real-Time Synchronization... with memory_order_release/acquire" (2025) | **Medium** | Practical blog on correct memory ordering for parameter updates[^65^]. |
| ADC23 Sushi/TWO Architecture slides | **Medium** | Real DAW architecture using lock-free `RtEvent` queues and graph swapping[^15^]. |
| Dave Rowland, "Introducing Tracktion Graph" (ADC20) | **High** | Lock-free audio graph processing with `LockFreeObject`, `AudioBufferPool`, multi-threaded player[^66^][^72^]. |
| Ableton Link paper (LAC 2018) / docs | **High** | Lock-free `capture`/`commit` transactional API explicitly designed for audio thread[^51^][^87^]. |
| Android Docs, "Avoid priority inversion" | **High** | OS vendor guidance on non-blocking algorithms for audio[^17^]. |
| pluginval / Cpp on Sea 2024 (Dave Rowland) | **High** | Real-time safety violation detection tooling[^68^][^69^]. |
| IN-COM Data Systems, SPSC queue design | **Medium** | Engineering analysis of false sharing and memory ordering in SPSC queues[^22^]. |

---

### Patterns & Best Practices

1. **Immutable data structures / copy-on-write for graph swapping.** Instead of modifying data in-place, the message thread creates a modified copy and atomically swaps a pointer. "This can be achieved using immutable data structures... the message thread peels off a copy that contains the modification, while the audio thread still looks at the previous version"[^89^]. This is the core pattern behind Manifold's graph recompilation → atomic swap model.

2. **Atomic pointer exchange with deferred deletion (retirement queue).** When swapping a shared pointer from the UI thread, the old pointer cannot be `delete`d immediately if the audio thread may still reference it. The UI thread pushes the old pointer to a retirement SPSC queue; a non-RT worker thread drains the queue and frees after ensuring the audio thread has moved on[^10^][^63^]. Manifold's `SPSCQueuePtr<64>` implements this for `GraphRuntime`.

3. **Release-acquire pairing for SPSC queue indices.** Producer: write data, then `store(tail, memory_order_release)`. Consumer: `load(tail, memory_order_acquire)`, then read data. This ensures the consumer never sees stale buffer contents[^16^][^18^][^65^]. Manifold's queues should verify this pairing.

4. **Separate atomic fields by cache line to prevent false sharing.** "Placing atomic variables used by different threads to the same cache line may make application slower compared to placing them to two different cache lines"[^56^]. Manifold's `AtomicState` bundles 20+ atomics; padding or splitting across cache lines could improve performance.

5. **Audio-thread-only state snapshots (Ableton Link pattern).** For complex shared state, provide a `capture()` function that copies state into a thread-local snapshot, and a `commit()` function that applies modifications. Both are lock-free on the audio thread[^51^][^88^]. Manifold's `AtomicState` serves a similar purpose but uses 20+ individual atomics rather than a unified snapshot.

6. **Pre-allocate everything; use per-thread memory pools if dynamic allocation is unavoidable.** "Pre-allocate all your data... or pre-allocate a big chunk of memory and implement your own deterministic dynamic allocator"[^14^]. SuperCollider uses Doug Lea's allocator in the audio callback only; AudioMulch uses per-thread memory pools[^14^].

7. **Progressive back-off spinlocks (if locks are unavoidable).** If a lock *must* be used, never use `std::mutex`. A custom spinlock with exponential back-off (spin → `pause` → `yield` → `nanosleep`) prevents burning CPU on the non-RT thread while keeping `try_lock`/`unlock` O(1) on the audio thread[^12^][^54^].

8. **Lock-free multi-threaded graph processing (Tracktion pattern).** Tracktion Graph uses a `LockFreeMultiThreadedNodePlayer` where worker threads spin on a FIFO of ready nodes, using CPU pause instructions. "Fully real-time implementation means no system calls (locks, CVs, events etc.)... Worker threads can use CPU pause instructions"[^72^].

---

### Controversies & Conflicting Claims

1. **`memory_order_relaxed` for audio-thread atomics.** Manifold uses `relaxed` for many audio-thread reads/writes. Some practitioners (e.g., Lucas[^59^], CodeReview commenters[^57^]) warn that `relaxed` is dangerous unless correctness is provable. Others (e.g., Boost.Lockfree authors[^18^]) use `relaxed` for local reads (reading own thread's index) within an SPSC queue because data dependency ensures ordering. The controversy is whether Manifold's `AtomicState` fields are truly independent or whether some implicit ordering assumptions exist between them.

2. **Whether `std::atomic::wait/notify` (C++20) is real-time safe.** Timur Doumler notes: "`std::atomic::notify_one()` might be implemented such that it does a system call to wake up another thread... we have no guarantees that this would be safe to use for real-time audio"[^54^]. This means C++20's seemingly convenient atomic wait/notify should not be used in the audio thread.

3. **Spinlocks in plugins: widely used but controversial.** `juce::SpinLock` is "probably being used in half of the VST plug-ins out there"[^12^], yet Doumler criticizes it for not using optimal memory ordering and for burning CPU when contended. The consensus is: spinlocks are better than mutexes, but lock-free (atomics, SPSC queues) is better still.

4. **Should the audio thread ever `try_lock`?** Some advise that `try_lock` on a mutex is real-time safe because it doesn't block[^12^]. However, the subsequent `unlock()` of `std::mutex` is *not* real-time safe due to potential kernel interactions. The consensus: never use `std::mutex` at all on the audio thread, even with `try_lock()`[^12^].

5. **Pluginval's real-time safety detection limitations.** Pluginval only checks for allocations via `::new`, not `malloc`[^67^]. This means C-style allocations or allocator calls hidden in third-party libraries may be missed. Dave Rowland's approach of intercepting `operator new`/`free` and using stack traces is more comprehensive[^69^].

---

### Relation to Manifold Codebase

Manifold's architecture aligns well with established best practices, but there are specific areas to scrutinize:

1. **3-thread model is well-aligned with industry patterns.** The strict separation of Audio Thread (RT), Message Thread (UI/Lua), and Control Thread (IPC/network) mirrors the patterns advocated by JUCE, Tracktion, and Sushi/Elk Audio OS. The Sushi architecture explicitly uses "RtEvents, via lock-free queues" between non-RT threads and audio thread(s)[^15^].

2. **`SPSCQueue<256>` for Control→Audio command dispatch.** This is the canonical pattern. Must verify that the producer (Control thread) uses `memory_order_release` on the tail write and the consumer (Audio thread) uses `memory_order_acquire` on the tail read. The `EventRing<256>` for Audio→Control JSON broadcast should use the same discipline.

3. **`AtomicState` with 20+ atomic fields.** This is an unusual design. Most audio engines use either: (a) a small number of individual `std::atomic<T>` scalars, or (b) a single atomic pointer to a snapshot struct (Ableton Link / RCU style). Having 20+ atomics in one object risks:
   - **False sharing:** If the atomics are densely packed, different threads updating different fields on the same cache line will cause cache coherency ping-pong[^56^][^64^].
   - **Ordering hazards:** If any field is implicitly used to guard another (e.g., a "valid" flag and a payload value), `memory_order_relaxed` on both could lead to torn reads or stale data visibility.
   - **Recommendation:** Audit `AtomicState` layout with cache line alignment (`alignas(64)` per field or group). Consider whether a snapshot-pointer model (single atomic pointer to immutable state) would be cleaner and safer.

4. **`SPSCQueuePtr<64>` for deferred GraphRuntime destruction.** This is the correct pattern for RCU-style retirement. The audio thread swaps the active graph pointer; the old graph pointer is pushed to `SPSCQueuePtr`; the Control thread (or a dedicated cleanup thread) drains the queue and `delete`s after ensuring the audio thread is no longer referencing it. This is exactly what Jatin Chowdhury describes as the "wait-free" solution for UI→audio parameter passing at scale[^10^][^63^].

5. **`MidiRingBuffer` (packed 4-byte MIDI, 256 capacity).** This is appropriate for lock-free MIDI event passing. The small fixed size (256) means overflow is possible under dense MIDI streams; verify that the producer handles full-queue gracefully (drop oldest or drop new).

6. **`AudioCaptureRing` (~1M floats, ~11.6s @ 44.1k stereo).** This is a large ring buffer for audio capture/streaming. At ~1M floats (~4MB), this is substantial but pre-allocated. The SPSC pattern should hold. Ensure that the write/read indices are on separate cache lines for performance.

7. **OSC/UDP server on Control Thread.** This is architecturally correct: network I/O is isolated from the audio thread. The SPSC queue dispatch ensures the audio thread never blocks on network operations. The ADC23 Sushi architecture similarly centralizes OSC as a non-RT concern[^15^].

8. **Lua VM on Message Thread.** Correct placement. Scripting VMs are inherently non-deterministic and must not touch the audio thread directly.

---

### Recommended Improvements / Opportunities

1. **Audit `AtomicState` memory layout.** Insert `alignas(64)` padding between atomic fields that are written by different threads, or restructure `AtomicState` as a pointer to an immutable snapshot that is atomically swapped. A single `std::atomic<StateSnapshot*>` with RCU-style retirement is likely safer and more performant than 20+ individual relaxed atomics.

2. **Verify SPSC queue memory ordering.** Ensure all queue implementations (`SPSCQueue`, `EventRing`, `SPSCQueuePtr`, `MidiRingBuffer`) use `memory_order_release` on producer writes and `memory_order_acquire` on consumer reads for the synchronizing index. Local reads of a thread's own index may use `relaxed`, but cross-thread index communication must not.

3. **Adopt a real-time safety verification tool.** Integrate a `pluginval`-style allocation detector or Dave Rowland's `realtime_context` interception approach into CI builds. This would catch accidental heap allocations or mutex usage in `processBlock`/`GraphRuntime::process` during automated testing[^68^][^69^].

4. **Consider SeqLock for high-frequency state snapshots.** If `AtomicState` is read by the audio thread every block, a SeqLock could provide a consistent, wait-free snapshot of the entire state with better performance than 20+ individual atomic loads[^95^].

5. **Document the retirement queue grace period.** Ensure `SPSCQueuePtr` consumers verify that the audio thread has completed at least one processing cycle before freeing retired objects. A simple sequence counter or heartbeat atomic could formalize this.

6. **Monitor for false sharing in `AudioCaptureRing`.** With ~1M floats, the head/tail indices should be on separate cache lines. Consider padding the index variables to 64-byte boundaries.

7. **Evaluate Ableton Link integration patterns.** If Manifold ever adds Link sync, follow the `RealtimeHandle` pattern: bind a realtime handle to the audio thread, use only `capture_session_state`/`commit_session_state` from the audio thread, and never mix application-thread Link calls with audio-thread calls[^86^][^88^].

8. **Add latency/jitter monitoring.** Tools like `cyclictest` or custom callback duration histograms can provide empirical evidence that the lock-free design is meeting deadlines under stress[^98^].

---

### Raw Evidence Log

**Claim:** The audio thread must never allocate/deallocate memory, use mutexes, or perform I/O.
**Source:** Ross Bencina, "Real-time audio programming 101: time waits for nothing"
**URL:** http://www.rossbencina.com/code/real-time-audio-programming-101-time-waits-for-nothing
**Date:** 2011-07-05
**Excerpt:** "you should not allocate memory in your audio callback... The memory allocator may use a lock... may have to ask the OS for more memory... may use algorithms that take unpredictable amounts of time"
**Confidence:** High

---

**Claim:** Priority inversion occurs when a high-priority audio thread waits for a low-priority GUI thread holding a lock.
**Source:** Ross Bencina, "Real-time audio programming 101"
**URL:** http://www.rossbencina.com/code/real-time-audio-programming-101-time-waits-for-nothing
**Date:** 2011-07-05
**Excerpt:** "Let's say your GUI thread is holding a shared lock when the audio callback runs... Your GUI thread will be running with a much lower priority than the audio thread, so it could be interrupted by pretty much any other process on the system, and the callback will have to first wait for this other process"
**Confidence:** High

---

**Claim:** SPSC queues avoid CAS and achieve high throughput via separate cache-line head/tail indices and release-acquire semantics.
**Source:** IN-COM Data Systems, "Implementing Lock-Free Data Structures in High-Concurrency Systems"
**URL:** https://www.in-com.com/blog/implementing-lock-free-data-structures-in-high-concurrency-systems/
**Date:** 2025-11-24
**Excerpt:** "SPSC queues typically use a ring buffer design, maintaining head and tail indices that allow the producer and consumer to operate on separate cache lines. This eliminates the need for CAS operations entirely... They rely primarily on memory ordering guarantees to ensure visibility of updates across threads."
**Confidence:** High

---

**Claim:** Using `memory_order_relaxed` for cross-thread SPSC queue synchronization is unsafe because it allows the consumer to read buffer data before the producer finishes writing.
**Source:** Sarthak Sehgal, "SPSC Queue Part 2: Going Atomic"
**URL:** https://sartech.substack.com/p/spsc-queue-part-2-going-atomic
**Date:** 2025-02-22
**Excerpt:** "In this scenario, consumer thread attempts to access buffer[0] before producer thread has finished writing the element. A classic recipe for disaster!... The key advantage of relaxed ordering is its speed... Relaxed ordering only ensures the atomicity of the read/write to the atomic variable. There are no synchronization or ordering constraints imposed on other reads or writes."
**Confidence:** High

---

**Claim:** `memory_order_relaxed` should never be used unless correctness is provable and performance gain is measured.
**Source:** Paul J. Lucas, "Advanced Thread Safety in C++"
**URL:** https://dev.to/pauljlucas/advanced-thread-safety-in-c-3ap5
**Date:** 2023-07-13
**Excerpt:** "you should never use it unless you can prove your use of it is correct and it actually significantly improves performance. Correct use of memory_order_relaxed is very hard to do."
**Confidence:** High

---

**Claim:** RCU enables wait-free reads of complex data structures on the real-time thread while another thread mutates them.
**Source:** Timur Doumler, ADC22 talk / YouTube description
**URL:** https://www.youtube.com/watch?v=7fKxIZOyBCE
**Date:** 2023-02-13
**Excerpt:** "How can we synchronise reads and writes to C++ objects across threads, and manage the lifetime of these objects, while remaining wait-free on the real-time thread?... RCU has been successfully used in the Linux kernel for two decades."
**Confidence:** High

---

**Claim:** SeqLock is an alternative to double-buffering for audio-thread writes and non-RT reads.
**Source:** Timur Doumler, ADC24 talk description
**URL:** https://conference.audio.dev/wait-free-thread-synchronisation-with-the-seqlock-timur-doumler-adc-2024/
**Date:** 2025-07-14
**Excerpt:** "The traditional solution for this problem in audio processing code today is double buffering... If we look beyond the audio industry, there is actually another strategy that has more favourable tradeoffs for some use cases: the SeqLock."
**Confidence:** High

---

**Claim:** `std::mutex` should never be used on the audio thread, not even with `try_lock()`.
**Source:** Timur Doumler, "Using locks in real-time audio processing, safely"
**URL:** https://timur.audio/using-locks-in-real-time-audio-processing-safely
**Date:** 2020-04-14
**Excerpt:** "never use std::mutex on the audio thread, not even with try_lock(). While that call is realtime-safe, the subsequent unlock() is not – hard to see because it will be hidden behind a std::unique_lock or similar RAII wrapper."
**Confidence:** High

---

**Claim:** False sharing of atomics on the same cache line degrades performance due to cache coherency traffic.
**Source:** StackOverflow, "False Sharing and Atomic Variables"
**URL:** https://stackoverflow.com/questions/10143676/false-sharing-and-atomic-variables
**Date:** 2012-04-13
**Excerpt:** "if a and b share a cache line, B's copy of b will get invalidated, and its next access to b will incur a cache miss. This happens regardless of whether a and b are 'atomic'."
**Confidence:** High

---

**Claim:** Ableton Link provides lock-free capture/commit for audio thread and blocking versions for application threads.
**Source:** Ableton Link Documentation
**URL:** https://ableton.github.io/link/
**Date:** N/A
**Excerpt:** "Link provides a realtime-safe session state capture/commit function pair. This allows clients to query and modify the Link session state directly from the audio callback. It's important that this audio-thread specific interface only be used from the audio thread."
**Confidence:** High

---

**Claim:** Pluginval can detect memory allocations in the audio thread but only intercepts `::new`, not `malloc`.
**Source:** JUCE Forum, "How to analyse ProcessBlock for locks & mutex?"
**URL:** https://forum.juce.com/t/how-to-analyse-processblock-for-locks-mutex/36332
**Date:** 2019-11-25
**Excerpt:** "pluginval only checks for allocations via ::new . It doesn't check for malloc."
**Confidence:** High

---

**Claim:** Tracktion Graph uses `LockFreeObject` and `LockFreeMultiThreadedNodePlayer` for lock-free audio graph processing.
**Source:** Tracktion Engine docs / ADC20 slides
**URL:** https://tracktion.github.io/tracktion_engine/namespacetracktion_1_1graph.html / https://data.audio.dev/talks/2020/introducing-tracktion-graph/slides.pdf
**Date:** N/A
**Excerpt:** "Manages access to an object in a way that means it is lock-free to access from a real-time thread... Fully real-time implementation means no system calls (locks, CVs, events etc.)."
**Confidence:** High

---

**Claim:** CLAP marks `process()` as `[audio-thread]` and prohibits dynamic allocation, locking, and I/O.
**Source:** CLAP real-time processing blog (CSDN mirror)
**URL:** https://blog.csdn.net/gitblog_00898/article/details/156780399
**Date:** 2026-04-30
**Excerpt:** "严格遵循实时安全规范... 禁止在音频线程中进行文件I/O、动态内存分配、锁操作或耗时计算... include/clap/plugin.h 中标注为 [audio-thread] 的回调函数满足实时安全要求"
**Confidence:** Medium (secondary source, but aligns with CLAP headers)

---

**Claim:** Sushi DAW architecture uses lock-free `RtEvent` queues (32-byte tagged unions) between non-RT threads and audio thread.
**Source:** ADC23 DAW Architecture slides (Sushi section)
**URL:** https://data.audio.dev/talks/2023/the-architecture-of-daws/slides.pdf
**Date:** N/A
**Excerpt:** "Communication between non-rt threads and audio thread: RtEvents, via lock-free queues... RtEvent: Tagged union of events and commands - real-time safe. Small - 32 bytes."
**Confidence:** High

---

**Claim:** Dave Rowland's Cpp on Sea 2024 talk demonstrates intercepting `operator new`/`free` and mutex operations to catch RT violations.
**Source:** DrowAudio presentations, "Catching Real-time Safety Violations"
**URL:** https://drowaudio.github.io/presentations/Cpp%20on%20Sea%202024%20-%20Catching%20Real-time%20Safety%20Violations/Cpp%20on%20Sea%202024%20-%20Catching%20Real-time%20Safety%20Violations.pdf
**Date:** N/A
**Excerpt:** "void* operator new(std::size_t sz) { if(is_real_time_context()) { std::cerr<< \"!!! WARNING: Illegal allocation...\"; std::cerr<< get_stacktrace(); } return std::malloc(sz); }"
**Confidence:** High

---

**Claim:** Immutable data structures are the ideal solution for audio thread safety; locks should be a last resort.
**Source:** Timur Doumler, "Using locks in real-time audio processing, safely"
**URL:** https://timur.audio/using-locks-in-real-time-audio-processing-safely
**Date:** 2020-04-14
**Excerpt:** "The correct answer, in my opinion, is to design your audio engine in such a way that this case never occurs. This can be achieved using immutable data structures. Instead of modifying the data structure in-place, the message thread peels off a copy that contains the modification, while the audio thread still looks at the previous version for however long it needs to."
**Confidence:** High

---

**Claim:** JUCE's `AudioProcessorValueTreeState` handles thread-safe parameter access but `parameterChanged` can be called on any thread including the audio thread.
**Source:** Melatonin blog, "The big list of JUCE tips and tricks"
**URL:** https://melatonin.dev/blog/big-list-of-juce-tips-and-tricks/
**Date:** 2024-07-16
**Excerpt:** "`parameterChanged` can happen on the audio thread... Most people learn the hard way... Only do trivial things in these parameter callbacks. Yes, both `parameterChanged` and `parameterValueChanged`. Treat them like you are on the audio thread. Because they can be called from *any* thread."
**Confidence:** High

---

**Claim:** `juce::SpinLock` is widely used but suboptimal due to non-standard API and non-optimal memory ordering.
**Source:** Timur Doumler, "Using locks in real-time audio processing, safely"
**URL:** https://timur.audio/using-locks-in-real-time-audio-processing-safely
**Date:** 2020-04-14
**Excerpt:** "a widely used implementation is juce::SpinLock. It is probably being used in half of the VST plug-ins out there... I am not a huge fan of this class, because its API is not STL-compatible... and it doesn't use the optimal memory order flags in the implementation."
**Confidence:** High

---

**Claim:** Android AudioFlinger uses non-blocking SPSC FIFOs (`nbaio`) to avoid priority inversion between mixer threads.
**Source:** Android Developers, "Avoid priority inversion"
**URL:** https://source.android.com/docs/core/audio/avoiding_pi
**Date:** 2025-03-26
**Excerpt:** "Non-blocking algorithms are our solution... single-reader single-writer FIFO queues... They are specifically designed for AudioFlinger and are not a general-purpose solution."
**Confidence:** High
