#pragma once

#include <atomic>
#include <cmath>
#include <functional>
#include <memory>
#include <optional>
#include <string_view>
#include <vector>

#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_core/juce_core.h>

namespace manifold::export_plugin {

struct ExportParamAlias {
    juce::String path;
    juce::String internalPath;
    juce::String type{"f"};
    float rangeMin = 0.0f;
    float rangeMax = 1.0f;
    juce::String description;
    float defaultValue = 0.0f;
    float skew = 1.0f;
    juce::String hostParamId;
    juce::String hostParamName;
    juce::String hostParamKind{"float"};
    juce::StringArray choices;
    std::atomic<float>* rawHostValue = nullptr;
};

struct ExportPluginConfig {
    bool enabled = false;
    juce::String headerTitle{"Plugin"};
    int compactWidth = 236;
    int compactHeight = 220;
    int splitWidth = 472;
    int splitHeight = 220;
    int defaultViewMode = 1;
    bool oscDefaultEnabled = false;
    bool oscQueryDefaultEnabled = false;
    int oscBasePort = 9010;
    std::vector<ExportParamAlias> paramAliases;
};

struct BasicExportUiPathApplyResult {
    bool handled = false;
    bool needsOscRefresh = false;
};

struct ExportOscRuntimeSettings {
    int oscPort = 0;
    int queryPort = 0;
    bool oscEnabled = false;
    bool oscQueryEnabled = false;
};

inline bool isProjectManifestFile(const juce::File& file) {
    return file.existsAsFile()
        && file.getFileName().equalsIgnoreCase("manifold.project.json5");
}

inline bool isUdpPortAvailable(int port) {
    if (port <= 0) {
        return false;
    }
    juce::DatagramSocket socket(false);
    const bool ok = socket.bindToPort(port);
    if (ok) {
        socket.shutdown();
    }
    return ok;
}

inline bool isTcpPortAvailable(int port) {
    if (port <= 0) {
        return false;
    }
    juce::StreamingSocket socket;
    const bool ok = socket.createListener(port, "127.0.0.1");
    if (ok) {
        socket.close();
    }
    return ok;
}

inline void findAvailableOscPortPair(int preferredBasePort,
                                     int& oscPort,
                                     int& queryPort) {
    const int base = preferredBasePort > 0 ? preferredBasePort : 9010;
    for (int offset = 0; offset < 200; offset += 2) {
        const int candidateOsc = base + offset;
        const int candidateQuery = candidateOsc + 1;
        if (isUdpPortAvailable(candidateOsc) && isTcpPortAvailable(candidateQuery)) {
            oscPort = candidateOsc;
            queryPort = candidateQuery;
            return;
        }
    }

    oscPort = base;
    queryPort = base + 1;
}

inline int readIntProperty(juce::DynamicObject* obj, const char* name, int fallback) {
    if (obj == nullptr || !obj->hasProperty(name)) {
        return fallback;
    }
    return static_cast<int>(obj->getProperty(name));
}

inline bool readBoolProperty(juce::DynamicObject* obj, const char* name, bool fallback) {
    if (obj == nullptr || !obj->hasProperty(name)) {
        return fallback;
    }
    return static_cast<bool>(obj->getProperty(name));
}

inline ExportPluginConfig resolveExportPluginConfig(const juce::File& requestedPath) {
    ExportPluginConfig config;
    if (!isProjectManifestFile(requestedPath)) {
        return config;
    }

    const auto json = juce::JSON::parse(requestedPath);
    if (!json.isObject()) {
        return config;
    }

    auto* obj = json.getDynamicObject();
    if (obj == nullptr || !obj->hasProperty("plugin")) {
        return config;
    }

    auto pluginVar = obj->getProperty("plugin");
    if (!pluginVar.isObject()) {
        return config;
    }

    auto* pluginObj = pluginVar.getDynamicObject();
    if (pluginObj == nullptr) {
        return config;
    }

    config.enabled = true;
    if (obj->hasProperty("name")) {
        config.headerTitle = obj->getProperty("name").toString();
    }

    if (pluginObj->hasProperty("headerTitle")) {
        config.headerTitle = pluginObj->getProperty("headerTitle").toString();
    }

    auto viewVar = pluginObj->getProperty("view");
    if (viewVar.isObject()) {
        auto* viewObj = viewVar.getDynamicObject();
        if (viewObj != nullptr) {
            if (viewObj->hasProperty("defaultMode")) {
                const auto defaultMode = viewObj->getProperty("defaultMode").toString().trim().toLowerCase();
                config.defaultViewMode = defaultMode == "compact" ? 0 : 1;
            }

            auto compactVar = viewObj->getProperty("compact");
            if (compactVar.isObject()) {
                auto* compactObj = compactVar.getDynamicObject();
                config.compactWidth = readIntProperty(compactObj, "w", config.compactWidth);
                config.compactHeight = readIntProperty(compactObj, "h", config.compactHeight);
            }

            auto splitVar = viewObj->getProperty("split");
            if (splitVar.isObject()) {
                auto* splitObj = splitVar.getDynamicObject();
                config.splitWidth = readIntProperty(splitObj, "w", config.splitWidth);
                config.splitHeight = readIntProperty(splitObj, "h", config.splitHeight);
            }
        }
    }

    auto oscVar = pluginObj->getProperty("osc");
    if (oscVar.isObject()) {
        auto* oscObj = oscVar.getDynamicObject();
        if (oscObj != nullptr) {
            config.oscDefaultEnabled = readBoolProperty(oscObj, "enabled", config.oscDefaultEnabled);
            config.oscQueryDefaultEnabled = readBoolProperty(oscObj, "queryEnabled", config.oscQueryDefaultEnabled);
            config.oscBasePort = readIntProperty(oscObj, "basePort", config.oscBasePort);
        }
    }

    auto paramsVar = pluginObj->getProperty("params");
    if (paramsVar.isArray()) {
        for (const auto& item : *paramsVar.getArray()) {
            auto* paramObj = item.getDynamicObject();
            if (paramObj == nullptr || !paramObj->hasProperty("path") || !paramObj->hasProperty("internalPath")) {
                continue;
            }

            ExportParamAlias alias;
            alias.path = paramObj->getProperty("path").toString();
            alias.internalPath = paramObj->getProperty("internalPath").toString();
            alias.type = paramObj->hasProperty("type") ? paramObj->getProperty("type").toString() : juce::String("f");
            alias.rangeMin = static_cast<float>(paramObj->hasProperty("min") ? static_cast<double>(paramObj->getProperty("min")) : 0.0);
            alias.rangeMax = static_cast<float>(paramObj->hasProperty("max") ? static_cast<double>(paramObj->getProperty("max")) : 1.0);
            alias.defaultValue = static_cast<float>(paramObj->hasProperty("default")
                ? static_cast<double>(paramObj->getProperty("default"))
                : static_cast<double>(alias.rangeMin));
            alias.skew = static_cast<float>(paramObj->hasProperty("skew")
                ? static_cast<double>(paramObj->getProperty("skew"))
                : 1.0);
            alias.hostParamId = paramObj->hasProperty("hostParamId")
                ? paramObj->getProperty("hostParamId").toString()
                : juce::String();
            alias.hostParamName = paramObj->hasProperty("hostParamName")
                ? paramObj->getProperty("hostParamName").toString()
                : alias.hostParamId;
            alias.hostParamKind = paramObj->hasProperty("hostParamKind")
                ? paramObj->getProperty("hostParamKind").toString()
                : juce::String("float");
            if (paramObj->hasProperty("choices")) {
                auto choicesVar = paramObj->getProperty("choices");
                if (choicesVar.isArray()) {
                    for (const auto& choice : *choicesVar.getArray()) {
                        alias.choices.add(choice.toString());
                    }
                }
            }
            alias.description = paramObj->hasProperty("description")
                ? paramObj->getProperty("description").toString()
                : alias.path;
            if (alias.path.isNotEmpty() && alias.internalPath.isNotEmpty()) {
                config.paramAliases.push_back(alias);
            }
        }
    }

    return config;
}

inline juce::String resolveExportInternalPath(const ExportPluginConfig& config,
                                              const juce::String& path) {
    for (const auto& alias : config.paramAliases) {
        if (alias.path == path) {
            return alias.internalPath;
        }
    }
    return {};
}

inline ExportParamAlias* findExportAliasByPublicPath(ExportPluginConfig& config,
                                                     const juce::String& path) {
    for (auto& alias : config.paramAliases) {
        if (alias.path == path) {
            return &alias;
        }
    }
    return nullptr;
}

inline const ExportParamAlias* findExportAliasByPublicPath(const ExportPluginConfig& config,
                                                           const juce::String& path) {
    for (const auto& alias : config.paramAliases) {
        if (alias.path == path) {
            return &alias;
        }
    }
    return nullptr;
}

inline ExportParamAlias* findExportAliasByHostParamId(ExportPluginConfig& config,
                                                      const juce::String& hostParamId) {
    for (auto& alias : config.paramAliases) {
        if (alias.hostParamId == hostParamId) {
            return &alias;
        }
    }
    return nullptr;
}

inline const ExportParamAlias* findExportAliasByHostParamId(const ExportPluginConfig& config,
                                                            const juce::String& hostParamId) {
    for (const auto& alias : config.paramAliases) {
        if (alias.hostParamId == hostParamId) {
            return &alias;
        }
    }
    return nullptr;
}

inline bool syncPublicPathToHostParameter(ExportPluginConfig& config,
                                          juce::AudioProcessorValueTreeState* hostParams,
                                          const juce::String& publicPath,
                                          float value) {
    if (hostParams == nullptr) {
        return false;
    }

    auto* alias = findExportAliasByPublicPath(config, publicPath);
    if (alias == nullptr || alias->hostParamId.isEmpty()) {
        return false;
    }

    auto* parameter = hostParams->getParameter(alias->hostParamId);
    auto* ranged = dynamic_cast<juce::RangedAudioParameter*>(parameter);
    if (ranged == nullptr) {
        return false;
    }

    const float clamped = juce::jlimit(alias->rangeMin, alias->rangeMax, value);
    const float current = alias->rawHostValue != nullptr ? alias->rawHostValue->load() : clamped;
    if (std::abs(current - clamped) <= 1.0e-6f) {
        return true;
    }

    ranged->setValueNotifyingHost(ranged->convertTo0to1(clamped));
    return true;
}

inline void applyHostParameterSnapshotToProcessor(const ExportPluginConfig& config,
                                                  juce::AudioProcessorValueTreeState* hostParams,
                                                  const std::function<void(const std::string&, float)>& setParamByPath) {
    if (hostParams == nullptr) {
        return;
    }

    for (const auto& alias : config.paramAliases) {
        if (alias.internalPath.isEmpty() || alias.hostParamId.isEmpty()) {
            continue;
        }
        const float value = alias.rawHostValue != nullptr ? alias.rawHostValue->load() : alias.defaultValue;
        setParamByPath(alias.internalPath.toStdString(), value);
    }
}

inline ExportOscRuntimeSettings computeExportOscRuntimeSettings(
    const ExportPluginConfig& config,
    bool oscEnabled,
    bool oscQueryEnabled,
    int requestedOscPort,
    int requestedQueryPort) {
    ExportOscRuntimeSettings settings;
    settings.oscEnabled = oscEnabled;
    settings.oscQueryEnabled = oscQueryEnabled && oscEnabled;
    settings.oscPort = requestedOscPort;
    settings.queryPort = requestedQueryPort;

    if (settings.oscEnabled || settings.oscQueryEnabled) {
        findAvailableOscPortPair(settings.oscPort > 0 ? settings.oscPort : config.oscBasePort,
                                 settings.oscPort,
                                 settings.queryPort);
    } else {
        settings.oscPort = config.oscBasePort;
        settings.queryPort = config.oscBasePort + 1;
    }

    return settings;
}

inline BasicExportUiPathApplyResult applyBasicExportUiPath(std::string_view path,
                                                           float value,
                                                           int& viewMode,
                                                           bool& settingsVisible,
                                                           bool& devVisible,
                                                           bool& oscEnabled,
                                                           bool& oscQueryEnabled,
                                                           int& xyXParam,
                                                           int& xyYParam) {
    if (path == "/plugin/ui/viewMode") {
        viewMode = value >= 0.5f ? 1 : 0;
        return {true, false};
    }
    if (path == "/plugin/ui/settingsVisible") {
        settingsVisible = value > 0.5f;
        return {true, false};
    }
    if (path == "/plugin/ui/devVisible") {
        devVisible = value > 0.5f;
        return {true, false};
    }
    if (path == "/plugin/ui/oscEnabled") {
        oscEnabled = value > 0.5f;
        if (!oscEnabled) {
            oscQueryEnabled = false;
        }
        return {true, true};
    }
    if (path == "/plugin/ui/oscQueryEnabled") {
        oscQueryEnabled = value > 0.5f;
        if (oscQueryEnabled) {
            oscEnabled = true;
        }
        return {true, true};
    }
    if (path == "/plugin/ui/xyXParam") {
        xyXParam = juce::jlimit(1, 5, static_cast<int>(std::lround(value)));
        return {true, false};
    }
    if (path == "/plugin/ui/xyYParam") {
        xyYParam = juce::jlimit(1, 5, static_cast<int>(std::lround(value)));
        return {true, false};
    }

    return {};
}

inline std::optional<float> readBasicExportUiPath(std::string_view path,
                                                  int viewMode,
                                                  bool settingsVisible,
                                                  bool devVisible,
                                                  bool oscEnabled,
                                                  bool oscQueryEnabled,
                                                  int oscInputPort,
                                                  int oscQueryPort,
                                                  int xyXParam,
                                                  int xyYParam) {
    if (path == "/plugin/ui/viewMode") {
        return static_cast<float>(viewMode);
    }
    if (path == "/plugin/ui/settingsVisible") {
        return settingsVisible ? 1.0f : 0.0f;
    }
    if (path == "/plugin/ui/devVisible") {
        return devVisible ? 1.0f : 0.0f;
    }
    if (path == "/plugin/ui/oscEnabled") {
        return oscEnabled ? 1.0f : 0.0f;
    }
    if (path == "/plugin/ui/oscQueryEnabled") {
        return oscQueryEnabled ? 1.0f : 0.0f;
    }
    if (path == "/plugin/ui/oscInputPort") {
        return static_cast<float>(oscInputPort);
    }
    if (path == "/plugin/ui/oscQueryPort") {
        return static_cast<float>(oscQueryPort);
    }
    if (path == "/plugin/ui/xyXParam") {
        return static_cast<float>(xyXParam);
    }
    if (path == "/plugin/ui/xyYParam") {
        return static_cast<float>(xyYParam);
    }
    return std::nullopt;
}

inline std::unique_ptr<juce::AudioProcessorValueTreeState> createHostParameterState(
    juce::AudioProcessor& processor,
    ExportPluginConfig& config) {
    std::vector<std::unique_ptr<juce::RangedAudioParameter>> params;
    params.reserve(config.paramAliases.size());

    for (auto& alias : config.paramAliases) {
        alias.rawHostValue = nullptr;
        if (alias.hostParamId.isEmpty()) {
            continue;
        }

        const auto kind = alias.hostParamKind.trim().toLowerCase();
        if (kind == "choice" && alias.choices.size() > 0) {
            params.push_back(std::make_unique<juce::AudioParameterChoice>(
                juce::ParameterID(alias.hostParamId, 1),
                alias.hostParamName.isNotEmpty() ? alias.hostParamName : alias.hostParamId,
                alias.choices,
                juce::jlimit(0, alias.choices.size() - 1,
                             static_cast<int>(std::round(alias.defaultValue)))));
        } else {
            juce::NormalisableRange<float> range(alias.rangeMin, alias.rangeMax);
            if (alias.skew > 0.0f && std::abs(alias.skew - 1.0f) > 1.0e-4f) {
                range.skew = alias.skew;
            }
            params.push_back(std::make_unique<juce::AudioParameterFloat>(
                juce::ParameterID(alias.hostParamId, 1),
                alias.hostParamName.isNotEmpty() ? alias.hostParamName : alias.hostParamId,
                range,
                juce::jlimit(alias.rangeMin, alias.rangeMax, alias.defaultValue)));
        }
    }

    return std::make_unique<juce::AudioProcessorValueTreeState>(
        processor,
        nullptr,
        "HostParameters",
        juce::AudioProcessorValueTreeState::ParameterLayout{params.begin(), params.end()});
}

inline void bindHostParameterAliases(ExportPluginConfig& config,
                                     juce::AudioProcessorValueTreeState& hostParams,
                                     juce::AudioProcessorValueTreeState::Listener& listener) {
    for (auto& alias : config.paramAliases) {
        if (alias.hostParamId.isEmpty()) {
            continue;
        }
        alias.rawHostValue = hostParams.getRawParameterValue(alias.hostParamId);
        hostParams.addParameterListener(alias.hostParamId, &listener);
    }
}

inline void applyHostParameterChange(const ExportPluginConfig& config,
                                     const juce::String& parameterID,
                                     float newValue,
                                     const std::function<void(const std::string&, float)>& setParamByPath) {
    const auto* alias = findExportAliasByHostParamId(config, parameterID);
    if (alias == nullptr || alias->internalPath.isEmpty()) {
        return;
    }

    setParamByPath(alias->internalPath.toStdString(), newValue);
}

} // namespace manifold::export_plugin
