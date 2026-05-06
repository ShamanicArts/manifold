#include "LuaCommandBindings.h"

#include "../ILuaControlState.h"
#include "../ScriptableProcessor.h"
#include "../../control/CommandParser.h"

#include <juce_core/juce_core.h>

#include <atomic>
#include <cstdio>
#include <string>

namespace lua_bindings {

void registerCommandBindings(sol::state& lua,
                             ILuaControlState& state) {
    // ---- command() ----
    lua["command"] = [&state](sol::variadic_args va) {
        auto* processor = state.getProcessor();
        if (!processor || va.size() == 0) return;

        std::string cmdStr;
        bool firstArg = true;
        for (sol::object arg : va) {
            if (!firstArg) cmdStr += " ";
            firstArg = false;
            if (arg.get_type() == sol::type::number) {
                cmdStr += std::to_string(arg.as<float>());
            } else {
                cmdStr += arg.as<std::string>();
            }
        }

        auto result = CommandParser::parse(
            cmdStr,
            processor ? &processor->getEndpointRegistry() : nullptr);

        if (result.usedLegacySyntax) {
            static std::atomic<int> legacySyntaxWarnings{0};
            const int count =
                legacySyntaxWarnings.fetch_add(1, std::memory_order_relaxed) + 1;
            if (count <= 5 || (count % 100) == 0) {
                fprintf(stderr,
                        "[LuaControl] deprecated legacy command syntax '%s' used "
                        "(count=%d). Prefer canonical SET/GET/TRIGGER paths.\n",
                        result.legacyVerb.c_str(), count);
            }
        }

        if (!result.warningCode.empty()) {
            static std::atomic<int> parserWarnings{0};
            const int count = parserWarnings.fetch_add(1, std::memory_order_relaxed) + 1;
            if (count <= 5 || (count % 100) == 0) {
                fprintf(stderr, "[LuaControl] %s: %s (count=%d)\n",
                        result.warningCode.c_str(), result.warningMessage.c_str(), count);
            }
        }

        switch (result.kind) {
        case ParseResult::Kind::Enqueue:
            processor->postControlCommandPayload(result.command);
            break;
        case ParseResult::Kind::RecordStart: {
            auto& controlServer = processor->getControlServer();
            auto response = controlServer.startRecording(
                result.recordFormat, result.recordDuration, result.capturePath);
            juce::ignoreUnused(response);
            break;
        }
        case ParseResult::Kind::RecordStop: {
            auto& controlServer = processor->getControlServer();
            auto response = controlServer.stopRecording();
            juce::ignoreUnused(response);
            break;
        }
        case ParseResult::Kind::Query:
        case ParseResult::Kind::Watch:
        case ParseResult::Kind::Inject:
        case ParseResult::Kind::InjectionStatus:
        case ParseResult::Kind::UISwitch:
        case ParseResult::Kind::UIRenderer:
        case ParseResult::Kind::NoOpWarning:
            break;
        case ParseResult::Kind::Error:
            fprintf(stderr, "[LuaControl] command error: %s (input: %s)\n",
                    result.errorMessage.c_str(), cmdStr.c_str());
            break;
        }
    };

    lua["setParam"] = [&state](const std::string& path, float value) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->setParamByPath(path, value);
    };

    lua["getParam"] = [&state](const std::string& path) -> float {
        auto* processor = state.getProcessor();
        if (!processor) return 0.0f;
        return processor->getParamByPath(path);
    };

    lua["hasEndpoint"] = [&state](const std::string& path) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->hasEndpoint(path);
    };

    lua["listEndpoints"] = [&state, &lua](sol::optional<std::string> prefixOpt,
                                            sol::optional<bool> writableOnlyOpt,
                                            sol::optional<bool> numericOnlyOpt) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor) return result;

        const std::string prefix = prefixOpt.value_or(std::string());
        const bool writableOnly = writableOnlyOpt.value_or(false);
        const bool numericOnly = numericOnlyOpt.value_or(false);

        const auto endpoints = processor->getEndpointRegistry().getAllEndpoints();
        int outIndex = 1;
        for (const auto& endpoint : endpoints) {
            const std::string path = endpoint.path.toStdString();
            if (!prefix.empty() && path.rfind(prefix, 0) != 0) {
                continue;
            }
            if (writableOnly && endpoint.access < 2) {
                continue;
            }
            if (numericOnly) {
                const std::string type = endpoint.type.toStdString();
                const bool numeric = type.find('f') != std::string::npos ||
                                     type.find('i') != std::string::npos ||
                                     type.find('d') != std::string::npos;
                if (!numeric) {
                    continue;
                }
            }

            auto item = sol::table(lua, sol::create);
            item["path"] = path;
            item["type"] = endpoint.type.toStdString();
            item["rangeMin"] = endpoint.rangeMin;
            item["rangeMax"] = endpoint.rangeMax;
            item["access"] = endpoint.access;
            item["description"] = endpoint.description.toStdString();
            item["category"] = endpoint.category.toStdString();
            result[outIndex++] = item;
        }
        return result;
    };

    lua["seekLayer"] = [&state](int layerIdx, float normalizedPos) {
        auto* processor = state.getProcessor();
        if (!processor) return;
        if (layerIdx < 0 || layerIdx >= 4) return;
        ControlCommand cmd;
        cmd.operation = ControlOperation::Legacy;
        cmd.type = ControlCommand::Type::LayerSeek;
        cmd.intParam = layerIdx;
        cmd.floatParam = normalizedPos;
        processor->postControlCommandPayload(cmd);
    };
}

} // namespace lua_bindings
