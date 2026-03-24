# Cruft, Legacy, and Cleanup Inventory

**Generated:** March 2026  
**Scope:** Manifold audio plugin platform - codebase audit for dead code, legacy patterns, and cleanup opportunities

---

## Executive Summary

This document catalogs deprecated code, architectural debt, dead code, and cleanup opportunities identified during deep codebase analysis. Items are categorized by confidence level and impact.

---

## 1. HIGH CONFIDENCE - Actually Dead/Deprecated

These items are confirmed unused, deprecated, or explicitly marked for removal.

### 1.1 Canvas Renderer (Deprecated)

**Location:**
- `manifold/primitives/ui/Canvas.h`
- `manifold/primitives/ui/Canvas.cpp`

**Status:** ⚠️ **DEPRECATED - Console warns "slated for removal"**

**Evidence:**
```lua
-- manifold/ui/shell/methods_core.lua
self:appendConsoleLine("note: canvas is legacy and slated for removal", 0xfffbbf24)
self:appendConsoleLine("ERR: canvas renderer is deprecated and not a supported shell target", 0xfffca5a5)
```

**What it is:**
- Original 2D JUCE-based retained mode rendering system
- Superseded by ImGui-direct rendering
- Still functional but officially deprecated

**Cleanup action:** Remove after ImGui-direct stabilization period

---

### 1.2 invokeDrawForRetained Compatibility Hooks

**Location:**
- `manifold/primitives/scripting/bindings/LuaUIBindings.cpp`
- `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp`
- `manifold/ui/shell/methods_core.lua`

**Status:** ⚠️ **LEGACY - Canvas compatibility only**

**Evidence:**
```cpp
// LuaUIBindings.cpp
"invokeDrawForRetained",
// Invoke the onDraw callback without a Graphics context (for retained display list refresh).
```

```lua
-- methods_core.lua
-- invokeDrawForRetained compatibility hook.
-- Standard runtime widgets build retained display lists directly via refreshRetained();
-- only legacy replace/overlay paths should use this.
```

**Cleanup action:** Remove with Canvas renderer

---

### 1.3 Unimplemented IStateSerializer Stubs

**Location:** `manifold/core/BehaviorCoreProcessor.cpp`

**Status:** ❌ **STUBS - Return empty/default values**

**Methods:**
```cpp
// TODO: Implement subscription management
void subscribeToPath(const std::string& path, StateChangeCallback callback) override;

// TODO: Implement unsubscription
void unsubscribeFromPath(const std::string& path) override;

// TODO: Implement subscription clearing
void clearSubscriptions() override;

// TODO: Implement pending change processing
void processPendingChanges() override;

// TODO: Implement JSON serialization matching Lua structure
std::string serializeStateToJson() const override;  // returns "{}"

// TODO: Implement schema describing all manifold state paths
std::vector<StateField> getStateSchema() const override;  // returns empty
```

**Impact:** Interface pollution - exposes APIs that don't work

**Cleanup action:** Implement or remove from interface

---

### 1.4 markUnloaded() DSP Slot Hack

**Location:** `manifold/core/BehaviorCoreProcessor.cpp:585`

**Status:** ❌ **WORKAROUND - Has TODO to replace**

**Code:**
```cpp
// TODO(shamanic): replace this empty-script unload + markUnloaded() split
// with a proper slot lifecycle model. Right now we preserve the VM/runtime
// for stability but lie about loaded-state so UI/project switches will
// force a clean reload. That is the right tactical fix, but the long-term
// architecture should make slot residency, script identity, and endpoint
// lifetime explicit instead of inferred from this shim.
const bool ok = it->second->loadScriptFromString(
    "function buildPlugin(ctx) return {} end", "unload:" + slot);
if (ok) {
    it->second->markUnloaded();
}
```

**Issue:** Can't destroy Lua VMs during callback, so we load empty script and mark unloaded

**Cleanup action:** Implement proper slot lifecycle with deferred destruction

---

### 1.5 Dual SPSCQueue Implementations

**Locations:**
- `manifold/core/BehaviorCoreProcessor.h`: `SPSCQueuePtr<T, Capacity>`
- `manifold/primitives/control/ControlServer.h`: `SPSCQueue<Capacity>`

**Status:** ⚠️ **DUPLICATION - Nearly identical code**

**Differences:**
- `SPSCQueuePtr` stores pointers (used for retire queue)
- `SPSCQueue` stores values (used for commands)

**Cleanup action:** Merge into single template with type specializations

---

### 1.6 Looper Primitives Shim

**Location:** `manifold/dsp/lib/looper_primitives.lua`

**Status:** ❓ **PROBABLY UNUSED - 12-line pass-through**

**Code:**
```lua
local legacy = loadDspModule("../looper_primitives_dsp.lua")
local M = {}
function M.buildPlugin(ctx)
  return legacy.buildPlugin(ctx)
end
return M
```

**Issue:** Indirection with no added value

**Note:** May be referenced by existing project configs - verify before deleting

---

## 2. ARCHITECTURE DEBT - Bloated Files

These aren't dead, but are unreasonably large and need refactoring.

### 2.1 Mega-Files

| File | Lines | Issue |
|------|-------|-------|
| `manifold/primitives/scripting/DSPPluginScriptHost.cpp` | 3,817 | MEGA file - needs splitting |
| `manifold/primitives/scripting/LuaEngine.cpp` | 1,941 | Large - needs splitting |
| `manifold/ui/shell/methods_core.lua` | 4,034 | Monolithic shell methods |
| `manifold/ui/shell/bindings.lua` | 2,379 | Monolithic bindings |

**Recommendation:** Split by functional domain (OSC, DSP, UI, MIDI, etc.)

---

### 2.2 Inconsistent Architecture Patterns

| Pattern | Used By | Not Used By |
|---------|---------|-------------|
| pImpl idiom | `LuaEngine` | `DSPPluginScriptHost` (3,817 lines inline) |

**Issue:** Architectural inconsistency makes maintenance harder

---

## 3. LEGACY/ARCHIVE - Intentionally Kept

These are explicitly archived for reference and should NOT be deleted without consideration.

### 3.1 Experimental Legacy UI

**Location:** `UserScripts/projects/ExperimentalUI/ui/legacy/experimental_legacy.lua`

**Size:** ~1,872 lines

**Contents:**
- Pre-refactor monolithic UI implementation
- Inline GLSL shaders (now moved to `widgets/glsl.lua`)
- Pre-surface-registry architecture
- Custom particle/kaleidoscope/matrix effects

**Status:** Reference archive - contains working GLSL patterns

---

### 3.2 Pre-Refactor Shell Baseline

**Location:** `tools/baselines/ui_shell_monolithic.lua`

**Contents:** Original `ui_shell.lua` before modular refactoring

**Status:** Baseline for comparison

---

## 4. OBSOLETE PATTERNS

### 4.1 Legacy Command Verbs (Deprecated but Tracked)

**Location:** `manifold/primitives/control/CommandParser.h`

**Deprecated verbs that return errors:**
```cpp
"COMMIT", "FORWARD", "TEMPO", "REC", "OVERDUB", "STOP",
"PLAY", "PAUSE", "STOPREC", "CLEAR", "CLEARALL", "MODE",
"VOLUME", "MASTERVOLUME", "TARGETBPM", "LAYER"
```

**Issue:** Extensive diagnostics tracking (20+ counters) for dead syntax

**Evidence:**
```cpp
inline bool isDeprecatedLegacyVerb(const std::string &verb) {
  return verb == "COMMIT" || verb == "FORWARD" || ...;
}

// Returns error with deprecation code
return makeLegacyRemovedError(verb);  // W_PATH_DEPRECATED
```

**Cleanup action:** Remove after confirming no external tools use these verbs

---

### 4.2 Legacy MIDI Ring Buffers (Redundant)

**Location:** `manifold/core/BehaviorCoreProcessor.h`

```cpp
// Legacy MIDI support
MidiRingBuffer midiInputRing;   // Audio thread → Control thread
MidiRingBuffer midiOutputRing;  // Control thread → Audio thread
```

**Issue:** `MidiManager` (new) handles MIDI comprehensively. Legacy rings kept for "backward compat" but redundant.

**Evidence:**
```cpp
// Keep legacy behavior: write to ring buffer for Lua consumption
if (!writeLegacyRing) {
    return;
}
```

---

## 5. COMMENTED DEAD CODE

### 5.1 Documented Disabled Code Block

**Location:** `manifold/primitives/scripting/LuaEngine.cpp:1197`

```cpp
// BUG: This disables the graph on every UI switch, which kills all audio
// in BehaviorCore where the looper IS the graph. In legacy LooperProcessor
// this was safe because loops lived in C++ ManifoldLayer objects independent
// of the graph. Must not disable here.
// See: agent-docs/PERSISTENT_GRAPH_ARCHITECTURE.md
//
// if (pImpl->processor) {
//   pImpl->processor->setGraphProcessingEnabled(false);
// }
```

**Status:** Explains why code is disabled, but has been commented long enough to be cruft

---

## 6. DUPLICATE CODE

### 6.1 Widget Library Divergence

**Locations:**
- `manifold/ui/widgets/` (canonical)
- `test_plugins/Tempus/widgets/` (19 diverged copies)

**Files that differ:**
```
base.lua, button.lua, donut.lua, dropdown.lua, knob.lua, label.lua,
meter.lua, numberbox.lua, panel.lua, schema.lua, segmented.lua,
slider.lua, toggle.lua, waveform.lua, xypad.lua
```

**Issue:** `test_plugins/Tempus/` is a standalone test plugin that copied and modified the widget library instead of referencing it.

**Note:** Intentional for test isolation, but creates maintenance burden

---

### 6.2 Looper Baseline Duplication

**Locations:**
- `UserScripts/projects/LooperTabs/dsp/looper_baseline.lua`
- `UserScripts/projects/LooperSynthTabs/dsp/looper_baseline.lua`

**Status:** ⚠️ **INTENTIONAL** - Safe migration pattern (acknowledged by user)

**Note:** Duplicated to safely iterate between LooperTabs and LooperSynthTabs projects

---

### 6.3 Super Slot Duplication

**Locations:**
- `UserScripts/projects/LooperTabs/dsp/super_slot.lua`
- `UserScripts/projects/LooperSynthTabs/dsp/super_slot.lua`

**Status:** ⚠️ **INTENTIONAL** - Same as above

---

## 7. MISCELLANEOUS

### 7.1 Headless Test Harnesses (Test-Only)

**Location:** `manifold/headless/`

**Files:**
- `CanonicalCommandHarness.cpp`
- `ControlCommandQueueHarness.cpp`
- `EndpointResolverHarness.cpp`
- `LuaEngineMockHarness.cpp`
- `ManifoldHeadless.cpp`
- `StateProjectionHarness.cpp`

**Status:** Not compiled into main plugin - separate test executables

**Note:** Useful for CI/testing, not shipped code

---

### 7.2 Backward Compatibility Aliases

**Location:** `manifold/primitives/scripting/ScriptingConfig.h`

```cpp
// Backward compatibility aliases - these will be deprecated
// Prefer using the structs above in new code
inline constexpr int SCRIPTING_COMMAND_QUEUE_SIZE = QueueConfig::COMMAND_QUEUE_SIZE;
inline constexpr int SCRIPTING_EVENT_QUEUE_SIZE = QueueConfig::EVENT_QUEUE_SIZE;
// ... etc
```

**Status:** Marked for deprecation but still widely used

---

## 8. CLEANUP PRIORITIES

### Immediate (High Impact, Low Risk)

| Item | Effort | Impact |
|------|--------|--------|
| Remove Canvas renderer deprecation warnings | Low | Removes console spam |
| Delete experimental_legacy.lua archive | Low | 1,872 lines removed |
| Delete ui_shell_monolithic.lua baseline | Low | Archive cleanup |
| Remove commented dead code block (LuaEngine.cpp:1197) | Low | Clarity |

### Short Term (Technical Debt)

| Item | Effort | Impact |
|------|--------|--------|
| Implement or remove IStateSerializer stubs | Medium | Interface honesty |
| Replace markUnloaded() hack with proper lifecycle | Medium | Stability |
| Merge dual SPSCQueue implementations | Low | Code deduplication |
| Remove legacy MIDI ring buffers | Medium | Simplification |

### Long Term (Architecture)

| Item | Effort | Impact |
|------|--------|--------|
| Split DSPPluginScriptHost.cpp (3,817 lines) | High | Maintainability |
| Split LuaEngine.cpp (1,941 lines) | High | Maintainability |
| Split methods_core.lua (4,034 lines) | High | Maintainability |
| Remove deprecated command verbs | Low* | *After verification |

---

## 9. VERIFICATION CHECKLIST

Before deleting any "probably unused" items:

- [ ] `looper_primitives.lua` - Check if any project configs reference it
- [ ] `test_plugins/Tempus/widgets/` - Verify Tempus test plugin still builds
- [ ] Legacy command verbs - Check external OSC tools for usage
- [ ] Legacy MIDI rings - Verify no Lua scripts read from them directly

---

## 10. NOTES

### Intentional Duplications (Do Not Remove)

The following duplications are **intentional** for safe migration and should remain:

1. **LooperTabs / LooperSynthTabs projects** - Parallel implementations for A/B testing
2. **Test scripts in `manifold/dsp/scripts/`** - Actively used by DspLiveScripting via `listDspScripts()` which explicitly checks the `scripts/` subdirectory

### False Positives (Initially Flagged, Actually Used)

| Item | Initial Assessment | Reality |
|------|-------------------|---------|
| 33 test DSP scripts | Thought orphaned | **Actually used** - `listDspScripts()` explicitly checks `dsp/scripts/` subdirectory |

---

*Document maintained by: Agent*  
*Last updated: March 2026*
