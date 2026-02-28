# Primitives Build Migration Plan (Behavior-Core Cutover)

## CURRENT WORKING CONTEXT (READ FIRST)

This project is building a **user-scriptable loop engine** on top of BehaviorCore.

- We are not just "making a looper"; we are proving that users can define looper behavior in Lua.
- `BehaviorCore` must remain runtime infrastructure; looper policy must be script-defined.
- The legacy `LooperProcessor` is the behavior exemplar when parity questions arise.

### Immediate Priority (Blocker Before Any Later Phases)

Fix Vertical Slice 1 behavior parity in `LooperPrimitives`:

1. `REC -> STOPREC` in First Loop must infer/set tempo and produce an audible playing loop on selected layer.
2. Traditional capture-window flow must behave like legacy forward-pass commit timing (arm, fire, clear), not break/hang.
3. No delay-line artifacts introduced by migration wiring.
4. No unrequested UX behavior changes.

### Semantics Guardrails

- Mode model for this migration context is 3 looper modes: `firstLoop`, `freeMode`, `traditional`.
- "Retrospective" is treated as capture-plane behavior/state used by mode logic, not a separate user mode target in this slice.
- If uncertain: inspect and mirror legacy C++ behavior first, then port cleanly.
- Scrub/seek guardrail: layer speed must support true hold (`speed = 0.0`), with no transport side effects from scrub callbacks.

## Purpose

Build a second standalone (`LooperPrimitives_Standalone`) that proves a behavior-core runtime architecture, reaches complete parity with the current `Looper_Standalone`, then hard-replaces legacy.

This plan is the canonical execution checklist. It is written to be followed step by step.

## Status Snapshot (2026-02-28)

### Completed Since Original Draft

- Phase 4 Slice 1 behavior is functioning end-to-end (record/stoprec/commit/forward path) in `LooperPrimitives`.
- Phase 5 transport + layer control path is implemented and validated in smoke/manual checks.
- State projection and waveform/peak plumbing are now node-backed (capture + layer peaks are real, not stubs).
- Scrub behavior in `looper_primitives_ui.lua` now enforces:
  - strict cursor-authoritative pinning,
  - no transport side effects while scrubbing,
  - true zero-speed hold,
  - restore of pre-scrub speed/reverse on release,
  - DSP-side seek smoothing in `LoopPlaybackNode`.
- Speed contract is now aligned end-to-end: layer speed minimum is `0.0` (endpoint + script), so scrub hold does not clamp.
- Added explicit decoupling demo artifacts:
  - `looper/dsp/looper_donut_demo_dsp.lua` (alternate looper behavior + reverb wiring, canonical `/core/behavior/*` contract)
  - `looper/ui/looper_donut_demo_ui.lua` (alternate donut-style UI)
  - quick headless smoke validated script swap + param round-trip + behavior difference (round-robin layer advance after stoprec).

### Remaining Work (Current Focus)

- Phase 6 hardening: mode/timing edge parity closure and explicit per-mode qualification matrix.
- Phase 7 follow-up watch window for regressions while Phase 8 qualification is built.
- Phase 8 parity harness (`tools/test-primitives-parity`) across legacy vs primitives sockets.
- Phase 9 artifact cutover + stabilization + explicit legacy retirement sign-off.

### Audit Findings Snapshot (2026-03-01)

This snapshot reflects a parallel codebase diagnostic pass (build topology, graph lifecycle surfaces, Lua API usage, deprecation inventory, harness/test coverage, and slot/runtime lifecycle).

#### 1) Parity/qualification blockers still open

- Phase 6 still has unresolved closure items:
  - traditional stop/commit edge behavior final pass,
  - host transport sync parity,
  - per-mode parity matrix automation + manual mode session sign-off.
- Phase 8 harness `tools/test-primitives-parity` is still missing.

#### 2) Persistent-graph cleanup surfaces still exposed

- `BehaviorCoreProcessor` still exposes `/looper|/dsp/looper|/core/behavior/graph/enabled` compatibility paths.
- `LuaEngine` still binds `clearGraph` and `setGraphProcessingEnabled`.
- `looper/ui/looper_ui.lua` still writes `setParam("/looper/graph/enabled", 0.0)` on init.

These are migration-era surfaces and should be explicitly retained-as-debug-only or removed during cleanup.

#### 3) Slot lifecycle policy is now implemented, but needs explicit validation

- Runtime policy exists via Lua APIs:
  - `setDspSlotPersistOnUiSwitch(slot, bool)`
  - `isDspSlotPersistOnUiSwitch(slot)`
- `LuaEngine::switchScript()` unloads managed named slots unless pinned persistent.
- Current script usage:
  - donut slot pinned persistent,
  - `live_editor` slot transient/unloaded on cleanup.

Missing: dedicated automated checks that prove this behavior across repeated UI switches.

#### 4) Input-path persistence policy status

- Input path now supports two semantics:
  - monitor-controlled host input,
  - raw capture host input (opt-in by node).
- Donut now has explicit input-monitor gating endpoint (`/core/slots/donut/input/monitor`) so donut input FX can be disabled on UI exit while donut loop audio stays persistent.

Missing: automated regression checks for "persistent loop audio + non-persistent donut input FX".

#### 5) Lua parameter API contract remains mixed (Phase 10.2 debt)

- Canonical `command("SET"/"TRIGGER", ...)` is used in main looper UIs and shell.
- Direct `setParam(...)` writes remain in some scripts (e.g., graph toggles and live-scripting control paths).

This should be unified under the canonical contract in Phase 10.2.

#### 6) Namespace/alias debt is still high

- `BehaviorCoreProcessor` contains broad alias branching for `/core/behavior/*`, `/looper/*`, and `/dsp/looper/*` across set/get/has paths.

This is expected during migration, but should be consolidated once final namespace policy is chosen (Phase 10.4).

#### 7) Deprecation/removal candidates confirmed present

- `looper/ui/looper_widgets_old.lua`
- `looper/ui/wiring_demo.lua` (already marked deprecated)
- `looper/ui/looper_ui_experimental.lua` (active experiment; needs explicit keep/remove decision)

#### 8) Minor cleanup debt surfaced

- `ControlServer.cpp` still has TODO for injection resampling.
- stale/legacy BUG commentary around graph disable path in `LuaEngine` should be rewritten to current-state wording during cleanup.

---

## Bug Findings (2026-03-01 Deep Audit)

This section documents bugs discovered during the deep diagnostic pass. Each finding includes location, severity, and description.

### CRITICAL BUGS

| # | Category | Description | Location |
|---|----------|-------------|----------|
| C1 | Input Path | `/core/slots/donut/input/monitor` path transformation failure - DSP never receives the parameter because DSPPluginScriptHost doesn't map `/core/slots/*` → `/core/behavior/*`. Monitor is always at default (0.0). | `DSPPluginScriptHost.cpp:172-180` |
| C2 | OSC | Double precision loss - doubles serialized as floats (only 4 bytes sent). Type tag says 'f' but semantics expect 'd'. | `OSCPacketBuilder.h:38-44, 61-68` |
| C3 | Layer Control | Speed = 0 causes permanent stop - playhead increment becomes 0, no way to restart except explicit seek. | `LoopPlaybackNode.cpp:105-110` |
| C4 | Layer Control | Non-atomic `readPosition_` in LoopPlaybackNode - data race between audio thread writes and potential control thread reads. | `LoopPlaybackNode.h:57` |

### HIGH PRIORITY BUGS

| # | Category | Description | Location |
|---|----------|-------------|----------|
| H1 | Slot Lifecycle | Failed slot unload leaves stale entries in `managedDspSlots` - slot stays forever, repeated error logs. | `LuaEngine.cpp:2738` |
| H2 | Slot Lifecycle | Persistent slot state leaks between scripts - `persistentDspSlots` never cleared between scripts, wrong loops persist. | `LuaEngine.cpp:2714-2727` |
| H3 | Command | UISwitch path traversal vulnerability - no validation of filepath, allows `../../../etc/passwd` style escapes. | `ControlServer.cpp:671-676` |
| H4 | Transport Sync | BehaviorCoreProcessor has NO host transport sync - completely decoupled while LooperProcessor syncs to host. | `BehaviorCoreProcessor.cpp:171-321` |
| H5 | State Projection | `numBars` not updated on commit - JSON state queries return stale bar counts. | `BehaviorCoreProcessor.cpp:679-685` |

### MEDIUM PRIORITY BUGS

| # | Category | Description | Location |
|---|----------|-------------|----------|
| M1 | Legacy Graph | `hasEndpoint()` missing `/looper/graph/enabled` - inconsistent with SET/GET which handle it. | `BehaviorCoreProcessor.cpp:936-956` |
| M2 | Lua API | `setParam()` bypasses path aliasing that `command("SET")` does - inconsistent success values between APIs. | Multiple call sites |
| M3 | Layer Control | Layer mute is immediate (no fade) - causes click/pop artifacts. | `LooperLayer.h:28-33` |
| M4 | Layer Control | Layer mixing has no clipping protection - 4 layers at full volume can overflow. | `LooperProcessor.cpp:196-203` |
| M5 | Layer Control | `clearLoop()` doesn't reset `playing_` flag - shows "Playing" but outputs silence. | `LoopPlaybackNode.cpp:258-266` |
| M6 | Transport | Race condition on host stop - `playTime` not reset when host stops, causes drift. | `LooperProcessor.cpp:224-228` |
| M7 | Transport | Tempo change doesn't immediately update `samplesPerBar` - forward commits may fire at wrong time. | `LooperProcessor.cpp:473-477` |
| M8 | OSC | Socket created per broadcast message - performance issue for multi-target broadcasts. | `OSCServer.cpp:709-713` |
| M9 | Command | Dual code path for SET/TRIGGER - fast path bypasses parser validation, inconsistent behavior. | `ControlServer.cpp:393-597` |

### LOW PRIORITY ISSUES

| # | Category | Description | Location |
|---|----------|-------------|----------|
| L1 | OSC | Silent port binding failures - no logging when port already in use. | `OSCServer.cpp:133-138`, `OSCQuery.cpp:208-213` |
| L2 | State | Layer position/length race - separate atomic reads can see inconsistent values. | `BehaviorCoreProcessor.cpp:970-977` |
| L3 | State | Forward commit timing not exposed to UI - cannot show "forward in X seconds" countdown. | `BehaviorCoreProcessor.cpp:196-198` |
| L4 | Command | Invalid record mode silently accepted - returns "OK" but does nothing. | `CommandParser.h:445-456` |
| L5 | Command | NoOpWarning returns "OK" - client can't distinguish success from no-op. | `ControlServer.cpp:679` |
| L6 | Namespace | Performance concern - 60 string comparisons per param access due to if-else chain. | `BehaviorCoreProcessor.cpp:530-934` |

### TEST COVERAGE GAPS

- No slot lifecycle tests
- No input monitor gating tests
- No persistent loop + non-persistent FX tests
- No per-mode parity matrix automation
- No host transport sync tests
- No multi-layer clipping tests
- No UI switch regression tests

### FILES SAFE TO REMOVE

| File | Status |
|------|--------|
| `looper/ui/looper_widgets_old.lua` | SAFE TO REMOVE - superseded by OOP reimplementation |
| `looper/ui/wiring_demo.lua` | SAFE TO REMOVE - explicitly marked deprecated |

### FILES TO PRESERVE (EXTRACT CODE FIRST)

| File | Action |
|------|--------|
| `looper/ui/looper_ui_experimental.lua` | PRESERVE - extract XYPad and OSC patterns before cleanup |

---

## Locked Decisions

1. Migration executes in a **dual-binary track first** (`Looper` + `LooperPrimitives`), then hard cutover.
2. Shared-file edits are allowed when needed, but must be guarded by parity tests.
3. Runtime architecture is **behavior-agnostic C++ core** (no looper-policy in host runtime).
4. Lua is the behavior definition backend for this product, but runtime classes stay neutral in naming.
5. New internal class family is **BehaviorCore\***.
6. Canonical endpoint namespace is **`/core/behavior/*`**, with `/looper/*` compatibility aliases during migration.
7. No in-binary legacy toggle in the new runtime.
8. `looper/dsp/looper_primitives_dsp.lua` remains the canonical user-facing example behavior script.
9. UI clone is rewritten from scratch as `looper/ui/looper_primitives_ui.lua`, visually identical, reusing existing widget library.
10. Execution uses vertical slices (backend + UI + verification together).
11. Every phase must end bootable and runnable.
12. Verification is strict: implementation -> automated parity checks -> manual audio/UI checklist.

## Non-Negotiable Constraints

1. **Complete parity is required**. No deferred behavior items in this migration.
2. **No Lua execution on audio thread**. Lua config/param callbacks only; C++ graph runtime does DSP.
3. **Real-time safety preserved**: no locks, allocations, string ops, or logging in the audio callback hot path.
4. **No standalone custom harness binaries**. Use approved paths (`LooperHeadless`, standalone app, IPC/CLI).
5. **Legacy remains buildable throughout migration** until explicit cutover phase.
6. **No visual regression for looper UI behavior**: rewritten UI clone must match current visuals and interaction behavior.

## End-State Architecture

### Runtime Ownership

- C++ host/runtime owns lifecycle, endpoint plumbing, state projection, graph swaps/crossfades, and thread-safety.
- Lua + primitive graph owns looper behavior policy (record, commit, forward, modes, layer semantics).

### Artifact Strategy

During migration:

- `Looper_Standalone` (legacy)
- `LooperPrimitives_Standalone` (new behavior-core runtime)

After parity + cutover:

- `LooperPrimitives` becomes `Looper`.
- Temporary legacy artifact is kept for a short stabilization window.
- Legacy artifact removal is manual sign-off.

## Contract Strategy

### Endpoint Namespaces

- Canonical: `/core/behavior/*`
- Compatibility: `/looper/*` aliases (read/write/trigger)

### Alias Rules

1. Canonical paths are always registered first.
2. `/looper/*` aliases map bijectively to canonical paths where possible.
3. On mismatch, canonical path semantics win.
4. Alias layer is temporary and removed after stabilization window cleanup.

## UI Strategy

1. Keep existing `looper/ui/looper_ui.lua` untouched during migration.
2. Build rewritten visual clone at `looper/ui/looper_primitives_ui.lua`.
3. Reuse current widget library (`looper_widgets.lua`) in this migration.
4. Visuals should not drift from the current looper UI.

## Execution Model

### Vertical Slice Rule

Each capability slice must include:

1. Backend/runtime behavior implementation.
2. Matching UI surface implementation in `looper_primitives_ui.lua`.
3. Automated verification.
4. Manual boot-session verification.

### Task Completion Rule

A task is only complete when all are true:

1. Implementation is merged in the phase branch.
2. Automated checks pass.
3. Manual audio + UI checklist passes.
4. Both binaries still boot.

---

## Phase 1 - Dual Target + BehaviorCore Skeleton (Bootable Baseline)

**Goal:** Both standalones build and launch. New target has neutral class naming and a minimal UI script path that renders.

### Tasks

- [x] Extract shared source grouping in `CMakeLists.txt` for dual-target wiring.
- [x] Add `juce_add_plugin(LooperPrimitives ...)` and standalone target.
- [x] Add new files in a new directory for neutral runtime classes:
  - [x] `BehaviorCoreProcessor.h/.cpp`
  - [x] `BehaviorCoreEditor.h/.cpp`
- [x] Wire `LooperPrimitives` target to `BehaviorCore*` classes.
- [x] Add initial `looper/ui/looper_primitives_ui.lua` content script that mounts inside the shared shell.
- [x] Ensure `looper_primitives_ui.lua` is content-only (no second shell creation), so only one shared shell is rendered.
- [x] Ensure new UI script can load in the new target without affecting legacy UI.

### Verify

- [x] `cmake -S . -B build-dev -G Ninja -DCMAKE_BUILD_TYPE=RelWithDebInfo`
- [x] `cmake --build build-dev --target Looper_Standalone`
- [x] `cmake --build build-dev --target LooperPrimitives_Standalone`
- [x] Launch both binaries; both show windows and do not crash.
- [x] Verify shared shell settings can switch Lua UI scripts in `LooperPrimitives`.

### Exit Criteria

- [x] Both artifacts bootable.
- [x] New target uses neutral internal class naming (`BehaviorCore*`).
- [x] Legacy behavior unchanged.

---

## Phase 2 - Runtime Service Decoupling (Processor-Type Neutral)

**Goal:** Control/OSC/OSCQuery/Lua integration services can operate against behavior-core processor without `LooperProcessor*` hard coupling.

### Tasks

- [x] Refactor service ownership typing from `LooperProcessor*` to neutral runtime interface(s) as needed.
  - [x] `ControlServer`
  - [x] `OSCServer`
  - [x] `OSCQueryServer`
  - [x] `LuaEngine` integration points that dynamic-cast to `LooperProcessor`
- [x] Keep legacy processor support intact through interface conformance.
- [x] Preserve endpoint registry and command parser behavior in both targets.
- [x] Remove temporary primitives bootstrap dependence on legacy `LooperProcessor`/`LooperEditor` compilation units.
- [x] Decouple `DSPPluginScriptHost` from `LooperProcessor*` and restore it in shared runtime sources.

### Verify

- [x] Build both standalones successfully.
- [x] Launch both standalones and verify IPC socket creation.
- [x] `tools/looper-cli -s <socket> ping` returns `OK PONG` for both.
- [x] `tools/looper-cli -s <socket> state` returns valid JSON for both.

### Exit Criteria

- [x] No service path requires concrete `LooperProcessor*` for core operation.
- [x] Both artifacts remain bootable.

---

## Phase 3 - Canonical Behavior Contract + Script Host Integration

**Goal:** `LooperPrimitives` runs behavior through canonical `/core/behavior/*` contract, with `/looper/*` compatibility aliases.

### Tasks

- [x] Load `looper/dsp/looper_primitives_dsp.lua` in `BehaviorCoreProcessor` prepare path.
- [x] Register and serve canonical `/core/behavior/*` endpoints.
- [x] Implement `/looper/*` alias mapping to canonical endpoints for SET/GET/TRIGGER.
- [x] Ensure command translation path routes to behavior script parameters (not legacy monolith switches).
  - [x] Route DSP custom endpoints through `DSPPluginScriptHost` in `BehaviorCoreProcessor::setParamByPath/getParamByPath/hasEndpoint`.
  - [x] Wire runtime ownership in `BehaviorCoreProcessor` so requested graph runtimes are swapped in and processed on the audio path.
- [x] Add explicit alias parity checks to command handling tests.

### Verify

- [x] For canonical and alias forms, SET/GET return matching values.
- [x] `state` output includes canonical-backed values.
- [x] OSC and OSCQuery still respond on configured ports.
- [x] Existing smoke scripts continue to pass (legacy and new target as applicable).
  - [x] Primitives smoke path passes (DSP script load/swap + CLI param round-trip + process stays alive).
- [x] Running DSP live scripting no longer crashes `LooperPrimitives` (Lua state swap order fix in `DSPPluginScriptHost`).
- [x] DSP script parameters in primitives no longer hard-clamp to `0/1`; round-trip SET/GET for float params remains stable.

### Exit Criteria

- [x] Canonical path family is live in new target.
- [x] Alias compatibility works for `/looper/*`.
- [x] No regressions in legacy binary.

---

## Phase 4 - Vertical Slice 1: Record/Commit/Forward Audio Path

**Goal:** Record/commit/forward behavior works through graph runtime as primary audio path in `LooperPrimitives`.

### Tasks

- [x] Ensure graph runtime is the sole wet path in new runtime (no additive legacy mixing behavior).
- [x] Wire retrospective capture and commit flows through primitive nodes.
- [x] Wire forward-arm + forward-fire semantics to behavior script and node state.
- [x] Add matching UI section in `looper_primitives_ui.lua` for record/commit/forward controls and status.

### Automated Verify

- [x] Add/extend CLI checks for:
  - [x] `rec`/`stoprec`
  - [x] `commit N`
  - [x] forward armed state and clear behavior
- [x] Validate response parity between legacy and primitives where semantics overlap.

### Manual Boot Verify

- [x] Boot `LooperPrimitives_Standalone` with live input.
- [x] Record/stop/commit loops and confirm audible playback.
- [x] Forward-arm workflow behaves correctly and clears when expected.

### Exit Criteria

- [x] Record/commit/forward works end-to-end in new target.
- [x] Matching UI controls + indicators are present and correct.

---

## Phase 5 - Vertical Slice 2: Transport + Layer Controls

**Goal:** Global transport and per-layer controls behave with audible parity.

### Tasks

- [x] Implement/verify global transport semantics (play/pause/stop).
- [x] Implement/verify per-layer controls:
  - [x] volume
  - [x] speed
  - [x] reverse
  - [x] mute
  - [x] seek
  - [x] layer play/pause/stop/clear
- [x] Extend `looper_primitives_ui.lua` with visually matching layer strips and transport section.

### Automated Verify

- [x] Parity script validates all layer controls across layers 0-3.
- [x] Transport triggers return expected state transitions.

### Manual Boot Verify

- [x] Multi-layer session confirms audible changes for each control.
- [x] Transport behavior matches user expectations in active session.

### Exit Criteria

- [x] Transport and layer controls parity reached in new target.
- [x] UI controls reflect and drive backend state correctly.

---

## Phase 6 - Vertical Slice 3: Full Mode Semantics + Timing Parity

**Goal:** Active looper modes (`firstLoop`, `freeMode`, `traditional`) and timing semantics match legacy behavior. Retrospective is validated as capture-plane behavior used by these modes.

### Tasks

- [x] Implement and verify active looper modes:
  - [x] firstLoop
  - [x] freeMode
  - [x] traditional
- [x] Validate retrospective capture-plane behavior used by mode logic.
- [ ] Include full timing behavior parity hardening:
  - [x] tempo inference
  - [x] quantization semantics
  - [x] forward commit scheduling rules
  - [ ] traditional stop/commit edge behavior (final edge-case pass)
- [ ] Include host transport sync parity behavior required by current product behavior.
- [x] Update UI mode panels and indicators in `looper_primitives_ui.lua` to match existing visuals.

### Automated Verify

- [ ] Add per-mode parity matrix checks (legacy vs primitives).
- [ ] Verify edge transitions (stoprec, commit, clear, armed-state resets).

### Manual Boot Verify

- [ ] Run one session through all mode transitions and confirm expected audible/visual behavior.

### Exit Criteria

- [ ] Mode and timing semantics parity reached.
- [ ] No mode-specific regressions vs legacy behavior.

---

## Phase 7 - Vertical Slice 4: State Projection + Visual Parity Completion

**Goal:** UI state and visualization are fully accurate and visually equivalent.

### Tasks

- [x] Add real node-backed layer snapshot query surfaces required by new runtime/UI.
- [x] Project per-layer state accurately (length, playhead, state enum, speed, reverse, volume, bars).
- [x] Implement waveform/peak visualization parity path (no stubs).
- [x] Finalize `looper_primitives_ui.lua` to visual/behavioral parity with current looper UI.

### Automated Verify

- [x] State JSON structure/value parity checks pass.
- [x] Visualization-related state fields are populated and consistent.

### Manual Boot Verify

- [x] Visual parity checklist passes for:
  - [x] control layout
  - [x] state indicators
  - [x] waveform behavior
  - [x] playhead movement
  - [x] mode/transport feedback

### Exit Criteria

- [x] UI clone is visually and behaviorally equivalent.
- [x] Runtime state projections are accurate and stable.

---

## Phase 8 - Full End-to-End Parity Qualification

**Goal:** Establish objective proof that `LooperPrimitives` matches `Looper` for shipped behavior.

### Tasks

- [ ] Implement `tools/test-primitives-parity` to compare two sockets (legacy + primitives).
- [ ] Cover all command families and state projections.
- [ ] Include canonical + alias endpoint checks.
- [ ] Include OSC and OSCQuery behavior checks.
- [ ] Include UI interaction parity checklist execution.

### Automated Verify

- [ ] Full parity suite passes cleanly.
- [ ] Existing smoke checks remain green.

### Manual Boot Verify

- [ ] One full real session from launch to multi-layer workflow passes without breakage.

### Exit Criteria

- [ ] Automated parity suite passes.
- [ ] Manual boot-session parity passes.
- [ ] UI behavioral + visual parity checklist passes.

---

## Phase 9 - Cutover + Stabilization Window

**Goal:** Promote new runtime as primary product artifact, keep temporary legacy artifact for short stabilization, then remove legacy artifact by manual sign-off.

### Tasks

- [ ] Promote `LooperPrimitives` artifact naming/target to primary `Looper` output.
- [ ] Keep temporary legacy artifact build target for stabilization window.
- [ ] Keep `/looper/*` compatibility aliases during stabilization.
- [ ] Verify no in-binary legacy toggle exists in the new runtime.

### Verify

- [ ] Primary artifact boots and passes parity suite.
- [ ] Temporary legacy artifact remains buildable/runnable during window.

### Exit Criteria

- [ ] New runtime is primary product artifact.
- [ ] Legacy artifact removal is manual sign-off.

---

## Phase 10 - Legacy Retirement + Codebase Audit + API Unification

**Goal:** Remove all legacy code paths, audit for cruft/aborted code, and unify the script parameter API surface. This phase executes after Phase 9 cutover is stable.

### Rationale

After cutover, the codebase will contain:
- Two parallel processor implementations (legacy `LooperProcessor` + new `BehaviorCoreProcessor`)
- Duplicate `setParamByPath`/`getParamByPath` implementations with inconsistent path handling
- Aborted/experimental Lua scripts and harness files
- Mixed parameter access patterns (direct `setParam()` vs `command("SET", ...)`)

This phase cleans up the technical debt accumulated during migration.

---

### Task 10.1 - Legacy Processor Retirement

**Goal:** Remove `LooperProcessor`, `LooperEditor`, and `LooperHeadless` after confirming `BehaviorCoreProcessor` is production-stable.

#### Subtasks

- [ ] Confirm 2-week stabilization window with no critical regressions in `LooperPrimitives`.
- [ ] Remove `looper/engine/LooperProcessor.cpp/.h`.
- [ ] Remove `looper/ui/LooperEditor.cpp/.h`.
- [ ] Remove `looper/headless/LooperHeadless.cpp`.
- [ ] Remove `Looper_Standalone` and `LooperHeadless` build targets from CMakeLists.txt.
- [ ] Remove any remaining `#include "LooperProcessor.h"` references.
- [ ] Update `AGENTS.md` to reflect new architecture and binary names.
- [ ] Update all documentation references to legacy processor.

#### Verify

- [ ] Clean build with only `LooperPrimitives_Standalone` and `LooperPrimitivesHeadless` targets.
- [ ] All harness tests pass without legacy processor.

#### Exit Criteria

- [ ] No `LooperProcessor`/`LooperEditor` source files remain.
- [ ] Build produces only `LooperPrimitives` artifacts.

---

### Task 10.2 - Script Parameter API Audit and Unification

**Goal:** Clarify and unify the parameter access surface for Lua scripts. Currently there are multiple ways to set parameters with different capabilities.

#### Current State (Problem)

| API | Path | Dynamic Creation | Resolver Validation | Notes |
|-----|------|------------------|---------------------|-------|
| `command("SET", path, value)` | Goes through `CommandParser` | No - path must exist in registry | Yes - full resolver validation | Preferred canonical path |
| `setParam(path, value)` | Direct to `processor->setParamByPath()` | **Yes** for DSP script params via `dspScriptHost->setParam()` | Partial - depends on processor implementation | Bypasses command parser |
| `getParam(path)` | Direct to `processor->getParamByPath()` | N/A (read) | No validation on read | Consistent with setParam |
| `ctx.params.register(path, opts)` | DSP scripts only | **Yes** - creates new endpoint | N/A (registration-time) | Dynamic param creation |
| `osc.registerEndpoint(path, opts)` | UI scripts only | **Yes** - creates custom endpoint | N/A | UI-side custom endpoints |

#### Issues to Resolve

1. **Inconsistent dynamic creation**: `setParam()` can create params via DSP script host, but `command("SET", ...)` rejects unknown paths. This is confusing.

2. **Duplicate implementation paths**: `BehaviorCoreProcessor::setParamByPath()` and `LooperProcessor::setParamByPath()` have different fallback behaviors.

3. **Namespace alias handling**: `BehaviorCoreProcessor` handles `/looper/*`, `/dsp/looper/*`, and `/core/behavior/*` aliases. `LooperProcessor` only handles `/looper/*`. This inconsistency should be unified in the surviving implementation.

4. **No clear contract for scripts**: Lua script authors need to know which API to use for what purpose.

#### Subtasks

- [ ] **Define canonical API contract**:
  - `command("SET", path, value)` - for all control operations; path must exist; full validation
  - `command("TRIGGER", path)` - for trigger operations
  - `setParam(path, value)` - **deprecated**; route internally through command path
  - `getParam(path)` - for reads; use resolver-backed state projection
  - `hasEndpoint(path)` - for capability checks
  - `ctx.params.register(path, opts)` - DSP scripts define their parameters
  - `osc.registerEndpoint(path, opts)` - UI scripts create custom OSC endpoints

- [ ] **Unify setParamByPath implementation** (in surviving `BehaviorCoreProcessor`):
  - Route `setParamByPath` through `CommandParser::buildResolverSetCommand` for consistency
  - Remove direct DSP script host bypass
  - Keep DSP script params as registered endpoints only

- [ ] **Audit and update all Lua scripts**:
  - `looper/ui/looper_ui.lua` - verify uses `command("SET", ...)` consistently
  - `looper/ui/looper_primitives_ui.lua` - same audit
  - `looper/dsp/*.lua` - verify uses `ctx.params.register/bind` pattern
  - Add deprecation warnings for `setParam()` usage in UI scripts

- [ ] **Document the unified contract** in a new `docs/LUA_API_CONTRACT.md`:
  - Clear guidance on which API to use when
  - Examples for each use case
  - Migration guide for any deprecated patterns

#### Verify

- [ ] All Lua scripts use canonical API patterns.
- [ ] `setParam()` produces deprecation warning when called from UI thread.
- [ ] DSP script params are only modifiable after registration.
- [ ] Unknown path SET commands are rejected with clear error.

#### Exit Criteria

- [ ] Single documented parameter access contract.
- [ ] All scripts conform to contract.
- [ ] No divergent implementation paths in C++.

---

### Task 10.3 - Cruft and Aborted Code Audit

**Goal:** Identify and remove dead code, aborted experiments, and obsolete files.

#### Known Cruft Candidates

| File/Directory | Status | Action |
|----------------|--------|--------|
| `GrainFreeze_Prototype/` | Archived reference | Keep with README, exclude from default builds |
| `looper/ui/looper_widgets_old.lua` | Legacy backup | Remove after verifying widgets.lua parity |
| `looper/ui/wiring_demo.lua` | Deprecated demo | Remove (hidden from switcher, no longer needed) |
| `looper/ui/looper_ui_experimental.lua` | Active experiment | Keep but audit for dead code |
| `looper/ui/dsp_live_scripting.lua` | Active tool | Keep, verify used |
| `looper/ui/looper_settings_ui.lua` | Settings panel | Keep, verify used |
| `build/` directory Lua copies | Build artefacts | Ensure clean rebuild removes stale copies |

#### Subtasks

- [ ] **Lua script audit**:
  - Remove `looper/ui/looper_widgets_old.lua`.
  - Remove `looper/ui/wiring_demo.lua` (deprecated marker already present).
  - Audit `looper/ui/looper_ui_experimental.lua` for dead functions.
  - Verify `looper/ui/dsp_live_scripting.lua` is accessible from UI switcher.

- [ ] **Harness cleanup**:
  - Review all harness files in `looper/headless/`:
    - `CanonicalCommandHarness.cpp` - keep (validates command parsing)
    - `ControlCommandQueueHarness.cpp` - keep (validates queue integrity)
    - `EndpointResolverHarness.cpp` - keep (validates resolver)
    - `LuaEngineMockHarness.cpp` - keep (validates Lua integration)
    - `StateProjectionHarness.cpp` - keep (validates state projection)
    - `LooperPrimitivesHeadless.cpp` - keep (primary headless test)
  - Remove `LooperHeadless.cpp` as part of Task 10.1.

- [ ] **C++ dead code scan**:
  - Search for `#if 0` blocks and remove.
  - Search for `// TODO` / `// FIXME` that are no longer relevant.
  - Search for commented-out code blocks > 5 lines and remove.
  - Identify unused includes (consider IWYU tool).

- [ ] **Documentation cleanup**:
  - Archive docs that describe completed migration phases.
  - Update `AGENTS.md` with final architecture.
  - Remove obsolete implementation notes.

#### Verify

- [ ] No `_old.*` files remain in source tree.
- [ ] No `#if 0` blocks in production code.
- [ ] All remaining harnesses have clear purpose documented.
- [ ] Documentation reflects current state.

#### Exit Criteria

- [ ] No dead code or aborted experiments in source tree.
- [ ] All files have clear purpose.

---

### Task 10.4 - Namespace and Alias Cleanup

**Goal:** Establish clear endpoint namespace hierarchy and remove migration-era aliases.

#### Current Namespace State

```
/core/behavior/*     - Canonical behavior endpoints (new)
/dsp/looper/*        - DSP script namespace alias (migration)
/looper/*            - Product namespace alias (compatibility)
```

#### Target State (Post-Stabilization)

```
/looper/*            - Primary product namespace (canonical)
/core/behavior/*     - Internal behavior script namespace (remove public exposure)
/dsp/*               - DSP script parameters only
```

#### Subtasks

- [ ] Audit which namespace is actually used by external clients (OSC, IPC).
- [ ] Decide final namespace hierarchy:
  - Option A: Keep `/looper/*` as product-facing, `/core/behavior/*` internal-only.
  - Option B: Migrate to `/core/behavior/*` as canonical, `/looper/*` as alias.
- [ ] Update `looper_primitives_dsp.lua` to register under chosen canonical namespace.
- [ ] Remove redundant alias registrations after decision.
- [ ] Update OSCQuery discovery to expose only intended namespace.
- [ ] Update documentation to reflect final namespace contract.

#### Verify

- [ ] OSC clients work with final namespace.
- [ ] IPC CLI tools work with final namespace.
- [ ] OSCQuery tree shows intended structure.

#### Exit Criteria

- [ ] Single canonical namespace documented.
- [ ] Aliases removed or clearly documented as compatibility shims.

---

### Task 10.5 - Build System Simplification

**Goal:** Simplify CMakeLists.txt after legacy removal.

#### Subtasks

- [ ] Remove dual-target conditional logic.
- [ ] Remove `Looper_*` target definitions.
- [ ] Rename `LooperPrimitives_*` targets to `Looper_*` if product identity requires.
- [ ] Consolidate shared source lists (remove legacy exclusions).
- [ ] Remove temporary migration defines (`USE_BEHAVIOR_CORE`, etc. if present).

#### Verify

- [ ] Clean build with no legacy targets.
- [ ] Build time is not worse than before cleanup.

#### Exit Criteria

- [ ] Minimal, clear CMakeLists.txt.
- [ ] No dead build configuration.

---

## Complete Parity Scope (No Deferred Buckets)

The following are in scope for this migration and must reach parity:

1. Record/stop-record/commit/forward semantics.
2. Active mode semantics (`firstLoop`, `freeMode`, `traditional`) and retrospective capture-plane edge transitions.
3. Per-layer control behavior and transport behavior.
4. Tempo inference and quantization behavior.
5. Host transport sync behavior currently expected by product.
6. State projection parity and waveform/peak visualization behavior.
7. IPC, OSC, OSCQuery, and UI behavior parity.

## Verification Protocol (Run Every Phase)

1. Run long-running builds/runs in tmux (builds in window `0:2`, standalone runs in assigned window).
2. Build both targets.
3. Launch both targets.
4. Run slice-specific automated checks.
5. Run manual slice checklist in standalone.
6. Confirm no regressions in legacy target.

## File Planning Inventory

### New files expected

```
looper_primitives/
  BehaviorCoreProcessor.h
  BehaviorCoreProcessor.cpp
  BehaviorCoreEditor.h
  BehaviorCoreEditor.cpp

looper/ui/
  looper_primitives_ui.lua

looper/headless/
  LooperPrimitivesHeadless.cpp

tools/
  test-primitives-parity

looper/dsp/
  looper_donut_demo_dsp.lua   # decoupling proof script (alternate behavior)

looper/ui/
  looper_donut_demo_ui.lua    # decoupling proof UI (alternate visuals)
```

### Files expected to change (targeted refactors allowed)

```
CMakeLists.txt
looper/engine/LooperProcessor.cpp

looper/primitives/control/ControlServer.h
looper/primitives/control/ControlServer.cpp
looper/primitives/control/OSCServer.h
looper/primitives/control/OSCServer.cpp
looper/primitives/control/OSCQuery.h
looper/primitives/control/OSCQuery.cpp
looper/primitives/control/OSCEndpointRegistry.h
looper/primitives/control/OSCEndpointRegistry.cpp

looper/primitives/scripting/LuaEngine.h
looper/primitives/scripting/LuaEngine.cpp
looper/primitives/scripting/DSPPluginScriptHost.h
looper/primitives/scripting/DSPPluginScriptHost.cpp

looper/dsp/looper_primitives_dsp.lua
```

### Existing files kept as legacy reference during migration

```
looper/engine/LooperProcessor.h
looper/engine/LooperProcessor.cpp
looper/ui/LooperEditor.h
looper/ui/LooperEditor.cpp
```

End of plan.
