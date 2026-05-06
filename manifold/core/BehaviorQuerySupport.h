#pragma once

#include <array>
#include <cmath>
#include <memory>
#include <string>
#include <unordered_map>
#include <vector>

#include "../primitives/control/ControlServer.h"
#include "../primitives/dsp/CaptureBuffer.h"
#include "../primitives/scripting/DSPPluginScriptHost.h"
#include "BehaviorCoreProcessor.h"

namespace manifold {
namespace behavior_query_support {

inline ScriptableLayerState toLayerStateEnum(int raw) {
    switch (raw) {
        case 0: return ScriptableLayerState::Empty;
        case 1: return ScriptableLayerState::Playing;
        case 2: return ScriptableLayerState::Recording;
        case 3: return ScriptableLayerState::Overdubbing;
        case 4: return ScriptableLayerState::Muted;
        case 5: return ScriptableLayerState::Stopped;
        case 6: return ScriptableLayerState::Paused;
        default: return ScriptableLayerState::Unknown;
    }
}

inline bool getLayerSnapshot(int index,
                             int maxLayers,
                             const ControlServer& controlServer,
                             DSPPluginScriptHost* dspScriptHost,
                             ScriptableLayerSnapshot& out) {
    if (index < 0 || index >= maxLayers) {
        return false;
    }

    const auto& ls = controlServer.getAtomicState().layers[index];
    out.index = index;
    out.length = ls.length.load(std::memory_order_relaxed);
    out.position = ls.playheadPos.load(std::memory_order_relaxed);
    out.speed = ls.speed.load(std::memory_order_relaxed);
    out.reversed = ls.reversed.load(std::memory_order_relaxed);
    out.volume = ls.volume.load(std::memory_order_relaxed);
    out.state = toLayerStateEnum(ls.state.load(std::memory_order_relaxed));
    out.muted = ls.muted.load(std::memory_order_relaxed);
    if (dspScriptHost != nullptr && index >= 0 && index < maxLayers) {
        out.muted = dspScriptHost->isLayerMuted(index);
    }
    return true;
}

inline int getCaptureSize(const CaptureBuffer& captureBuffer) {
    return captureBuffer.getSize();
}

inline bool computeLayerPeaks(int layerIndex,
                              int numBuckets,
                              int maxLayers,
                              DSPPluginScriptHost* dspScriptHost,
                              std::vector<float>& outPeaks) {
    outPeaks.clear();
    if (layerIndex < 0 || layerIndex >= maxLayers || numBuckets <= 0) {
        return false;
    }

    return dspScriptHost != nullptr &&
           dspScriptHost->computeLayerPeaks(layerIndex, numBuckets, outPeaks);
}

inline bool computeLayerPeaksForPath(
    const std::string& pathBase,
    int layerIndex,
    int numBuckets,
    int maxLayers,
    DSPPluginScriptHost* dspScriptHost,
    const std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>>& dspSlots,
    std::vector<float>& outPeaks) {
    outPeaks.clear();
    if (layerIndex < 0 || layerIndex >= maxLayers || numBuckets <= 0) {
        return false;
    }

    const juce::String base(pathBase);
    if (base.isEmpty() || base == "/core/behavior" ||
        base.startsWith("/core/behavior/")) {
        return computeLayerPeaks(layerIndex, numBuckets, maxLayers, dspScriptHost,
                                 outPeaks);
    }

    if (base.startsWith("/core/slots/")) {
        juce::String rest = base.substring(12);
        if (rest.isEmpty()) {
            return false;
        }

        const int slash = rest.indexOfChar('/');
        const juce::String slot = (slash >= 0) ? rest.substring(0, slash) : rest;
        if (slot.isEmpty()) {
            return false;
        }

        const auto it = dspSlots.find(slot.toStdString());
        if (it == dspSlots.end() || it->second == nullptr) {
            return false;
        }

        return it->second->computeLayerPeaks(layerIndex, numBuckets, outPeaks);
    }

    return computeLayerPeaks(layerIndex, numBuckets, maxLayers, dspScriptHost,
                             outPeaks);
}

inline bool computeCapturePeaks(const CaptureBuffer& captureBuffer,
                                int startAgo,
                                int endAgo,
                                int numBuckets,
                                std::vector<float>& outPeaks) {
    outPeaks.clear();
    if (numBuckets <= 0) {
        return false;
    }

    const int captureSize = captureBuffer.getSize();
    if (captureSize <= 0) {
        return false;
    }

    const int start = std::max(0, std::min(captureSize, startAgo));
    const int end = std::max(0, std::min(captureSize, endAgo));
    if (end <= start) {
        return false;
    }

    const int viewSamples = end - start;
    const int bucketSize = std::max(1, viewSamples / numBuckets);
    outPeaks.resize(static_cast<size_t>(numBuckets), 0.0f);

    float highest = 0.0f;
    for (int x = 0; x < numBuckets; ++x) {
        const float t = numBuckets > 1
                            ? static_cast<float>(numBuckets - 1 - x) /
                                  static_cast<float>(numBuckets - 1)
                            : 0.0f;
        const int firstAgo =
            start + static_cast<int>(std::round(t * static_cast<float>(viewSamples - 1)));
        if (firstAgo >= captureSize) {
            continue;
        }

        float peak = 0.0f;
        const int bucket = std::min(bucketSize, captureSize - firstAgo);
        for (int i = 0; i < bucket; ++i) {
            const float left = std::abs(captureBuffer.getSample(firstAgo + i, 0));
            float right = left;
            if (captureBuffer.getNumChannels() > 1) {
                right = std::abs(captureBuffer.getSample(firstAgo + i, 1));
            }
            peak = std::max(peak, std::max(left, right));
        }
        outPeaks[static_cast<size_t>(x)] = peak;
        highest = std::max(highest, peak);
    }

    const float rescale =
        highest > 0.0f ? std::min(10.0f, std::max(1.0f, 1.0f / highest)) : 1.0f;
    for (auto& peak : outPeaks) {
        peak = std::min(1.0f, peak * rescale);
    }
    return true;
}

inline bool computeSynthSamplePeaks(DSPPluginScriptHost* dspScriptHost,
                                    int numBuckets,
                                    std::vector<float>& outPeaks) {
    return dspScriptHost != nullptr &&
           dspScriptHost->computeSynthSamplePeaks(numBuckets, outPeaks);
}

inline bool computeDynamicSamplePeaks(DSPPluginScriptHost* dspScriptHost,
                                      int slotIndex,
                                      int numBuckets,
                                      std::vector<float>& outPeaks) {
    return dspScriptHost != nullptr &&
           dspScriptHost->computeDynamicSamplePeaks(slotIndex, numBuckets,
                                                    outPeaks);
}

inline std::vector<float> getVoiceSamplePositions(
    const DSPPluginScriptHost* dspScriptHost) {
    if (dspScriptHost != nullptr) {
        return dspScriptHost->getVoiceSamplePositions();
    }
    return {};
}

inline std::vector<float> getDynamicSampleVoicePositions(
    const DSPPluginScriptHost* dspScriptHost,
    int slotIndex) {
    if (dspScriptHost != nullptr) {
        return dspScriptHost->getDynamicSampleVoicePositions(slotIndex);
    }
    return {};
}

inline bool getLatestSampleAnalysis(const DSPPluginScriptHost* dspScriptHost,
                                    dsp_primitives::SampleAnalysis& outAnalysis) {
    return dspScriptHost != nullptr &&
           dspScriptHost->getLatestSampleAnalysis(outAnalysis);
}

inline bool getLatestSamplePartials(const DSPPluginScriptHost* dspScriptHost,
                                    dsp_primitives::PartialData& outPartials) {
    return dspScriptHost != nullptr &&
           dspScriptHost->getLatestSamplePartials(outPartials);
}

inline bool getSampleDerivedAdditiveDebug(
    const DSPPluginScriptHost* dspScriptHost,
    int voiceIndex,
    SampleDerivedAdditiveDebugState& outState) {
    return dspScriptHost != nullptr &&
           dspScriptHost->getSampleDerivedAdditiveDebug(voiceIndex, outState);
}

inline bool refreshSampleDerivedAdditiveDebug(
    DSPPluginScriptHost* dspScriptHost,
    SampleDerivedAdditiveDebugState& outState) {
    return dspScriptHost != nullptr &&
           dspScriptHost->refreshSampleDerivedAdditiveDebug(outState);
}

inline bool ensureDynamicModuleSlot(DSPPluginScriptHost* dspScriptHost,
                                    const std::string& specId,
                                    int slotIndex) {
    return dspScriptHost != nullptr &&
           dspScriptHost->ensureDynamicModuleSlot(specId, slotIndex);
}

inline float getTempo(const ControlServer& controlServer) {
    return controlServer.getAtomicState().tempo.load(std::memory_order_relaxed);
}

inline float getTargetBPM(const ControlServer& controlServer) {
    return controlServer.getAtomicState().targetBPM.load(std::memory_order_relaxed);
}

inline float getSamplesPerBar(const ControlServer& controlServer,
                              double sampleRate) {
    const auto& state = controlServer.getAtomicState();
    const float cached = state.samplesPerBar.load(std::memory_order_relaxed);
    if (cached > 0.0f) {
        return cached;
    }
    const float tempo = getTempo(controlServer);
    if (tempo <= 0.0f || sampleRate <= 0.0) {
        return 0.0f;
    }
    return static_cast<float>((sampleRate * 240.0) / tempo);
}

inline float getMasterVolume(const ControlServer& controlServer) {
    return controlServer.getAtomicState().masterVolume.load(std::memory_order_relaxed);
}

inline float getInputVolume(const ControlServer& controlServer) {
    return controlServer.getAtomicState().inputVolume.load(std::memory_order_relaxed);
}

inline bool isPassthroughEnabled(const ControlServer& controlServer) {
    return controlServer.getAtomicState().passthroughEnabled.load(std::memory_order_relaxed);
}

inline bool isRecording(const ControlServer& controlServer) {
    return controlServer.getAtomicState().isRecording.load(std::memory_order_relaxed);
}

inline bool isOverdubEnabled(const ControlServer& controlServer) {
    return controlServer.getAtomicState().overdubEnabled.load(std::memory_order_relaxed);
}

inline int getActiveLayerIndex(const ControlServer& controlServer) {
    return controlServer.getAtomicState().activeLayer.load(std::memory_order_relaxed);
}

inline bool isForwardCommitArmed(const ControlServer& controlServer) {
    return controlServer.getAtomicState().forwardArmed.load(std::memory_order_relaxed);
}

inline float getForwardCommitBars(const ControlServer& controlServer) {
    return controlServer.getAtomicState().forwardBars.load(std::memory_order_relaxed);
}

inline int getRecordModeIndex(const ControlServer& controlServer) {
    return controlServer.getAtomicState().recordMode.load(std::memory_order_relaxed);
}

inline int getCommitCount(const ControlServer& controlServer) {
    return controlServer.getAtomicState().commitCount.load(std::memory_order_relaxed);
}

inline std::array<float, 32> getSpectrumData(
    const DSPPluginScriptHost* dspScriptHost,
    const std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>>& dspSlots) {
    std::array<float, 32> out{};
    std::array<float, 8> bands{};

    auto accumulateHost = [&bands](const DSPPluginScriptHost* host) {
        if (host == nullptr || !host->isLoaded()) {
            return;
        }
        const auto current = host->getSpectrumBands();
        for (size_t i = 0; i < bands.size(); ++i) {
            bands[i] = std::max(bands[i], current[i]);
        }
    };

    accumulateHost(dspScriptHost);
    for (const auto& entry : dspSlots) {
        accumulateHost(entry.second.get());
    }

    for (size_t i = 0; i < out.size(); ++i) {
        const float pos = (static_cast<float>(i) /
                           static_cast<float>(out.size() - 1)) *
                          static_cast<float>(bands.size() - 1);
        const int i0 = static_cast<int>(std::floor(pos));
        const int i1 = std::min(static_cast<int>(bands.size() - 1), i0 + 1);
        const float t = pos - static_cast<float>(i0);
        out[i] = bands[static_cast<size_t>(i0)] * (1.0f - t) +
                 bands[static_cast<size_t>(i1)] * t;
    }

    return out;
}

} // namespace behavior_query_support
} // namespace manifold
