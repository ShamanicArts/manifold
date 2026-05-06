#pragma once

#include "BehaviorRuntimeTelemetry.h"
#include "ControlServer.h"

#include <cassert>

namespace manifold {
namespace runtime_telemetry_view {

class BehaviorRuntimeTelemetryConstView {
public:
    explicit BehaviorRuntimeTelemetryConstView(const AtomicState& state)
        : runtimeTelemetry_(nullptr), legacyState_(&state) {}

    explicit BehaviorRuntimeTelemetryConstView(
        const manifold::BehaviorRuntimeTelemetry& state,
        const AtomicState* legacyMirror = nullptr)
        : runtimeTelemetry_(&state), legacyState_(legacyMirror) {}

    static constexpr int maxLayers() {
        return AtomicState::MAX_LAYERS;
    }

    float tempo() const {
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->effectiveTempo.load(std::memory_order_relaxed)
                   : legacyState_->tempo.load(std::memory_order_relaxed);
    }

    float samplesPerBar() const {
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->samplesPerBar.load(std::memory_order_relaxed)
                   : legacyState_->samplesPerBar.load(std::memory_order_relaxed);
    }

    double sampleRate() const {
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->sampleRate.load(std::memory_order_relaxed)
                   : legacyState_->sampleRate.load(std::memory_order_relaxed);
    }

    int captureSize() const {
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->captureSize.load(std::memory_order_relaxed)
                   : legacyState_->captureSize.load(std::memory_order_relaxed);
    }

    int captureWritePos() const {
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->captureWritePos.load(std::memory_order_relaxed)
                   : legacyState_->captureWritePos.load(std::memory_order_relaxed);
    }

    float captureLevel() const {
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->captureLevel.load(std::memory_order_relaxed)
                   : legacyState_->captureLevel.load(std::memory_order_relaxed);
    }

    bool graphEnabled() const {
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->effectiveGraphEnabled.load(std::memory_order_relaxed)
                   : legacyState_->graphEnabled.load(std::memory_order_relaxed);
    }

    double playTime() const {
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->playTime.load(std::memory_order_relaxed)
                   : legacyState_->playTime.load(std::memory_order_relaxed);
    }

    int commitCount() const {
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->commitCount.load(std::memory_order_relaxed)
                   : legacyState_->commitCount.load(std::memory_order_relaxed);
    }

    double uptimeSeconds() const {
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->uptimeSeconds.load(std::memory_order_relaxed)
                   : legacyState_->uptimeSeconds.load(std::memory_order_relaxed);
    }

    int layerState(int index) const {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->layers[index].state.load(std::memory_order_relaxed)
                   : legacyState_->layers[index].state.load(std::memory_order_relaxed);
    }

    int layerLength(int index) const {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->layers[index].length.load(std::memory_order_relaxed)
                   : legacyState_->layers[index].length.load(std::memory_order_relaxed);
    }

    int layerPlayheadPos(int index) const {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->layers[index].playheadPos.load(std::memory_order_relaxed)
                   : legacyState_->layers[index].playheadPos.load(std::memory_order_relaxed);
    }

    float layerNumBars(int index) const {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        return runtimeTelemetry_ != nullptr
                   ? runtimeTelemetry_->layers[index].numBars.load(std::memory_order_relaxed)
                   : legacyState_->layers[index].numBars.load(std::memory_order_relaxed);
    }

protected:
    const manifold::BehaviorRuntimeTelemetry* runtimeTelemetry_ = nullptr;
    const AtomicState* legacyState_ = nullptr;
};

class BehaviorRuntimeTelemetryView : public BehaviorRuntimeTelemetryConstView {
public:
    explicit BehaviorRuntimeTelemetryView(AtomicState& state)
        : BehaviorRuntimeTelemetryConstView(state),
          mutableRuntimeTelemetry_(nullptr),
          mutableLegacyState_(&state) {}

    explicit BehaviorRuntimeTelemetryView(manifold::BehaviorRuntimeTelemetry& state,
                                          AtomicState* legacyMirror = nullptr)
        : BehaviorRuntimeTelemetryConstView(state, legacyMirror),
          mutableRuntimeTelemetry_(&state),
          mutableLegacyState_(legacyMirror) {}

    void setTempo(float value) {
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->effectiveTempo.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->tempo.store(value, std::memory_order_relaxed);
        }
    }

    void setSamplesPerBar(float value) {
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->samplesPerBar.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->samplesPerBar.store(value, std::memory_order_relaxed);
        }
    }

    void setSampleRate(double value) {
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->sampleRate.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->sampleRate.store(value, std::memory_order_relaxed);
        }
    }

    void setCaptureSize(int value) {
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->captureSize.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->captureSize.store(value, std::memory_order_relaxed);
        }
    }

    void setCaptureWritePos(int value) {
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->captureWritePos.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->captureWritePos.store(value, std::memory_order_relaxed);
        }
    }

    void setCaptureLevel(float value) {
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->captureLevel.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->captureLevel.store(value, std::memory_order_relaxed);
        }
    }

    void setGraphEnabled(bool value) {
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->effectiveGraphEnabled.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->graphEnabled.store(value, std::memory_order_relaxed);
        }
    }

    void setPlayTime(double value) {
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->playTime.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->playTime.store(value, std::memory_order_relaxed);
        }
    }

    void setCommitCount(int value) {
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->commitCount.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->commitCount.store(value, std::memory_order_relaxed);
        }
    }

    int incrementCommitCount() {
        int result = 0;
        if (mutableRuntimeTelemetry_ != nullptr) {
            result = mutableRuntimeTelemetry_->commitCount.fetch_add(1, std::memory_order_relaxed) + 1;
        }
        if (mutableLegacyState_ != nullptr) {
            result = mutableLegacyState_->commitCount.fetch_add(1, std::memory_order_relaxed) + 1;
        }
        return result;
    }

    void setUptimeSeconds(double value) {
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->uptimeSeconds.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->uptimeSeconds.store(value, std::memory_order_relaxed);
        }
    }

    void setLayerState(int index, int value) {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->layers[index].state.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->layers[index].state.store(value, std::memory_order_relaxed);
        }
    }

    void setLayerLength(int index, int value) {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->layers[index].length.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->layers[index].length.store(value, std::memory_order_relaxed);
        }
    }

    void setLayerPlayheadPos(int index, int value) {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->layers[index].playheadPos.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->layers[index].playheadPos.store(value, std::memory_order_relaxed);
        }
    }

    void setLayerNumBars(int index, float value) {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        if (mutableRuntimeTelemetry_ != nullptr) {
            mutableRuntimeTelemetry_->layers[index].numBars.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->layers[index].numBars.store(value, std::memory_order_relaxed);
        }
    }

private:
    manifold::BehaviorRuntimeTelemetry* mutableRuntimeTelemetry_ = nullptr;
    AtomicState* mutableLegacyState_ = nullptr;
};

} // namespace runtime_telemetry_view
} // namespace manifold
