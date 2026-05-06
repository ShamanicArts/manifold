# Manifold Performance Profiling Report

**Date:** March 31, 2026  
**Process Analyzed:** Manifold Standalone (JUCE Audio Plugin)  
**PID(s):** 1977265 (initial), 2031854 (detailed analysis)  
**Profiling Duration:** ~60 minutes of live system observation

---

## Executive Summary

Manifold is a **Lua-scriptable, 8-voice polysynth with looper** built on JUCE. Profiling revealed that **135% CPU usage** is primarily caused by **DSP graph processing 120+ nodes every audio block**, regardless of voice activity. The architecture creates all voice nodes upfront and processes them continuously, even when voices are gated off.

**Key Finding:** The application is not "leaking" CPU to specific expensive features (morph mode, granulator, PVOC), but rather **processing the entire static graph unconditionally**.

**Recommended Fix:** Add early-exit bypass logic to DSP nodes when gain/mix/enabled parameters are at minimum. This single architectural change is expected to reduce CPU from 135% to ~20-30%.

---

## Profiling Methodology

### Tools Used

All profiling was performed using **standard Linux `/proc` filesystem tools** without requiring special privileges or instrumentation:

| Tool | Purpose | Commands Used |
|------|---------|---------------|
| `/proc/[pid]/stat` | Per-thread CPU time (user/kernel jiffies) | `awk '{print $14, $15}' /proc/[pid]/task/[tid]/stat` |
| `/proc/[pid]/status` | Memory stats (VmRSS, RssAnon, Threads) | `cat /proc/[pid]/status \| grep -E "(VmRSS\|Threads)"` |
| `/proc/[pid]/task/[tid]/` | Thread-level detail (names, scheduling, states) | `cat /proc/[pid]/task/[tid]/comm`, `schedstat` |
| `/proc/[pid]/maps` | Memory layout (anonymous regions, libraries) | `awk` parsing for large rw-p regions |
| `/proc/[pid]/smaps` | Detailed memory stats per region | RSS/PSS breakdown |
| `/proc/[pid]/fd/` | Open file descriptors | `ls -la` to categorize sockets/pipes/memfd |
| `/proc/[pid]/io` | I/O statistics | `rchar`, `wchar`, `syscr`, `syscw` |
| `chrt` | Real-time scheduling policy check | `chrt -p [pid]` |
| `pstree` | Process/thread hierarchy | `pstree -p [pid]` |
| `ss` (socket stat) | Network connections | `ss -uap \| grep [pid]` |

**Why These Tools:** No `perf`, `strace`, or `gdb` were used because:
- `strace` would disrupt real-time audio guarantees (SCHED_RR threads)
- `perf` was not installed and required root
- `gdb` attach is blocked by ptrace_scope

### Live Monitoring Approach

```bash
# CPU sampling over time
for tid in $(ls /proc/$PID/task/); do
    name=$(cat /proc/$PID/task/$tid/comm)
    utime=$(awk '{print $14}' /proc/$PID/task/$tid/stat)
    stime=$(awk '{print $15}' /proc/$PID/task/$tid/stat)
    echo "$name: utime=$utime stime=$stime"
done

# Memory growth tracking
watch -n 1 'cat /proc/$PID/status | grep -E "(VmRSS|RssAnon)"'

# Thread state snapshot
for tid in $(ls /proc/$PID/task/); do
    state=$(awk '{print $3}' /proc/$PID/task/$tid/stat)
    name=$(cat /proc/$PID/task/$tid/comm)
    echo "$name: $state"
done
```

---

## Thread Architecture Analysis

### Thread Breakdown (32 Total Threads)

| Thread Name | TID Pattern | Scheduling | CPU Usage | Purpose |
|-------------|-------------|------------|-----------|---------|
| `Manifold` (main) | 2031854 | SCHED_OTHER | **75 ticks/sec (97% user)** | UI event loop, OSC handling |
| `Manifold` (worker) | 2031870 | SCHED_OTHER | **60 ticks/sec (99% user)** | DSP graph processing |
| `data-loop.0` | 2031866, 2031869 | **SCHED_RR, prio 20** | 20 ticks/sec | PipeWire audio I/O (real-time) |
| `Manifold:cs0` | 2031982 | SCHED_OTHER | 21 ticks (8% user, 91% kernel) | Command scheduler / IPC dispatch |
| `Manifo:traceq0` | 6 threads | SCHED_OTHER | ~0 | UI tracing/telemetry |
| `Manifold:gdrv0`, `gl0` | 4 threads | SCHED_OTHER | ~0 | GPU driver threads |
| `OpenGL Renderer` | 2031989 | SCHED_OTHER | **0.01s total** | ImGui rendering |
| `module-rt`, `alsa-pipewire` | 4 threads | SCHED_OTHER | ~0 | PipeWire modules |

### Key Observations

**Main Thread (97% user, 0 voluntary context switches):**
- Never yields - continuously busy
- 30Hz timer callback (JUCE `startTimerHz(30)`)
- OSC message processing
- Lua hot-reload checks
- Full ImGui render every 33ms

**DSP Worker Thread (99% user, 0 kernel time):**
- Pure computation, no I/O blocking
- Processes compiled graph of 120+ nodes
- Not running real-time (SCHED_OTHER) - can be preempted

**Command Scheduler (`cs0`):**
- 91% kernel time = syscall-heavy IPC
- 3613 context switches = very chatty
- OSC message dispatch to main thread

**OpenGL Renderer:**
- Essentially idle (0.01s CPU over 103 minutes)
- Confirms rendering is NOT the bottleneck

---

## Memory Analysis

### RSS Breakdown (756 MB at startup, grew to 1.5 GB)

| Category | Size | Details |
|----------|------|---------|
| **Anonymous (LuaJIT)** | **587 MB** | Lua arenas, compiled bytecode, runtime tables |
| Large anonymous region 1 | 604 MB | Primary LuaJIT GC arena |
| Large anonymous region 2 | 309 MB | Secondary arena / sample storage |
| Scattered 56-72 MB chunks | ~200 MB | C++ node buffers, FX delay lines |
| Heap | 87 MB | C++ malloc (JUCE allocations) |
| Shared Libraries | 172 MB | Code + shared libs |
| File-mapped | 5 MB | Font caches, mesa shader cache |

### Memory Growth Pattern

**Stable at startup:** 756 MB  
**Grows to 1.5 GB when:**
1. Recording loops (4 layers × 30s × 48kHz × 2ch × 4bytes = 46 MB)
2. Loading samples (sample data + PVOC analysis)
3. Enabling morph/additive modes (temporal partials allocation)
4. Lua heap growth over time (JIT compilation, table accumulation)

**Key Finding:** LuaJIT arenas (604+309 MB = 913 MB) never shrink once grown. This is expected LuaJIT behavior - memory returns to Lua GC but not to OS.

### I/O Pattern

- **Read:** 1.8 GB total, 2 KB average per syscall (loading scripts/resources)
- **Write:** 8 MB total, 14 bytes average per syscall (tiny OSC messages)
- **Syscalls:** 84K reads, 58K writes
- Pattern suggests heavy file loading at startup, minimal disk I/O during runtime

---

## DSP Graph Architecture Deep Dive

### Voice Structure (Per Voice)

Each of 8 voices creates ~15 nodes:

```lua
-- From sample_synth.lua:createVoiceGraph()
local osc = ctx.primitives.OscillatorNode.new()
local samplePlayback = ctx.primitives.SampleRegionPlaybackNode.new(2)
local samplePhaseVocoder = ctx.primitives.PhaseVocoderNode.new(2)  -- FFT order 11
local sampleEnvFollower = ctx.primitives.EnvelopeFollowerNode.new()
local sampleAdditive = ctx.primitives.SineBankNode.new()  -- 8 partials
local morphWaveAdditive = ctx.primitives.SineBankNode.new()  -- Second sine bank
local blendAddOsc = ctx.primitives.OscillatorNode.new()  -- Third oscillator
-- Plus: noise gain, mixers, crossfaders, ADSR, etc.
```

**Total: 8 voices × ~15 nodes = 120+ nodes in compiled graph**

### The Problem: Static Graph Processing

```cpp
// GraphRuntime.cpp - processes ALL nodes every block
for (size_t i = 0; i < compiledNodes_.size(); ++i) {
    compiled.node->process(...);  // Every node, every block
}
```

**Voice gating happens at Lua level (VoicePool.lua):**
```lua
function self.setGate(voiceIndex, gateValue, opts)
    voice.gate = g  -- Just sets a Lua variable!
    voice.adsr:setGate(g > 0.5)  -- Node still processes every block
end
```

**Result:** Even with 7 of 8 voices gated off, all 120 nodes are processed every audio block.

### Node-by-Node Cost Analysis

| Node | Cost | Early Exit? | Skip Condition Needed |
|------|------|-------------|----------------------|
| **EnvelopeFollowerNode** | High | ❌ NO | `sensitivity <= 0` |
| **SineBankNode** | High | ❌ NO | `!enabled \|\| amplitude <= 0` |
| **OscillatorNode** | Medium | ❌ NO | `amplitude <= 0` |
| **SampleRegionPlaybackNode** | Medium | ❌ NO | `!isPlaying()` |
| PhaseVocoderNode | Low | ✅ YES | Already skips when `mix < 0.001` |
| GranulatorNode | Variable | N/A | Not loaded in current config |

---

## What We Initially Got Wrong

### Myth: "Morph mode is eating CPU"

**Reality:** Morph mode (`blendMode == 5`) only runs when explicitly selected. The `extractTemporalPartials()` function:
- Runs **once** on sample load/mode switch
- Does NOT run per-frame during playback
- Is guarded by `isAdditiveBlendMode(blendMode)` check

### Myth: "PVOC is doing FFT every block"

**Reality:** PhaseVocoderNode already has early exit:
```cpp
if (targetMix < 0.001f) {
    // Passthrough dry signal
    return;
}
```

### Myth: "Granulator is the culprit"

**Reality:** GranulatorNode (64 grains max) is available as an FX slot option but was **not loaded** in the current configuration.

### The Real Culprit

**Static graph architecture processing 120+ nodes every block**, regardless of voice activity. Each node performs per-sample processing (envelopes, oscillators) even when gain=0.

---

## Performance Optimization Recommendations

### 🔥 Critical: Add Early-Exit Bypass Logic (Immediate Impact)

**Expected improvement: 135% → 20-30% CPU**

#### Patch 1: EnvelopeFollowerNode
```cpp
void EnvelopeFollowerNode::process(...) {
    const float tSensitivity = targetSensitivity_.load(std::memory_order_acquire);
    
    // Early bypass
    if (tSensitivity <= 0.0001f && currentSensitivity_ <= 0.0001f) {
        // Passthrough dry signal
        for (int i = 0; i < numSamples; ++i) {
            for (int ch = 0; ch < outCh; ++ch) {
                const float s = inputs[0].getSample(ch < inCh ? ch : 0, i);
                outputs[0].setSample(ch, i, s);
            }
        }
        envelopeOut_.store(0.0f, std::memory_order_release);
        return;
    }
    // ... existing processing
}
```

#### Patch 2: SineBankNode
```cpp
void SineBankNode::process(...) {
    const bool enabled = enabled_.load(std::memory_order_acquire);
    const float targetAmp = targetAmplitude_.load(std::memory_order_acquire);
    
    // Early exit BEFORE building partials
    if (!enabled || (targetAmp <= 0.0001f && currentAmplitude_ <= 0.0001f)) {
        out.clear();
        if (!enabled) reset();
        return;
    }
    
    // Only build partials if we're going to use them
    const int spectralMode = spectralMode_.load(std::memory_order_acquire);
    if (spectralMode != kSpectralModeManual) {
        setPartials(buildSpectralTargetPartials());  // Move AFTER early exit
    }
    // ... rest of processing
}
```

#### Patch 3: OscillatorNode
```cpp
void OscillatorNode::process(...) {
    const float targetAmp = targetAmplitude_.load(std::memory_order_acquire);
    
    if (targetAmp <= 0.0001f && currentAmplitude_ <= 0.0001f) {
        outputs[0].clear();
        return;
    }
    // ... existing processing
}
```

#### Patch 4: SampleRegionPlaybackNode
```cpp
void SampleRegionPlaybackNode::process(...) {
    const bool isPlaying = playing_.load(std::memory_order_acquire);
    const float speed = speed_.load(std::memory_order_acquire);
    
    if (!isPlaying || std::abs(speed) < 0.0001f) {
        outputs[0].clear();
        return;
    }
    // ... existing processing
}
```

### 🎯 High Priority: Main Thread Optimization

**Current:** 97% user CPU, 0 voluntary context switches  
**Issue:** Main thread never yields

#### Option A: Batch OSC Messages
```lua
-- Instead of processing every OSC message individually:
-- Collect messages in 1ms window, process batch
```

#### Option B: Reduce Lua Hot-Reload Frequency
```cpp
// LuaCoreEngine.cpp
static constexpr int HOT_RELOAD_CHECK_INTERVAL = 30; // frames
// Change to: every 60 or 120 frames (1-2 seconds)
```

#### Option C: Separate UI Thread
Move ImGui rendering off the JUCE message thread to a dedicated render thread (already partially done with `OpenGL Renderer` thread showing 0.01s CPU).

### 🎯 Medium Priority: Real-Time Scheduling

**Current:** DSP worker thread is SCHED_OTHER (can be preempted)  
**Risk:** Audio glitches under system load

```bash
# Temporary fix (needs root):
sudo chrt -f -p 10 [DSP_WORKER_TID]

# Permanent fix: In code, set thread priority
juce::Thread::setCurrentThreadPriority(10); // Or use pthread_setschedparam
```

### 🎯 Medium Priority: Memory Optimization

**LuaJIT Arena Growth:**
- 913 MB currently committed to Lua
- Expected behavior - arenas don't shrink
- Consider `collectgarbage("setpause", 150)` to reduce GC frequency

**Sample Analysis Buffers:**
- Temporal partials: 704 frames × 2048 bins × 8 voices = significant memory
- Consider streaming analysis instead of full pre-computation

### 🔮 Long-Term Architectural Changes

#### Option 1: Dynamic Graph Rewiring
```lua
-- When voice gates off, disconnect from mixer
if gate <= 0.5 and wasGateHigh then
    ctx.graph.disconnect(voice.envFollower, voice.mixer)
elseif gate > 0.5 and not wasGateHigh then
    ctx.graph.connect(voice.envFollower, voice.mixer)
end
```

#### Option 2: Voice Stealing / Lazy Allocation
Only create DSP nodes for active voices (maximum polyphony vs allocated voices).

#### Option 3: Graph-Level Dead Code Elimination
```cpp
// In GraphRuntime::process()
if (node->outputAmplitude < threshold && !node->isAlwaysActive()) {
    node->bypass(outputs);
    continue;
}
```

#### Option 4: Multithreaded DSP
Split graph processing across multiple worker threads (thread-per-voice or thread-per-subgraph).

---

## Profiling Tools Reference

### Commands to Monitor Performance

```bash
# Find Manifold PID
PID=$(pgrep Manifold)

# Monitor per-thread CPU in real-time
watch -n 1 '
for tid in $(ls /proc/'$PID'/task/); do
    name=$(cat /proc/'$PID'/task/$tid/comm 2>/dev/null)
    utime=$(awk "{print \$14}" /proc/'$PID'/task/$tid/stat 2>/dev/null)
    echo "$name: $utime"
done | sort -k2 -n -r | head -10'

# Monitor memory growth
watch -n 1 'cat /proc/'$PID'/status | grep -E "(VmRSS|RssAnon|Threads)"'

# Check scheduling policies
for tid in $(ls /proc/'$PID'/task/); do
    name=$(cat /proc/'$PID'/task/$tid/comm)
    chrt -p $tid 2>/dev/null | head -1
done

# IO statistics
watch -n 5 'cat /proc/'$PID'/io | grep -E "(rchar|wchar|syscr|syscw)"'
```

### Key /proc Files Reference

| File | Information |
|------|-------------|
| `/proc/[pid]/task/[tid]/stat` | Thread state, CPU times (jiffies), priority |
| `/proc/[pid]/task/[tid]/schedstat` | On-CPU time, wait time, context switches |
| `/proc/[pid]/task/[tid]/comm` | Thread name |
| `/proc/[pid]/status` | Process-wide memory, threads, signals |
| `/proc/[pid]/maps` | Memory mappings (anonymous, file-backed, heap) |
| `/proc/[pid]/smaps` | Detailed per-region memory stats (RSS, PSS) |
| `/proc/[pid]/fd/` | Open file descriptors (sockets, pipes, memfd) |
| `/proc/[pid]/io` | Cumulative I/O statistics |
| `/proc/[pid]/net/tcp`, `/proc/[pid]/net/udp` | Network connections |
| `/proc/[pid]/cgroup` | Control group (systemd resource management) |

---

## Conclusion

Manifold's performance profile reveals a **classic static DSP graph architecture** that prioritizes low latency (no graph rebuilds) over CPU efficiency. The 135% CPU usage is not caused by specific expensive features (morph, granulator, PVOC) but by **processing 120+ nodes every block regardless of voice activity**.

**The 80/20 Fix:** Add early-exit bypass logic to `EnvelopeFollowerNode` and `SineBankNode`. This alone should reduce CPU usage from 135% to ~20-30%, leaving headroom for additional voices, effects, or lower latency settings.

**Secondary Benefits:**
- Better battery life (laptops)
- Lower thermal throttling
- Ability to run more instances
- Reduced chance of audio dropouts under system load

The ImGui rendering at 60fps and LuaJIT memory usage are acceptable trade-offs for the flexibility provided. Focus optimization efforts on DSP node bypass logic for immediate, measurable improvement.

---

## Appendix: File Locations

**DSP Nodes:**
- `dsp/core/nodes/EnvelopeFollowerNode.cpp/h`
- `dsp/core/nodes/SineBankNode.cpp/h`
- `dsp/core/nodes/OscillatorNode.cpp/h`
- `dsp/core/nodes/SampleRegionPlaybackNode.cpp/h`
- `dsp/core/nodes/PhaseVocoderNode.cpp/h`
- `dsp/core/nodes/GranulatorNode.cpp/h`

**Graph Runtime:**
- `manifold/primitives/scripting/GraphRuntime.cpp`
- `dsp/core/graph/PrimitiveNode.h`

**Lua Scripts:**
- `UserScripts/projects/Main/dsp/midisynth_integration.lua`
- `UserScripts/projects/Main/lib/sample_synth.lua`
- `UserScripts/projects/Main/lib/voice_pool.lua`

**OSC/Control:**
- `manifold/primitives/control/OSCServer.cpp`
- `manifold/primitives/control/ControlServer.cpp`
- `manifold/core/BehaviorCoreEditor.cpp` (30Hz timer)

**Lua Engine:**
- `manifold/primitives/scripting/core/LuaCoreEngine.cpp`
