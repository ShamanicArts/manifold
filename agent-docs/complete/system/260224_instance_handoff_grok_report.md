# Manifold Project Handoff (Code-Backed, No Speculation)

Generated: 2026-03-04  
Repo: `/home/shamanic/dev/my-plugin`

This document is a **factual handoff** of what is present in code and what was directly observed in this session.

---

## 0) Verification Legend

- **[CODE]** read directly from source files.
- **[RUNTIME]** observed from tmux/log output in this session.
- **[NOT VERIFIED]** not exercised end-to-end in this session.

---

## 1) What this repo builds [CODE]

From `CMakeLists.txt`:

### Plugin targets
- `Manifold` (Standalone + VST3)
- `GrainFreeze` (Standalone + VST3)
- `Tempus` (Standalone + VST3 test plugin)

### Headless/harness targets
- `ManifoldHeadless`
- `LuaEngineMockHarness`
- `EndpointResolverHarness`
- `ControlCommandQueueHarness`
- `CanonicalCommandHarness`
- `StateProjectionHarness`

### Script copy behavior
Post-build copies `manifold/ui/*` into Manifold output dirs.

---

## 2) Main runtime architecture (actual code paths)

## 2.1 Processor + editor

### `BehaviorCoreProcessor` [CODE]
File: `manifold/core/BehaviorCoreProcessor.cpp`

Key responsibilities:
- Audio callback: `processBlock(...)`
- Control queue drain: `processControlCommands()`
- Runtime swap: `checkGraphRuntimeSwap()`
- Parameter path writes: `setParamByPath(...)` / `applyParamPath(...)`
- Link integration in audio callback: `linkSync.processAudio(...)`
- Atomic state projection updates via `controlServer.getAtomicState()`

### `BehaviorCoreEditor` [CODE]
File: `manifold/core/BehaviorCoreEditor.cpp`

Key responsibilities:
- Owns `LuaEngine luaEngine` and `Canvas rootCanvas`
- Loads UI script from `Settings::getDefaultUiScript()`
- 30Hz timer:
  - checks pending UI switch
  - calls `processorRef.processLinkPendingRequests()`
  - calls `luaEngine.notifyUpdate()`

---

## 2.2 Threading surfaces (as implemented)

### Audio thread [CODE]
- `BehaviorCoreProcessor::processBlock(...)`
- No lock use in hot path for control-state exchange (atomics + queues)

### Control/network threads [CODE]
- `ControlServer`: accept thread + broadcast thread
- `OSCServer`: UDP receive thread + state-diff broadcast thread
- `OSCQueryServer`: HTTP thread + WS broadcast thread + per-client read threads

### Message thread [CODE]
- `BehaviorCoreEditor` timer and Lua UI callbacks

---

## 3) Control plane implementation

## 3.1 Canonical command parsing

### Parser source [CODE]
- `manifold/primitives/control/CommandParser.h`

Canonical grammar present:
- `SET /path value`
- `GET /path`
- `TRIGGER /path`

Legacy verb behavior in parser:
- `isDeprecatedLegacyVerb(...)` marks legacy verbs
- `makeLegacyRemovedError(...)` returns parse error with code `W_PATH_DEPRECATED`

### Harness expectations [CODE]
File: `manifold/headless/CanonicalCommandHarness.cpp`
- Verifies canonical parse/enqueue behavior
- Verifies legacy verbs now rejected with deprecation code

---

## 3.2 Endpoint metadata and coercion

### Endpoint registry [CODE]
- `manifold/primitives/control/OSCEndpointRegistry.cpp`
- Canonical endpoint namespace built under `/core/behavior/*`
- Includes global, per-layer, query, link endpoints

### Resolver [CODE]
- `manifold/primitives/control/EndpointResolver.cpp`
- Performs type coercion + range clamp + access checks
- Coercion categories: exact/lossless/lossy/impossible

### Resolver harness [CODE]
- `manifold/headless/EndpointResolverHarness.cpp`
- Validates range/typing/read-write behavior

---

## 3.3 IPC server

### `ControlServer` [CODE]
Files:
- `manifold/primitives/control/ControlServer.h`
- `manifold/primitives/control/ControlServer.cpp`

Implemented:
- Unix socket `/tmp/manifold_<pid>.sock` on non-Windows
- `WATCH` support with event broadcast
- `STATE`, `PING`, `DIAGNOSE/DIAGNOSTICS`, `GET` queries
- `INJECT <file>` and `INJECTION_STATUS`
- `UISWITCH <file>` queueing

Queues/rings:
- command queue: `SPSCQueue<...COMMAND_QUEUE_SIZE...>`
- event ring: `EventRing<...EVENT_QUEUE_SIZE...>`

---

## 3.4 OSC + OSCQuery

### OSC server [CODE]
Files:
- `manifold/primitives/control/OSCServer.h/.cpp`

Implemented:
- UDP receive + endpoint-resolved dispatch
- Lua message callback override path
- Outgoing target broadcast (`host:port` list)
- state-diff broadcast from atomic state cache

### OSCQuery server [CODE]
Files:
- `manifold/primitives/control/OSCQuery.h/.cpp`

Implemented:
- HTTP JSON tree and value queries
- `/info`, `/osc/...`, target API, host info
- WebSocket LISTEN/IGNORE and per-path diff broadcast

---

## 4) DSP scripting runtime

### Host and graph

#### DSP host [CODE]
File: `manifold/primitives/scripting/DSPPluginScriptHost.cpp`

Provides Lua DSP API contract:
- Requires Lua function: `buildPlugin(ctx)`
- Context tables include:
  - `ctx.primitives`
  - `ctx.bundles` (includes `LoopLayer` bundle factory)
  - `ctx.graph` (`connect`, `clear`, etc.)
  - `ctx.params` (`register`, `bind`)
  - `ctx.host` (`setParam`, `getParam`, etc.)

Load flow:
1. unregister previous slot-owned nodes from persistent graph
2. execute script
3. call `buildPlugin(ctx)`
4. compile runtime via graph
5. `requestGraphRuntimeSwap(...)`
6. refresh custom endpoint registrations

#### Graph builder/executor [CODE]
Files:
- `manifold/primitives/scripting/PrimitiveGraph.cpp`
- `manifold/primitives/scripting/GraphRuntime.cpp`
- `dsp/core/graph/PrimitiveNode.h`

Implemented behavior:
- Topological order build, cycle checks in builder
- Runtime snapshot of node list + routes
- Preallocated scratch buffers in `GraphRuntime::prepare(...)`
- Process supports chunking when block > max block size
- Optional unconnected host-input feed depends on node flags:
  - `acceptsHostInputWhenUnconnected()`
  - `wantsRawHostInputWhenUnconnected()`

---

## 5) UI scripting runtime

### Lua engine

#### Core VM lifecycle [CODE]
- `manifold/primitives/scripting/core/LuaCoreEngine.*`

#### UI/control bindings split [CODE]
- `LuaUIBindings.*`
- `LuaControlBindings.*`

#### Runtime facade [CODE]
- `manifold/primitives/scripting/LuaEngine.cpp`

Expected UI script lifecycle functions used by engine:
- `ui_init(root)`
- `ui_update(state)`
- `ui_resized(w,h)`
- optional `ui_cleanup()` on switch

Switch behavior in engine:
- calls outgoing `ui_cleanup()` if present
- clears/rebuilds UI root
- cleans non-persistent callbacks/handlers
- applies DSP slot persistence policy

---

## 6) Default UI + shell structure

### Default UI script [CODE]
- `manifold/ui/looper_ui.lua`
- Uses canonical paths (`/core/behavior/...`)
- Builds transport/capture/layer panels with widgets
- Implements per-layer waveform scrub behavior

### Widget module [CODE]
- `manifold/ui/ui_widgets.lua`
- delegates to `manifold/ui/widgets/*`

### Shell system [CODE]
- `manifold/ui/ui_shell.lua`
- `manifold/ui/shell/*`

The shell modules include editor and inspection functionality (mode switching, hierarchy, inspector, script/runtime views).

---

## 7) State serialization status

### Interface layer [CODE]
- `IStateSerializer.h`
- `ScriptableProcessor` inherits serializer interface

### BehaviorCore implementation [CODE]
In `BehaviorCoreProcessor.cpp`:
- `serializeStateToLua(...)` implemented with rich state table
- **TODO stubs still present**:
  - `serializeStateToJson()` returns `{}`
  - `getStateSchema()` returns empty
  - `getValueAtPath()` returns empty
  - change-tracking/subscription methods TODO

### Current JSON state path in use [CODE]
- `ControlServer::buildStateJson()` is the implemented source for IPC/OSCQuery state JSON in current runtime.

---

## 8) Settings/persistence files

### General settings [CODE]
- `manifold/primitives/core/Settings.*`
- Supports repo-local `.manifold.settings.json` when repo root is detected

### OSC settings persistence [CODE]
- `manifold/primitives/control/OSCSettingsPersistence.*`
- Reads/writes user app data `Manifold/settings.json`

---

## 9) Ableton Link integration

### Link adapter [CODE]
- `manifold/primitives/sync/LinkSync.*`

Used in BehaviorCore:
- initialized in `prepareToPlay`
- polled in `processBlock`
- exposes link endpoints under `/core/behavior/link/*`

---

## 10) Headless test assets and purpose [CODE]

- `CanonicalCommandHarness`: parser canonical/legacy behavior checks
- `EndpointResolverHarness`: resolver typing/range/access checks
- `ControlCommandQueueHarness`: SPSC queue integrity under burst
- `StateProjectionHarness`: JSON state projection shape/value checks (against `ControlServer` output)
- `LuaEngineMockHarness`: Lua engine + bindings smoke/behavior checks
- `ManifoldHeadless`: standalone processor loop for CLI/runtime testing

---

## 11) Runtime observations captured this session [RUNTIME]

From `tmux` session `Manifold`:
- Standalone logs showed `DSPPluginScriptHost` compile summary and script load
- `LuaEngine` init and binding registration logs printed
- UI switched from `looper_ui.lua` to `donut_looper_super_ui.lua`

Build pane observations:
- Harness/headless target build was started
- Warnings seen (mainly sign-conversion and float-equal classes)
- Full terminal completion summary was not captured before handoff request

---

## 12) What is explicitly unverified in this pass

- **[NOT VERIFIED]** Full pass/fail execution of all harness binaries after build
- **[NOT VERIFIED]** End-to-end OSCQuery WS LISTEN behavior against live client
- **[NOT VERIFIED]** Audio artifact behavior on repeated runtime swaps

---

## 13) Entry points for a new instance

Read first:
1. `AGENTS.md`
2. `CMakeLists.txt`
3. `manifold/core/BehaviorCoreProcessor.cpp`
4. `manifold/primitives/control/CommandParser.h`
5. `manifold/primitives/scripting/DSPPluginScriptHost.cpp`
6. `manifold/primitives/scripting/LuaEngine.cpp`



