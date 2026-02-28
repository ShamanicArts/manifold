# Working Document - LuaEngine Refactor

**Status:** Active  
**Last Updated:** March 2026  
**Goal:** Split LuaEngine into composable modules while maintaining existing functionality

---

## COMPLETED PHASES

### Phase 1: Extract Core Engine ✅

**Deliverables:**
- [x] `LuaCoreEngine.h/.cpp` - Clean VM lifecycle, no GUI deps
- [x] Thread-safe with `std::recursive_mutex`
- [x] **VERIFIED:** Compiles, initializes correctly

### Phase 2: Create Binding Modules (Structure) ✅

**Deliverables:**
- [x] `LuaUIBindings.h/.cpp` - Structure created
- [x] `LuaControlBindings.h/.cpp` - Structure created

### Phase 3: Integrate Core into LuaEngine ✅

**Deliverables:**
- [x] `LuaEngine` has `LuaCoreEngine coreEngine_` member
- [x] State queries delegate to Core (`isScriptLoaded`, `getLastError`, `reloadCurrentScript`)
- [x] **VERIFIED:** Plugin runs, UI loads

### Phase 4: Migrate All Lua Access to Core ✅

**Deliverables:**
- [x] Removed `sol::state lua` and `std::recursive_mutex luaMutex` from Impl
- [x] All lua access via `coreEngine_.getLuaState()`
- [x] All mutex locking via `coreEngine_.getMutex()`
- [x] **VERIFIED:** 
  - [x] Plugin runs
  - [x] UI loads
  - [x] IPC/CLI works
  - [x] DSP works

### Phase 5: Delegate Script Loading to Core ✅

**Objective:** Use Core's `loadScript()` for execution, keep UI setup

**Completed:**
- [x] `loadScript()` calls `coreEngine_.loadScript()` for script execution
- [x] UI setup (ui_init, shell) stays in LuaEngine
- [x] State synced between Core and LuaEngine
- [x] **VERIFIED:**
  - [x] Build passes
  - [x] UI scripts load correctly
  - [x] IPC/CLI works
  - [x] No regressions

### Phase 6: Extract UI Bindings to Module ✅

**Objective:** Move Canvas/Graphics/OpenGL bindings from LuaEngine to LuaUIBindings

**Completed:**
- [x] `LuaUIBindings::registerBindings(coreEngine_, rootCanvas)` integrated
- [x] All Canvas usertype registration moved to LuaUIBindings
- [x] All Graphics (`gfx`) bindings moved to LuaUIBindings
- [x] OpenGL bindings in UI only (no GL headers in core/DSP)
- [x] **VERIFIED:**
  - [x] UI renders correctly
  - [x] All widgets functional
  - [x] No GL deps in core

### Phase 7: Extract Control Bindings to Module ✅

**Objective:** Move command()/OSC/events/Link bindings to LuaControlBindings with clean interface

**Completed:**
- [x] Created `ILuaControlState.h` - interface for control state
- [x] `LuaEngine` implements `ILuaControlState` (processor, DSP slots, callbacks, listeners)
- [x] `LuaControlBindings` consumes `ILuaControlState&` (no LuaEngine dependency)
- [x] All control bindings moved:
  - [x] Commands (`command()`, `seekLayer()`, `setParam`, `getParam`)
  - [x] DSP script management (`loadDspScript`, `unloadDspSlot`, etc.)
  - [x] Graph/primitive bindings (`Primitives` table, `connectNodes`)
  - [x] OSC bindings (`osc.getSettings`, `osc.send`, `osc.onMessage`, etc.)
  - [x] Event bindings (`looper.onTempoChanged`, `looper.onCommit`, etc.)
  - [x] Link bindings (`link.isEnabled`, `link.getBeat`, etc.)
  - [x] Utility bindings (`getTime`, `writeTextFile`, clipboard)
- [x] Removed duplicate bindings from `LuaEngine::registerBindings()` (~1000 lines → ~10 lines)
- [x] Created `DSPPrimitiveWrappers.h` to prevent circular dependency
- [x] **VERIFIED:**
  - [x] Build passes
  - [x] All control bindings work
  - [x] OSC/CLI commands work
  - [x] Events fire correctly
  - [x] Link integration works

---

## CLEANUP COMPLETED

### Magic Numbers Centralization ✅

**Issue:** Hardcoded 256, 512, MAX_LAYERS=4 scattered across codebase (ARCHITECTURAL_AUDIT Category B)

**Completed:**
- [x] Created `ScriptingConfig.h` - single source of truth
- [x] `QueueConfig::COMMAND_QUEUE_SIZE` (256)
- [x] `QueueConfig::EVENT_QUEUE_SIZE` (256)
- [x] `BufferConfig::MAX_JSON_PAYLOAD_SIZE` (512)
- [x] `BufferConfig::MAX_DSP_BLOCK_SIZE` (512)
- [x] `LayerConfig::MAX_LAYERS` (4)
- [x] Updated all files:
  - [x] `ControlServer.h/cpp` - queues, JSON buffer
  - [x] `OSCQuery.h` - MAX_LAYERS
  - [x] `OSCServer.h` - MAX_LAYERS
  - [x] `OSCEndpointRegistry.h` - MAX_LAYERS
  - [x] `PrimitiveGraph.h` - maxBlockSize
  - [x] `GraphRuntime.h` - maxBlockSize
  - [x] `ScriptableProcessor.h` - getGraphBlockSize()
- [x] **VERIFIED:** Build passes, all constants centralized

---

## DOCUMENTATION CREATED

### LOGGING_ARCHITECTURE.md

**Status:** Design document complete  
**Location:** `docs/LOGGING_ARCHITECTURE.md`

**Contents:**
- Thread-safe ring buffer architecture (one per thread)
- Structured logging (JSON/msgpack output)
- Categories: audio, lua, control, dsp, ui, lifecycle
- Levels: trace, debug, info, warn, error, fatal
- Dynamic filtering and rate limiting
- Crash dumps with state snapshots
- Prometheus metrics export
- OSC/WebSocket telemetry
- Implementation phases (Phases 1-4)

**Decision:** Defer implementation until after thread model refactor (Phase 8), but design is documented for when we're ready.

---

## CURRENT ARCHITECTURE

```
Current State (Post-Phase 7):
├── LuaEngine (facade, ~150 lines)
│   ├── LuaCoreEngine coreEngine_ (VM + script execution) ✅
│   ├── LuaUIBindings (Canvas/Graphics/OpenGL) ✅
│   ├── LuaControlBindings (Commands/OSC/Events/Link) ✅
│   └── UI orchestration (root canvas, script switching)
│
├── ILuaControlState (interface)
│   └── Implemented by LuaEngine (shared state for bindings)
│
├── DSPPrimitiveWrappers.h
│   └── LoopBufferWrapper, PlayheadWrapper, etc. (shared types)
│
└── ScriptingConfig.h
    └── Centralized constants (queue sizes, MAX_LAYERS, etc.)
```

---

## PROGRESS SUMMARY

| Component | Status | Lines | Notes |
|-----------|--------|-------|-------|
| LuaCoreEngine | ✅ Complete | ~200 | Clean, tested, owns VM |
| LuaUIBindings | ✅ Complete | ~400 | Canvas, Graphics, OpenGL |
| LuaControlBindings | ✅ Complete | ~800 | Commands, OSC, Events, Link |
| ILuaControlState | ✅ Complete | ~100 | Interface for shared state |
| DSPPrimitiveWrappers | ✅ Complete | ~60 | Shared wrapper types |
| ScriptingConfig | ✅ Complete | ~40 | Centralized constants |
| LuaEngine | ✅ Complete | ~150 | Facade, implements ILuaControlState |

**Status:** Core refactoring COMPLETE (~95% done). Architecture is clean, modular, and extensible.

---

## NEXT: STATE SERIALIZER (A3 Fix)

**Issue:** `LuaEngine::pushStateToLua()` builds hardcoded looper-specific schema (ARCHITECTURAL_AUDIT Category A3)

**Impact:**
- Non-looper plugins forced into looper-shaped state box
- Grain synth can't provide different state schema
- `voices[]` array, `/looper/layer/X` paths, `forwardCommitArmed` concept baked in

**Solution:** Create `IStateSerializer` interface

**Deliverables:**
- [ ] Define `IStateSerializer` interface
  - `serializeState()` - returns Lua table or JSON
  - `getStateSchema()` - describes available fields
  - `subscribeToChanges(paths[])` - incremental updates
- [ ] `ScriptableProcessor` implements `IStateSerializer`
  - Each plugin provides its own state schema
  - Looper: voices[], layers, recording state
  - Grain synth: grains[], density, scatter
- [ ] `LuaEngine` uses `IStateSerializer` instead of hardcoded schema
  - Calls `processor->serializeState()` instead of building manually
  - No looper-specific knowledge in LuaEngine
- [ ] Update `LuaControlBindings` to use serializer
  - State change events from serializer, not hardcoded polling

**Effort:** 2-3 days  
**Value:** Enables non-looper plugins, completes separation of concerns  
**Blockers:** None

---

## FUTURE WORK (Post-State-Serializer)

### Phase 8: Thread Model Refactor

**Issues:** ARCHITECTURAL_AUDIT Category C (threading), Category E (memory/lifecycle)

**Goals:**
- Dedicated Lua thread (never runs on audio or message thread)
- Lock-free SPSC queues between threads
- Remove recursive mutex, define lock hierarchy
- Memory pools for real-time allocations

**Effort:** 1-2 weeks  
**Value:** Eliminates audio dropouts, enables testability, fixes safety issues  
**Blockers:** None, but significant refactoring

### Phase 9: Logging Implementation

**Document:** `LOGGING_ARCHITECTURE.md`  
**Implementation:** Phases 1-4 as defined in document  
**Depends on:** Thread Model (needs dedicated aggregator thread)

---

## DECISION LOG

| Date | Decision | Rationale |
|------|----------|-----------|
| March 2026 | Do State Serializer before Thread Model | Quick win (2-3 days vs 1-2 weeks), completes interface separation pattern, makes threading refactor easier |
| March 2026 | Defer logging implementation | Design complete, but depends on thread model for aggregator thread |
| March 2026 | Centralize magic numbers first | Required cleanup before any major refactoring, makes constants configurable |

---

## REMAINING AUDIT ITEMS

**ARCHITECTURAL_AUDIT.md Status:**

| Category | Status | Notes |
|----------|--------|-------|
| A1-A2 (Mixed concerns) | ✅ FIXED | Core/UI/Control separated |
| A3 (Hardcoded state) | 🔄 IN PROGRESS | State Serializer next |
| A4-A5 (First loop logic, UI/DSP) | 📋 DEFERRED | Needs design discussion |
| B1-B4 (Magic numbers) | ✅ FIXED | ScriptingConfig.h |
| C1-C5 (Threading) | 📋 PHASE 8 | Dedicated Lua thread |
| D1-D6 (Error handling) | 📝 DESIGNED | LOGGING_ARCHITECTURE.md |
| E1-E5 (Memory/lifecycle) | 📋 PHASE 8 | With threading refactor |
| F1-F6 (API design) | ✅ FIXED | Interface-based architecture |
| G1-G5 (Configuration) | ✅ PARTIAL | ScriptingConfig.h, more in Phase 8 |
| H1-H4 (Testing) | 📋 POST-PHASE-8 | Needs thread model first |
| I1-I3 (Documentation) | 📝 IN PROGRESS | ADRs, architecture docs |

---

**Current Status:** Core refactoring complete. Ready for State Serializer (A3 fix).