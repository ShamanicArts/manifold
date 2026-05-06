#pragma once

#include "../scripting/ScriptingConfig.h"

#include <atomic>

namespace manifold {

struct BehaviorControlLayerState {
    std::atomic<float> speed{1.0f};
    std::atomic<bool> reversed{false};
    std::atomic<float> volume{1.0f};
    std::atomic<bool> muted{false};
};

struct BehaviorControlState {
    static constexpr int MAX_LAYERS = scripting::LayerConfig::MAX_LAYERS;

    std::atomic<float> requestedTempo{120.0f};
    std::atomic<float> targetBPM{120.0f};
    std::atomic<bool> isRecording{false};
    std::atomic<bool> overdubEnabled{false};
    std::atomic<bool> forwardArmed{false};
    std::atomic<float> forwardBars{0.0f};
    std::atomic<bool> requestedGraphEnabled{false};
    std::atomic<int> recordMode{0};
    std::atomic<int> activeLayer{0};
    std::atomic<float> masterVolume{1.0f};
    std::atomic<float> inputVolume{1.0f};
    std::atomic<bool> passthroughEnabled{true};

    BehaviorControlLayerState layers[MAX_LAYERS];
};

} // namespace manifold
