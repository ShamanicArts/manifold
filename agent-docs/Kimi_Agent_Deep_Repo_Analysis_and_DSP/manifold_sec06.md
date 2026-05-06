# 6. Visual Pipeline & Shader Integration

## 6.1 UI and Scene Graph

### 6.1.1 Canvas/RuntimeNode: Lua-Driven Hierarchical Scene Graph with ImGui Backend

Manifold's visual layer pairs `Canvas`, a JUCE `Component` with an optional `OpenGLContext`, and `RuntimeNode`, a plain C++ structure that carries the hierarchical scene-graph state. `Canvas` inherits from both `juce::Component` and `juce::OpenGLRenderer`, so each widget can render via CPU-side JUCE `Graphics` or GPU-side OpenGL callbacks. `RuntimeNode` stores bounds, style, transform, input capabilities, and a `sol::function` callback table for every event type. The bidirectional link—`Canvas` owns a `std::unique_ptr<RuntimeNode>`, and `RuntimeNode` stores raw parent/child pointers—forms a retained-mode scene graph that Lua scripts mutate from the message thread.

The `CallbackSlots` structure exposes 17 `sol::function` hooks, from `onMouseDown` to `onImGuiFrame`. This mirrors the pattern in OpenSceneGraph's Lua integration, where scripts "create scene graph objects, populate the scene graph with lua callbacks and pass back the scene graph" [^396^]. Crucially, these callbacks execute on the JUCE message thread, not the audio callback, preserving real-time safety [^371^]. When a script calls `canvas:setOnDraw(fn)`, the `sol::function` is stored in the node's callback table and later invoked inside `Canvas::paint()` or `Canvas::renderOpenGL()`.

ImGui serves as the immediate-mode backend for inspector and hierarchy panels. `ImGuiHost` hosts a dedicated `juce::OpenGLContext` and forwards JUCE input events into a `PendingEvent` queue drained during `renderOpenGL()` [^371^]. A critical concern: ImGui's default global `ImGuiContext* GImGui` pointer crashes when multiple plugin instances run in one DAW process. The canonical fix, documented by Krasjet's `imgui_juce` project, patches `GImGui` to `thread_local` [^371^]. Manifold stores `void* imguiContext` as a per-instance member, suggesting the patch is present, but explicit `ImGui::SetCurrentContext()` calls are not visible in the reviewed header. DISTRHO's `dear-plugins` offers a reference test suite for validating multi-instance ImGui behavior in plugins [^406^].

### 6.1.2 Hot-Reload at ~1 Hz: Polling Model vs Event-Driven Alternatives

`LuaEngine` implements UI script hot-reload via frame counting: `static constexpr int HOT_RELOAD_CHECK_INTERVAL = 30` means the engine checks for file modifications every 30 frames. At a 30–60 fps editor refresh rate, this is roughly 0.5–1.0 Hz polling. The implementation reads file modification times, compares against a cached token, and triggers a full re-parse and scene graph rebuild when changed. This polling model is portable but imposes recurring cost on the message thread.

The concern is its interaction with other visual workloads. JUCE forum reports describe plugins with OpenGL contexts causing DAW UI frame rates to "drop from a smooth 70–80 fps to a choppy 20–30 fps" [^421^]. Manifold runs at least two OpenGL contexts: the main `Canvas` path and the `ImGuiHost` editor context. The 30-frame reload check injects filesystem I/O and Lua recompilation at a cadence that competes with frame rendering. An event-driven model—using `inotify`, `FSEvents`, or `ReadDirectoryChangesW`—would reduce this overhead to near zero until an actual change occurs.

Industry precedent for plugin UI hot-reload favors web-based serving: Elementary's Plugin Dev Kit demonstrates Vite-powered reloading inside a DAW by serving JavaScript from `localhost` [^97^] [^424^]. Manifold's Lua path cannot adopt a browser dev-server, but it can separate file watching to a background thread and deliver notifications via a lock-free queue, analogous to the existing DSP reload triggered by `command("TRIGGER", "/core/behavior/dsp/reload")`.

### 6.1.3 FrameTimings Monitoring: Tracks Performance but May Measure Self-Contributed Degradation

`FrameTimings` is a telemetry structure of approximately 70 atomic fields tracking every UI stage from `pushState` through `present`, plus GPU sizes, memory deltas, ImGui vertex counts, and Lua heap state. Each `FrameTimingStage` records current, peak, and EWMA durations with a fixed alpha of 0.05, updated via `memory_order_relaxed` loads and stores.

The instrumentation is comprehensive, yet the profiler contributes to the metric it measures. Seventy relaxed atomic updates per frame, each on a distinct cache line, add non-trivial memory traffic. In the sndpeek ChuGL reimplementation, FPS is printed only every 0.25 seconds from a dedicated coroutine to minimize overhead [^467^]. Manifold's per-frame update of every stage may add tens of microseconds—small alone, but meaningful when the DAW UI is already strained by OpenGL context switches. Additionally, `relaxed` ordering is safe for monotonic counters but insufficient if any consumer thread must observe prior stage completions; `acquire` on reads and `release` on writes would provide the necessary happens-before edge at negligible cost on x86.

## 6.2 Shader and Video Systems

### 6.2.1 ShaderEffectRegistry: 22 GLSL Fragment Pipelines with JSON Metadata

`ShaderEffectRegistry` is a singleton that discovers, validates, and serves GLSL shaders. At startup, `registerBuiltinEffects()` scans `manifold/shaders` for `.json` manifests paired with `.glsl` fragments, plus a second scan of `manifold/shaders/blend` for compositing operators. The registry distinguishes `EffectCategory::Effect` for post-processing shaders and `EffectCategory::BlendOp` for compositing functions. Each manifest declares an `id`, `name`, `category`, `description`, typed `ParamSpec` records (`min`, `max`, `defaultValue`, `step`), and an optional `preamble` prepended to the fragment source.

The builtin inventory comprises 22 fragment effects and 6 blend operations, summarized in Table 1. All fragment shaders are driven by a common uniform set (`u_time`, `u_resolution`, `u_intensity`, `u_speed`, `u_param1`, `u_param2`) with effect-specific extensions in JSON. The `ShaderPipelineDescriptor` supports multi-pass chains via `PassDescriptor` records, each referencing an `effectId`, parameter overrides, a `composite` flag, a `blendOpId`, and opacity. Input textures are bound through `InputBinding` records mapping `sourceType` to a uniform and texture unit.

**Table 1. Shader Pipeline Inventory — Built-in GLSL Effects and Blend Modes**

| ID | Name | Category | Type | Params | Preamble | Description |
|:---|:---|:---|:---|:---:|:---:|:---|
| trail-dissolve | Trail Dissolve | feedback | Effect | 9 | No | Dissolving particle trail over live image |
| edge-glow | Edge Glow | color | Effect | 4 | No | Sobel edge detection with cycling neon color |
| optical-flow | Optical Flow | feedback | Effect | 10 | Yes | Horn-Schunck optical flow with advection |
| kaleidoscope | Kaleidoscope | distortion | Effect | 5 | No | Radial mirror segmentation |
| vhs | VHS | glitch | Effect | 8 | Yes | VHS tearing, wobble, noise, chroma bleed |
| pixel-sort | Pixel Sort | glitch | Effect | 8 | Yes | Threshold-based pixel sorting with streaks |
| datamosh | Datamosh | glitch | Effect | 5 | No | Compression-artifact motion smearing |
| glitch | Glitch | glitch | Effect | 5 | No | Structured signal corruption blocks |
| chromatic | Chromatic | color | Effect | 5 | No | RGB channel separation aberration |
| rgb-split | RGB Split | color | Effect | 4 | No | Directional color channel displacement |
| edge-trails | Edge Trails | feedback | Effect | 5 | No | Motion-blurred Sobel contour trails |
| fluid-smoke | Fluid Smoke | simulation | Effect | 5 | No | Navier-Stokes approximated advection |
| fractal-echo | Fractal Echo | feedback | Effect | 5 | No | Self-similar recursive feedback echoes |
| luma-feedback | Luma Feedback | feedback | Effect | 5 | No | Luminance-keyed recursive feedback |
| neon-edge | Neon Edge | color | Effect | 5 | No | Bright-edge bloom with threshold gating |
| posterize | Posterize | color | Effect | 4 | No | Quantized color band reduction |
| psychedelic | Psychedelic | distortion | Effect | 4 | No | Hue-rotating radial warping |
| ripple | Ripple | distortion | Effect | 4 | No | Sinusoidal radial displacement |
| time-smear | Time Smear | feedback | Effect | 5 | No | Directional temporal motion blur |
| trail | Trail | feedback | Effect | 5 | No | Simple multi-sample motion trail |
| wave | Wave | distortion | Effect | 4 | No | Sinusoidal vertical displacement |
| pixelate | Pixelate | distortion | Effect | 4 | No | Block-resolution downsampling |
| normal | Normal | blend | BlendOp | 4 | No | Standard alpha blend with gamma shaping |
| add | Add | blend | BlendOp | 4 | No | Additive light compositing |
| multiply | Multiply | blend | BlendOp | 4 | No | Multiplicative darkening compositing |
| screen | Screen | blend | BlendOp | 4 | No | Inverted-multiply lightening |
| overlay | Overlay | blend | BlendOp | 4 | No | Contrast-enhancing conditional blend |
| difference | Difference | blend | BlendOp | 4 | No | Absolute-difference matte extraction |

This metadata approach aligns with the Interactive Shader Format (ISF) standard adopted by OSSIA score, which supports "Shadertoy effects, by drag'n'drop of Shadertoy URLs into a score which will trigger an automated conversion to ISF" [^420^]. Manifold's descriptors are structurally similar but not ISF-compliant; aligning with ISF would open access to the existing Shadertoy corpus. The registry also lacks an `audio_reactive` uniform section. Audio Shader Studio demonstrates the standard mapping: `u_audioLevel`, `u_bassLevel`, `u_trebleLevel`, `u_spectralCentroid`, and `u_beatDetected` [^372^].

Shader execution is mediated by `ShaderSurfaceProvider`, which renders a `RuntimeNode`'s assigned pipeline into an OpenGL texture. The provider maintains a texture cache keyed by `stableId`, prunes unused entries, and supports `InputResolver` injection so upstream nodes can bind as input textures. `CompositeSurfaceProvider` generalizes this to multi-source compositing: it renders each source to its own FBO texture, then runs a final fullscreen composite pass. Blender's real-time compositor and JCGT 2025 GPU Laplacian blending research both demonstrate that modern GPUs handle multi-source compositing at 4K with minimal overhead when FBOs and mipmap chains are used [^457^] [^463^].

### 6.2.2 VideoCaptureManager + CompositeSurfaceProvider: Cross-Platform Video with OpenGL Texture Compositing

`VideoCaptureManager` is a platform-abstracted singleton that discovers devices, negotiates `VideoMode` resolution and frame rate, and runs a dedicated `captureThread_` that fills a `FrameData` structure with RGBA pixel data. On Linux the implementation uses V4L2 via an opaque `LinuxState` PIMPL; macOS and Windows stubs are implied but not present in the reviewed branch. Frame delivery is mutex-guarded: `getLatestFrameCopy()` locks `frameMutex_` and returns a copy of `latestFrame_`, a CPU-side `std::vector<std::uint8_t>`.

The gap is that `VideoCaptureManager` outputs CPU buffers while the shader pipeline expects GPU textures, implying a CPU-to-GPU upload every frame. For real-time VJ workflows, this is suboptimal. The industry standard—demonstrated by Indigo and OSSIA score—uses platform-specific shared texture paths: Syphon (macOS/IOSurface) and Spout (Windows/DirectX shared textures) enable zero-copy GPU texture sharing between applications [^441^] [^447^] [^448^]. Extending `VideoCaptureManager` to output via Syphon or Spout would position Manifold as a visual source for Resolume, OBS, and TouchDesigner without CPU readback.

### 6.2.3 The Missing Audio-Texture Bridge: SpectrumAnalyzerNode FFT Data Never Reaches ShaderEffectRegistry

Manifold's DSP layer includes spectral analysis primitives such as `PhaseVocoderNode`, which wraps `juce::dsp::FFT`, yet `ShaderEffectRegistry` has no input binding for audio spectra. The `InputBinding` structure supports only string `sourceType` values such as `"video"` or `"shader"`, and `ShaderSurfaceProvider::InputResolver` returns a `ResolvedInputTexture` containing only a texture handle, dimensions, and sequence. There is no path for FFT magnitude data to enter the shader pipeline.

This is a missed opportunity with low implementation cost. The established pattern, used by Shadertoy and Deezer's mobile visualizer, uploads FFT data as a 1D `GL_LUMINANCE` texture each frame via `glTexSubImage2D` [^379^] [^403^] [^452^]. Shadertoy exposes this as `iChannel0`, sampled per pixel with `texture(iChannel0, vec2(freq, 0.0)).x` [^452^] [^453^]. A typical WebGL implementation creates the texture from `analyser.getByteFrequencyData()` and uploads without reallocation, yielding sub-millisecond GPU transfer for 512-bin spectra [^379^].

Implementing the bridge requires three additions: (1) an `AudioTextureProvider` class subscribing to spectrum output and maintaining a 1D texture handle, (2) a new `sourceType` `"audioSpectrum"` in `InputBinding`, and (3) automatic scalar uniform injection for derived features (RMS, bass, treble, centroid, beat). Audio Shader Studio's extraction formulas are directly transferable: spectral centroid as $\text{Centroid} = \Sigma(f[i] \times \text{magnitude}[i]) / \Sigma(\text{magnitude}[i])$ and beat detection via an energy history buffer with threshold $E(t) > \text{mean}(E_{\text{history}}) \times 1.3$ [^372^]. The result would make all 22 existing shaders audio-reactive without modifying any GLSL source.

Looking forward, WebGPU via `wgpu` is positioning itself as a portable successor to OpenGL, targeting "any system that has DirectX or Vulkan or Metal or OpenGL" plus WASM [^405^] [^410^]. Critics note it "implements a Vulkan-style rigid render pipeline model which even Vulkan is moving away from," suggesting the API may age awkwardly [^405^]. For Manifold, the pragmatic stance is to stabilize the existing GLSL pipeline—including the audio-texture bridge—and evaluate WebGPU only when hosts begin adopting it.
