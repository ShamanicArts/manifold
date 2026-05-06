#pragma once

#include <atomic>
#include <functional>
#include <memory>
#include <string>
#include <unordered_map>

#include "../primitives/control/BehaviorControlStateView.h"
#include "../primitives/control/BehaviorRuntimeTelemetryView.h"
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
    controlServer.syncOwnedStateFromLegacyMirror();
    manifold::control_state_view::BehaviorControlStateView controlState(
        controlServer.getBehaviorControlState(), &controlServer.getAtomicState());
    manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryView runtimeTelemetry(
        controlServer.getBehaviorRuntimeTelemetry(), &controlServer.getAtomicState());

    if (path == "/core/behavior/tempo") {
        const float tempo = juce::jlimit(20.0f, 300.0f, value);
        controlState.setTempo(tempo);
        runtimeTelemetry.setTempo(tempo);
        runtimeTelemetry.setSamplesPerBar(
            computeSamplesPerBar(tempo,
                                 currentSampleRate.load(std::memory_order_relaxed)));
        if (linkSync.isEnabled()) {
            linkSync.requestTempo(static_cast<double>(tempo));
        }
        return true;
    }

    if (path == "/core/behavior/targetbpm") {
        controlState.setTargetBpm(value);
        return true;
    }

    if (path == "/core/behavior/volume") {
        controlState.setMasterVolume(juce::jlimit(0.0f, 2.0f, value));
        return true;
    }

    if (path == "/core/behavior/inputVolume") {
        controlState.setInputVolume(juce::jlimit(0.0f, 2.0f, value));
        return true;
    }

    if (path == "/core/behavior/passthrough") {
        controlState.setPassthroughEnabled(value > 0.5f);
        return true;
    }

    if (path == "/core/behavior/recording") {
        const bool recording = value > 0.5f;
        const int activeLayer = juce::jlimit(
            0, maxLayers - 1, controlState.activeLayer());

        controlState.setIsRecording(recording);

        if (recording) {
            runtimeTelemetry.setLayerState(
                activeLayer, static_cast<int>(ScriptableLayerState::Recording));
            scheduleForwardCommitIfNeeded();
            return true;
        }

        controlState.setForwardArmed(false);
        controlState.setForwardBars(0.0f);
        clearForwardSchedule(forwardScheduled, forwardFireAtSample,
                             forwardScheduledBars);
        return true;
    }

    if (path == "/core/behavior/overdub") {
        controlState.setOverdubEnabled(value > 0.5f);
        return true;
    }

    if (path == "/core/behavior/layer") {
        const int layer = juce::jlimit(0, maxLayers - 1, static_cast<int>(value));
        controlState.setActiveLayer(layer);
        return true;
    }

    if (path == "/core/behavior/mode") {
        const int mode = juce::jlimit(0, 2, static_cast<int>(value));
        controlState.setRecordMode(mode);
        return true;
    }

    if (path == "/core/behavior/forwardArmed") {
        const bool armed = value > 0.5f;
        controlState.setForwardArmed(armed);
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
        controlState.setForwardBars(bars);
        if (bars <= 0.0f) {
            controlState.setForwardArmed(false);
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
        controlState.setForwardBars(bars);
        controlState.setForwardArmed(bars > 0.0f);
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
        runtimeTelemetry.incrementCommitCount();
        const int activeLayer = controlState.activeLayer();
        if (activeLayer >= 0 && activeLayer < maxLayers) {
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

            runtimeTelemetry.setLayerLength(activeLayer, effectiveSamples);
            runtimeTelemetry.setLayerPlayheadPos(activeLayer, 0);
            const float spb = getSamplesPerBar();
            runtimeTelemetry.setLayerNumBars(
                activeLayer,
                spb > 0.0f ? static_cast<float>(effectiveSamples) / spb : 0.0f);
            runtimeTelemetry.setLayerState(
                activeLayer, static_cast<int>(ScriptableLayerState::Playing));
        }
        controlState.setForwardArmed(false);
        controlState.setForwardBars(0.0f);
        clearForwardSchedule(forwardScheduled, forwardFireAtSample,
                             forwardScheduledBars);
        return true;
    }

    if (path == "/core/behavior/forwardFire") {
        if (value > 0.5f) {
            controlState.setForwardArmed(false);
            controlState.setForwardBars(0.0f);
            clearForwardSchedule(forwardScheduled, forwardFireAtSample,
                                 forwardScheduledBars);
        }
        return true;
    }

    if (path == "/core/behavior/transport") {
        const int transport = static_cast<int>(value);
        for (int i = 0; i < maxLayers; ++i) {
            const int currentState = runtimeTelemetry.layerState(i);
            if (currentState == static_cast<int>(ScriptableLayerState::Empty)) {
                continue;
            }
            if (transport == 0) {
                runtimeTelemetry.setLayerState(
                    i, static_cast<int>(ScriptableLayerState::Stopped));
            } else if (transport == 1) {
                runtimeTelemetry.setLayerState(
                    i, static_cast<int>(ScriptableLayerState::Playing));
            } else if (transport == 2) {
                runtimeTelemetry.setLayerState(
                    i, static_cast<int>(ScriptableLayerState::Paused));
            }
        }
        return true;
    }

    if (path == "/core/behavior/graph/enabled") {
        const bool enabled = value > 0.5f;
        graphProcessingEnabled.store(enabled, std::memory_order_relaxed);
        controlState.setGraphEnabled(enabled);
        runtimeTelemetry.setGraphEnabled(enabled);
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
        if (suffix == "volume") {
            controlState.setLayerVolume(layerIndex, juce::jlimit(0.0f, 2.0f, value));
            return true;
        }
        if (suffix == "speed") {
            controlState.setLayerSpeed(layerIndex, juce::jlimit(-4.0f, 4.0f, value));
            return true;
        }
        if (suffix == "reverse") {
            controlState.setLayerReversed(layerIndex, value > 0.5f);
            return true;
        }
        if (suffix == "mute") {
            controlState.setLayerMuted(layerIndex, value > 0.5f);
            return true;
        }
        if (suffix == "play") {
            runtimeTelemetry.setLayerState(
                layerIndex, static_cast<int>(ScriptableLayerState::Playing));
            return true;
        }
        if (suffix == "pause") {
            runtimeTelemetry.setLayerState(
                layerIndex, static_cast<int>(ScriptableLayerState::Paused));
            return true;
        }
        if (suffix == "stop") {
            runtimeTelemetry.setLayerState(
                layerIndex, static_cast<int>(ScriptableLayerState::Stopped));
            return true;
        }
        if (suffix == "clear") {
            runtimeTelemetry.setLayerLength(layerIndex, 0);
            runtimeTelemetry.setLayerPlayheadPos(layerIndex, 0);
            runtimeTelemetry.setLayerState(
                layerIndex, static_cast<int>(ScriptableLayerState::Empty));
            return true;
        }
        if (suffix == "seek") {
            const int length = std::max(1, runtimeTelemetry.layerLength(layerIndex));
            const int pos = static_cast<int>(juce::jlimit(0.0f, 1.0f, value) *
                                             length);
            runtimeTelemetry.setLayerPlayheadPos(layerIndex, pos);
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
    const_cast<ControlServer&>(controlServer).syncOwnedStateFromLegacyMirror();
    manifold::control_state_view::BehaviorControlStateConstView controlState(
        controlServer.getBehaviorControlState(), nullptr);
    manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryConstView runtimeTelemetry(
        controlServer.getBehaviorRuntimeTelemetry(), nullptr);

    if (path == "/core/behavior/tempo") {
        return runtimeTelemetry.tempo();
    }
    if (path == "/core/behavior/targetbpm") {
        return controlState.targetBpm();
    }
    if (path == "/core/behavior/volume") {
        return controlState.masterVolume();
    }
    if (path == "/core/behavior/inputVolume") {
        return controlState.inputVolume();
    }
    if (path == "/core/behavior/passthrough") {
        return controlState.passthroughEnabled() ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/recording") {
        return controlState.isRecording() ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/overdub") {
        return controlState.overdubEnabled() ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/layer") {
        return static_cast<float>(controlState.activeLayer());
    }
    if (path == "/core/behavior/forwardArmed") {
        return controlState.forwardArmed() ? 1.0f : 0.0f;
    }
    if (path == "/core/behavior/forwardBars") {
        return controlState.forwardBars();
    }
    if (path == "/core/behavior/mode") {
        return static_cast<float>(controlState.recordMode());
    }
    if (path == "/core/behavior/graph/enabled") {
        return runtimeTelemetry.graphEnabled() ? 1.0f : 0.0f;
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
        if (suffix == "volume") {
            return controlState.layerVolume(layerIndex);
        }
        if (suffix == "speed") {
            return controlState.layerSpeed(layerIndex);
        }
        if (suffix == "reverse") {
            return controlState.layerReversed(layerIndex) ? 1.0f : 0.0f;
        }
        if (suffix == "mute") {
            return runtimeTelemetry.layerState(layerIndex) ==
                           static_cast<int>(ScriptableLayerState::Muted)
                       ? 1.0f
                       : 0.0f;
        }
        if (suffix == "length") {
            return static_cast<float>(runtimeTelemetry.layerLength(layerIndex));
        }
        if (suffix == "position") {
            const int length = std::max(1, runtimeTelemetry.layerLength(layerIndex));
            return static_cast<float>(runtimeTelemetry.layerPlayheadPos(layerIndex)) /
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
