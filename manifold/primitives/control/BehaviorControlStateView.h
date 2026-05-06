#pragma once

#include "BehaviorControlState.h"
#include "ControlServer.h"

#include <cassert>

namespace manifold {
namespace control_state_view {

class BehaviorControlStateConstView {
public:
    explicit BehaviorControlStateConstView(const AtomicState& state)
        : controlState_(nullptr), legacyState_(&state) {}

    explicit BehaviorControlStateConstView(const manifold::BehaviorControlState& state,
                                           const AtomicState* legacyMirror = nullptr)
        : controlState_(&state), legacyState_(legacyMirror) {}

    static constexpr int maxLayers() {
        return AtomicState::MAX_LAYERS;
    }

    float tempo() const {
        return controlState_ != nullptr
                   ? controlState_->requestedTempo.load(std::memory_order_relaxed)
                   : legacyState_->tempo.load(std::memory_order_relaxed);
    }

    float targetBpm() const {
        return controlState_ != nullptr
                   ? controlState_->targetBPM.load(std::memory_order_relaxed)
                   : legacyState_->targetBPM.load(std::memory_order_relaxed);
    }

    bool isRecording() const {
        return controlState_ != nullptr
                   ? controlState_->isRecording.load(std::memory_order_relaxed)
                   : legacyState_->isRecording.load(std::memory_order_relaxed);
    }

    bool overdubEnabled() const {
        return controlState_ != nullptr
                   ? controlState_->overdubEnabled.load(std::memory_order_relaxed)
                   : legacyState_->overdubEnabled.load(std::memory_order_relaxed);
    }

    bool forwardArmed() const {
        return controlState_ != nullptr
                   ? controlState_->forwardArmed.load(std::memory_order_relaxed)
                   : legacyState_->forwardArmed.load(std::memory_order_relaxed);
    }

    float forwardBars() const {
        return controlState_ != nullptr
                   ? controlState_->forwardBars.load(std::memory_order_relaxed)
                   : legacyState_->forwardBars.load(std::memory_order_relaxed);
    }

    bool graphEnabled() const {
        return controlState_ != nullptr
                   ? controlState_->requestedGraphEnabled.load(std::memory_order_relaxed)
                   : legacyState_->graphEnabled.load(std::memory_order_relaxed);
    }

    int recordMode() const {
        return controlState_ != nullptr
                   ? controlState_->recordMode.load(std::memory_order_relaxed)
                   : legacyState_->recordMode.load(std::memory_order_relaxed);
    }

    int activeLayer() const {
        return controlState_ != nullptr
                   ? controlState_->activeLayer.load(std::memory_order_relaxed)
                   : legacyState_->activeLayer.load(std::memory_order_relaxed);
    }

    float masterVolume() const {
        return controlState_ != nullptr
                   ? controlState_->masterVolume.load(std::memory_order_relaxed)
                   : legacyState_->masterVolume.load(std::memory_order_relaxed);
    }

    float inputVolume() const {
        return controlState_ != nullptr
                   ? controlState_->inputVolume.load(std::memory_order_relaxed)
                   : legacyState_->inputVolume.load(std::memory_order_relaxed);
    }

    bool passthroughEnabled() const {
        return controlState_ != nullptr
                   ? controlState_->passthroughEnabled.load(std::memory_order_relaxed)
                   : legacyState_->passthroughEnabled.load(std::memory_order_relaxed);
    }

    float layerSpeed(int index) const {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        return controlState_ != nullptr
                   ? controlState_->layers[index].speed.load(std::memory_order_relaxed)
                   : legacyState_->layers[index].speed.load(std::memory_order_relaxed);
    }

    bool layerReversed(int index) const {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        return controlState_ != nullptr
                   ? controlState_->layers[index].reversed.load(std::memory_order_relaxed)
                   : legacyState_->layers[index].reversed.load(std::memory_order_relaxed);
    }

    float layerVolume(int index) const {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        return controlState_ != nullptr
                   ? controlState_->layers[index].volume.load(std::memory_order_relaxed)
                   : legacyState_->layers[index].volume.load(std::memory_order_relaxed);
    }

    bool layerMuted(int index) const {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        return controlState_ != nullptr
                   ? controlState_->layers[index].muted.load(std::memory_order_relaxed)
                   : legacyState_->layers[index].muted.load(std::memory_order_relaxed);
    }

protected:
    const manifold::BehaviorControlState* controlState_ = nullptr;
    const AtomicState* legacyState_ = nullptr;
};

class BehaviorControlStateView : public BehaviorControlStateConstView {
public:
    explicit BehaviorControlStateView(AtomicState& state)
        : BehaviorControlStateConstView(state),
          mutableControlState_(nullptr),
          mutableLegacyState_(&state) {}

    explicit BehaviorControlStateView(manifold::BehaviorControlState& state,
                                      AtomicState* legacyMirror = nullptr)
        : BehaviorControlStateConstView(state, legacyMirror),
          mutableControlState_(&state),
          mutableLegacyState_(legacyMirror) {}

    void setTempo(float value) {
        if (mutableControlState_ != nullptr) {
            mutableControlState_->requestedTempo.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->tempo.store(value, std::memory_order_relaxed);
        }
    }

    void setTargetBpm(float value) {
        if (mutableControlState_ != nullptr) {
            mutableControlState_->targetBPM.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->targetBPM.store(value, std::memory_order_relaxed);
        }
    }

    void setIsRecording(bool value) {
        if (mutableControlState_ != nullptr) {
            mutableControlState_->isRecording.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->isRecording.store(value, std::memory_order_relaxed);
        }
    }

    void setOverdubEnabled(bool value) {
        if (mutableControlState_ != nullptr) {
            mutableControlState_->overdubEnabled.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->overdubEnabled.store(value, std::memory_order_relaxed);
        }
    }

    void setForwardArmed(bool value) {
        if (mutableControlState_ != nullptr) {
            mutableControlState_->forwardArmed.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->forwardArmed.store(value, std::memory_order_relaxed);
        }
    }

    void setForwardBars(float value) {
        if (mutableControlState_ != nullptr) {
            mutableControlState_->forwardBars.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->forwardBars.store(value, std::memory_order_relaxed);
        }
    }

    void setGraphEnabled(bool value) {
        if (mutableControlState_ != nullptr) {
            mutableControlState_->requestedGraphEnabled.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->graphEnabled.store(value, std::memory_order_relaxed);
        }
    }

    void setRecordMode(int value) {
        if (mutableControlState_ != nullptr) {
            mutableControlState_->recordMode.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->recordMode.store(value, std::memory_order_relaxed);
        }
    }

    void setActiveLayer(int value) {
        if (mutableControlState_ != nullptr) {
            mutableControlState_->activeLayer.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->activeLayer.store(value, std::memory_order_relaxed);
        }
    }

    void setMasterVolume(float value) {
        if (mutableControlState_ != nullptr) {
            mutableControlState_->masterVolume.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->masterVolume.store(value, std::memory_order_relaxed);
        }
    }

    void setInputVolume(float value) {
        if (mutableControlState_ != nullptr) {
            mutableControlState_->inputVolume.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->inputVolume.store(value, std::memory_order_relaxed);
        }
    }

    void setPassthroughEnabled(bool value) {
        if (mutableControlState_ != nullptr) {
            mutableControlState_->passthroughEnabled.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->passthroughEnabled.store(value, std::memory_order_relaxed);
        }
    }

    void setLayerSpeed(int index, float value) {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        if (mutableControlState_ != nullptr) {
            mutableControlState_->layers[index].speed.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->layers[index].speed.store(value, std::memory_order_relaxed);
        }
    }

    void setLayerReversed(int index, bool value) {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        if (mutableControlState_ != nullptr) {
            mutableControlState_->layers[index].reversed.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->layers[index].reversed.store(value, std::memory_order_relaxed);
        }
    }

    void setLayerVolume(int index, float value) {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        if (mutableControlState_ != nullptr) {
            mutableControlState_->layers[index].volume.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->layers[index].volume.store(value, std::memory_order_relaxed);
        }
    }

    void setLayerMuted(int index, bool value) {
        assert(index >= 0 && index < AtomicState::MAX_LAYERS);
        if (mutableControlState_ != nullptr) {
            mutableControlState_->layers[index].muted.store(value, std::memory_order_relaxed);
        }
        if (mutableLegacyState_ != nullptr) {
            mutableLegacyState_->layers[index].muted.store(value, std::memory_order_relaxed);
        }
    }

private:
    manifold::BehaviorControlState* mutableControlState_ = nullptr;
    AtomicState* mutableLegacyState_ = nullptr;
};

} // namespace control_state_view
} // namespace manifold
