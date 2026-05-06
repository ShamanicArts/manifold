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

struct ExportUiEndpointSpec {
    const char* path = "";
    float rangeMin = 0.0f;
    float rangeMax = 1.0f;
    int access = 1;
    const char* description = "";
};

struct ExportUiInitialState {
    int viewMode = 1;
    int editorWidth = 472;
    int editorHeight = 220;
    bool settingsVisible = false;
    bool devVisible = false;
    bool oscEnabled = false;
    bool oscQueryEnabled = false;
    int oscInputPort = 0;
    int oscQueryPort = 0;
    int xyXParam = 1;
    int xyYParam = 2;
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

inline ExportUiInitialState makeExportUiInitialState(const ExportPluginConfig& config) {
    ExportUiInitialState state;
    state.viewMode = config.defaultViewMode;
    state.editorWidth = config.defaultViewMode == 0 ? config.compactWidth : config.splitWidth;
    state.editorHeight = config.defaultViewMode == 0 ? config.compactHeight : config.splitHeight;
    state.settingsVisible = false;
    state.devVisible = false;
    state.oscEnabled = config.oscDefaultEnabled;
    state.oscQueryEnabled = config.oscQueryDefaultEnabled;
    state.oscInputPort = config.oscBasePort;
    state.oscQueryPort = config.oscBasePort + 1;
    state.xyXParam = 1;
    state.xyYParam = 2;
    return state;
}

inline void captureDeltaSnapshot(std::atomic<bool>& capturedFlag,
                                 int64_t baselinePss,
                                 int64_t baselinePriv,
                                 int64_t snapshotPss,
                                 int64_t snapshotPriv,
                                 std::atomic<int64_t>& deltaPss,
                                 std::atomic<int64_t>& deltaPriv) {
    if (capturedFlag.exchange(true, std::memory_order_relaxed)) {
        return;
    }
    deltaPss.store(snapshotPss - baselinePss, std::memory_order_relaxed);
    deltaPriv.store(snapshotPriv - baselinePriv, std::memory_order_relaxed);
}

inline void captureEditorOpenSnapshot(std::atomic<bool>& capturedFlag,
                                      int64_t baselinePss,
                                      int64_t baselinePriv,
                                      int64_t snapshotPss,
                                      int64_t snapshotPriv,
                                      int64_t snapshotHeap,
                                      std::atomic<int64_t>& editorOpenPss,
                                      std::atomic<int64_t>& editorOpenPriv,
                                      std::atomic<int64_t>& editorOpenHeap,
                                      std::atomic<int64_t>& deltaPss,
                                      std::atomic<int64_t>& deltaPriv) {
    if (capturedFlag.exchange(true, std::memory_order_relaxed)) {
        return;
    }
    editorOpenPss.store(snapshotPss, std::memory_order_relaxed);
    editorOpenPriv.store(snapshotPriv, std::memory_order_relaxed);
    editorOpenHeap.store(snapshotHeap, std::memory_order_relaxed);
    deltaPss.store(snapshotPss - baselinePss, std::memory_order_relaxed);
    deltaPriv.store(snapshotPriv - baselinePriv, std::memory_order_relaxed);
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

inline const std::vector<ExportUiEndpointSpec>& getExportUiEndpointSpecs() {
    static const std::vector<ExportUiEndpointSpec> specs{
        {"/plugin/ui/viewMode", 0.0f, 1.0f, 3, "Plugin export view mode (0=compact, 1=split)"},
        {"/plugin/ui/settingsVisible", 0.0f, 1.0f, 3, "Plugin export settings/dev panel visible (0/1)"},
        {"/plugin/ui/devVisible", 0.0f, 1.0f, 3, "Plugin export dev/perf detail visible (0/1)"},
        {"/plugin/ui/oscEnabled", 0.0f, 1.0f, 3, "Plugin OSC enable (0/1)"},
        {"/plugin/ui/oscQueryEnabled", 0.0f, 1.0f, 3, "Plugin OSCQuery enable (0/1)"},
        {"/plugin/ui/oscInputPort", 0.0f, 65535.0f, 1, "Active OSC UDP input port"},
        {"/plugin/ui/oscQueryPort", 0.0f, 65535.0f, 1, "Active OSCQuery HTTP port"},
        {"/plugin/ui/xyXParam", 1.0f, 5.0f, 3, "Effect XY X-axis assignment (1-5)"},
        {"/plugin/ui/xyYParam", 1.0f, 5.0f, 3, "Effect XY Y-axis assignment (1-5)"},
        {"/plugin/ui/perf/frameCurrentUs", 0.0f, 1000000.0f, 1, "Current editor frame time in microseconds"},
        {"/plugin/ui/perf/frameAvgUs", 0.0f, 1000000.0f, 1, "Average editor frame time in microseconds"},
        {"/plugin/ui/perf/framePeakUs", 0.0f, 1000000.0f, 1, "Peak editor frame time in microseconds"},
        {"/plugin/ui/perf/dspCurrentUs", 0.0f, 1000000.0f, 1, "Current DSP block time in microseconds"},
        {"/plugin/ui/perf/dspAvgUs", 0.0f, 1000000.0f, 1, "Average DSP block time in microseconds"},
        {"/plugin/ui/perf/dspPeakUs", 0.0f, 1000000.0f, 1, "Peak DSP block time in microseconds"},
        {"/plugin/ui/perf/uiUpdateUs", 0.0f, 1000000.0f, 1, "Structured UI update time in microseconds"},
        {"/plugin/ui/perf/renderUs", 0.0f, 1000000.0f, 1, "ImGui/direct render time in microseconds"},
        {"/plugin/ui/perf/paintUs", 0.0f, 1000000.0f, 1, "Canvas paint time in microseconds"},
        {"/plugin/ui/perf/cpuPercent", 0.0f, 100.0f, 1, "CPU utilization percent (0-100)"},
        {"/plugin/ui/perf/pssMB", 0.0f, 8192.0f, 1, "Process proportional set size in megabytes"},
        {"/plugin/ui/perf/privateDirtyMB", 0.0f, 8192.0f, 1, "Process private dirty memory in megabytes"},
        {"/plugin/ui/perf/pluginDeltaPssMB", 0.0f, 8192.0f, 1, "Plugin-attributable PSS delta from processor construction baseline"},
        {"/plugin/ui/perf/pluginDeltaPrivateDirtyMB", 0.0f, 8192.0f, 1, "Plugin-attributable private dirty delta from processor construction baseline"},
        {"/plugin/ui/perf/pluginDeltaHeapMB", 0.0f, 8192.0f, 1, "Plugin-attributable heap delta from processor construction baseline"},
        {"/plugin/ui/perf/uiDeltaPssMB", -8192.0f, 8192.0f, 1, "UI-attributable PSS delta since editor opened"},
        {"/plugin/ui/perf/uiDeltaPrivateDirtyMB", -8192.0f, 8192.0f, 1, "UI-attributable private dirty delta since editor opened"},
        {"/plugin/ui/perf/uiDeltaHeapMB", -8192.0f, 8192.0f, 1, "UI-attributable heap delta since editor opened"},
        {"/plugin/ui/perf/afterLuaInitDeltaPssMB", 0.0f, 8192.0f, 1, "PSS delta after Lua VM init relative to processor construction baseline"},
        {"/plugin/ui/perf/afterLuaInitDeltaPrivateDirtyMB", 0.0f, 8192.0f, 1, "Private dirty delta after Lua VM init relative to processor construction baseline"},
        {"/plugin/ui/perf/afterBindingsDeltaPssMB", 0.0f, 8192.0f, 1, "PSS delta after binding registration relative to processor construction baseline"},
        {"/plugin/ui/perf/afterBindingsDeltaPrivateDirtyMB", 0.0f, 8192.0f, 1, "Private dirty delta after binding registration relative to processor construction baseline"},
        {"/plugin/ui/perf/afterScriptLoadDeltaPssMB", 0.0f, 8192.0f, 1, "PSS delta after script load relative to processor construction baseline"},
        {"/plugin/ui/perf/afterScriptLoadDeltaPrivateDirtyMB", 0.0f, 8192.0f, 1, "Private dirty delta after script load relative to processor construction baseline"},
        {"/plugin/ui/perf/afterDspDeltaPssMB", 0.0f, 8192.0f, 1, "PSS delta after DSP boot relative to processor construction baseline"},
        {"/plugin/ui/perf/afterDspDeltaPrivateDirtyMB", 0.0f, 8192.0f, 1, "Private dirty delta after DSP boot relative to processor construction baseline"},
        {"/plugin/ui/perf/afterUiOpenDeltaPssMB", 0.0f, 8192.0f, 1, "PSS delta after UI open relative to processor construction baseline"},
        {"/plugin/ui/perf/afterUiOpenDeltaPrivateDirtyMB", 0.0f, 8192.0f, 1, "Private dirty delta after UI open relative to processor construction baseline"},
        {"/plugin/ui/perf/afterUiIdleDeltaPssMB", 0.0f, 8192.0f, 1, "PSS delta after UI idle settle relative to processor construction baseline"},
        {"/plugin/ui/perf/afterUiIdleDeltaPrivateDirtyMB", 0.0f, 8192.0f, 1, "Private dirty delta after UI idle settle relative to processor construction baseline"},
        {"/plugin/ui/perf/luaHeapMB", 0.0f, 512.0f, 1, "Lua VM heap in megabytes"},
        {"/plugin/ui/perf/glibcHeapMB", 0.0f, 8192.0f, 1, "glibc heap allocated in megabytes"},
        {"/plugin/ui/perf/glibcArenaMB", 0.0f, 8192.0f, 1, "glibc arena bytes in megabytes"},
        {"/plugin/ui/perf/glibcMmapMB", 0.0f, 8192.0f, 1, "glibc mmap bytes in megabytes"},
        {"/plugin/ui/perf/glibcFreeHeldMB", 0.0f, 8192.0f, 1, "glibc free-but-held bytes in megabytes"},
        {"/plugin/ui/perf/glibcReleasableMB", 0.0f, 8192.0f, 1, "glibc releasable top bytes in megabytes"},
        {"/plugin/ui/perf/glibcArenaCount", 0.0f, 2048.0f, 1, "glibc arena count"},
        {"/plugin/ui/perf/gpuFontAtlasMB", 0.0f, 8192.0f, 1, "Plugin-owned ImGui font atlas bytes in megabytes"},
        {"/plugin/ui/perf/gpuSurfaceColorMB", 0.0f, 8192.0f, 1, "Plugin-owned offscreen color surface bytes in megabytes"},
        {"/plugin/ui/perf/gpuSurfaceDepthMB", 0.0f, 8192.0f, 1, "Plugin-owned offscreen depth surface bytes in megabytes"},
        {"/plugin/ui/perf/gpuTotalMB", 0.0f, 8192.0f, 1, "Total plugin-owned GPU bytes in megabytes"},
        {"/plugin/ui/perf/runtimeNodeCount", 0.0f, 1000000.0f, 1, "RuntimeNode count"},
        {"/plugin/ui/perf/runtimeNodeMB", 0.0f, 8192.0f, 1, "RuntimeNode tree object/string/vector bytes in megabytes"},
        {"/plugin/ui/perf/runtimeCallbackCount", 0.0f, 1000000.0f, 1, "Bound RuntimeNode callback count"},
        {"/plugin/ui/perf/runtimeUserDataEntries", 0.0f, 1000000.0f, 1, "RuntimeNode userdata entry count"},
        {"/plugin/ui/perf/runtimeUserDataMB", 0.0f, 8192.0f, 1, "RuntimeNode userdata bytes in megabytes"},
        {"/plugin/ui/perf/runtimePayloadMB", 0.0f, 8192.0f, 1, "RuntimeNode display/custom payload bytes in megabytes"},
        {"/plugin/ui/perf/displayListCount", 0.0f, 1000000.0f, 1, "Compiled display list count"},
        {"/plugin/ui/perf/displayListCommands", 0.0f, 10000000.0f, 1, "Compiled display list command count"},
        {"/plugin/ui/perf/displayListMB", 0.0f, 8192.0f, 1, "Compiled display list bytes in megabytes"},
        {"/plugin/ui/perf/renderSnapshotNodes", 0.0f, 1000000.0f, 1, "Render snapshot node count across pending/active/gl snapshots"},
        {"/plugin/ui/perf/renderSnapshotMB", 0.0f, 8192.0f, 1, "Render snapshot bytes in megabytes"},
        {"/plugin/ui/perf/customSurfaceStateMB", 0.0f, 8192.0f, 1, "Custom shader surface CPU-side state bytes in megabytes"},
        {"/plugin/ui/perf/scriptSourceKB", 0.0f, 1048576.0f, 1, "Current loaded script file size in kilobytes"},
        {"/plugin/ui/perf/luaGlobalCount", 0.0f, 1000000.0f, 1, "Lua global table entry count"},
        {"/plugin/ui/perf/luaRegistryEntryCount", 0.0f, 10000000.0f, 1, "Lua registry entry count"},
        {"/plugin/ui/perf/luaPackageLoadedCount", 0.0f, 1000000.0f, 1, "Lua package.loaded entry count"},
        {"/plugin/ui/perf/luaOscPathCount", 0.0f, 1000000.0f, 1, "Lua OSC path count"},
        {"/plugin/ui/perf/luaOscCallbackCount", 0.0f, 1000000.0f, 1, "Lua OSC callback count"},
        {"/plugin/ui/perf/luaOscQueryHandlerCount", 0.0f, 1000000.0f, 1, "Lua OSCQuery handler count"},
        {"/plugin/ui/perf/luaEventListenerCount", 0.0f, 1000000.0f, 1, "Lua event listener count"},
        {"/plugin/ui/perf/luaManagedDspSlotCount", 0.0f, 1000000.0f, 1, "Lua managed DSP slot count"},
        {"/plugin/ui/perf/luaOverlayCacheCount", 0.0f, 1000000.0f, 1, "Lua overlay cache entry count"},
        {"/plugin/ui/perf/endpointTotalCount", 0.0f, 1000000.0f, 1, "Total endpoint count"},
        {"/plugin/ui/perf/endpointCustomCount", 0.0f, 1000000.0f, 1, "Custom endpoint count"},
        {"/plugin/ui/perf/endpointPathKB", 0.0f, 1048576.0f, 1, "Endpoint path bytes in kilobytes"},
        {"/plugin/ui/perf/endpointDescriptionKB", 0.0f, 1048576.0f, 1, "Endpoint description bytes in kilobytes"},
        {"/plugin/ui/perf/dspHostCount", 0.0f, 1000000.0f, 1, "DSP host count (default + slots)"},
        {"/plugin/ui/perf/dspScriptSourceKB", 0.0f, 1048576.0f, 1, "Primary DSP script source file size in kilobytes"},
        {"/plugin/ui/perf/imguiWindowCount", 0.0f, 1000000.0f, 1, "ImGui window count"},
        {"/plugin/ui/perf/imguiTableCount", 0.0f, 1000000.0f, 1, "ImGui table count"},
        {"/plugin/ui/perf/imguiTabBarCount", 0.0f, 1000000.0f, 1, "ImGui tab bar count"},
        {"/plugin/ui/perf/imguiViewportCount", 0.0f, 1000000.0f, 1, "ImGui viewport count"},
        {"/plugin/ui/perf/imguiFontCount", 0.0f, 1000000.0f, 1, "ImGui font count"},
        {"/plugin/ui/perf/imguiWindowStateMB", 0.0f, 8192.0f, 1, "ImGui CPU-side window/state bytes in megabytes"},
        {"/plugin/ui/perf/imguiDrawBufferMB", 0.0f, 8192.0f, 1, "ImGui CPU-side draw buffer bytes in megabytes"},
        {"/plugin/ui/perf/imguiInternalStateMB", 0.0f, 8192.0f, 1, "ImGui total CPU-side internal bytes in megabytes"},
        {"/plugin/ui/perf/shellScriptListRows", 0.0f, 1000000.0f, 1, "Script list row count"},
        {"/plugin/ui/perf/shellScriptListMB", 0.0f, 8192.0f, 1, "Script list retained bytes in megabytes"},
        {"/plugin/ui/perf/shellHierarchyRows", 0.0f, 1000000.0f, 1, "Hierarchy row count"},
        {"/plugin/ui/perf/shellHierarchyMB", 0.0f, 8192.0f, 1, "Hierarchy retained bytes in megabytes"},
        {"/plugin/ui/perf/shellInspectorRows", 0.0f, 1000000.0f, 1, "Inspector row count"},
        {"/plugin/ui/perf/shellInspectorMB", 0.0f, 8192.0f, 1, "Inspector retained bytes in megabytes"},
        {"/plugin/ui/perf/shellScriptInspectorMB", 0.0f, 8192.0f, 1, "Script inspector retained bytes in megabytes"},
        {"/plugin/ui/perf/shellMainEditorTextKB", 0.0f, 1048576.0f, 1, "Main editor text size in kilobytes"}
    };
    return specs;
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

inline juce::var makeExportPluginContract(const ExportPluginConfig& config,
                                          int viewMode,
                                          int editorWidth,
                                          int editorHeight,
                                          bool settingsVisible,
                                          bool devVisible,
                                          bool oscEnabled,
                                          bool oscQueryEnabled,
                                          int oscInputPort,
                                          int oscQueryPort,
                                          int xyXParam,
                                          int xyYParam) {
    juce::DynamicObject::Ptr exportObj = new juce::DynamicObject();
    exportObj->setProperty("enabled", config.enabled);
    exportObj->setProperty("compactWidth", config.compactWidth);
    exportObj->setProperty("compactHeight", config.compactHeight);
    exportObj->setProperty("splitWidth", config.splitWidth);
    exportObj->setProperty("splitHeight", config.splitHeight);
    exportObj->setProperty("defaultViewMode", config.defaultViewMode);
    exportObj->setProperty("oscBasePort", config.oscBasePort);
    exportObj->setProperty("oscDefaultEnabled", config.oscDefaultEnabled);
    exportObj->setProperty("oscQueryDefaultEnabled", config.oscQueryDefaultEnabled);
    exportObj->setProperty("viewMode", viewMode);
    exportObj->setProperty("editorWidth", editorWidth);
    exportObj->setProperty("editorHeight", editorHeight);
    exportObj->setProperty("settingsVisible", settingsVisible);
    exportObj->setProperty("devVisible", devVisible);
    exportObj->setProperty("oscEnabled", oscEnabled);
    exportObj->setProperty("oscQueryEnabled", oscQueryEnabled);
    exportObj->setProperty("oscInputPort", oscInputPort);
    exportObj->setProperty("oscQueryPort", oscQueryPort);
    exportObj->setProperty("xyXParam", xyXParam);
    exportObj->setProperty("xyYParam", xyYParam);

    juce::Array<juce::var> aliasArray;
    for (const auto& alias : config.paramAliases) {
        juce::DynamicObject::Ptr aliasObj = new juce::DynamicObject();
        aliasObj->setProperty("path", alias.path);
        aliasObj->setProperty("internalPath", alias.internalPath);
        aliasObj->setProperty("type", alias.type);
        aliasObj->setProperty("rangeMin", alias.rangeMin);
        aliasObj->setProperty("rangeMax", alias.rangeMax);
        aliasObj->setProperty("description", alias.description);
        aliasObj->setProperty("defaultValue", alias.defaultValue);
        aliasObj->setProperty("skew", alias.skew);
        aliasObj->setProperty("hostParamId", alias.hostParamId);
        aliasObj->setProperty("hostParamName", alias.hostParamName);
        aliasObj->setProperty("hostParamKind", alias.hostParamKind);
        juce::Array<juce::var> choices;
        for (const auto& choice : alias.choices) {
            choices.add(choice);
        }
        aliasObj->setProperty("choices", juce::var(choices));
        aliasArray.add(juce::var(aliasObj.get()));
    }
    exportObj->setProperty("paramAliases", juce::var(aliasArray));
    return juce::var(exportObj.get());
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
