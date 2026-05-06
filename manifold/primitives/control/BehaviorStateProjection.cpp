#include "BehaviorStateProjection.h"

#include "BehaviorStateSnapshot.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <limits>
#include <sstream>
#include <string>

namespace {

std::string jsonStr(const std::string& key, const std::string& val) {
    return "\"" + key + "\":\"" + val + "\"";
}

std::string jsonNum(const std::string& key, double val) {
    char buf[64];
    const double rounded = std::round(val);
    const bool fitsIntRange = rounded >= static_cast<double>(std::numeric_limits<int>::min()) &&
                              rounded <= static_cast<double>(std::numeric_limits<int>::max());
    const bool isIntegral =
        std::isfinite(val) && fitsIntRange && std::abs(val - rounded) < 1.0e-9;
    if (isIntegral) {
        std::snprintf(buf, sizeof(buf), "\"%s\":%d", key.c_str(),
                      static_cast<int>(rounded));
    } else {
        std::snprintf(buf, sizeof(buf), "\"%s\":%.6g", key.c_str(), val);
    }
    return buf;
}

std::string jsonBool(const std::string& key, bool val) {
    return "\"" + key + "\":" + (val ? "true" : "false");
}

} // namespace

namespace manifold {
namespace behavior_state_projection {

const char* layerStateToString(int state) {
    switch (state) {
        case 0: return "empty";
        case 1: return "playing";
        case 2: return "recording";
        case 3: return "overdubbing";
        case 4: return "muted";
        case 5: return "stopped";
        case 6: return "paused";
        default: return "unknown";
    }
}

const char* recordModeToString(int mode) {
    switch (mode) {
        case 0: return "firstLoop";
        case 1: return "freeMode";
        case 2: return "traditional";
        case 3: return "retrospective";
        default: return "unknown";
    }
}

std::string buildStateJson(const BehaviorControlState& controlStateStorage,
                           const BehaviorRuntimeTelemetry& runtimeTelemetryStorage,
                           const std::string& uiRendererMode) {
    return buildStateJson(
        manifold::state_snapshot::captureBehaviorControlState(controlStateStorage),
        manifold::state_snapshot::captureBehaviorRuntimeTelemetry(runtimeTelemetryStorage),
        uiRendererMode);
}

std::string buildStateJson(
    const state_snapshot::BehaviorControlStateSnapshot& controlState,
    const state_snapshot::BehaviorRuntimeTelemetrySnapshot& runtimeTelemetry,
    const std::string& uiRendererMode) {
    static constexpr const char* kBehaviorBase = "/core/behavior";

    std::ostringstream o;
    o << "{";
    o << jsonNum("projectionVersion", 2) << ",";
    o << jsonNum("numVoices", state_snapshot::BehaviorControlStateSnapshot::MAX_LAYERS)
      << ",";
    o << jsonNum("captureWritePos", runtimeTelemetry.captureWritePos) << ",";
    o << jsonNum("captureLevel", runtimeTelemetry.captureLevel) << ",";
    o << jsonNum("playTime", runtimeTelemetry.playTime) << ",";
    o << jsonNum("commitCount", runtimeTelemetry.commitCount) << ",";
    o << jsonNum("uptimeSeconds", runtimeTelemetry.uptimeSeconds) << ",";
    o << jsonStr("uiRendererMode", uiRendererMode) << ",";

    o << "\"params\":{";
    o << jsonNum(std::string(kBehaviorBase) + "/tempo", runtimeTelemetry.effectiveTempo)
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/targetbpm", controlState.targetBPM)
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/samplesPerBar",
                 runtimeTelemetry.samplesPerBar)
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/sampleRate", runtimeTelemetry.sampleRate)
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/captureSize", runtimeTelemetry.captureSize)
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/recording",
                 controlState.isRecording ? 1 : 0)
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/overdub",
                 controlState.overdubEnabled ? 1 : 0)
      << ",";
    o << jsonStr(std::string(kBehaviorBase) + "/mode",
                 recordModeToString(controlState.recordMode))
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/layer", controlState.activeLayer)
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/volume", controlState.masterVolume)
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/inputVolume", controlState.inputVolume)
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/passthrough",
                 controlState.passthroughEnabled ? 1 : 0)
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/forwardArmed",
                 controlState.forwardArmed ? 1 : 0)
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/forwardBars", controlState.forwardBars)
      << ",";
    o << jsonNum(std::string(kBehaviorBase) + "/graph/enabled",
                 runtimeTelemetry.effectiveGraphEnabled ? 1 : 0);

    for (int i = 0; i < state_snapshot::BehaviorControlStateSnapshot::MAX_LAYERS; ++i) {
        const std::string prefix =
            std::string(kBehaviorBase) + "/layer/" + std::to_string(i);
        const int stateValue = runtimeTelemetry.layers[i].state;
        const bool muted = stateValue == 4;
        const int length = runtimeTelemetry.layers[i].length;
        const int position = runtimeTelemetry.layers[i].playheadPos;
        const float positionNorm =
            (length > 0)
                ? static_cast<float>(position) / static_cast<float>(length)
                : 0.0f;

        o << "," << jsonNum(prefix + "/speed", controlState.layers[i].speed);
        o << "," << jsonNum(prefix + "/volume", controlState.layers[i].volume);
        o << "," << jsonNum(prefix + "/mute", muted ? 1 : 0);
        o << "," << jsonBool(prefix + "/reverse", controlState.layers[i].reversed);
        o << "," << jsonNum(prefix + "/length", length);
        o << "," << jsonNum(prefix + "/position", positionNorm);
        o << "," << jsonNum(prefix + "/bars", runtimeTelemetry.layers[i].numBars);
        o << "," << jsonStr(prefix + "/state", layerStateToString(stateValue));
    }
    o << "},";

    o << "\"voices\":[";
    for (int i = 0; i < state_snapshot::BehaviorControlStateSnapshot::MAX_LAYERS; ++i) {
        if (i > 0) {
            o << ",";
        }

        const int length = runtimeTelemetry.layers[i].length;
        const int position = runtimeTelemetry.layers[i].playheadPos;
        const int stateValue = runtimeTelemetry.layers[i].state;
        const bool muted = stateValue == 4;
        const float positionNorm =
            (length > 0)
                ? static_cast<float>(position) / static_cast<float>(length)
                : 0.0f;
        const float bars = runtimeTelemetry.layers[i].numBars;

        o << "{";
        o << jsonNum("id", i) << ",";
        o << jsonStr("path",
                     std::string(kBehaviorBase) + "/layer/" + std::to_string(i))
          << ",";
        o << jsonStr("state", layerStateToString(stateValue)) << ",";
        o << jsonNum("length", length) << ",";
        o << jsonNum("position", position) << ",";
        o << jsonNum("positionNorm", positionNorm) << ",";
        o << jsonNum("speed", controlState.layers[i].speed) << ",";
        o << jsonBool("reversed", controlState.layers[i].reversed) << ",";
        o << jsonNum("volume", controlState.layers[i].volume) << ",";
        o << jsonNum("bars", bars) << ",";
        o << "\"params\":{";
        o << jsonNum("speed", controlState.layers[i].speed) << ",";
        o << jsonNum("volume", controlState.layers[i].volume) << ",";
        o << jsonNum("mute", muted ? 1 : 0) << ",";
        o << jsonNum("reverse", controlState.layers[i].reversed ? 1 : 0) << ",";
        o << jsonNum("length", length) << ",";
        o << jsonNum("position", positionNorm) << ",";
        o << jsonNum("bars", bars) << ",";
        o << jsonStr("state", layerStateToString(stateValue));
        o << "}";
        o << "}";
    }
    o << "]}";
    return o.str();
}

} // namespace behavior_state_projection
} // namespace manifold
