# Bloat & Structural Debt Report — 2026-04-30 22:32

## 1. Mixed Concern Files (≥4 concern categories)

| Lines | Concerns | Categories | File |
|------:|---------:|------------|------|
| 4,337 | 10 | profiling(685), osc(248), dsp(205), config(174), graph(131), midi(79), ui(38), serialization(30), video(17), file_io(15) | `manifold/core/BehaviorCoreProcessor.cpp` |
| 4,239 | 7 | ui(411), graph(264), profiling(83), config(70), osc(29), video(8), file_io(6) | `manifold/ui/shell/methods_core.lua` |
| 4,054 | 8 | graph(384), dsp(296), video(156), osc(141), config(90), midi(62), ui(36), file_io(20) | `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` |
| 3,703 | 6 | ui(461), video(212), graph(165), dsp(73), midi(51), config(8) | `UserScripts/projects/avsamplerDOCKING/ui/behaviors/main.lua` |
| 3,529 | 6 | ui(462), osc(291), graph(121), dsp(54), config(49), video(8) | `web/remote-control/app.ts` |
| 3,175 | 5 | dsp(383), midi(268), graph(185), osc(167), ui(66) | `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua` |
| 2,757 | 7 | dsp(692), graph(169), osc(82), video(44), midi(26), ui(17), config(8) | `UserScripts/projects/Main/dsp/midisynth_integration.lua` |
| 2,746 | 5 | dsp(422), graph(303), osc(30), profiling(22), midi(9) | `UserScripts/projects/BappInstrument/dsp/default_dsp.lua` |
| 2,676 | 9 | osc(105), ui(53), graph(51), file_io(33), config(26), profiling(26), dsp(24), video(19), midi(17) | `manifold/primitives/scripting/LuaEngine.cpp` |
| 2,603 | 8 | profiling(305), config(229), graph(208), video(180), ui(171), file_io(15), dsp(13), osc(12) | `manifold/core/BehaviorCoreEditor.cpp` |
| 2,568 | 7 | ui(198), graph(76), dsp(45), midi(44), video(14), config(7), profiling(6) | `UserScripts/projects/BappInstrument/ui/behaviors/main.lua` |
| 2,525 | 6 | ui(419), graph(334), video(115), profiling(109), dsp(21), config(15) | `manifold/ui/imgui/ImGuiDirectHost.cpp` |
| 2,404 | 5 | ui(290), graph(250), profiling(35), config(12), osc(11) | `manifold/ui/shell/bindings.lua` |
| 2,375 | 5 | ui(300), graph(279), midi(64), osc(26), dsp(23) | `UserScripts/projects/RackModuleHost/ui/behaviors/main.lua` |
| 2,219 | 5 | graph(266), ui(204), midi(31), osc(14), video(6) | `UserScripts/projects/DspLiveScripting/ui/behaviors/main.lua` |
| 2,166 | 5 | dsp(270), ui(153), graph(84), video(21), osc(10) | `UserScripts/projects/Main/ui/behaviors/source_panel.lua` |
| 1,920 | 6 | graph(246), ui(199), config(14), serialization(8), file_io(6), profiling(6) | `manifold/ui/project_loader.lua` |
| 1,871 | 6 | ui(153), video(73), graph(69), dsp(63), osc(53), config(28) | `UserScripts/projects/ExperimentalUI/ui/legacy/experimental_legacy.lua` |
| 1,727 | 5 | ui(301), graph(135), config(100), video(67), dsp(55) | `manifold/primitives/scripting/bindings/LuaUIBindings.cpp` |
| 1,682 | 5 | dsp(234), midi(168), osc(87), graph(9), ui(7) | `UserScripts/projects/Main/lib/parameter_binder.lua` |

_Total: 46 files flagged_

## 2. God Functions (≥80 lines)

| Lines | Function | File |
|------:|----------|------|
| 1,421 | `state)` | `manifold/primitives/scripting/bindings/LuaControlBindings.cpp:2634` |
| 1,110 | `&trackNode)` | `manifold/primitives/scripting/dsp_host/DSPHostBindingsFx.cpp:28` |
| 1,026 | `&mapExternalToInternal)` | `manifold/primitives/scripting/dsp_host/DSPHostParamRegistry.cpp:13` |
| 985 | `&mapInternalToExternal)` | `manifold/primitives/scripting/dsp_host/DSPHostBindingsCore.cpp:29` |
| 942 | `shaderDefinitions` | `manifold/primitives/video/VideoSynthPrimitive.cpp:54` |
| 915 | `ControlServer::processCommand` | `manifold/primitives/control/ControlServer.cpp:532` |
| 798 | `state)` | `manifold/primitives/scripting/bindings/LuaControlBindings.cpp:926` |
| 677 | `&trackNode)` | `manifold/primitives/scripting/dsp_host/DSPHostBindingsSynth.cpp:28` |
| 535 | `LuaUIBindings::registerCanvasBindings` | `manifold/primitives/scripting/bindings/LuaUIBindings.cpp:406` |
| 492 | `BehaviorCoreEditor::timerCallback` | `manifold/core/BehaviorCoreEditor.cpp:1847` |
| 467 | `timeSeconds)` | `manifold/primitives/shaders/ShaderSurfaceProvider.cpp:569` |
| 433 | `LuaEngine::loadScript` | `manifold/primitives/scripting/LuaEngine.cpp:780` |
| 422 | `juce::AudioProcessorValueTreeState::Listener` | `manifold/core/BehaviorCoreProcessor.h:67` |
| 413 | `onVoiceFreq` | `UserScripts/projects/Main/dsp/midisynth_integration.lua:2053` |
| 410 | `LuaUIBindings::registerOpenGLBindings` | `manifold/primitives/scripting/bindings/LuaUIBindings.cpp:1193` |
| 404 | `main` | `manifold/headless/LuaEngineMockHarness.cpp:207` |
| 399 | `state)` | `manifold/primitives/scripting/bindings/LuaMidiBindings.cpp:32` |
| 390 | `&mapInternalToExternal)` | `manifold/primitives/scripting/dsp_host/DSPHostLoopLayerBundle.cpp:12` |
| 357 | `state)` | `manifold/primitives/scripting/bindings/LuaControlBindings.cpp:1826` |
| 351 | `BehaviorCoreProcessor::readExportPluginPath` | `manifold/core/BehaviorCoreProcessor.cpp:1055` |
| 344 | `&obj)` | `manifold/primitives/scripting/dsp_host/DSPHostObjectResolver.cpp:8` |
| 340 | `LuaRuntimeNodeBindings::registerBindings` | `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp:417` |
| 332 | `BehaviorCoreProcessor::registerExportPluginEndpoints` | `manifold/core/BehaviorCoreProcessor.cpp:559` |
| 330 | `M.buildFxDefs` | `UserScripts/projects/Main/lib/fx_definitions.lua:38` |
| 316 | `midiMessages)` | `manifold/core/BehaviorCoreProcessor.cpp:1702` |
| 304 | `rootMode_` | `manifold/core/BehaviorCoreEditor.cpp:1430` |
| 295 | `state)` | `manifold/primitives/scripting/bindings/LuaControlBindings.cpp:2185` |
| 278 | `0.0f)` | `dsp/core/nodes/PartialsExtractor.h:440` |
| 272 | `LuaEngine::switchScript` | `manifold/primitives/scripting/LuaEngine.cpp:1561` |
| 271 | `juce::OpenGLRenderer` | `manifold/ui/imgui/ImGuiDirectHost.h:45` |

_Total: 150 god functions_

## 3. Parallel Table Definitions (table redundancy)

None found.
