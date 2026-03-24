# Product Requirements Document - Scripting System Refactor

**Document Type:** PRD / Planning Document  
**Status:** Draft  
**Related:** `ARCHITECTURAL_AUDIT.md` (findings), `AGENTS.md` (context)

---

## 1. EXECUTIVE SUMMARY

### 1.1 Problem Statement
The current LuaEngine is a monolithic 3,271-line file mixing UI bindings, DSP bindings, Control bindings, OSC, OpenGL, and looper-specific state. This forces all DSP modules to be included for any new plugin, and makes the architecture fundamentally unextensible.

### 1.2 Proposed Solution
Separate into clean architectural layers:
- **Core**: VM lifecycle, hot reload (no bindings)
- **Seams**: `IScriptableDSP`, `IScriptableControl`, `IScriptableLua` interfaces
- **Bindings**: Optional UI, DSP, Control binding groups
- **Threads**: Dedicated Lua thread, clear queue protocols

### 1.3 Success Criteria
- [ ] New plugin can use Control+UI without DSP baggage
- [ ] First loop tempo detection runs in control layer, not audio callback
- [ ] Unit tests run without full JUCE/audio initialization
- [ ] No hardcoded limits (256, 512, MAX_LAYERS=4)
- [ ] Clear thread ownership (no Lua in audio thread)

---

## 2. USER STORIES

### 2.1 Plugin Developer (Primary)
> "As a plugin developer, I want to create a tempo-detection plugin that uses Link and has a UI, but doesn't process audio, without dragging in LooperLayer, CaptureBuffer, and 3000 lines of DSP bindings."

**Acceptance:**
- Link Link 
- Include only `LuaCoreEngine` + `LuaControlBindings` + `LuaUIBindings`
- No `DSPPluginScriptHost`, no `PrimitiveGraph`, no `CaptureBuffer`

### 2.2 UI Scripter
> "As a UI scripter, I want to subscribe only to state changes I care about, instead of receiving a 500-field state table at 30Hz."

**Acceptance:**
- Can register callback for specific path: `state.onChange("/tempo", function(v) ... end)`
- No full state serialization if UI only needs 3 values

### 2.3 DSP Scripter  
> "As a DSP scripter, I want to run tempo inference when recording stops, without blocking the audio thread."

**Acceptance:**
- DSP script posts event: `host.postEvent("recordingStopped", {duration = samples})`
- Control script receives event, does math, sets tempo
- Audio thread never does float division or table iteration

### 2.4 Test Engineer
> "As a test engineer, I want to test the Lua engine without spinning up JUCE, audio devices, or real threads."

**Acceptance:**
- `LuaCoreEngine` testable with mock queues
- No `juce::AudioProcessor` required for binding tests
- Deterministic, single-threaded test mode

---

## 3. FUNCTIONAL REQUIREMENTS

### 3.1 Core Engine (FR-CORE-001 to 010)

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-CORE-001 | VM initialization and shutdown | P0 | No bindings registered |
| FR-CORE-002 | Package path configuration | P0 | Support multiple search paths |
| FR-CORE-003 | Hot reload with atomic swap | P0 | Old script runs until new loads successfully |
| FR-CORE-004 | Error propagation to host | P0 | Exception → error callback, not crash |
| FR-CORE-005 | Configurable queue sizes | P1 | Compile-time default, runtime override |
| FR-CORE-006 | Thread priority configuration | P1 | For embedded platforms |
| FR-CORE-007 | Memory limits / resource quotas | P2 | Max nodes, max callbacks |
| FR-CORE-008 | Protocol versioning | P2 | Negotiate between host and scripts |
| FR-CORE-009 | Profiling hooks | P2 | Tick duration, queue depths |
| FR-CORE-010 | Graceful degradation | P2 | Drop events vs crash on overflow |

### 3.2 Thread Model (FR-THREAD-001 to 005)

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-THREAD-001 | Dedicated Lua thread | P0 | Never runs on audio or message thread |
| FR-THREAD-002 | Lock-free queues to audio | P0 | SPSC, wait-free where possible |
| FR-THREAD-003 | Async UI updates | P0 | `AsyncUpdater` for component invalidation |
| FR-THREAD-004 | Thread affinity enforcement | P1 | Debug-mode checks, release-mode optional |
| FR-THREAD-005 | Deterministic test mode | P1 | Manual pump, no real threads |

### 3.3 Queue Protocol (FR-QUEUE-001 to 008)

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-QUEUE-001 | String path protocol (extensible) | P0 | `/core/behavior/tempo` |
| FR-QUEUE-002 | Fast path for common commands | P0 | Typed structs for SetParam, Trigger |
| FR-QUEUE-003 | Backpressure strategy configurable | P1 | Drop newest, drop oldest, or block |
| FR-QUEUE-004 | Event batching | P1 | Multiple events per queue slot |
| FR-QUEUE-005 | Command batching | P2 | Atomic multi-command transactions |
| FR-QUEUE-006 | Path aliasing resolved at boundary | P2 | `/looper/tempo` → `/core/behavior/tempo` |
| FR-QUEUE-007 | Schema evolution support | P2 | Unknown fields ignored, not error |
| FR-QUEUE-008 | Zero-copy where possible | P2 | `string_view` not `std::string` |

### 3.4 Seam Interfaces (FR-SEAM-001 to 010)

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-SEAM-001 | `IScriptableBase` for common ops | P0 | Sample rate, basic parameters |
| FR-SEAM-002 | `IScriptableDSP` optional | P0 | Graph, slots, audio processing |
| FR-SEAM-003 | `IScriptableControl` optional | P0 | Commands, OSC, events |
| FR-SEAM-004 | `IScriptableLua` optional | P0 | State serialization, UI queries |
| FR-SEAM-005 | No cross-interface dependencies | P0 | Can implement Control without DSP |
| FR-SEAM-006 | Version negotiation | P1 | Host queries interface version |
| FR-SEAM-007 | Capability discovery | P1 | `hasDSP()`, `hasUI()`, `hasControl()` |
| FR-SEAM-008 | Mock implementations for testing | P1 | All interfaces have test doubles |
| FR-SEAM-009 | Async operations return futures | P2 | Graph compile, script load |
| FR-SEAM-010 | Lifecycle callbacks | P2 | `onInit`, `onShutdown`, `onReset` |

### 3.5 Binding Groups (FR-BIND-001 to 008)

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-BIND-001 | `LuaDSPBindings` separate library | P0 | Optional, only if `IScriptableDSP` provided |
| FR-BIND-002 | `LuaControlBindings` separate library | P0 | Optional, only if `IScriptableControl` provided |
| FR-BIND-003 | `LuaUIBindings` separate library | P0 | Optional, only if `IScriptableLua` + JUCE GUI |
| FR-BIND-004 | OpenGL bindings in UI only | P0 | No GL headers in core or DSP |
| FR-BIND-005 | Custom node registration | P1 | Plugin can add nodes without modifying core |
| FR-BIND-006 | Custom widget registration | P1 | UI library can be extended |
| FR-BIND-007 | Lazy binding loading | P2 | Only bind what's used |
| FR-BIND-008 | Binding version check | P2 | Lua can query binding API version |

### 3.6 State Serialization (FR-STATE-001 to 006)

| ID | Requirement | Priority | Notes |
|----|-------------|----------|-------|
| FR-STATE-001 | Plugin provides serializer | P0 | `IStateSerializer` interface |
| FR-STATE-002 | No hardcoded looper schema | P0 | Grain synth provides different state |
| FR-STATE-003 | Incremental updates | P1 | Only serialize what changed |
| FR-STATE-004 | Subscription model | P1 | Lua registers interest in specific paths |
| FR-STATE-005 | Schema introspection | P2 | Lua can query available state fields |
| FR-STATE-006 | State snapshots for debugging | P2 | Dump full state to file |

---

## 4. NON-FUNCTIONAL REQUIREMENTS

### 4.1 Performance (NFR-PERF-001 to 005)

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-PERF-001 | Audio thread latency | < 1μs for queue ops | Lock-free only |
| NFR-PERF-002 | Lua thread tick budget | < 16ms at 60Hz | Including script execution |
| NFR-PERF-003 | State serialization | < 1ms for 100 fields | Incremental helps |
| NFR-PERF-004 | Queue throughput | > 10k commands/sec | Headroom for bursts |
| NFR-PERF-005 | Memory per queue slot | < 256 bytes | Bounded memory |

### 4.2 Reliability (NFR-REL-001 to 005)

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-REL-001 | No audio dropouts from Lua | 100% uptime | Lua thread isolated |
| NFR-REL-002 | Graceful script failure | Recover | Catch, log, continue with previous |
| NFR-REL-003 | Queue overflow handling | Configurable | Drop, block, or expand |
| NFR-REL-004 | No deadlocks | Static analysis | Lock ordering documented |
| NFR-REL-005 | Deterministic replay | For testing | Record/replay capability |

### 4.3 Testability (NFR-TEST-001 to 005)

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-TEST-001 | Unit test coverage | > 80% | Core engine, bindings |
| NFR-TEST-002 | Mock implementations | All seams | For isolated testing |
| NFR-TEST-003 | Deterministic mode | Always available | No real threads, manual pump |
| NFR-TEST-004 | Property-based tests | Core queues | Invariants, fuzzing |
| NFR-TEST-005 | E2E integration tests | Critical paths | Real threads, real audio |

### 4.4 Maintainability (NFR-MAINT-001 to 004)

| ID | Requirement | Target | Notes |
|----|-------------|--------|-------|
| NFR-MAINT-001 | Max file size | < 500 lines | Per module |
| NFR-MAINT-002 | Cyclomatic complexity | < 10 | Per function |
| NFR-MAINT-003 | Documentation coverage | All public APIs | Header comments |
| NFR-MAINT-004 | ADRs for major decisions | All significant | Architecture Decision Records |

---

## 5. ARCHITECTURAL DECISIONS (DRAFT)

### ADR-001: Three-Thread Model
**Status:** Proposed  
**Context:** Lua must not run in audio thread, message thread is for JUCE UI only  
**Decision:** Lua gets dedicated thread, queues to audio and message threads  
**Consequences:** +Isolation, +Testability, -Complexity, -Latency (one frame for UI)

### ADR-002: Hybrid Queue Protocol
**Status:** Proposed  
**Context:** Need extensibility (string paths) but speed (typed structs)  
**Decision:** Wire protocol uses strings, internal fast path uses typed structs  
**Consequences:** +Flexibility, +Speed, -Translation layer complexity

### ADR-003: Optional Seam Interfaces
**Status:** Proposed  
**Context:** Different plugins need different capabilities  
**Decision:** `IScriptableDSP`, `IScriptableControl`, `IScriptableLua` are independent  
**Consequences:** +Modularity, +Testability, -Interface proliferation

### ADR-004: Runtime Configurability
**Status:** Needs Discussion  
**Context:** Queue sizes, thread priorities vary by platform  
**Decision:** TBD - compile-time templates vs runtime struct vs hybrid

### ADR-005: State Serialization Strategy
**Status:** Needs Discussion  
**Context:** Current 30Hz push is wasteful, pull is complex  
**Decision:** TBD - push vs pull vs hybrid subscription

---

## 6. PHASES & MILESTONES

### Phase 1: Foundation (Weeks 1-2)
**Goal:** Core engine with no bindings, three-thread model, tests

**Deliverables:**
- [ ] `LuaCoreEngine` class (VM lifecycle, queues, threading)
- [ ] `Command` and `Event` structs (hybrid protocol)
- [ ] Lock-free queue implementations
- [ ] Deterministic test harness
- [ ] Unit tests for core (80%+ coverage)

**Success Criteria:**
- Can create engine, load script, pump queues manually in tests
- No JUCE dependencies in core

---

### Phase 2: Seams (Weeks 3-4)
**Goal:** Define and implement seam interfaces

**Deliverables:**
- [ ] `IScriptableBase` interface
- [ ] `IScriptableControl` interface + implementation for BehaviorCore
- [ ] `IScriptableLua` interface + implementation
- [ ] `IStateSerializer` interface
- [ ] Mock implementations for all seams

**Success Criteria:**
- Can test engine with mocks, no real processor needed
- Clear separation of concerns

---

### Phase 3: Bindings (Weeks 5-6)
**Goal:** Separate binding groups, no monolith

**Deliverables:**
- [ ] `LuaControlBindings` library
- [ ] `LuaDSPBindings` library (moved from monolith)
- [ ] `LuaUIBindings` library (moved from monolith)
- [ ] Plugin can choose which bindings to load
- [ ] Tests for each binding group

**Success Criteria:**
- Tempo-only plugin uses only Control+UI bindings, no DSP
- All old LuaEngine functionality still works (backward compat)

---

### Phase 4: Migration (Weeks 7-8)
**Goal:** Move existing code to new architecture

**Deliverables:**
- [ ] BehaviorCoreProcessor implements new seams
- [ ] Looper UI scripts work unchanged
- [ ] DSP scripts work unchanged
- [ ] Performance regression tests pass
- [ ] Memory usage within 10% of baseline

**Success Criteria:**
- All existing tests pass
- No user-facing behavior change

---

### Phase 5: New Capabilities (Weeks 9-10)
**Goal:** Demonstrate extensibility

**Deliverables:**
- [ ] Tempo-detection plugin (Control+UI only, no DSP)
- [ ] First-loop logic in control layer (not audio callback)
- [ ] Custom node registration from plugin
- [ ] Custom widget registration from UI script

**Success Criteria:**
- Tempo plugin works standalone
- First-loop doesn't block audio thread

---

### Phase 6: Polish (Weeks 11-12)
**Goal:** Production ready

**Deliverables:**
- [ ] Documentation complete
- [ ] Performance benchmarks
- [ ] Memory profiling
- [ ] E2E integration tests
- [ ] Migration guide for existing plugins

**Success Criteria:**
- Ready for mainline merge

---

## 7. RISKS & MITIGATIONS

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Threading bugs | High | Medium | Deterministic test mode, extensive review, static analysis |
| Performance regression | High | Low | Benchmark suite, A/B comparison, profile early |
| Lua API breakage | High | Low | Facade/adapter layer, deprecation warnings, migration guide |
| Scope creep | Medium | High | Strict phase gates, ADR process, weekly review |
| Test coverage gaps | Medium | Medium | Coverage reports, mandatory tests for new code |
| Platform differences | Medium | Medium | CI on all targets, platform-specific tests |

---

## 8. OPEN QUESTIONS

1. **Configuration granularity:** Which values truly need runtime config vs compile-time?
2. **State protocol:** Push, pull, or subscription model for state updates?
3. **Backward compatibility:** Adapter layer or breaking change with migration guide?
4. **Custom nodes:** Dynamic registration or static manifest?
5. **Error handling:** Exceptions, Result<T,E>, or error callbacks?
6. **Memory management:** Pools, allocators, or standard containers?

---

## 9. GLOSSARY

| Term | Definition |
|------|------------|
| **Seam** | Interface boundary between architectural layers |
| **Binding** | Lua↔C++ bridge for a specific concern (UI, DSP, Control) |
| **Command** | Message from Lua thread to audio thread (set param, trigger) |
| **Event** | Message from audio thread to Lua thread (state change, notification) |
| **SPSC Queue** | Single-producer single-consumer lock-free queue |
| **Backpressure** | Strategy when queue is full (drop, block, or expand) |
| **Hot reload** | Replace running script without restart |

---

**Document Version:** 0.1  
**Last Updated:** March 2026  
**Next Review:** After Phase 1 completion
