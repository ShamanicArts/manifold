# Logging Architecture Design

**Status:** Design Document  
**Date:** March 2026  
**Priority:** P1 (Important but deferrable)  
**Related:** ARCHITECTURAL_AUDIT.md Category D

---

## Executive Summary

Current state: 57 scattered `fprintf(stderr, ...)` calls with no structure, thread-safety, or production observability.

Target state: Lock-free ring buffers per thread, structured JSON logs, dynamic filtering, crash dumps, live metrics export, and atomic error recovery.

This document defines the ideal logging architecture. Implementation can be phased.

---

## 1. Core Requirements

### 1.1 Thread Safety
- **Audio thread:** Wait-free, O(1) enqueue, never blocks, no allocations
- **Message thread:** Standard logging with backpressure handling
- **Lua thread:** Same as message thread
- **Strategy:** One ring buffer per thread, aggregator thread consumes all

### 1.2 Production Observability
- Structured output (JSON/msgpack) for machine parsing
- Live metrics export (Prometheus/OpenTelemetry compatible)
- Crash dumps with last 10 seconds of logs + state snapshot
- Remote log streaming via OSC/WebSocket

### 1.3 Actionable Errors
- Categorized by subsystem (audio, lua, control, dsp, ui, lifecycle)
- Severity levels with dynamic filtering
- Context-rich (file:line, thread ID, correlation IDs, state snapshots)
- User-facing messages (UI console) separate from dev logs

---

## 2. Architecture

### 2.1 Ring Buffer Per Thread

```
[Audio Thread]    [Message Thread]    [Lua Thread]    [Network Thread]
       |                  |                 |                 |
       v                  v                 v                 v
  +---------+        +---------+       +---------+       +---------+
  | 512-slot|        | 512-slot|       | 512-slot|       | 512-slot|
  | lockfree|        | lockfree|       | lockfree|       | lockfree|
  |  queue  |        |  queue  |       |  queue  |       |  queue  |
  +----+----+        +----+----+       +----+----+       +----+----+
       |                  |                 |                 |
       +------------------+-----------------+-----------------+
                          |
                          v
                   +-------------+
                   |  Aggregator |  (dedicated thread)
                   |   thread    |
                   +------+------+
                          |
            +-------------+-------------+
            |                           |
            v                           v
    +---------------+          +----------------+
    |  Async file   |          |  OSC / WebSocket |
    |   writer      |          |  (live telemetry)|
    +---------------+          +----------------+
```

**Key Design Decisions:**
- Audio thread uses wait-free SPSC queue (never blocks, no syscalls)
- Overflow: Drop oldest (keep history for debugging, not newest)
- Aggregator thread batches writes for efficiency
- Multiple output sinks: file, network, crash dump, metrics

### 2.2 Log Levels

| Level | Usage | Production Default |
|-------|-------|-------------------|
| trace | Every command, every OSC message | 0.1% sampling |
| debug | State transitions, queue depths | Off |
| info | Script loaded, connection established | On |
| warn | Deprecated API, queue 80% full | On |
| error | Command failed, script error (non-fatal) | On |
| fatal | Audio thread crash, corruption | On |

### 2.3 Categories

- `audio` - Dropouts, xruns, buffer underruns
- `lua` - Script errors, binding failures, VM panics
- `control` - Command parsing, OSC, IPC
- `dsp` - Graph compilation, node errors
- `ui` - Canvas, OpenGL, input handling
- `lifecycle` - Init, shutdown, hot-reload

### 2.4 Dynamic Filtering

Runtime configurable via OSC or config file:
```lua
-- Development
Logger.set_level("lua", "debug")
Logger.set_level("audio", "trace")

-- Production
Logger.set_level("lua", "warn")
Logger.set_level("audio", "error")
Logger.set_sampling("control", 0.01)  -- 1% of control messages
```

---

## 3. API Design

### 3.1 Basic Logging

```cpp
// Replace: fprintf(stderr, "[LuaEngine] command error: %s\n", msg);

// With structured logging
LOG(control, error, "command_parse_failed")
    .with_context("input", cmdStr)
    .with_context("error_code", result.warningCode)
    .with_context("layer", layerIdx)
    .with_thread("audio")  // auto-detected
    .with_timestamp()      // nanosecond precision
    .emit();
```

### 3.2 Rate Limiting

```cpp
LOG(control, warn, "deprecated_syntax")
    .with_context("legacy_verb", result.legacyVerb)
    .with_context("input", cmdStr)
    .with_rate_limit(5, 100)  // Max 5, then every 100th
    .emit();
```

### 3.3 Error Recovery Context

```cpp
bool LuaEngine::switchScript(const File& path) {
    // Trial load in isolated state
    auto trial = coreEngine_.create_trial_state();
    if (!trial.load(path)) {
        LOG(lua, error, "script_load_failed")
            .with_context("path", path)
            .with_context("error", trial.get_error())
            .with_context("line", trial.get_error_line())
            .with_context("stack_trace", trial.get_stack_trace());
        
        // Keep old script, show error in UI
        ui_.show_error("Script reload failed", trial.get_error());
        return false;  // Atomic: all or nothing
    }
    
    coreEngine_.commit(std::move(trial));
    LOG(lua, info, "script_hot_reloaded")
        .with_context("path", path)
        .emit();
    return true;
}
```

---

## 4. Output Formats

### 4.1 Development (Human-Readable)

```
[2026-03-02T20:45:12.123456789Z] [audio] [warn] queue_overflow
    queue: command_queue
    capacity: 256
    current_depth: 256
    thread: audio
    file: ControlServer.cpp:145

[2026-03-02T20:45:12.234567890Z] [lua] [error] script_load_failed
    path: /home/user/scripts/ui.lua
    error: attempt to call nil
    line: 45
    stack_trace:
        ui.lua:45 in function 'init'
        LuaEngine.cpp:312 in 'loadScript'
```

### 4.2 Production (Structured)

```json
{
  "timestamp": "2026-03-02T20:45:12.123456789Z",
  "level": "warn",
  "category": "audio",
  "message": "queue_overflow",
  "context": {
    "queue": "command_queue",
    "capacity": 256,
    "current_depth": 256
  },
  "thread": "audio",
  "file": "ControlServer.cpp",
  "line": 145
}
```

### 4.3 Crash Dumps

```json
{
  "timestamp": "2026-03-02T20:45:12.123Z",
  "version": "1.0.0",
  "crash_type": "audio_thread_assert",
  "assertion": "queue.enqueue(cmd) || drop_policy == blocking",
  "last_logs": [
    {"t": -0.023, "cat": "audio", "lvl": "error", "msg": "command_queue_full"},
    {"t": -0.001, "cat": "audio", "lvl": "fatal", "msg": "assert_fail"}
  ],
  "state_snapshot": {
    "tempo": 120.0,
    "recording": true,
    "lua_heap_mb": 45.2,
    "queue_depth": 256
  },
  "stack_trace": [
    "LooperProcessor::processBlock()",
    "ControlServer::enqueue()",
    "assert_fail()"
  ]
}
```

---

## 5. Observability Integration

### 5.1 Prometheus Metrics Export

```
# HELP scripting_lua_heap_bytes Lua heap size
# TYPE scripting_lua_heap_bytes gauge
scripting_lua_heap_bytes 47185920

# HELP scripting_command_queue_dropped_total Commands dropped due to full queue
# TYPE scripting_command_queue_dropped_total counter
scripting_command_queue_dropped_total{strategy="drop_newest"} 0

# HELP scripting_audio_callback_duration_seconds Audio callback duration
# TYPE scripting_audio_callback_duration_seconds histogram
scripting_audio_callback_duration_seconds_bucket{le="0.001"} 995
scripting_audio_callback_duration_seconds_bucket{le="0.002"} 1000
```

### 5.2 OSC Error Notifications

```
# Real-time error stream to clients
/looper/error "lua_script_error" "attempt to call nil" 45 "ui.lua"
/looper/error "audio_queue_full" "command dropped" 256

# Telemetry
/looper/telemetry/audio_dropouts 3
/looper/telemetry/lua_gc_time_ms 2.4
```

---

## 6. Implementation Phases

### Phase 1: Foundation (1-2 days)
- Replace `fprintf(stderr, ...)` with simple `Logger` class
- Categories and levels
- Single-threaded file output
- Keeps existing behavior, adds structure

### Phase 2: Thread Safety (2-3 days)
- Per-thread ring buffers
- Aggregator thread
- Lock-free audio thread path

### Phase 3: Production Features (3-5 days)
- Structured JSON output
- Dynamic level configuration
- Crash dumps with state snapshots

### Phase 4: Observability (3-5 days)
- Prometheus metrics export
- OSC telemetry stream
- Remote log streaming

---

## 7. Deferred Decisions

1. **Configuration source:** Compile-time constexpr vs runtime config file vs OSC commands
2. **Buffer sizing:** Fixed 512 slots vs dynamic growth vs configurable per-deployment
3. **Persistence:** Rotate logs at 100MB? Keep last N hours? Cloud upload?
4. **Sampling strategy:** Random sampling vs hash-based consistent sampling vs adaptive

---

## 8. Relation to Other Work

- **Thread Model (Phase 8):** Logging architecture assumes dedicated aggregator thread
- **State Serializer (Phase 9):** Crash dumps need state snapshot (same interface)
- **Error Handling (Category D):** This document is the design for D1-D6

---

**Recommendation:** Implement Phase 1 (simple Logger class) immediately to replace fprintf spam. Defer Phases 2-4 until after thread model refactor (Phase 8) as they depend on it.
