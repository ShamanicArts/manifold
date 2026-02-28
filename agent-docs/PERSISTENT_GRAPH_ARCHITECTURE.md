# Persistent Graph Architecture (Current Implementation)

## Status: Implemented baseline + explicit cleanup backlog

_Last updated: 2026-03-01_

This document describes the **actual** architecture currently running in `BehaviorCoreProcessor`, not the earlier target-only design notes.

---

## 1) Core model in production today

`LooperPrimitives` uses a **single processor-owned `PrimitiveGraph`** and compiles immutable `GraphRuntime` snapshots from that graph.

### Processor ownership

```text
BehaviorCoreProcessor
  ├── primitiveGraph (shared_ptr<PrimitiveGraph>)          [persistent]
  ├── dspScriptHost                                        [default slot, /core/behavior]
  ├── dspSlots[slotName] -> DSPPluginScriptHost            [named slots, /core/slots/<slot>]
  ├── activeRuntime (audio thread pointer)
  ├── pendingRuntime (atomic handoff)
  └── retireQueue (deferred delete off audio thread)
```

### Important consequence

- Runtime snapshots are replaced.
- Node objects in `primitiveGraph` are shared and can survive recompiles.
- Loop/state persistence depends on whether a slot removes/replaces its owned nodes.

---

## 2) Runtime swap behavior (what actually happens)

`requestGraphRuntimeSwap()` publishes a compiled runtime pointer through `pendingRuntime`.

`checkGraphRuntimeSwap()` (audio thread):
1. Promotes `pendingRuntime` to `activeRuntime` immediately.
2. Pushes old runtime to retire queue for safe deferred deletion.

### Current behavior note

- **No crossfade path** is currently used in `BehaviorCoreProcessor` runtime swaps.
- Swap is immediate pointer promotion.

---

## 3) Script host lifecycle (slot-based)

Each `DSPPluginScriptHost` owns a script slot (`default` or named slot).

### Load flow (`DSPPluginScriptHost::loadScriptImpl`)

1. Obtain processor persistent graph (`getPrimitiveGraph()`).
2. Unregister previously owned nodes for this slot.
3. Execute `buildPlugin(ctx)` in a fresh Lua state.
4. Register new nodes into the shared graph (`trackNode`).
5. Compile runtime from the **full** graph.
6. Publish runtime swap.
7. Refresh endpoint/OSCQuery metadata and activate new slot Lua state.

### Cleanup behavior in current code

- Slot replacement uses **owned-node unregister** (not global graph clear).
- There is currently **no DSP `onUnload` callback contract** in the host.
- `unloadDspSlot(slot)` does **not destroy** slot hosts; it loads an empty script to remove nodes.
  - Rationale: avoid Lua VM teardown crashes during transitions.

---

## 4) UI switch + slot persistence policy

`LuaEngine::switchScript()` currently does:

1. Call outgoing UI `ui_cleanup()` if present.
2. Apply DSP slot lifecycle policy:
   - managed named slots are unloaded on UI switch,
   - except slots explicitly marked persistent.
3. Clear current UI canvas.
4. Clear non-persistent Lua callbacks/listeners.
5. Clear custom endpoints/custom OSC values and rebuild OSCQuery tree.
6. Load new UI script in the same Lua VM.

### Slot policy API exposed to Lua

- `setDspSlotPersistOnUiSwitch(slot, bool)`
- `isDspSlotPersistOnUiSwitch(slot)`

Default slot (`default`) is not managed by this policy.

### Current script behavior examples

- `looper_donut_demo_ui.lua`
  - pins `donut` slot persistent.
- `dsp_live_scripting.lua`
  - marks `live_editor` transient and unloads on cleanup.

---

## 5) Audio/input routing semantics (current)

`BehaviorCoreProcessor::processBlock()` now has two host-input planes:

1. **Monitor-controlled host input**
   - scaled by shared input contract (`passthrough * inputVolume * 0.7`).
   - fed to graph wet path (`graphWetBuffer`) and dry output mix.

2. **Raw host input**
   - original incoming block passed to runtime for nodes that explicitly request raw capture semantics.

### Node-level input opt-in

`GraphRuntime` supports unconnected host-input injection only for nodes that opt in:

- `acceptsHostInputWhenUnconnected()`
- `wantsRawHostInputWhenUnconnected()`

`PassthroughNode` supports:
- `MonitorControlled`
- `RawCapture`

`LoopLayer` bundle input node is created as `RawCapture` so capture-plane behavior can use raw input while monitor path remains globally controlled.

---

## 6) Donut persistence vs donut input-FX non-persistence

Current donut implementation separates loop persistence from live-input FX persistence:

- Donut slot is pinned persistent (`setDspSlotPersistOnUiSwitch("donut", true)`).
- Donut DSP script adds `/core/slots/donut/input/monitor` (via slot namespace mapping).
- UI enables this monitor while donut UI is active.
- `ui_cleanup()` disables monitor, so donut input FX route does not leak into other UIs.

This keeps donut loop content alive while preventing unintended persistent mic FX routing.

---

## 7) Endpoint namespace model in current runtime

- Canonical behavior family: `/core/behavior/*`
- Compatibility aliases: `/looper/*`, `/dsp/looper/*` (for migration parity)
- Named slot family: `/core/slots/<slot>/*`

`DSPPluginScriptHost` maps internal behavior paths to slot namespace when a named slot is used.

---

## 8) Known gaps / cleanup items

These are real, current-state items (not hypothetical):

1. `graph enabled` endpoint still exists as a compatibility/debug surface (`/core/behavior/graph/enabled` + aliases). In BehaviorCore product path, graph should be treated as always-on.
2. Script-side graph mutation helpers still include broad operations (e.g. `graph.clear`). This can violate persistence policy if used incorrectly.
3. Runtime swap currently has no crossfade in `BehaviorCoreProcessor`.
4. Slot hosts are intentionally retained; lifecycle/memory profile should be reviewed after stabilization.
5. Slot persistence policy is processor-level managed-slot tracking; if stricter per-UI ownership is desired, add explicit ownership metadata.
6. `onUnload`-style scripted lifecycle hook is not implemented in DSP host.

---

## 9) Invariants to preserve

1. No Lua execution in audio thread.
2. No locks/alloc/logging/string work in audio hot path.
3. Graph recompilation occurs off audio thread; audio thread only swaps immutable runtime pointers.
4. Persistent slot content must never be removed implicitly.
5. Input monitor policy must remain explicit and testable per slot.

---

## References

- `looper_primitives/BehaviorCoreProcessor.cpp`
- `looper/primitives/scripting/DSPPluginScriptHost.cpp`
- `looper/primitives/scripting/GraphRuntime.h/.cpp`
- `dsp/core/graph/PrimitiveNode.h`
- `dsp/core/nodes/PassthroughNode.h/.cpp`
- `looper/primitives/scripting/LuaEngine.cpp`
- `looper/ui/looper_donut_demo_ui.lua`
- `looper/dsp/looper_donut_demo_dsp.lua`
- `looper/ui/dsp_live_scripting.lua`
