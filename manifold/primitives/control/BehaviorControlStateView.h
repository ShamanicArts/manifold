#pragma once

#include "BehaviorControlState.h"

#include <cassert>

namespace manifold {
namespace control_state_view {

class BehaviorControlStateConstView {
public:
    explicit BehaviorControlStateConstView(const manifold::BehaviorControlState& state)
        : controlState_(&state) {}

    static constexpr int maxLayers() {
        return manifold::BehaviorControlState::MAX_LAYERS;
    }

    float tempo() const {
        return controlState_->requestedTempo.load(std::memory_order_relaxed);
    }

    float targetBpm() const {
        return controlState_->targetBPM.load(std::memory_order_relaxed);
    }

    bool isRecording() const {
        return controlState_->isRecording.load(std::memory_order_relaxed);
    }

    bool overdubEnabled() const {
        return controlState_->overdubEnabled.load(std::memory_order_relaxed);
    }

    bool forwardArmed() const {
        return controlState_->forwardArmed.load(std::memory_order_relaxed);
    }

    float forwardBars() const {
        return controlState_->forwardBars.load(std::memory_order_relaxed);
    }

    bool graphEnabled() const {
        return controlState_->requestedGraphEnabled.load(std::memory_order_relaxed);
    }

    int recordMode() const {
        return controlState_->recordMode.load(std::memory_order_relaxed);
    }

    int activeLayer() const {
        return controlState_->activeLayer.load(std::memory_order_relaxed);
    }

    float masterVolume() const {
        return controlState_->masterVolume.load(std::memory_order_relaxed);
    }

    float inputVolume() const {
        return controlState_->inputVolume.load(std::memory_order_relaxed);
    }

    bool passthroughEnabled() const {
        return controlState_->passthroughEnabled.load(std::memory_order_relaxed);
    }

    float layerSpeed(int index) const {
        assert(index >= 0 && index < manifold::BehaviorControlState::MAX_LAYERS);
        return controlState_->layers[index].speed.load(std::memory_order_relaxed);
    }

    bool layerReversed(int index) const {
        assert(index >= 0 && index < manifold::BehaviorControlState::MAX_LAYERS);
        return controlState_->layers[index].reversed.load(std::memory_order_relaxed);
    }

    float layerVolume(int index) const {
        assert(index >= 0 && index < manifold::BehaviorControlState::MAX_LAYERS);
        return controlState_->layers[index].volume.load(std::memory_order_relaxed);
    }

    bool layerMuted(int index) const {
        assert(index >= 0 && index < manifold::BehaviorControlState::MAX_LAYERS);
        return controlState_->layers[index].muted.load(std::memory_order_relaxed);
    }

protected:
    const manifold::BehaviorControlState* controlState_ = nullptr;
};

class BehaviorControlStateView : public BehaviorControlStateConstView {
public:
    explicit BehaviorControlStateView(manifold::BehaviorControlState& state)
        : BehaviorControlStateConstView(state),
          mutableControlState_(&state) {}

    void setTempo(float value) {
        mutableControlState_->requestedTempo.store(value, std::memory_order_relaxed);
    }

    void setTargetBpm(float value) {
        mutableControlState_->targetBPM.store(value, std::memory_order_relaxed);
    }

    void setIsRecording(bool value) {
        mutableControlState_->isRecording.store(value, std::memory_order_relaxed);
    }

    void setOverdubEnabled(bool value) {
        mutableControlState_->overdubEnabled.store(value, std::memory_order_relaxed);
    }

    void setForwardArmed(bool value) {
        mutableControlState_->forwardArmed.store(value, std::memory_order_relaxed);
    }

    void setForwardBars(float value) {
        mutableControlState_->forwardBars.store(value, std::memory_order_relaxed);
    }

    void setGraphEnabled(bool value) {
        mutableControlState_->requestedGraphEnabled.store(value, std::memory_order_relaxed);
    }

    void setRecordMode(int value) {
        mutableControlState_->recordMode.store(value, std::memory_order_relaxed);
    }

    void setActiveLayer(int value) {
        mutableControlState_->activeLayer.store(value, std::memory_order_relaxed);
    }

    void setMasterVolume(float value) {
        mutableControlState_->masterVolume.store(value, std::memory_order_relaxed);
    }

    void setInputVolume(float value) {
        mutableControlState_->inputVolume.store(value, std::memory_order_relaxed);
    }

    void setPassthroughEnabled(bool value) {
        mutableControlState_->passthroughEnabled.store(value, std::memory_order_relaxed);
    }

    void setLayerSpeed(int index, float value) {
        assert(index >= 0 && index < manifold::BehaviorControlState::MAX_LAYERS);
        mutableControlState_->layers[index].speed.store(value, std::memory_order_relaxed);
    }

    void setLayerReversed(int index, bool value) {
        assert(index >= 0 && index < manifold::BehaviorControlState::MAX_LAYERS);
        mutableControlState_->layers[index].reversed.store(value, std::memory_order_relaxed);
    }

    void setLayerVolume(int index, float value) {
        assert(index >= 0 && index < manifold::BehaviorControlState::MAX_LAYERS);
        mutableControlState_->layers[index].volume.store(value, std::memory_order_relaxed);
    }

    void setLayerMuted(int index, bool value) {
        assert(index >= 0 && index < manifold::BehaviorControlState::MAX_LAYERS);
        mutableControlState_->layers[index].muted.store(value, std::memory_order_relaxed);
    }

private:
    manifold::BehaviorControlState* mutableControlState_ = nullptr;
};

} // namespace control_state_view
} // namespace manifold
