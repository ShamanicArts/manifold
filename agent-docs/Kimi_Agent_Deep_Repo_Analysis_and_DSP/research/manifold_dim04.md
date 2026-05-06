## Dimension: Scripting Language Integration in Real-time Audio

---

### Key Findings

1. **Manifold's "Lua Never on Audio Thread" architecture is the industry consensus pattern.** Every major audio scripting system reviewed — REAPER's ReaScript [^137^], Cantabile's expression engines [^148^], Renoise's Lua tools [^88^], and Synthesizer V Studio's scripting [^87^] — explicitly keeps the scripting language off the audio thread. REAPER's API documentation states: "Must only call from the main thread" for audio accessors [^137^]. Cantabile's developer notes: "General expressions can't be used on the audio thread, because they're implemented in .NET and to call them would introduce the possibility of audio glitches if the .NET garbage collector happens to run while being called" [^148^].

2. **Dual-VM architecture is well-established in audio.** SuperCollider's scsynth+sclang separation [^90^][^91^], Max/MSP's separate scheduler and audio graph, and HISE's scriptnode design [^51^][^72^] all use a control/scripting VM separate from the real-time DSP engine. Manifold's UI VM + DSP VM pattern mirrors this precisely.

3. **Lua 5.4's generational GC improves but does not solve real-time safety concerns.** Benchmarks show Lua 5.4 with generational GC is "18% faster for NBody, 34% faster for CD" compared to 5.3 [^121^][^122^]. Memory usage with generational GC is dramatically better (596KB vs 1.2MB for same workload) [^122^]. However, as one developer noted: "Lua doesn't need to use malloc directly -- you can replace the memory allocation function with your own implementation which is real-time safe" [^58^]. The GC still introduces non-deterministic pauses — acceptable for message-thread scripting but unsuitable for audio callbacks.

4. **sol2 binding overhead is measurable but bounded.** sol2's own benchmarks claim "29 of 38" categories winning against competing Lua binding libraries, with ~10ns call overhead in ideal conditions [^75^]. However, real-world measurements show C++ function bindings through sol2 taking ~50ns per call vs 1-2ns for pure Lua/LuaJIT [^67^]. Member function calls through sol2 measure around 200ns [^67^]. For Manifold's use (graph definition on message thread, not per-sample audio), this overhead is negligible.

5. **Compile-to-C++ graph pattern is used by HISE and Cmajor as the state-of-the-art for scripting-defined DSP.** HISE's scriptnode compiles visual/node graphs to C++ classes: "the generated Cpp code will boil [three addition nodes] down to a single assembly instruction: `mov xmm0 1.04122`" [^72^]. Cmajor similarly uses LLVM JIT for DSP code with hot-reload capability, then exports to native C++ for production [^68^][^69^]. Manifold's "Lua tables returned from `buildPlugin(ctx)` compile to C++ runtime" follows this exact paradigm.

6. **SOL_ALL_SAFETIES_ON=1 adds type checking overhead but is appropriate for audio plugin development.** The sol2 documentation defines `SOL_ALL_SAFETIES_ON` as enabling all safe getter, usertype, reference, function, numerics, and function call checks [^125^]. The `SOL_SAFE_NUMERICS=0` flag (as used in Manifold) opts out of number precision checking, which is a sensible tradeoff for DSP where float/double conversions are well-understood. A benchmark migration analysis noted that `SOL_ALL_SAFETIES_ON` "currently prioritizes safety over speed" [^117^].

7. **Faust DSL vs Lua scripting represents a fundamental philosophical split in audio DSP development.** Faust compiles functional DSP specifications to efficient C++ via whole-program optimization [^56^][^140^]. Lua (and scripting generally) excels at graph orchestration and UI/control logic but is acknowledged as unsuitable for raw DSP: "I tried it with Lua, arguably one of the fastest interpreted languages, but for DSP it's really not feasible. About a ten-fold increase in cpu" [^12^]. Faust is ~320% of C speed in benchmarks; LuaJIT is ~446%; pure Lua is far slower [^12^]. Manifold's approach — using Lua for graph definition while the actual DSP runs in compiled C++ — captures the best of both paradigms.

8. **Hot-reload at ~30Hz (message thread) is consistent with known working patterns.** HISE supports iterative "jump back to the interpreted version with a single click to make adjustments and recompile the graph" [^70^]. Cmajor's JIT plugin "can edit your patches while running, and they'll automatically rebuild and update themselves without needing to restart" [^68^]. Synthesizer V Studio supports script hot-reload for UI automation [^87^]. The 30Hz refresh rate is a pragmatic choice that balances responsiveness with CPU load on the message thread.

9. **Lua memory overhead per usertype is ~4-8KB for small bindings.** An embedded developer reported that "even small `new_usertypes` with only one function binded seem to consume around 4kB of RAM when using Lua 5.3" and up to 8KB with more functions [^101^]. For Manifold's desktop audio plugin context (not embedded), this is negligible, but worth noting for memory-constrained deployments.

10. **Cantabile's developer built a custom GC specifically to address scripting on the audio thread.** The Cantabile developer designed "a single threaded, incremental garbage collector" with "both the mark and sweep phases incremental so the entire cost of the garbage collection can be amortized over a long period of time" [^147^]. This validates Manifold's decision to avoid the problem entirely by keeping Lua off the audio thread.

---

### Major Sources & Authorities

- **HISE Scriptnode Documentation (docs.hise.dev)** [^51^][^52^][^70^][^72^]: The most directly comparable system to Manifold's architecture. HISE uses a scripting-accessible node graph that compiles to C++ for production DSP. Rationale, performance expectations, and workflow patterns are highly transferable.

- **sol2 Official Documentation (sol2.readthedocs.io)** [^74^][^99^][^101^][^125^]: Authoritative source on sol2 memory layout, safety flags, and performance characteristics. ThePhD's Lua Workshop 2016 presentation [^75^] provides benchmark methodology and design rationale.

- **Cmajor Documentation (cmajor.dev)** [^68^][^69^]: Modern C-family audio language with LLVM JIT hot-reload and export-to-C++ pipeline. Demonstrates that compile-to-native is the production pattern for scripted DSP.

- **Synthesizer V Studio Scripting Manual (resource.dreamtonics.com)** [^87^]: Commercial DAW-like plugin with dual Lua/JavaScript scripting on the message thread. ADC 2025 talk [^10^] covers architecture decisions for scripting in audio software at scale.

- **Faust Documentation (faust.grame.fr, faustdoc.grame.fr)** [^56^][^140^]: The canonical audio DSL reference. Provides the performance baseline that justifies keeping interpreted scripting away from sample-level DSP.

- **music-dsp mailing list archive (music.columbia.edu)** [^12^]: Historical but authoritative discussion from 2008 on real-time audio language performance. Contains multiple expert testimonials on why C/C++ remains dominant for DSP and why scripting languages are used for "gluing" only.

- **Lua 5.4 Reference Manual (lua.org)** [^119^]: Authoritative documentation of generational GC and `collectgarbage()` API.

- **LWN "What's new in Lua 5.4" (lwn.net)** [^123^]: High-quality technical journalism on Lua 5.4 GC improvements and their real-world implications.

- **SuperCollider CCRMA Documentation** [^90^][^91^][^92^]: Stanford/CCRMA materials on the canonical dual-process (language + synthesis server) architecture that influenced the entire field.

- **Renoise Forums / JUCE Forums** [^88^][^89^]: Practitioner reports confirming the "scripting on message thread only" pattern in real products.

---

### Patterns & Best Practices

- **Pattern: Scripting VM exclusively on message/UI thread; compiled C++ on audio thread.** Found in REAPER [^137^], Cantabile [^148^], Renoise [^88^], Synthesizer V [^87^], SuperCollider [^90^], and Manifold. This is the dominant architectural pattern for audio plugin scripting.

- **Pattern: Lua/sol2 usertype memory layout awareness.** sol3 now aligns userdata memory, and developers should use `sol::detail::align_usertype_pointer` when manually accessing raw userdata [^99^]. For Manifold's `RuntimeNode` and `Canvas` bindings, relying on sol2's automatic alignment is correct.

- **Pattern: Graph compilation to C++ for production, interpreted for prototyping.** HISE's scriptnode workflow [^70^][^72^] and Cmajor's JIT-to-native export [^68^] both implement this. Manifold's deferred mutation worker that compiles Lua tables to C++ runtime matches this exactly.

- **Pattern: Replace Lua allocator for real-time contexts when needed.** Lua allows replacing `lua_Alloc` with custom allocators like TLSF or pool-based allocators [^58^][^12^]. While Manifold doesn't need this (Lua never runs on audio thread), it's the standard approach if real-time Lua were ever required.

- **Pattern: Keep API surface small and stable for scripting.** "Treat the Lua-facing API like a product interface, not a direct mirror of your C++ classes. Expose a small set of gameplay services... and keep engine internals private" [^53^]. Manifold's `buildPlugin(ctx)` with controlled context object follows this.

- **Pattern: GC tuning for predictable frame times.** "For smooth 60fps, target no more than 1–2ms per frame for GC" [^118^]. Lua's `collectgarbage("stop")` / `collectgarbage("step", size)` API allows fine-grained control. Manifold's ~30Hz hot-reload should monitor GC pauses.

- **Pattern: Separate UI state objects from data objects.** Synthesizer V Studio's scripting API distinguishes "data objects" (tracks, notes, parameters) from "UI state objects" (PlaybackControl) [^87^]. Manifold's dual VM separation (UI VM for canvas, DSP VM for graph definition) achieves a similar separation.

---

### Controversies & Conflicting Claims

1. **LuaJIT vs Lua 5.4 for audio-related scripting.** LuaJIT offers 3-5x speedup over Lua 5.x [^117^] and has FFI for zero-overhead C calls. However, LuaJIT is based on Lua 5.1, lacks 5.4 features, and development has slowed. For Manifold's use (graph definition, not DSP execution), Lua 5.4's modern features and generational GC may be preferable to LuaJIT's raw speed. One practitioner noted: "Lua was always somewhere between 50-100% slower than LuaJIT, which is NOT a lot" [^22^]. The decision depends on whether FFI calls would significantly improve Manifold's graph construction performance.

2. **Whether garbage-collected languages can ever be truly real-time safe.** The music-dsp thread [^12^] shows a spectrum of opinion: Kjetil S. Matheussen (Vessel author) reports Lua performs "very well indeed; very low jitter" with GC tuning [^12^]. Others argue "Forget Java or anything except C/C++ if you really, truly want speed" [^12^]. Cantabile's developer ultimately concluded GC on the audio thread is possible but built a custom incremental GC to achieve it [^147^]. Manifold sidesteps this debate by design.

3. **sol2 vs LuaBridge3 performance.** A Stack Overflow benchmark [^73^] claims LuaBridge3 outperforms sol2 on some tests (e.g., class field access 283ms vs 1512ms). However, these benchmarks may not use sol2's optimized paths (`sol::c_call`, `SOL_NO_CHECK_NUMBER_PRECISION`). The sol2 author argues that with proper optimization flags, sol2 wins "29 of 38" categories [^75^]. The discrepancy highlights that binding performance is highly dependent on compile flags and API usage patterns.

4. **Should scripting define the graph or the per-sample processing?** HISE scriptnode and Cmajor allow per-sample expressions in nodes that compile to C++ [^72^][^69^]. Manifold's Lua only defines the graph topology (tables returned from `buildPlugin(ctx)`), not per-sample code. This is more restrictive but avoids all JIT/compilation complexity on the audio path. The tradeoff is that Manifold users cannot write custom per-sample algorithms in Lua — they must use pre-built C++ nodes.

5. **Hot-reload at 30Hz vs. event-driven refresh.** Some practitioners advocate reloading "only when code changes" rather than polling. Manifold's ~30Hz polling model is simple but may waste CPU. HISE uses explicit "compile this network" actions [^70^]. Cmajor's JIT detects file changes and rebuilds [^68^].

---

### Relation to Manifold Codebase

- **Dual LuaEngine + DSPPluginScriptHost VMs** directly mirror the SuperCollider scsynth/sclang [^90^] and HISE scriptnode/HiseScript [^51^] separations. This is a well-validated pattern, not an experimental architecture.

- **sol2 with `SOL_ALL_SAFETIES_ON=1`** aligns with audio plugin safety requirements. The `SOL_SAFE_NUMERICS=0` compile flag (as set in Manifold) is a reasonable optimization since DSP graph parameters are overwhelmingly floating-point and the precision checks add overhead without catching real bugs.

- **Lua NEVER on audio thread** is the critical invariant that makes the architecture viable. The music-dsp consensus [^12^], Cantabile's design [^148^], and REAPER's API rules [^137^] all confirm this is the correct choice. Manifold's compilation of Lua tables to a C++ runtime graph preserves this invariant.

- **Deferred mutation worker** for graph compilation matches HISE's "export it as Cpp node and move on to the next task" workflow [^70^]. The key risk area is thread synchronization between the message thread (where Lua runs) and the audio thread (where the compiled graph runs). The industry pattern is to use a non-blocking atomic pointer swap or reader-writer lock with pre-allocated memory.

- **Hot-reload at ~30Hz** should be compared against HISE's explicit compile action and Cmajor's file-watch JIT. 30Hz polling is simple but may cause unnecessary GC pressure. A file-watch or event-driven model could reduce message thread CPU usage.

- **Parameter registry and synth/FX bindings** should follow the Synthesizer V pattern of exposing "a single global object, SV, and most interactions with project data are performed through methods on specific data type objects" [^87^]. Manifold's `ctx` parameter to `buildPlugin(ctx)` serves this role.

---

### Recommended Improvements / Opportunities

1. **Consider generational GC explicitly.** If Manifold uses Lua 5.4, add `collectgarbage("generational")` to both VMs. Benchmarks show significant memory and CPU improvements for short-lived allocation patterns [^121^][^122^][^123^]. Monitor with `collectgarbage("count")` during hot-reload to ensure GC stays under budget.

2. **Replace 30Hz polling with event-driven hot-reload.** Use file-system watchers (e.g., `std::filesystem::last_write_time` or platform-specific APIs) to trigger reloads only when scripts change. This reduces message thread CPU and GC pressure.

3. **Document the "Lua Never on Audio Thread" invariant prominently.** Add assertions or static analysis to prevent accidental Lua calls from audio thread code. Consider a custom `juce::Thread` wrapper that asserts thread identity before sol2 calls.

4. **Evaluate sol2 vs LuaBridge3/LuaJIT FFI for graph construction overhead.** If `buildPlugin(ctx)` becomes a bottleneck with complex graphs, benchmark sol2's `c_call` paths [^67^] against alternatives. For most use cases sol2's ~200ns member call overhead is acceptable on the message thread.

5. **Add graph compilation caching.** Cache compiled C++ graphs keyed by Lua script hash to avoid recompiling identical scripts. HISE's compiled networks are cached as dynamic libraries [^66^].

6. **Monitor sol2 usertype memory for the scene graph.** If `Canvas` and `RuntimeNode` usertypes accumulate to hundreds or thousands of objects, the ~4-8KB per usertype overhead [^101^] could become significant. Consider lightweight proxy objects or object pooling.

7. **Consider a Faust node integration.** Faust's DSL-to-C++ compilation [^56^][^140^] could allow users to write custom per-sample algorithms that compile into Manifold's C++ runtime, bridging the gap between Manifold's restricted scripting model and full custom DSP.

8. **Implement OSC callback queuing.** OSC callbacks from Lua should queue events for the audio thread rather than calling directly. This matches SuperCollider's OSC-to-scsynth pattern [^90^] and prevents message thread activity from spilling into audio timing.

---

### Raw Evidence Log

**Claim:** Lua scripting for audio should never run on the audio thread due to GC non-determinism.
**Source:** Cantabile Developer Forum
**URL:** https://community.cantabilesoftware.com/t/thinking-out-loud-a-scripting-language-for-cantabile/9262
**Date:** 2023-12-22
**Excerpt:** "General expressions can't be used on the audio thread, because they're implemented in .NET and to call them would introduce the possibility of audio glitches if the .NET garbage collector happens to run while being called."
**Confidence:** High

---

**Claim:** Lua 5.4 generational GC dramatically improves memory behavior over incremental mode.
**Source:** lua-users.org mailing list
**URL:** http://lua-users.org/lists/lua-l/2018-03/msg00398.html
**Date:** 2018-03-17
**Excerpt:** "GENERATIONAL GC... 596331.1 -- VERY GOOD, AWESOME... The (default) generational garbage collector of lua5.4 performs much better than all previous versions, concerning memory usage AND time!"
**Confidence:** High

---

**Claim:** HISE scriptnode compiles visual node graphs to optimized C++ code with zero interpreter overhead in production.
**Source:** HISE Scriptnode Documentation
**URL:** https://docs.hise.dev/scriptnode/index.html
**Date:** 2019-06-24
**Excerpt:** "If you use 3 addition nodes like this: the interpreter will have to calculate three nodes individually. The generated Cpp code will boil them down to a single assembly instruction: mov xmm0 1.04122"
**Confidence:** High

---

**Claim:** sol2 has ~10ns ideal call overhead but C++ function binding through sol2 is ~50ns in practice.
**Source:** GitHub Issue on ThePhD/sol2
**URL:** https://github.com/ThePhD/sol2/issues/1154
**Date:** 2021-03-11
**Excerpt:** "function elapsed time is only 1-2 ns, and binding overhead is 50 sec, which meant 50 ns for a single call... According to benchmark - call to member function it took 200 ns for lua sol"
**Confidence:** Medium

---

**Claim:** Faust DSL compiles to efficient C++ and targets a wide range of plugin architectures.
**Source:** Faust Programming Language official site
**URL:** https://faust.grame.fr/
**Date:** 2023-08-27
**Excerpt:** "The core component of Faust is its compiler. It allows to 'translate' any Faust digital signal processing (DSP) specification to a wide range of non-domain specific languages such as C++, C, LLVM bit code, WebAssembly, Rust, etc."
**Confidence:** High

---

**Claim:** LuaJIT is ~3-5x faster than Lua 5.3/5.4 but based on Lua 5.1 with compatibility risks.
**Source:** GitHub Gist analysis
**URL:** https://gist.github.com/scarf005/9f113e4a2dd577cfb75dc44ca8e7741d
**Date:** 2026-01-10
**Excerpt:** "LuaJIT Benefits: Performance: LuaJIT is 3-5x faster than Lua 5.3 in most benchmarks... ⚠ Changes Required... LuaJIT is based on Lua 5.1 (not 5.3) - API differences exist"
**Confidence:** High

---

**Claim:** SuperCollider's dual-process architecture (sclang + scsynth via OSC) is a foundational pattern for audio scripting.
**Source:** CCRMA / Stanford SuperCollider documentation
**URL:** https://ccrma.stanford.edu/~ruviaro/texts/A_Gentle_Introduction_To_SuperCollider.pdf
**Date:** Unknown
**Excerpt:** "SuperCollider is actually made of two distinct applications: the server and the language. The server is responsible for making sounds. The language (also referred to as client or interpreter) is used to control the server."
**Confidence:** High

---

**Claim:** Synthesizer V Studio exposes dual Lua/JavaScript scripting on the message thread with object-oriented APIs.
**Source:** Dreamtonics Scripting Manual
**URL:** https://resource.dreamtonics.com/scripting/
**Date:** Unknown
**Excerpt:** "Synthesizer V Studio's scripting API is object-oriented. JavaScript and Lua scripts share the same API... Data objects are parts of a project that can be tracks, notes, parameters ... UI state objects are more interesting. They are an abstraction of the user interface."
**Confidence:** High

---

**Claim:** Cmajor uses LLVM JIT for hot-reload development, then exports to native C++ for production plugins.
**Source:** Cmajor Documentation
**URL:** https://cmajor.dev/
**Date:** Unknown
**Excerpt:** "This loader plugin uses a JIT engine, so you can edit your patches while running, and they'll automatically rebuild and update themselves without needing to restart... When you have a finished Cmajor patch, you can use our tools to convert it to a native C++ JUCE project."
**Confidence:** High

---

**Claim:** sol2 usertypes consume ~4-8KB RAM per bound type on Lua 5.3.
**Source:** GitHub Issue on ThePhD/sol2
**URL:** https://github.com/ThePhD/sol2/issues/807
**Date:** 2019-04-23
**Excerpt:** "even small `new_usertypes` with only one function binded seem to consume around 4kB of RAM when using Lua 5.3. If the number of functions which are bound increase the memory consumption goes up to 8kB and more."
**Confidence:** Medium

---

**Claim:** The music-dsp community consensus is that C/C++ is essential for real-time audio, with scripting languages used for "gluing" only.
**Source:** music-dsp mailing list (Columbia University)
**URL:** https://music-dsp.music.columbia.narkive.com/gfq0fD9e/programming-languages-for-real-time-audio
**Date:** 2008-08-23
**Excerpt:** "I tried it with Lua, arguably one of the fastest interpreted languages, but for DSP it's really not feasible. About a ten-fold increase in cpu... I also tried with LuaJIT, which compiles to native rather than VM bytecode, and that was more feasible. But- the language really wasn't designed for the kind of math DSP needs."
**Confidence:** High

---

**Claim:** Vessel (Lua-based audio platform) achieved real-time synthesis with Lua by carefully tuning GC and using custom allocators.
**Source:** music-dsp mailing list / Lua Workshop 2008
**URL:** https://music-dsp.music.columbia.narkive.com/gfq0fD9e/programming-languages-for-real-time-audio
**Date:** 2008-08-23
**Excerpt:** "Have you looked at Vessel? It seems very nice and a quick way to test lua's realtimeness... Yes, I can speak from experience that it performs very well indeed; very low jitter... In Lua~ I have the collector effectively turned off while running coroutine updates, and then run a conservative step of gc at the end of each DSP callback."
**Confidence:** High

---

**Claim:** Lua 5.4's GC can be tuned for real-time with `collectgarbage("stop")`, custom step sizes, and allocator replacement.
**Source:** Lua-RTOS Hacker News discussion
**URL:** https://news.ycombinator.com/item?id=27446371
**Date:** 2021-06-09
**Excerpt:** "Lua doesn't need to use malloc directly -- you can replace the memory allocation function with your own implementation which is real-time safe... You _could_ disable the Lua GC and mostly manage C buffers with Lua functions."
**Confidence:** Medium

---

**Claim:** Elementary Audio demonstrates JavaScript-defined audio graphs running natively as VST/AU plugins.
**Source:** LogRocket / Elementary Audio blog
**URL:** https://blog.logrocket.com/build-native-audio-plugin-elementary/
**Date:** 2022-03-17
**Excerpt:** "Elementary can run your code (a.k.a. render) in three environments: in the Node command line, in a WebAudio web application, and natively as a DAW plugin."
**Confidence:** High

---

**Claim:** ADC 2025 featured a talk on scripting architecture for DAW-like plugins using Lua and JavaScript.
**Source:** Audio Developer Conference 2025 Schedule
**URL:** https://conference.audio.dev/session/2025/scripting-architecture-for-a-daw-like-plugin/
**Date:** 2025-11-11
**Excerpt:** "Audio software at scale is often met with thousands of feature requests across diverse user groups with varying workflows. This talk presents scripting as a solution to bridge the gap between limited development resources and a growing backlog."
**Confidence:** High

---

**Claim:** sol2 safety flags (`SOL_ALL_SAFETIES_ON`) enable comprehensive type checking at the cost of some performance.
**Source:** sol2 ReadTheDocs
**URL:** https://sol2.readthedocs.io/en/latest/safety.html
**Date:** 2021-02-14
**Excerpt:** "`SOL_ALL_SAFETIES_ON` triggers the following changes: If `SOL_SAFE_USERTYPE`, `SOL_SAFE_REFERENCES`, `SOL_SAFE_FUNCTION`, `SOL_SAFE_NUMERICS`, `SOL_SAFE_GETTER`, and `SOL_SAFE_FUNCTION_CALLS` are not defined, they get defined and the effects described above kick in"
**Confidence:** High

---

**Claim:** For 60fps games, GC should target no more than 1-2ms per frame; per-frame allocation is the key metric.
**Source:** David R. Longnecker blog
**URL:** https://drlongnecker.com/blog/2026/04/lua-memory-optimization-oop-patterns-game-development/
**Date:** 2026-04-07
**Excerpt:** "A useful rule of thumb from the lua-users wiki on GC in real-time games: for smooth 60fps, target no more than 1–2ms per frame for GC. That means minimizing allocations per frame, not just in total."
**Confidence:** Medium

---

**Claim:** LuaAV and Vessel demonstrated sample-accurate Lua synthesis at UCSB using custom allocators and GC tuning.
**Source:** LuaAV Workshop Paper
**URL:** https://www.lua.org/wshop08/SmithWakefield_2008_LuaAV.pdf
**Date:** 2008
**Excerpt:** "LuaAV: Computational audiovisual composition using Lua... Vessel: A Platform for Computer Music Composition, Interleaving Sample-Accurate Synthesis and Control"
**Confidence:** High

---

**Claim:** Faust's architecture allows it to compile to many targets including VST/AU plugins, and has Lua FFI bindings available.
**Source:** Faust Documentation - Architecture Files
**URL:** https://faustdoc.grame.fr/manual/architectures/
**Date:** 2020-04-10
**Excerpt:** "Lua tools: libMfxFaust... intended for use with Luajit through the FFI... MfxFaust.lua: An environment to prototype Faust dsp, with live recompiling, oscilloscope view, hot reloading"
**Confidence:** High

---

**Claim:** REAPER ReaScript API explicitly requires audio accessor calls to be from the main thread only.
**Source:** REAPER ReaScript API Help
**URL:** https://www.reaper.fm/sdk/reascript/reascripthelp.html
**Date:** Unknown
**Excerpt:** "Create an audio accessor object for this track. Must only call from the main thread."
**Confidence:** High

---

**Claim:** Cantabile's developer built a custom incremental tri-color GC in C specifically for audio-thread scripting.
**Source:** Cantabile Community Forum (Page 2)
**URL:** https://community.cantabilesoftware.com/t/thinking-out-loud-a-scripting-language-for-cantabile/9262?page=2
**Date:** 2023-12-21
**Excerpt:** "A complete GC cycle is typically O(n) where n is the number of allocated objects. Both the mark and sweep phases of the GC are incremental so the entire cost of the garbage collection can be amortized over a long period of time... The entire runtime/GC is written in good old plain C."
**Confidence:** High

---

**Claim:** Cmajor is a C-styled language for DSP that matches/beats C++ performance using LLVM JIT.
**Source:** ADC 2023 - Practical DSP and Audio Programming slides
**URL:** https://data.audio.dev/talks/2023/practical-dsp-and-audio-programming/slides.pdf
**Date:** Unknown
**Excerpt:** "Cmajor is a C-styled language that is designed for DSP signal processing code. Aims: To match/beat the performance of C/C++. Uses an LLVM JIT compiler, to optimise and hot reload code."
**Confidence:** High

---

*Report compiled from 18+ independent web searches across academic papers, conference proceedings (ADC), official documentation, engineering blogs, and open-source project documentation.*
