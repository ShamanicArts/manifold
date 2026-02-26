# DSP Scripting Implementation Plan

## Overview

This document outlines the phased implementation needed to enable Lua scripting of DSP primitives - where Lua configures and wires C++ primitives, but never executes DSP on the audio thread.

## Current State

**What EXISTS:**
- ✅ DSP Primitives: `Playhead`, `LoopBuffer`, `CaptureBuffer`, `Quantizer`, `TempoInference`
- ✅ Lock-free infrastructure: `SPSCQueue`, `EventRing`
- ✅ Canvas/UI system (generic)
- ✅ Path-based commands via `EndpointResolver`
- ✅ Generic state projection to Lua

**What's MISSING:**
- ❌ Primitives factory not exposed to Lua
- ❌ No primitive wiring/connection system
- ❌ `LooperProcessor` hardcodes audio graph
- ❌ No generic `ScriptableProcessor` interface

## Phased Implementation

### Phase 1: ScriptableProcessor Interface

**Goal:** Decouple `LuaEngine` from `LooperProcessor` specifics

**Tasks:**
1. Define `ScriptableProcessor` interface:
   ```cpp
   class ScriptableProcessor {
   public:
       virtual ~ScriptableProcessor() = default;
       virtual void pushStateToLua(sol::table& state) = 0;
       virtual void setParameter(const std::string& path, float value) = 0;
       virtual float getParameter(const std::string& path) = 0;
       virtual const OSCEndpointRegistry& getEndpoints() = 0;
       virtual void handleCommand(const ControlCommand& cmd) = 0;
   };
   ```
2. Make `LooperProcessor` implement interface
3. Update `LuaEngine` to accept interface, not concrete class
4. Move looper-specific bindings out of LuaEngine

**Files to touch:**
- `looper/primitives/scripting/ScriptableProcessor.h` (expand)
- `looper/engine/LooperProcessor.h` (implement interface)
- `looper/primitives/scripting/LuaEngine.cpp` (decouple)

**Estimated effort:** 2-3 days

### Phase 2: Primitive Factory Bindings

**Goal:** Expose DSP primitives to Lua for instantiation

**Tasks:**
1. Create primitive wrappers for sol2:
   ```cpp
   // In LuaEngine.cpp
   lua["Primitives"] = lua.create_table();
   lua["Primitives"]["LoopBuffer"] = sol::factories(
       [](int length, int channels) { return std::make_shared<LoopBuffer>(length, channels); }
   );
   // ... similar for other primitives
   ```
2. Add lifecycle management (shared_ptr ownership)
3. Add configuration methods to each primitive wrapper
4. Thread-safety: Ensure Lua can only configure, not call process()

**Files to touch:**
- `looper/primitives/scripting/LuaEngine.cpp` (add factory bindings)
- `looper/primitives/dsp/*.h` (may need wrapper classes)

**Estimated effort:** 3-4 days

### Phase 3: Primitive Wiring System

**Goal:** Enable Lua to connect primitives into a graph

**Tasks:**
1. Define connection primitives:
   ```cpp
   // C++ side
   class PrimitiveNode {
   public:
       virtual void connectTo(std::shared_ptr<PrimitiveNode> target, int output, int input) = 0;
       virtual void process(AudioBuffer<float>& buffer) = 0;
   };
   ```
2. Add wiring API to Lua:
   ```lua
   -- Lua side
   input:connect(recorder)
   recorder:connect(layer1)
   layer1:setSpeed(1.5)
   ```
3. Validation: Check for cycles, mismatched channels, etc.
4. Store graph structure for audio thread execution

**Files to touch:**
- `looper/primitives/scripting/PrimitiveGraph.h` (new)
- `looper/primitives/scripting/LuaEngine.cpp` (wiring bindings)
- `looper/engine/LooperProcessor.cpp` (graph execution)

**Estimated effort:** 4-5 days

### Phase 4: Audio Thread Graph Execution

**Goal:** Refactor audio thread to execute Lua-configured graph

**Tasks:**
1. Create `AudioGraph` class that manages primitive execution order
2. Replace hardcoded looper logic with graph traversal:
   ```cpp
   void processBlock(buffer) {
       // Old: hardcoded looper logic
       // New: execute configured graph
       graph->process(buffer);
   }
   ```
3. Ensure real-time safety: no allocations, no locks during process()
4. Handle graph updates (Lua changes) via lock-free swap

**Files to touch:**
- `looper/primitives/scripting/AudioGraph.h` (new)
- `looper/engine/LooperProcessor.cpp` (refactor processBlock)
- `looper/primitives/scripting/LuaEngine.cpp` (graph updates)

**Estimated effort:** 5-7 days

### Phase 5: Lua Script API

**Goal:** Enable full plugin definition in Lua

**Tasks:**
1. Define expected Lua script structure:
   ```lua
   -- plugin.lua
   function buildPlugin(primitives)
       -- Return processing function or graph config
       return {
           inputs = 2,
           outputs = 2,
           graph = graph,
           parameters = {
               ["/tempo"] = { min = 20, max = 300, default = 120 },
           }
       }
   end
   ```
2. Load and validate scripts at startup
3. Hot-reload support (similar to UI scripts)
4. Error handling: graceful fallback if script fails

**Files to touch:**
- `looper/primitives/scripting/PluginScript.h` (new)
- `looper/engine/LooperProcessor.cpp` (script loading)

**Estimated effort:** 3-4 days

## Key Constraints

1. **Lua never on audio thread** - Configuration only, C++ owns process loop
2. **Real-time safety** - No allocations, no locks in process()
3. **Backward compatibility** - Existing looper keeps working during migration
4. **Thread-safety** - Lua (message thread) can reconfigure, audio thread reads safely

## Success Criteria

- [ ] Can define a looper entirely in Lua (no C++ changes)
- [ ] Can swap Lua script to get different plugin behavior
- [ ] Performance: < 1% CPU overhead vs hardcoded
- [ ] Hot-reload works without audio glitch

## Current Blockers

1. **Interface definition** - Need to finalize ScriptableProcessor API
2. **Graph execution model** - Need to design how audio thread traverses graph
3. **Ownership model** - Who owns primitives? Lua or C++?

## Next Steps

1. Review this plan
2. Start Phase 1 (ScriptableProcessor interface)
3. Create proof-of-concept with one primitive exposed

---

**Document Status:** Draft  
**Last Updated:** 2026-02-26  
**Author:** Claude Code Agent
