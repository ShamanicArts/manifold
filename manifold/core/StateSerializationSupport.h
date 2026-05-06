#pragma once

#include <array>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

#include <sol/sol.hpp>

#include "../primitives/scripting/ScriptableProcessor.h"
#include "BehaviorCoreProcessor.h"

namespace manifold {
namespace state_serialization {

// ============================================================================
// State string helpers
// ============================================================================

inline const char* toLayerStateString(ScriptableLayerState state) {
    switch (state) {
        case ScriptableLayerState::Empty: return "empty";
        case ScriptableLayerState::Playing: return "playing";
        case ScriptableLayerState::Recording: return "recording";
        case ScriptableLayerState::Overdubbing: return "overdubbing";
        case ScriptableLayerState::Muted: return "muted";
        case ScriptableLayerState::Stopped: return "stopped";
        case ScriptableLayerState::Paused: return "paused";
        case ScriptableLayerState::Unknown: return "unknown";
    }
    return "unknown";
}

inline const char* toRecordModeString(int mode) {
    switch (mode) {
        case 0: return "firstLoop";
        case 1: return "freeMode";
        case 2: return "traditional";
        case 3: return "retrospective";
        default: return "firstLoop";
    }
}

using SerializedStateEntries = std::vector<std::pair<std::string, std::string>>;
using SerializedStateMap = std::unordered_map<std::string, std::string>;

// ============================================================================
// Value stringification
// ============================================================================

inline std::string stringifyStateValue(bool value) {
    return value ? "1" : "0";
}

inline std::string stringifyStateValue(const char* value) {
    return value != nullptr ? std::string(value) : std::string{};
}

inline std::string stringifyStateValue(float value) {
    return std::to_string(value);
}

inline std::string stringifyStateValue(double value) {
    return std::to_string(value);
}

inline std::string stringifyStateValue(int value) {
    return std::to_string(value);
}

// ============================================================================
// Aliased state value helpers
// ============================================================================

inline void pushAliasedStateValue(SerializedStateEntries& entries,
                                  const std::string& suffix,
                                  const std::string& value) {
    entries.emplace_back("/manifold" + suffix, value);
    entries.emplace_back("/core/behavior" + suffix, value);
    entries.emplace_back("/dsp/manifold" + suffix, value);
}

template <typename T>
inline void pushAliasedStateValue(SerializedStateEntries& entries,
                                  const std::string& suffix,
                                  T value) {
    pushAliasedStateValue(entries, suffix, stringifyStateValue(value));
}

// ============================================================================
// Spectrum serialization
// ============================================================================

inline std::string serializeSpectrum(const std::array<float, 32>& spectrum) {
    std::string out;
    out.reserve(spectrum.size() * 12);
    for (size_t i = 0; i < spectrum.size(); ++i) {
        if (i != 0) {
            out.push_back(',');
        }
        out += std::to_string(spectrum[i]);
    }
    return out;
}

// ============================================================================
// State entry builders (use only public BehaviorCoreProcessor API)
// ============================================================================

inline SerializedStateEntries buildSerializedStateEntries(const BehaviorCoreProcessor& processor) {
    SerializedStateEntries entries;
    entries.reserve(192);

    const float tempo = processor.getTempo();
    const float targetBPM = processor.getTargetBPM();
    const float samplesPerBar = processor.getSamplesPerBar();
    const double sampleRate = processor.getSampleRate();
    const int captureSize = processor.getCaptureSize();
    const float masterVolume = processor.getMasterVolume();
    const float inputVolume = processor.getInputVolume();
    const bool passthroughEnabled = processor.isPassthroughEnabled();
    const bool recording = processor.isRecording();
    const bool overdubEnabled = processor.isOverdubEnabled();
    const int activeLayerIndex = processor.getActiveLayerIndex();
    const bool forwardCommitArmed = processor.isForwardCommitArmed();
    const float forwardCommitBars = processor.getForwardCommitBars();
    const char* recordModeString = toRecordModeString(processor.getRecordModeIndex());

    pushAliasedStateValue(entries, "/tempo", tempo);
    pushAliasedStateValue(entries, "/targetbpm", targetBPM);
    pushAliasedStateValue(entries, "/samplesPerBar", samplesPerBar);
    pushAliasedStateValue(entries, "/sampleRate", sampleRate);
    pushAliasedStateValue(entries, "/captureSize", captureSize);
    pushAliasedStateValue(entries, "/volume", masterVolume);
    pushAliasedStateValue(entries, "/inputVolume", inputVolume);
    pushAliasedStateValue(entries, "/passthrough", passthroughEnabled);
    pushAliasedStateValue(entries, "/recording", recording);
    pushAliasedStateValue(entries, "/overdub", overdubEnabled);
    pushAliasedStateValue(entries, "/mode", recordModeString);
    pushAliasedStateValue(entries, "/layer", activeLayerIndex);
    pushAliasedStateValue(entries, "/forwardArmed", forwardCommitArmed);
    pushAliasedStateValue(entries, "/forwardBars", forwardCommitBars);

    pushAliasedStateValue(entries, "/link/enabled", processor.isLinkEnabled());
    pushAliasedStateValue(entries, "/link/tempoSync", processor.isLinkTempoSyncEnabled());
    pushAliasedStateValue(entries, "/link/startStopSync", processor.isLinkStartStopSyncEnabled());
    pushAliasedStateValue(entries, "/link/peers", processor.getLinkNumPeers());
    pushAliasedStateValue(entries, "/link/playing", processor.isLinkPlaying());
    pushAliasedStateValue(entries, "/link/beat", processor.getLinkBeat());
    pushAliasedStateValue(entries, "/link/phase", processor.getLinkPhase());

    for (int i = 0; i < processor.getNumLayers(); ++i) {
        ScriptableLayerSnapshot layer;
        if (!processor.getLayerSnapshot(i, layer)) {
            continue;
        }

        const float normalizedPosition = layer.length > 0
                                             ? static_cast<float>(layer.position) / static_cast<float>(layer.length)
                                             : 0.0f;
        const float bars = samplesPerBar > 0.0f
                               ? static_cast<float>(layer.length) / samplesPerBar
                               : 0.0f;
        const std::string layerPrefix = "/layer/" + std::to_string(i);

        pushAliasedStateValue(entries, layerPrefix + "/speed", layer.speed);
        pushAliasedStateValue(entries, layerPrefix + "/volume", layer.volume);
        pushAliasedStateValue(entries, layerPrefix + "/mute", layer.muted);
        pushAliasedStateValue(entries, layerPrefix + "/reverse", layer.reversed);
        pushAliasedStateValue(entries, layerPrefix + "/length", layer.length);
        pushAliasedStateValue(entries, layerPrefix + "/position", normalizedPosition);
        pushAliasedStateValue(entries, layerPrefix + "/bars", bars);
        pushAliasedStateValue(entries, layerPrefix + "/state", toLayerStateString(layer.state));
    }

    const auto spectrum = processor.getSpectrumData();
    pushAliasedStateValue(entries, "/spectrum", serializeSpectrum(spectrum));

    return entries;
}

inline SerializedStateMap buildSerializedStateMap(const BehaviorCoreProcessor& processor) {
    auto entries = buildSerializedStateEntries(processor);
    SerializedStateMap values;
    values.reserve(entries.size());
    for (auto& entry : entries) {
        values.emplace(std::move(entry.first), std::move(entry.second));
    }
    return values;
}

// ============================================================================
// Path extraction helpers
// ============================================================================

inline bool extractBehaviorSuffix(const std::string& path, std::string& outSuffix) {
    static const std::array<std::string, 3> prefixes = {
        "/manifold",
        "/core/behavior",
        "/dsp/manifold",
    };

    for (const auto& prefix : prefixes) {
        if (path.rfind(prefix, 0) == 0) {
            outSuffix = path.substr(prefix.size());
            if (outSuffix.empty()) {
                outSuffix = "/";
            }
            return true;
        }
    }

    return false;
}

// ============================================================================
// Lua table helpers
// ============================================================================

inline sol::table ensureLuaTable(sol::state& lua, sol::table parent, const char* key) {
    sol::object value = parent[key];
    if (value.valid() && value.is<sol::table>()) {
        return value.as<sol::table>();
    }

    sol::table table = lua.create_table();
    parent[key] = table;
    return table;
}

inline sol::table ensureLuaIndexedTable(sol::state& lua, sol::table parent, int index) {
    sol::object value = parent[index];
    if (value.valid() && value.is<sol::table>()) {
        return value.as<sol::table>();
    }

    sol::table table = lua.create_table();
    parent[index] = table;
    return table;
}

// ============================================================================
// Lua state update helpers
// ============================================================================

inline void updateLuaVoiceFromSnapshot(sol::state& lua,
                                       sol::table voices,
                                       int layerIndex,
                                       const ScriptableLayerSnapshot& layer,
                                       float samplesPerBar) {
    const int luaIndex = layerIndex + 1;
    const float normalizedPosition = layer.length > 0
                                         ? static_cast<float>(layer.position) / static_cast<float>(layer.length)
                                         : 0.0f;
    const float bars = samplesPerBar > 0.0f
                           ? static_cast<float>(layer.length) / samplesPerBar
                           : 0.0f;
    const char* layerStateString = toLayerStateString(layer.state);

    sol::table voice = ensureLuaIndexedTable(lua, voices, luaIndex);
    voice["id"] = layerIndex;
    voice["path"] = "/manifold/layer/" + std::to_string(layerIndex);
    voice["state"] = layerStateString;
    voice["length"] = layer.length;
    voice["position"] = layer.position;
    voice["positionNorm"] = normalizedPosition;
    voice["speed"] = layer.speed;
    voice["reversed"] = layer.reversed;
    voice["volume"] = layer.volume;
    voice["muted"] = layer.muted;
    voice["bars"] = bars;

    sol::table voiceParams = ensureLuaTable(lua, voice, "params");
    voiceParams["speed"] = layer.speed;
    voiceParams["volume"] = layer.volume;
    voiceParams["mute"] = layer.muted ? 1 : 0;
    voiceParams["reverse"] = layer.reversed ? 1 : 0;
    voiceParams["length"] = layer.length;
    voiceParams["position"] = normalizedPosition;
    voiceParams["bars"] = bars;
    voiceParams["state"] = layerStateString;
}

inline void updateLuaLinkFromProcessor(sol::table linkState,
                                       const BehaviorCoreProcessor& processor) {
    linkState["enabled"] = processor.isLinkEnabled();
    linkState["tempoSync"] = processor.isLinkTempoSyncEnabled();
    linkState["startStopSync"] = processor.isLinkStartStopSyncEnabled();
    linkState["peers"] = processor.getLinkNumPeers();
    linkState["playing"] = processor.isLinkPlaying();
    linkState["beat"] = processor.getLinkBeat();
    linkState["phase"] = processor.getLinkPhase();
}

inline void updateLuaSpectrumFromProcessor(sol::state& lua,
                                           sol::table state,
                                           const BehaviorCoreProcessor& processor) {
    sol::table spectrumTable = lua.create_table();
    const auto spectrum = processor.getSpectrumData();
    for (int i = 0; i < static_cast<int>(spectrum.size()); ++i) {
        spectrumTable[i + 1] = spectrum[static_cast<size_t>(i)];
    }
    state["spectrum"] = spectrumTable;
}

// ============================================================================
// Layer param path extraction
// ============================================================================

inline bool extractLayerParamForStatePath(const std::string& path,
                                          int& layerIndex,
                                          std::string& paramSuffix) {
    static const std::array<std::string, 3> prefixes = {
        "/core/behavior/layer/",
        "/manifold/layer/",
        "/dsp/manifold/layer/",
    };

    for (const auto& prefix : prefixes) {
        if (path.rfind(prefix, 0) != 0) {
            continue;
        }

        const std::string rest = path.substr(prefix.size());
        const auto slash = rest.find('/');
        if (slash == std::string::npos) {
            return false;
        }

        const int idx = std::atoi(rest.substr(0, slash).c_str());
        if (idx < 0 || idx >= BehaviorCoreProcessor::MAX_LAYERS) {
            return false;
        }

        layerIndex = idx;
        paramSuffix = rest.substr(slash + 1);
        return true;
    }

    return false;
}

// ============================================================================
// Incremental state path application
// ============================================================================

inline bool applyIncrementalStatePath(sol::state& lua,
                                      sol::table state,
                                      sol::table params,
                                      sol::table voices,
                                      sol::table linkState,
                                      const BehaviorCoreProcessor& processor,
                                      const std::string& path) {
    std::string suffix;
    if (!extractBehaviorSuffix(path, suffix)) {
        return false;
    }

    const float samplesPerBar = processor.getSamplesPerBar();

    if (suffix == "/tempo") {
        params[path] = processor.getTempo();
        return true;
    }
    if (suffix == "/targetbpm") {
        params[path] = processor.getTargetBPM();
        return true;
    }
    if (suffix == "/samplesPerBar") {
        params[path] = samplesPerBar;
        return true;
    }
    if (suffix == "/sampleRate") {
        params[path] = processor.getSampleRate();
        return true;
    }
    if (suffix == "/captureSize") {
        params[path] = processor.getCaptureSize();
        return true;
    }
    if (suffix == "/volume") {
        params[path] = processor.getMasterVolume();
        return true;
    }
    if (suffix == "/inputVolume") {
        params[path] = processor.getInputVolume();
        return true;
    }
    if (suffix == "/passthrough") {
        params[path] = processor.isPassthroughEnabled() ? 1 : 0;
        return true;
    }
    if (suffix == "/recording") {
        params[path] = processor.isRecording() ? 1 : 0;
        return true;
    }
    if (suffix == "/overdub") {
        params[path] = processor.isOverdubEnabled() ? 1 : 0;
        return true;
    }
    if (suffix == "/mode") {
        params[path] = toRecordModeString(processor.getRecordModeIndex());
        return true;
    }
    if (suffix == "/layer") {
        params[path] = processor.getActiveLayerIndex();
        return true;
    }
    if (suffix == "/forwardArmed") {
        params[path] = processor.isForwardCommitArmed() ? 1 : 0;
        return true;
    }
    if (suffix == "/forwardBars") {
        params[path] = processor.getForwardCommitBars();
        return true;
    }
    if (suffix == "/link/enabled") {
        params[path] = processor.isLinkEnabled() ? 1 : 0;
        updateLuaLinkFromProcessor(linkState, processor);
        return true;
    }
    if (suffix == "/link/tempoSync") {
        params[path] = processor.isLinkTempoSyncEnabled() ? 1 : 0;
        updateLuaLinkFromProcessor(linkState, processor);
        return true;
    }
    if (suffix == "/link/startStopSync") {
        params[path] = processor.isLinkStartStopSyncEnabled() ? 1 : 0;
        updateLuaLinkFromProcessor(linkState, processor);
        return true;
    }
    if (suffix == "/link/peers") {
        params[path] = processor.getLinkNumPeers();
        updateLuaLinkFromProcessor(linkState, processor);
        return true;
    }
    if (suffix == "/link/playing") {
        params[path] = processor.isLinkPlaying() ? 1 : 0;
        updateLuaLinkFromProcessor(linkState, processor);
        return true;
    }
    if (suffix == "/link/beat") {
        params[path] = processor.getLinkBeat();
        updateLuaLinkFromProcessor(linkState, processor);
        return true;
    }
    if (suffix == "/link/phase") {
        params[path] = processor.getLinkPhase();
        updateLuaLinkFromProcessor(linkState, processor);
        return true;
    }
    if (suffix == "/spectrum") {
        updateLuaSpectrumFromProcessor(lua, state, processor);
        return true;
    }

    int layerIndex = -1;
    std::string layerParamSuffix;
    if (!extractLayerParamForStatePath(path, layerIndex, layerParamSuffix)) {
        return false;
    }

    ScriptableLayerSnapshot layer;
    if (!processor.getLayerSnapshot(layerIndex, layer)) {
        return false;
    }

    const float normalizedPosition = layer.length > 0
                                         ? static_cast<float>(layer.position) / static_cast<float>(layer.length)
                                         : 0.0f;
    const float bars = samplesPerBar > 0.0f
                           ? static_cast<float>(layer.length) / samplesPerBar
                           : 0.0f;

    if (layerParamSuffix == "speed") {
        params[path] = layer.speed;
    } else if (layerParamSuffix == "volume") {
        params[path] = layer.volume;
    } else if (layerParamSuffix == "mute") {
        params[path] = layer.muted ? 1 : 0;
    } else if (layerParamSuffix == "reverse") {
        params[path] = layer.reversed ? 1 : 0;
    } else if (layerParamSuffix == "length") {
        params[path] = layer.length;
    } else if (layerParamSuffix == "position") {
        params[path] = normalizedPosition;
    } else if (layerParamSuffix == "bars") {
        params[path] = bars;
    } else if (layerParamSuffix == "state") {
        params[path] = toLayerStateString(layer.state);
    } else {
        return false;
    }

    updateLuaVoiceFromSnapshot(lua, voices, layerIndex, layer, samplesPerBar);
    return true;
}

// ============================================================================
// Full Lua serialization
// ============================================================================

inline void serializeStateToLua(sol::state& lua, const BehaviorCoreProcessor& processor) {
    auto state = lua.create_table();

    const float tempo = processor.getTempo();
    const float targetBPM = processor.getTargetBPM();
    const float samplesPerBar = processor.getSamplesPerBar();
    const double sampleRate = processor.getSampleRate();
    const float masterVolume = processor.getMasterVolume();
    const float inputVolume = processor.getInputVolume();
    const bool passthroughEnabled = processor.isPassthroughEnabled();
    const bool recording = processor.isRecording();
    const bool overdubEnabled = processor.isOverdubEnabled();
    const int activeLayerIndex = processor.getActiveLayerIndex();
    const bool forwardCommitArmed = processor.isForwardCommitArmed();
    const float forwardCommitBars = processor.getForwardCommitBars();
    const int recordModeIndex = processor.getRecordModeIndex();
    const int numLayers = processor.getNumLayers();
    const int captureSize = processor.getCaptureSize();
    const char* recordModeString = toRecordModeString(recordModeIndex);

    state["projectionVersion"] = 2;
    state["numVoices"] = numLayers;

    auto params = lua.create_table();
    auto setBehaviorParam = [&](const std::string& suffix, const auto& value) {
        params["/manifold" + suffix] = value;
        params["/core/behavior" + suffix] = value;
        params["/dsp/manifold" + suffix] = value;
    };

    setBehaviorParam("/tempo", tempo);
    setBehaviorParam("/targetbpm", targetBPM);
    setBehaviorParam("/samplesPerBar", samplesPerBar);
    setBehaviorParam("/sampleRate", sampleRate);
    setBehaviorParam("/captureSize", captureSize);
    setBehaviorParam("/volume", masterVolume);
    setBehaviorParam("/inputVolume", inputVolume);
    setBehaviorParam("/passthrough", passthroughEnabled ? 1 : 0);
    setBehaviorParam("/recording", recording ? 1 : 0);
    setBehaviorParam("/overdub", overdubEnabled ? 1 : 0);
    setBehaviorParam("/mode", recordModeString);
    setBehaviorParam("/layer", activeLayerIndex);
    setBehaviorParam("/forwardArmed", forwardCommitArmed ? 1 : 0);
    setBehaviorParam("/forwardBars", forwardCommitBars);

    auto voices = lua.create_table();
    for (int i = 0; i < numLayers; ++i) {
        ScriptableLayerSnapshot layer;
        if (!processor.getLayerSnapshot(i, layer)) {
            continue;
        }

        const char* layerStateString = toLayerStateString(layer.state);
        const float normalizedPosition = (layer.length > 0)
            ? static_cast<float>(layer.position) / static_cast<float>(layer.length)
            : 0.0f;
        const float bars = (samplesPerBar > 0.0f)
            ? static_cast<float>(layer.length) / samplesPerBar
            : 0.0f;
        const bool muted = layer.muted;

        const std::string manifoldLayerPrefix = "/manifold/layer/" + std::to_string(i);
        const std::string coreLayerPrefix = "/core/behavior/layer/" + std::to_string(i);
        const std::string dspLayerPrefix = "/dsp/manifold/layer/" + std::to_string(i);

        auto setLayerParam = [&](const std::string& suffix, const auto& value) {
            params[manifoldLayerPrefix + suffix] = value;
            params[coreLayerPrefix + suffix] = value;
            params[dspLayerPrefix + suffix] = value;
        };

        setLayerParam("/speed", layer.speed);
        setLayerParam("/volume", layer.volume);
        setLayerParam("/mute", muted ? 1 : 0);
        setLayerParam("/reverse", layer.reversed ? 1 : 0);
        setLayerParam("/length", layer.length);
        setLayerParam("/position", normalizedPosition);
        setLayerParam("/bars", bars);
        setLayerParam("/state", layerStateString);

        auto voice = lua.create_table();
        voice["id"] = i;
        voice["path"] = manifoldLayerPrefix;
        voice["state"] = layerStateString;
        voice["length"] = layer.length;
        voice["position"] = layer.position;
        voice["positionNorm"] = normalizedPosition;
        voice["speed"] = layer.speed;
        voice["reversed"] = layer.reversed;
        voice["volume"] = layer.volume;
        voice["muted"] = muted;
        voice["bars"] = bars;

        auto voiceParams = lua.create_table();
        voiceParams["speed"] = layer.speed;
        voiceParams["volume"] = layer.volume;
        voiceParams["mute"] = muted ? 1 : 0;
        voiceParams["reverse"] = layer.reversed ? 1 : 0;
        voiceParams["length"] = layer.length;
        voiceParams["position"] = normalizedPosition;
        voiceParams["bars"] = bars;
        voiceParams["state"] = layerStateString;
        voice["params"] = voiceParams;

        voices[i + 1] = voice;
    }

    state["params"] = params;
    state["voices"] = voices;

    // Ableton Link state
    auto linkState = lua.create_table();
    linkState["enabled"] = processor.isLinkEnabled();
    linkState["tempoSync"] = processor.isLinkTempoSyncEnabled();
    linkState["startStopSync"] = processor.isLinkStartStopSyncEnabled();
    linkState["peers"] = processor.getLinkNumPeers();
    linkState["playing"] = processor.isLinkPlaying();
    linkState["beat"] = processor.getLinkBeat();
    linkState["phase"] = processor.getLinkPhase();
    state["link"] = linkState;

    // Spectrum analysis data for visualization
    auto spectrum = processor.getSpectrumData();
    sol::table spectrumTable = lua.create_table();
    for (int i = 0; i < static_cast<int>(spectrum.size()); ++i) {
        spectrumTable[i + 1] = spectrum[static_cast<std::size_t>(i)];
    }
    state["spectrum"] = spectrumTable;

    lua["state"] = state;
}

// ============================================================================
// Value lookup
// ============================================================================

inline std::string getValueAtPath(const std::string& path,
                                  const BehaviorCoreProcessor& processor) {
    const auto values = buildSerializedStateMap(processor);
    const auto it = values.find(path);
    if (it == values.end()) {
        return {};
    }
    return it->second;
}

// ============================================================================
// Change detection helpers (pass mutex + cache map by reference)
// ============================================================================

inline bool hasPathChanged(const std::string& path,
                           const BehaviorCoreProcessor& processor,
                           std::mutex& cacheMutex,
                           const std::unordered_map<std::string, std::string>& cache) {
    const auto currentValue = getValueAtPath(path, processor);
    std::lock_guard<std::mutex> lock(cacheMutex);
    const auto it = cache.find(path);
    return it == cache.end() || it->second != currentValue;
}

inline std::vector<std::string> getChangedPathsAndUpdateCache(
    const BehaviorCoreProcessor& processor,
    std::mutex& cacheMutex,
    std::unordered_map<std::string, std::string>& cache) {
    const auto entries = buildSerializedStateEntries(processor);

    std::vector<std::string> changedPaths;
    changedPaths.reserve(entries.size());

    SerializedStateMap nextValues;
    nextValues.reserve(entries.size());

    std::lock_guard<std::mutex> lock(cacheMutex);
    for (const auto& entry : entries) {
        const auto& path = entry.first;
        const auto& value = entry.second;
        const auto it = cache.find(path);
        if (it == cache.end() || it->second != value) {
            changedPaths.push_back(path);
        }
        nextValues.emplace(path, value);
    }

    cache = std::move(nextValues);
    return changedPaths;
}

inline void updateChangeCache(
    const BehaviorCoreProcessor& processor,
    std::mutex& cacheMutex,
    std::unordered_map<std::string, std::string>& cache) {
    auto nextValues = buildSerializedStateMap(processor);
    std::lock_guard<std::mutex> lock(cacheMutex);
    cache = std::move(nextValues);
}

// ============================================================================
// Incremental Lua serialization
// ============================================================================

inline void serializeStateToLuaIncremental(
    sol::state& lua,
    const BehaviorCoreProcessor& processor,
    const std::vector<std::string>& changedPaths) {
    if (changedPaths.empty()) {
        return;
    }

    sol::object stateObj = lua["state"];
    if (!stateObj.valid() || !stateObj.is<sol::table>()) {
        serializeStateToLua(lua, processor);
        return;
    }

    sol::table state = stateObj.as<sol::table>();
    sol::table params = ensureLuaTable(lua, state, "params");
    sol::table voices = ensureLuaTable(lua, state, "voices");
    sol::table linkState = ensureLuaTable(lua, state, "link");

    for (const auto& path : changedPaths) {
        applyIncrementalStatePath(lua, state, params, voices, linkState, processor, path);
    }
}

} // namespace state_serialization
} // namespace manifold
