# Bloat & Structural Debt Report — 2026-05-02 04:13

## 1. Mixed Concern Files (≥4 concern categories)

| Lines | Concerns | Categories | File |
|------:|---------:|------------|------|
| 4,337 | 10 | profiling(685), osc(248), dsp(205), config(174), graph(131), midi(79), ui(38), serialization(30), video(17), file_io(15) | `manifold/core/BehaviorCoreProcessor.cpp` |
| 4,239 | 7 | ui(411), graph(264), profiling(83), config(70), osc(29), video(8), file_io(6) | `manifold/ui/shell/methods_core.lua` |
| 3,529 | 6 | ui(462), osc(291), graph(121), dsp(54), config(49), video(8) | `web/remote-control/app.ts` |
| 3,175 | 5 | dsp(383), midi(268), graph(185), osc(167), ui(66) | `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua` |
| 2,757 | 7 | dsp(692), graph(169), osc(82), video(44), midi(26), ui(17), config(8) | `UserScripts/projects/Main/dsp/midisynth_integration.lua` |
| 2,746 | 5 | dsp(422), graph(303), osc(30), profiling(22), midi(9) | `UserScripts/projects/BappInstrument/dsp/default_dsp.lua` |
| 2,603 | 8 | profiling(305), config(229), graph(208), video(180), ui(171), file_io(15), dsp(13), osc(12) | `manifold/core/BehaviorCoreEditor.cpp` |
| 2,568 | 7 | ui(198), graph(76), dsp(45), midi(44), video(14), config(7), profiling(6) | `UserScripts/projects/BappInstrument/ui/behaviors/main.lua` |
| 2,553 | 6 | ui(421), graph(342), video(116), profiling(109), dsp(21), config(15) | `manifold/ui/imgui/ImGuiDirectHost.cpp` |
| 2,404 | 5 | ui(290), graph(250), profiling(35), config(12), osc(11) | `manifold/ui/shell/bindings.lua` |
| 2,375 | 5 | ui(300), graph(279), midi(64), osc(26), dsp(23) | `UserScripts/projects/RackModuleHost/ui/behaviors/main.lua` |
| 2,364 | 7 | osc(105), ui(53), graph(51), profiling(26), video(19), midi(17), file_io(17) | `manifold/primitives/scripting/LuaEngine.cpp` |
| 2,219 | 5 | graph(266), ui(204), midi(31), osc(14), video(6) | `UserScripts/projects/DspLiveScripting/ui/behaviors/main.lua` |
| 2,166 | 5 | dsp(270), ui(153), graph(84), video(21), osc(10) | `UserScripts/projects/Main/ui/behaviors/source_panel.lua` |
| 1,920 | 6 | graph(246), ui(199), config(14), serialization(8), file_io(6), profiling(6) | `manifold/ui/project_loader.lua` |
| 1,871 | 6 | ui(153), video(73), graph(69), dsp(63), osc(53), config(28) | `UserScripts/projects/ExperimentalUI/ui/legacy/experimental_legacy.lua` |
| 1,765 | 7 | ui(264), video(138), dsp(61), graph(55), midi(35), osc(8), config(7) | `UserScripts/projects/AVSampler/ui/behaviors/main.lua` |
| 1,682 | 5 | dsp(234), midi(168), osc(87), graph(9), ui(7) | `UserScripts/projects/Main/lib/parameter_binder.lua` |
| 1,589 | 5 | ui(346), graph(192), midi(60), profiling(26), dsp(10) | `UserScripts/projects/Main/ui/behaviors/rack_layout_engine.lua` |
| 1,579 | 5 | dsp(474), graph(105), osc(103), midi(11), ui(8) | `UserScripts/projects/Main/lib/sample_synth.lua` |

_Total: 48 files flagged_

## 2. God Functions (≥80 lines)

| Lines | Function | File |
|------:|----------|------|
| 1,421 | `state)` | `manifold/primitives/scripting/bindings/LuaUtilityBindings.cpp:41` |
| 1,110 | `&trackNode)` | `manifold/primitives/scripting/dsp_host/DSPHostBindingsFx.cpp:28` |
| 985 | `&mapInternalToExternal)` | `manifold/primitives/scripting/dsp_host/DSPHostBindingsCore.cpp:29` |
| 970 | `&mapInternalToExternal)` | `manifold/primitives/scripting/dsp_host/DSPHostParamRegistry.cpp:64` |
| 942 | `shaderDefinitions` | `manifold/primitives/video/VideoSynthPrimitive.cpp:54` |
| 915 | `ControlServer::processCommand` | `manifold/primitives/control/ControlServer.cpp:532` |
| 798 | `state)` | `manifold/primitives/scripting/bindings/LuaWaveformBindings.cpp:38` |
| 677 | `&trackNode)` | `manifold/primitives/scripting/dsp_host/DSPHostBindingsSynth.cpp:28` |
| 535 | `registerCanvasBindings` | `manifold/primitives/scripting/bindings/LuaCanvasBindings.cpp:14` |
| 492 | `BehaviorCoreEditor::timerCallback` | `manifold/core/BehaviorCoreEditor.cpp:1847` |
| 467 | `timeSeconds)` | `manifold/primitives/shaders/ShaderSurfaceProvider.cpp:569` |
| 433 | `LuaEngine::loadScript` | `manifold/primitives/scripting/LuaEngine.cpp:468` |
| 422 | `juce::AudioProcessorValueTreeState::Listener` | `manifold/core/BehaviorCoreProcessor.h:67` |
| 413 | `onVoiceFreq` | `UserScripts/projects/Main/dsp/midisynth_integration.lua:2053` |
| 410 | `registerOpenGLBindings` | `manifold/primitives/scripting/bindings/LuaOpenGLBindings.cpp:27` |
| 404 | `runSmokeHarness` | `manifold/headless/LuaEngineMockHarness.cpp:653` |
| 399 | `state)` | `manifold/primitives/scripting/bindings/LuaMidiBindings.cpp:34` |
| 390 | `&mapInternalToExternal)` | `manifold/primitives/scripting/dsp_host/DSPHostLoopLayerBundle.cpp:12` |
| 357 | `state)` | `manifold/primitives/scripting/bindings/LuaGraphBindings.cpp:17` |
| 351 | `BehaviorCoreProcessor::readExportPluginPath` | `manifold/core/BehaviorCoreProcessor.cpp:1055` |
| 344 | `&obj)` | `manifold/primitives/scripting/dsp_host/DSPHostObjectResolver.cpp:8` |
| 340 | `LuaRuntimeNodeBindings::registerBindings` | `manifold/primitives/scripting/bindings/LuaRuntimeNodeBindings.cpp:417` |
| 332 | `BehaviorCoreProcessor::registerExportPluginEndpoints` | `manifold/core/BehaviorCoreProcessor.cpp:559` |
| 330 | `M.buildFxDefs` | `UserScripts/projects/Main/lib/fx_definitions.lua:38` |
| 316 | `midiMessages)` | `manifold/core/BehaviorCoreProcessor.cpp:1702` |
| 304 | `rootMode_` | `manifold/core/BehaviorCoreEditor.cpp:1430` |
| 295 | `state)` | `manifold/primitives/scripting/bindings/LuaOSCBindings.cpp:19` |
| 278 | `0.0f)` | `dsp/core/nodes/PartialsExtractor.h:440` |
| 272 | `LuaEngine::switchScript` | `manifold/primitives/scripting/LuaEngine.cpp:1249` |
| 271 | `juce::OpenGLRenderer` | `manifold/ui/imgui/ImGuiDirectHost.h:45` |

_Total: 151 god functions_

## 3. Parallel Table Definitions (table redundancy)

None found.
