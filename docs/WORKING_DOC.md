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

---

## COMPLETED PHASES (Continued)

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

---

## CURRENT WORKLOAD

### Phase 6: Extract UI Bindings to Module

**Objective:** Move Canvas/Graphics bindings from LuaEngine to LuaUIBindings module

**What's Left:**

#### Task 6.1: Move Canvas Bindings

- [ ] Move `Canvas` usertype registration to `LuaUIBindings::registerCanvasBindings()`
- [ ] Move `root` global setup
- [ ] Test UI still works

#### Task 6.2: Move Graphics Bindings

- [ ] Move `gfx` table to `LuaUIBindings::registerGraphicsBindings()`
- [ ] Test drawing still works

#### Task 6.3: Integrate Module

- [ ] Call `LuaUIBindings::registerBindings(coreEngine_, rootCanvas)` from LuaEngine
- [ ] Remove Canvas/Graphics code from LuaEngine::registerBindings()

**Estimated Time:** 1-2 hours

---

## FUTURE WORK (Post-Core-Migration)

### Phase 6: Extract UI Bindings to Module
Move Canvas/Graphics/OpenGL bindings from `LuaEngine::registerBindings()` to `LuaUIBindings`

### Phase 7: Extract Control Bindings to Module  
Move command()/OSC/event bindings to `LuaControlBindings`

### Phase 8: Thread Model Refactor
- Dedicated Lua thread
- Lock-free queues between threads

### Phase 9: Seam Interfaces
- Define `IScriptableControl`, `IScriptableLua`, etc.
- Enable tempo-only plugin use case

---

## ARCHITECTURE

```
Current State (Post-Phase 5):
├── LuaEngine (facade, ~2500 lines)
│   ├── LuaCoreEngine coreEngine_ (VM + script execution) ✅
│   ├── registerBindings() (uses Core's state) ✅
│   ├── loadScript() (delegates to Core) ✅
│   └── UI setup logic (stays)
│
└── Binding modules (structure only, not integrated yet)
    ├── LuaUIBindings
    └── LuaControlBindings

Target State (Post-Phase 6-7):
├── LuaEngine (facade, ~500 lines)
│   ├── LuaCoreEngine coreEngine_
│   ├── LuaUIBindings (Canvas/Graphics) 🔄
│   ├── LuaControlBindings (Commands/OSC) 🔄
│   └── UI orchestration logic
```

---

## PROGRESS SUMMARY

| Component | Status | Lines | Notes |
|-----------|--------|-------|-------|
| LuaCoreEngine | ✅ Complete | ~200 | Clean, tested, owns VM |
| LuaEngine | ✅ Phase 5 | ~2500 | Delegates to Core |
| LuaUIBindings | 📋 Ready | ~400 | Structure only, Phase 6 |
| LuaControlBindings | 📋 Ready | ~300 | Structure only, Phase 7 |

**Today's Progress:**
- ✅ Phase 1-5 Complete (Core Engine integrated, script loading delegated)
- 🔄 Phase 6 Next (Extract UI Bindings)

**Status:** Core migration complete (~80% done). Ready to extract bindings to modules.
