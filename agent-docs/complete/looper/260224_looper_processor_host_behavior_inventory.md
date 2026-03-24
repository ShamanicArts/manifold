# LooperProcessor Host vs Behavior Inventory

## Purpose

Create a complete migration inventory so we can move looper policy out of the monolith processor while preserving the host-runtime responsibilities that correctly belong in C++.

This document is the execution checklist for the next migration stage.

## Flagship Goal

The looper should be a flagship example of two things at once:

1. How to build DSP behavior as composable graph primitives.
2. How to author and mutate behavior from scripting (Lua) without compromising real-time safety.

That requires a strict boundary:

- C++ host runtime: lifecycle, endpoint plumbing, graph swap safety, projection.
- Looper behavior policy: record/commit/forward/mode/quantization/layer semantics in Lua + isolated primitives.

## Current Baseline (Observed)

Primary files:

- `looper/engine/LooperProcessor.h`
- `looper/engine/LooperProcessor.cpp`
- `looper/engine/LooperLayer.h`

`LooperProcessor` currently mixes:

- host/runtime concerns (correct to keep in C++), and
- looper behavior policy (target to migrate).

## Ownership Matrix

Legend:

- `KEEP` = remains in host/runtime C++.
- `MIGRATE` = move to Lua behavior script + primitive calls.
- `SPLIT` = currently mixed; split into separate host and behavior pieces.

### Constructor / Lifecycle

| Area | Location | Ownership | Notes |
|---|---|---|---|
| Bus layout + processor construction | `looper/engine/LooperProcessor.cpp:42` | KEEP | Plugin host identity and channel topology are runtime concerns. |
| Script host initialization | `looper/engine/LooperProcessor.cpp:49` | KEEP | Runtime service initialization. |
| Server shutdown in destructor | `looper/engine/LooperProcessor.cpp:52` | KEEP | Resource lifecycle. |
| `prepareToPlay` framework setup | `looper/engine/LooperProcessor.cpp:58` | SPLIT | Keep runtime setup; move looper-specific defaults and behavior setup out. |
| `releaseResources` service shutdown | `looper/engine/LooperProcessor.cpp:141` | KEEP | Runtime lifecycle. |

### Audio Callback and Runtime

| Area | Location | Ownership | Notes |
|---|---|---|---|
| `processBlock` top-level orchestration | `looper/engine/LooperProcessor.cpp:147` | SPLIT | Keep callback orchestration; migrate looper policy/mix path. |
| Capture injection routing from control server | `looper/engine/LooperProcessor.cpp:162` | KEEP | Host/runtime command integration. |
| FFT/spectrum analysis pipeline | `looper/engine/LooperProcessor.cpp:174`, `1025` | KEEP | Generic diagnostics/visualization service. |
| Legacy layer mixing path (`layers[]` loop) | `looper/engine/LooperProcessor.cpp:192` | MIGRATE | Replace with scripted primitive composition as source of behavior. |
| Dry/wet summing policy | `looper/engine/LooperProcessor.cpp:205` | SPLIT | Keep host gain staging hooks; move looper-specific wet path ownership to script behavior. |
| Graph runtime processing + crossfade | `looper/engine/LooperProcessor.cpp:1193` | KEEP | Core RT-safe runtime engine. |

### Looper Behavior Policy (Monolith)

| Area | Location | Ownership | Notes |
|---|---|---|---|
| Record start/stop entry points | `looper/engine/LooperProcessor.cpp:243`, `270` | MIGRATE | Should become behavior-script commands over primitives. |
| Overdub toggling policy | `looper/engine/LooperProcessor.cpp:259`, `261` | MIGRATE | Behavior policy belongs in script layer. |
| Mode-specific stop handlers | `looper/engine/LooperProcessor.cpp:327`, `360`, `382` | MIGRATE | Core looper semantics; should not remain in monolith. |
| Commit/forward logic | `looper/engine/LooperProcessor.cpp:298`, `308`, `396`, `426` | MIGRATE | Move to scripted behavior policy. |
| Tempo inference coupling | `looper/engine/LooperProcessor.cpp:331` | MIGRATE | Product behavior decision; can call primitive helper from script path. |
| Quantization policy calls | `looper/engine/LooperProcessor.cpp:362`, `387` | MIGRATE | Keep quantizer primitive, move policy to behavior script. |
| Overdub gating rule | `looper/engine/LooperProcessor.cpp:448` | MIGRATE | Layer behavior policy. |
| Host transport layer-sync policy | `looper/engine/LooperProcessor.cpp:500` | SPLIT | Keep host transport read; move layer policy consumption. |

### Endpoint Plumbing and Path API

| Area | Location | Ownership | Notes |
|---|---|---|---|
| `setParamByPath` command ingress | `looper/engine/LooperProcessor.cpp:607` | KEEP | Keep as host runtime entrypoint. |
| Script param delegation (`dspScriptHost->hasParam`) | `looper/engine/LooperProcessor.cpp:615` | KEEP | Correct ownership. |
| Endpoint resolver bridge | `looper/engine/LooperProcessor.cpp:624` | KEEP | Generic endpoint command bridge. |
| `getParamByPath` looper path mapping | `looper/engine/LooperProcessor.cpp:634` | SPLIT | Keep generic query path; move looper value projection sources to scripted behavior where possible. |
| `hasEndpoint` path checks | `looper/engine/LooperProcessor.cpp:709` | KEEP | Runtime registry logic. |

### Control Command Switch

| Area | Location | Ownership | Notes |
|---|---|---|---|
| `processControlCommands` switch dispatcher | `looper/engine/LooperProcessor.cpp:805` | SPLIT | Keep queue draining + dispatch shell; move looper behavior branch handlers out. |
| Global transport layer loops | `looper/engine/LooperProcessor.cpp:843` | MIGRATE | Behavior policy. |
| Layer command direct mutations | `looper/engine/LooperProcessor.cpp:862` | MIGRATE | Should route to scripted behavior endpoints/primitives. |
| Record mode state set | `looper/engine/LooperProcessor.cpp:923` | MIGRATE | Behavior policy owner should hold mode semantics. |

### State Projection and Visualization

| Area | Location | Ownership | Notes |
|---|---|---|---|
| Atomic snapshot publishing | `looper/engine/LooperProcessor.cpp:961` | KEEP | Runtime service for observers/UI/OSCQuery. |
| Layer snapshot extraction | `looper/engine/LooperProcessor.cpp:1069` | SPLIT | Keep API; source of truth should migrate to behavior/runtime graph where needed. |
| Peak extraction helpers | `looper/engine/LooperProcessor.cpp:1086`, `1133` | KEEP | Generic visualization utility; input source may evolve. |
| Pending UI switch queue | `looper/engine/LooperProcessor.cpp:949` | KEEP | UI runtime utility. |

## LooperLayer Inventory

`looper/engine/LooperLayer.h` currently embeds behavior + DSP state:

- playback state machine (`State` enum + `play/pause/stop/mute/...`)
- loop buffer read/mix/crossfade behavior
- capture copy/overdub behaviors

Migration intent:

- treat this as legacy behavior monolith,
- move equivalent semantics to primitives (`LoopPlaybackNode`, `PlaybackStateGateNode`, `RetrospectiveCaptureNode`, etc.) and scripted composition,
- retain only minimal compatibility shim paths until cutover is stable.

## Endpoint Strategy (Confirmed)

Canonical behavior endpoints should be defined in Lua behavior script via `ctx.params.register` with the same product-facing paths (`/looper/*`).

Guideline:

1. Define `/looper/*` directly in script behavior where feasible.
2. Keep C++ remap/alias logic only as temporary migration scaffolding.
3. Remove aliases once scripted endpoint contract is complete and clients are validated.

## Migration Backlog (Execution Order)

## Stage A - Processor Concern Split (No Behavior Change)

1. Extract host/runtime-only code from `LooperProcessor` into a neutral runtime module (candidate: `PluginRuntimeProcessorCore`).
2. Keep current behavior path wired through the same public interfaces.
3. No policy changes in this stage; only structural separation.

Exit criteria:

- Build unchanged behavior,
- smoke tests pass,
- host/runtime utilities no longer interleaved with policy methods.

## Stage B - Behavior Driver Contract

Define explicit behavior driver interface used by host runtime:

- `onControlCommand(...)`
- `onAudioBlock(...)` or policy tick hooks
- `projectState(...)`
- `registerBehaviorEndpoints(...)`

Initial behavior driver can proxy legacy implementation to preserve parity while wiring.

## Stage C - Move Looper Policy to Script + Primitives

Incrementally migrate these branches from `LooperProcessor.cpp`:

1. transport + layer control policy
2. mode-specific stop behavior
3. commit/forward/traditional semantics
4. quantization/tempo policy decisions

Each migration step keeps endpoint contract stable.

## Stage D - Projection and Legacy Branch Deletion

1. Point `/looper/*` readbacks to scripted behavior-backed state where appropriate.
2. Remove dead legacy branches from `processControlCommands` and monolith policy methods.
3. Keep rollback feature flag for one validation window.

## Stage E - Rename and Identity Cleanup

Once behavior migration is stable:

- rename host-runtime classes/modules away from looper naming,
- keep product-facing plugin/artifact identity as `Looper`.

## Acceptance Gates

Required before deleting legacy looper policy branches:

1. `tools/test-looper-primitives-smoke` passes.
2. `tools/test-ui-shell-smoke` passes.
3. Traditional mode forward/commit/stoprec regressions covered and passing.
4. `looper/ui/looper_ui.lua` parity check passes against scripted behavior.
5. No RT regressions in graph runtime swap/crossfade path.

## Immediate Next Action Items

1. Create a `LooperBehaviorDriver` interface and wire `LooperProcessor` to delegate behavior branches.
2. Move `processControlCommands` looper-policy branch bodies behind that driver.
3. Move `processFirstLoopStop`, `processFreeModeStop`, `processTraditionalStop`, `commitRetrospectiveNow`, and `maybeFireForwardCommit` out of monolith path.
4. Keep endpoint paths unchanged during migration (`/looper/*`) and validate with existing smoke scripts.
