# IPC Eval & Testing Infrastructure Additions

## Context

The frame timing instrumentation and e2e test (previous spec) are working. We now need to test the UI under different shell modes (performance vs edit), but there's no IPC command to toggle shell mode or execute arbitrary Lua. We also can't reset frame timing peaks between test runs.

This spec adds three IPC commands that close these gaps.

---

## Deliverable 1: EVAL command

### What

An IPC command `EVAL <lua code>` that executes arbitrary Lua on the message thread and returns the result.

### Why

The UI shell, editor mode, widget state, and all Lua-side functionality are only accessible from within the Lua VM. Without `EVAL`, we can't programmatically toggle shell modes, inspect widget state, or drive UI interactions from tests. `DSPRUN` already exists as precedent for IPC→Lua execution (for DSP scripts). This is the UI equivalent.

### Protocol

```
Client sends:  EVAL <lua code>\n
Server responds: OK <result>\n   or   ERROR <message>\n
```

The `<lua code>` is everything after `EVAL ` on the line. It may contain escaped newlines (`\n` literal two-char sequence) which must be replaced with actual newlines before execution, matching the existing `DSPRUN` pattern.

The `<result>` is the string representation of the return value. If the Lua code returns nil or nothing, result is empty. If it returns a string or number, that value is returned as a string. If it returns a table, return `"[table]"` (not full serialization — keep it simple). If execution errors, return `ERROR <error message>`.

### Threading constraint

The IPC server runs on its own thread. Lua execution must happen on the message thread (same thread as `notifyUpdate`). Therefore:

1. `ControlServer::processCommand()` receives the EVAL, stores the code string in a pending queue.
2. `LuaEngine::notifyUpdate()` drains the queue at the start of each frame, executes each pending eval, and stores the result.
3. The IPC thread waits (with timeout) for the result to be available before responding.

### Implementation approach

Use the same deferred-execution pattern as `pendingSwitchPath`, but with a queue since multiple EVALs could arrive between frames.

**In LuaEngine (or its Impl struct):**
- Add a thread-safe queue of pending eval requests. Each request is a struct containing: the Lua code string, an atomic flag for completion, and a string for the result.
- The queue is protected by a mutex (IPC thread writes, message thread reads).
- In `notifyUpdate()`, before the existing `pushStateToLua()` call, drain all pending evals. For each: execute the code in the Lua state, capture the result or error, set the completion flag.

**In ControlServer:**
- Detect the `EVAL ` prefix in `processCommand()`.
- Create an eval request, push it to LuaEngine's queue.
- Wait (poll with short sleeps, up to 5 second timeout) for the completion flag.
- Return the result or timeout error.

**Access path:** `ControlServer` needs access to `LuaEngine`. Currently it only has `ScriptableProcessor*`. Add a `LuaEngine*` pointer to ControlServer, set by the editor alongside the existing `setFrameTimings` call.

Wait — ControlServer lives on the processor side, and LuaEngine lives on the editor side. The editor may not exist (headless mode). So the pointer must be nullable, and EVAL must return an error when no editor/LuaEngine is present.

**In ControlServer:**
- Add `void setLuaEngine(LuaEngine* engine)` setter and `LuaEngine* luaEngine = nullptr` member.
- In BehaviorCoreEditor constructor, call `processorRef.getControlServer().setLuaEngine(&luaEngine)`.

### Example usage

```bash
# Toggle to edit mode
echo 'EVAL shell:setMode("edit")' | <ipc_connect>

# Query current mode
echo 'EVAL return _G.__manifoldShellMode' | <ipc_connect>
# Response: OK edit

# Check widget count  
echo 'EVAL return root:getNumChildren()' | <ipc_connect>
# Response: OK 12

# Toggle back
echo 'EVAL shell:setMode("performance")' | <ipc_connect>
```

### Files touched

| File | Change |
|------|--------|
| `manifold/primitives/scripting/LuaEngine.h` | Add eval queue types, public `queueEval()` method |
| `manifold/primitives/scripting/LuaEngine.cpp` | Add eval queue drain in `notifyUpdate()`, implement `queueEval()` |
| `manifold/primitives/control/ControlServer.h` | Add `LuaEngine*` member and setter |
| `manifold/primitives/control/ControlServer.cpp` | Handle `EVAL` prefix in `processCommand()`, wait for result |
| `manifold/core/BehaviorCoreEditor.cpp` | Wire `setLuaEngine(&luaEngine)` in constructor |

### Acceptance criteria

1. `echo 'EVAL return 1+1' | <ipc_connect>` returns `OK 2`.
2. `echo 'EVAL return _G.__manifoldShellMode' | <ipc_connect>` returns `OK performance` (or `OK edit` depending on current state).
3. `echo 'EVAL shell:setMode("edit")' | <ipc_connect>` returns `OK` and the UI visibly switches to edit mode.
4. `echo 'EVAL error("boom")' | <ipc_connect>` returns `ERROR` with the error message.
5. EVAL with no LuaEngine attached (headless) returns `ERROR no lua engine`.
6. Build produces no new warnings.

---

## Deliverable 2: PERF RESET command

### What

An IPC command `PERF RESET` that resets the frame timing peak counters.

### Why

When comparing performance across UI modes, stale peak values from previous modes pollute the data. We need to reset peaks between measurements.

### Protocol

```
Client sends:  PERF RESET\n
Server responds: OK\n
```

### Implementation

In `ControlServer::processCommand()`, detect `PERF RESET` (case-insensitive). If `frameTimings` pointer is set, call `frameTimings->resetPeaks()`. Return `OK`. If pointer is null, still return `OK` (no-op is fine).

### Files touched

| File | Change |
|------|--------|
| `manifold/primitives/control/ControlServer.cpp` | Handle `PERF RESET` in `processCommand()` |

### Acceptance criteria

1. Send `PERF RESET`, get `OK`.
2. Immediately after, `DIAGNOSE` shows all peak values at 0 (or very small, since one frame may have elapsed).

---

## Deliverable 3: Update e2e test and perf tool

### What

Add tests and tooling that use the new EVAL and PERF RESET commands.

### e2e test additions

Add these test cases to `tests/e2e_ipc_test.py`:

| Test | What it does |
|------|-------------|
| `test_eval_arithmetic` | `EVAL return 1+1` → expect `OK 2` |
| `test_eval_string` | `EVAL return "hello"` → expect `OK hello` |
| `test_eval_error` | `EVAL error("boom")` → expect response starting with `ERROR` |
| `test_eval_nil` | `EVAL return nil` → expect `OK` (empty or nil result) |
| `test_eval_globals` | `EVAL return type(state)` → expect `OK table` (state global exists) |
| `test_perf_reset` | Send `PERF RESET`, then `DIAGNOSE`, verify `peakTotalUs` is small (< 50000) |

**Note on headless:** ManifoldHeadless does not create a BehaviorCoreEditor, so LuaEngine is not wired. EVAL tests should handle this gracefully — if the response is `ERROR no lua engine`, skip the test with a note rather than failing. Add a helper that detects headless mode and skips EVAL tests.

**Alternatively**, if ManifoldHeadless DOES create a LuaEngine (check this), the tests can run normally. Check `ManifoldHeadless.cpp` to see if it instantiates an editor.

### perf tool additions

In `tools/manifold-perf.py`, add a `--reset` flag that sends `PERF RESET` before the first measurement. This makes it easy to get clean peak data for a specific test session.

### UI profiling test script

Create `tests/ui_profile_test.py`. This script:

1. Connects to a running **standalone** instance (not headless — requires editor).
2. Uses `EVAL` to query and switch shell modes.
3. Uses `PERF RESET` between mode switches.
4. Captures timing snapshots in each mode.
5. Prints a comparison table.

```
Usage: python3 tests/ui_profile_test.py [socket_path]
```

It should test these modes and output a table:
- Performance mode (default shell mode)
- Edit mode with hierarchy panel
- Edit mode with scripts panel

The script should:
1. Send `PERF RESET`.
2. Send `EVAL shell:setMode("performance")`.
3. Sleep 3 seconds (let averages stabilize).
4. Read `DIAGNOSE`, capture timing.
5. Repeat for edit mode + hierarchy, edit mode + scripts.
6. Print comparison table to stdout.

If `EVAL` returns an error (no lua engine), print a clear message saying this test requires the standalone with editor, not headless.

### Files touched

| File | Change |
|------|--------|
| `tests/e2e_ipc_test.py` | Add 6 new test cases |
| `tools/manifold-perf.py` | Add `--reset` flag |
| `tests/ui_profile_test.py` | **NEW** — UI mode profiling comparison script |

### Acceptance criteria

1. `python3 tests/e2e_ipc_test.py` passes all existing tests plus new ones (EVAL tests may be skipped if headless has no LuaEngine — that's OK).
2. `python3 tools/manifold-perf.py --reset --once` shows fresh peak data.
3. `python3 tests/ui_profile_test.py` (against running standalone) prints a timing comparison table across shell modes.

---

## Implementation order

1. **Deliverable 1** (EVAL) — this unblocks everything else.
2. **Deliverable 2** (PERF RESET) — trivial once EVAL is done.
3. **Deliverable 3** (test/tool updates) — uses both new commands.

## Build commands

```bash
cmake --build build-dev --target Manifold_Standalone
cmake --build build-dev --target ManifoldHeadless
```
