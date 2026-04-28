# UI Switch Crash Investigation (`UISWITCH` via IPC / OSCQuery)

---

**Document Attribution:**
- **Author:** Agent
- **Document Type:** Agent Documented Investigation Report
- **Date:** 2026-04-29
- **Written For:** investigation of intermittent app crashes when switching UI/projects via IPC and OSCQuery
- **Status:** root cause isolated; no fix implemented in this document

---

## Executive Summary

The reported bug presents as an intermittent crash when switching the UI/project via **IPC** or **OSCQuery**.

After reproducing the issue, tracing the command path, checking kernel crash logs, and inspecting fresh coredumps with `gdb`, the main finding is:

> **This is not an IPC-only bug and not an OSCQuery-only bug.**
> Both control surfaces feed the same `UISWITCH` execution path, and the crash occurs later during **DSP Lua VM retirement / garbage collection** while the newly switched project reloads its DSP script.

### Primary conclusions

1. **The process is not being SIGKILLed.** It is crashing with **`SIGSEGV`**.
2. **IPC and OSCQuery are just two front doors into the same switch path.**
3. The crash is triggered during project/UI switching because structured project loads auto-trigger DSP reload.
4. The immediate crash site is in:
   - `manifold/primitives/scripting/DSPPluginScriptHost.cpp:101`
   - specifically inside `lua_gc(oldState.lua_state(), LUA_GCCOLLECT, 0)`
5. The coredump stack shows Lua/sol2 tearing down a stateful host API closure originating from:
   - `manifold/primitives/scripting/dsp_host/DSPHostScriptBootstrap.cpp:392`
   - the `hostApi["getParam"] = [processor, mapInternalToExternal](...) { ... }` lambda
6. The current `retiredLuaStates` strategy is acting as a temporary crash deferral mechanism, not a real fix. Under repeated `UISWITCH` churn it causes both:
   - large memory growth,
   - then eventual crash when an old retired DSP Lua VM is finally collected.

---

## User-Reported Symptom

The user reported:

- intermittent persistent bug,
- on the UI switch path,
- involving **IPC** and **OSCQuery**,
- sometimes the app "sigkills".

### Correction

The investigation shows the app is **not** being killed by `SIGKILL`.
Kernel logs show repeated **`SIGSEGV`** crashes for `Manifold`, including the fresh crashes reproduced during this investigation.

---

## Investigation Scope

The investigation focused on:

1. reproducing the crash in the live standalone,
2. verifying whether IPC and OSCQuery use different code paths,
3. identifying where `UISWITCH` is queued and executed,
4. checking whether the crash is transport-related,
5. capturing fresh coredump evidence,
6. isolating the actual crash site and likely ownership/lifetime issue.

No code changes were made as part of this report.

---

## Environment and Test Setup

### Runtime process

Standalone binary used:
- `./build-dev/Manifold_artefacts/RelWithDebInfo/Standalone/Manifold`

Long-running process management used:
- tmux session: `Manifold`
- window 1: standalone process
- window 2: builds / auxiliary commands

### Active socket observed during investigation

Examples during the session:
- `/tmp/manifold_2062422.sock`
- `/tmp/manifold_2106102.sock`

---

## Reproduction Summary

### Simple manual reproduction

1. Start standalone.
2. Send `UISWITCH` to a structured project, especially:
   - `UserScripts/projects/Main/manifold.project.json5`
3. Repeat the same `UISWITCH` multiple times.
4. The process eventually crashes.

### Strong reproduction obtained

A repeated `UISWITCH` loop against the same Main project produced a crash reliably after several iterations.

Observed memory growth during the hammer test:

- ~671 MB RSS
- ~1.00 GB RSS
- ~1.36 GB RSS
- ~1.72 GB RSS
- then crash / connection reset / `SIGSEGV`

This matters because it strongly suggests that old DSP Lua states are being retained across switches until a retirement threshold is hit, at which point collection/destruction becomes unsafe.

---

## What Was Verified About IPC vs OSCQuery

A core question was whether the crash was specific to one control surface.

### Finding: both front doors converge into the same `UISWITCH` execution path

#### OSCQuery command entry

`manifold/primitives/control/OSCQuery.cpp:605-618`

```cpp
} else if (path == "/api/command") {
    juce::String body = readRequestBody().trim();
    juce::String upper = body.toUpperCase();
    if (!(upper.startsWith("SET ") || upper.startsWith("TRIGGER ") || upper.startsWith("UISWITCH "))) {
        response = "{\"error\":\"only SET, TRIGGER, and UISWITCH commands are allowed\"}";
    } else {
        const std::string result = owner->getControlServer().runCommand(body.toStdString());
        ...
```

#### IPC command queueing

`manifold/primitives/control/ControlServer.cpp:712-716`

```cpp
case ParseResult::Kind::UISwitch: {
    std::lock_guard<std::mutex> lock(uiSwitchRequest.mutex);
    uiSwitchRequest.path = result.filepath;
    uiSwitchRequest.pending.store(true, std::memory_order_release);
    return "OK UI switch queued";
}
```

#### Processor-side fetch of pending request

`manifold/core/BehaviorCoreProcessor.cpp:3052-3060`

```cpp
std::string BehaviorCoreProcessor::getAndClearPendingUISwitch() {
    auto& req = controlServer.getUISwitchRequest();
    if (!req.pending.load(std::memory_order_acquire)) {
        return {};
    }
    ...
```

#### Editor-side execution

`manifold/core/BehaviorCoreEditor.cpp:1865-1871`

```cpp
auto pendingPath = processorRef.getAndClearPendingUISwitch();
if (!pendingPath.empty()) {
    juce::File newScript(pendingPath);
    if (newScript.existsAsFile()) {
        std::fprintf(stderr, "BehaviorCoreEditor: Switching UI to %s\n",
                     pendingPath.c_str());
        luaEngine.switchScript(newScript);
```

### Conclusion

**IPC and OSCQuery are not the thing that differs.**
They both end up queueing and executing the same `luaEngine.switchScript(...)` path.

So the bug is **shared switch-path lifetime corruption**, not transport-specific parsing or socket behavior.

---

## Why a UI Switch Triggers DSP Reload

For structured projects, the UI bootstrap also triggers DSP script loading.

`manifold/primitives/scripting/LuaEngine.cpp:414-417`

```cpp
if (target.dspDefaultFile.existsAsFile() && !skipDspLoad) {
  code << "if loadDspScript then loadDspScript(\""
       << escapeLuaString(target.dspDefaultFile.getFullPathName()).toStdString()
       << "\") end\n";
}
```

That Lua-side `loadDspScript(...)` eventually calls:

`manifold/core/BehaviorCoreProcessor.cpp:2107-2112`

```cpp
bool BehaviorCoreProcessor::loadDspScript(const juce::File& scriptFile) {
    if (!dspScriptHost) {
        dspScriptLastError = "DSP script host unavailable";
        return false;
    }
    const bool ok = dspScriptHost->loadScript(scriptFile);
```

So a `UISWITCH` into a structured project is not merely changing UI widgets. It is also reloading DSP state through the DSP host.

---

## Immediate Crash Site

The hot zone is in `DSPPluginScriptHost::loadScriptImpl(...)`.

`manifold/primitives/scripting/DSPPluginScriptHost.cpp:92-103`

```cpp
// Retire old Lua state BEFORE creating new one, but DON'T destroy it yet.
// Destroying Lua states with active shared_ptr references causes crashes.
if (impl->lua.lua_state() != nullptr) {
  impl->retiredLuaStates.push_back(std::move(impl->lua));
}
// Limit retired states but destroy them safely
while (impl->retiredLuaStates.size() > 4) {
  sol::state& oldState = impl->retiredLuaStates.front();
  if (oldState.lua_state() != nullptr) {
    lua_gc(oldState.lua_state(), LUA_GCCOLLECT, 0);
  }
  impl->retiredLuaStates.erase(impl->retiredLuaStates.begin());
}
```

### Critical observation

The comments already admit the code is a stability workaround:

- old Lua states are retained,
- actual destruction is delayed,
- collection is attempted later,
- once enough reloads happen, the oldest one is force-collected.

That is exactly where the crash occurs.

---

## Fresh Crash Evidence

Fresh reproductions during this investigation produced new kernel entries and coredumps.

### Kernel log evidence

Fresh crashes included entries like:

- `Apr 29 00:17:18 ... Manifold[2024373]: segfault ...`
- `Apr 29 00:24:07 ... Manifold[2062422]: segfault ...`

This confirms:

- **signal = `SIGSEGV`**,
- not `SIGKILL`,
- not OOM kill,
- not watchdog termination.

### Shell-visible result in tmux

The standalone pane showed:

- `fish: Job 1 ... terminated by signal SIGSEGV (Address boundary error)`

So the apparent “sigkill” symptom was just a misleading human description of a segmentation crash.

---

## Coredump Findings

Two fresh coredumps were especially useful:

- PID `2024373`
- PID `2062422`

Both point to the same failure pattern:

1. `LuaEngine::switchScript(...)`
2. structured project bootstrap runs `loadDspScript(...)`
3. `DSPPluginScriptHost::loadScriptImpl(...)`
4. old DSP Lua state retirement threshold exceeded
5. `lua_gc(...)` on old retired state
6. crash during Lua/sol2 teardown of captured functor userdata

### Representative coredump stack

The coredump for PID `2024373` showed:

- `LuaEngine::switchScript`
- `LuaEngine::notifyUpdate`
- `BehaviorCoreEditor::timerCallback`
- `BehaviorCoreProcessor::loadDspScript`
- `DSPPluginScriptHost::loadScriptImpl`
- `lua_gc`

A more detailed `gdb` backtrace resolved the actual teardown path to a sol2 functor destruction path.

### Most important `gdb` resolution

The frame chain resolved to:

- `DSPPluginScriptHost::loadScriptImpl` at `DSPPluginScriptHost.cpp:101`
- `lua_gc(oldState.lua_state(), LUA_GCCOLLECT, 0)`
- destruction of a stateful sol2 functor
- destructor of a lambda in:
  - `manifold/primitives/scripting/dsp_host/DSPHostScriptBootstrap.cpp:392`

That lambda is:

`manifold/primitives/scripting/dsp_host/DSPHostScriptBootstrap.cpp:392-397`

```cpp
hostApi["getParam"] = [processor, mapInternalToExternal](const std::string &path) {
  if (!processor) {
    return 0.0f;
  }
  const std::string externalPath = mapInternalToExternal(path);
  return processor->getParamByPath(externalPath);
};
```

The adjacent `setParam` closure is defined at `384-390` and has the same capture pattern.

### Interpretation

This is not random. The old retired DSP Lua VM contains stateful host API closures with captured C++ callable objects. When the old VM is finally collected, sol2/Lua tears those down, and that destruction path is unsafe under the current ownership/lifetime model.

---

## Root Cause Hypothesis

### Best-fit hypothesis

**The crash is caused by unsafe destruction / garbage collection of retired DSP Lua states during repeated UI/DSP reload churn.**

More specifically:

1. Every structured `UISWITCH` to a project like `Main` triggers DSP reload.
2. `DSPPluginScriptHost` moves the previous DSP Lua VM into `retiredLuaStates`.
3. After enough switches, the oldest retired VM is force-collected.
4. During `lua_gc(...)`, Lua/sol2 destroys userdata / stateful functors created for the DSP host API.
5. Those functors capture C++ state (`processor`, `mapInternalToExternal`, etc.).
6. Teardown of that retained state is not safe anymore, resulting in UB and `SIGSEGV`.

### Why the crash is intermittent

It depends on reload churn and retirement pressure.

The crash does **not** necessarily happen on the first switch. It tends to happen after enough repeated switches to exceed the retained-state threshold.

That matches the user report perfectly: **persistent but intermittent**.

---

## Why This Is Not Primarily an OSCQuery Server Bug

The report started from “IPC & OSCQuery UI switch sometimes kills the app”, so this needed to be ruled in or out properly.

### What was checked

- OSCQuery `/info` and value endpoints responded normally.
- OSCQuery `/api/command` successfully queued `UISWITCH`.
- After switching to `Main`, the OSCQuery tree expanded dramatically and remained functional.

Example observation:

- before Main switch: OSCQuery tree had only a small baseline set of paths,
- after Main switch: OSCQuery tree expanded to **13,069** paths.

That shows:

- OSCQuery itself remained operational,
- the project switch succeeded far enough to rebuild the runtime surface,
- the crash happens deeper in the reload lifecycle.

### Conclusion

OSCQuery is only implicated because it can issue the same command.
The crash is not in HTTP parsing, WebSocket handling, or OSCQuery tree serving.

---

## Memory Behavior Observed During Reproduction

The repeated-switch test showed strong RSS growth before the crash:

- ~671 MB
- ~1.00 GB
- ~1.36 GB
- ~1.72 GB

This is consistent with the implementation keeping retired DSP Lua states alive.

### Implication

The `retiredLuaStates` queue is doing what it was intended to do in the short term:

- avoid immediate destruction of the current DSP Lua VM,
- postpone teardown.

But under repeated switching it also:

- retains a lot of memory,
- then forces risky collection of an old VM,
- which is where the process blows up.

---

## Prior Internal Documentation That Already Pointed at This

This investigation aligns with an existing warning in:

- `agent-docs/active/analysis/260325_duda_review.md`

That document explicitly calls out:

- `retiredLuaStates` as a band-aid,
- Lua VM destruction crashes,
- ownership problems between Lua userdata and C++ state.

So this bug is not a brand-new class of issue. This report provides concrete reproduction and fresh coredump proof that the failure is still real and reachable from `UISWITCH`.

---

## Things Ruled Out

### 1. Not SIGKILL

Ruled out by kernel logs and coredumps.

### 2. Not OOM killer behavior

No kernel OOM kill evidence was found in the crash path examined here.
The crashes are segmentation faults.

### 3. Not transport-specific parsing

Both IPC and OSCQuery converge into the same switch path.

### 4. Not a missing-file / bad-path failure

The crashing reproduction used valid structured project paths, and logs showed successful script and DSP load attempts before failure.

### 5. Not primarily an OSCQuery tree rebuild bug

OSCQuery tree rebuilds did occur, but the coredump points into DSP Lua VM GC, not OSCQuery serving code.

---

## Recommended Next Steps

### Tactical containment fix

The most practical short-term containment move is:

1. **Stop force-collecting retired DSP Lua states during live reload churn**
   - specifically stop calling `lua_gc(oldState.lua_state(), LUA_GCCOLLECT, 0)` in `DSPPluginScriptHost::loadScriptImpl(...)`
2. Consider also avoiding `erase()`-driven destruction of retired states during live switching.
3. Accept temporary retained-memory growth during a session if necessary, but avoid crashing the app.

This would be a tactical stabilization move, not a proper architectural fix.

### Proper fix direction

The real fix likely requires cleaning up the DSP Lua ownership model:

- avoid unsafe userdata teardown paths,
- stop relying on sol2 stateful closures with fragile captures during VM destruction,
- reduce or eliminate strong references from Lua-held objects into graph/runtime state,
- possibly use weaker handles or explicit invalidation/nulling before retirement.

### Regression test that should be added

A dedicated regression harness should repeatedly do:

1. launch standalone/editor-enabled harness,
2. `UISWITCH UserScripts/projects/Main/manifold.project.json5`,
3. wait for switch completion,
4. repeat 8-10 times,
5. assert process survives.

That test should be run through the same path regardless of whether the command comes from IPC or OSCQuery, since the important thing is the shared reload path.

---

## Key File References

### Command ingress and switch execution

- `manifold/primitives/control/OSCQuery.cpp:605-618`
- `manifold/primitives/control/ControlServer.cpp:712-716`
- `manifold/core/BehaviorCoreProcessor.cpp:3052-3060`
- `manifold/core/BehaviorCoreEditor.cpp:1865-1871`

### Structured project DSP auto-load

- `manifold/primitives/scripting/LuaEngine.cpp:414-417`
- `manifold/core/BehaviorCoreProcessor.cpp:2107-2112`

### Crash site / retirement logic

- `manifold/primitives/scripting/DSPPluginScriptHost.cpp:92-103`

### Captured host API closures implicated by coredump

- `manifold/primitives/scripting/dsp_host/DSPHostScriptBootstrap.cpp:384-397`

### Prior warning doc

- `agent-docs/active/analysis/260325_duda_review.md`

---

## Final Conclusion

The intermittent UI switch crash reported through IPC and OSCQuery is a **real, reproducible, shared switch-path crash**.

It is **not** caused by one specific transport.
It is **not** `SIGKILL`.
It is a **`SIGSEGV` during DSP Lua VM retirement / garbage collection** triggered by structured project switching.

The strongest root-cause statement supported by the evidence is:

> Repeated `UISWITCH` operations eventually force garbage collection of a retired DSP Lua VM, and teardown of sol2-managed stateful host API closures in that old VM is unsafe under the current ownership/lifetime model, causing `SIGSEGV`.

That is the result of this investigation.

---

**Report Generated By:** Agent  
**Completion Date:** 2026-04-29
