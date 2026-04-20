# Blend Modes as Shader Primitives

**Status:** Active analysis
**Date:** 2026-04-20
**Scope:** Blend operations as first-class shader primitives in the video/shader pipeline, composable into pipelines and future rack modules
**Sources:** `ShaderEffectRegistry.h`, `ShaderSurfaceProvider.h`, `ShaderPipelineDescriptor.h`, `LuaControlBindings.cpp`

---

## Executive Summary

Blend operations are shader primitives. They live in the same registry as effects, load from the same JSON+GLSL format, and compose into pipelines via the same descriptor system. The only difference is their uniform contract: blend ops take `uBaseTex` and `uBlendTex` instead of `uInputTex`.

**This document describes the architecture, not an implementation plan.** The WebcamViewer example project will demonstrate the pattern, but the primitives themselves are the product.

---

## 1. The Core Idea

### Current Pipeline Model

A `ShaderPipelineDescriptor` is a sequence of passes:

```
Pass 0: effect="glitch"    → output feeds Pass 1
Pass 1: effect="invert"    → output feeds Pass 2
Pass 2: effect="none"      → final output
```

This is purely sequential. Each pass renders from the output of the previous pass.

### Proposed Pipeline Model

Each pass has a **composite** toggle:

- **`composite = false`** (default): Pass renders from previous pass output. Sequential behavior.
- **`composite = true`**: Pass renders from the **original pipeline input**, then a **blend op** composites it onto the accumulated result.

```
Pass 0: effect="glitch",    composite=false  → sequential, output = glitch(source)
Pass 1: effect="invert",    composite=false  → sequential, output = invert(glitch(source))
Pass 2: effect="none",      composite=true, blendOp="multiply", opacity=0.5
                                              → effect renders from source
                                              → blend op: multiply(effectOutput, accumulated)
Pass 3: effect="optical-flow", composite=false → sequential, feeds from Pass 2 result
```

The blend op is just another shader primitive from the registry. It takes two textures and outputs the blended result.

---

## 2. Blend Ops as Registry Entries

Blend operations live in the same `ShaderEffectRegistry` as effects. They are distinguished by category.

### Effect Category

```cpp
enum class EffectCategory {
    Effect,    // Takes uInputTex, renders an effect
    BlendOp    // Takes uBaseTex + uBlendTex, renders a blend
};

struct EffectSpec {
    std::string id;
    EffectCategory category;
    std::string name;
    std::vector<ParamSpec> params;
    std::string fragmentPreamble;
    std::string fragmentBody;
};
```

### File Layout

```
manifold/shaders/
├── glitch.json               // Effect
├── glitch.glsl
├── invert.json               // Effect
├── invert.glsl
├── blend/
│   ├── normal.json           // Blend op
│   ├── normal.glsl
│   ├── multiply.json         // Blend op
│   ├── multiply.glsl
│   ├── screen.json           // Blend op
│   ├── screen.glsl
│   ├── add.json              // Blend op
│   ├── add.glsl
│   └── overlay.json          // Blend op
│   └── overlay.glsl
```

### Example Blend Op: multiply.glsl

```glsl
uniform sampler2D uBaseTex;
uniform sampler2D uBlendTex;
uniform float uOpacity;
varying vec2 vUv;

void main() {
    vec4 base = texture2D(uBaseTex, vUv);
    vec4 blend = texture2D(uBlendTex, vUv);
    vec3 result = base.rgb * blend.rgb;
    gl_FragColor = vec4(mix(base.rgb, result, uOpacity), base.a);
}
```

### Example Blend Op: multiply.json

```json
{
  "id": "multiply",
  "name": "Multiply",
  "category": "blendOp",
  "params": [
    { "id": "opacity", "name": "Opacity", "min": 0, "max": 1, "default": 1.0, "step": 0.01 }
  ]
}
```

The registry loads these exactly like effects. The category field tells the pipeline renderer how to wire uniforms.

---

## 3. Pipeline Descriptor Update

```cpp
struct Pass {
    std::string effectId;                         // Effect to run
    std::unordered_map<std::string, float> params; // Effect params
    bool composite = false;                       // true = render from original input
    std::string blendOpId;                        // Blend op to apply (if composite)
    std::unordered_map<std::string, float> blendParams; // Blend op params
    float opacity = 1.0;                          // Master opacity for this pass
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

No new top-level fields needed. The per-pass `composite` flag and `blendOpId` are sufficient.

---

## 4. Rendering Pipeline

### ShaderSurfaceProvider::prepareTexture() logic

```cpp
for (size_t i = 0; i < descriptor.passes.size(); ++i) {
    const auto& pass = descriptor.passes[i];
    
    if (!pass.composite) {
        // Sequential: effect runs on accumulated result
        accumulated = runEffectPass(pass.effectId, accumulated, pass.params);
    } else {
        // Composite: effect runs on ORIGINAL input
        auto effectOutput = runEffectPass(pass.effectId, originalInput, pass.params);
        
        // Blend op composites effectOutput onto accumulated
        accumulated = runBlendOp(
            pass.blendOpId, 
            accumulated,      // uBaseTex
            effectOutput,     // uBlendTex
            pass.opacity,
            pass.blendParams
        );
    }
}
```

### FBO Management

- **Sequential passes**: Reuse single FBO chain (ping-pong between two FBOs)
- **Composite passes**: Need temporary FBO for effect output before blending
- **Blend op pass**: Renders into the accumulated result FBO

Memory: 3 FBOs maximum (accumulated, ping-pong A, ping-pong B + temporary for composite effect output).

---

## 5. Future Rack Module Mapping

The primitives compose into rack modules without code changes:

| Rack Module | Primitive Composition |
|-------------|----------------------|
| **Video Effect** | Single `Pass` with `composite=false` |
| **Blend** | Single `Pass` with `composite=true`, `blendOpId` set |
| **Mixer** | Multiple `Pass` entries with different `blendOpId` values |
| **Feedback Loop** | Pass with `effectId` referencing a feedback-aware shader |
| **Crossfader** | Two passes, both `composite=true`, `blendOpId="normal"`, animate opacity |

A rack module is just a UI that generates a `ShaderPipelineDescriptor`. The renderer doesn't know about racks.

---

## 6. WebcamViewer Example Implementation

This is **example code only**, demonstrating how the primitives compose.

### Layer UI Model

Each layer in WebcamViewer maps to one `Pass`:

```lua
local pass = {
    effectId = layer.effectId,          -- "glitch", "invert", etc.
    params = layer.params,               -- Effect parameters
    composite = layer.composite,         -- true/false toggle
    blendOpId = layer.blendOpId,         -- "normal", "multiply", etc. (if composite)
    blendParams = layer.blendParams,     -- Blend parameters (if composite)
    opacity = layer.opacity              -- 0-1
}
```

### UI Layout per Layer

```
[Effect Dropdown] [Params...]
[Composite Toggle]
  [Blend Op Dropdown] [Opacity Slider] [Blend Params...]   -- only if composite=true
```

### Building the Pipeline

```lua
local passes = {}
for _, layer in ipairs(layers) do
    table.insert(passes, {
        effectId = layer.effectId,
        params = layer.params,
        composite = layer.composite,
        blendOpId = layer.blendOpId,
        blendParams = layer.blendParams,
        opacity = layer.opacity
    })
end

local pipeline = shaders.buildPipeline(passes, "contain")
viewport.node:setCustomSurface("gpu_shader", pipeline)
```

---

## 7. Open Questions

1. **Blend op parameter namespace collision**: If an effect and a blend op both define a parameter named `opacity`, the JSON merge is unambiguous (they're in different structs: `pass.params` vs `pass.blendParams`). No collision in practice.

2. **Composite pass count limit**: How many composite passes can we support before FBO memory is an issue? Current architecture supports arbitrary count, but each composite pass needs a temporary FBO. In practice, 4-8 layers is the UI limit anyway.

3. **Blend op feedback**: Some blend ops might want access to the previous frame's blended result (e.g., temporal blending). This would require extending the blend op uniform contract to include `uPrevTex`. Not needed for initial implementation.

---

## 8. Relation to Other Work

This is orthogonal to:
- Rack UI framework work
- Modulation engine
- SIMD porting

It depends on:
- `ShaderEffectRegistry` runtime loading (completed)
- `ShaderSurfaceProvider` pipeline rendering (completed)
- `ShaderPipelineDescriptor` data model (completed)

It enables:
- Mixer rack modules
- Complex multi-layer video synthesis
- User-defined blend operations without C++ changes
