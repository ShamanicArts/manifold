#pragma once

#include "BehaviorRuntimeTelemetry.h"

#include <cassert>

namespace manifold {
namespace runtime_telemetry_view {

class BehaviorRuntimeTelemetryConstView {
public:
    explicit BehaviorRuntimeTelemetryConstView(
        const manifold::BehaviorRuntimeTelemetry& state)
        : runtimeTelemetry_(&state) {}

    static constexpr int maxLayers() {
        return manifold::BehaviorRuntimeTelemetry::MAX_LAYERS;
    }

    float tempo() const {
        return runtimeTelemetry_->effectiveTempo.load(std::memory_order_relaxed);
    }

    float samplesPerBar() const {
        return runtimeTelemetry_->samplesPerBar.load(std::memory_order_relaxed);
    }

    double sampleRate() const {
        return runtimeTelemetry_->sampleRate.load(std::memory_order_relaxed);
    }

    int captureSize() const {
        return runtimeTelemetry_->captureSize.load(std::memory_order_relaxed);
    }

    int captureWritePos() const {
        return runtimeTelemetry_->captureWritePos.load(std::memory_order_relaxed);
    }

    float captureLevel() const {
        return runtimeTelemetry_->captureLevel.load(std::memory_order_relaxed);
    }

    bool graphEnabled() const {
        return runtimeTelemetry_->effectiveGraphEnabled.load(std::memory_order_relaxed);
    }

    double playTime() const {
        return runtimeTelemetry_->playTime.load(std::memory_order_relaxed);
    }

    int commitCount() const {
        return runtimeTelemetry_->commitCount.load(std::memory_order_relaxed);
    }

    double uptimeSeconds() const {
        return runtimeTelemetry_->uptimeSeconds.load(std::memory_order_relaxed);
    }

    int layerState(int index) const {
        assert(index >= 0 && index < manifold::BehaviorRuntimeTelemetry::MAX_LAYERS);
        return runtimeTelemetry_->layers[index].state.load(std::memory_order_relaxed);
    }

    int layerLength(int index) const {
        assert(index >= 0 && index < manifold::BehaviorRuntimeTelemetry::MAX_LAYERS);
        return runtimeTelemetry_->layers[index].length.load(std::memory_order_relaxed);
    }

    int layerPlayheadPos(int index) const {
        assert(index >= 0 && index < manifold::BehaviorRuntimeTelemetry::MAX_LAYERS);
        return runtimeTelemetry_->layers[index].playheadPos.load(std::memory_order_relaxed);
    }

    float layerNumBars(int index) const {
        assert(index >= 0 && index < manifold::BehaviorRuntimeTelemetry::MAX_LAYERS);
        return runtimeTelemetry_->layers[index].numBars.load(std::memory_order_relaxed);
    }

protected:
    const manifold::BehaviorRuntimeTelemetry* runtimeTelemetry_ = nullptr;
};

class BehaviorRuntimeTelemetryView : public BehaviorRuntimeTelemetryConstView {
public:
    explicit BehaviorRuntimeTelemetryView(manifold::BehaviorRuntimeTelemetry& state)
        : BehaviorRuntimeTelemetryConstView(state),
          mutableRuntimeTelemetry_(&state) {}

    void setTempo(float value) {
        mutableRuntimeTelemetry_->effectiveTempo.store(value, std::memory_order_relaxed);
    }

    void setSamplesPerBar(float value) {
        mutableRuntimeTelemetry_->samplesPerBar.store(value, std::memory_order_relaxed);
    }

    void setSampleRate(double value) {
        mutableRuntimeTelemetry_->sampleRate.store(value, std::memory_order_relaxed);
    }

    void setCaptureSize(int value) {
        mutableRuntimeTelemetry_->captureSize.store(value, std::memory_order_relaxed);
    }

    void setCaptureWritePos(int value) {
        mutableRuntimeTelemetry_->captureWritePos.store(value, std::memory_order_relaxed);
    }

    void setCaptureLevel(float value) {
        mutableRuntimeTelemetry_->captureLevel.store(value, std::memory_order_relaxed);
    }

    void setGraphEnabled(bool value) {
        mutableRuntimeTelemetry_->effectiveGraphEnabled.store(value, std::memory_order_relaxed);
    }

    void setPlayTime(double value) {
        mutableRuntimeTelemetry_->playTime.store(value, std::memory_order_relaxed);
    }

    void setCommitCount(int value) {
        mutableRuntimeTelemetry_->commitCount.store(value, std::memory_order_relaxed);
    }

    int incrementCommitCount() {
        return mutableRuntimeTelemetry_->commitCount.fetch_add(1, std::memory_order_relaxed) + 1;
    }

    void setUptimeSeconds(double value) {
        mutableRuntimeTelemetry_->uptimeSeconds.store(value, std::memory_order_relaxed);
    }

    void setLayerState(int index, int value) {
        assert(index >= 0 && index < manifold::BehaviorRuntimeTelemetry::MAX_LAYERS);
        mutableRuntimeTelemetry_->layers[index].state.store(value, std::memory_order_relaxed);
    }

    void setLayerLength(int index, int value) {
        assert(index >= 0 && index < manifold::BehaviorRuntimeTelemetry::MAX_LAYERS);
        mutableRuntimeTelemetry_->layers[index].length.store(value, std::memory_order_relaxed);
    }

    void setLayerPlayheadPos(int index, int value) {
        assert(index >= 0 && index < manifold::BehaviorRuntimeTelemetry::MAX_LAYERS);
        mutableRuntimeTelemetry_->layers[index].playheadPos.store(value, std::memory_order_relaxed);
    }

    void setLayerNumBars(int index, float value) {
        assert(index >= 0 && index < manifold::BehaviorRuntimeTelemetry::MAX_LAYERS);
        mutableRuntimeTelemetry_->layers[index].numBars.store(value, std::memory_order_relaxed);
    }

private:
    manifold::BehaviorRuntimeTelemetry* mutableRuntimeTelemetry_ = nullptr;
};

} // namespace runtime_telemetry_view
} // namespace manifold
