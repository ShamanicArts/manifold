#pragma once

#include <atomic>
#include <mutex>
#include <string>

#include "../primitives/control/BehaviorControlStateView.h"
#include "../primitives/control/BehaviorRuntimeTelemetryView.h"
#include "../primitives/control/ControlServer.h"
#include "../primitives/dsp/CaptureBuffer.h"

namespace manifold {
namespace behavior_housekeeping_support {

template <typename Request, typename Accessor>
inline std::string takePendingString(Request& req,
                                     Accessor accessor,
                                     bool clearValue) {
    if (!req.pending.load(std::memory_order_acquire)) {
        return {};
    }

    std::lock_guard<std::mutex> lock(req.mutex);
    std::string value = accessor(req);
    if (clearValue) {
        accessor(req).clear();
    }
    req.pending.store(false, std::memory_order_release);
    return value;
}

inline void clearForwardSchedule(bool& forwardScheduled,
                                 double& forwardFireAtSample,
                                 float& forwardScheduledBars) {
    forwardScheduled = false;
    forwardFireAtSample = 0.0;
    forwardScheduledBars = 0.0f;
}

inline void scheduleForwardCommitIfNeeded(ControlServer& controlServer,
                                          std::atomic<double>& playTimeSamples,
                                          bool& forwardScheduled,
                                          double& forwardFireAtSample,
                                          float& forwardScheduledBars) {
    controlServer.syncOwnedStateFromLegacyMirror();
    auto& state = controlServer.getAtomicState();
    manifold::control_state_view::BehaviorControlStateConstView controlState(
        controlServer.getBehaviorControlState(), &state);
    manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryConstView runtimeTelemetry(
        controlServer.getBehaviorRuntimeTelemetry(), &state);

    const bool armed = controlState.forwardArmed();
    const float bars = controlState.forwardBars();

    if (!armed || bars <= 0.0f) {
        clearForwardSchedule(forwardScheduled, forwardFireAtSample,
                             forwardScheduledBars);
        return;
    }

    if (forwardScheduled) {
        return;
    }

    const float samplesPerBar = runtimeTelemetry.samplesPerBar();
    if (samplesPerBar <= 0.0f) {
        return;
    }

    forwardScheduledBars = bars;
    forwardFireAtSample = playTimeSamples.load(std::memory_order_relaxed) +
                          static_cast<double>(bars) *
                              static_cast<double>(samplesPerBar);
    forwardScheduled = true;
}

inline void initialiseAtomicState(ControlServer& controlServer,
                                  double sampleRate,
                                  const CaptureBuffer& captureBuffer,
                                  bool graphProcessingEnabled,
                                  float defaultTempo,
                                  float defaultTargetBpm,
                                  float defaultMasterVolume,
                                  float defaultInputVolume) {
    auto& state = controlServer.getAtomicState();
    manifold::control_state_view::BehaviorControlStateView controlState(
        controlServer.getBehaviorControlState(), &state);
    manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryView runtimeTelemetry(
        controlServer.getBehaviorRuntimeTelemetry(), &state);

    runtimeTelemetry.setSampleRate(sampleRate);
    controlState.setTempo(defaultTempo);
    runtimeTelemetry.setTempo(defaultTempo);
    controlState.setTargetBpm(defaultTargetBpm);
    runtimeTelemetry.setSamplesPerBar(
        sampleRate > 0.0 ? static_cast<float>((sampleRate * 240.0) / defaultTempo)
                         : 0.0f);
    runtimeTelemetry.setCaptureSize(captureBuffer.getSize());
    runtimeTelemetry.setCaptureWritePos(captureBuffer.getOffsetToNow());
    runtimeTelemetry.setCaptureLevel(0.0f);
    controlState.setIsRecording(false);
    controlState.setOverdubEnabled(false);
    controlState.setForwardArmed(false);
    controlState.setForwardBars(0.0f);
    controlState.setGraphEnabled(graphProcessingEnabled);
    runtimeTelemetry.setGraphEnabled(graphProcessingEnabled);
    controlState.setRecordMode(0);
    controlState.setActiveLayer(0);
    controlState.setMasterVolume(defaultMasterVolume);
    controlState.setInputVolume(defaultInputVolume);
    controlState.setPassthroughEnabled(true);
    runtimeTelemetry.setPlayTime(0.0);
    runtimeTelemetry.setCommitCount(0);
    runtimeTelemetry.setUptimeSeconds(0.0);

    for (int i = 0; i < AtomicState::MAX_LAYERS; ++i) {
        runtimeTelemetry.setLayerLength(i, 0);
        runtimeTelemetry.setLayerPlayheadPos(i, 0);
        controlState.setLayerSpeed(i, 1.0f);
        controlState.setLayerReversed(i, false);
        controlState.setLayerVolume(i, 1.0f);
        runtimeTelemetry.setLayerState(i, 0);
        controlState.setLayerMuted(i, false);
        runtimeTelemetry.setLayerNumBars(i, 0.0f);
    }
}

} // namespace behavior_housekeeping_support
} // namespace manifold
