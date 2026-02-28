# Persistent Graph Architecture

## Status: DESIGN DOCUMENT — Blocking issue for BehaviorCore parity

This document replaces `docs/EXPLICIT_GRAPH_LIFECYCLE_DESIGN.md` as the canonical design for graph lifecycle. The previous document proposed script-level lifecycle management; this document proposes the correct architecture: a single persistent graph that owns everything.

## Problem

BehaviorCoreProcessor has no native C++ loop engine. All looper audio lives inside the DSP graph runtime. The current `loadDspScript` path creates a **throwaway graph**, compiles it into a runtime, and **swaps out the old runtime** — destroying any live audio (loops, effects, everything).

This means:
- Switching to DSP live scripting UI kills your loops
- Switching to the donut demo UI kills your loops
- Switching back doesn't restore them (the graph data is deleted)
- `setGraphProcessingEnabled(false)` on UI exit disables everything with no way back

In the legacy `LooperProcessor`, this wasn't a problem because loop audio lived in C++ `LooperLayer` objects that were permanent members of the processor. The graph runtime was an optional add-on. In BehaviorCore, the graph IS the audio engine.

## Architecture: One Persistent Graph

### Core Principle

There is **one graph**. It lives on the processor. It never gets cleared, replaced, or disabled. It is always processing. Everything that produces or transforms audio — loop layers, effects, input routing, experimental scripts — lives as nodes inside this single graph.

### What Changes

| Current (broken) | Target |
|---|---|
| `loadDspScript` creates a local throwaway graph | Scripts add/remove nodes in the persistent graph |
| Runtime swap replaces the entire graph | Runtime recompile adds new nodes, preserves existing ones |
| `setGraphProcessingEnabled(false)` kills all audio | Graph is always enabled; individual node groups can be muted/bypassed |
| Each DSP script owns its own isolated graph | All scripts operate on the same shared graph |
| UI switch can destroy audio state | UI switch only changes what's displayed, never touches audio state |

### Processor Ownership

```
BehaviorCoreProcessor
  └── persistentGraph (PrimitiveGraph)
        ├── InputNode (passthrough, always present)
        ├── CaptureNode (retrospective capture, always present)
        ├── LoopLayer 0 (PlaybackNode + GainNode + GateNode + ...)
        ├── LoopLayer 1
        ├── LoopLayer 2
        ├── LoopLayer 3
        ├── [live scripting nodes, added/removed dynamically]
        ├── [donut demo reverb, added dynamically]
        └── OutputMix (sum of all sink nodes)
```

### Runtime Recompilation

When the graph topology changes (nodes added or removed), recompile the runtime:

1. Take a snapshot of the current persistent graph (nodes + connections)
2. Compile a new `GraphRuntime` from the snapshot
3. Publish via `requestGraphRuntimeSwap()` (existing crossfade mechanism)
4. Old runtime is retired and deleted (but the NODES still live in the persistent graph)

**Key insight:** The `GraphRuntime` is a compiled snapshot. The nodes themselves (and their internal state — loop audio buffers, playhead positions, gain values) are owned by the persistent graph via `shared_ptr`. When a new runtime is compiled from the same graph, it references the same node objects. The audio data survives.

### Node Lifetime

Nodes live as long as they're registered in the persistent graph:

```
shared_ptr<LoopPlaybackNode> layer0Playback;
//   ↑ owned by persistentGraph (via registerNode)
//   ↑ also referenced by compiled GraphRuntime
//   ↑ audio data inside the node survives runtime recompilation
```

When a script wants to remove nodes (e.g., live scripting clears its experiment):
1. Unregister the nodes from the graph
2. Recompile runtime
3. Old runtime retires (releases its shared_ptr references)
4. If no other references exist, nodes are destroyed

### What Scripts Do

Scripts no longer create graphs. They add nodes to THE graph:

```lua
-- DSP behavior script (e.g., looper_primitives_dsp.lua)
function buildPlugin(ctx)
  -- ctx.graph IS the persistent graph, not a throwaway
  
  -- Create layers and register them in the persistent graph
  for i = 1, 4 do
    local layer = ctx.bundles.LoopLayer.new({ channels = 2 })
    -- LoopLayer.new() internally calls ctx.graph.registerNode() for each sub-node
    state.layers[i] = layer
  end
  
  -- Return behavior callbacks
  return {
    onParamChange = function(path, value) ... end,
    
    -- Called when this behavior script is being replaced
    onUnload = function()
      -- Remove our nodes from the graph
      for i = 1, 4 do
        state.layers[i]:removeFromGraph()
      end
      -- Graph recompiles automatically after node removal
    end
  }
end
```

### What UI Scripts Do

UI scripts NEVER touch the graph. They send commands and read state:

```lua
-- looper_primitives_ui.lua
function ui_init()
  -- Just build UI widgets
  -- Read state via getParam() / state.params
  -- Send commands via command("SET", path, value)
  -- NEVER call loadDspScript, setGraphProcessingEnabled, or graph operations
end
```

### What Live Scripting Does

Live scripting adds experimental nodes to the persistent graph alongside everything else:

```lua
-- User types in live editor:
function buildPlugin(ctx)
  -- Add an oscillator to the existing graph (loops keep playing)
  local osc = ctx.primitives.OscillatorNode.new()
  osc:setFrequency(440)
  -- osc is now in the same graph as the loop layers
  
  return {
    onParamChange = function(path, value) ... end,
    onUnload = function()
      -- Remove just the oscillator, loops stay
      ctx.graph.unregisterNode(osc)
    end
  }
end
```

### What the Donut Demo Does

The donut demo should be ONE of:

**Option A: Different UI, same DSP** (simplest)
- `looper_donut_demo_ui.lua` is just an alternate view of the same loop layers
- No DSP script loading, just different visual rendering
- Loop data is shared because it's the same nodes

**Option B: Additional DSP alongside existing** (what was intended)
- `looper_donut_demo_dsp.lua` adds a reverb node and additional behavior to the existing graph
- Does NOT clear or replace existing loop layers
- When unloaded, removes only its own nodes
- Loop layers from the main looper script survive

**Option C: Separate layer set** (if you want isolation)
- Donut demo creates its OWN 4 layers in the same graph
- Both sets of layers coexist and produce audio
- Each UI renders its own layer set

## Implementation Approach

### Step 1: Make the graph persistent on the processor

```cpp
// BehaviorCoreProcessor.h
class BehaviorCoreProcessor {
    // This graph is created once and NEVER replaced or cleared
    std::shared_ptr<dsp_primitives::PrimitiveGraph> persistentGraph;
};
```

### Step 2: Change DSPPluginScriptHost to operate on the persistent graph

Instead of creating a local throwaway graph:

```cpp
bool DSPPluginScriptHost::loadInternal(...) {
  // BEFORE (broken):
  // auto graph = std::make_shared<PrimitiveGraph>();  // throwaway
  
  // AFTER:
  auto graph = impl->processor->getPrimitiveGraph();  // the persistent one
  
  // If previous script had an onUnload, call it
  // (it removes its own nodes from the persistent graph)
  if (impl->onUnloadCallback.valid()) {
    impl->onUnloadCallback();
  }
  
  // Script adds nodes to the persistent graph
  // ...
  
  // Recompile runtime from the persistent graph (now includes new + existing nodes)
  auto runtime = graph->compileRuntime(sampleRate, blockSize, numChannels);
  impl->processor->requestGraphRuntimeSwap(std::move(runtime));
}
```

### Step 3: Add node group tracking to DSPPluginScriptHost

Track which nodes were added by each script so they can be cleaned up:

```cpp
struct DSPPluginScriptHost::Impl {
  // Nodes added by the current script (for cleanup on unload)
  std::vector<std::shared_ptr<IPrimitiveNode>> ownedNodes;
  
  sol::protected_function onUnloadCallback;
};
```

### Step 4: Remove setGraphProcessingEnabled(false) from UI switch path

Already partially done. But more importantly, with a persistent graph there's no reason to ever disable graph processing — the graph IS the audio engine.

### Step 5: Remove graph.clear() from DSPPluginScriptHost

My earlier "fix" added `sharedGraph->clear()` before loading scripts. This is wrong for the persistent graph model. Each script should clean up its own nodes via `onUnload`, not nuke the entire graph.

### Step 6: Recompile trigger

After any topology change (node add/remove), the graph needs recompilation:

```cpp
void BehaviorCoreProcessor::recompileGraph() {
  auto runtime = persistentGraph->compileRuntime(sampleRate, blockSize, channels);
  if (runtime) {
    requestGraphRuntimeSwap(std::move(runtime));
  }
}
```

This could be called:
- After `buildPlugin()` returns
- After `onUnload()` removes nodes
- After live scripting adds/removes nodes
- Debounced if multiple changes happen quickly

## What This Enables

1. **Record loop → switch UI → switch back → loops still playing** ✅
2. **Record loop → open live scripting → add oscillator → loops + oscillator both audible** ✅
3. **Record loop → switch to donut demo → donut adds reverb → loops + reverb both audible** ✅
4. **Multiple behavior scripts coexisting** ✅
5. **Clean removal of experimental nodes without affecting loops** ✅
6. **Infinite loopers in infinite combinations** ✅

## What Needs to Happen

1. Revert my broken "fixes" (the `graph->clear()` in DSPPluginScriptHost and the commented-out `setGraphProcessingEnabled`)
2. Make `DSPPluginScriptHost::loadInternal` use the persistent graph instead of a throwaway
3. Add `onUnload` callback support so scripts clean up their own nodes
4. Add node ownership tracking per script
5. Update `looper_donut_demo_ui.lua` to either be UI-only or use additive scripting
6. Update `dsp_live_scripting.lua` to add nodes additively and clean up via onUnload
7. Remove `setGraphProcessingEnabled(false)` from all UI exit paths
8. Graph is always enabled in BehaviorCore — remove the toggle entirely or make it debug-only

## Risks

- **Recompilation cost**: Compiling a large graph takes time. Need to profile and potentially debounce.
- **Node cleanup correctness**: If a script's `onUnload` fails or misses nodes, orphaned nodes accumulate. May need a fallback sweep.
- **Shared state between scripts**: Two scripts might try to control the same node (e.g., both setting layer 0 volume). Need clear ownership rules.
- **Thread safety of graph mutation**: `PrimitiveGraph` currently uses a recursive mutex for node registration. Adding/removing nodes from scripts while the audio thread reads topology needs the existing compile-then-swap pattern to remain safe.

## References

- Legacy behavior: `looper/engine/LooperProcessor.cpp::processBlock` — layers process independently of graph
- Graph runtime: `looper/primitives/scripting/GraphRuntime.h/cpp` — compiled snapshot of graph
- Current broken path: `looper/primitives/scripting/DSPPluginScriptHost.cpp::loadInternal` — throwaway graph
- Crossfade swap: `BehaviorCoreProcessor::checkGraphRuntimeSwap` — 30ms crossfade, already works
