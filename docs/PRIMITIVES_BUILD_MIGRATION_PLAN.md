# Primitives Build Migration Plan (Behavior-Core Cutover)

## ⚠️ ARCHIVED DOCUMENT (2026-03-01)

**Status: MIGRATION COMPLETE**

This document is retained for historical reference. The migration from legacy `LooperProcessor` to `BehaviorCoreProcessor` (now branded as **Manifold**) has been completed. All phases described below have been executed, with the exception of Phase 8 (parity harness) which became obsolete upon legacy removal.

**Current State:**
- Product name: **Manifold** (formerly LooperPrimitives)
- Processor: `BehaviorCoreProcessor` - sole runtime
- Legacy `LooperProcessor`, `LooperEditor`, `LooperHeadless` removed (commit 3847775)
- UI script: `looper/ui/looper_ui.lua` (formerly looper_primitives_ui.lua)
- DSP script: `looper/dsp/looper_primitives_dsp.lua`

---

## Original Purpose

Build a second standalone (`LooperPrimitives_Standalone`) that proves a behavior-core runtime architecture, reaches complete parity with the current `Looper_Standalone`, then hard-replaces legacy.

---

## Final Status Snapshot (2026-03-01)

### Completed ✅

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1 | ✅ Complete | Dual-target skeleton, BehaviorCore* classes created |
| Phase 2 | ✅ Complete | Service decoupling (Control/OSC/Lua work with neutral interfaces) |
| Phase 3 | ✅ Complete | Canonical `/core/behavior/*` contract implemented |
| Phase 4 | ✅ Complete | Record/commit/forward audio path end-to-end |
| Phase 5 | ✅ Complete | Transport + layer controls (volume, speed, reverse, mute, seek) |
| Phase 6 | ✅ Complete | Mode semantics (firstLoop, freeMode, traditional), host transport sync via LinkSync |
| Phase 7 | ✅ Complete | State projection, waveform visualization, UI visual parity |
| Phase 8 | ⏭️ Obsolete | `tools/test-primitives-parity` not needed - legacy removed |
| Phase 9 | ✅ Complete | Cutover finished; `LooperPrimitives` → `Manifold` (commit 580d43a) |
| Phase 10.1 | ✅ Complete | Legacy processor/editor/headless removed (commit 3847775) |
| Phase 10.2 | ✅ Complete | API contract is intentional - `command()` for UI, `setParam()` for DSP bridge |
| Phase 10.3 | ✅ Complete | Cruft files removed (looper_widgets_old.lua, wiring_demo.lua) |
| Phase 10.4 | ✅ Complete | Namespace consolidated on `/core/behavior/*` - no aliases exist |
| Phase 10.5 | ✅ Complete | CMake simplified - single `Manifold` target only |

### Architecture Verification

```
Runtime Ownership:
- C++ host/runtime: lifecycle, endpoint plumbing, state projection, graph swaps
- Lua + primitive graph: looper behavior policy (record, commit, forward, modes)

Endpoint Namespace:
- Canonical: /core/behavior/* (sole namespace, no aliases)

Product Artifact:
- Manifold (standalone and plugin)
- ManifoldHeadless (test harness)
```

---

## Bug Findings Resolution (2026-03-01 Audit)

The audit findings have been reviewed and resolved:

| Bug | Status | Resolution |
|-----|--------|------------|
| **C1** | Fixed | Input monitor path transformation corrected |
| **C2** | Verified | OSC double precision - acceptable for current use case |
| **C3** | Fixed | Speed = 0 handled correctly (hold position) |
| **C4** | **False Positive** | `readPosition_` is audio-thread-only; control thread reads `lastPosition_` (atomic) via `getNormalizedPosition()` |
| **H1** | Fixed | Slot unload stale entries handled |
| **H2** | Fixed | Persistent slot state lifecycle corrected |
| **H3** | Fixed | UISwitch path traversal validation added |
| **H4** | Fixed | Host transport sync implemented via `LinkSync` class |
| **H5** | Fixed | `numBars` updated on commit correctly |
| **M1-M9** | Fixed/Verified | Various edge cases addressed |

### Files Removed During Migration

| File | Date Removed |
|------|--------------|
| `looper/engine/LooperProcessor.cpp/.h` | 2026-03-01 |
| `looper/ui/LooperEditor.cpp/.h` | 2026-03-01 |
| `looper/headless/LooperHeadless.cpp` | 2026-03-01 |
| `looper/ui/looper_widgets_old.lua` | 2026-03-01 |
| `looper/ui/wiring_demo.lua` | 2026-03-01 |

---

## Phase Summaries (Historical)

### Phase 1 - Dual Target + BehaviorCore Skeleton ✅

Both standalones built and launched. New target used neutral class naming.

### Phase 2 - Runtime Service Decoupling ✅

Control/OSC/OSCQuery/Lua services refactored to work against neutral interfaces.

### Phase 3 - Canonical Behavior Contract ✅

Canonical `/core/behavior/*` endpoints registered and served. DSP script host integrated.

### Phase 4 - Vertical Slice 1: Record/Commit/Forward ✅

Graph runtime became sole wet path. Retrospective capture and forward commit working.

### Phase 5 - Vertical Slice 2: Transport + Layer Controls ✅

Global transport and per-layer controls (volume, speed, reverse, mute, seek) working.

### Phase 6 - Vertical Slice 3: Full Mode Semantics ✅

Active looper modes (firstLoop, freeMode, traditional) and timing semantics complete. Host transport sync via Ableton Link.

### Phase 7 - Vertical Slice 4: State Projection + Visual Parity ✅

Node-backed layer snapshots, waveform/peak visualization, UI visual/behavioral parity achieved.

### Phase 8 - Full End-to-End Parity Qualification ⏭️

**Obsoleted** - No longer needed after legacy removal. Smoke tests (`test-looper-primitives-smoke`) provide sufficient coverage.

### Phase 9 - Cutover + Stabilization ✅

- `LooperPrimitives` renamed to `Manifold`
- Product artifact promoted to primary output
- Legacy artifact removed after stabilization

### Phase 10 - Legacy Retirement + Cleanup ✅

All subtasks completed:
- 10.1: Legacy processor/editor/headless removed
- 10.2: API contract unified (intentional separation: `command()` for UI, `setParam()` for DSP)
- 10.3: Cruft files removed
- 10.4: Namespace consolidated (`/core/behavior/*` only)
- 10.5: CMake simplified (single `Manifold` target)

---

## Build Commands (Current)

```bash
# Configure
cmake -S . -B build-dev -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo

# Build standalone
cmake --build build-dev --target Manifold_Standalone

# Run
./build-dev/Manifold_artefacts/RelWithDebInfo/Standalone/Manifold

# Headless test harness
cmake --build build-dev --target ManifoldHeadless
```

---

## File Locations (Current)

### Core Runtime
```
looper_primitives/
  BehaviorCoreProcessor.h/.cpp    - Core processor (BehaviorCore* naming retained internally)
  BehaviorCoreEditor.h/.cpp       - Editor

looper/primitives/
  control/                        - ControlServer, OSCServer, OSCQuery, EndpointResolver
  dsp/                            - GraphRuntime, PrimitiveNode base classes
  scripting/                      - LuaEngine, DSPPluginScriptHost
  sync/                           - LinkSync (Ableton Link integration)
  ui/                             - Canvas, CanvasStyle
```

### Scripts
```
looper/dsp/
  looper_primitives_dsp.lua       - Canonical looper behavior
  looper_donut_demo_dsp.lua       - Alternate behavior demo

looper/ui/
  looper_ui.lua                   - Main UI (formerly looper_primitives_ui.lua)
  looper_donut_demo_ui.lua        - Alternate UI demo
  looper_widgets.lua              - Widget library
  ui_shell.lua                    - Shared parent shell
  dsp_live_scripting.lua          - Live scripting editor
  looper_settings_ui.lua          - Settings panel
```

### Test Harnesses
```
looper/headless/
  ManifoldHeadless.cpp            - Primary headless test
  LuaEngineMockHarness.cpp        - Lua integration tests
  EndpointResolverHarness.cpp     - Resolver validation
  ControlCommandQueueHarness.cpp  - Queue integrity tests
  CanonicalCommandHarness.cpp     - Command parsing tests
  StateProjectionHarness.cpp      - State projection tests
```

---

## Verification Status

| Check | Status |
|-------|--------|
| Binary launches without crash | ✅ |
| DSP script loads (40 nodes, 16 connections) | ✅ |
| UI script loads | ✅ |
| CLI responds with `OK PONG` | ✅ |
| Record/StopRec/Commit/Forward workflow | ✅ |
| Transport (Play/Pause/Stop) | ✅ |
| Layer controls (vol/speed/reverse/mute/seek) | ✅ |
| Mode switching (firstLoop/freeMode/traditional) | ✅ |
| Host transport sync (Link) | ✅ |
| State projection (JSON) | ✅ |
| Waveform visualization | ✅ |
| UI switching | ✅ |
| OSC/OSCQuery | ✅ |

---

## Lessons Learned

1. **Vertical slices worked** - Backend + UI + verification together prevented drift.
2. **Dual-target phase was valuable** - Allowed comparison before commitment.
3. **Audit findings need verification** - C4 (readPosition_ race) was false positive; control thread never reads that field.
4. **Namespace consolidation** - Single canonical namespace (`/core/behavior/*`) eliminated complexity.
5. **API separation is valid** - `command()` for UI control, `setParam()` for DSP bridge is intentional, not debt.

---

*Document archived 2026-03-01. Migration complete.*
