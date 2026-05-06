#pragma once

#include "../scripting/ScriptingConfig.h"

#include <atomic>

namespace manifold {

struct BehaviorRuntimeLayerTelemetry {
    std::atomic<int> state{0};
    std::atomic<int> length{0};
    std::atomic<int> playheadPos{0};
    std::atomic<float> numBars{0.0f};
};

struct BehaviorRuntimeTelemetry {
    static constexpr int MAX_LAYERS = scripting::LayerConfig::MAX_LAYERS;

    std::atomic<float> effectiveTempo{120.0f};
    std::atomic<float> samplesPerBar{0.0f};
    std::atomic<double> sampleRate{44100.0};
    std::atomic<int> captureSize{0};
    std::atomic<int> captureWritePos{0};
    std::atomic<float> captureLevel{0.0f};
    std::atomic<bool> effectiveGraphEnabled{false};
    std::atomic<double> playTime{0.0};
    std::atomic<int> commitCount{0};
    std::atomic<double> uptimeSeconds{0.0};

    BehaviorRuntimeLayerTelemetry layers[MAX_LAYERS];
};

} // namespace manifold
