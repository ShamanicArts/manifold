# Architectural Audit - LuaEngine & Control System

**Date:** March 2026  
**Scope:** `looper/primitives/scripting/`, `looper/primitives/control/`  
**Goal:** Identify all structural issues preventing generic, extensible, maintainable architecture

---

## CATEGORY A: Mixed Concerns (The Original Problem)

### A1. LuaEngine Monolith
- **Location:** `LuaEngine.h/.cpp` (3,271 lines)
- **Issue:** UI bindings, DSP bindings, Control bindings, OSC handling, OpenGL, all in one file
- **Impact:** Forces GUI deps on DSP-only use cases; impossible to use subset

### A2. ScriptableProcessor Mixed Seam
- **Location:** `ScriptableProcessor.h`
- **Issue:** Single interface has `getLayerSnapshot()`, `getPrimitiveGraph()`, `getControlServer()` - unrelated concepts mashed together
- **Impact:** Implementing any requires implementing all (or stubbing)

### A3. Hardcoded Looper State Schema
- **Location:** `LuaEngine::pushStateToLua()`
- **Issue:** Builds specific `voices[]` array with looper-specific fields; no way for grain synth to provide different state
- **Impact:** Non-looper plugins forced into looper-shaped state box

### A4. First Loop Logic in Wrong Layer
- **Location:** `looper/dsp/looper_primitives_dsp.lua`
- **Issue:** Tempo inference (pure math on time delta) runs in audio callback via DSP script
- **Impact:** Blocks audio thread for non-DSP work; can't run without audio engine

### A5. UI/DSP Interaction Pattern Undefined
- **Location:** Throughout
- **Issue:** No clear pattern for how UI scripts communicate with DSP scripts; both run in same Lua state but coordination is ad-hoc
- **Impact:** Race conditions, unclear ownership

---

## CATEGORY B: Hardcoded Limits & Magic Numbers

### B1. Arbitrary Queue Sizes
- **Location:** `ControlServer.h:238,296-297`
- **Issue:** `SPSCQueue<256>`, `EventRing<256>` - no rationale, not configurable
- **Impact:** Commands dropped silently under load; no way to tune for hardware

### B2. MAX_LAYERS = 4 (Triplicated)
- **Location:** `ControlServer.h:177`, `OSCQuery.h:84`, `OSCServer.h:55`
- **Issue:** Same constant defined in 3 places; change one, others break
- **Impact:** Layer count not truly configurable

### B3. Fixed JSON Buffer
- **Location:** `ControlServer.h:134`
- **Issue:** `ControlEvent::json[512]` - events > 512 bytes truncated or corrupted
- **Impact:** Silent data loss on large events

### B4. String Length Limits
- **Location:** `ControlServer.h:45`
- **Issue:** `char json[512]` in `ControlEvent`
- **Impact:** Arbitrary limit on event complexity

---

## CATEGORY C: Threading & Synchronization Issues

### C1. Unclear Lock Hierarchy
- **Location:** `LuaEngine.cpp`
- **Issue:** 5 mutexes (`luaMutex`, `oscCallbacksMutex`, `pendingOSCMessagesMutex`, `oscQueryHandlersMutex`, `eventListenersMutex`) with no documented ordering
- **Impact:** Deadlock risk; no way to verify correctness

### C2. Recursive Mutex Smell
- **Location:** `LuaEngine.cpp:185`
- **Issue:** `std::recursive_mutex luaMutex` suggests unclear ownership boundaries
- **Impact:** Usually indicates architecture confusion; allows reentrant calls that shouldn't happen

### C3. Multi-Thread Lua Access
- **Location:** `LuaEngine.cpp:183`
- **Issue:** Lua VM accessed from message thread AND OpenGL render thread
- **Impact:** "Serialize all Lua access" - expensive, error-prone

### C4. No Backpressure Strategy
- **Location:** `SPSCQueue<256>`
- **Issue:** Queue full = `enqueue()` returns false. Callers often ignore return value
- **Impact:** Silent command drops under load

### C5. Thread Affinity Not Enforced
- **Location:** Throughout
- **Issue:** "Must be called from message thread only" comments, but no runtime checks
- **Impact:** Easy to accidentally call from wrong thread

---

## CATEGORY D: Error Handling & Robustness

### D1. Silent Failures
- **Location:** `setParamByPath()` returns bool, often ignored
- **Issue:** `postControlCommand()` can fail (queue full), callers don't check
- **Impact:** Operations appear to succeed but don't

### D2. No Unified Logging
- **Location:** Throughout (`LuaEngine.cpp`, `ControlServer.cpp`)
- **Issue:** 57 `fprintf(stderr,...)` calls scattered; no log levels; no categories
- **Impact:** Debug spew in release builds; can't filter by subsystem

### D3. Exception Safety Gaps
- **Location:** Lua bindings in `LuaEngine.cpp`
- **Issue:** Catch `std::exception` but not all paths protected; Lua longjmp through C++?
- **Impact:** Undefined behavior on Lua errors

### D4. No Contract Validation
- **Location:** Interface methods
- **Issue:** Negative layer index? Silent clamp or crash. Null pointers? Sometimes checked, sometimes not.
- **Impact:** Failures manifest far from cause

### D5. Hot Reload No Rollback
- **Location:** `LuaEngine::switchScript()`
- **Issue:** Script fails mid-load? Partial state. No atomic "swap or keep old"
- **Impact:** UI can get into broken intermediate state

### D6. Resource Exhaustion Not Handled
- **Location:** Lua bindings
- **Issue:** Script can create infinite nodes, infinite OSC callbacks, infinite event listeners
- **Impact:** No throttling = OOM or denial of service

---

## CATEGORY E: Memory & Lifecycle Issues

### E1. Raw Pointer Lifetime Risk
- **Location:** `LuaEngine.cpp:181`
- **Issue:** `juce::Graphics* currentGraphics` stored raw. Only valid during paint callback
- **Impact:** Use after free if callback extends past paint

### E2. Deferred Destruction Not Guaranteed
- **Location:** `pendingSlotDestroy` vector
- **Issue:** DSP slot destruction deferred to "safe boundary", but what if Lua crashes?
- **Impact:** Potential leak or use-after-free

### E3. pImpl Inconsistency
- **Location:** Throughout
- **Issue:** `LuaEngine` uses pImpl, `ControlServer` doesn't, `PrimitiveGraph` is mixed
- **Impact:** No clear ownership policy; compilation dependencies unclear

### E4. Shared_ptr Overhead
- **Location:** `PrimitiveGraph.h`
- **Issue:** Every node is `shared_ptr<IPrimitiveNode>`. Ref counting on audio thread?
- **Impact:** Atomic ops in audio callback = potential priority inversion

### E5. No Memory Pools
- **Location:** Audio processing
- **Issue:** Real-time allocations in `processBlock()` (vector resizes, string ops)
- **Impact:** Audio glitches from malloc

---

## CATEGORY F: API Design Issues

### F1. Stringly-Typed Paths
- **Location:** Everywhere (`/core/behavior/tempo`, `/looper/layer/0/speed`)
- **Issue:** No type-safe path building; typos caught at runtime (if at all)
- **Impact:** Refactor C++ class hierarchy = break OSC API

### F2. ControlCommand Union Abuse
- **Location:** `ControlServer.h:68-77`
- **Issue:** `intParam` and `floatParam` mean different things for different `Type`s
- **Impact:** Type-unsafe; easy to pass wrong parameter type

### F3. No API Versioning
- **Location:** Lua interface
- **Issue:** Script written for v1.0 breaks on v2.0 changes
- **Impact:** No compatibility guarantee; can't evolve API safely

### F4. Path Aliases Scattered
- **Location:** `LuaEngine::pushStateToLua()`
- **Issue:** Same value at `/looper/tempo`, `/core/behavior/tempo`, `/dsp/looper/tempo`
- **Impact:** Confusion about which is canonical; inconsistency

### F5. Asymmetric Reload
- **Location:** `LuaEngine` (UI reload) vs `DSPPluginScriptHost` (DSP reload)
- **Issue:** UI hot-reloads one way, DSP another way; no unified mechanism
- **Impact:** Inconsistent behavior, duplicated logic

### F6. State Push Instead of Pull
- **Location:** `notifyUpdate()` at 30Hz
- **Issue:** Full state pushed every frame whether Lua needs it or not
- **Impact:** Wasted work; no way to subscribe to specific paths

---

## CATEGORY G: Configuration & Extensibility

### G1. No Compile-Time Configuration
- **Location:** Buffer sizes, queue depths, timeouts
- **Issue:** All hardcoded; no way to tune for different hardware (embedded vs desktop)
- **Impact:** One size fits none

### G2. Graph Node Types Hardcoded
- **Location:** `LuaEngine.cpp` (~1500)
- **Issue:** Add new node? Modify `LuaEngine.cpp`. Registration not open for extension
- **Impact:** Core modification required for plugin-specific nodes

### G3. AtomicState is a Grab Bag
- **Location:** `ControlServer.h:170-194`
- **Issue:** Tempo, layers, forward commit, commit count, graph enabled, uptime... everything dumped in one struct
- **Impact:** Not composable for different plugin types

### G4. No Plugin Manifest
- **Location:** N/A
- **Issue:** Plugin can't declare "I have layers" or "I have spectrum analysis"
- **Impact:** UI scripts assume capabilities that may not exist

### G5. OSC Endpoints Registered Imperatively
- **Location:** `OSCEndpointRegistry`
- **Issue:** Endpoints registered at runtime via code; no declarative schema
- **Impact:** Can't introspect available endpoints without running code

---

## CATEGORY H: Testing & Observability

### H1. No Unit Tests for Lua Bindings
- **Location:** N/A
- **Issue:** Only integration harnesses exist; change binding? Hope it works
- **Impact:** Regressions only caught manually

### H2. No Performance Metrics
- **Location:** N/A
- **Issue:** How long does graph compilation take? State serialization? No data.
- **Impact:** Can't optimize what isn't measured

### H3. No Threading Diagnostics
- **Location:** N/A
- **Issue:** Which thread called what? No tracing.
- **Impact:** Race condition debugging is guesswork

### H4. Debug Logs to `/tmp/grainfreeze_debug.log`
- **Location:** Mentioned in AGENTS.md
- **Issue:** Hardcoded path; no rotation; only when DEBUG defined
- **Impact:** Production issues hard to diagnose

---

## CATEGORY I: Documentation & Architecture Knowledge

### I1. Architecture Exists Only in Code
- **Location:** N/A
- **Issue:** No documentation of thread model, ownership, error handling philosophy
- **Impact:** Knowledge is tribal; onboarding is reverse engineering

### I2. Comments Describe What, Not Why
- **Location:** Throughout
- **Issue:** `// Process control commands` vs `// Must be lock-free because called from audio thread`
- **Impact:** Can't distinguish intentional design from technical debt

### I3. No ADRs (Architecture Decision Records)
- **Location:** N/A
- **Issue:** Why 256? Why recursive mutex? No rationale captured.
- **Impact:** Future changes repeat past mistakes

---

## PRIORITIZATION MATRIX

| Issue | Impact | Effort | Priority |
|-------|--------|--------|----------|
| A1-A5 (Mixed concerns) | High | High | P0 (blocking) |
| B1-B4 (Arbitrary limits) | Medium | Low | P1 |
| C1-C5 (Threading) | High | Medium | P0 (safety) |
| D1-D6 (Error handling) | Medium | Medium | P1 |
| E1-E5 (Memory/lifecycle) | High | Medium | P0 (stability) |
| F1-F6 (API design) | High | High | P1 |
| G1-G5 (Configuration) | Medium | Medium | P2 |
| H1-H4 (Testing) | High | High | P1 (enabler) |
| I1-I3 (Documentation) | Medium | Low | P2 |

---

## RECOMMENDED APPROACH

1. **Define seams first** - `IScriptableBase`, `IScriptableDSP`, `IScriptableUI`, `IScriptableControl`
2. **Extract LuaCoreEngine** - VM lifecycle only, no bindings
3. **Separate binding groups** - Optional `LuaDSPBindings`, `LuaUIBindings`, `LuaControlBindings`
4. **Unify state serialization** - Plugin provides `IStateSerializer`, no hardcoded schema
5. **Fix threading model** - Document thread affinity, enforce at runtime in debug
6. **Eliminate magic numbers** - Configuration structs, no hardcoded 256/512/4
7. **Add unit testing framework** - Test bindings in isolation
8. **Document architecture** - Thread model, ownership, error philosophy

---

*Document version: 1.0*  
*Audit performed: March 2026*  
*Next step: Design discussion for remediation approach*
