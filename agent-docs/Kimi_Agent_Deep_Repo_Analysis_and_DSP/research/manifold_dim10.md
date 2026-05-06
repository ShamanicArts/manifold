## Dimension: Visual Feedback Systems in Audio Tools

### Key Findings

- **ImGui integration with audio plugin frameworks is well-established but requires thread-local context patches for multi-instance safety.** The `imgui_juce` library provides a JUCE backend for Dear ImGui, exposing `ImGui_ImplJuce_Init(Component&, OpenGLContext&)`, `ImGui_ImplJuce_Shutdown()`, and `ImGui_ImplJuce_NewFrame()` [^371^]. A critical caveat: "By default ImGui only support a single instance running because it uses a global state... if you are writing an audio plugin, the plugin will crash if you add multiple instances... You need to patch ImGui and make the global state thread local: `thread_local ImGuiContext* GImGui = NULL`" [^371^]. The DISTRHO Plugin Framework (DPF) also ships `dear-plugins`, a collection of audio plugins based on Dear ImGui widgets for testing ImGui integration in plugins [^406^]. One reported VST plugin uses "thread-local ImGui contexts and one drawing thread per instance to provide multiple, separate editor instances" [^450^].

- **Audio-to-GPU data transfer most commonly uses FFT data uploaded as textures or scalar uniforms.** ShaderToy passes FFT data as a texture (`iChannel0`) rather than individual floats [^373^]. The Audio Shader Studio platform extracts features (bass, treble, spectral centroid, beat detection) and maps them to GLSL uniforms like `u_audioLevel`, `u_bassLevel`, `u_trebleLevel` [^372^]. A typical WebGL implementation creates a `LUMINANCE` texture from `analyser.getByteFrequencyData()` and uploads it via `gl.texSubImage2D` every frame [^379^]. Deezer's mobile GPU visualizer similarly uses the Accelerate framework for FFT, then uploads results as a texture to fragment shaders with uniforms like `u_rms` [^403^].

- **ISF (Interactive Shader Format) has emerged as a standardized shader metadata format for audio-visual tools.** OSSIA score supports ISF shaders, Faust, PureData, and C++ for live coding, and recently added "Shadertoy effects, by drag'n'drop of Shadertoy URLs into a score which will trigger an automated conversion to ISF" [^420^]. Score also added a "Vertex Shader Art" process for dynamic audio-reactive visuals from vertex shaders [^420^]. This validates Manifold's approach of using JSON metadata with GLSL pipeline descriptors.

- **Real-time audio waveform/spectrum visualization has deep roots in academic tools, with OpenGL as the proven rendering backend.** The sndpeek tool (Princeton Sound Lab, ICMC 2005) pioneered real-time 3D visualization including waveform, FFT magnitude spectrum, 3D waterfall plots, Lissajous plots, and spectral feature extraction (centroid, RMS, rolloff, flux) using MARSYAS and OpenGL [^392^] [^468^]. The authors noted: "Existing audio visualization tools are often not real-time. Those that are, tend not to use hardware-accelerated graphics tools, which limits the complexity of audio and visual computations they can perform" [^392^]. A modern ChuGL (ChucK graphics) reimplementation demonstrates waterfall plots using `GLines` with fading color history in a 3D scene graph [^467^].

- **Hot-reload UI development in audio plugins is increasingly adopting web-based toolchains.** The Elementary Plugin Dev Kit hosts a complete web environment for plugin UIs with Vite hot reloading inside the DAW [^97^] [^136^] [^424^]. The SRVB reverb project uses `npm run dev` to serve JavaScript assets from localhost while the native plugin runs inside the host [^424^]. Nick Thompson writes: "I demonstrated using `create-react-app` itself for my plugin UIs, complete with hot reloading (inside the plugin, inside the DAW), and the comforts of npm and the frontend web ecosystem" [^97^]. On the native side, JUCE provides `JUCE_LIVE_CONSTANT` for real-time tweaking of magic numbers via on-screen sliders [^408^], and the Melatonin Component Inspector allows visual editing of JUCE components [^408^].

- **JUCE's LookAndFeel architecture is the dominant native theming model, but developers increasingly build custom StylesStore abstractions.** JUCE's `LookAndFeel_V4` supports both a `ColourScheme` (enum-based palette) and per-component `ColourId` maps [^440^] [^442^]. A developer documented building a `StylesStore` class that encapsulates colors, numbers, and text properties with type-safe enum accessors, noting that "LookAndFeel_V4 was not made to be extended in terms of color handling. Methods, like `initialiseColours()`, cannot be overridden" [^442^]. This led to an external store pattern similar to CSS variables.

- **Video texture sharing ecosystems (Syphon/Spout/NDI) are standard in VJ and live performance software.** Syphon (macOS) and Spout (Windows) enable GPU-accelerated texture sharing between applications [^447^] [^448^]. NDI provides network-based video+audio transport [^441^]. OSSIA score processes visuals through Spout, Syphon, NDI, Shmdata, or Sh4lt [^420^]. The Indigo app demonstrates a modern architecture: `WKWebView -> ScreenCaptureKit -> Syphon (IOSurface -> Metal)` and `WebView2 -> Windows.Graphics.Capture -> Spout (DirectX 11 shared texture)` [^441^].

- **WebGPU is positioning itself as the portable successor to OpenGL, offering "write once, run anywhere" GPU code.** WebGPU "fills OpenGL's niche by being much more approachable than Vulkan" while targeting "any system that has DirectX or Vulkan or Metal or OpenGL" plus WASM [^405^]. Kitware describes it as "One Graphics API To Rule Them All" for unifying graphics across web, desktop, and mobile [^410^]. However, it lacks explicit Fence/Semaphore objects found in Vulkan, and some critics note it "implements a Vulkan-style rigid render pipeline model which even Vulkan is moving away from" [^405^].

- **GPU multi-texture compositing is an active area with real-time rendering applications.** Blender's real-time compositor applies compositor node-trees directly in the 3D viewport using GPU acceleration [^463^]. A 2025 JCGT paper on GPU-Friendly Laplacian Texture Blending demonstrates real-time multi-texture compositing at 4K resolution on an RTX 4090 with minimal overhead by leveraging mipmap chains for Laplacian pyramid construction [^457^].

- **Audio feature extraction for visualization follows established categories: time-domain (RMS, ZCR), frequency-domain (spectral centroid, bandwidth, rolloff), and beat/tempo.** Audio Shader Studio computes spectral centroid as `Centroid = Σ(f[i] × magnitude[i]) / Σ(magnitude[i])` and beat detection using energy history buffers with statistical thresholds (`E(t) > mean(E_history) × 1.3`) [^372^]. Onset detection uses spectral flux: `Flux(t) = Σ(H(X(t)[k] - X(t-1)[k]))` where H is half-wave rectification [^372^].

- **Lua-driven UI scene graphs with hot reload are a proven pattern in game development with direct applicability to audio tools.** A documented indie workflow used "Scripting in Lua. UI layout in XML. Changing the asset files would change the game live" alongside "State machines as Lua exported from Excel" [^473^]. LÖVE2D provides "Instant Feedback: Save your Lua file and the game reloads automatically" [^474^]. OpenSceneGraph's Lua scripting integration allows "lua script creates scene graph objects, populates the scene graph with lua callbacks and passes back the scene graph" [^396^].

- **ImGui custom widget extensions for audio include ImPlot for waveform/spectrum display and custom knob widgets.** The `imgui-plot` extension provides "a Plot widget that can show a grid, has custom tooltip support, logarithmic x-axis scaling, is able to draw multiple sources on the same plot, and also supports selection" specifically designed for "working with audio and ultrasonic data" [^409^]. An ImGui-based distortion plugin won KVR's Developer Challenge using "custom widgets for the knobs and level meters" [^450^].

- **JUCE plugins with OpenGL can cause DAW UI performance degradation if not carefully managed.** Forum reports describe JUCE plugins causing "the UI frame rate can drop from a smooth 70-80fps to a choppy 20-30fps" [^421^]. JUCE 5.2.0 specifically "Improved the performance of 3D rendering when multiple OpenGL contexts are used at the same time" [^422^], indicating this was a recognized platform issue.

### Major Sources & Authorities

- **imgui_juce (Krasjet, GitHub)**: The definitive reference for integrating Dear ImGui with JUCE audio plugins. Documents the multi-instance thread_local patch requirement and OpenGL context initialization pattern [^371^].
- **Audio Shader Studio (sandner-art, GitHub)**: A modern, MIT-licensed reference implementation of real-time audio-reactive GLSL shaders with comprehensive feature extraction and uniform mapping [^372^].
- **SNDTOOLS / sndpeek (Princeton Sound Lab, ICMC 2005)**: Foundational academic paper on real-time audio visualization with OpenGL. Provides the canonical feature set (waveform, spectrum, waterfall, Lissajous, spectral features) [^392^] [^468^].
- **OSSIA score (GitHub releases)**: A major open-source audio-visual sequencer that demonstrates production-grade ISF shader integration, video pipeline architecture (Spout/Syphon/NDI), and GPU buffer passing between nodes [^420^].
- **Elementary Audio / Nick Thompson (Blog/ADC 2021)**: Documents the web-based hot-reload plugin UI paradigm using Vite and React inside DAWs [^97^] [^136^] [^424^].
- **JUCE Official Documentation (LookAndFeel tutorials)**: The authoritative reference for native C++ audio plugin theming architecture [^440^] [^442^].
- **A Comparison of Modern Graphics APIs (Alain.xyz blog, 2021)**: Comprehensive side-by-side comparison of Vulkan, DirectX, Metal, WebGPU, and OpenGL initialization, resource management, and synchronization primitives [^404^].
- **GPU-Friendly Laplacian Texture Blending (JCGT 2025)**: Peer-reviewed research on real-time GPU texture compositing with performance benchmarks at 4K [^457^].
- **dear-plugins (DISTRHO, GitHub)**: Reference collection of ImGui-based audio plugins for testing widget integration in DPF [^406^].

### Patterns & Best Practices

- **Audio-to-Shader Data Path**: Extract FFT/features on CPU, upload to GPU as either (a) 1D `LUMINANCE` texture for full spectrum, or (b) scalar uniforms for derived features (bass/mid/treble/RMS/centroid). Use `gl.texSubImage2D` for efficient texture updates without reallocation [^379^] [^403^].
- **Multi-Instance ImGui Safety**: Always use `thread_local ImGuiContext* GImGui = NULL` patch when running ImGui inside audio plugin editor windows. Create one context per plugin instance and use `ImGui::SetCurrentContext()` before rendering [^371^] [^450^].
- **Shader Effect Registry**: Use JSON metadata descriptors to register GLSL shaders with typed uniform inputs, category tags, and version info. This enables drag-and-drop instantiation and automatic UI generation for parameters. OSSIA score's ISF integration and Shadertoy-to-ISF conversion demonstrate this pattern at scale [^420^].
- **Hot-Reload Development Loop**: Separate UI script assets from the native binary. For web-based UIs, serve from localhost with Vite dev server. For native/Lua UIs, watch filesystem changes and recompile/reload the scene graph while keeping DSP running. Manifold's existing `command("TRIGGER", "/core/behavior/dsp/reload")` for DSP should be complemented by a similar UI script watcher [^97^] [^473^] [^474^].
- **Theming via External Store**: Rather than inheriting from a monolithic LookAndFeel class, maintain a `StylesStore` with typed enums (ColorIds, NumberIds, TextualIds) that both native widgets and custom components read from. This enables runtime theme switching and file-based style loading [^442^].
- **Composite Texture Rendering**: When blending multiple sources (video, shaders, generated), use GPU-rendered FBOs/RTVs for each source, then composite via a final fullscreen pass. Blender's real-time compositor and Laplacian blending research show that modern GPUs handle multi-source compositing efficiently at 4K [^463^] [^457^].
- **Video Capture Architecture**: For cross-platform video output, abstract over platform-specific shared texture APIs: Syphon (macOS/IOSurface), Spout (Windows/DirectX shared textures), NDI (cross-platform network). Audio should be deinterleaved to planar float32 for transport [^441^].
- **Frame Timing & Performance Metrics**: Track UI frame times separately from DSP callback times. In sndpeek's ChuGL reimplementation, FPS is printed every 0.25 seconds using a dedicated coroutine [^467^]. JUCE developers report that multiple OpenGL contexts in plugins can degrade DAW UI performance to 20-30fps [^421^].

### Controversies & Conflicting Claims

- **ImGui vs. JUCE for Audio Plugin UIs**: Pro-ImGui arguments emphasize rapid prototyping, declarative code, and extensive widget extensions (imnodes, implot) [^371^]. Anti-ImGui arguments note that "GUI is recomputed each frame at 60 FPS, probably less efficient than JUCE" and "Component and layout can be less customizable than JUCE. You probably only want to use it for prototyping" [^371^]. Some developers prefer Qt over JUCE despite JUCE's superior audio feature set [^380^].
- **WebGPU as "OpenGL 2" vs. Already Outdated**: Advocates claim WebGPU is "much more approachable than Vulkan" with true "write once, run anywhere" portability [^405^] [^410^]. Critics counter that "it implements a Vulkan-style rigid render pipeline model which even Vulkan is moving away from. So once WebGPU becomes mainstream it may very well be the most 'awkward' 3D API" [^405^].
- **Texture vs. Uniform for Audio Data in Shaders**: Shadertoy uses FFT textures (`iChannel0`) sampled per pixel [^452^] [^453^]. Audio Shader Studio uses scalar uniforms for derived features [^372^]. The texture approach provides full per-bin access but has texture unit overhead; the uniform approach is cheaper but loses frequency resolution. Hybrid approaches (texture for spectrum + uniforms for features) are most common in practice.
- **Hot Reload Safety in Audio Plugins**: Nick Thompson's Elementary approach enables hot reload inside DAWs but requires careful separation of JavaScript asset serving from the native audio thread [^97^] [^424^]. Native C++ hot reload is more complex due to binary compatibility and real-time safety constraints. JUCE's removed Projucer GUI Editor previously offered visual hot reloading [^408^].

### Relation to Manifold Codebase

- **Canvas/RuntimeNode UI (Lua scene graph)**: Manifold's Lua-driven hierarchical scene graph aligns with established game engine patterns (OpenSceneGraph Lua callbacks, LÖVE2D hot reload) [^396^] [^474^]. The key differentiator is applying this to an audio plugin context. Best practice would be to implement filesystem watchers for `.lua` UI scripts and provide a `SceneGraph::reload()` path that preserves OpenGL context state.

- **ShaderEffectRegistry (GLSL + JSON metadata)**: Manifold's approach directly mirrors OSSIA score's ISF shader integration and Audio Shader Studio's uniform library [^372^] [^420^]. The registry should support automatic uniform discovery from JSON descriptors and provide a built-in set of audio-derived uniforms (`u_time`, `u_audioLevel`, `u_bassLevel`, `u_trebleLevel`, `u_spectralCentroid`, `u_beat`). Consider adding Shadertoy-to-Manifold conversion for the large existing shader corpus [^420^].

- **ShaderSurfaceProvider / CompositeSurfaceProvider**: Manifold's multi-source texture compositing maps to Blender's real-time compositor architecture and GPU Laplacian blending research [^463^] [^457^]. The `CompositeSurfaceProvider` should use FBO ping-pong rendering where each source renders to its own texture, then a final composite shader blends them. For video sources, integrate with platform-specific shared texture paths (Syphon/Spout) to avoid CPU readback [^441^].

- **VideoCaptureManager / VideoSynthPrimitive**: Cross-platform video capture with video synthesis primitives is well-served by studying Indigo's architecture (ScreenCaptureKit -> Syphon/NDI on macOS; Windows.Graphics.Capture -> Spout/NDI on Windows) [^441^]. The `VideoSynthPrimitive` should output to shared textures where possible rather than CPU buffers.

- **ImGui Integration**: Manifold's custom ImGui config and theme system fits the established pattern but must apply the `thread_local` patch for multi-instance safety if not already done [^371^] [^450^]. The inspector/hierarchy hosts can leverage ImGui's built-in debug tools (`ShowMetricsWindow`, `ShowIdStackToolWindow`) [^478^]. For audio-specific widgets, consider integrating `imgui-plot` for waveform/spectrum display [^409^].

- **FrameTimings**: Manifold's UI performance metrics tracking should explicitly separate GPU render time from CPU UI logic time. The sndpeek ChuGL implementation shows a simple pattern: `<<< "fps:", GG.fps() >>>` printed periodically [^467^]. Consider exposing frame time histograms via ImPlot.

- **Hot Reload Architecture**: Manifold already has DSP script reload via `command("TRIGGER", "/core/behavior/dsp/reload")`. UI script hot-reload should use an analogous mechanism but must handle ImGui context state and OpenGL resource lifetime correctly. The Elementary SRVB project's Vite-based approach demonstrates that serving UI assets from localhost enables seamless iteration [^424^].

### Recommended Improvements / Opportunities

1. **Add Audio-Derived Shader Uniforms**: Extend `ShaderEffectRegistry` JSON descriptors with an `audio_reactive` section that maps feature names to uniform names and types. Reference Audio Shader Studio's uniform library: `u_time`, `u_resolution`, `u_audioLevel`, `u_bassLevel`, `u_trebleLevel`, `u_spectralCentroid`, `u_beatDetected` [^372^].

2. **Implement FFT-as-Texture Pipeline**: Add an `AudioTextureProvider` that uploads FFT frequency data to a 1D `GL_LUMINANCE` texture each frame using `glTexSubImage2D`. This gives shaders full per-bin access without excessive uniform updates. Shadertoy's `iChannel0` sampling pattern (`texture(iChannel0, vec2(freq, 0.0)).x`) can be directly adopted [^452^] [^453^].

3. **Adopt ISF Shader Metadata Standard**: Consider aligning `ShaderEffectRegistry` JSON with the ISF (Interactive Shader Format) specification. This enables importing from the large existing ISF/Shadertoy ecosystem and drag-and-drop shader loading. OSSIA score's automated Shadertoy-to-ISF conversion demonstrates feasibility [^420^].

4. **Integrate ImPlot for Audio Visualization Widgets**: The `imgui-plot` extension supports multiple sources, selection, logarithmic x-axis, and custom tooltips—ideal for waveform and spectrum display inside Manifold's ImGui-based inspector [^409^].

5. **Add Shared Texture Output for VJ Integration**: Extend `VideoCaptureManager` to optionally output via Syphon (macOS) or Spout (Windows) using platform-specific GPU texture sharing. This positions Manifold as a visual source for Resolume, OBS, and other VJ software [^441^] [^447^].

6. **Evaluate WebGPU Backend for Future-Proofing**: While OpenGL is currently sufficient, WebGPU via `wgpu` offers a path to target web (WASM), desktop, and mobile from a single shader codebase. The API is less verbose than Vulkan and explicitly designed for multi-platform portability [^405^] [^410^].

7. **Build a `StylesStore` Theme Abstraction**: Replace or augment Manifold's current ImGui theme system with a typed `StylesStore` (ColorIds, NumberIds, TextualIds) that supports loading from JSON files. This enables user-created themes and runtime switching without recompilation [^442^].

8. **Profile Multi-Context OpenGL Performance**: JUCE history shows that multiple simultaneous OpenGL contexts can degrade DAW UI performance to 20-30fps [^421^]. Manifold should benchmark `ShaderSurfaceProvider` + `CompositeSurfaceProvider` frame times under multi-plugin-instance scenarios and consider shared context or single-context multi-FBO architectures.

9. **Document the Lua UI Hot-Reload Contract**: Formalize the interface between the C++ runtime and Lua UI scripts: which scene graph nodes are exposed, how callbacks are registered, and what state persists across reloads. Reference OpenSceneGraph's `osg::ScriptNodeCallback` pattern for attaching Lua scripts as scene graph callbacks [^396^].

### Raw Evidence Log

Claim: ImGui requires thread_local context patch for multi-instance audio plugin safety.
Source: imgui_juce (Krasjet)
URL: https://github.com/Krasjet/imgui_juce
Date: 2022-10-16
Excerpt: "By default ImGui only support a single instance running because it uses a global state `ImGuiContext* GImGui = NULL;`... if you are writing an audio plugin, the plugin will crash if you add multiple instances... You need to patch ImGui and make the global state thread local `thread_local ImGuiContext* GImGui = NULL;`"
Confidence: high

Claim: Audio reactive shaders commonly use FFT data uploaded as textures or scalar uniforms.
Source: Audio Shader Studio
URL: https://github.com/sandner-art/Audio-Shader-Studio
Date: 2025-09-12
Excerpt: "The application utilizes the Web Audio API for real-time audio analysis... FFT analysis using AnalyserNode with a 512-point FFT size... The extracted features are passed as uniforms to the active fragment shader program."
Confidence: high

Claim: ISF is a production-standard shader format for audio-visual software.
Source: OSSIA score releases
URL: https://github.com/ossia/score/releases
Date: 2025-08-11
Excerpt: "Gfx: add support for Shadertoy effects, by drag'n'drop of Shadertoy URLs into a score which will trigger an automated conversion to ISF."
Confidence: high

Claim: Real-time audio visualization with OpenGL was pioneered by academic tools like sndpeek.
Source: SNDTOOLS: REAL-TIME AUDIO DSP AND 3D VISUALIZATION (ICMC 2005)
URL: https://soundlab.cs.princeton.edu/publications/sndtools_icmc2005.pdf
Date: Unknown (ICMC 2005)
Excerpt: "Existing audio visualization tools are often not real-time. Those that are, tend not to use hardware-accelerated graphics tools, which limits the complexity of audio and visual computations they can perform."
Confidence: high

Claim: Web-based hot reload inside DAWs is now a demonstrated workflow for audio plugin UIs.
Source: Nick Thompson / Elementary Audio blog
URL: https://www.nickwritesablog.com/audio-plugins-with-javascript/
Date: 2021-09-23
Excerpt: "I demonstrated using `create-react-app` itself for my plugin UIs, complete with hot reloading (inside the plugin, inside the DAW), and the comforts of npm and the frontend web ecosystem."
Confidence: high

Claim: JUCE LookAndFeel cannot be easily extended for custom component colors.
Source: Journey into audio programming #10 (Medium)
URL: https://medium.com/@akaztp/journey-into-audio-programming-10-customize-the-ui-940c3df6a800
Date: 2024-12-17
Excerpt: "LookAndFeel_V4 was not made to be extended in terms of color handling. Methods, like `initialiseColours()`, cannot be overridden."
Confidence: high

Claim: Syphon/Spout/NDI are the standard video texture sharing protocols in VJ software.
Source: Indigo app (GitHub)
URL: https://github.com/jonasjohansson/Indigo
Date: 2026-04-05
Excerpt: "GPU texture sharing — Syphon (macOS) / Spout (Windows)... NDI output — video + audio over the network"
Confidence: high

Claim: WebGPU may be awkward if it becomes mainstream because it uses a rigid pipeline model.
Source: Hacker News discussion on WebGPU
URL: https://news.ycombinator.com/item?id=40597798
Date: 2024-06-06
Excerpt: "it implements a Vulkan-style rigid render pipeline model which even Vulkan is moving away from because it turned out too rigid. So once WebGPU becomes mainstream it may very well be the most 'awkward' 3D API."
Confidence: medium

Claim: Multi-OpenGL-context JUCE plugins can degrade DAW UI performance significantly.
Source: JUCE Forum
URL: https://forum.juce.com/t/juce-plugins-cause-poor-daw-ui-performance-on-windows/55034
Date: 2023-02-18
Excerpt: "When working on projects that use these plugins, the UI frame rate can drop from a smooth 70-80fps to a choppy 20-30fps"
Confidence: medium

Claim: GPU-friendly Laplacian texture blending enables real-time multi-source compositing at 4K.
Source: GPU-Friendly Laplacian Texture Blending (JCGT)
URL: https://arxiv.org/html/2502.13945v1
Date: 2025-02-19
Excerpt: "measured by rendering in 3840x2160 resolution, blending two textures on an NVIDIA RTX 4090 GPU... The typical Laplacian level count that produces smooth but sharp blends is three to five, for which the proposed method has a minimal runtime performance impact."
Confidence: high

Claim: Lua scene graph hot reload is a proven pattern in shipped game titles.
Source: Hacker News comment on game development
URL: https://news.ycombinator.com/item?id=44038209
Date: 2025-05-04
Excerpt: "Scripting in Lua. UI layout in XML. Changing the asset files would change the game live. We shipped multiple games on a single executable using this system."
Confidence: high

Claim: OSSIA score added compute shader support and vertex shader art processes for audio-reactive visuals.
Source: OSSIA score v3.7.0 changelog
URL: https://github.com/ossia/score/releases
Date: 2025-08-11
Excerpt: "New process: Compute Shader. This allows to use compute shader to generate and process images... New process: Vertex Shader Art. This allows to create dynamic audio-reactive visuals from vertex shaders"
Confidence: high

Claim: Shadertoy provides FFT data as `iChannel0` texture, not individual floats.
Source: WebGL Fundamentals Q&A
URL: https://webglfundamentals.org/webgl/lessons/webgl-qna-how-to-get-audio-data-into-a-shader.html
Date: Unknown
Excerpt: "Shadertoy does not provide FFT as a float. It provides FFT data as a texture."
Confidence: high

Claim: Audio feature extraction for beat detection uses energy history buffers with statistical thresholds.
Source: Audio Shader Studio documentation
URL: https://github.com/sandner-art/Audio-Shader-Studio
Date: 2025-09-12
Excerpt: "Compute instantaneous energy: E(t) = Σ(x[n]²)... Maintain energy history buffer (10 frames)... Beat detected when: E(t) > mean(E_history) × 1.3"
Confidence: high

Claim: Elementary SRVB project uses Vite dev server for hot reloading plugin UI inside DAW.
Source: elemaudio/srvb (GitHub)
URL: https://github.com/elemaudio/srvb
Date: 2023-04-04
Excerpt: "In develop mode, the native plugin is compiled to fetch its JavaScript assets from localhost, where subsequently we run the Vite dev server to serve those assets. This arrangement enables Vite's hot reloading behavior for developing the plugin while it's running inside a host."
Confidence: high

Claim: imgui-plot extension was built specifically for audio/ultrasonic data visualization.
Source: ocornut/imgui issue #2747
URL: https://github.com/ocornut/imgui/issues/2747
Date: 2019-08-23
Excerpt: "I've implemented a Plot widget that can show a grid, has custom tooltip support, logarithmic x-axis scaling... All of this was really useful for me when working with audio and ultrasonic data"
Confidence: high

Claim: JUCE 5.2.0 improved performance when multiple OpenGL contexts are used simultaneously.
Source: JUCE CHANGE_LIST.md
URL: https://github.com/juce-framework/JUCE/blob/master/CHANGE_LIST.md
Date: Unknown
Excerpt: "Improved the performance of 3D rendering when multiple OpenGL contexts are used at the same time"
Confidence: high

Claim: Blender's real-time compositor applies GPU-accelerated compositing node-trees in the viewport.
Source: Blender code blog
URL: https://code.blender.org/2022/07/real-time-compositor/
Date: 2022-07-06
Excerpt: "The aim of this project is to develop a new compositor back-end, taking advantage of GPU acceleration to be performant enough for real-time interaction."
Confidence: high

Claim: Modern graphics APIs (Vulkan/DirectX12/Metal/WebGPU) converge on similar abstractions: device, queue, command buffer, pipeline, swapchain.
Source: A Comparison of Modern Graphics APIs (Alain.xyz)
URL: https://alain.xyz/blog/comparison-of-modern-graphics-apis
Date: 2021-01-30
Excerpt: "Low level Graphics APIs such as Vulkan, DirectX, Metal, and WebGPU, are converging to a model similar to the way GPUs are currently built."
Confidence: high
