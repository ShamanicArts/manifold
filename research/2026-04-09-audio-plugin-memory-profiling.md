# Advanced Memory Profiling for Audio Plugins

Date: 2026-04-09  
Context: Manifold Filter Plugin Cost Attribution Investigation  
Author: Tulpa Research

---

## Executive Summary

Based on analysis of your recent work building comprehensive performance attribution for the Manifold Filter plugin, this research document explores advanced techniques for tracking the "missing memory" you've identified — approximately **42-70MB of plugin-attributable memory** that doesn't map to obvious sources (RuntimeNode trees, DSP, Lua heap, GPU allocations, ImGui internals).

Your current diagnosis points to **JUCE/OpenGL backend allocations and/or allocator-retained memory from steady-state UI rendering**. This research validates that hypothesis and suggests concrete next steps.

---

## Key Findings from External Sources

### 1. JUCE OpenGL Context Memory Overhead

**Reference:** JUCE Forum discussions on OpenGL context attachment

A known phenomenon in JUCE-based plugins is significant memory overhead when attaching an OpenGL context:
- Reported figures: **+50-60MB RAM usage** upon OpenGL context attachment
- This aligns closely with your UI-attributable delta of ~69MB PSS / ~30MB Private Dirty
- The memory is allocated by:
  - OpenGL driver state (Mesa/Gallium on Linux)
  - JUCE's OpenGL rendering pipeline
  - GPU texture/font atlas staging buffers
  - Command buffer pools

**Implication:** Your UI-attributable delta is likely dominated by JUCE OpenGL context overhead, not plugin-owned data structures.

### 2. Mesa/Gallium Driver Pre-allocation

**Reference:** Linux graphics driver behavior

The Mesa/Gallium drivers (common on Linux) exhibit aggressive memory pre-allocation:
- Large anonymous mmap regions (3-4GB virtual, but RSS is actual committed)
- GPU-visible memory mappings that appear in `/proc/self/smaps`
- These are **host/driver mappings**, not plugin-owned allocations

**Your approach is correct:** Distinguishing plugin-attributable deltas from host/driver noise is essential. Raw RSS totals are misleading.

### 3. Allocator Retention vs. Real Leaks

**Reference:** glibc malloc behavior, `malloc_trim(0)`

glibc's allocator retains freed memory in arenas for reuse:
- `mallinfo2()` reports `uordblks` (bytes in use) and `fordblks` (free bytes held)
- **Retention pattern:** Freed memory stays in allocator pools, appearing as RSS
- **Real-time constraint:** `malloc_trim(0)` releases memory back to OS but is NOT real-time safe (takes locks, may trigger syscalls)

**Critical insight for audio plugins:**
- Measure both `uordblks` (actual usage) and `arena` (total allocated)
- The difference (`arena - uordblks`) represents allocator-held memory
- This explains some of your "missing" memory

### 4. Real-Time Safe Memory Tracking

**Reference:** PortAudio/JUCE real-time constraints

Techniques for memory profiling in real-time audio contexts:
- **No-alloc measurement:** Read `/proc/self/smaps_rollup` (already doing this ✓)
- **Lock-free atomics:** Store metrics in lock-free structures (already doing this ✓)
- **Background thread sampling:** Move non-RT-safe work to separate thread
- **Deferred attribution:** Calculate deltas in non-RT context

Your current architecture follows best practices. The gap is in **attributing native framework allocations**.

---

## Recommended Next Investigations

### 1. Render-Pause Experiment (High Priority)

**Goal:** Determine if steady-state rendering drives memory growth

**Implementation:**
```cpp
// Add to your frame timings or export endpoints
std::atomic<bool> renderPaused{false};

// In your render loop
if (!renderPaused.load(std::memory_order_relaxed)) {
    // Normal ImGui/JUCE rendering
} else {
    // Skip rendering, just clear buffer
    glClear(GL_COLOR_BUFFER_BIT);
}
```

**Measurement protocol:**
1. Baseline: Plugin open, normal rendering
2. Pause: Rendering disabled for 10s
3. Resume: Normal rendering restored
4. Compare memory deltas at each stage

**Expected outcomes:**
- If render-pause reduces memory growth → rendering pipeline is the culprit
- If no change → look elsewhere (Lua, DSP graph, static allocations)

### 2. malloc_trim() Diagnostic Endpoint (Medium Priority)

**Goal:** Separate real allocations from allocator retention

**Implementation:**
```cpp
// Add OSC endpoint: /plugin/dev/mallocTrim
// WARNING: NOT REAL-TIME SAFE — only call from message thread

void triggerMallocTrim() {
    #if defined(__GLIBC__)
    // Capture pre-trim snapshot
    auto pre = readProcessorMemorySnapshot();
    auto preMallinfo = mallinfo2();
    
    malloc_trim(0);  // Release free memory to OS
    
    // Capture post-trim snapshot
    auto post = readProcessorMemorySnapshot();
    auto postMallinfo = mallinfo2();
    
    // Log delta
    int64_t rssDelta = pre.pssBytes - post.pssBytes;
    int64_t arenaDelta = preMallinfo.arena - postMallinfo.arena;
    #endif
}
```

**Interpretation:**
- Large RSS reduction → allocator was holding significant memory
- Small/no reduction → memory is genuinely allocated, not retained

### 3. JUCE Component Hierarchy Memory Audit (Medium Priority)

**Goal:** Track memory owned by JUCE components

**Approach:**
```cpp
// Add to your RuntimeNode or similar tracking
struct JuceMemoryAudit {
    int64_t componentCount = 0;
    int64_t componentEstimatedBytes = 0;
    int64_t imageCacheBytes = 0;
    int64_t fontCacheBytes = 0;
    int64_t lookAndFeelDataBytes = 0;
};

// Traverse component hierarchy
void auditJuceHierarchy(juce::Component* root) {
    // Count components, estimate sizes
    // Check ImageCache, TypefaceCache
    // Measure LookAndFeel data
}
```

### 4. OpenGL Resource Tracking Extension (Lower Priority)

**Goal:** Verify GPU-side resource accounting

Your current GPU tracking (font atlas, surface color/depth) may be missing:
- **Staging buffers:** CPU-side buffers for GPU uploads
- **Command buffers:** Driver-internal submission queues
- **Query objects:** Timer queries, occlusion queries
- **Shader program binaries:** Cached compiled shaders

**Note:** Many of these are driver-managed and not directly queryable from user space.

---

## Architectural Recommendations

### 1. Maintain Stage-Based Attribution

Your current stage-based approach (afterLuaInit, afterBindings, afterScriptLoad, afterDsp, afterUiOpen, afterUiIdle) is excellent. **Keep this.** It allows precise attribution of memory costs to lifecycle phases.

### 2. Distinguish Three Memory Categories

Your current overlay shows:
- **Tot:** Process-level totals (host-contaminated)
- **Plug:** Plugin-attributable deltas ✓
- **UI:** Editor/runtime-attributable deltas ✓

Consider adding:
- **Framework:** Estimated JUCE/OpenGL overhead (indirect measurement)
- **Retention:** Allocator-held memory (`arena - uordblks`)

### 3. OSCQuery Introspection as First-Class

Your report notes: *"OSCQuery must stay first-class"* — this is crucial. Every plugin should expose:
- Memory metrics over stable OSCQuery endpoints
- Diagnostic toggles (render pause, malloc_trim)
- Stage snapshot values

This enables:
- Automated profiling harnesses
- Regression testing
- Remote diagnostics

### 4. Future: Per-Component Attribution

For deeper investigation, consider tracking:
- Per-panel memory (DSP panel vs. Settings panel)
- Per-script memory (behavior scripts, UI scripts)
- Per-resource memory (images, fonts, audio files)

---

## References

1. **JUCE Forum:** OpenGL Context Memory Usage discussions
2. **PortAudio Documentation:** Real-time memory constraints
3. **glibc Manual:** `mallinfo2()`, `malloc_trim()` behavior
4. **Linux Kernel:** `/proc/self/smaps_rollup` format
5. **Your Internal Reports:**
   - `260409_filter_plugin_cost_findings.md`
   - `260407_manifold_filter_export_memory_audit.md`

---

## Conclusion

Your investigation has correctly identified that the "missing memory" is likely in **framework/backend allocations** rather than plugin-owned data structures. The ~70MB UI-attributable delta aligns with known JUCE OpenGL context overhead.

**Recommended priority:**
1. Implement render-pause experiment to confirm rendering pipeline as culprit
2. Add `malloc_trim()` diagnostic endpoint to separate retention from real allocation
3. Extend overlay to show allocator retention metrics
4. Document findings for future plugin architecture decisions

Your approach of plugin-attributable deltas over raw totals is the correct methodology for meaningful optimization work.
