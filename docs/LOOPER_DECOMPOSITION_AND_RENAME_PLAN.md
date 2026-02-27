# Looper Decomposition and Naming Migration Plan

## Purpose

Define a practical roadmap to:

1. Decompose current looper behavior into reusable DSP primitives that can be scripted/composed in Lua.
2. Migrate internal naming from looper-specific terminology toward a framework-oriented structure.

This document is intentionally implementation-focused and should be used as the execution baseline for this track.

Companion inventory:

- `docs/LOOPER_PROCESSOR_HOST_BEHAVIOR_INVENTORY.md` provides a line-item host-vs-behavior split of `LooperProcessor` and is the migration checklist for removing looper policy from monolith processor paths.

## Why This Track Matters

- The runtime graph path is now real-time safe and hot-swappable, but core looper behavior still lives in legacy engine glue.
- Full scriptability requires core looper behavior to exist as composable primitive units.
- The repository and code naming still over-index on `looper/*`, which slows the transition to a generic plugin framework.
- Editor ambitions (visual authoring and round-trip) depend on clean primitive boundaries and generic naming contracts.

## Current Baseline (As of 2026-02-27)

- `LooperProcessor` is still the production behavior owner.
- `GraphRuntime`, `PrimitiveGraph`, and `DSPPluginScriptHost` exist and are integrated.
- DSP scripting demos work and runtime swaps are stable.
- Some primitive wrappers exist (`OscillatorNode`, `FilterNode`, `DistortionNode`, `ReverbNode`, `PlayheadNode`, `PassthroughNode`).
- Looper-core behaviors (record/commit/layer lifecycle/forward commit/mode semantics) are not yet fully primitive-authored.
- Naming is mixed:
  - generic architecture docs exist,
  - internal implementation still has looper-heavy names (`looper/`, `LooperProcessor`, `/looper/*`).

## Non-Negotiable Constraints

1. No regressions in real-time safety.
2. No production behavior loss during migration.
3. Preserve working merge-head JJ workflow and incremental split strategy.
4. Keep external control compatibility while internal renaming is in progress.

## Target End State

- Legacy looper behavior represented as primitive composition.
- A script-defined default looper patch with parity to current behavior.
- Internal codebase naming shifted to framework-centric terms.
- Product-facing identities can still ship as "Looper" where desired.

## Architectural Boundary (Mandatory)

The migration target is a strict split between host-runtime concerns and looper behavior concerns.

### Host Runtime (C++, stays in processor-side runtime)

- JUCE processor lifecycle and audio callback orchestration.
- Endpoint registry plumbing and command ingress/dispatch.
- Atomic state projection and event surfaces.
- DSP script host lifecycle (load/reload/swap) and RT-safe graph runtime execution.

These are plugin-framework responsibilities and should be renamed/moved toward neutral runtime naming.

### Looper Behavior (Lua + isolated primitives)

- Record/stop-record semantics.
- Commit/forward policy.
- Quantization/mode policy.
- Layer behavior policy (play/pause/stop/mute/seek/speed/reverse).

These are product behavior rules and should not remain monolith logic in `LooperProcessor`.

### Primitive Modules (C++, reusable)

- Low-level DSP/state building blocks used by Lua behavior.
- Small, isolated modules with explicit RT contracts.
- No looper-policy orchestration hidden inside host-runtime classes.

## Workstream A: Behavior Decomposition

### A1. Define Primitive Parity Matrix

Create a checklist for all behaviors currently owned by `LooperProcessor`/`LooperLayer`:

- Transport: play, pause, stop
- Capture: rec, stoprec, retrospective capture
- Commit flows: commit N bars, forward-armed commit
- Layer controls: speed, reverse, mute, volume, clear, seek
- Mode semantics: firstLoop, freeMode, traditional, retrospective
- Quantization/tempo interactions
- Diagnostics surfaces required by UI/IPC

Each item needs: expected behavior, timing expectations, endpoint paths, and test oracle.

### A2. Primitive Extraction Strategy

Decompose by behavior clusters, not by "all at once" rewrite.

File/module rule (mandatory for this track):

- Do not keep concrete primitive implementations buried inside generic graph host files.
- Each concrete primitive should live in its own focused files where practical (for example `ReverbNode.h/.cpp`, `FilterNode.h/.cpp`, etc.).
- Graph host/runtime files should remain generic orchestration code operating on node interfaces/contracts.

Recommended extraction order:

1. Layer playback and gain primitives
2. Capture/record primitives
3. Commit and quantization primitives
4. Mode policy primitives
5. Transport policy primitive

For each extracted primitive:

- single focused responsibility
- clear RT contract (`prepare` off-thread, `process` RT-safe)
- atomic parameter update path
- deterministic state query surface for control/UI

### A3. Script Host Exposure

Expose new looper-related primitives through `ctx.primitives` incrementally.

Do not expose unstable primitives without:

- constructor argument validation,
- endpoint integration,
- basic harness coverage.

### A4. Default Scripted Looper Composition

Create a canonical Lua DSP composition that reproduces current looper behavior.

Adopt "shadow mode" first:

- legacy engine remains active default,
- scripted looper can be enabled for parity verification and iterative hardening.

Endpoint contract rule for this phase:

- Prefer defining canonical `/looper/*` endpoints directly in the Lua behavior script (`ctx.params.register`) when possible.
- Keep C++ endpoint alias/remap logic only as a temporary compatibility bridge while behavior migrates.

### A5. Cutover Plan

Only cut default behavior once parity gates pass consistently.

Fallback requirement:

- one switch to return to legacy behavior until parity confidence is sustained.

Final cutover condition:

- Looper policy logic is removed from the monolith processor path and owned by scripted behavior + primitives.

## Workstream B: Naming and Structure Migration

### B1. Naming Intent

Shift internal naming from product-specific to architecture-specific.

Example direction (candidate mapping):

- `LooperProcessor` -> `PluginProcessorCore` (or `RuntimeProcessor`)
- `LooperLayer` -> `LayerVoice` (or `LoopVoice` if still domain-specific)
- `looper/primitives/*` -> `framework/*` (or `core/*`) while preserving module boundaries
- `looper/headless/LooperHeadless.cpp` -> `headless/ProcessorHeadless.cpp` (or equivalent)

Note: external plugin name/artifact can still remain `Looper` during transition.

### B2. Directory Migration Strategy

Do this in explicit compatibility phases:

1. Introduce new directories and move files with compatibility includes.
2. Update include paths and CMake source lists.
3. Remove compatibility shims only after all references are migrated.

Avoid massive single-shot path rewrites.

### B3. Endpoint and Protocol Naming

Current `/looper/*` paths are valid and widely used.

Recommended approach:

- keep `/looper/*` as the canonical product namespace for looper behavior,
- define those endpoints in Lua behavior script where feasible,
- use C++ aliases/remaps only during migration and remove once script-defined contract is stable,
- introduce neutral framework namespaces only for non-product host/runtime surfaces.

## Phased Plan

### Phase 0 - Baseline and Safety Net

- Freeze parity checklist.
- Expand headless integration tests for currently-shipping behavior.
- Record "known good" behavior snapshots.

### Phase 1 - Primitive Extraction Foundations

- Extract first behavior cluster primitives.
- Add harness coverage for each extracted primitive.
- Keep legacy orchestration as source of truth.

### Phase 2 - Script Host Exposure + Naming Prep

- Expose extracted primitives in `DSPPluginScriptHost`.
- Introduce neutral naming aliases for key classes/modules.
- Begin CMake/source-path dual mapping.

### Phase 3 - Scripted Looper Shadow Mode

- Compose scripted looper patch.
- Add A/B execution and parity assertion tooling.
- Iterate until parity matrix passes.

Additional required outcome:

- Move remaining looper policy branches out of `LooperProcessor` and into scripted behavior.

### Phase 4 - Naming Migration Completion

- Move core files to new naming/paths.
- Update docs/tests/harnesses and remove temporary aliases.
- Keep compatibility endpoint aliases where required.

### Phase 5 - Default Cutover

- Make scripted primitive composition default behavior path.
- Keep rollback switch for one release window.
- Close parity and migration checklist.

At this point, processor-side code should be host-runtime-oriented rather than looper-policy-oriented.

## Core Files and Areas Expected to Change

### Engine and Runtime

- `looper/engine/LooperProcessor.h`
- `looper/engine/LooperProcessor.cpp`
- `looper/engine/LooperLayer.h`
- `looper/primitives/scripting/GraphRuntime.h`
- `looper/primitives/scripting/GraphRuntime.cpp`
- `looper/primitives/scripting/PrimitiveGraph.h`
- `looper/primitives/scripting/PrimitiveGraph.cpp`

### Script Host and Lua Integration

- `looper/primitives/scripting/DSPPluginScriptHost.h`
- `looper/primitives/scripting/DSPPluginScriptHost.cpp`
- `looper/primitives/scripting/LuaEngine.h`
- `looper/primitives/scripting/LuaEngine.cpp`
- `looper/dsp/default_dsp.lua`

### Control and Endpoint Surfaces

- `looper/primitives/control/ControlServer.h`
- `looper/primitives/control/ControlServer.cpp`
- `looper/primitives/control/OSCEndpointRegistry.h`
- `looper/primitives/control/OSCEndpointRegistry.cpp`
- `looper/primitives/control/EndpointResolver.h`
- `looper/primitives/control/EndpointResolver.cpp`

### Build and Layout Migration

- `CMakeLists.txt`
- `AGENTS.md`
- docs that reference old paths/namespaces

### Harness and Verification

- `looper/headless/LooperHeadless.cpp`
- `looper/headless/LuaEngineMockHarness.cpp`
- `looper/headless/StateProjectionHarness.cpp`
- existing test scripts under `tools/`

## Risks and Mitigations

1. Behavioral drift during decomposition
   - Mitigation: parity matrix + headless assertions before each cutover step.

2. Breaking external control surfaces
   - Mitigation: alias endpoints and explicit compatibility tests.

3. Naming migration churn causing include/build breakage
   - Mitigation: staged path migration with temporary compatibility shims.

4. Scope explosion
   - Mitigation: split by behavior cluster and maintain strict per-phase acceptance criteria.

## Acceptance Criteria

- All parity matrix items pass on scripted primitive path.
- Real-time safety constraints remain intact (no new RT violations).
- Internal naming no longer requires looper-specific terms for framework-level code.
- External clients still function through stable endpoint compatibility.
- Legacy fallback can be disabled after one stable validation window.

## Open Decisions

1. Final neutral naming scheme (`framework`, `core`, `runtime`, etc.).
2. Timeline for endpoint namespace deprecation (if any).
3. Release policy for fallback toggles and migration flags.
