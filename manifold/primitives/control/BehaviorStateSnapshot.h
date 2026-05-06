#pragma once

#include "BehaviorControlStateView.h"
#include "BehaviorRuntimeTelemetryView.h"

namespace manifold {
namespace state_snapshot {

struct BehaviorControlLayerStateSnapshot {
    float speed = 1.0f;
    bool reversed = false;
    float volume = 1.0f;
    bool muted = false;
};

struct BehaviorControlStateSnapshot {
    static constexpr int MAX_LAYERS = scripting::LayerConfig::MAX_LAYERS;

    float requestedTempo = 120.0f;
    float targetBPM = 120.0f;
    bool isRecording = false;
    bool overdubEnabled = false;
    bool forwardArmed = false;
    float forwardBars = 0.0f;
    bool requestedGraphEnabled = false;
    int recordMode = 0;
    int activeLayer = 0;
    float masterVolume = 1.0f;
    float inputVolume = 1.0f;
    bool passthroughEnabled = true;

    BehaviorControlLayerStateSnapshot layers[MAX_LAYERS];
};

struct BehaviorRuntimeLayerTelemetrySnapshot {
    int state = 0;
    int length = 0;
    int playheadPos = 0;
    float numBars = 0.0f;
};

struct BehaviorRuntimeTelemetrySnapshot {
    static constexpr int MAX_LAYERS = scripting::LayerConfig::MAX_LAYERS;

    float effectiveTempo = 120.0f;
    float samplesPerBar = 0.0f;
    double sampleRate = 44100.0;
    int captureSize = 0;
    int captureWritePos = 0;
    float captureLevel = 0.0f;
    bool effectiveGraphEnabled = false;
    double playTime = 0.0;
    int commitCount = 0;
    double uptimeSeconds = 0.0;

    BehaviorRuntimeLayerTelemetrySnapshot layers[MAX_LAYERS];
};

inline BehaviorControlStateSnapshot captureBehaviorControlState(
    const manifold::control_state_view::BehaviorControlStateConstView& controlState) {
    BehaviorControlStateSnapshot snapshot;
    snapshot.requestedTempo = controlState.tempo();
    snapshot.targetBPM = controlState.targetBpm();
    snapshot.isRecording = controlState.isRecording();
    snapshot.overdubEnabled = controlState.overdubEnabled();
    snapshot.forwardArmed = controlState.forwardArmed();
    snapshot.forwardBars = controlState.forwardBars();
    snapshot.requestedGraphEnabled = controlState.graphEnabled();
    snapshot.recordMode = controlState.recordMode();
    snapshot.activeLayer = controlState.activeLayer();
    snapshot.masterVolume = controlState.masterVolume();
    snapshot.inputVolume = controlState.inputVolume();
    snapshot.passthroughEnabled = controlState.passthroughEnabled();

    for (int i = 0; i < BehaviorControlStateSnapshot::MAX_LAYERS; ++i) {
        snapshot.layers[i].speed = controlState.layerSpeed(i);
        snapshot.layers[i].reversed = controlState.layerReversed(i);
        snapshot.layers[i].volume = controlState.layerVolume(i);
        snapshot.layers[i].muted = controlState.layerMuted(i);
    }

    return snapshot;
}

inline BehaviorControlStateSnapshot captureBehaviorControlState(
    const manifold::BehaviorControlState& controlState,
    const AtomicState* legacyMirror = nullptr) {
    return captureBehaviorControlState(
        manifold::control_state_view::BehaviorControlStateConstView(controlState,
                                                                    legacyMirror));
}

inline BehaviorRuntimeTelemetrySnapshot captureBehaviorRuntimeTelemetry(
    const manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryConstView& runtimeTelemetry) {
    BehaviorRuntimeTelemetrySnapshot snapshot;
    snapshot.effectiveTempo = runtimeTelemetry.tempo();
    snapshot.samplesPerBar = runtimeTelemetry.samplesPerBar();
    snapshot.sampleRate = runtimeTelemetry.sampleRate();
    snapshot.captureSize = runtimeTelemetry.captureSize();
    snapshot.captureWritePos = runtimeTelemetry.captureWritePos();
    snapshot.captureLevel = runtimeTelemetry.captureLevel();
    snapshot.effectiveGraphEnabled = runtimeTelemetry.graphEnabled();
    snapshot.playTime = runtimeTelemetry.playTime();
    snapshot.commitCount = runtimeTelemetry.commitCount();
    snapshot.uptimeSeconds = runtimeTelemetry.uptimeSeconds();

    for (int i = 0; i < BehaviorRuntimeTelemetrySnapshot::MAX_LAYERS; ++i) {
        snapshot.layers[i].state = runtimeTelemetry.layerState(i);
        snapshot.layers[i].length = runtimeTelemetry.layerLength(i);
        snapshot.layers[i].playheadPos = runtimeTelemetry.layerPlayheadPos(i);
        snapshot.layers[i].numBars = runtimeTelemetry.layerNumBars(i);
    }

    return snapshot;
}

inline BehaviorRuntimeTelemetrySnapshot captureBehaviorRuntimeTelemetry(
    const manifold::BehaviorRuntimeTelemetry& runtimeTelemetry,
    const AtomicState* legacyMirror = nullptr) {
    return captureBehaviorRuntimeTelemetry(
        manifold::runtime_telemetry_view::BehaviorRuntimeTelemetryConstView(runtimeTelemetry,
                                                                            legacyMirror));
}

} // namespace state_snapshot
} // namespace manifold
