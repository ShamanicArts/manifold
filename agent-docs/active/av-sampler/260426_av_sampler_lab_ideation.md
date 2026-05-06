# A/V Sampler Lab — Ideation & Architecture Reference

**Date:** 2026-04-26
**Source:** User discussion synthesizing existing lab projects (MLLab, VideoSamplerLab, VideoPolySamplerLab, VideoSliceRackLab, WebcamViewer) plus existing FX and shader infrastructure
**Status:** IDEATION — architecture reference for a future implementation agent

---

## Verified Findings / Corrections

These notes supersede any earlier loose implementation assumptions:

- **Fresh project, not single-lab scaffold:** This project is broader than any one reference lab. Start from a new project and steal focused pieces from all labs rather than mutating `VideoSamplerLab`, `VideoPolySamplerLab`, or `VideoSliceRackLab` wholesale.
- **Poly playback is already proven:** `VideoPolySamplerLab/dsp/default_dsp.lua` proves the core 8-voice polyphonic audio model: shared capture copied to 8 `SampleRegionPlaybackNode`s, voice allocation/stealing, per-voice sample paths, and mixed output. Treat this as a valid reference for poly mode.
- **Slice playback is already proven:** `VideoSliceRackLab` proves independent one-shot slice lanes over one committed capture, root-major MIDI mapping, active slice state inference, waveform marker editing, and dynamic active-cell video rendering.
- **Pose detection is already proven:** MLLab already loads MoveNet, parses 17 keypoints, and draws the skeleton overlay. The new work is publishing/mapping those normalized values, not inventing pose detection from scratch.
- **Segmented capture is the main new plumbing:** `VideoRetrospectiveCapture::ingestFrame(FrameData, ...)` already exists, but current Lua-facing `videoCap:ingestLatest()` pulls raw webcam frames. The integration task is to get the ML-composited/segmented RGBA frame into that existing ingest path without pushing full RGBA tables through Lua.
- **Pose mapping UI is core:** Pose-to-parameter mapping should be designed as part of the main instrument, not deferred as late polish.
- **MIDI ownership is mixed in existing labs:** Mono/poly sampler labs use UI-polled MIDI with encoded trigger params; slice rack consumes MIDI in DSP and lets UI observe state. The new project should intentionally choose or standardize this, rather than inheriting inconsistency accidentally.

---

## Core Idea

A sampler/looper project that combines:

- **Live webcam input** with real-time ML segmentation (background removal)
- **Pose detection** overlay on the segmented input
- **Shader composite** with 4-8 GPU effect layers
- **Video sampler engine** with audio-synced capture and playback
- **Polyphonic & slice playback modes** (toggleable)
- **Horizontal playback strip** — row of up to 8 video panels when voices active
- **Audio FX chain** using the existing `fx_definitions` + `fx_slot` rack module pattern
- **Pose-to-parameter mapping** — specific keypoints drive parameters (likely via OSC in backend)

The capture pipeline removes the background **before** frames enter the retrospective ring. The sampler plays back pre-cleaned footage. No inference runs at playback time.

---

## Existing Code to Leverage

### ML / Segmentation

| File | Role |
|------|------|
| `manifold/primitives/ml/MLPipeline.h/.cpp` | ONNX session wrapper; auto NCHW/NHWC; float/int32 input; `setNormalization(scale, bias)` |
| `manifold/primitives/ml/MLMaskSurfaceProvider.h/.cpp` | Shared inference cache; handles `ml_mask` + `ml_composite`; CPU postprocess (sigmoid, threshold, feather, invert); transparent background when `background=0` |
| `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` | `ml.load()`, `ml.infer()`, `ml.inferFrame()`, `pipeline:setNormalization()` |
| `UserScripts/projects/MLLab/ui/behaviors/main.lua` | Pose inference with MoveNet; 17 COCO keypoint parsing; skeleton overlay via `setDisplayList()`; keypoint inspector |
| `UserScripts/projects/MLLab/ui/main.ui.lua` | Three-viewport layout (live, mask, composite) + param controls |
| `UserScripts/projects/WebcamViewer/ui/behaviors/main.lua` | Per-stack ML segmentation tab; `setNodeSurfaceWithPipeline()` renders `ml_composite`; param persistence |

**Key behavior:** `MLMaskSurfaceProvider` outputs RGBA with alpha = mask when `background=0`. This enables alpha compositing in the blend stack.

### Video Sampler Engine

| File | Role |
|------|------|
| `manifold/primitives/video/VideoCaptureManager.h/.cpp` | V4L2 threaded capture; `getLatestFrameCopy()`; `FrameData {width, height, sequence, rgba}` |
| `manifold/primitives/video/VideoRetrospectiveCapture.h/.cpp` | Ring buffer with `hostSamplePosition` + `hostTimeSeconds`; `ingestLatestFrame()`; `copyRecentToSampler()`; time + memory pruning |
| `manifold/primitives/video/VideoSampler.h/.cpp` | Committed frame list; binary search `getFrameAtNormalizedPosition()`; fallback transport (play/pause/seek/loop/oneShot) |
| `manifold/primitives/video/VideoSamplerRegistry.h/.cpp` | Named `createSampler()` / `createCapture()`; lookup by ID |
| `manifold/primitives/video/VideoSurfaceProvider.h/.cpp` | `video_input` surface; supports `source="live"` or `source="sampler"` with `samplerId` + `position` |
| `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` | `videoSampler.new()`, `.capture()`, `:ingestLatest()`, `:copyRecentToSampler()`, transport controls |

### Video Sampler Lab Projects

| Project | What It Proves |
|---------|----------------|
| `UserScripts/projects/VideoSamplerLab/` | Mono sampler: retro/free capture modes, audio-synced commit, MIDI trigger, manual position scrub |
| `UserScripts/projects/VideoPolySamplerLab/` | 8-voice polyphonic playback from one shared capture; voice allocation/stealing; per-voice `SampleRegionPlaybackNode` timing authority; shared video sampler rendered at per-voice positions |
| `UserScripts/projects/VideoSliceRackLab/` | 8-slice drum rack; one-shot slices over same capture; MIDI root-major mapping; waveform editor with draggable slice markers; dynamic active-slice video rendering |

All three share the same DSP pattern:
- `RetrospectiveCaptureNode` (audio) + `VideoRetrospectiveCapture` (video)
- Same `samplesBack` for both on trigger
- `SampleRegionPlaybackNode` for audio timing authority
- Video follows audio loop-aware position

### Shader / Composite System

| File | Role |
|------|------|
| `manifold/primitives/shaders/ShaderEffectRegistry.h/.cpp` | 30+ built-in effects (distortion, delay, filter, reverb, etc.); `listEffects()`, `findEffect()`, param sanitization |
| `manifold/primitives/shaders/ShaderSurfaceProvider.h/.cpp` | `gpu_shader` surface; resolves `video_input` / `generated_source` input textures |
| `manifold/primitives/composite/CompositeSurfaceProvider.h/.cpp` | `gpu_composite` surface; blend ops with alpha-aware compositing |
| `UserScripts/projects/WebcamViewer/ui/behaviors/main.lua` | A/B stack shader pipeline; `shaders.buildPipeline(layers, fitMode, source)`; per-layer effect params; composite blend ops |

**Blend ops available:** normal, add, screen, multiply, overlay, difference — all alpha-aware using `blend.a * uOpacity`.

**WebcamViewer's shader pipeline pattern:**
```lua
local layers = {
  { enabled = true, effectId = "glitch", params = { intensity = 0.6 } },
}
local source = { type = "webcam" }
local ok, payload = pcall(shaders.buildPipeline, layers, "contain", source)
widget.node:setCustomSurface("gpu_shader", payload)
```

### Audio FX System

| File | Role |
|------|------|
| `UserScripts/projects/Main/lib/fx_definitions.lua` | 21 swappable effect definitions: Chorus, Phaser, WaveShaper, Compressor, StereoWidener, Filter, SVF Filter, Reverb, Stereo Delay, Multitap, Pitch Shift, Granulator, Ring Mod, Formant, EQ, Limiter, Transient, Bitcrusher, Shimmer, Reverse Delay, Stutter. Each has `create()` + param setters. |
| `UserScripts/projects/Main/lib/fx_slot.lua` | Swappable FX slot with dry/wet mixing. Lazy-instantiates effects. Only selected effect active in graph. `applySelection()`, `applyParam()`, `applyMix()`. |
| `UserScripts/projects/Main/lib/rack_modules/fx.lua` | Multi-slot FX rack module. Routes params `/fx/{slot}/type`, `/fx/{slot}/mix`, `/fx/{slot}/param/{n}` to slots. |
| `UserScripts/projects/BappFxChain/dsp/default_dsp.lua` | Fixed 8-stage FX chain (loPass → compressor → comb → notch → freqShift → degrade → echo → limitCompDist) with per-stage bypass. Alternative simpler pattern. |

### OSC / Control

| File | Role |
|------|------|
| `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` | `osc.send(address, ...values)`, `osc.sendTo(ip, port, address, ...values)`, `osc.registerEndpoint(path, { type=..., range={min,max}, access=..., description=... })`, `osc.removeEndpoint(path)` |
| `manifold/primitives/control/OSCEndpointRegistry.h` | Endpoint descriptor with path, type, range, access, description, category |

### MIDI

| File | Role |
|------|------|
| `UserScripts/projects/VideoSamplerLab/ui/behaviors/main.lua` | MIDI input handling pattern: `Midi.pollInputEvent()`, NOTE_ON/NOTE_OFF/CC123, encoded trigger params for DSP |
| `UserScripts/projects/VideoSliceRackLab/ui/behaviors/main.lua` | MIDI root-major slice mapping: root → slice 1, root+2 → slice 2, etc. |

---

## Background Removal at Capture

The segmentation runs on the **live input stream**, not at playback.

Flow:
1. Webcam feeds `MLMaskSurfaceProvider` (`ml_composite` with `background=0`)
2. Segmented output (transparent background) is visible in the input viewport
3. Same segmented frames are ingested into `VideoRetrospectiveCapture` via the source-agnostic `ingestFrame()` path
4. On capture trigger, `copyRecentToSampler()` commits pre-cleaned frames
5. Sampler plays back already-bg-removed footage — zero inference at playback

This means the ingest path should ultimately call `VideoRetrospectiveCapture::ingestFrame()` with a segmented `FrameData`, not use the current raw-webcam `ingestLatestFrame()` path. The exact API is TBD, but the likely clean approach is a C++ helper/binding that applies the same segmentation postprocess used by `MLMaskSurfaceProvider` and ingests the resulting RGBA directly. Avoid moving full frame RGBA through Lua tables.

Constraint: **ring stores cleaned frames**.

---

## Polyphonic vs Slice Mode

### Polyphonic mode
- One capture → one `VideoSampler`
- Up to 8 voices, each queries same sampler at its own `SampleRegionPlaybackNode` loop-aware position
- MIDI note allocation with voice stealing (like VideoPolySamplerLab)
- Horizontal row of video panels — one per active voice, all in a single row

### Slice mode
- One capture → one `VideoSampler`
- 8 slices with start/end windows over the same capture
- Each slice independently triggerable as one-shot
- MIDI root-major note mapping (like VideoSliceRackLab)
- Horizontal row shows active slices only

Mode toggle param switches DSP graph interpretation and MIDI routing.

---

## Output Video — Shader + Sample Playback

User's description: the output video viewport has the shader composite as its background layer, with the sample video playback rendered on top of it. The video playback shows the active voices as panels in a **single horizontal row** (1 row high, up to 8 columns wide). Aspect ratio of the source video is **preserved**.

This means:
- **Width per voice** = total row width ÷ active voice count
- **Height per voice** = width per voice ÷ video aspect ratio (preserved)
- As voice count increases, each panel gets narrower, and therefore shorter proportionally

| Voices | Width per panel | Height per panel (preserved AR) |
|--------|----------------|--------------------------------|
| 1 | Full row width | Full row height (tallest) |
| 4 | ¼ row width each | ¼ the height of 1-voice case |
| 8 | ⅛ row width each | ⅛ the height of 1-voice case |

The shader composite (`gpu_shader` or `gpu_composite` surface) forms the background. The video playback row is composited over it as child panels positioned side by side in one row.

Reference UI structure: `VideoPolySamplerLab/ui/main.ui.lua` defines `samplerGridViewport()` which creates a parent `sampleViewport` containing 8 child `voiceViewport` panels. The variant here should use the same parent/child-panel idea, but arrange active children in a single horizontal row with preserved aspect ratio rather than a grid.

---

## Pose → Parameter Mapping

Pose inference runs on the live input/segmented preview path. MLLab already proves model loading, MoveNet inference, 17-keypoint parsing, confidence thresholding, inspector text, and skeleton overlay.

New work for this project:

- Publish normalized keypoint values to OSC endpoints: `/avlab/pose/{keypoint}/{property}`
- Example: `/avlab/pose/nose/x`, `/avlab/pose/left_wrist/y`, `/avlab/pose/both_hands/spread`
- Register endpoints with current Lua API shape:
  ```lua
  osc.registerEndpoint("/avlab/pose/nose/x", {
    type = "f",
    range = { 0, 1 },
    access = 3,
    description = "Normalized nose X position"
  })
  ```
- Broadcast values with `osc.send(path, value)`
- Build mapping UI as a first-class part of the instrument, not a late add-on

Mapping targets should include:

- FX slot params (`/avlab/fx/{slot}/param/{n}` or project-selected equivalent)
- Shader layer params
- Sampler params such as speed, loop points, slice selection, or mode-specific controls

Mapping UI shape is still TBD, but it should ship with the pose-mapping behavior rather than after it.

---

## What Exists vs What Needs Building

### Already Built (can copy/adapt)

| Component | Status | Source |
|-----------|--------|--------|
| ONNX ML pipeline | ✅ Working | MLLab, WebcamViewer |
| Segmentation with transparent bg | ✅ Working | `MLMaskSurfaceProvider` |
| Pose detection + overlay | ✅ Working | MLLab |
| Video capture/sampler engine | ✅ Working | VideoSamplerLab, VideoPolySamplerLab, VideoSliceRackLab |
| Shader effect pipeline | ✅ Working | WebcamViewer |
| Audio FX slot system | ✅ Working | `fx_definitions.lua` + `fx_slot.lua` |
| OSC send/register | ✅ Working | LuaControlBindings |

### Needs Integration (new project combining the above)

| Component | Status | Notes |
|-----------|--------|-------|
| Fresh project shell | 🆕 New | New project; do not scaffold from one lab wholesale |
| Segmented capture pipeline | 🆕 New | ML-composited `FrameData` → existing `VideoRetrospectiveCapture::ingestFrame()` path |
| Poly/slice mode integration | 🆕 New | Reuse proven poly and slice DSP patterns behind one instrument/mode model |
| Horizontal playback row | 🆕 New | Single row of up to 8 active voice/slice video panels |
| Pose → OSC mapping UI | 🆕 New | Config UI + publishing/routing backend; core feature, not polish |
| FX slot integration in sampler DSP | 🆕 New | Post-mix sampler output → fx_slot chain → master |

---

## File References by Category

### C++ Core
- `manifold/primitives/ml/MLPipeline.h/.cpp`
- `manifold/primitives/ml/MLMaskSurfaceProvider.h/.cpp`
- `manifold/primitives/video/VideoCaptureManager.h/.cpp`
- `manifold/primitives/video/VideoRetrospectiveCapture.h/.cpp`
- `manifold/primitives/video/VideoSampler.h/.cpp`
- `manifold/primitives/video/VideoSamplerRegistry.h/.cpp`
- `manifold/primitives/video/VideoSurfaceProvider.h/.cpp`
- `manifold/primitives/shaders/ShaderEffectRegistry.h/.cpp`
- `manifold/primitives/shaders/ShaderSurfaceProvider.h/.cpp`
- `manifold/primitives/composite/CompositeSurfaceProvider.h/.cpp`
- `manifold/primitives/scripting/bindings/LuaControlBindings.cpp`
- `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp`

### DSP Nodes
- `dsp/core/nodes/RetrospectiveCaptureNode.h/.cpp`
- `dsp/core/nodes/SampleRegionPlaybackNode.h/.cpp`
- `dsp/core/nodes/QuantizerNode.h/.cpp`

### FX System
- `UserScripts/projects/Main/lib/fx_definitions.lua`
- `UserScripts/projects/Main/lib/fx_slot.lua`
- `UserScripts/projects/Main/lib/rack_modules/fx.lua`
- `UserScripts/projects/BappFxChain/dsp/default_dsp.lua`

### Reference Lab Projects
- `UserScripts/projects/MLLab/`
- `UserScripts/projects/WebcamViewer/`
- `UserScripts/projects/VideoSamplerLab/`
- `UserScripts/projects/VideoPolySamplerLab/`
- `UserScripts/projects/VideoSliceRackLab/`

---

## Open Questions (for implementer)

1. **Layout:** The spatial arrangement of viewports and controls has not been specified. Implementer should propose a layout based on the component list.
2. **Seg-capture plumbing:** Exact C++/Lua API shape for ingesting ML-composited `FrameData` into `VideoRetrospectiveCapture::ingestFrame()` without Lua RGBA table transfer.
3. **FX chain position:** Default should likely be post-mix sampler FX first; per-voice FX can be a later design if needed.
4. **Pose mapping UI:** How users select keypoint → target param mappings. Dropdown? Drag-drop? Manual path entry? This is core functionality, not deferred polish.
5. **Shader composite as master or preview:** Whether the 4-8 shader layers are the final output background, a preview, or one input to a larger composition.
6. **MIDI/control ownership:** Existing labs differ: mono/poly use UI-polled MIDI encoded to DSP params; slice rack consumes MIDI in DSP. Choose intentionally for this project.
7. **Frame storage for segmented capture:** Raw RGBA is expensive. Whether to implement early compression, resolution clamp, or max retained bytes tuning.

---

## Implementation Guidance for Future Agent

1. Create a fresh project and steal focused patterns from each lab; do **not** treat any one lab as the scaffold.
2. Use `VideoPolySamplerLab/dsp/default_dsp.lua` as the proven reference for 8-voice polyphonic audio playback and per-voice timing paths.
3. Use `VideoSliceRackLab` as the proven reference for slice one-shots, root-major note mapping, waveform marker editing, active-state observation, and dynamic video-cell layout.
4. Use MLLab as the proven reference for segmentation controls, MoveNet pose inference, keypoint parsing, skeleton overlay, and keypoint inspector behavior.
5. Use WebcamViewer as the proven reference for shader layer UI, `shaders.buildPipeline()`, `gpu_shader`, `gpu_composite`, blend ops, and ML segmentation surface controls.
6. Use `fx_definitions.lua` + `fx_slot.lua` for post-mix sampler FX. Start post-mix; only design per-voice FX if explicitly needed later.
7. Implement segmented capture by feeding ML-composited RGBA frames into the existing `VideoRetrospectiveCapture::ingestFrame()` path. Avoid Lua-side full-frame pixel transfer.
8. Treat pose→parameter mapping UI as part of the core instrument flow. Publishing normalized OSC values alone is not sufficient for the intended UX.
9. Define actual vertical slices in a separate slices overview before implementation. Do not invent a mono-first/poly-later phase order unless the slice plan explicitly calls for it.
