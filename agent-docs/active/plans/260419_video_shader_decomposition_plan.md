# Video/Shader Primitive Decomposition Plan

## Goal

Decouple the video capture subsystem (`VideoCaptureManager`) from the shader effect subsystem (`VideoSynthPrimitive`) and extract both from direct entanglement with the OpenGL renderer (`ImGuiDirectHost`).

The current implementation fuses V4L2 hardware capture, GLSL shader generation, multi-pass GL rendering, and feedback-buffer management into a single implicit dependency graph. A change in any one area requires touching code in all three domains.

This plan establishes clean architectural seams following existing codebase patterns:
- `CustomSurfaceProvider` interface (analogous to JUCE callback patterns used in `MidiManager`)
- Registry/provider pattern (following `OSCEndpointRegistry`)
- pImpl idiom (following `DSPPluginScriptHost`)
- Opaque payload design (following `RuntimeNode::setCustomRenderPayload`)

---

## Non-goals

Do **not**:
- change any existing shader effect behavior or parameters;
- remove or break the WebcamViewer project;
- rewrite the V4L2 capture thread logic;
- introduce a full node-based visual shader editor;
- change the GLSL version or the existing vertex shader.

---

## Current Problem Statement

### Dependency graph today

```
LuaControlBindings.cpp
├── videoTable["listDevices"] ──→ VideoCaptureManager
├── videoTable["listEffects"] ──→ VideoSynthPrimitive
├── videoTable["buildEffectSurface"] ──→ VideoSynthPrimitive
│                                     └── hardcodes sourceType = "video_input"
│
ImGuiDirectHost.cpp
├── #include "VideoCaptureManager.h"
├── surfaceType == "video_input" ──→ getLatestFrameCopy() + upload texture
├── surfaceType == "gpu_shader" ──→ parse passes, compile shaders, bind uInputTex/uPrevTex
│                                  └── hardcodes feedback via glCopyTexSubImage2D
│                                  └── hardcodes uFeedbackTex on texture unit 2
│
VideoSynthPrimitive.cpp
├── static std::vector<VideoSynthShaderDefinition> definitions
├── generates fragment shaders with baked-in uniform names
└── lives in manifold/primitives/video/ (wrong domain)
```

### Why this is problematic

1. **Renderer knows about V4L2**: `ImGuiDirectHost` directly calls `VideoCaptureManager::instance().getLatestFrameCopy()`. The UI renderer should not know what a video capture thread is.

2. **Shader registry is compile-time only**: Every effect is a static C++ struct. Adding an effect requires recompiling the entire plugin. There is no runtime loading.

3. **Single Lua table owns two domains**: `video.listEffects()` and `video.listDevices()` share a namespace despite having nothing in common. This forces all video-related Lua code to import all shader-related code and vice versa.

4. **Implicit uniform contract**: `VideoSynthPrimitive` generates shaders referencing `uInputTex`, `uPrevTex`, `uFeedbackTex`. `ImGuiDirectHost` hardcodes binding these to GL_TEXTURE0/1/2. Renaming a uniform in one file silently breaks the other.

5. **Feedback is a renderer hack**: Cross-frame feedback (`uFeedbackTex`) is implemented inside `ImGuiDirectHost` with `glCopyTexSubImage2D`. A headless offscreen renderer using the same shaders would not have feedback.

6. **Shader pipeline assumes video input**: `buildEffectSurface` always sets `sourceType = "video_input"`. You cannot use the shader pipeline on a static image, procedurally generated texture, or another shader's output.

---

## Success Criteria

The decomposition is successful when all of the following are true:

1. `ImGuiDirectHost` does not `#include` `VideoCaptureManager.h`.
2. `VideoSynthPrimitive` is renamed/moved out of the `video/` namespace and directory.
3. Effects can be defined in JSON + GLSL files and loaded at runtime without recompiling.
4. The Lua `video` table is split into `capture` and `shaders` tables.
5. A shader pipeline descriptor declares its inputs abstractly; the renderer resolves them.
6. Feedback buffer management lives inside a shader-specific provider, not the renderer.
7. The WebcamViewer project continues to work without behavior changes.

---

## Proposed Architecture

### Layer model

```
┌─────────────────────────────────────────┐
│  Lua API Layer                          │
│  capture.*  shaders.*                   │
├─────────────────────────────────────────┤
│  Scripting Bindings (LuaControlBindings)│
│  captureTable  shadersTable             │
├─────────────────────────────────────────┤
│  Domain Primitives                      │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │ VideoCapture│  │ ShaderEffect    │   │
│  │   Manager   │  │   Registry      │   │
│  └──────┬──────┘  └────────┬────────┘   │
│         │                  │             │
│  ┌──────┴──────┐  ┌────────┴────────┐   │
│  │ VideoSurface│  │ ShaderPipeline  │   │
│  │  Provider   │  │   Descriptor    │   │
│  └──────┬──────┘  └─────────────────┘   │
├─────────┼───────────────────────────────┤
│  CustomSurfaceProvider Interface        │
├─────────┼───────────────────────────────┤
│  ImGuiDirectHost (renderer)             │
│  registerSurfaceProvider()              │
│  delegates to provider list             │
└─────────────────────────────────────────┘
```

---

## Detailed Changes

### 1. New `CustomSurfaceProvider` Interface

**New file:** `manifold/primitives/ui/CustomSurfaceProvider.h`

Following the callback-delegation pattern from `MidiManager` (which registers note-on/off callbacks without knowing the caller):

```cpp
#pragma once
#include <cstdint>
#include <string>
#include <unordered_set>

class RuntimeNode;

class CustomSurfaceProvider {
public:
    virtual ~CustomSurfaceProvider() = default;
    virtual bool handlesType(const std::string& surfaceType) const = 0;
    virtual std::uintptr_t prepareTexture(const RuntimeNode& node,
                                          int width,
                                          int height,
                                          double timeSeconds) = 0;
    virtual bool getSurfaceInfo(uint64_t stableId, int& w, int& h, uint64_t& seq) const {
        return false;
    }
    virtual void prune(const std::unordered_set<uint64_t>& touchedStableIds) = 0;
    virtual void releaseAll() = 0;
};
```

**Precedent:** `MidiManager::setNoteOnCallback()` — external code registers behavior without `MidiManager` knowing about Lua. Here, the renderer registers providers without knowing about V4L2 or GLSL.

---

### 2. `VideoSurfaceProvider` — Bridges Capture → Renderer

**New files:**
- `manifold/primitives/video/VideoSurfaceProvider.h`
- `manifold/primitives/video/VideoSurfaceProvider.cpp`

This class implements `CustomSurfaceProvider` for `surfaceType == "video_input"`. It encapsulates all GL texture upload logic that currently lives in `ImGuiDirectHost`.

```cpp
namespace manifold::video {

class VideoSurfaceProvider : public CustomSurfaceProvider {
public:
    bool handlesType(const std::string& surfaceType) const override;
    std::uintptr_t prepareTexture(const RuntimeNode& node, int w, int h, double t) override;
    bool getSurfaceInfo(uint64_t stableId, int& w, int& h, uint64_t& seq) const override;
    void prune(const std::unordered_set<uint64_t>& touched) override;
    void releaseAll() override;
private:
    struct Impl;
    std::unique_ptr<Impl> pImpl;  // follows DSPPluginScriptHost pimpl idiom
};

} // namespace manifold::video
```

**What moves:**
- `videoSurfaceStates_` map from `ImGuiDirectHost` → `VideoSurfaceProvider::Impl`
- `VideoCaptureManager::getLatestFrameCopy()` call from `ImGuiDirectHost` → `VideoSurfaceProvider`
- Texture upload, `glTexImage2D`/`glTexSubImage2D` from renderer → provider

**What stays:** `VideoCaptureManager` itself remains unchanged. It is already clean.

---

### 3. `shaders/` — New Domain Directory

**New directory:** `manifold/primitives/shaders/`

**Files to move/create:**

| New File | Source / Purpose |
|----------|-----------------|
| `ShaderEffectRegistry.h/.cpp` | Replaces `VideoSynthPrimitive`. Owns effect definitions, param specs, sanitization, shader code generation. |
| `ShaderPipelineDescriptor.h` | Pure data struct: passes, inputs, bindings, version. No GL, no logic. |
| `ShaderSurfaceProvider.h/.cpp` | Implements `CustomSurfaceProvider` for `surfaceType == "gpu_shader"`. Owns GL FBO passes, shader compilation, feedback texture. |

#### `ShaderEffectRegistry`

Following the `OSCEndpointRegistry` pattern — a registry that can be rebuilt at runtime:

```cpp
namespace manifold::shaders {

struct EffectSpec {
    std::string id;
    std::string name;
    std::string category;
    std::string description;
    std::vector<ParamSpec> params;
    std::string fragmentPreamble;
    std::string fragmentBody;
    bool usesFeedback = false;
};

class ShaderEffectRegistry {
public:
    static ShaderEffectRegistry& instance();

    void registerBuiltinEffects();  // loads the current static set
    bool loadEffectFromManifest(const juce::File& manifestJson,
                                const juce::File& fragmentGlsl);

    std::vector<EffectSpec> listEffects() const;
    const EffectSpec* findEffect(const std::string& id) const;

    std::string vertexShader() const;
    std::string fragmentShaderFor(const std::string& effectId,
                                  bool includeBlendEpilogue) const;
    std::unordered_map<std::string, float> sanitizeParams(
        const std::string& effectId,
        const std::unordered_map<std::string, float>& params) const;
};

} // namespace manifold::shaders
```

**Runtime loading format** (proposed JSON manifest):

```json
{
  "id": "optical-flow",
  "name": "Optical Flow",
  "category": "feedback",
  "description": "Horn-Schunck optical flow with advection",
  "usesFeedback": true,
  "params": [
    { "id": "intensity", "name": "Intensity", "min": 0, "max": 1, "default": 0.5, "step": 0.01 },
    { "id": "speed",     "name": "Speed",     "min": 0, "max": 3, "default": 1.0, "step": 0.1 }
  ]
}
```

The fragment shader lives in a separate `.glsl` file next to the manifest. The registry loads both at runtime.

**Backward compatibility:** `registerBuiltinEffects()` preserves all current C++ definitions so nothing breaks during migration.

---

### 4. `ShaderSurfaceProvider` — Owns GL Pipeline + Feedback

This class replaces the `ShaderSurfaceState` and all pass-rendering logic currently inside `ImGuiDirectHost`.

**Key design: Input bindings are abstract**

```cpp
struct InputBinding {
    std::string uniformName;   // e.g. "uInputTex"
    std::string sourceType;    // e.g. "video_input" or "external"
    int textureUnit = 0;
};

struct ShaderPipelineDescriptor {
    int version = 2;
    std::string kind = "shaderQuad";
    std::string shaderLanguage = "glsl";
    std::vector<Pass> passes;
    std::vector<InputBinding> inputs;
    std::string fitMode = "contain";
};
```

When the renderer asks the provider to prepare a texture, the provider first resolves its inputs. If an input declares `sourceType == "video_input"`, the provider asks the renderer's provider list for a `VideoSurfaceProvider` and samples from it.

**Feedback becomes a provider-internal feature:**

```cpp
class ShaderSurfaceProvider : public CustomSurfaceProvider {
    // ...
private:
    struct PassState {
        unsigned int program = 0;
        unsigned int fbo = 0;
        unsigned int colorTex = 0;
        // ...
    };
    struct SurfaceState {
        std::vector<PassState> passes;
        unsigned int feedbackTex = 0;
        int feedbackWidth = 0;
        int feedbackHeight = 0;
        // ...
    };
};
```

The provider manages its own `glCopyTexSubImage2D` feedback cycle. The renderer has no idea feedback exists — it just sees a provider returning a texture handle.

---

### 5. Renderer Registers Providers

**In `ImGuiDirectHost.h`:**

```cpp
class ImGuiDirectHost : public juce::Component, private juce::OpenGLRenderer {
public:
    void registerSurfaceProvider(std::shared_ptr<CustomSurfaceProvider> provider);
    void unregisterSurfaceProvider(const std::string& typeHint);
    // ...
private:
    std::vector<std::shared_ptr<CustomSurfaceProvider>> surfaceProviders_;
    // Remove: shaderSurfaceStates_, videoSurfaceStates_
};
```

**In application init** (wherever the plugin editor is constructed):

```cpp
host.registerSurfaceProvider(std::make_shared<manifold::video::VideoSurfaceProvider>());
host.registerSurfaceProvider(std::make_shared<manifold::shaders::ShaderSurfaceProvider>());
```

**`prepareCustomSurfaceTexture` becomes a loop:**

```cpp
std::uintptr_t ImGuiDirectHost::prepareCustomSurfaceTexture(
    const RuntimeNode& node, int width, int height, double timeSeconds) {

    const auto surfaceType = node.getCustomSurfaceType();
    for (auto& provider : surfaceProviders_) {
        if (provider->handlesType(surfaceType)) {
            return provider->prepareTexture(node, width, height, timeSeconds);
        }
    }
    return 0;
}
```

---

### 6. Lua API Split

**Current (fused):**

```lua
video.listDevices()        -- V4L2
video.listModes(index)     -- V4L2
video.open(index, w, h, fps) -- V4L2
video.listEffects()        -- GLSL
video.buildEffectSurface(layers, fitMode) -- GLSL + hardcoded video
```

**Proposed (separated):**

```lua
-- Domain: capture hardware
capture.listDevices()
capture.listModes(deviceIndex)
capture.open(deviceIndex, width, height, fps)
capture.close()
capture.isOpen()
capture.getLastError()

-- Domain: shader effects
shaders.listEffects()
shaders.buildPipeline(layerList)  -- returns a gpu_shader descriptor

-- Domain: surfaces (rendered by registered providers)
-- These are just opaque descriptors set on RuntimeNode:
-- node:setCustomSurface("video_input", { fitMode = "contain" })
-- node:setCustomSurface("gpu_shader", pipelineDescriptor)
```

**WebcamViewer behavior change:**

```lua
-- Old (tangled):
local layers = { { effectId = "glitch", blendMode = "normal", opacity = 1.0, params = {} } }
local payload = video.buildEffectSurface(layers, "contain")
viewport.node:setCustomSurface("gpu_shader", payload)

-- New (explicit):
local pipeline = shaders.buildPipeline({
    { effectId = "glitch", params = { intensity = 0.5 } },
    { effectId = "optical-flow", params = { intensity = 0.3 } }
})
-- The pipeline descriptor internally declares it needs a video input.
-- The ShaderSurfaceProvider resolves this at render time.
viewport.node:setCustomSurface("gpu_shader", pipeline)
```

The Lua behavior file only needs to change its API calls. The logic (layer tabs, param sliders, persistence) stays identical.

---

### 7. Uniform Contract Becomes Explicit

**Current:** Both `VideoSynthPrimitive` and `ImGuiDirectHost` share magic strings.

**Proposed:** The `ShaderEffectRegistry` publishes a header/contract that both generator and renderer consume:

```cpp
namespace manifold::shaders {

struct UniformContract {
    static constexpr const char* kTime = "uTime";
    static constexpr const char* kResolution = "uResolution";
    static constexpr const char* kInputTex = "uInputTex";
    static constexpr const char* kPrevTex = "uPrevTex";
    static constexpr const char* kFeedbackTex = "uFeedbackTex";
    static constexpr const char* kBlendMode = "uBlendMode";
    static constexpr const char* kOpacity = "uOpacity";
};

} // namespace manifold::shaders
```

The preamble generator and the GL binder both reference `UniformContract::kInputTex`. Renaming is a single-line change.

---

## Directory Layout After Refactor

```
manifold/primitives/
├── video/
│   ├── VideoCaptureManager.h/.cpp      # V4L2 only, no GL, no shaders
│   └── VideoSurfaceProvider.h/.cpp     # bridges VideoCaptureManager → CustomSurfaceProvider
│
├── shaders/
│   ├── ShaderEffectRegistry.h/.cpp     # effect definitions + param sanitization
│   ├── ShaderPipelineDescriptor.h      # pure data: passes, inputs, bindings
│   ├── ShaderSurfaceProvider.h/.cpp    # GL FBO passes, owns feedback texture
│   └── UniformContract.h               # shared uniform name constants
│
├── ui/
│   ├── RuntimeNode.h/.cpp              # unchanged
│   └── CustomSurfaceProvider.h         # new interface
│
└── scripting/bindings/
    └── LuaControlBindings.cpp          # split into captureTable + shadersTable
```

---

## Coupling Removed

| Before | After |
|--------|-------|
| `ImGuiDirectHost.cpp` `#include`s `VideoCaptureManager.h` | Renderer only knows `CustomSurfaceProvider` interface |
| `VideoSynthPrimitive` lives in `video/` namespace | `ShaderEffectRegistry` lives in `shaders/` namespace |
| `video` Lua table does both capture and shaders | `capture` and `shaders` are separate tables |
| `buildEffectSurface` hardcodes `sourceType = "video_input"` | Pipeline descriptor declares abstract inputs |
| Feedback is hacked into `ImGuiDirectHost` | Feedback is internal to `ShaderSurfaceProvider` |
| Adding an effect requires C++ recompile | Effects can be JSON/GLSL files loaded at runtime |
| Renderer has `videoSurfaceStates_` + `shaderSurfaceStates_` | Renderer has one `surfaceProviders_` vector |
| Implicit uniform contract by string convention | Explicit `UniformContract` shared between generator and binder |

---

## Migration Strategy

### Phase 1 — Interface + Video Provider (low risk)

1. Create `CustomSurfaceProvider.h`.
2. Create `VideoSurfaceProvider` with pImpl.
3. Move `videoSurfaceStates_` logic from `ImGuiDirectHost` into `VideoSurfaceProvider`.
4. Add `registerSurfaceProvider()` to `ImGuiDirectHost`.
5. Wire `VideoSurfaceProvider` at app init.
6. Verify WebcamViewer still works (no shader path changes yet).

**Validation:**
- Standalone boots cleanly
- WebcamViewer video feed renders correctly
- No `video_input` regressions

### Phase 2 — Shader Registry + Provider (medium risk)

1. Create `shaders/` directory.
2. Move `VideoSynthPrimitive` → `ShaderEffectRegistry` (rename, keep all current effects).
3. Create `ShaderPipelineDescriptor.h`.
4. Create `ShaderSurfaceProvider` with pImpl.
5. Move `shaderSurfaceStates_`, pass compilation, feedback logic from `ImGuiDirectHost`.
6. Wire `ShaderSurfaceProvider` at app init.
7. Update `LuaControlBindings`: split `video` table into `capture` + `shaders`.

**Validation:**
- All 23 effects still list and render correctly
- Feedback shaders (optical-flow, datamosh, etc.) still work
- WebcamViewer layer pipeline works

### Phase 3 — Runtime Effect Loading (low risk, additive)

1. Define JSON manifest schema.
2. Implement `ShaderEffectRegistry::loadEffectFromManifest()`.
3. Add a `UserScripts/shaders/` directory for runtime definitions.
4. Load manifests at app startup or on `shaders.reload()` Lua call.

**Validation:**
- A new effect can be added as a `.json` + `.glsl` file without recompiling
- Builtin effects still work

### Phase 4 — Lua API Migration (low risk)

1. Update WebcamViewer `main.lua` to use `capture.*` and `shaders.*`.
2. Deprecate old `video.*` bindings (print warning, keep working).
3. After deprecation period, remove old fused API.

---

## Open Questions

1. **Should `ShaderSurfaceProvider` resolve `video_input` itself, or ask the renderer?**
   - Option A: Provider resolves directly (couples shader provider to video provider).
   - Option B: Renderer pre-resolves inputs and passes texture handles to the provider.
   - **Current leaning:** Option B — the renderer owns the provider list, so it should resolve cross-provider dependencies.

2. **Should the feedback buffer be per-pass or per-pipeline?**
   - Current implementation has one feedback texture for the entire pipeline (final output).
   - Some advanced effects might want per-pass feedback.
   - **Current leaning:** Keep one feedback texture per pipeline for now. Extend descriptor later if needed.

3. **Should vertex shaders also be loadable at runtime?**
   - Current system uses one shared vertex shader for all effects.
   - **Current leaning:** Keep the shared vertex shader baked in. Add runtime vertex shader loading only when a real use case appears.

---

## Relation to Other Active Work

This decomposition is **orthogonal** to:
- Rack UI framework work (`active/rack-ui/`)
- Modulation engine (`260330_modulation_engine_architecture_worksheet.md`)
- SIMD porting (`260419_simd_porting_guide.md`)

It enables future work by making the shader system a first-class primitive that other subsystems can consume without dragging in V4L2.
