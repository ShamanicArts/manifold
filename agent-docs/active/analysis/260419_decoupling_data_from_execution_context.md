# Decoupling Data from Execution Context — Manifold Architectural Analysis

**Status:** Active analysis  
**Date:** 2026-04-19  
**Scope:** UI/DSP scene graph, node ownership, callback binding, and where Manifold succeeds or risks falling into the coupled trap  
**Sources:** `PrimitiveGraph.h`, `RuntimeNode.h`, `Canvas.h`, `ScriptableProcessor.h`, `BehaviorCoreProcessor.h`, `looper_primitives_dsp.lua`, `.ui.lua` format

---

## 1. The Trigger

> **Alex Goldring** @SoftEngineer, 1:14 PM · Apr 19, 2026:
>
> *"I was advising a client on a graphics API a few years ago. They were working on a new graphics engine, and I recommended to copy @threejs API whole cloth, at least the scene graph. The client's team decided to go a different route. They coupled the scene graph to the graphics context."*
>
> *"What this means is that to be able to create a Mesh, you can't say: `new Mesh(geometry, material)` — you have to say: `graphics.createMesh(geometry, material)`"*
>
> *"It's a subtle difference, but it has a massive implication. You can't write a scene loader, for example without supplying the graphics context, so a GLTF loader now needs it. You can't have a mesh simplification tool without the graphics context etc."*
>
> *"There is an overhead in having an abstract representation of the scene, decoupled from the actual GPU context, but the usefulness of such an abstraction far outweighs its overhead in my opinion."*

**Ian** @ianjdarrow replied:

> *"yeah, I'm slowly coming to the conclusion that I got this wrong (~exactly as your client did) in my engine and have been considering how to decouple. tricky one to thread through cleanly once everything is scaffolded around it!"*

Goldring's reply:

> *"I can feel your pain, I did that a few times in the past, never an easy journey"*

The lesson is simple and expensive: **decouple your data model from its execution context**. The cost of maintaining an abstract scene graph is real. The cost of *not* having one is catastrophic — every tool, loader, serializer, inspector, and test ends up needing the full runtime.

This document maps that lesson onto Manifold's architecture, identifying where we get it right and where coupling risk is creeping in.

---

## 2. The Core Pattern

| Approach | API | Implication |
|---|---|---|
| **Decoupled** (Three.js) | `new Mesh(geometry, material)` | Mesh is pure data. Scene loader, editor, serializer, and simplifier all work without a GPU context. |
| **Coupled** (client's engine) | `graphics.createMesh(geometry, material)` | Mesh creation requires a live graphics context. Every tool, test, and loader must spin up the full renderer. |

The subtle shift from `new X()` to `context.createX()` has **compound interest**. It seems like a minor convenience at the call site. It becomes a structural dependency across the entire toolchain.

---

## 3. Manifold's Contexts

Manifold has several "contexts" that could swallow the data model:

| Context | What It Could Swallow | Current Status |
|---|---|---|
| **Audio/DSP thread** | The node graph topology | **✅ Decoupled** — `PrimitiveGraph` is pure data, compiled to `GraphRuntime` |
| **UI rendering** | The widget tree / layout | **⚠️ Mixed** — `.ui.lua` is clean data, but `RuntimeNode` stores `sol::function` |
| **Lua VM** | UI callbacks, DSP scripts | **⚠️ Risk** — `RuntimeNode` callbacks are bound `sol::function` objects |
| **JUCE Plugin** | Project state, parameters | **✅ Decoupled** — `IStateSerializer`, path-based params abstract the host |

---

## 4. Where Manifold Gets It Right

### 4.1 DSP `PrimitiveGraph` — The Good Pattern

`PrimitiveGraph` (`manifold/primitives/scripting/PrimitiveGraph.h`) is exactly the decoupled pattern Goldring advocates:

```cpp
namespace dsp_primitives {
class PrimitiveGraph {
public:
    void registerNode(std::shared_ptr<IPrimitiveNode> node);
    void unregisterNode(std::shared_ptr<IPrimitiveNode> node);
    bool connect(std::shared_ptr<IPrimitiveNode> from, int outputIndex,
                 std::shared_ptr<IPrimitiveNode> to, int inputIndex);
    void setNodeRole(std::shared_ptr<IPrimitiveNode> node, NodeRole role);
    // ...
    std::unique_ptr<class GraphRuntime> compileRuntime(
        double sampleRate, int maxBlockSize, int numChannels);
};
}
```

Nodes are created **independently** (just data). The graph is wired **independently**. Only at compile time is it turned into a `GraphRuntime` for execution:

```cpp
auto runtime = graph->compileRuntime(sampleRate, blockSize, channels);
processor->requestGraphRuntimeSwap(std::move(runtime));
```

**Why this matters:**
- You can inspect the graph topology without the audio thread running.
- You can serialize/deserialize the graph without creating a single audio buffer.
- You can validate connections and detect cycles before any DSP context exists.
- Tests can build and verify graph structure in a headless harness.

The `PrimitiveGraph` is the **abstract model**. The `GraphRuntime` is the **compiled execution context**. This is `new Mesh()` vs `graphics.createMesh()` done correctly.

### 4.2 Declarative `.ui.lua` Format — Also Clean

```lua
return {
  id = "root",
  type = "Panel",
  x = 0, y = 0, w = 1280, h = 720,
  style = { bg = 0xff08111f },
  children = {
    {
      id = "looper_tab",
      type = "TabPage",
      x = 0, y = 34, w = 1280, h = 686,
      props = { title = "Looper" },
      components = {
        {
          id = "looper_view",
          x = 0, y = 0, w = 1280, h = 720,
          ref = "ui/components/looper_view.ui.lua",
        },
      },
    },
  },
}
```

This is a **pure data representation** of the UI. You can:
- Load it, edit it, diff it, and serialize it without a single JUCE Component existing.
- Transform it (e.g., auto-layout, responsive reflow) as plain data.
- Validate it against a schema before any rendering context exists.
- Load it in a headless test to verify structure.

This is the "GLTF loader doesn't need WebGL" equivalent. **Protect this.**

### 4.3 ScriptableProcessor / IStateSerializer — Host Abstraction Done Right

`ScriptableProcessor` (`manifold/primitives/scripting/ScriptableProcessor.h`) defines a seam that abstracts the concrete processor:

```cpp
class ScriptableProcessor : public IStateSerializer {
public:
  virtual bool setParamByPath(const std::string& path, float value) = 0;
  virtual float getParamByPath(const std::string& path) const = 0;
  virtual bool hasEndpoint(const std::string& path) const = 0;
  virtual int getNumLayers() const = 0;
  virtual bool getLayerSnapshot(int index, ScriptableLayerSnapshot& out) const = 0;
  // ...
};
```

DSP scripts and UI code interact with the processor through this interface. The concrete `BehaviorCoreProcessor` implements it, but scripts don't know about JUCE `AudioProcessor`, `AudioBuffer`, or the message thread.

---

## 5. Where Coupling Risk Is Creeping In

### 5.1 `RuntimeNode` Stores `sol::function` Directly

Look at `RuntimeNode.h`:

```cpp
struct CallbackSlots {
    sol::function onMouseDown;
    sol::function onMouseDrag;
    sol::function onMouseUp;
    sol::function onClick;
    sol::function onValueChanged;
    sol::function onDraw;
    sol::function onGLRender;
    sol::function onImGuiFrame;
    // ... etc
};
```

**This couples the scene graph node to the Lua VM.** A `RuntimeNode` tree cannot fully exist without a live `sol::state`.

If you ever want to:
- Load a UI layout in a **headless test** to validate structure
- Serialize a UI and restore it in a **different Lua context**
- Build a **visual editor** that manipulates the node tree without running the full engine
- Render the same UI to an **offscreen buffer for thumbnails**
- Run the **same UI model through multiple renderers** (JUCE Canvas, ImGui, web)

...you're now dragging `sol2` into every one of those contexts. The `RuntimeNode` is trying to be both the **abstract model** and the **Lua callback host**.

**Better:** Store callback identifiers or `std::function<void()>` wrappers that can be bound to anything. Let the `LuaEngine` own the mapping from ID → `sol::function`, not the node itself.

### 5.2 `Canvas` IS a JUCE Component

`Canvas` (`manifold/primitives/ui/Canvas.h`) inherits from `juce::Component` and `juce::OpenGLRenderer`:

```cpp
class Canvas : public juce::Component, public juce::OpenGLRenderer {
public:
    // Standard 2D rendering callback
    std::function<void(Canvas&, juce::Graphics&)> onDraw;
    // OpenGL rendering callbacks
    std::function<void(Canvas&)> onGLRender;
    std::function<void(Canvas&)> onGLContextCreated;
    // ...
};
```

It's trying to be both the **abstract node wrapper** (via `node_`) and the **rendering target**.

If you ever want:
- A **non-JUCE renderer** for the same UI (e.g., remote web UI, screenshot exporter)
- To instantiate the UI data model **without attaching to the Component hierarchy**
- To test layout logic **without a JUCE message loop**
- To run the UI in a **headless CI environment**

...you're stuck because `Canvas` **is** the Component.

**Better:** `RuntimeNode` is the model. `Canvas` should be a **view** onto a `RuntimeNode`, not a Component that owns one. The `RuntimeNode` tree exists first; `Canvas` Components are spawned from it as renderers.

### 5.3 DSP Script `ctx.host` Is a Kitchen Sink

In `looper_primitives_dsp.lua`:

```lua
local function hostGetSampleRate()
    if ctx.host and ctx.host.getSampleRate then
      return ctx.host.getSampleRate()
    end
    return 44100.0
end

local function hostSetParam(path, value)
    if ctx.host and ctx.host.setParam then
      return ctx.host.setParam(path, value)
    end
    return false
end
```

While defensive wrappers are good, the pattern encourages scripts to reach into the host context for everything. If the host context grows to include MIDI, tempo, Link state, etc., scripts become hard to unit-test offline without mocking the entire host.

**Better:** Keep the host seam narrow. The wrapper functions are the right idea — formalize them into a mockable interface so `buildPlugin(ctx)` can be tested with a fake host.

---

## 6. The Compounding Cost of Coupling

Goldring's tweet describes the exact trajectory:

| Stage | Decoupled Path | Coupled Path |
|---|---|---|
| **Write a scene loader** | Load data, validate, done. | Instantiate graphics context first. |
| **Write a mesh simplifier** | Operate on pure geometry data. | Need a GPU device to create working buffers. |
| **Unit test a node** | Construct in memory, assert. | Spin up full audio thread + OpenGL context. |
| **Serialize a project** | Dump data tree to JSON/Lua. | Capture full runtime state including callbacks. |
| **Visual editor** | Manipulate abstract tree, preview separately. | Editor must embed the full renderer. |
| **Headless CI** | Run structure tests with zero graphics/audio. | Cannot validate anything without the full host. |

---

## 7. Concrete Recommendations

### 7.1 Keep `.ui.lua` as the Source of Truth

The declarative `.ui.lua` format is Manifold's biggest asset for UI decoupling. Preserve it as the canonical representation. The visual editor should mutate the `.ui.lua` data and regenerate the `RuntimeNode` tree, not mutate C++ `RuntimeNode`s directly.

### 7.2 Keep `PrimitiveGraph` as the Source of Truth for DSP

Never serialize the compiled `GraphRuntime` state. The abstract `PrimitiveGraph` is what gets saved, loaded, diffed, and visualized. The runtime is ephemeral — compiled, swapped, and retired.

### 7.3 Store Callback IDs in `RuntimeNode`, Not `sol::function`

**Wrong:**
```cpp
struct CallbackSlots {
    sol::function onMouseDown;  // Tied to a specific Lua state
};
```

**Right:**
```cpp
struct CallbackSlots {
    std::string onMouseDownId;  // Resolved by LuaEngine at dispatch time
};
```

Let `LuaEngine` own the mapping from ID → `sol::function`. The `RuntimeNode` stays pure data.

### 7.4 Treat `Canvas` as a Renderer View onto `RuntimeNode` Data

**Wrong:**
```cpp
class Canvas : public juce::Component {  // Is both model AND view
    std::unique_ptr<RuntimeNode> node_;
};
```

**Right:**
```cpp
// RuntimeNode tree exists independently
RuntimeNode* root = buildUiTreeFromLua(script);

// Canvas is a thin view spawned from the tree
class Canvas : public juce::Component {
    RuntimeNode* node_ = nullptr;  // Non-owning view
};
```

### 7.5 Build Tools Against the Abstract Model

| Tool | Should Target | Should NOT Target |
|---|---|---|
| UI Inspector | `RuntimeNode` tree + `.ui.lua` data | Live JUCE Components |
| DSP Graph Viz | `PrimitiveGraph` nodes + connections | Compiled `GraphRuntime` internals |
| Project Serializer | `.ui.lua` + graph JSON/Lua | C++ object state + callbacks |
| Headless Tests | RuntimeNode structure, graph topology | Full audio thread + OpenGL context |

### 7.6 Narrow the DSP Host Seam

Formalize `ctx.host` into an explicit interface with a mock implementation:

```lua
-- Test harness provides a fake host
local fakeHost = {
  getSampleRate = function() return 48000.0 end,
  setParam = function(path, value) table.insert(recordedParams, {path, value}) end,
  getPlayTimeSamples = function() return fakeTime end,
}

local plugin = buildPlugin({ host = fakeHost, bundles = fakeBundles })
```

---

## 8. Summary

| System | Model | Runtime | Verdict |
|---|---|---|---|
| **DSP Graph** | `PrimitiveGraph` (pure data) | `GraphRuntime` (compiled, swapped) | **✅ Correctly decoupled** |
| **UI Document** | `.ui.lua` (pure data) | `RuntimeNode` + `Canvas` (instantiated) | **✅ Correctly decoupled** |
| **UI Node Tree** | `RuntimeNode` (structure) | Callbacks + Canvas rendering | **⚠️ At risk — callbacks are coupled** |
| **UI Rendering** | `RuntimeNode` data | `Canvas` as JUCE Component | **⚠️ At risk — Canvas is the Component** |
| **Project State** | `IStateSerializer` paths/values | `BehaviorCoreProcessor` implementation | **✅ Correctly decoupled** |

Manifold is in a **strong position**. The `PrimitiveGraph`/`.ui.lua` split shows the architecture already understands this. The danger is **convenience creep** — it's tempting to stash a `sol::function` on a node because it's easy, or to make `Canvas` do everything because it's already there.

> **"Simplicity for the user is a massive enabler here."** — Alex Goldring

The same applies to the architecture. A boring, stupid data model — just data, no callbacks, no contexts, no renderers — is the massive enabler. Let the execution contexts (audio thread, JUCE, Lua, ImGui) be thin layers on top.

The cost of the abstraction is real. The cost of *not* having it is Ian's pain: *"tricky one to thread through cleanly once everything is scaffolded around it."*
