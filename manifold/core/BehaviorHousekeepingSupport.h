#pragma once

#include <atomic>
#include <mutex>
#include <string>

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
    auto& state = controlServer.getAtomicState();

    const bool armed = state.forwardArmed.load(std::memory_order_relaxed);
    const float bars = state.forwardBars.load(std::memory_order_relaxed);

    if (!armed || bars <= 0.0f) {
        clearForwardSchedule(forwardScheduled, forwardFireAtSample,
                             forwardScheduledBars);
        return;
    }

    if (forwardScheduled) {
        return;
    }

    const float samplesPerBar = state.samplesPerBar.load(std::memory_order_relaxed);
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

    state.sampleRate.store(sampleRate, std::memory_order_relaxed);
    state.tempo.store(defaultTempo, std::memory_order_relaxed);
    state.targetBPM.store(defaultTargetBpm, std::memory_order_relaxed);
    state.samplesPerBar.store(
        sampleRate > 0.0 ? static_cast<float>((sampleRate * 240.0) / defaultTempo)
                         : 0.0f,
        std::memory_order_relaxed);
    state.captureSize.store(captureBuffer.getSize(), std::memory_order_relaxed);
    state.captureWritePos.store(captureBuffer.getOffsetToNow(),
                                std::memory_order_relaxed);
    state.captureLevel.store(0.0f, std::memory_order_relaxed);
    state.isRecording.store(false, std::memory_order_relaxed);
    state.overdubEnabled.store(false, std::memory_order_relaxed);
    state.forwardArmed.store(false, std::memory_order_relaxed);
    state.forwardBars.store(0.0f, std::memory_order_relaxed);
    state.graphEnabled.store(graphProcessingEnabled, std::memory_order_relaxed);
    state.recordMode.store(0, std::memory_order_relaxed);
    state.activeLayer.store(0, std::memory_order_relaxed);
    state.masterVolume.store(defaultMasterVolume, std::memory_order_relaxed);
    state.inputVolume.store(defaultInputVolume, std::memory_order_relaxed);
    state.passthroughEnabled.store(true, std::memory_order_relaxed);
    state.playTime.store(0.0, std::memory_order_relaxed);
    state.commitCount.store(0, std::memory_order_relaxed);
    state.uptimeSeconds.store(0.0, std::memory_order_relaxed);

    for (int i = 0; i < AtomicState::MAX_LAYERS; ++i) {
        auto& layer = state.layers[i];
        layer.length.store(0, std::memory_order_relaxed);
        layer.playheadPos.store(0, std::memory_order_relaxed);
        layer.speed.store(1.0f, std::memory_order_relaxed);
        layer.reversed.store(false, std::memory_order_relaxed);
        layer.volume.store(1.0f, std::memory_order_relaxed);
        layer.state.store(0, std::memory_order_relaxed);
        layer.muted.store(false, std::memory_order_relaxed);
        layer.numBars.store(0.0f, std::memory_order_relaxed);
    }
}

} // namespace behavior_housekeeping_support
} // namespace manifold
