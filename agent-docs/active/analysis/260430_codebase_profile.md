# Manifold Codebase Profile — 2026-04-30 22:31

**Total runtime code:** 212,341 lines across 694 files

## 1. By Top-Level Directory

| Directory | Files | Lines | % of Total |
|-----------|------:|------:|----------:|
| UserScripts | 307 | 102,281 | 48.2% |
| manifold | 253 | 83,398 | 39.3% |
| dsp | 127 | 20,966 | 9.9% |
| web | 7 | 5,696 | 2.7% |
| **Total** | **694** | **212,341** | **100%** |

## 2. By File Extension

| Extension | Files | Lines | % of Total |
|-----------|------:|------:|----------:|
| .lua | 364 | 126,410 | 59.5% |
| .cpp | 127 | 59,029 | 27.8% |
| .h | 142 | 18,678 | 8.8% |
| .ts | 2 | 3,771 | 1.8% |
| .json | 57 | 3,163 | 1.5% |
| .css | 2 | 1,290 | 0.6% |

## 3. Manifold/ Breakdown

| Subsystem | Lines |
|-----------|------:|
| primitives | 36,987 |
| ui | 29,908 |
| core | 7,537 |
| dsp | 2,535 |
| SystemScripts | 1,811 |
| headless | 1,775 |
| shaders | 1,521 |
| grpc | 854 |
| highway | 195 |
| engine | 169 |
| android | 60 |
| sources | 46 |

## 4. UserScripts/ Projects

| Project | Lines |
|---------|------:|
| Main | 53,901 |
| BappInstrument | 7,571 |
| ExperimentalUI | 4,043 |
| avsamplerDOCKING | 4,030 |
| RackModuleHost | 3,875 |
| DspLiveScripting | 2,930 |
| WebcamViewer | 2,432 |
| BappSourceLayerLab | 2,425 |
| AVSampler | 2,249 |
| AVSamplerLab | 1,676 |
| VideoSliceRackLab | 1,176 |
| VideoPolySamplerLab | 1,121 |
| GranularLab | 1,118 |
| ModalLab | 1,023 |
| VideoSamplerLab | 970 |
| BappFxChain | 922 |
| KarplusStrongLab | 922 |
| BappSampleTopper | 899 |
| Standalone_Eq | 852 |
| MLLab | 847 |
| BappNoiseLab | 841 |
| BappPrimitiveLab | 825 |
| Standalone_Filter | 798 |
| Imported_BAPP | 754 |
| BappEventLab | 717 |
| VectorSynth | 568 |
| Standalone_Sample | 538 |
| LayoutModeDemo | 472 |
| RuntimeBenchmark | 419 |
| Standalone_FX | 324 |
| Standalone_NoteFilter | 197 |
| Standalone_VelocityMapper | 197 |
| Standalone_Transpose | 170 |
| Standalone_Arp | 167 |
| Standalone_ScaleQuantizer | 165 |
| StandaloneOsc | 86 |
| _SystemScripts | 61 |

## 5. DSP/ Breakdown

| Area | Lines |
|------|------:|
| core | 20,966 |

## 6. Top 50 Largest Files

| # | Lines | File |
|---|------:|------|
| 1 | 4,337 | `manifold/core/BehaviorCoreProcessor.cpp` |
| 2 | 4,239 | `manifold/ui/shell/methods_core.lua` |
| 3 | 4,054 | `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` |
| 4 | 3,703 | `UserScripts/projects/avsamplerDOCKING/ui/behaviors/main.lua` |
| 5 | 3,529 | `web/remote-control/app.ts` |
| 6 | 3,175 | `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua` |
| 7 | 2,757 | `UserScripts/projects/Main/dsp/midisynth_integration.lua` |
| 8 | 2,746 | `UserScripts/projects/BappInstrument/dsp/default_dsp.lua` |
| 9 | 2,676 | `manifold/primitives/scripting/LuaEngine.cpp` |
| 10 | 2,603 | `manifold/core/BehaviorCoreEditor.cpp` |
| 11 | 2,568 | `UserScripts/projects/BappInstrument/ui/behaviors/main.lua` |
| 12 | 2,525 | `manifold/ui/imgui/ImGuiDirectHost.cpp` |
| 13 | 2,404 | `manifold/ui/shell/bindings.lua` |
| 14 | 2,375 | `UserScripts/projects/RackModuleHost/ui/behaviors/main.lua` |
| 15 | 2,219 | `UserScripts/projects/DspLiveScripting/ui/behaviors/main.lua` |
| 16 | 2,166 | `UserScripts/projects/Main/ui/behaviors/source_panel.lua` |
| 17 | 1,920 | `manifold/ui/project_loader.lua` |
| 18 | 1,871 | `UserScripts/projects/ExperimentalUI/ui/legacy/experimental_legacy.lua` |
| 19 | 1,727 | `manifold/primitives/scripting/bindings/LuaUIBindings.cpp` |
| 20 | 1,690 | `UserScripts/projects/WebcamViewer/ui/behaviors/main.lua` |
| 21 | 1,682 | `UserScripts/projects/Main/lib/parameter_binder.lua` |
| 22 | 1,589 | `UserScripts/projects/Main/ui/behaviors/rack_layout_engine.lua` |
| 23 | 1,579 | `UserScripts/projects/Main/lib/sample_synth.lua` |
| 24 | 1,522 | `UserScripts/projects/AVSampler/ui/behaviors/main.lua` |
| 25 | 1,445 | `manifold/primitives/control/ControlServer.cpp` |
| 26 | 1,437 | `UserScripts/projects/BappInstrument/dsp/default_dsp.full_attempt.lua` |
| 27 | 1,435 | `UserScripts/projects/Main/ui/behaviors/palette_browser.lua` |
| 28 | 1,379 | `UserScripts/projects/Main/lib/ui/rack_mod_popover.lua` |
| 29 | 1,344 | `manifold/primitives/control/OSCQuery.cpp` |
| 30 | 1,289 | `web/remote-control/style.css` |
| 31 | 1,211 | `UserScripts/projects/Main/ui/behaviors/midisynth.lua` |
| 32 | 1,195 | `UserScripts/projects/Main/lib/modulation/runtime.lua` |
| 33 | 1,174 | `manifold/primitives/scripting/dsp_host/DSPHostParamRegistry.cpp` |
| 34 | 1,146 | `manifold/primitives/shaders/ShaderSurfaceProvider.cpp` |
| 35 | 1,141 | `manifold/primitives/video/VideoSynthPrimitive.cpp` |
| 36 | 1,139 | `manifold/primitives/scripting/dsp_host/DSPHostBindingsFx.cpp` |
| 37 | 1,094 | `dsp/core/nodes/OscillatorNode.cpp` |
| 38 | 1,086 | `dsp/core/nodes/SampleRegionPlaybackNode.cpp` |
| 39 | 1,055 | `UserScripts/projects/Main/ui/behaviors/fx_slot.lua` |
| 40 | 1,050 | `manifold/ui/ui_shell.lua` |
| 41 | 1,045 | `UserScripts/projects/AVSamplerLab/ui/behaviors/main.lua` |
| 42 | 1,037 | `UserScripts/projects/Main/ui/behaviors/eq.lua` |
| 43 | 1,022 | `dsp/core/nodes/OscillatorNode_Highway.h` |
| 44 | 1,015 | `manifold/primitives/scripting/dsp_host/DSPHostBindingsCore.cpp` |
| 45 | 948 | `manifold/ui/imgui/ImGuiRuntimeNodeHost.cpp` |
| 46 | 927 | `UserScripts/projects/Main/ui/behaviors/rack_oscillator.lua` |
| 47 | 927 | `manifold/ui/imgui/RuntimeNodeRenderer.cpp` |
| 48 | 920 | `manifold/ui/shell/methods_layout.lua` |
| 49 | 910 | `manifold/SystemScripts/projects/Settings/ui/main.ui.lua` |
| 50 | 882 | `UserScripts/projects/Main/ui/behaviors/rack_sample.lua` |

## 7. Highway vs Non-Highway DSP Nodes

| Node | Highway | Non-Highway (cpp+h) | Ratio (HW/NH) |
|------|--------:|--------------------:|--------------:|
| SampleRegionPlaybackNode | 0 | 1,262 | 0.0x |
| OscillatorNode | 1,022 | 1,227 | 0.8x |
| SineBankNode | 0 | 917 | 0.0x |
| PartialsExtractor | 0 | 803 | 0.0x |
| PitchDetector | 0 | 746 | 0.0x |
| PhaseVocoderNode | 0 | 601 | 0.0x |
| MidiVoiceNode | 0 | 544 | 0.0x |
| StereoDelayNode | 0 | 515 | 0.0x |
| EQ8Node | 0 | 514 | 0.0x |
| WaveShaperNode | 433 | 499 | 0.9x |
| LoopPlaybackNode | 0 | 461 | 0.0x |
| GranulatorNode | 0 | 429 | 0.0x |
| RetrospectiveCaptureNode | 0 | 384 | 0.0x |
| PitchDetectorNode | 0 | 358 | 0.0x |
| EQNode | 0 | 344 | 0.0x |
| SVFNode | 0 | 288 | 0.0x |
| ChorusNode | 0 | 277 | 0.0x |
| FormantFilterNode | 0 | 272 | 0.0x |
| CombNode | 0 | 271 | 0.0x |
| ADSREnvelopeNode | 524 | 254 | 2.1x |
| MidiInputNode | 0 | 252 | 0.0x |
| PitchShifterNode | 0 | 252 | 0.0x |
| MixerNode | 280 | 242 | 1.2x |
| BitCrusherNode | 582 | 235 | 2.5x |
| ReverseDelayNode | 0 | 217 | 0.0x |
| MultitapDelayNode | 0 | 216 | 0.0x |
| AllpassNode | 0 | 214 | 0.0x |
| SampleAnalyzer | 0 | 212 | 0.0x |
| ResonatorNode | 0 | 209 | 0.0x |
| StutterNode | 0 | 207 | 0.0x |
| ShimmerNode | 0 | 197 | 0.0x |
| FrequencyShiftNode | 0 | 190 | 0.0x |
| TemporalPartialData | 0 | 187 | 0.0x |
| FilterNode | 204 | 185 | 1.1x |
| EnvelopeFollowerNode | 0 | 176 | 0.0x |
| TransientShaperNode | 0 | 176 | 0.0x |
| AudioSyncNode | 0 | 174 | 0.0x |
| PhaserNode | 0 | 174 | 0.0x |
| SpectrumAnalyzerNode | 0 | 165 | 0.0x |
| CompressorNode | 0 | 164 | 0.0x |
| LimiterNode | 0 | 162 | 0.0x |
| ReverbNode | 0 | 158 | 0.0x |
| AudioFmNode | 0 | 157 | 0.0x |
| RingModulatorNode | 0 | 149 | 0.0x |
| StereoWidenerNode | 0 | 149 | 0.0x |
| PlayheadNode | 0 | 146 | 0.0x |
| MSEncoderNode | 0 | 145 | 0.0x |
| SlewLimiterNode | 0 | 145 | 0.0x |
| NoiseGeneratorNode | 0 | 136 | 0.0x |
| GainNode | 191 | 135 | 1.4x |
| CrossfaderNode | 0 | 130 | 0.0x |
| PlaybackStateGateNode | 0 | 124 | 0.0x |
| QuantizerNode | 0 | 119 | 0.0x |
| DistortionNode | 0 | 101 | 0.0x |
| ForwardCommitSchedulerNode | 0 | 101 | 0.0x |
| ConstantSignalNode | 0 | 90 | 0.0x |
| TransportStateNode | 0 | 88 | 0.0x |
| RecordModePolicyNode | 0 | 81 | 0.0x |
| PassthroughNode | 0 | 72 | 0.0x |
| RecordStateNode | 0 | 72 | 0.0x |
| PrimitiveNodes | 0 | 59 | 0.0x |
| PartialData | 0 | 36 | 0.0x |
| SampleAnalysis | 0 | 32 | 0.0x |
| **Total** | **3,236** | **17,597** | |

## 8. Files ≥ 1,000 Lines

**Count:** 44 files, **Total:** 85,395 lines (40% of codebase)

| Lines | File |
|------:|------|
| 4,337 | `manifold/core/BehaviorCoreProcessor.cpp` |
| 4,239 | `manifold/ui/shell/methods_core.lua` |
| 4,054 | `manifold/primitives/scripting/bindings/LuaControlBindings.cpp` |
| 3,703 | `UserScripts/projects/avsamplerDOCKING/ui/behaviors/main.lua` |
| 3,529 | `web/remote-control/app.ts` |
| 3,175 | `UserScripts/projects/Main/ui/behaviors/rack_midisynth_specs.lua` |
| 2,757 | `UserScripts/projects/Main/dsp/midisynth_integration.lua` |
| 2,746 | `UserScripts/projects/BappInstrument/dsp/default_dsp.lua` |
| 2,676 | `manifold/primitives/scripting/LuaEngine.cpp` |
| 2,603 | `manifold/core/BehaviorCoreEditor.cpp` |
| 2,568 | `UserScripts/projects/BappInstrument/ui/behaviors/main.lua` |
| 2,525 | `manifold/ui/imgui/ImGuiDirectHost.cpp` |
| 2,404 | `manifold/ui/shell/bindings.lua` |
| 2,375 | `UserScripts/projects/RackModuleHost/ui/behaviors/main.lua` |
| 2,219 | `UserScripts/projects/DspLiveScripting/ui/behaviors/main.lua` |
| 2,166 | `UserScripts/projects/Main/ui/behaviors/source_panel.lua` |
| 1,920 | `manifold/ui/project_loader.lua` |
| 1,871 | `UserScripts/projects/ExperimentalUI/ui/legacy/experimental_legacy.lua` |
| 1,727 | `manifold/primitives/scripting/bindings/LuaUIBindings.cpp` |
| 1,690 | `UserScripts/projects/WebcamViewer/ui/behaviors/main.lua` |
| 1,682 | `UserScripts/projects/Main/lib/parameter_binder.lua` |
| 1,589 | `UserScripts/projects/Main/ui/behaviors/rack_layout_engine.lua` |
| 1,579 | `UserScripts/projects/Main/lib/sample_synth.lua` |
| 1,522 | `UserScripts/projects/AVSampler/ui/behaviors/main.lua` |
| 1,445 | `manifold/primitives/control/ControlServer.cpp` |
| 1,437 | `UserScripts/projects/BappInstrument/dsp/default_dsp.full_attempt.lua` |
| 1,435 | `UserScripts/projects/Main/ui/behaviors/palette_browser.lua` |
| 1,379 | `UserScripts/projects/Main/lib/ui/rack_mod_popover.lua` |
| 1,344 | `manifold/primitives/control/OSCQuery.cpp` |
| 1,289 | `web/remote-control/style.css` |
| 1,211 | `UserScripts/projects/Main/ui/behaviors/midisynth.lua` |
| 1,195 | `UserScripts/projects/Main/lib/modulation/runtime.lua` |
| 1,174 | `manifold/primitives/scripting/dsp_host/DSPHostParamRegistry.cpp` |
| 1,146 | `manifold/primitives/shaders/ShaderSurfaceProvider.cpp` |
| 1,141 | `manifold/primitives/video/VideoSynthPrimitive.cpp` |
| 1,139 | `manifold/primitives/scripting/dsp_host/DSPHostBindingsFx.cpp` |
| 1,094 | `dsp/core/nodes/OscillatorNode.cpp` |
| 1,086 | `dsp/core/nodes/SampleRegionPlaybackNode.cpp` |
| 1,055 | `UserScripts/projects/Main/ui/behaviors/fx_slot.lua` |
| 1,050 | `manifold/ui/ui_shell.lua` |
| 1,045 | `UserScripts/projects/AVSamplerLab/ui/behaviors/main.lua` |
| 1,037 | `UserScripts/projects/Main/ui/behaviors/eq.lua` |
| 1,022 | `dsp/core/nodes/OscillatorNode_Highway.h` |
| 1,015 | `manifold/primitives/scripting/dsp_host/DSPHostBindingsCore.cpp` |

## 9. Bloat Flags & Commentary

**Files > 2,000 lines (16):** High-risk candidates for splitting.

**Highway/Non-Highway duplication:** ~17,597 lines of parallel DSP node implementations.

**Standalone plugin projects:** 35 projects, ~48,319 lines (runtime loaded, not dead code).

**Lua stats:** 364 files, 126,410 lines total, avg 347 lines/file.
