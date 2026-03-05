# E2E Testing & Performance Profiling Spec

## Context

Manifold's UI runs a 30Hz frame cycle on the JUCE message thread. The cycle is: serialize processor state into Lua tables → run event listeners → call Lua `ui_update()` (which includes peak computation for waveforms) → trigger JUCE repaint of the Canvas tree. We suspect graphical bottlenecks but have no measurements. We also have no end-to-end test that exercises the full IPC→command→audio→state→response pipeline.

This spec covers three deliverables: frame timing instrumentation, an E2E IPC test, and a CLI profiling tool.

Read `AGENTS.md` for build commands and workflow before starting.

---

## Deliverable 1: Frame Timing Instrumentation

### What

Measure wall-clock time of each stage in the 30Hz frame cycle and expose the data via IPC and stderr.

### Stages to measure

| Stage ID | Description | Where it executes |
|----------|-------------|-------------------|
| `pushState` | `pushStateToLua()` — serializes processor AtomicState into Lua tables | Inside `LuaEngine::notifyUpdate()` in `manifold/primitives/scripting/LuaEngine.cpp` |
| `eventListeners` | `invokeEventListeners()` — diff detection + Lua listener callbacks | Inside `LuaEngine::notifyUpdate()` |
| `uiUpdate` | The Lua `ui_update(state)` call and shell update | Inside `LuaEngine::notifyUpdate()` |
| `paint` | The actual JUCE `Canvas::paint()` execution on the root canvas | In `manifold/primitives/ui/Canvas.cpp` |
| `total` | The entire `timerCallback()` wall time | In `manifold/core/BehaviorCoreEditor.cpp` |

### FrameTimings struct

Create `manifold/primitives/ui/FrameTimings.h`. This is a plain struct with `std::atomic<int64_t>` fields. Single writer (message thread), multiple readers (IPC thread). All relaxed memory ordering.

Fields per stage: `currentUs`, `peakUs`, `avgUs` (exponential moving average, alpha ~0.05). Plus a `frameCount` counter. Provide an `update()` method that takes all five stage durations, updates current/peak/avg, and increments `frameCount`. Provide a `resetPeaks()` method.

Use integer-only math for the EMA to avoid float atomics. Store avg as `value * 100` internally, divide by 100 when reading.

### Instrumentation in LuaEngine::notifyUpdate()

Wrap `std::chrono::steady_clock` timing around the three stages (`pushStateToLua`, `invokeEventListeners`, and the `ui_update` Lua call block). Store the per-stage microsecond values into a `FrameTimings frameTimings` public member on `LuaEngine`.

Do NOT rewrite the function logic. Only add timing measurement around the existing stages. The existing behaviour must be preserved exactly.

Log to stderr every ~150 frames (~5 seconds) with format:
```
FrameTiming[<frameCount>]: total=<X>us pushState=<X>us events=<X>us uiUpdate=<X>us paint=<X>us peak=<X>us avg=<X.X>us
```

### Instrumentation in BehaviorCoreEditor::timerCallback()

Wrap the entire `timerCallback()` body in a `steady_clock` measurement. After `notifyUpdate()` returns and `repaint()` is called, call `frameTimings.update()` with all five durations.

**Paint timing constraint**: JUCE's `repaint()` is asynchronous — it schedules a paint, it doesn't execute it synchronously. To get actual paint duration, instrument `Canvas::paint()` on the root canvas (the one with no Canvas parent). Store the measured duration in an `atomic<int64_t> lastPaintDurationUs` member on `Canvas`. In `timerCallback()`, read the **previous frame's** paint measurement from `rootCanvas.lastPaintDurationUs`. One frame of lag is acceptable for profiling.

### Expose via IPC DIAGNOSE

Add a `FrameTimings*` member to `ControlServer` with a `setFrameTimings(FrameTimings*)` setter. Wire it in `BehaviorCoreEditor`'s constructor: `processorRef.getControlServer().setFrameTimings(&luaEngine.frameTimings)`.

In `ControlServer::buildDiagnoseJson()`, if the pointer is set, append a `"frameTiming"` JSON object containing all fields. Expected shape:

```json
{
  "frameTiming": {
    "frameCount": 4500,
    "totalUs": 2100,
    "pushStateUs": 800,
    "eventListenersUs": 50,
    "uiUpdateUs": 900,
    "paintUs": 350,
    "peakTotalUs": 5200,
    "peakPushStateUs": 1500,
    "peakEventListenersUs": 120,
    "peakUiUpdateUs": 3000,
    "peakPaintUs": 800,
    "avgTotalUs": 2050,
    "avgPushStateUs": 780,
    "avgEventListenersUs": 45,
    "avgUiUpdateUs": 880,
    "avgPaintUs": 340
  }
}
```

### Files touched

| File | Change |
|------|--------|
| `manifold/primitives/ui/FrameTimings.h` | **NEW** — the struct |
| `manifold/primitives/ui/Canvas.h` | Add `std::atomic<int64_t> lastPaintDurationUs{0}` member |
| `manifold/primitives/ui/Canvas.cpp` | Measure `paint()` duration on root canvas, store in atomic |
| `manifold/primitives/scripting/LuaEngine.h` | Add `FrameTimings frameTimings` public member, add include |
| `manifold/primitives/scripting/LuaEngine.cpp` | Add timing around three stages in `notifyUpdate()`, add stderr logging |
| `manifold/core/BehaviorCoreEditor.cpp` | Add timing around `timerCallback()`, wire `setFrameTimings`, read paint from previous frame |
| `manifold/primitives/control/ControlServer.h` | Add `FrameTimings*` member and setter |
| `manifold/primitives/control/ControlServer.cpp` | Add `frameTiming` object to `buildDiagnoseJson()` output, add include |

### Acceptance criteria

1. Standalone builds without errors or new warnings.
2. Running standalone prints `FrameTiming[...]` to stderr every ~5 seconds.
3. `echo "DIAGNOSE" | socat - UNIX-CONNECT:/tmp/manifold_<pid>.sock` returns JSON containing a `frameTiming` object with all listed fields.
4. All values are non-negative integers. `frameCount` increments over time.
5. Existing UI behaviour is unchanged — no visual or functional regressions.

---

## Deliverable 2: E2E IPC Test

### What

A Python 3 script that starts `ManifoldHeadless`, connects to its Unix socket, sends commands through the full pipeline, reads back state, and asserts correctness.

### File

Create `tests/e2e_ipc_test.py` (the `tests/` directory does not exist yet).

### Dependencies

Python 3 stdlib only. No pip packages. Uses: `socket`, `json`, `subprocess`, `time`, `glob`, `os`, `sys`, `signal`.

### How it works

1. Locate `build-dev/ManifoldHeadless` relative to the script's parent directory (repo root).
2. Start it as a subprocess with `--duration 30 --blocksize 512 --samplerate 44100`.
3. Wait up to 10 seconds for `/tmp/manifold_<pid>.sock` to appear.
4. Connect a plain Unix stream socket. Protocol is line-based: send `"COMMAND\n"`, receive `"RESPONSE\n"`.
5. Run all test cases sequentially on the same connection.
6. Kill the subprocess, print summary, exit 0 if all pass, exit 1 if any fail, exit 2 if infrastructure error.

### Test cases

| Test | What it does |
|------|-------------|
| `test_ping` | Send `PING`, expect response `OK PONG` |
| `test_state_json` | Send `STATE`, expect `OK ` followed by valid JSON with `projectionVersion=2`, `params` object, `voices` array |
| `test_diagnose_json` | Send `DIAGNOSE`, expect `OK ` followed by valid JSON with `socketPath` field |
| `test_set_tempo` | Send `SET /core/behavior/tempo 142.5`, sleep 100ms, send `STATE`, verify `params["/core/behavior/tempo"]` ≈ 142.5 |
| `test_set_layer` | Send `SET /core/behavior/layer 2`, sleep 100ms, send `STATE`, verify `params["/core/behavior/layer"]` = 2 |
| `test_set_volume` | Send `SET /core/behavior/volume 0.73`, sleep 100ms, send `STATE`, verify ≈ 0.73 |
| `test_set_overdub` | Send `SET /core/behavior/overdub 1`, sleep 100ms, send `STATE`, verify = 1 |
| `test_set_mode` | Send `SET /core/behavior/mode freeMode`, sleep 100ms, send `STATE`, verify = `"freeMode"` |
| `test_trigger_rec` | Send `TRIGGER /core/behavior/rec`, expect `OK` (don't verify recording state — headless may not have audio context) |
| `test_unknown_path` | Send `SET /core/behavior/nonexistent 42`, expect `ERROR` |
| `test_legacy_rejected` | Send `TEMPO 120`, expect `ERROR` |
| `test_bad_coercion` | Send `SET /core/behavior/tempo notanumber`, expect `ERROR` |
| `test_get_value` | Send `GET /core/behavior/tempo`, expect `OK` with non-empty body |
| `test_connection_stability` | Send `PING` 10 times in a loop, all must return `OK PONG` |
| `test_voices_structure` | Send `STATE`, verify `voices` is a list, first element has keys: `id`, `path`, `state`, `length`, `position`, `speed`, `volume` |

### Output format

```
Starting ManifoldHeadless...
Socket found: /tmp/manifold_12345.sock
  PASS: test_ping
  PASS: test_state_json
  FAIL: test_set_tempo: expected 142.5, got 120.0
  ...
E2E IPC Tests: 14/15 passed, 1 failed
```

On failure, print ManifoldHeadless stderr (last 2000 chars) for debugging.

### Acceptance criteria

1. Script runs with `python3 tests/e2e_ipc_test.py` from repo root.
2. All 15 tests pass against a freshly built ManifoldHeadless.
3. Script cleans up the subprocess on exit (including on Ctrl+C or test failure).
4. Exit code 0 = all pass, 1 = failures, 2 = infra error.

---

## Deliverable 3: Performance Profiling CLI Tool

### What

A Python 3 script that connects to a running Manifold instance and displays frame timing data in real-time.

### File

Create `tools/manifold-perf.py`.

### Dependencies

Python 3 stdlib only.

### How it works

1. Find the most recent `/tmp/manifold_*.sock` (or accept explicit path as argument).
2. Connect via Unix socket.
3. Poll `DIAGNOSE` every 1 second.
4. Parse the `frameTiming` object from the response.
5. Display a formatted view.

### Modes

| Flag | Behaviour |
|------|-----------|
| (none) | Continuous display, clears terminal each update, runs until Ctrl+C |
| `--once` | Single snapshot, print, exit |
| `--json` | Output `frameTiming` JSON object per line (for piping) |

### Display format (continuous mode)

```
═══════════════════════════════════════════════════════
  MANIFOLD FRAME PROFILER
  Frame #4500  |  Budget: 33.3ms (30Hz)
═══════════════════════════════════════════════════════

  CURRENT FRAME:
    Total:           2.1ms  [██████░░░░░░░░░░░░░░░░░░░░░░░░] 6%
    pushStateToLua:  0.8ms  [██░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 2%
    eventListeners:  0.1ms  [░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 0%
    ui_update:       0.9ms  [██░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 3%
    paint:           0.4ms  [█░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 1%

  AVERAGES:
    Total:           2.1ms  [██████░░░░░░░░░░░░░░░░░░░░░░░░] 6%
    ...

  PEAKS:
    Total:           5.2ms  [████████████████░░░░░░░░░░░░░░] 16%
```

The bar shows percentage of the 33.3ms frame budget (30Hz). Warn if total exceeds 80% of budget.

### Acceptance criteria

1. Script runs with `python3 tools/manifold-perf.py` while standalone is running.
2. Displays updating frame timing data until Ctrl+C.
3. `--once` prints one snapshot and exits.
4. `--json` outputs one JSON object per line.
5. Handles missing socket gracefully with a clear error message.

---

## Implementation order

1. **Deliverable 1** first. Build and verify standalone shows timing on stderr and DIAGNOSE returns frameTiming.
2. **Deliverable 2** next. Build ManifoldHeadless, run the test, all 15 pass.
3. **Deliverable 3** last. Run the perf tool against standalone, confirm display works.

Do not start a deliverable until the previous one's acceptance criteria are met.

## Build commands

```bash
# Deliverable 1
cmake --build build-dev --target Manifold_Standalone

# Deliverable 2
cmake --build build-dev --target ManifoldHeadless

# Deliverable 3 (no build — Python script, but needs Deliverable 1 in the running binary)
```
