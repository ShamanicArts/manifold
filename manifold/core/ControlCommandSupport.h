#pragma once

#include <string>

#include "../primitives/control/BehaviorControlStateView.h"
#include "../primitives/control/ControlServer.h"
#include "BehaviorCoreProcessor.h"

namespace manifold {
namespace control_command_support {

inline void applyControlCommand(BehaviorCoreProcessor& processor,
                                const ControlCommand& cmd) {
    static constexpr const char* kBehaviorBase = "/core/behavior";

    switch (cmd.type) {
        case ControlCommand::Type::SetTempo:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/tempo",
                                           cmd.floatParam);
            break;
        case ControlCommand::Type::SetTargetBPM:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/targetbpm",
                                           cmd.floatParam);
            break;
        case ControlCommand::Type::SetMasterVolume:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/volume",
                                           cmd.floatParam);
            break;
        case ControlCommand::Type::SetInputVolume:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/inputVolume",
                                           cmd.floatParam);
            break;
        case ControlCommand::Type::SetPassthroughEnabled:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/passthrough",
                                           cmd.floatParam);
            break;
        case ControlCommand::Type::SetActiveLayer:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/layer",
                                           static_cast<float>(cmd.intParam));
            break;
        case ControlCommand::Type::SetRecordMode:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/mode",
                                           static_cast<float>(cmd.intParam));
            break;
        case ControlCommand::Type::StartRecording:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/recording",
                                           1.0f);
            break;
        case ControlCommand::Type::StopRecording:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/recording",
                                           0.0f);
            break;
        case ControlCommand::Type::ToggleOverdub: {
            auto& controlServer = processor.getControlServer();
            const auto controlState =
                manifold::control_state_view::BehaviorControlStateConstView(
                    controlServer.getBehaviorControlState());
            (void)processor.setParamByPath(
                std::string(kBehaviorBase) + "/overdub",
                controlState.overdubEnabled() ? 0.0f : 1.0f);
            break;
        }
        case ControlCommand::Type::SetOverdubEnabled:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/overdub",
                                           cmd.floatParam);
            break;
        case ControlCommand::Type::Commit:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/commit",
                                           cmd.floatParam);
            break;
        case ControlCommand::Type::ForwardCommit:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/forward",
                                           cmd.floatParam);
            break;
        case ControlCommand::Type::GlobalStop:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/transport",
                                           0.0f);
            break;
        case ControlCommand::Type::GlobalPlay:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/transport",
                                           1.0f);
            break;
        case ControlCommand::Type::GlobalPause:
            (void)processor.setParamByPath(std::string(kBehaviorBase) + "/transport",
                                           2.0f);
            break;
        case ControlCommand::Type::LayerVolume:
            (void)processor.setParamByPath(
                std::string(kBehaviorBase) + "/layer/" + std::to_string(cmd.intParam) +
                    "/volume",
                cmd.floatParam);
            break;
        case ControlCommand::Type::LayerSpeed:
            (void)processor.setParamByPath(
                std::string(kBehaviorBase) + "/layer/" + std::to_string(cmd.intParam) +
                    "/speed",
                cmd.floatParam);
            break;
        case ControlCommand::Type::LayerReverse:
            (void)processor.setParamByPath(
                std::string(kBehaviorBase) + "/layer/" + std::to_string(cmd.intParam) +
                    "/reverse",
                cmd.floatParam);
            break;
        case ControlCommand::Type::LayerMute:
            (void)processor.setParamByPath(
                std::string(kBehaviorBase) + "/layer/" + std::to_string(cmd.intParam) +
                    "/mute",
                cmd.floatParam);
            break;
        case ControlCommand::Type::LayerPlay:
            (void)processor.setParamByPath(
                std::string(kBehaviorBase) + "/layer/" + std::to_string(cmd.intParam) +
                    "/play",
                1.0f);
            break;
        case ControlCommand::Type::LayerPause:
            (void)processor.setParamByPath(
                std::string(kBehaviorBase) + "/layer/" + std::to_string(cmd.intParam) +
                    "/pause",
                1.0f);
            break;
        case ControlCommand::Type::LayerStop:
            (void)processor.setParamByPath(
                std::string(kBehaviorBase) + "/layer/" + std::to_string(cmd.intParam) +
                    "/stop",
                1.0f);
            break;
        case ControlCommand::Type::LayerClear:
            (void)processor.setParamByPath(
                std::string(kBehaviorBase) + "/layer/" + std::to_string(cmd.intParam) +
                    "/clear",
                1.0f);
            break;
        case ControlCommand::Type::LayerSeek:
            (void)processor.setParamByPath(
                std::string(kBehaviorBase) + "/layer/" + std::to_string(cmd.intParam) +
                    "/seek",
                cmd.floatParam);
            break;
        case ControlCommand::Type::ClearAllLayers:
            for (int i = 0; i < BehaviorCoreProcessor::MAX_LAYERS; ++i) {
                (void)processor.setParamByPath(std::string(kBehaviorBase) + "/layer/" +
                                                   std::to_string(i) + "/clear",
                                               1.0f);
            }
            break;
        case ControlCommand::Type::UISwitch:
        case ControlCommand::Type::None:
            break;
    }
}

inline void processControlCommands(BehaviorCoreProcessor& processor,
                                   ControlServer& controlServer) {
    ControlCommand cmd;
    auto& queue = controlServer.getCommandQueue();
    while (queue.dequeue(cmd)) {
        applyControlCommand(processor, cmd);
    }
}

} // namespace control_command_support
} // namespace manifold
