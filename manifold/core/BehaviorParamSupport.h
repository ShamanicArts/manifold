#pragma once

#include <atomic>
#include <functional>
#include <memory>
#include <string>
#include <unordered_map>

#include "../primitives/control/ControlServer.h"
#include "../primitives/control/OSCEndpointRegistry.h"
#include "../primitives/scripting/DSPPluginScriptHost.h"
#include "../primitives/sync/LinkSync.h"
#include "BehaviorCoreProcessor.h"

namespace manifold {
namespace behavior_param_support {

inline float computeSamplesPerBar(float tempo, double sampleRate) {
    if (tempo <= 0.0f || sampleRate <= 0.0) {
        return 0.0f;
    }
    return static_cast<float>((sampleRate * 240.0) / tempo);
}

inline bool extractLayerParam(const std::string& path,
                              int maxLayers,
                              int& layerIndex,
                              std::string& paramSuffix) {
    static const std::array<std::string, 3> prefixes = {
        "/core/behavior/layer/",
        "/manifold/layer/",
        "/dsp/manifold/layer/",
    };

    for (const auto& prefix : prefixes) {
        if (path.rfind(prefix, 0) != 0) {
            continue;
        }

        const std::string rest = path.substr(prefix.size());
        const auto slash = rest.find('/');
        if (slash == std::string::npos) {
            return false;
        }

        const std::string idxStr = rest.substr(0, slash);
        const int idx = std::atoi(idxStr.c_str());
        if (idx < 0 || idx >= maxLayers) {
            return false;
        }

        layerIndex = idx;
        paramSuffix = rest.substr(slash + 1);
        return true;
    }

    return false;
}

inline void clearForwardSchedule(bool& forwardScheduled,
                                 double& forwardFireAtSample,
                                 float& forwardScheduledBars) {
    forwardScheduled = false;
    forwardFireAtSample = 0.0;
    forwardScheduledBars = 0.0f;
}

inline bool applyParamPath(
    const std::string& path,
    float value,
    int maxLayers,
    ControlServer& controlServer,
    std::atomic<double>& currentSampleRate,
    LinkSync& linkSync,
    std::atomic<bool>& graphProcessingEnabled,
    DSPPluginScriptHost* dspScriptHost,
    bool& forwardScheduled,
    double& forwardFireAtSample,
    float& forwardScheduledBars,
    const std::function<void()>& scheduleForwardCommitIfNeeded,
    const std::function<float()>& getSamplesPerBar) {
    auto& state = controlServer.getAtomicState();

    if (path == "/core/behavior/tempo") {
        const float tempo = juce::jlimit(20.0f, 300.0f, value);
        state.tempo.store(tempo, std::memory_order_relaxed);
        state.samplesPerBar.store(
            computeSamplesPerBar(tempo,
                                 currentSampleRate.load(std::memory_order_relaxed)),
            std::memory_order_relaxed);
        if (linkSync.isEnabled()) {
            linkSync.requestTempo(static_cast<double>(tempo));
        }
        return true;
    }

    if (path == "/core/behavior/targetbpm") {
        state.targetBPM.store(value, std::memory_order_relaxed);
        return true;
    }

    if (path == "/core/behavior/volume") {
        state.masterVolume.store(juce::jlimit(0.0f, 2.0f, value),
                                 std::memory_order_relaxed);
        return true;
    }

    if (path == "/core/behavior/inputVolume") {
        state.inputVolume.store(juce::jlimit(0.0f, 2.0f, value),
                                std::memory_order_relaxed);
        return true;
    }

    if (path == "/core/behavior/passthrough") {
        state.passthroughEnabled.store(value > 0.5f, std::memory_order_relaxed);
        return true;
    }

    if (path == "/core/behavior/recording") {
        const bool recording = value > 0.5f;
        const int activeLayer = juce::jlimit(
            0, maxLayers - 1, state.activeLayer.load(std::memory_order_relaxed));

        state.isRecording.store(recording, std::memory_order_relaxed);

        if (recording) {
            state.layers[activeLayer].state.store(
                static_cast<int>(ScriptableLayerState::Recording),
                std::memory_order_relaxed);
            scheduleForwardCommitIfNeeded();
            return true;
        }

        state.forwardArmed.store(false, std::memory_order_relaxed);
        state.forwardBars.store(0.0f, std::memory_order_relaxed);
        clearForwardSchedule(forwardScheduled, forwardFireAtSample,
                             forwardScheduledBars);
        return true;
    }

    if (path == "/core/behavior/overdub") {
        state.overdubEnabled.store(value > 0.5f, std::memory_order_relaxed);
        return true;
    }

    if (path == "/core/behavior/layer") {
        const int layer = juce::jlimit(0, maxLayers - 1, static_cast<int>(value));
        state.activeLayer.store(layer, std::memory_order_relaxed);
        return true;
    }

    if (path == "/core/behavior/mode") {
        const int mode = juce::jlimit(0, 2, static_cast<int>(value));
        state.recordMode.store(mode, std::memory_order_relaxed);
        return true;
    }

    if (path == "/core/behavior/forwardArmed") {
        const bool armed = value > 0.5f;
        state.forwardArmed.store(armed, std::memory_order_relaxed);
        if (!armed) {
            clearForwardSchedule(forwardScheduled, forwardFireAtSample,
                                 forwardScheduledBars);
        } else {
            scheduleForwardCommitIfNeeded();
        }
        return true;
    }

    if (path == "/core/behavior/forwardBars") {
        const float bars = juce::jmax(0.0f, value);
        state.forwardBars.store(bars, std::memory_order_relaxed);
        if (bars <= 0.0f) {
            state.forwardArmed.store(false, std::memory_order_relaxed);
            clearForwardSchedule(forwardScheduled, forwardFireAtSample,
                                 forwardScheduledBars);
        } else {
            forwardScheduled = false;
            scheduleForwardCommitIfNeeded();
        }
        return true;
    }

    if (path == "/core/behavior/forward") {
        const float bars = juce::jmax(0.0f, value);
        state.forwardBars.store(bars, std::memory_order_relaxed);
        state.forwardArmed.store(bars > 0.0f, std::memory_order_relaxed);
        if (bars <= 0.0f) {
            clearForwardSchedule(forwardScheduled, forwardFireAtSample,
                                 forwardScheduledBars);
        } else {
            forwardScheduled = false;
            scheduleForwardCommitIfNeeded();
        }
        return true;
    }

    if (path == "/core/behavior/commit") {
        state.commitCount.fetch_add(1, std::memory_order_relaxed);
        const int activeLayer = state.activeLayer.load(std::memory_order_relaxed);
        if (activeLayer >= 0 && activeLayer < maxLayers) {
            auto& ls = state.layers[activeLayer];
            const float requestedBars = juce::jmax(0.0625f, value);
            const int requestedSamples = std::max(
                1, static_cast<int>(requestedBars * getSamplesPerBar()));

            int effectiveSamples = requestedSamples;
            if (dspScriptHost != nullptr) {
                const int actualLoopLength =
                    dspScriptHost->getLayerLoopLength(activeLayer);
                if (actualLoopLength > 0) {
                    effectiveSamples = actualLoopLength;
                }
            }

            ls.length.store(effectiveSamples, std::memory_order_relaxed);
            ls.playheadPos.store(0, std::memory_order_relaxed);
            const float spb = getSamplesPerBar();
            ls.numBars.store(spb > 0.0f
                                 ? static_cast<float>(effectiveSamples) / spb
                                 : 0.0f,
                             std::memory_order_relaxed);
            ls.state.store(static_cast<int>(ScriptableLayerState::Playing),
                           std::memory_order_relaxed);
        }
        state.forwardArmed.store(false, std::memory_order_relaxed);
        state.forwardBars.store(0.0f, std::memory_order_relaxed);
        clearForwardSchedule(forwardScheduled, forwardFireAtSample,
                             forwardScheduledBars);
        return true;
    }

    if (path == "/core/behavior/forwardFire") {
        if (value > 0.5f) {
            state.forwardArmed.store(false, std::memory_order_relaxed);
            state.forwardBars.store(0.0f, std::memory_order_relaxed);
            clearForwardSchedule(forwardScheduled, forwardFireAtSample,
                                 forwardScheduledBars);
        }
        return true;
    }

    if (path == "/core/behavior/transport") {
        const int transport = static_cast<int>(value);
        for (int i = 0; i < maxLayers; ++i) {
            auto& ls = state.layers[i];
            const int currentState = ls.state.load(std::memory_order_relaxed);
            if (currentState == static_cast<int>(ScriptableLayerState::Empty)) {
                continue;
            }
            if (transport == 0) {
                ls.state.store(static_cast<int>(ScriptableLayerState::Stopped),
                               std::memory_order_relaxed);
            } else if (transport == 1) {
                ls.state.store(static_cast<int>(ScriptableLayerState::Playing),
                               std::memory_order_relaxed);
            } else if (transport == 2) {
                ls.state.store(static_cast<int>(ScriptableLayerState::Paused),
                               std::memory_order_relaxed);
            }
        }
        return true;
    }

    if (path == "/core/behavior/graph/enabled") {
        const bool enabled = value > 0.5f;
        graphProcessingEnabled.store(enabled, std::memory_order_relaxed);
        state.graphEnabled.store(enabled, std::memory_order_relaxed);
        return true;
    }

    if (path == "/core/behavior/link/enabled") {
        linkSync.setEnabled(value > 0.5f);
        return true;
    }
    if (path == "/core/behavior/link/tempoSync") {
        linkSync.setTempoSyncEnabled(value > 0.5f);
        return true;
    }
    if (path == "/core/behavior/link/startStopSync") {
        linkSync.setStartStopSyncEnabled(value > 0.5f);
        return true;
    }

    int layerIndex = -1;
    std::string suffix;
    if (extractLayerParam(path, maxLayers, layerIndex, suffix)) {
        auto& ls = state.layers[layerIndex];

        if (suffix == "volume") {
            ls.volume.store(juce::jlimit(0.0f, 2.0f, value),
                            std::memory_order_relaxed);
            return true;
        }
        if (suffix == "speed") {
            ls.speed.store(juce::jlimit(-4.0f, 4.0f, value),
                           std::memory_order_relaxed);
            return true;
        }
        if (suffix == "reverse") {
            ls.reversed.store(value > 0.5f, std::memory_order_relaxed);
            return true;
        }
        if (suffix == "mute") {
            ls.muted.store(value > 0.5f, std::memory_order_relaxed);
            return true;
        }
        if (suffix == "play") {
            ls.state.store(static_cast<int>(ScriptableLayerState::Playing),
                           std::memory_order_relaxed);
            return true;
        }
        if (suffix == "pause") {
            ls.state.store(static_cast<int>(ScriptableLayerState::Paused),
                           std::memory_order_relaxed);
            return true;
        }
        if (suffix == "stop") {
            ls.state.store(static_cast<int>(ScriptableLayerState::Stopped),
                           std::memory_order_relaxed);
            return true;
        }
        if (suffix == "clear") {
            ls.length.store(0, std::memory_order_relaxed);
            ls.playheadPos.store(0, std::memory_order_relaxed);
            ls.state.store(static_cast<int>(ScriptableLayerState::Empty),
                           std::memory_order_relaxed);
            return true;
        }
        if (suffix == "seek") {
            const int length = std::max(1, ls.length.load(std::memory_order_relaxed));
            const int pos = static_cast<int>(juce::jlimit(0.0f, 1.0f, value) *
                                             length);
            ls.playheadPos.store(pos, std::memory_order_relaxed);
            return true;
        }
    }

    return false;
}

inline float readCoreParamPath(
    const std::string& path,
    int maxLayers,
    const ControlServer& controlServer,
    const std::atomic<bool>& graphProcessingEnabled,
    const LinkSync& linkSync,
    const DSPPluginScriptHost* dspScriptHost,
    const std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>>& dspSlots) {
    const auto& state = controlServer.getAtomicState();

    if (path == "/core/behavior/tempo") {
        return state.tempo.load(std::memory_order_relaxed);
    }
    if (path == "/core/behavior/targetbpm") {
        return state.targetBPM.load(std::memory_order_relaxed);
    }
    if (path == "/core/behavior/volume") {
        return state.masterVolume.load(std::memory_order_relaxed);
    }
    if (path == "/core/behavior/inputVolume") {
        return state.inputVolume.load(std::memory_order_relaxed);
    }
    if (path == "/core/behavior/passthrough") {
        return state.passthroughEnabled.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/recording") {
        return state.isRecording.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/overdub") {
        return state.overdubEnabled.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/layer") {
        return static_cast<float>(state.activeLayer.load(std::memory_order_relaxed));
    }
    if (path == "/core/behavior/forwardArmed") {
        return state.forwardArmed.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/forwardBars") {
        return state.forwardBars.load(std::memory_order_relaxed);
    }
    if (path == "/core/behavior/mode") {
        return static_cast<float>(state.recordMode.load(std::memory_order_relaxed));
    }
    if (path == "/core/behavior/graph/enabled") {
        return graphProcessingEnabled.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/link/enabled") {
        return linkSync.isEnabled() ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/link/tempoSync") {
        return linkSync.getState().isTempoSyncEnabled.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/link/startStopSync") {
        return linkSync.getState().isStartStopSyncEnabled.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/link/peers") {
        return static_cast<float>(linkSync.getNumPeers());
    }
    if (path == "/core/behavior/link/playing") {
        return linkSync.getIsPlaying() ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/link/beat") {
        return static_cast<float>(linkSync.getBeat());
    }
    if (path == "/core/behavior/link/phase") {
        return static_cast<float>(linkSync.getPhase());
    }

    int layerIndex = -1;
    std::string suffix;
    if (extractLayerParam(path, maxLayers, layerIndex, suffix)) {
        const auto& ls = state.layers[layerIndex];
        if (suffix == "volume") {
            return ls.volume.load(std::memory_order_relaxed);
        }
        if (suffix == "speed") {
            return ls.speed.load(std::memory_order_relaxed);
        }
        if (suffix == "reverse") {
            return ls.reversed.load(std::memory_order_relaxed) ? 1.0f : 0.0f;
        }
        if (suffix == "mute") {
            return ls.state.load(std::memory_order_relaxed) ==
                           static_cast<int>(ScriptableLayerState::Muted)
                       ? 1.0f
                       : 0.0f;
        }
        if (suffix == "length") {
            return static_cast<float>(ls.length.load(std::memory_order_relaxed));
        }
        if (suffix == "position") {
            const int length = std::max(1, ls.length.load(std::memory_order_relaxed));
            return static_cast<float>(ls.playheadPos.load(std::memory_order_relaxed)) /
                   static_cast<float>(length);
        }
    }

    if (dspScriptHost != nullptr && dspScriptHost->hasParam(path)) {
        return dspScriptHost->getParam(path);
    }

    for (const auto& entry : dspSlots) {
        const auto* host = entry.second.get();
        if (host != nullptr && host->hasParam(path)) {
            return host->getParam(path);
        }
    }

    return 0.0f;
}

inline bool hasCoreEndpoint(
    const std::string& path,
    const OSCEndpointRegistry& endpointRegistry,
    const DSPPluginScriptHost* dspScriptHost,
    const std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>>& dspSlots) {
    if (path == "/core/behavior/graph/enabled") {
        return true;
    }

    if (path.rfind("/core/behavior/link/", 0) == 0) {
        return true;
    }

    if (dspScriptHost != nullptr && dspScriptHost->hasParam(path)) {
        return true;
    }

    for (const auto& entry : dspSlots) {
        const auto* host = entry.second.get();
        if (host != nullptr && host->hasParam(path)) {
            return true;
        }
    }

    const auto endpoint = endpointRegistry.findEndpoint(juce::String(path));
    return endpoint.path.isNotEmpty();
}

} // namespace behavior_param_support
} // namespace manifold
