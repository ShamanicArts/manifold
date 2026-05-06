## Dimension: Circular & Ring Buffer Design Patterns for Audio

### Key Findings

1. **Lock-free SPSC ring buffers are the canonical real-time audio IPC primitive.** The Single-Producer Single-Consumer wait-free ring buffer is "often regarded as the bread and butter data structure for concurrency in real-time audio programming" [^182^]. Implementations in Rust (`ringbuf_basedrop`), C (`szanni/ringbuf`), and JavaScript (`ringbuf.js`) all target audio applications specifically, using atomic write/read indices with acquire/release memory ordering [^178^][^179^][^182^][^184^].

2. **Power-of-2 capacity with bitwise masking is a standard optimization for audio ring buffers.** When buffer capacity is a power of 2, index wrapping via `(index + 1) & (capacity - 1)` replaces expensive modulo operations with a single bitwise AND instruction [^186^][^258^]. The Linux kernel documentation explicitly recommends this: "If the buffer is of a power-of-2 size, then a much quicker bitwise-AND instruction can be used instead" [^186^]. Manifold's `AudioCaptureRing` already uses this pattern.

3. **Acquire-release memory ordering is the correct C++ synchronization pattern for SPSC queues.** The producer writes data to the buffer slot, then updates its position with `release` ordering. The consumer loads the producer's position with `acquire` ordering, which synchronizes with that release, guaranteeing visibility of the written data [^250^][^251^][^255^]. As one authoritative source states: "The thread 'publishing' the 'done' flag must use a memory ordering at least release... and the 'subscribing' thread... must use at least acquire" [^251^]. Manifold's `MidiRingBuffer` and `SPSCQueue` should verify they use these semantics.

4. **JUCE `AbstractFifo` is a widely-used, well-tested lock-free FIFO abstraction.** It encapsulates the logic for single-reader, single-writer FIFOs without holding data itself. It provides `prepareToWrite()`/`prepareToRead()` APIs that return potentially two contiguous blocks (for wrap-around handling), plus newer `ScopedRead`/`ScopedWrite` convenience wrappers [^252^][^253^]. The JUCE forum confirms "The AbstractFifo class is lock-free" [^254^]. Manifold could leverage this instead of custom implementations.

5. **Cache-line alignment of read/write indices is critical for performance.** The Disruptor pattern shows that padding atomic sequence numbers to isolate them on their own cache lines prevents false sharing [^189^]. Modern implementations (e.g., Zig's SPSCQueue) explicitly align `consumer_pos` and `producer_pos` to `std.atomic.cache_line` [^250^]. Without this, "updating 8 bytes of data also invalidates 56 neighboring bytes" [^183^]. Manifold's ring buffer implementations should be reviewed for false sharing risks.

6. **Mirrored/phantom memory techniques eliminate wrap-around discontinuities.** The "mirrored memory" or "phantom buffer" technique maps the underlying buffer to two contiguous virtual memory regions, so wrap-around is handled by the MMU automatically [^280^][^283^][^284^][^286^]. This enables single-copy contiguous block operations and eliminates branch checks at buffer boundaries. The CLAM framework's `PhantomBuffer` pattern replicates the first N elements at the end of the buffer to guarantee each subsequence of N elements sits in contiguous memory [^278^][^281^]. This is especially valuable for FFT operations requiring contiguous windows.

7. **Double-buffering (ping-pong) and ring buffers serve different but complementary roles.** Double-buffering (two half-size buffers) is optimal for block-based DMA-driven systems where the CPU processes one half while DMA fills/empties the other [^224^][^228^]. Ring buffers are superior for streaming scenarios with rate mismatch and jitter absorption [^231^]. In embedded DSP, "ping-pong buffering" is used for DMA, while circular buffers serve as delay lines [^261^].

8. **Unbounded lock-free queues are generally unsuitable for real-time audio.** Bounded circular buffers do not require dynamic memory management and are "well suited for embedded devices, real-time systems, operating systems" [^230^]. Academic benchmarks show that bounded ring buffers significantly outperform unbounded linked-list queues in real-time contexts [^220^][^227^]. Manifold's fixed-capacity designs are correct for real-time safety.

9. **ADC 2025 presented a comprehensive taxonomy of lock-free FIFOs for audio.** Dave Rowland's "Lock-free Queues in the Multiverse of Madness" categorized queues by behavior (block vs. fail vs. overwrite), capacity model, bulk support, message size, and progress guarantees (blocking vs. lock-free vs. wait-free) [^276^][^282^]. It benchmarked `juce::AbstractFifo`, `boost::lockfree::spsc_queue`, `moodycamel::ReaderWriterQueue`, `farbot::fifo`, and others.

10. **SIMD alignment is essential for modern audio processing.** SIMD instructions (AVX/SSE) require aligned memory and benefit from contiguous block operations [^226^][^93^]. A ring buffer that requires split reads/writes at wrap boundaries prevents vectorization. The virtual-memory mirrored buffer technique enables single `memcpy` operations that the compiler can vectorize [^284^].

11. **Retrospective/always-on capture is implemented as a large circular buffer in DAWs.** Features like Pro Tools QuickPunch, Cubase Audio Pre-record, Bitwig MIDI Capture, and plugins like "Fine Classics Capture" all use large background circular buffers to capture audio/MIDI continuously [^218^][^219^][^232^][^279^]. Manifold's `CaptureBuffer` and `AudioCaptureRing` follow this same architectural pattern.

12. **The Multiple Window Circular Buffer pattern addresses multi-rate audio dataflow.** From the PLoP 2006 pattern catalog, this addresses "a single source of tokens with one writer and multiple readers, giving each one access to a subsequence of tokens" with contiguous memory guarantees [^192^][^278^]. It uses a layered design with windows that slide over an underlying circular buffer, with non-overlapping restrictions enforced by a scheduler.

### Major Sources & Authorities

- **PLoP 2006 / CLAM Framework**: "A Dataflow Pattern Catalog for Sound and Music Computing" — authoritative academic source for Multiple Window Circular Buffer, Phantom Buffer, and Multi-rate Stream Ports patterns [^192^][^278^]. Relevance: Directly applicable to Manifold's buffer design challenges.

- **CCRMA Stanford (Julius O. Smith III)**: "Physical Audio Signal Processing" — authoritative reference on delay-line interpolation (linear, allpass, cubic) [^187^]. Relevance: If Manifold's ring buffers serve as delay lines, interpolation quality matters.

- **ADC 2025 / Dave Rowland**: "Lock-free Queues in the Multiverse of Madness" — industry conference presentation from Tracktion/Prism CTO, comprehensive taxonomy and benchmarking of lock-free queues [^276^][^282^]. Relevance: Benchmarks include `juce::AbstractFifo` and `boost::lockfree::spsc_queue`.

- **JUCE Documentation**: `juce::AbstractFifo` class reference — official documentation for the de facto standard audio lock-free FIFO in the C++ audio industry [^252^][^253^]. Relevance: Direct alternative/comparison for Manifold's custom FIFOs.

- **Mike Ash / André Leite**: Articles on ring buffers and mirrored memory — detailed explanations of virtual-memory aliasing for wrap-free circular buffers [^280^][^283^]. Relevance: Advanced optimization Manifold could consider.

- **Abhinav Agarwal**: "Super Fast Circular Ring Buffer Using Virtual Memory trick" — practical implementation guide with performance analysis [^284^]. Relevance: Platform-specific optimization for contiguous block access.

- **Doug Richardson**: "Wrapping Counters" — empirical assembly-level comparison of increment/mod vs increment/compare vs increment/bitwise-AND [^186^]. Relevance: Validates Manifold's bitwise masking optimization.

- **Paul Adenot (Mozilla)**: "A wait-free single-producer single-consumer ring buffer for the web" — 137-line JS implementation for real-time audio with zero GC [^182^]. Relevance: Shows how minimal and focused audio ring buffers can be.

- **Timur Doumler**: "Using locks in real-time audio processing, safely" — authoritative blog on real-time audio thread safety [^89^]. Relevance: Recommends `boost::spsc_queue` for MIDI message streams.

- **CppCon 2015 / Ross Bencina / Fabian Renn-Giles**: "Real-time 101" series — foundational conference talks on real-time audio programming rules. The CppCon summary notes that "音频回调里只能执行无锁（lock-free）代码，禁止任何内存分配和释放" [^179^].

### Patterns & Best Practices

- **Use SPSC whenever possible.** "If you can, try to design it as single-producer/single-consumer (SPSC). This greatly simplifies implementation and improves efficiency" [^179^]. Manifold's `MidiRingBuffer`, `AudioCaptureRing`, and `SPSCQueue` already follow this.

- **Pre-allocate fixed-size buffers; never allocate in the audio thread.** "Real-time audio thread... cannot block, cannot allocate memory, cannot use locks" [^179^]. All Manifold buffers appear pre-allocated, which is correct.

- **Use power-of-2 capacity with bitwise masking for index wrap.** Standard practice in DSP: `const int Mask = (1 << 16) - 1; index = (index + 1) & Mask;` [^258^]. Manifold's `AudioCaptureRing` uses this.

- **Separate index logic from data storage.** JUCE's `AbstractFifo` pattern: the FIFO object manages only read/write positions; the caller manages the actual buffer memory [^252^]. This enables flexible buffer backing (heap, stack, `juce::AudioBuffer`, etc.).

- **Align atomic indices to cache lines.** The Disruptor uses explicit padding (`p1-p7` before and after the atomic cursor) [^189^]. Modern C++17+ provides `std::hardware_destructive_interference_size` for this purpose [^285^].

- **Provide contiguous-block APIs for bulk operations.** JUCE's `prepareToWrite`/`prepareToRead` return up to two `(startIndex, blockSize)` pairs, allowing `memcpy`-based copies without per-element modulo [^252^]. The "bip buffer" (bipartite buffer) always returns contiguous blocks [^286^].

- **Consider virtual-memory mirroring for zero-overhead wrap-around.** Map the same physical buffer to two adjacent virtual regions; reads/writes that cross the boundary automatically continue into the second virtual mapping [^280^][^283^][^284^]. Eliminates split-read/write code paths entirely.

- **Use acquire-release atomics for index synchronization.** Producer: write data, then `store(index, release)`. Consumer: `load(index, acquire)`, then read data. This is the minimal correct memory ordering for SPSC [^250^][^255^].

- **For delay lines, consider fractional-delay interpolation.** When ring buffers are used as delay lines with non-integer tap positions, "linear interpolation is perhaps most commonly used because it is very straightforward and inexpensive" [^187^]. Allpass interpolation preserves unity gain, which is critical for feedback loops.

- **Use unbounded position counters rather than wrapping indices for full/empty detection.** With 64-bit counters, wrap-around is practically impossible. Full detection becomes `producer_pos - consumer_pos >= capacity`, which is simpler and branch-friendlier than comparing wrapped indices [^250^].

### Controversies & Conflicting Claims

1. **Modulo vs. branch vs. bitwise-AND: which is fastest?**
   - Doug Richardson's assembly comparison shows bitwise-AND generates the tightest loop on x86 [^186^].
   - However, the JUCE forum reports: "under some circumstances the bit mask trick is faster, and under other circumstances the branch is faster" [^195^]. On modern CPUs with good branch prediction, the `if (x == n) x = 0` pattern can be competitive.
   - Consensus: bitwise-AND is the safest optimization for power-of-2 capacities, but benchmarking on the target platform is advisable.

2. **Should ring buffers use virtual-memory mirroring?**
   - Pro: Eliminates wrap-around logic entirely, enables single `memcpy` for bulk transfers, improves cache locality and SIMD vectorization [^280^][^283^][^284^].
   - Con: Platform-specific (requires `mmap`/virtual memory support), complicates memory management, may not work on all embedded targets [^277^]. The Wikipedia article on circular buffers marks this optimization as "[disputed – discuss]" [^275^].
   - Consensus: Excellent for desktop/server audio, problematic for embedded DSP without MMU.

3. **Bounded vs. unbounded queues for real-time systems.**
   - Bounded queues (ring buffers) are real-time safe, have fixed memory footprints, and are simpler to verify [^230^].
   - Unbounded queues (linked-list based like Michael-Scott) dynamically allocate nodes, which is inherently non-deterministic and can fragment memory [^220^].
   - Some newer research (e.g., FAAArrayQueue, LPRQ) achieves lock-free unbounded queues with good throughput, but at the cost of complex memory reclamation [^220^].
   - Consensus for audio: bounded is correct. Unbounded is acceptable only on the non-real-time side.

4. **Lock-free vs. mutex-based queues: when is lock-free actually faster?**
   - Lock-free SPSC has bounded operation time and no kernel calls, which is essential for real-time [^188^][^250^].
   - However, "Lock-free programming isn't always faster than mutexes—it's a specialised tool for specific scenarios. For simpler scenarios with occasional or rare contention, mutexes are often fast and definitely easier to get right" [^188^].
   - Timur Doumler also argues that "using locks in real-time audio processing" can be done safely under specific conditions [^89^].
   - Consensus: For audio callback thread IPC, lock-free is mandatory. For background threads, mutexes may be acceptable.

5. **Should `std::memory_order_seq_cst` be used for "safety"?**
   - `seq_cst` is simpler to reason about but slower than acquire-release on weakly-ordered architectures (ARM, PowerPC).
   - Dave Rowland's ADC 2025 taxonomy distinguishes between lock-free and wait-free; `seq_cst` is not required for correct SPSC [^276^].
   - Consensus: Use acquire-release for SPSC indices. Reserve `seq_cst` only when global ordering across multiple variables is required.

### Relation to Manifold Codebase

1. **CaptureBuffer**: Uses `juce::AudioBuffer` backing with per-channel `offsetToNow` and `juce::jlimit` bounds checking. This is a simple non-lock-free circular buffer for intra-thread use. The `jlimit` bounds checking adds minor overhead but ensures safety. *Opportunity*: If `CaptureBuffer` is only ever accessed from a single thread, it does not need atomic indices. If shared between threads, it should be upgraded to an SPSC design.

2. **MidiRingBuffer**: Lock-free SPSC, 256 capacity, packed 4-byte messages (status|data1|data2|timestampDelta), atomic write/read indices. This is a well-designed lightweight SPSC queue. *Opportunity*: Verify that the atomic loads/stores use acquire/release semantics. If using `std::memory_order_seq_cst` by default, there is performance to reclaim. Also, cache-line alignment of the indices would improve performance under contention.

3. **AudioCaptureRing**: ~1M float power-of-2 capacity, bitwise masking for index wrap (`& (CAPACITY-1)`), interleaved stereo. This follows the canonical DSP optimization. *Opportunity*: The 1M capacity is generous for retrospective capture. Consider whether this pre-allocation impacts memory pressure. The interleaved stereo layout is efficient for streaming but may complicate per-channel processing.

4. **SPSCQueue / EventRing**: Generic template SPSC with `std::array` backing. Good generic design. *Opportunity*: If instantiated with types larger than cache lines, consider the false-sharing implications. The `std::array` backing is stack-friendly for small capacities but may be heap-allocated for large ones.

5. **All use modulo arithmetic for index wrapping**: The codebase reports that all implementations use modulo arithmetic, with `AudioCaptureRing` specifically using the bitwise optimization. *Opportunity*: Standardize on the power-of-2 + bitwise-AND pattern across all implementations, with compile-time assertions for capacity validation.

6. **No evidence of cache-line alignment**: None of the described implementations mention cache-line padding or alignment. Given that modern CPUs have 64-byte cache lines, atomic read/write indices placed adjacent to other fields in a struct will share cache lines, causing false sharing if both producer and consumer threads run on different cores.

7. **No contiguous-block API**: The implementations appear to handle wrap-around via per-element or per-sample logic. JUCE's `AbstractFifo` shows the value of `prepareToWrite`/`prepareToRead` APIs that return contiguous ranges. *Opportunity*: For bulk operations (e.g., copying 128-sample blocks), a contiguous-block API would eliminate modulo operations from the inner loop and enable `memcpy`/`std::copy` optimization.

8. **No virtual-memory mirroring or phantom buffer techniques**: These advanced optimizations are absent. For `AudioCaptureRing` in particular, a mirrored buffer could simplify the capture-to-timeline workflow by always providing contiguous blocks.

### Recommended Improvements / Opportunities

1. **Verify and document memory ordering semantics** in `MidiRingBuffer` and `SPSCQueue`. Ensure `writeIndex.store()` uses `std::memory_order_release` and `readIndex.load()` uses `std::memory_order_acquire`. This is the most critical correctness issue.

2. **Add cache-line alignment to atomic indices** in all lock-free implementations. In C++17+, use `alignas(std::hardware_destructive_interference_size)` or explicit padding. This can improve throughput by 10x under contention [^189^][^250^].

3. **Standardize power-of-2 capacity enforcement** with compile-time assertions (e.g., `static_assert((capacity & (capacity - 1)) == 0, "Capacity must be power of 2")`).

4. **Introduce a contiguous-block API** modeled after JUCE's `AbstractFifo::prepareToWrite`/`prepareToRead`. This would return `(startIndex, blockSize)` pairs, enabling bulk `memcpy` and SIMD optimization.

5. **Evaluate JUCE's `AbstractFifo`** as a replacement for custom FIFO logic. It is well-tested, lock-free, and provides both the traditional API and modern `ScopedRead`/`ScopedWrite` RAII wrappers [^252^].

6. **Consider virtual-memory mirroring for `AudioCaptureRing`** (desktop platforms only). This would eliminate wrap-around logic and enable truly contiguous capture blocks. Tasty Pixel's `TPCircularBuffer` demonstrates this approach on macOS/iOS [^282^].

7. **Review `CaptureBuffer` thread safety model.** If it's single-threaded, document this explicitly. If shared, upgrade to a proper SPSC design with atomic indices.

8. **For delay-line use cases**, evaluate fractional-delay interpolation (linear or allpass) if `AudioCaptureRing` or `CaptureBuffer` are used with non-integer read offsets [^187^].

9. **Add bounded-capacity overflow policy documentation.** For `AudioCaptureRing`, the overflow behavior (overwrite oldest data vs. drop new data) should be explicit and documented. The standard DAW retrospective model overwrites oldest data.

10. **Consider `std::atomic<size_t>` with unbounded counters** for the next generation of SPSC queues. This simplifies full/empty detection and eliminates the modulo from the fast path entirely [^250^].

### Raw Evidence Log

---

Claim: SPSC wait-free ring buffer is "the bread and butter data structure for concurrency in real-time audio programming"
Source: Paul Adenot (Mozilla) blog
URL: https://blog.paul.cx/post/a-wait-free-spsc-ringbuffer-for-the-web/
Date: 2022-06-06
Excerpt: "The Single-Producer Single-Consumer wait-free ring buffer (often called SPSC ring buffer) is often regarded as the bread and butter data structure for concurrency in real-time audio programming"
Confidence: high

---

Claim: Bitwise-AND for power-of-2 circular buffer wrapping is significantly faster than modulo
Source: Doug Richardson, "Wrapping Counters"
URL: https://dougrichardson.us/notes/wrapping_counters
Date: 2016-04-18
Excerpt: "If the buffer is of a power-of-2 size, then a much quicker bitwise-AND instruction can be used instead."
Confidence: high

---

Claim: Acquire-release is the correct minimal memory ordering for SPSC ring buffer indices
Source: Dave Kilian, "Making Sense of Acquire-Release Semantics"
URL: https://davekilian.com/acquire-release.html
Date: 2008-11-11
Excerpt: "We use the release semantic when bumping the tail, since that's how the current thread releases its ownership of the item it just enqueued. We use the acquire semantic when reading the tail in poll(), since that's how we know ownership of an entry has passed to us."
Confidence: high

---

Claim: JUCE AbstractFifo is lock-free and provides prepareToWrite/prepareToRead for contiguous block access
Source: JUCE documentation / CCRMA Stanford mirror
URL: https://ccrma.stanford.edu/~jos/juce_modules/classAbstractFifo.html
Date: Unknown
Excerpt: "Encapsulates the logic required to implement a lock-free FIFO... To use it, you can call prepareToWrite() to determine the position within your own buffer that an incoming block of data should be stored, and prepareToRead() to find out when the next outgoing block should be read from."
Confidence: high

---

Claim: Cache-line padding of atomic indices can prevent false sharing and dramatically improve throughput
Source: Trisha Gee, "Dissecting the Disruptor: Why it's so fast (part two)"
URL: https://trishagee.com/2011/07/22/dissecting_the_disruptor_why_its_so_fast_part_two__magic_cache_line_padding/
Date: 2011-07-22
Excerpt: "The Disruptor eliminates this problem, at least for architecture that has a cache size of 64 bytes or less, by adding padding to ensure the ring buffer's sequence number is never in a cache line with anything else."
Confidence: high

---

Claim: Mirrored virtual memory can eliminate circular buffer wrap-around logic entirely
Source: Mike Ash, "Ring Buffers and Mirrored Memory"
URL: https://www.mikeash.com/pyblog/friday-qa-2012-02-03-ring-buffers-and-mirrored-memory-part-i.html
Date: 2012-02-03
Excerpt: "Ring buffers are commonly used for communicating audio into playback threads and out of recording threads... the wraparound forces a memory copy for getting data into or out of the ring buffer."
Confidence: high

---

Claim: The Phantom Buffer pattern provides contiguous memory subsequences from a circular buffer
Source: A Dataflow Pattern Catalog for Sound and Music Computing (PLoP 2006)
URL: https://amatria.in/pubs/plop2006.pdf
Date: 2006
Excerpt: "a phantom buffer offers a contiguous array where the last N elements are a replication of the first N... The main problem this layer has to solve is the discontinuity problem associated to circular buffers"
Confidence: high

---

Claim: ADC 2025 presented comprehensive benchmarking of lock-free queues including juce::AbstractFifo
Source: Dave Rowland, "Lock-free queues in the multiverse of madness" (ADC 2025)
URL: https://drowaudio.github.io/presentations/ADC%202025%20-%20Lock-free%20queues%20in%20the%20multiverse%20of%20madness/Lock-free%20queues%20in%20the%20multiverse%20of%20madness.pdf
Date: 2025
Excerpt: "Realtime code use ring buffers to implement a FIFO. Fixed capacity: no allocations (i.e. realtime safe)."
Confidence: high

---

Claim: Bounded queues are preferred over unbounded for real-time systems
Source: "A Portable Lock-free Bounded Queue" (academic paper)
URL: https://rmmilewi.github.io/files/lockfreequeue16.pdf
Date: Unknown
Excerpt: "Bounded queues are often implemented as circular buffers with a maximum storage capacity. Circular buffers do not require dynamic memory management and are well suited for embedded devices, real-time systems, operating systems."
Confidence: high

---

Claim: Linear interpolation is the most common fractional delay technique for audio delay lines
Source: Julius O. Smith III, CCRMA Stanford, "Delay-Line Interpolation"
URL: https://ccrma.stanford.edu/~jos/pasp/Delay_Line_Interpolation.html
Date: 2026-01-14
Excerpt: "Linear interpolation is perhaps most commonly used because it is very straightforward and inexpensive, and because it sounds very good when the signal bandwidth is small compared with half the sampling rate."
Confidence: high

---

Claim: Double buffering (ping-pong) is optimal for DMA-driven block processing, while ring buffers are for streaming
Source: Audio DSP Lab, "Ping Pong Buffer Audio Stream"
URL: https://audiodsplab.wordpress.com/ping-pong-buffer-audio-stream/
Date: 2021-01-17
Excerpt: "In a block-based processing system that uses DMA to transfer data to and from the processor core, a 'double buffer' must exist to arbitrate between the DMA transfers and the core."
Confidence: high

---

Claim: Lock-free audio thread code must avoid memory allocation, blocking, and locks
Source: CppCon 2015 summary / Ross Bencina / Fabian Renn-Giles
URL: https://blog.csdn.net/TM1695648164/article/details/148451552
Date: 2025-06-05
Excerpt: "音频回调里只能执行无锁（lock-free）代码，禁止任何内存分配和释放！绝不调用 new 或 delete"
Confidence: high

---

Claim: SIMD requires aligned memory and benefits from contiguous block operations
Source: Quiver DSP documentation
URL: https://quiver-dsp.com/concepts/performance.html
Date: Unknown
Excerpt: "SIMD requires aligned memory... AudioBlock is automatically aligned (16-byte aligned)."
Confidence: high

---

Claim: The Multiple Window Circular Buffer pattern enables one writer and multiple readers with independent window sizes
Source: PLoP 2006, "A Dataflow Pattern Catalog for Sound and Music Computing"
URL: https://hillside.net/plop/2006/Papers/Library/audioPatterns_20060809.pdf
Date: 2006
Excerpt: "What design supports a single source of tokens with one writer and multiple readers, giving each one access to a subsequence of tokens?"
Confidence: high

---

Claim: Retrospective recording in DAWs is universally implemented via large circular buffers
Source: Various DAW documentation and plugin marketing
URL: https://fineclassicsplugins.com/products/fine-classics-capture
Date: 2026-02-21
Excerpt: "Fine Classics Capture is your production safety net. It is a lightweight, circular buffer utility that sits on your track, always listening, always recording."
Confidence: medium

---

Claim: boost::lockfree::spsc_queue is recommended for real-time audio MIDI streams
Source: Timur Doumler, "Using locks in real-time audio processing, safely"
URL: https://timur.audio/using-locks-in-real-time-audio-processing-safely
Date: 2020-04-14
Excerpt: "If you have a stream of objects flowing from one thread to the other, such as MIDI messages, you can use a lock-free single-producer single-consumer FIFO (boost::spsc_queue is a good implementation)."
Confidence: high

---

Claim: Unbounded counters simplify full/empty detection in SPSC queues
Source: pmbanugo, "Building a Lock-Free Single Producer, Single Consumer Queue"
URL: https://pmbanugo.me/blog/building-lock-free-spsc-queue
Date: 2025-12-13
Excerpt: "Why Unbounded Counters Simplify Everything... Empty: consumer_pos == producer_pos... Full: producer_pos - consumer_pos >= capacity"
Confidence: high

---

Claim: BBQ (Block-based Bounded Queue) outperforms Boost, Folly, and Linux kernel ring buffers
Source: USENIX ATC'22, "BBQ: A Block-based Bounded Queue for Exchanging Data"
URL: https://www.usenix.org/system/files/atc22-wang-jiawei.pdf
Date: 2022
Excerpt: "For the simple workload, BBQ yields 11.3x to 42.4k higher throughput than other libraries."
Confidence: high

---

Claim: The C++ audio industry consensus is to use lock-free ring buffers for thread communication
Source: szanni/ringbuf (C11 atomics SPSC ring buffer)
URL: https://github.com/szanni/ringbuf
Date: 2019-03-02
Excerpt: "ringbuf was originally developed for audio applications, aiding in the separation of audio decoding and PCM output."
Confidence: high

---

Claim: ringbuf-basedrop fork ensures real-time safety by avoiding deallocation in the real-time thread
Source: Rust docs for ringbuf_basedrop
URL: https://docs.rs/ringbuf-basedrop
Date: 2026-04-21
Excerpt: "This ensures that when all references to the ring buffer are dropped, the underlying Vec will never potentially get deallocated (a non-realtime safe operation) in the realtime thread."
Confidence: high

---

Claim: Direct ring buffer with slice-based API and full-capacity utilization is ideal for audio streaming
Source: ain1084/direct_ring_buffer (Rust)
URL: https://github.com/ain1084/direct_ring_buffer
Date: 2024-05-30
Excerpt: "Its slice-oriented API and full-capacity utilization make it ideal for real-time streaming workloads, where stable boundaries and predictable throughput are essential."
Confidence: high

---

Claim: Chrome AudioWorklet uses ring buffers to handle buffer size mismatches
Source: Chrome Developers Blog, "Audio worklet design pattern"
URL: https://developer.chrome.com/blog/audio-worklet-design-pattern
Date: 2018-06-18
Excerpt: "For such cases, the common solution is to use a ring buffer (also called a circular buffer or FIFO)... the input frames will always accumulate into the input ring buffer, and buffer overflow is handled by overwriting the oldest frames in the buffer."
Confidence: high
