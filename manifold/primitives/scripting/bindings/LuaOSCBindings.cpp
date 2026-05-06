#include "LuaOSCBindings.h"

#include "../ILuaControlState.h"
#include "../ScriptableProcessor.h"
#include "../../control/OSCEndpointRegistry.h"
#include "../../control/OSCServer.h"
#include "../../control/OSCPacketBuilder.h"
#include "../../control/OSCSettingsPersistence.h"
#include "../../control/OSCQuery.h"

#include <juce_core/juce_core.h>

#include <mutex>
#include <vector>

namespace lua_bindings {

void registerOSCBindings(sol::state& lua,
                         ILuaControlState& state) {
    auto oscTable = lua.create_table();

    oscTable["getSettings"] = [&state, &lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor) return result;

        auto& oscServer = processor->getOSCServer();
        auto settings = oscServer.getSettings();

        result["inputPort"] = settings.inputPort;
        result["queryPort"] = settings.queryPort;
        result["oscEnabled"] = settings.oscEnabled;
        result["oscQueryEnabled"] = settings.oscQueryEnabled;

        auto targetsTbl = sol::table(lua, sol::create);
        for (int i = 0; i < settings.outTargets.size(); ++i) {
            targetsTbl[i + 1] = settings.outTargets[i].toStdString();
        }
        result["outTargets"] = targetsTbl;

        return result;
    };

    oscTable["setSettings"] = [&state](sol::table settingsTable) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;

        OSCSettings settings;

        if (settingsTable["inputPort"].valid()) {
            settings.inputPort = settingsTable["inputPort"].get<int>();
        }
        if (settingsTable["queryPort"].valid()) {
            settings.queryPort = settingsTable["queryPort"].get<int>();
        }
        if (settingsTable["oscEnabled"].valid()) {
            settings.oscEnabled = settingsTable["oscEnabled"].get<bool>();
        }
        if (settingsTable["oscQueryEnabled"].valid()) {
            settings.oscQueryEnabled = settingsTable["oscQueryEnabled"].get<bool>();
        }
        if (settingsTable["outTargets"].valid()) {
            sol::table targetsTable = settingsTable["outTargets"];
            for (int i = 1; ; ++i) {
                auto val = targetsTable.get<sol::optional<std::string>>(i);
                if (!val.has_value()) break;
                settings.outTargets.add(juce::String(val.value()));
            }
        }

        if (!OSCSettingsPersistence::save(settings)) return false;
        processor->getOSCServer().setSettings(settings);
        processor->getOSCQueryServer().stop();
        processor->getOSCQueryServer().setContext(processor, &processor->getEndpointRegistry());
        if (settings.oscQueryEnabled) {
            processor->getOSCQueryServer().start(processor, &processor->getEndpointRegistry(),
                                                 settings.queryPort, settings.inputPort);
        }
        return true;
    };

    oscTable["getStatus"] = [&state]() -> std::string {
        auto* processor = state.getProcessor();
        if (!processor) return "no processor";
        auto& oscServer = processor->getOSCServer();
        if (!oscServer.isRunning()) return "stopped";
        return "running";
    };

    oscTable["addTarget"] = [&state](const std::string& ipPort) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        processor->getOSCServer().addOutTarget(juce::String(ipPort));
        auto settings = processor->getOSCServer().getSettings();
        OSCSettingsPersistence::save(settings);
        return true;
    };

    oscTable["removeTarget"] = [&state](const std::string& ipPort) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        processor->getOSCServer().removeOutTarget(juce::String(ipPort));
        auto settings = processor->getOSCServer().getSettings();
        OSCSettingsPersistence::save(settings);
        return true;
    };

    oscTable["send"] = [&state](const std::string& address,
                                sol::variadic_args args) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;

        std::vector<juce::var> vars;
        for (auto arg : args) {
            if (arg.is<int>()) vars.push_back(arg.as<int>());
            else if (arg.is<float>()) vars.push_back(arg.as<float>());
            else if (arg.is<double>()) vars.push_back(static_cast<float>(arg.as<double>()));
            else if (arg.is<std::string>()) vars.push_back(juce::String(arg.as<std::string>()));
            else if (arg.is<bool>()) vars.push_back(arg.as<bool>() ? 1 : 0);
        }

        juce::String path(address.c_str());
        processor->getOSCServer().broadcast(path, vars);

        if (!path.startsWith("/core/behavior/") && path.startsWithChar('/')) {
            processor->getOSCServer().setCustomValue(path, vars);
            state.getUiRegisteredOscValues().insert(path.toStdString());
        }
        return true;
    };

    oscTable["sendTo"] = [&state](const std::string& ip, int port,
                                  const std::string& address,
                                  sol::variadic_args args) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;

        std::vector<juce::var> vars;
        for (auto arg : args) {
            if (arg.is<int>()) vars.push_back(arg.as<int>());
            else if (arg.is<float>()) vars.push_back(arg.as<float>());
            else if (arg.is<double>()) vars.push_back(static_cast<float>(arg.as<double>()));
            else if (arg.is<std::string>()) vars.push_back(juce::String(arg.as<std::string>()));
            else if (arg.is<bool>()) vars.push_back(arg.as<bool>() ? 1 : 0);
        }

        juce::String path(address.c_str());
        auto packet = OSCPacketBuilder::build(path, vars);
        juce::DatagramSocket socket;
        socket.bindToPort(0);
        socket.write(juce::String(ip.c_str()), port, packet.data(),
                     static_cast<int>(packet.size()));

        if (!path.startsWith("/core/behavior/") && path.startsWithChar('/')) {
            processor->getOSCServer().setCustomValue(path, vars);
            state.getUiRegisteredOscValues().insert(path.toStdString());
        }
        return true;
    };

    oscTable["onMessage"] = [&state](const std::string& address,
                                     sol::function callback,
                                     sol::optional<bool> persistent) -> bool {
        if (!callback.valid()) return false;

        std::lock_guard<std::mutex> cbLock(state.getOscCallbacksMutex());
        ILuaControlState::OSCCallback cb;
        cb.func = callback;
        cb.persistent = persistent.value_or(false);
        cb.address = juce::String(address.c_str());
        state.getOscCallbacks()[juce::String(address.c_str())].push_back(std::move(cb));
        return true;
    };

    oscTable["removeHandler"] = [&state](const std::string& address) -> bool {
        std::lock_guard<std::mutex> lock(state.getOscCallbacksMutex());
        auto it = state.getOscCallbacks().find(juce::String(address.c_str()));
        if (it != state.getOscCallbacks().end()) {
            state.getOscCallbacks().erase(it);
            return true;
        }
        return false;
    };

    oscTable["registerEndpoint"] = [&state](const std::string& path,
                                             sol::table options) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;

        OSCEndpoint endpoint;
        endpoint.path = juce::String(path.c_str());
        endpoint.category = "custom";

        if (options["type"].valid()) {
            endpoint.type = juce::String(options["type"].get<std::string>().c_str());
        } else {
            endpoint.type = "f";
        }

        if (options["range"].valid()) {
            sol::table range = options["range"];
            auto minVal = range[1];
            auto maxVal = range[2];
            endpoint.rangeMin = minVal.valid() ? minVal.get<float>() : 0.0f;
            endpoint.rangeMax = maxVal.valid() ? maxVal.get<float>() : 1.0f;
        }

        if (options["access"].valid()) {
            endpoint.access = options["access"].get<int>();
        } else {
            endpoint.access = 3;
        }

        if (options["description"].valid()) {
            endpoint.description = juce::String(options["description"].get<std::string>().c_str());
        }

        processor->getEndpointRegistry().registerCustomEndpoint(endpoint);
        state.getUiRegisteredOscEndpoints().insert(endpoint.path.toStdString());
        processor->getOSCQueryServer().rebuildTree();
        return true;
    };

    oscTable["removeEndpoint"] = [&state](const std::string& path) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;

        const juce::String endpointPath(path.c_str());
        processor->getEndpointRegistry().unregisterCustomEndpoint(endpointPath);
        processor->getOSCServer().removeCustomValue(endpointPath);
        state.getUiRegisteredOscEndpoints().erase(endpointPath.toStdString());
        state.getUiRegisteredOscValues().erase(endpointPath.toStdString());
        processor->getOSCQueryServer().rebuildTree();
        return true;
    };

    oscTable["setValue"] = [&state](const std::string& path,
                                    sol::object value) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;

        std::vector<juce::var> args;
        if (value.is<float>()) args.emplace_back(value.as<float>());
        else if (value.is<int>()) args.emplace_back(value.as<int>());
        else if (value.is<double>()) args.emplace_back((float)value.as<double>());
        else if (value.is<std::string>()) args.emplace_back(juce::String(value.as<std::string>().c_str()));
        else if (value.is<bool>()) args.emplace_back(value.as<bool>() ? 1 : 0);
        else if (value.get_type() == sol::type::table) {
            sol::table tbl = value;
            for (int i = 1;; ++i) {
                sol::object item = tbl[i];
                if (!item.valid() || item.get_type() == sol::type::nil) break;
                if (item.is<int>()) args.emplace_back(item.as<int>());
                else if (item.is<float>()) args.emplace_back(item.as<float>());
                else if (item.is<double>()) args.emplace_back((float)item.as<double>());
                else if (item.is<std::string>()) args.emplace_back(juce::String(item.as<std::string>().c_str()));
                else if (item.is<bool>()) args.emplace_back(item.as<bool>() ? 1 : 0);
            }
        } else {
            return false;
        }

        const juce::String valuePath(path.c_str());
        processor->getOSCServer().setCustomValue(valuePath, args);
        state.getUiRegisteredOscValues().insert(valuePath.toStdString());
        return true;
    };

    oscTable["getValue"] = [&state, &lua](const std::string& path) -> sol::object {
        auto* processor = state.getProcessor();
        if (!processor) return sol::nil;

        std::vector<juce::var> vals;
        if (!processor->getOSCServer().getCustomValue(juce::String(path.c_str()), vals) || vals.empty()) {
            return sol::nil;
        }

        if (vals.size() == 1) {
            const auto& val = vals[0];
            if (val.isInt()) return sol::make_object(lua, (int)val);
            else if (val.isDouble()) return sol::make_object(lua, (double)val);
            else if (val.isString()) return sol::make_object(lua, val.toString().toStdString());
            else if (val.isBool()) return sol::make_object(lua, (bool)val);
            return sol::nil;
        }

        auto t = sol::table(lua, sol::create);
        for (size_t i = 0; i < vals.size(); ++i) {
            const auto& val = vals[i];
            if (val.isInt()) t[i + 1] = (int)val;
            else if (val.isDouble()) t[i + 1] = (double)val;
            else if (val.isString()) t[i + 1] = val.toString().toStdString();
            else if (val.isBool()) t[i + 1] = (bool)val;
            else t[i + 1] = sol::nil;
        }
        return sol::make_object(lua, t);
    };

    oscTable["onQuery"] = [&state](const std::string& path,
                                   sol::function callback,
                                   sol::optional<bool> persistent) -> bool {
        if (!callback.valid()) return false;

        std::lock_guard<std::mutex> lock(state.getOscQueryHandlersMutex());
        ILuaControlState::OSCQueryHandler handler;
        handler.func = callback;
        handler.persistent = persistent.value_or(false);
        state.getOscQueryHandlers()[juce::String(path.c_str())] = std::move(handler);
        return true;
    };

    lua["osc"] = oscTable;
}

} // namespace lua_bindings
