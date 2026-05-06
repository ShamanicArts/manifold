#pragma once

#include "BehaviorControlState.h"
#include "BehaviorRuntimeTelemetry.h"
#include "BehaviorStateSnapshot.h"

#include <string>

namespace manifold {
namespace behavior_state_projection {

const char* layerStateToString(int state);
const char* recordModeToString(int mode);
std::string buildStateJson(const BehaviorControlState& controlState,
                           const BehaviorRuntimeTelemetry& runtimeTelemetry,
                           const std::string& uiRendererMode);
std::string buildStateJson(
    const state_snapshot::BehaviorControlStateSnapshot& controlState,
    const state_snapshot::BehaviorRuntimeTelemetrySnapshot& runtimeTelemetry,
    const std::string& uiRendererMode);

} // namespace behavior_state_projection
} // namespace manifold
