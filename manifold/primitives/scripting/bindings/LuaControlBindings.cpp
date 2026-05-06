#include "LuaControlBindings.h"

// sol2 requires Lua headers before inclusion
extern "C" {
#include <lauxlib.h>
#include <lua.h>
#include <lualib.h>
}

#define SOL_ALL_SAFETIES_ON 1
#include <sol/sol.hpp>

#include "../DSPPrimitiveWrappers.h"
#include "../ScriptableProcessor.h"
#include "../PrimitiveGraph.h"
#include "dsp/core/nodes/PartialData.h"
#include "dsp/core/nodes/PrimitiveNodes.h"
#include "dsp/core/nodes/PitchDetector.h"
#include "dsp/core/nodes/RetrospectiveCaptureNode.h"
#include "dsp/core/nodes/SineBankNode.h"
#include "dsp/core/graph/PrimitiveNode.h"
#include "../../ui/RuntimeNode.h"
#include "../../control/CommandParser.h"
#include "../../control/ControlServer.h"
#include "../../control/OSCEndpointRegistry.h"
#include "../../control/OSCServer.h"
#include "../../control/OSCPacketBuilder.h"
#include "../../control/OSCSettingsPersistence.h"
#include "../../control/OSCQuery.h"
#include "../../core/Settings.h"
#include "../../core/SystemPaths.h"
#include "../../video/VideoCaptureManager.h"
#include "../../video/VideoRetrospectiveCapture.h"
#include "../../video/VideoSampler.h"
#include "../../ml/MLPipeline.h"

#include <juce_core/juce_core.h>
#include <juce_gui_basics/juce_gui_basics.h>

#include <algorithm>
#include <cstdio>
#include <map>
#include <mutex>
#include <vector>
#include "imgui.h"
#include <atomic>
#include <unordered_map>
#include <unordered_set>
#include <set>
#include <string>

#include "../../shaders/ShaderEffectRegistry.h"
#include "../../shaders/UniformContract.h"
#include "../../sources/TextureSourceRegistry.h"

// Forward declarations for node access
namespace dsp_primitives {
class RetrospectiveCaptureNode;
}

namespace {

// Static factory functions to avoid sol2 lambda destruction issues
std::shared_ptr<dsp_primitives::LoopBufferWrapper> createLoopBuffer(int sizeSamples, int channels) {
    auto buf = std::make_shared<dsp_primitives::LoopBufferWrapper>();
    buf->setSize(sizeSamples, channels);
    return buf;
}

std::shared_ptr<dsp_primitives::PlayheadWrapper> createPlayhead(int length) {
    auto ph = std::make_shared<dsp_primitives::PlayheadWrapper>();
    ph->setLoopLength(length);
    return ph;
}

std::shared_ptr<dsp_primitives::CaptureBufferWrapper> createCaptureBuffer(int sizeSamples, int channels) {
    auto cap = std::make_shared<dsp_primitives::CaptureBufferWrapper>();
    cap->setSize(sizeSamples, channels);
    return cap;
}

std::shared_ptr<dsp_primitives::QuantizerWrapper> createQuantizer(double sampleRate) {
    auto q = std::make_shared<dsp_primitives::QuantizerWrapper>();
    q->setSampleRate(sampleRate);
    return q;
}

// Helper to extract C++ node from Lua table's __node field
template <typename NodeT>
std::shared_ptr<NodeT> extractNodeFromTable(const sol::table& table) {
    if (!table.valid()) return {};
    sol::object nodeObj = table["__node"];
    if (!nodeObj.valid()) return {};
    if (nodeObj.is<std::shared_ptr<NodeT>>()) {
        return nodeObj.as<std::shared_ptr<NodeT>>();
    }
    return {};
}

sol::table sampleAnalysisToLua(sol::state& lua,
                              const dsp_primitives::SampleAnalysis& analysis) {
    auto result = sol::table(lua, sol::create);
    result["midiNote"] = analysis.midiNote;
    result["frequency"] = analysis.frequency;
    result["confidence"] = analysis.confidence;
    result["pitchStability"] = analysis.pitchStability;
    result["isPercussive"] = analysis.isPercussive;
    result["reliable"] = analysis.isReliable;
    result["rms"] = analysis.rms;
    result["peak"] = analysis.peak;
    result["attackTimeMs"] = analysis.attackTimeMs;
    result["attackEndSample"] = analysis.attackEndSample;
    result["spectralCentroidHz"] = analysis.spectralCentroidHz;
    result["brightness"] = analysis.brightness;
    result["analysisStartSample"] = analysis.analysisStartSample;
    result["analysisEndSample"] = analysis.analysisEndSample;
    result["numSamples"] = analysis.numSamples;
    result["numChannels"] = analysis.numChannels;
    result["sampleRate"] = analysis.sampleRate;
    result["algorithm"] = analysis.algorithm;
    result["noteName"] = (analysis.frequency > 0.0f)
        ? dsp_primitives::PitchDetector::frequencyToNoteName(analysis.frequency)
        : std::string("--");
    return result;
}

struct CapturePeaksDebugStats {
    std::mutex mutex;
    uint64_t calls = 0;
    uint64_t totalBuckets = 0;
    uint64_t totalMicros = 0;
    std::unordered_map<std::string, uint64_t> callsByPath;
};

struct ScriptListEntry {
    std::string name;
    std::string path;
    std::string kind;
    std::string scope;
    std::string code;
};

struct ScriptListingCacheState {
    std::mutex mutex;
    bool uiValid = false;
    std::string uiSignature;
    std::vector<ScriptListEntry> uiEntries;
    uint64_t uiBuilds = 0;
    uint64_t uiHits = 0;

    bool dspValid = false;
    std::string dspSignature;
    std::vector<ScriptListEntry> dspEntries;
    uint64_t dspBuilds = 0;
    uint64_t dspHits = 0;
};

struct WaveformPeakCacheEntry {
    double cachedAtSeconds = 0.0;
    std::vector<float> peaks;
};

struct WaveformPeakCacheState {
    std::mutex mutex;
    std::unordered_map<std::string, WaveformPeakCacheEntry> entries;
    uint64_t hits = 0;
    uint64_t misses = 0;
    uint64_t stores = 0;
    uint64_t evictions = 0;
};

CapturePeaksDebugStats& capturePeaksDebugStats() {
    static CapturePeaksDebugStats stats;
    return stats;
}

ScriptListingCacheState& scriptListingCacheState() {
    static ScriptListingCacheState state;
    return state;
}

WaveformPeakCacheState& waveformPeakCacheState() {
    static WaveformPeakCacheState state;
    return state;
}

void invalidateScriptListingCaches() {
    auto& cache = scriptListingCacheState();
    std::lock_guard<std::mutex> lock(cache.mutex);
    cache.uiValid = false;
    cache.uiSignature.clear();
    cache.uiEntries.clear();
    cache.dspValid = false;
    cache.dspSignature.clear();
    cache.dspEntries.clear();
}

void invalidateWaveformPeakCache() {
    auto& cache = waveformPeakCacheState();
    std::lock_guard<std::mutex> lock(cache.mutex);
    cache.entries.clear();
}

void recordCapturePeaksCall(const std::string& path, int numBuckets, uint64_t elapsedMicros) {
    auto& stats = capturePeaksDebugStats();
    std::lock_guard<std::mutex> lock(stats.mutex);
    ++stats.calls;
    stats.totalBuckets += static_cast<uint64_t>(juce::jmax(0, numBuckets));
    stats.totalMicros += elapsedMicros;
    ++stats.callsByPath[path.empty() ? std::string("<empty>") : path];
}

std::vector<std::pair<std::string, uint64_t>> topCaptureEntries(const std::unordered_map<std::string, uint64_t>& source,
                                                                size_t limit = 12) {
    std::vector<std::pair<std::string, uint64_t>> out(source.begin(), source.end());
    std::sort(out.begin(), out.end(), [](const auto& a, const auto& b) {
        if (a.second != b.second) {
            return a.second > b.second;
        }
        return a.first < b.first;
    });
    if (out.size() > limit) {
        out.resize(limit);
    }
    return out;
}

sol::table pushTopEntriesTable(sol::state& lua,
                               const std::vector<std::pair<std::string, uint64_t>>& entries) {
    auto out = sol::table(lua, sol::create);
    for (size_t i = 0; i < entries.size(); ++i) {
        auto row = sol::table(lua, sol::create);
        row["key"] = entries[i].first;
        row["count"] = entries[i].second;
        out[i + 1] = row;
    }
    return out;
}

sol::table scriptListToLua(sol::state& lua,
                           const std::vector<ScriptListEntry>& entries) {
    auto result = sol::table(lua, sol::create);
    for (size_t i = 0; i < entries.size(); ++i) {
        const auto& src = entries[i];
        auto entry = sol::table(lua, sol::create);
        entry["name"] = src.name;
        entry["path"] = src.path;
        if (!src.kind.empty()) entry["kind"] = src.kind;
        if (!src.scope.empty()) entry["scope"] = src.scope;
        if (!src.code.empty()) entry["code"] = src.code;
        result[i + 1] = entry;
    }
    return result;
}

constexpr double kWaveformPeakCacheWindowSeconds = 1.0 / 30.0;
constexpr size_t kWaveformPeakCacheMaxEntries = 128;

double highResNowSeconds() {
    return juce::Time::highResolutionTicksToSeconds(juce::Time::getHighResolutionTicks());
}

std::string makeWaveformPeakCacheKey(const char* kind,
                                     const std::string& path,
                                     int a,
                                     int b,
                                     int c) {
    return std::string(kind) + "|" + path + "|" + std::to_string(a) + "|"
        + std::to_string(b) + "|" + std::to_string(c);
}

std::string makeWaveformPeakCacheKey(const char* kind,
                                     uintptr_t ptr,
                                     int a,
                                     int b,
                                     int c) {
    return std::string(kind) + "|" + std::to_string(ptr) + "|" + std::to_string(a)
        + "|" + std::to_string(b) + "|" + std::to_string(c);
}

std::string makeWaveformPeakCacheKey(const char* kind,
                                     int a,
                                     int b,
                                     int c) {
    return std::string(kind) + "|" + std::to_string(a) + "|" + std::to_string(b)
        + "|" + std::to_string(c);
}

bool tryGetWaveformPeakCache(const std::string& key,
                             std::vector<float>& outPeaks,
                             double maxAgeSeconds = kWaveformPeakCacheWindowSeconds) {
    auto& cache = waveformPeakCacheState();
    const double now = highResNowSeconds();
    std::lock_guard<std::mutex> lock(cache.mutex);
    auto it = cache.entries.find(key);
    if (it == cache.entries.end()) {
        ++cache.misses;
        return false;
    }
    if ((now - it->second.cachedAtSeconds) > maxAgeSeconds) {
        cache.entries.erase(it);
        ++cache.misses;
        return false;
    }
    outPeaks = it->second.peaks;
    ++cache.hits;
    return true;
}

void storeWaveformPeakCache(const std::string& key,
                            const std::vector<float>& peaks) {
    auto& cache = waveformPeakCacheState();
    const double now = highResNowSeconds();
    std::lock_guard<std::mutex> lock(cache.mutex);

    if (cache.entries.size() >= kWaveformPeakCacheMaxEntries
        && cache.entries.find(key) == cache.entries.end()) {
        auto oldestIt = cache.entries.begin();
        for (auto it = cache.entries.begin(); it != cache.entries.end(); ++it) {
            if (it->second.cachedAtSeconds < oldestIt->second.cachedAtSeconds) {
                oldestIt = it;
            }
        }
        if (oldestIt != cache.entries.end()) {
            cache.entries.erase(oldestIt);
            ++cache.evictions;
        }
    }

    cache.entries[key] = WaveformPeakCacheEntry{ now, peaks };
    ++cache.stores;
}

template <typename Loader>
bool getWaveformPeaksCached(const std::string& key,
                            std::vector<float>& outPeaks,
                            Loader&& loader,
                            double maxAgeSeconds = kWaveformPeakCacheWindowSeconds) {
    if (tryGetWaveformPeakCache(key, outPeaks, maxAgeSeconds)) {
        return true;
    }

    std::vector<float> freshPeaks;
    if (!loader(freshPeaks)) {
        return false;
    }

    outPeaks = freshPeaks;
    storeWaveformPeakCache(key, freshPeaks);
    return true;
}

sol::table partialDataToLua(sol::state& lua,
                           const dsp_primitives::PartialData& partials) {
    auto result = sol::table(lua, sol::create);
    result["activeCount"] = partials.activeCount;
    result["fundamental"] = partials.fundamental;
    result["inharmonicity"] = partials.inharmonicity;
    result["brightness"] = partials.brightness;
    result["rmsLevel"] = partials.rmsLevel;
    result["peakLevel"] = partials.peakLevel;
    result["attackTimeMs"] = partials.attackTimeMs;
    result["spectralCentroidHz"] = partials.spectralCentroidHz;
    result["analysisStartSample"] = partials.analysisStartSample;
    result["analysisEndSample"] = partials.analysisEndSample;
    result["numSamples"] = partials.numSamples;
    result["numChannels"] = partials.numChannels;
    result["sampleRate"] = partials.sampleRate;
    result["isPercussive"] = partials.isPercussive;
    result["reliable"] = partials.isReliable;
    result["algorithm"] = partials.algorithm;

    auto entries = sol::table(lua, sol::create);
    for (int i = 0; i < partials.activeCount && i < dsp_primitives::PartialData::kMaxPartials; ++i) {
        auto entry = sol::table(lua, sol::create);
        entry["index"] = i + 1;
        entry["harmonic"] = i + 1;
        entry["frequency"] = partials.frequencies[static_cast<size_t>(i)];
        entry["amplitude"] = partials.amplitudes[static_cast<size_t>(i)];
        entry["phase"] = partials.phases[static_cast<size_t>(i)];
        entry["decayRate"] = partials.decayRates[static_cast<size_t>(i)];
        entries[i + 1] = entry;
    }
    result["partials"] = entries;
    return result;
}

[[maybe_unused]] sol::table temporalPartialDataToLua(sol::state& lua,
                                    const dsp_primitives::TemporalPartialData& temporal) {
    auto result = sol::table(lua, sol::create);
    result["sampleRate"] = temporal.sampleRate;
    result["sampleLengthSeconds"] = temporal.sampleLengthSeconds;
    result["globalFundamental"] = temporal.globalFundamental;
    result["frameCount"] = temporal.frameCount;
    result["windowSize"] = temporal.windowSize;
    result["hopSize"] = temporal.hopSize;
    result["reliable"] = temporal.isReliable;

    auto frames = sol::table(lua, sol::create);
    auto frameTimes = sol::table(lua, sol::create);
    const int safeCount = std::min(temporal.frameCount,
                                   static_cast<int>(std::min(temporal.frames.size(), temporal.frameTimes.size())));
    for (int i = 0; i < safeCount; ++i) {
        frames[i + 1] = partialDataToLua(lua, temporal.frames[static_cast<size_t>(i)]);
        frameTimes[i + 1] = temporal.frameTimes[static_cast<size_t>(i)];
    }
    result["frames"] = frames;
    result["frameTimes"] = frameTimes;
    return result;
}

std::vector<float> harmonicWeightsFromLuaObject(const sol::object& harmonicsObj) {
    std::vector<float> weights;
    if (harmonicsObj.valid() && harmonicsObj.get_type() == sol::type::table) {
        sol::table t = harmonicsObj.as<sol::table>();
        for (int i = 1; i <= 32; ++i) {
            sol::object valueObj = t[i];
            if (!valueObj.valid() || !valueObj.is<double>()) {
                if (i == 1) {
                    continue;
                }
                break;
            }
            const float weight = static_cast<float>(valueObj.as<double>());
            weights.push_back(juce::jmax(0.0f, weight));
        }
    }

    if (weights.empty()) {
        weights.push_back(1.0f);
    }

    float sum = 0.0f;
    for (float weight : weights) {
        sum += juce::jmax(0.0f, weight);
    }
    if (sum <= 1.0e-6f) {
        weights.assign(1, 1.0f);
        sum = 1.0f;
    }

    for (float& weight : weights) {
        weight /= sum;
    }
    return weights;
}

juce::AudioBuffer<float> renderSineBankBuffer(const dsp_primitives::PartialData& partials,
                                              float targetFrequency,
                                              float amplitude,
                                              float sampleRate,
                                              int numSamples,
                                              float stereoSpread = 0.0f) {
    juce::AudioBuffer<float> buffer(2, juce::jmax(1, numSamples));
    buffer.clear();

    dsp_primitives::SineBankNode node;
    node.setPartials(partials);
    node.setFrequency(targetFrequency);
    node.setAmplitude(amplitude);
    node.setStereoSpread(stereoSpread);
    node.prepare(sampleRate, juce::jmax(1, numSamples));

    std::vector<dsp_primitives::AudioBufferView> inputs;
    std::vector<dsp_primitives::WritableAudioBufferView> outputs;
    outputs.emplace_back(buffer);
    node.process(inputs, outputs, buffer.getNumSamples());
    return buffer;
}

bool isUiScriptFile(const juce::File& script) {
    if (!script.existsAsFile()) return false;
    auto content = script.loadFileAsString();
    return content.contains("function ui_init");
}

bool isProjectManifestFile(const juce::File& file) {
    return file.existsAsFile() &&
           file.getFileName().equalsIgnoreCase("manifold.project.json5");
}

std::string normalizeUIRendererMode(const std::string& raw) {
    std::string mode;
    mode.reserve(raw.size());
    for (char ch : raw) {
        if (ch >= 'A' && ch <= 'Z') {
            mode.push_back(static_cast<char>(ch - 'A' + 'a'));
        } else {
            mode.push_back(ch == '_' ? '-' : ch);
        }
    }

    if (mode == "0" || mode == "off" || mode == "false") {
        return "canvas";
    }
    if (mode == "1" || mode == "on" || mode == "true" || mode == "imgui" || mode == "overlay") {
        return "imgui-overlay";
    }
    if (mode == "full" || mode == "replace" || mode == "imgui-full") {
        return "imgui-replace";
    }
    if (mode == "direct") {
        return "imgui-direct";
    }
    return mode;
}

bool isValidUIRendererMode(const std::string& mode) {
    return mode == "canvas"
        || mode == "imgui-overlay"
        || mode == "imgui-replace"
        || mode == "imgui-direct";
}

const char* uiRendererModeToString(int mode) {
    switch (mode) {
        case 1:
            return "imgui-overlay";
        case 2:
            return "imgui-replace";
        case 3:
            return "imgui-direct";
        case 0:
        default:
            return "canvas";
    }
}

juce::String readProjectDisplayName(const juce::File& manifestFile) {
    auto json = juce::JSON::parse(manifestFile);
    if (!json.isObject()) {
        return manifestFile.getParentDirectory().getFileName();
    }

    auto* obj = json.getDynamicObject();
    if (obj == nullptr) {
        return manifestFile.getParentDirectory().getFileName();
    }

    if (obj->hasProperty("name")) {
        auto name = obj->getProperty("name").toString();
        if (name.isNotEmpty()) {
            return name;
        }
    }

    return manifestFile.getParentDirectory().getFileName();
}

std::string currentUiScriptsSignature() {
    auto& settings = Settings::getInstance();
    return settings.getDevScriptsDir().toStdString() + "|"
        + settings.getUserScriptsDir().toStdString() + "|"
        + SystemPaths::getSystemProjectsDir().getFullPathName().toStdString();
}

std::string currentDspScriptsSignature() {
    return Settings::getInstance().getDspScriptsDir().toStdString();
}

std::vector<ScriptListEntry> scanUiScripts() {
    std::vector<ScriptListEntry> entries;
    std::set<std::string> seenPaths;

    auto addUiScriptEntry = [&](const juce::File& script,
                                const juce::String& displayName,
                                const juce::String& kind,
                                const juce::String& scope) {
        if (!script.exists()) return;
        const auto fullPath = script.getFullPathName().toStdString();
        if (seenPaths.count(fullPath) > 0) return;
        seenPaths.insert(fullPath);

        ScriptListEntry entry;
        entry.name = displayName.toStdString();
        entry.path = fullPath;
        entry.kind = kind.toStdString();
        entry.scope = scope.toStdString();
        entries.push_back(std::move(entry));
    };

    auto addLooseUiScriptsFromDir = [&](const juce::File& dir,
                                        const juce::String& scope) {
        if (!dir.isDirectory()) return;
        auto scripts = dir.findChildFiles(juce::File::findFiles, false, "*.lua");
        for (const auto& script : scripts) {
            auto name = script.getFileNameWithoutExtension();

            if (name == "ui_widgets" || name == "ui_shell" ||
                name == "project_loader" || name == "empty_launcher") {
                continue;
            }
            if (!isUiScriptFile(script)) {
                continue;
            }

            addUiScriptEntry(script, name, "script", scope);
        }
    };

    auto addProjectsFromDir = [&](const juce::File& dir) {
        if (!dir.isDirectory()) return;
        auto children = dir.findChildFiles(juce::File::findDirectories, false);
        for (const auto& child : children) {
            const auto manifest = child.getChildFile("manifold.project.json5");
            if (!isProjectManifestFile(manifest)) {
                continue;
            }

            auto name = readProjectDisplayName(manifest);
            addUiScriptEntry(manifest, name, "project", "project");
        }
    };

    auto& settings = Settings::getInstance();

    auto devDir = settings.getDevScriptsDir();
    if (devDir.isNotEmpty()) {
        addLooseUiScriptsFromDir(juce::File(devDir), "system");
    } else {
        std::fprintf(stderr,
                     "[LuaControlBindings] listUiScripts: devScriptsDir is empty\n");
    }

    auto systemProjectsDir = SystemPaths::getSystemProjectsDir();
    if (systemProjectsDir.isDirectory()) {
        addProjectsFromDir(systemProjectsDir);
    }

    auto userRoot = settings.getUserScriptsDir();
    if (userRoot.isNotEmpty()) {
        juce::File root(userRoot);
        addProjectsFromDir(root.getChildFile("projects"));
        addLooseUiScriptsFromDir(root.getChildFile("ui"), "user");
        addLooseUiScriptsFromDir(root.getChildFile("UI"), "user-legacy");
        addProjectsFromDir(root);
    }

    return entries;
}

std::vector<ScriptListEntry> scanDspScripts() {
    std::vector<ScriptListEntry> entries;
    std::set<std::string> seenNames;

    auto addScriptsFromDir = [&](const juce::File& dir) {
        if (!dir.isDirectory()) return;
        auto scripts = dir.findChildFiles(juce::File::findFiles, false, "*.lua");
        for (const auto& script : scripts) {
            auto name = script.getFileNameWithoutExtension().toStdString();
            if (seenNames.count(name) > 0) continue;

            auto content = script.loadFileAsString();
            if (!content.contains("function buildPlugin")) {
                continue;
            }

            seenNames.insert(name);
            ScriptListEntry entry;
            entry.name = name;
            entry.path = script.getFullPathName().toStdString();
            entry.code = content.toStdString();
            entries.push_back(std::move(entry));
        }
    };

    auto& settings = Settings::getInstance();
    auto dspDir = settings.getDspScriptsDir();
    if (dspDir.isNotEmpty()) {
        const juce::File baseDir(dspDir);
        addScriptsFromDir(baseDir);
        addScriptsFromDir(baseDir.getChildFile("scripts"));
    } else {
        std::fprintf(stderr,
                     "[LuaControlBindings] listDspScripts: dspScriptsDir is empty\n");
    }

    return entries;
}

} // namespace

// ============================================================================
// Binding Registration
// ============================================================================

void LuaControlBindings::registerBindings(LuaCoreEngine& engine,
                                          ILuaControlState& state) {
    auto& lua = engine.getLuaState();

    registerCommandBindings(lua, state);
    registerWaveformBindings(lua, state);
    registerDspBindings(lua, state);
    // Skip graph bindings for export plugins to avoid sol2 usertype double-free
    if (auto* processor = state.getProcessor()) {
        if (!processor->isExportPlugin()) {
            registerGraphBindings(lua, state);
        }
    }
    registerOSCBindings(lua, state);
    registerEventBindings(lua, state);
    registerLinkBindings(lua, state);
    registerUtilityBindings(lua, state);
    registerMidiBindings(lua, state);
}

void LuaControlBindings::registerCommandBindings(sol::state& lua,
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

void LuaControlBindings::registerWaveformBindings(sol::state& lua,
                                                  ILuaControlState& state) {
    lua["getLayerPeaks"] = [&state, &lua](int layerIdx, int numBuckets) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor || numBuckets <= 0) return result;

        std::vector<float> peaks;
        const auto key = makeWaveformPeakCacheKey("layer", layerIdx, numBuckets, 0);
        if (!getWaveformPeaksCached(key, peaks, [&](std::vector<float>& out) {
                return processor->computeLayerPeaks(layerIdx, numBuckets, out);
            })) {
            return result;
        }
        for (size_t i = 0; i < peaks.size(); ++i) {
            result[i + 1] = peaks[i];
        }
        return result;
    };

    lua["getLayerPeaksForPath"] = [&state, &lua](const std::string& pathBase,
                                           int layerIdx,
                                           int numBuckets) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor || numBuckets <= 0) return result;

        std::vector<float> peaks;
        const auto key = makeWaveformPeakCacheKey("layer-path", pathBase, layerIdx, numBuckets, 0);
        if (!getWaveformPeaksCached(key, peaks, [&](std::vector<float>& out) {
                return processor->computeLayerPeaksForPath(pathBase, layerIdx, numBuckets, out);
            })) {
            return result;
        }
        for (size_t i = 0; i < peaks.size(); ++i) {
            result[i + 1] = peaks[i];
        }
        return result;
    };

    lua["getCapturePeaks"] = [&state, &lua](int startAgo, int endAgo,
                                      int numBuckets) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor || numBuckets <= 0) return result;

        std::vector<float> peaks;
        const auto key = makeWaveformPeakCacheKey("capture", startAgo, endAgo, numBuckets);
        if (!getWaveformPeaksCached(key, peaks, [&](std::vector<float>& out) {
                return processor->computeCapturePeaks(startAgo, endAgo, numBuckets, out);
            })) {
            return result;
        }
        for (size_t i = 0; i < peaks.size(); ++i) {
            result[i + 1] = peaks[i];
        }
        return result;
    };

    // Get synth sample peaks for oscillator visualization in sample mode
    lua["getSynthSamplePeaks"] = [&state, &lua](int numBuckets) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor || numBuckets <= 0) return result;

        std::vector<float> peaks;
        const auto key = makeWaveformPeakCacheKey("synth-sample", numBuckets, 0, 0);
        if (!getWaveformPeaksCached(key, peaks, [&](std::vector<float>& out) {
                return processor->computeSynthSamplePeaks(numBuckets, out);
            })) {
            return result;
        }
        for (size_t i = 0; i < peaks.size(); ++i) {
            result[i + 1] = peaks[i];
        }
        return result;
    };

    lua["getDynamicSampleSlotPeaks"] = [&state, &lua](int slotIndex, int numBuckets) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor || slotIndex <= 0 || numBuckets <= 0) return result;

        std::vector<float> peaks;
        const auto key = makeWaveformPeakCacheKey("dynamic-sample", slotIndex, numBuckets, 0);
        if (!getWaveformPeaksCached(key, peaks, [&](std::vector<float>& out) {
                return processor->computeDynamicSamplePeaks(slotIndex, numBuckets, out);
            })) {
            return result;
        }
        for (size_t i = 0; i < peaks.size(); ++i) {
            result[i + 1] = peaks[i];
        }
        return result;
    };

    lua["invalidateWaveformPeakCache"] = []() {
        invalidateWaveformPeakCache();
    };

    lua["getWaveformPeakCacheStats"] = [&lua](sol::optional<bool> resetOpt) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto& cache = waveformPeakCacheState();
        std::lock_guard<std::mutex> lock(cache.mutex);
        result["entries"] = static_cast<int>(cache.entries.size());
        result["hits"] = cache.hits;
        result["misses"] = cache.misses;
        result["stores"] = cache.stores;
        result["evictions"] = cache.evictions;
        if (resetOpt.value_or(false)) {
            cache.hits = 0;
            cache.misses = 0;
            cache.stores = 0;
            cache.evictions = 0;
        }
        return result;
    };

    // Get sample playback positions for all voices (indexed by voice)
    lua["getVoiceSamplePositions"] = [&state, &lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor) return result;

        auto positions = processor->getVoiceSamplePositions();
        for (size_t i = 0; i < positions.size(); ++i) {
            result[i + 1] = positions[i];
        }
        return result;
    };

    lua["getDynamicSampleSlotVoicePositions"] = [&state, &lua](int slotIndex) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor || slotIndex <= 0) return result;

        auto positions = processor->getDynamicSampleVoicePositions(slotIndex);
        for (size_t i = 0; i < positions.size(); ++i) {
            result[i + 1] = positions[i];
        }
        return result;
    };

    // Get latest captured-sample analysis metadata from the DSP script host.
    lua["getLatestSampleAnalysis"] = [&state, &lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor) return result;

        dsp_primitives::SampleAnalysis analysis;
        if (!processor->getLatestSampleAnalysis(analysis)) {
            return result;
        }
        return sampleAnalysisToLua(lua, analysis);
    };

    // Get latest captured-sample partial extraction data from the DSP script host.
    lua["getLatestSamplePartials"] = [&state, &lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor) return result;

        dsp_primitives::PartialData partials;
        if (!processor->getLatestSamplePartials(partials)) {
            return result;
        }
        return partialDataToLua(lua, partials);
    };

    // Get hidden sample-derived additive debug state from the DSP script host.
    lua["getSampleDerivedAdditiveDebug"] = [&state, &lua](sol::optional<int> voiceIndexOpt) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor) return result;

        SampleDerivedAdditiveDebugState debugState;
        if (!processor->getSampleDerivedAdditiveDebug(voiceIndexOpt.value_or(1), debugState)) {
            return result;
        }

        result["enabled"] = debugState.enabled;
        result["ready"] = debugState.ready;
        result["mix"] = debugState.mix;
        result["voiceAmp"] = debugState.voiceAmp;
        result["gate"] = debugState.gate;
        result["targetFrequency"] = debugState.targetFrequency;
        result["busMix"] = debugState.busMix;
        result["activeCount"] = debugState.activeCount;
        result["fundamental"] = debugState.fundamental;
        result["referenceNote"] = debugState.referenceNote;
        result["blendSampleSpeed"] = debugState.blendSampleSpeed;
        result["addCrossfadePosition"] = debugState.addCrossfadePosition;
        result["addBranchGain"] = debugState.addBranchGain;
        result["sampleAdditiveGain"] = debugState.sampleAdditiveGain;
        result["branchGain1"] = debugState.branchGain1;
        result["branchGain2"] = debugState.branchGain2;
        result["branchGain3"] = debugState.branchGain3;
        result["waveform"] = debugState.waveform;
        result["waveFrequency"] = debugState.waveFrequency;
        return result;
    };

    // Force a refresh of the hidden sample-derived additive state and return the result.
    lua["refreshSampleDerivedAdditiveDebug"] = [&state, &lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor) return result;

        SampleDerivedAdditiveDebugState debugState;
        if (!processor->refreshSampleDerivedAdditiveDebug(debugState)) {
            return result;
        }

        result["enabled"] = debugState.enabled;
        result["ready"] = debugState.ready;
        result["mix"] = debugState.mix;
        result["voiceAmp"] = debugState.voiceAmp;
        result["gate"] = debugState.gate;
        result["targetFrequency"] = debugState.targetFrequency;
        result["busMix"] = debugState.busMix;
        result["activeCount"] = debugState.activeCount;
        result["fundamental"] = debugState.fundamental;
        result["referenceNote"] = debugState.referenceNote;
        result["blendSampleSpeed"] = debugState.blendSampleSpeed;
        result["addCrossfadePosition"] = debugState.addCrossfadePosition;
        result["addBranchGain"] = debugState.addBranchGain;
        result["sampleAdditiveGain"] = debugState.sampleAdditiveGain;
        result["branchGain1"] = debugState.branchGain1;
        result["branchGain2"] = debugState.branchGain2;
        result["branchGain3"] = debugState.branchGain3;
        result["waveform"] = debugState.waveform;
        result["waveFrequency"] = debugState.waveFrequency;
        return result;
    };

    // Deterministic test helper: inject a synthetic harmonic tone directly into
    // the named MidiSynth sample playback node and immediately return analysis.
    lua["injectSynthSampleTestTone"] = [&state, &lua](double fundamentalHz,
                                                        double durationSeconds,
                                                        sol::optional<double> amplitudeOpt,
                                                        sol::optional<sol::object> harmonicsOpt) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor) {
            result["ok"] = false;
            result["error"] = "no processor";
            return result;
        }

        auto node = processor->getGraphNodeByPath("/midi/synth/sample/playback");
        auto playback = std::dynamic_pointer_cast<dsp_primitives::SampleRegionPlaybackNode>(node);
        if (!playback) {
            result["ok"] = false;
            result["error"] = "sample playback node not found";
            return result;
        }

        const float sampleRate = static_cast<float>(processor->getSampleRate() > 0.0
            ? processor->getSampleRate()
            : 44100.0);
        const float freq = juce::jlimit(20.0f, 8000.0f, static_cast<float>(fundamentalHz));
        const float seconds = juce::jlimit(0.02f, 5.0f, static_cast<float>(durationSeconds));
        const float amplitude = juce::jlimit(0.0f, 1.0f,
            static_cast<float>(amplitudeOpt.value_or(0.8)));
        const int numSamples = juce::jmax(1, static_cast<int>(std::round(seconds * sampleRate)));
        const int channels = 2;

        const auto weights = harmonicsOpt.has_value()
            ? harmonicWeightsFromLuaObject(harmonicsOpt.value())
            : std::vector<float>{1.0f};
        juce::AudioBuffer<float> buffer(channels, numSamples);
        buffer.clear();

        const float fadeSamples = static_cast<float>(juce::jmin(numSamples / 2, 128));
        for (int i = 0; i < numSamples; ++i) {
            float sample = 0.0f;
            const double t = static_cast<double>(i) / static_cast<double>(sampleRate);
            for (size_t h = 0; h < weights.size(); ++h) {
                const double harmonic = static_cast<double>(h + 1);
                const double phase = juce::MathConstants<double>::twoPi * static_cast<double>(freq) * harmonic * t;
                sample += weights[h] * std::sin(phase);
            }

            float env = 1.0f;
            if (fadeSamples > 1.0f) {
                if (static_cast<float>(i) < fadeSamples) {
                    env *= static_cast<float>(i) / fadeSamples;
                }
                const float tail = static_cast<float>(numSamples - 1 - i);
                if (tail < fadeSamples) {
                    env *= tail / fadeSamples;
                }
            }

            const float out = juce::jlimit(-1.0f, 1.0f, sample * amplitude * env);
            for (int ch = 0; ch < channels; ++ch) {
                buffer.setSample(ch, i, out);
            }
        }

        playback->copyFromCaptureBuffer(buffer, numSamples, 0, numSamples, false);
        playback->stop();
        const auto analysis = playback->analyzeSample();
        const auto partials = playback->getLastPartials();

        result["ok"] = true;
        result["requestedFundamental"] = freq;
        result["durationSeconds"] = seconds;
        result["harmonicCount"] = static_cast<int>(weights.size());
        result["analysis"] = sampleAnalysisToLua(lua, analysis);
        result["partials"] = partialDataToLua(lua, partials);
        return result;
    };

    // Deterministic non-pitched test helper: inject filtered noise into the synth sample
    // playback node so we can verify that partial/temporal extraction still works when
    // pitch detection is unreliable or absent.
    lua["injectSynthSampleTestNoise"] = [&state, &lua](double durationSeconds,
                                                         sol::optional<double> amplitudeOpt,
                                                         sol::optional<double> colorOpt) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor) {
            result["ok"] = false;
            result["error"] = "no processor";
            return result;
        }

        auto node = processor->getGraphNodeByPath("/midi/synth/sample/playback");
        auto playback = std::dynamic_pointer_cast<dsp_primitives::SampleRegionPlaybackNode>(node);
        if (!playback) {
            result["ok"] = false;
            result["error"] = "sample playback node not found";
            return result;
        }

        const float sampleRate = static_cast<float>(processor->getSampleRate() > 0.0
            ? processor->getSampleRate()
            : 44100.0);
        const float seconds = juce::jlimit(0.02f, 5.0f, static_cast<float>(durationSeconds));
        const float amplitude = juce::jlimit(0.0f, 1.0f,
            static_cast<float>(amplitudeOpt.value_or(0.8)));
        const float color = juce::jlimit(0.0f, 1.0f,
            static_cast<float>(colorOpt.value_or(0.65)));
        const int numSamples = juce::jmax(1, static_cast<int>(std::round(seconds * sampleRate)));
        const int channels = 2;

        juce::AudioBuffer<float> buffer(channels, numSamples);
        buffer.clear();
        juce::Random rng(0x5EED1234);
        float lowStateL = 0.0f;
        float lowStateR = 0.0f;
        const float alpha = juce::jlimit(0.001f, 0.999f, 0.02f + color * 0.18f);
        const float fadeSamples = static_cast<float>(juce::jmin(numSamples / 2, 128));

        for (int i = 0; i < numSamples; ++i) {
            const float whiteL = rng.nextFloat() * 2.0f - 1.0f;
            const float whiteR = rng.nextFloat() * 2.0f - 1.0f;
            lowStateL += (whiteL - lowStateL) * alpha;
            lowStateR += (whiteR - lowStateR) * alpha;
            float sampleL = whiteL + (lowStateL - whiteL) * color;
            float sampleR = whiteR + (lowStateR - whiteR) * color;

            float env = 1.0f;
            if (fadeSamples > 1.0f) {
                if (static_cast<float>(i) < fadeSamples) {
                    env *= static_cast<float>(i) / fadeSamples;
                }
                const float tail = static_cast<float>(numSamples - 1 - i);
                if (tail < fadeSamples) {
                    env *= tail / fadeSamples;
                }
            }

            buffer.setSample(0, i, juce::jlimit(-1.0f, 1.0f, sampleL * amplitude * env));
            buffer.setSample(1, i, juce::jlimit(-1.0f, 1.0f, sampleR * amplitude * env));
        }

        playback->copyFromCaptureBuffer(buffer, numSamples, 0, numSamples, false);
        playback->stop();
        const auto analysis = playback->analyzeSample();
        const auto partials = playback->extractPartials();
        const auto temporal = playback->extractTemporalPartials(24, 1024, 256, 64);

        result["ok"] = true;
        result["durationSeconds"] = seconds;
        result["amplitude"] = amplitude;
        result["color"] = color;
        result["analysis"] = sampleAnalysisToLua(lua, analysis);
        result["partials"] = partialDataToLua(lua, partials);
        auto temporalTable = sol::table(lua, sol::create);
        temporalTable["frameCount"] = temporal.frameCount;
        temporalTable["globalFundamental"] = temporal.globalFundamental;
        temporalTable["reliable"] = temporal.isReliable;
        temporalTable["sampleLengthSeconds"] = temporal.sampleLengthSeconds;
        result["temporal"] = temporalTable;
        return result;
    };

    // Deterministic Stage 4 helper: render the latest extracted sample partials
    // through SineBankNode, inject the rendered buffer back into sample playback,
    // then return the re-analysis so we can verify the additive consumer path.
    lua["renderLatestSamplePartialsThroughSineBank"] = [&state, &lua](sol::optional<double> targetFrequencyOpt,
                                                                       sol::optional<double> durationSecondsOpt,
                                                                       sol::optional<double> amplitudeOpt,
                                                                       sol::optional<double> stereoSpreadOpt) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor) {
            result["ok"] = false;
            result["error"] = "no processor";
            return result;
        }

        auto node = processor->getGraphNodeByPath("/midi/synth/sample/playback");
        auto playback = std::dynamic_pointer_cast<dsp_primitives::SampleRegionPlaybackNode>(node);
        if (!playback) {
            result["ok"] = false;
            result["error"] = "sample playback node not found";
            return result;
        }

        dsp_primitives::PartialData sourcePartials;
        if (!processor->getLatestSamplePartials(sourcePartials) || sourcePartials.activeCount <= 0 || sourcePartials.fundamental <= 0.0f) {
            result["ok"] = false;
            result["error"] = "no usable sample partials available";
            return result;
        }

        const float sampleRate = static_cast<float>(processor->getSampleRate() > 0.0
            ? processor->getSampleRate()
            : 44100.0);
        const float targetFrequency = juce::jlimit(20.0f, 8000.0f,
            static_cast<float>(targetFrequencyOpt.value_or(sourcePartials.fundamental)));
        const float durationSeconds = juce::jlimit(0.02f, 5.0f,
            static_cast<float>(durationSecondsOpt.value_or(1.0)));
        const float amplitude = juce::jlimit(0.0f, 1.0f,
            static_cast<float>(amplitudeOpt.value_or(0.8)));
        const float stereoSpread = juce::jlimit(0.0f, 1.0f,
            static_cast<float>(stereoSpreadOpt.value_or(0.0)));
        const int numSamples = juce::jmax(1, static_cast<int>(std::round(durationSeconds * sampleRate)));

        juce::AudioBuffer<float> rendered = renderSineBankBuffer(sourcePartials,
                                                                 targetFrequency,
                                                                 amplitude,
                                                                 sampleRate,
                                                                 numSamples,
                                                                 stereoSpread);

        playback->copyFromCaptureBuffer(rendered, numSamples, 0, numSamples, false);
        playback->stop();
        const auto analysis = playback->analyzeSample();
        const auto renderedPartials = playback->getLastPartials();

        result["ok"] = true;
        result["requestedFrequency"] = targetFrequency;
        result["durationSeconds"] = durationSeconds;
        result["sourcePartials"] = partialDataToLua(lua, sourcePartials);
        result["analysis"] = sampleAnalysisToLua(lua, analysis);
        result["partials"] = partialDataToLua(lua, renderedPartials);
        return result;
    };

    // Get capture peaks from a specific RetrospectiveCaptureNode (for wet capture visualization)
    lua["getNodeCapturePeaks"] = [&lua](sol::table captureNodeTable, int startAgo, int endAgo,
                                        int numBuckets) -> sol::table {
        auto result = sol::table(lua, sol::create);
        if (numBuckets <= 0) return result;

        auto node = extractNodeFromTable<dsp_primitives::RetrospectiveCaptureNode>(captureNodeTable);
        if (!node) return result;

        std::vector<float> peaks;
        const auto key = makeWaveformPeakCacheKey("capture-node",
                                                  reinterpret_cast<uintptr_t>(node.get()),
                                                  startAgo,
                                                  endAgo,
                                                  numBuckets);
        if (!getWaveformPeaksCached(key, peaks, [&](std::vector<float>& out) {
                out = node->computePeaks(startAgo, endAgo, numBuckets);
                return true;
            })) {
            return result;
        }
        for (size_t i = 0; i < peaks.size(); ++i) {
            result[i + 1] = peaks[i];
        }
        return result;
    };

    // Generic access to DSP graph nodes by path from UI context
    lua["getGraphNodeByPath"] = [&state](const std::string& path) -> sol::table {
        auto result = sol::table();
        auto* processor = state.getProcessor();
        if (!processor || path.empty()) return result;

        auto node = processor->getGraphNodeByPath(path);
        if (!node) return result;

        // Return table with __node field for use with getNodeCapturePeaks
        result["__node"] = node;
        return result;
    };

    lua["ensureDynamicModuleSlot"] = [&state](const std::string& specId, int slotIndex) -> bool {
        auto* processor = state.getProcessor();
        if (!processor || specId.empty() || slotIndex <= 0) {
            return false;
        }
        return processor->ensureDynamicModuleSlot(specId, slotIndex);
    };

    lua["getGraphNodeDebugByPath"] = [&state, &lua](const std::string& path) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor || path.empty()) return result;

        auto node = processor->getGraphNodeByPath(path);
        if (!node) return result;

        result["path"] = path;
        result["nodeType"] = std::string(node->getNodeType());
        result["numInputs"] = node->getNumInputs();
        result["numOutputs"] = node->getNumOutputs();

        if (auto sine = std::dynamic_pointer_cast<dsp_primitives::SineBankNode>(node)) {
            result["enabled"] = sine->isEnabled();
            result["amplitude"] = sine->getAmplitude();
            result["frequency"] = sine->getFrequency();
            result["activePartialCount"] = sine->getActivePartialCount();
            result["referenceFundamental"] = sine->getReferenceFundamental();
            result["unison"] = sine->getUnison();
            result["detune"] = sine->getDetune();
            result["drive"] = sine->getDrive();
            result["driveShape"] = sine->getDriveShape();
            result["driveBias"] = sine->getDriveBias();
            result["driveMix"] = sine->getDriveMix();
            return result;
        }

        if (auto osc = std::dynamic_pointer_cast<dsp_primitives::OscillatorNode>(node)) {
            result["enabled"] = osc->isEnabled();
            result["amplitude"] = osc->getAmplitude();
            result["frequency"] = osc->getFrequency();
            result["waveform"] = osc->getWaveform();
            result["renderMode"] = osc->getRenderMode();
            result["pulseWidth"] = osc->getPulseWidth();
            result["unison"] = osc->getUnison();
            result["detune"] = osc->getDetune();
            result["spread"] = osc->getSpread();
            return result;
        }

        if (auto gain = std::dynamic_pointer_cast<dsp_primitives::GainNode>(node)) {
            result["gain"] = gain->getGain();
            result["muted"] = gain->isMuted();
            return result;
        }

        if (auto cross = std::dynamic_pointer_cast<dsp_primitives::CrossfaderNode>(node)) {
            result["position"] = cross->getPosition();
            result["curve"] = cross->getCurve();
            result["mix"] = cross->getMix();
            return result;
        }

        if (auto mixer = std::dynamic_pointer_cast<dsp_primitives::MixerNode>(node)) {
            result["inputCount"] = mixer->getInputCount();
            result["master"] = mixer->getMaster();
            for (int i = 1; i <= mixer->getInputCount(); ++i) {
                result[std::string("gain") + std::to_string(i)] = mixer->getGain(i);
                result[std::string("pan") + std::to_string(i)] = mixer->getPan(i);
            }
            return result;
        }

        const std::string nodeType = std::string(node->getNodeType());

        if (nodeType == "Allpass") {
            auto allpass = std::static_pointer_cast<dsp_primitives::AllpassNode>(node);
            result["maxDelay"] = allpass->getMaxDelay();
            result["delay"] = allpass->getDelay();
            result["gain"] = allpass->getGain();
            return result;
        }

        if (nodeType == "Resonator") {
            auto resonator = std::static_pointer_cast<dsp_primitives::ResonatorNode>(node);
            result["gain"] = resonator->getGain();
            result["frequency"] = resonator->getFrequency();
            result["q"] = resonator->getQ();
            return result;
        }

        if (nodeType == "Comb") {
            auto comb = std::static_pointer_cast<dsp_primitives::CombNode>(node);
            result["maxDelay"] = comb->getMaxDelay();
            result["delay"] = comb->getDelay();
            result["gain"] = comb->getGain();
            result["feedforward"] = comb->getFeedforward();
            result["feedback"] = comb->getFeedback();
            return result;
        }

        if (nodeType == "SlewLimiter") {
            auto slew = std::static_pointer_cast<dsp_primitives::SlewLimiterNode>(node);
            result["slideUp"] = slew->getSlideUp();
            result["slideDown"] = slew->getSlideDown();
            return result;
        }

        if (nodeType == "ConstantSignal") {
            auto constant = std::static_pointer_cast<dsp_primitives::ConstantSignalNode>(node);
            result["value"] = constant->getValue();
            return result;
        }

        if (nodeType == "EnvelopeFollower") {
            auto env = std::static_pointer_cast<dsp_primitives::EnvelopeFollowerNode>(node);
            result["attack"] = env->getAttack();
            result["release"] = env->getRelease();
            result["sensitivity"] = env->getSensitivity();
            result["highpass"] = env->getHighpass();
            result["mode"] = env->getMode();
            result["envelope"] = env->getEnvelope();
            return result;
        }

        if (nodeType == "SpectrumAnalyzer") {
            auto spectrum = std::static_pointer_cast<dsp_primitives::SpectrumAnalyzerNode>(node);
            result["band1"] = spectrum->getBand1();
            result["band2"] = spectrum->getBand2();
            result["band3"] = spectrum->getBand3();
            result["band4"] = spectrum->getBand4();
            result["band5"] = spectrum->getBand5();
            result["band6"] = spectrum->getBand6();
            result["band7"] = spectrum->getBand7();
            result["band8"] = spectrum->getBand8();
            result["sensitivity"] = spectrum->getSensitivity();
            result["smoothing"] = spectrum->getSmoothing();
            result["floor"] = spectrum->getFloor();
            return result;
        }

        return result;
    };

    // Generic capture peaks from any capture node path in the DSP graph
    // This is THE function for visualization - always returns the signal at that point
    lua["getCapturePeaksAtPath"] = [&state, &lua](const std::string& path, int startAgo, int endAgo,
                                                   int numBuckets) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor || numBuckets <= 0 || path.empty()) return result;

        // Get the node at the specified path
        auto node = processor->getGraphNodeByPath(path);
        if (!node) {
            // Node not found - maybe the graph isn't loaded yet
            return result;
        }

        // Cast to capture node and get peaks
        auto* captureNode = dynamic_cast<dsp_primitives::RetrospectiveCaptureNode*>(node.get());
        if (!captureNode) {
            // Not a capture node - can't get peaks
            return result;
        }

        std::vector<float> peaks;
        const auto key = makeWaveformPeakCacheKey("capture-path", path, startAgo, endAgo, numBuckets);
        const auto startTicks = juce::Time::getHighResolutionTicks();
        if (!getWaveformPeaksCached(key, peaks, [&](std::vector<float>& out) {
                out = captureNode->computePeaks(startAgo, endAgo, numBuckets);
                return true;
            })) {
            return result;
        }
        const auto elapsedMicros = static_cast<uint64_t>(juce::Time::highResolutionTicksToSeconds(
            juce::Time::getHighResolutionTicks() - startTicks) * 1000000.0);
        recordCapturePeaksCall(path, numBuckets, elapsedMicros);
        for (size_t i = 0; i < peaks.size(); ++i) {
            result[i + 1] = peaks[i];
        }
        return result;
    };

    lua["getSampleRegionPeaksAtPath"] = [&state, &lua](const std::string& path,
                                                        int numBuckets) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor || path.empty() || numBuckets <= 0) return result;

        auto node = processor->getGraphNodeByPath(path);
        auto playback = std::dynamic_pointer_cast<dsp_primitives::SampleRegionPlaybackNode>(node);
        if (!playback) return result;

        std::vector<float> peaks;
        const auto key = makeWaveformPeakCacheKey("sample-region-path", path, numBuckets, 0, 0);
        if (!getWaveformPeaksCached(key, peaks, [&](std::vector<float>& out) {
                out = playback->getPeaks(numBuckets);
                return true;
            }, 0.25)) {
            return result;
        }

        for (size_t i = 0; i < peaks.size(); ++i) {
            result[i + 1] = peaks[i];
        }
        return result;
    };

    lua["loadSampleRegionFileAtPath"] = [&state](const std::string& nodePath,
                                                   const std::string& filePath) -> bool {
        auto* processor = state.getProcessor();
        if (!processor || nodePath.empty() || filePath.empty()) return false;

        auto node = processor->getGraphNodeByPath(nodePath);
        auto playback = std::dynamic_pointer_cast<dsp_primitives::SampleRegionPlaybackNode>(node);
        if (!playback) return false;

        const bool ok = playback->loadFile(juce::File(filePath));
        if (ok) {
            invalidateWaveformPeakCache();
        }
        return ok;
    };

    lua["loadGranulatorFileAtPath"] = [&state](const std::string& nodePath,
                                                const std::string& filePath) -> bool {
        auto* processor = state.getProcessor();
        if (!processor || nodePath.empty() || filePath.empty()) return false;

        auto node = processor->getGraphNodeByPath(nodePath);
        auto granulator = std::dynamic_pointer_cast<dsp_primitives::GranulatorNode>(node);
        if (!granulator) return false;

        return granulator->loadFile(juce::File(filePath));
    };

    lua["getGranulatorGrainPositionsAtPath"] = [&state, &lua](const std::string& path) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        if (!processor || path.empty()) return result;
        auto node = processor->getGraphNodeByPath(path);
        auto granulator = std::dynamic_pointer_cast<dsp_primitives::GranulatorNode>(node);
        if (!granulator) return result;
        const auto positions = granulator->getActiveGrainPositions();
        for (size_t i = 0; i < positions.size(); ++i) {
            result[i + 1] = positions[i];
        }
        return result;
    };

    lua["getSampleRegionPlaybackPosition"] = [&state](const std::string& path) -> float {
        auto* processor = state.getProcessor();
        if (!processor || path.empty()) return 0.0f;
        auto node = processor->getGraphNodeByPath(path);
        auto playback = std::dynamic_pointer_cast<dsp_primitives::SampleRegionPlaybackNode>(node);
        if (!playback) return 0.0f;
        return playback->getNormalizedPosition();
    };

    lua["getSampleRegionPlaybackLoopAwarePosition"] = [&state](const std::string& path) -> float {
        auto* processor = state.getProcessor();
        if (!processor || path.empty()) return 0.0f;
        auto node = processor->getGraphNodeByPath(path);
        auto playback = std::dynamic_pointer_cast<dsp_primitives::SampleRegionPlaybackNode>(node);
        if (!playback) return 0.0f;
        return playback->getLoopAwarePosition();
    };

    lua["isSampleRegionPlaybackPlaying"] = [&state](const std::string& path) -> bool {
        auto* processor = state.getProcessor();
        if (!processor || path.empty()) return false;
        auto node = processor->getGraphNodeByPath(path);
        auto playback = std::dynamic_pointer_cast<dsp_primitives::SampleRegionPlaybackNode>(node);
        if (!playback) return false;
        return playback->isPlaying();
    };

    lua["getCapturePeaksDebugStats"] = [&lua](sol::optional<bool> resetOpt) -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto& stats = capturePeaksDebugStats();
        const bool reset = resetOpt.value_or(false);
        std::lock_guard<std::mutex> lock(stats.mutex);
        result["calls"] = stats.calls;
        result["totalBuckets"] = stats.totalBuckets;
        result["totalMicros"] = stats.totalMicros;
        result["topPaths"] = pushTopEntriesTable(lua, topCaptureEntries(stats.callsByPath));
        if (reset) {
            stats.calls = 0;
            stats.totalBuckets = 0;
            stats.totalMicros = 0;
            stats.callsByPath.clear();
        }
        return result;
    };
}

void LuaControlBindings::registerDspBindings(sol::state& lua,
                                             ILuaControlState& state) {
    lua["reloadDspScript"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->reloadDspScript();
    };

    lua["loadDspScript"] = [&state](const std::string& path) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->loadDspScript(juce::File(path));
    };

    lua["loadDspScriptInSlot"] = [&state](const std::string& path,
                                          const std::string& slot) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;

        const std::string slotName = slot.empty() ? "default" : slot;
        const bool ok = processor->loadDspScript(juce::File(path), slotName);
        if (ok && slotName != "default") {
            state.getManagedDspSlots().insert(slotName);
        }
        return ok;
    };

    lua["loadDspScriptFromString"] = [&state](const std::string& code,
                                               const std::string& sourceName) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->loadDspScriptFromString(code, sourceName);
    };

    lua["loadDspScriptFromStringInSlot"] = [&state](const std::string& code,
                                                     const std::string& sourceName,
                                                     const std::string& slot) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;

        const std::string slotName = slot.empty() ? "default" : slot;
        const bool ok = processor->loadDspScriptFromString(code, sourceName, slotName);
        if (ok && slotName != "default") {
            state.getManagedDspSlots().insert(slotName);
        }
        return ok;
    };

    lua["setDspSlotPersistOnUiSwitch"] = [&state](const std::string& slot,
                                                   bool persist) -> bool {
        const std::string slotName = slot.empty() ? "default" : slot;
        if (slotName == "default") return false;

        state.getManagedDspSlots().insert(slotName);
        if (persist) {
            state.getPersistentDspSlots().insert(slotName);
        } else {
            state.getPersistentDspSlots().erase(slotName);
        }
        return true;
    };

    lua["isDspSlotPersistOnUiSwitch"] = [&state](const std::string& slot) -> bool {
        const std::string slotName = slot.empty() ? "default" : slot;
        return state.getPersistentDspSlots().find(slotName) !=
               state.getPersistentDspSlots().end();
    };

    lua["unloadDspSlot"] = [&state](const std::string& slot) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;

        const std::string slotName = slot.empty() ? "default" : slot;
        const bool ok = processor->unloadDspSlot(slotName);
        if (slotName != "default") {
            state.getManagedDspSlots().erase(slotName);
            state.getPersistentDspSlots().erase(slotName);
        }
        return ok;
    };

    lua["isDspScriptLoaded"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isDspScriptLoaded();
    };

    lua["isDspSlotLoaded"] = [&state](const std::string& slot) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isDspSlotLoaded(slot);
    };

    lua["getDspScriptLastError"] = [&state]() -> std::string {
        auto* processor = state.getProcessor();
        if (!processor) return "";
        return processor->getDspScriptLastError();
    };
}

void LuaControlBindings::registerGraphBindings(sol::state& lua,
                                               ILuaControlState& state) {
    // Guard against re-registration (causes sol2 double-free on Lua cleanup)
    if (lua["__graph_bindings_registered"].valid() && lua["__graph_bindings_registered"]) {
        return;
    }
    
    // ---- DSP Primitives factory ----
    lua["Primitives"] = lua.create_table();

    lua["Primitives"]["LoopBuffer"] = lua.create_table();
    lua["Primitives"]["LoopBuffer"]["new"] = &createLoopBuffer;

    lua["Primitives"]["Playhead"] = lua.create_table();
    lua["Primitives"]["Playhead"]["new"] = &createPlayhead;

    lua["Primitives"]["CaptureBuffer"] = lua.create_table();
    lua["Primitives"]["CaptureBuffer"]["new"] = &createCaptureBuffer;

    lua["Primitives"]["Quantizer"] = lua.create_table();
    lua["Primitives"]["Quantizer"]["new"] = &createQuantizer;

    // Get graph from processor
    auto* graphProcessor = state.getProcessor();
    std::shared_ptr<dsp_primitives::PrimitiveGraph> graph;
    if (graphProcessor) {
        graph = graphProcessor->getPrimitiveGraph();
    }
    if (!graph) {
        graph = std::make_shared<dsp_primitives::PrimitiveGraph>();
    }

    // Register node usertypes
    lua.new_usertype<dsp_primitives::PlayheadNode>("PlayheadNode",
        sol::constructors<std::shared_ptr<dsp_primitives::PlayheadNode>()>(),
        "setLoopLength", &dsp_primitives::PlayheadNode::setLoopLength,
        "setSpeed", &dsp_primitives::PlayheadNode::setSpeed,
        "setReversed", &dsp_primitives::PlayheadNode::setReversed,
        "play", &dsp_primitives::PlayheadNode::play,
        "pause", &dsp_primitives::PlayheadNode::pause,
        "stop", &dsp_primitives::PlayheadNode::stop,
        "getLoopLength", &dsp_primitives::PlayheadNode::getLoopLength,
        "getSpeed", &dsp_primitives::PlayheadNode::getSpeed,
        "isReversed", &dsp_primitives::PlayheadNode::isReversed,
        "isPlaying", &dsp_primitives::PlayheadNode::isPlaying,
        "getNormalizedPosition", &dsp_primitives::PlayheadNode::getNormalizedPosition
    );

    lua.new_usertype<dsp_primitives::PassthroughNode>("PassthroughNode",
        sol::constructors<std::shared_ptr<dsp_primitives::PassthroughNode>(int)>()
    );

    lua.new_usertype<dsp_primitives::OscillatorNode>("OscillatorNode",
        sol::constructors<std::shared_ptr<dsp_primitives::OscillatorNode>()>(),
        "setFrequency", &dsp_primitives::OscillatorNode::setFrequency,
        "setAmplitude", &dsp_primitives::OscillatorNode::setAmplitude,
        "setEnabled", &dsp_primitives::OscillatorNode::setEnabled,
        "setWaveform", &dsp_primitives::OscillatorNode::setWaveform,
        "setDrive", &dsp_primitives::OscillatorNode::setDrive,
        "setDriveShape", &dsp_primitives::OscillatorNode::setDriveShape,
        "setDriveBias", &dsp_primitives::OscillatorNode::setDriveBias,
        "setDriveMix", &dsp_primitives::OscillatorNode::setDriveMix,
        "getFrequency", &dsp_primitives::OscillatorNode::getFrequency,
        "getAmplitude", &dsp_primitives::OscillatorNode::getAmplitude,
        "getDrive", &dsp_primitives::OscillatorNode::getDrive,
        "getDriveShape", &dsp_primitives::OscillatorNode::getDriveShape,
        "getDriveBias", &dsp_primitives::OscillatorNode::getDriveBias,
        "getDriveMix", &dsp_primitives::OscillatorNode::getDriveMix,
        "isEnabled", &dsp_primitives::OscillatorNode::isEnabled,
        "getWaveform", &dsp_primitives::OscillatorNode::getWaveform
    );

    lua.new_usertype<dsp_primitives::ReverbNode>("ReverbNode",
        sol::constructors<std::shared_ptr<dsp_primitives::ReverbNode>()>(),
        "setRoomSize", &dsp_primitives::ReverbNode::setRoomSize,
        "setDamping", &dsp_primitives::ReverbNode::setDamping,
        "setWetLevel", &dsp_primitives::ReverbNode::setWetLevel,
        "setDryLevel", &dsp_primitives::ReverbNode::setDryLevel,
        "setWidth", &dsp_primitives::ReverbNode::setWidth,
        "getRoomSize", &dsp_primitives::ReverbNode::getRoomSize,
        "getDamping", &dsp_primitives::ReverbNode::getDamping,
        "getWetLevel", &dsp_primitives::ReverbNode::getWetLevel,
        "getDryLevel", &dsp_primitives::ReverbNode::getDryLevel,
        "getWidth", &dsp_primitives::ReverbNode::getWidth
    );

    lua.new_usertype<dsp_primitives::FilterNode>("FilterNode",
        sol::constructors<std::shared_ptr<dsp_primitives::FilterNode>()>(),
        "setCutoff", &dsp_primitives::FilterNode::setCutoff,
        "setResonance", &dsp_primitives::FilterNode::setResonance,
        "setMix", &dsp_primitives::FilterNode::setMix,
        "getCutoff", &dsp_primitives::FilterNode::getCutoff,
        "getResonance", &dsp_primitives::FilterNode::getResonance,
        "getMix", &dsp_primitives::FilterNode::getMix
    );

    lua.new_usertype<dsp_primitives::DistortionNode>("DistortionNode",
        sol::constructors<std::shared_ptr<dsp_primitives::DistortionNode>()>(),
        "setDrive", &dsp_primitives::DistortionNode::setDrive,
        "setMix", &dsp_primitives::DistortionNode::setMix,
        "setOutput", &dsp_primitives::DistortionNode::setOutput,
        "getDrive", &dsp_primitives::DistortionNode::getDrive,
        "getMix", &dsp_primitives::DistortionNode::getMix,
        "getOutput", &dsp_primitives::DistortionNode::getOutput
    );

    lua.new_usertype<dsp_primitives::SVFNode>("SVFNode",
        sol::constructors<std::shared_ptr<dsp_primitives::SVFNode>()>(),
        "setCutoff", &dsp_primitives::SVFNode::setCutoff,
        "setResonance", &dsp_primitives::SVFNode::setResonance,
        "setMode", &dsp_primitives::SVFNode::setMode,
        "setDrive", &dsp_primitives::SVFNode::setDrive,
        "setMix", &dsp_primitives::SVFNode::setMix,
        "getCutoff", &dsp_primitives::SVFNode::getCutoff,
        "getResonance", &dsp_primitives::SVFNode::getResonance,
        "getMode", &dsp_primitives::SVFNode::getMode,
        "getDrive", &dsp_primitives::SVFNode::getDrive,
        "getMix", &dsp_primitives::SVFNode::getMix,
        "reset", &dsp_primitives::SVFNode::reset
    );

    lua.new_usertype<dsp_primitives::StereoDelayNode>("StereoDelayNode",
        sol::constructors<std::shared_ptr<dsp_primitives::StereoDelayNode>()>(),
        "setTimeMode", &dsp_primitives::StereoDelayNode::setTimeMode,
        "setTimeL", &dsp_primitives::StereoDelayNode::setTimeL,
        "setTimeR", &dsp_primitives::StereoDelayNode::setTimeR,
        "setDivisionL", &dsp_primitives::StereoDelayNode::setDivisionL,
        "setDivisionR", &dsp_primitives::StereoDelayNode::setDivisionR,
        "setFeedback", &dsp_primitives::StereoDelayNode::setFeedback,
        "setFeedbackCrossfeed", &dsp_primitives::StereoDelayNode::setFeedbackCrossfeed,
        "setFilterEnabled", &dsp_primitives::StereoDelayNode::setFilterEnabled,
        "setFilterCutoff", &dsp_primitives::StereoDelayNode::setFilterCutoff,
        "setFilterResonance", &dsp_primitives::StereoDelayNode::setFilterResonance,
        "setMix", &dsp_primitives::StereoDelayNode::setMix,
        "setPingPong", &dsp_primitives::StereoDelayNode::setPingPong,
        "setWidth", &dsp_primitives::StereoDelayNode::setWidth,
        "setFreeze", &dsp_primitives::StereoDelayNode::setFreeze,
        "setDucking", &dsp_primitives::StereoDelayNode::setDucking,
        "setTempo", &dsp_primitives::StereoDelayNode::setTempo,
        "getTimeMode", &dsp_primitives::StereoDelayNode::getTimeMode,
        "getTimeL", &dsp_primitives::StereoDelayNode::getTimeL,
        "getTimeR", &dsp_primitives::StereoDelayNode::getTimeR,
        "getMix", &dsp_primitives::StereoDelayNode::getMix,
        "getFeedback", &dsp_primitives::StereoDelayNode::getFeedback,
        "getPingPong", &dsp_primitives::StereoDelayNode::getPingPong,
        "getFreeze", &dsp_primitives::StereoDelayNode::getFreeze,
        "reset", &dsp_primitives::StereoDelayNode::reset
    );

    // MIDI Nodes
    lua.new_usertype<dsp_primitives::MidiVoiceNode>("MidiVoiceNode",
        sol::constructors<std::shared_ptr<dsp_primitives::MidiVoiceNode>()>(),
        "setWaveform", &dsp_primitives::MidiVoiceNode::setWaveform,
        "setAttack", &dsp_primitives::MidiVoiceNode::setAttack,
        "setDecay", &dsp_primitives::MidiVoiceNode::setDecay,
        "setSustain", &dsp_primitives::MidiVoiceNode::setSustain,
        "setRelease", &dsp_primitives::MidiVoiceNode::setRelease,
        "setFilterCutoff", &dsp_primitives::MidiVoiceNode::setFilterCutoff,
        "setFilterResonance", &dsp_primitives::MidiVoiceNode::setFilterResonance,
        "setFilterEnvAmount", &dsp_primitives::MidiVoiceNode::setFilterEnvAmount,
        "setEnabled", &dsp_primitives::MidiVoiceNode::setEnabled,
        "setPolyphony", &dsp_primitives::MidiVoiceNode::setPolyphony,
        "setGlide", &dsp_primitives::MidiVoiceNode::setGlide,
        "setDetune", &dsp_primitives::MidiVoiceNode::setDetune,
        "setSpread", &dsp_primitives::MidiVoiceNode::setSpread,
        "setUnison", &dsp_primitives::MidiVoiceNode::setUnison,
        "getWaveform", &dsp_primitives::MidiVoiceNode::getWaveform,
        "getAttack", &dsp_primitives::MidiVoiceNode::getAttack,
        "getDecay", &dsp_primitives::MidiVoiceNode::getDecay,
        "getSustain", &dsp_primitives::MidiVoiceNode::getSustain,
        "getRelease", &dsp_primitives::MidiVoiceNode::getRelease,
        "getFilterCutoff", &dsp_primitives::MidiVoiceNode::getFilterCutoff,
        "getFilterResonance", &dsp_primitives::MidiVoiceNode::getFilterResonance,
        "getFilterEnvAmount", &dsp_primitives::MidiVoiceNode::getFilterEnvAmount,
        "isEnabled", &dsp_primitives::MidiVoiceNode::isEnabled,
        "getPolyphony", &dsp_primitives::MidiVoiceNode::getPolyphony,
        "getNumActiveVoices", &dsp_primitives::MidiVoiceNode::getNumActiveVoices,
        "noteOn", &dsp_primitives::MidiVoiceNode::noteOn,
        "noteOff", &dsp_primitives::MidiVoiceNode::noteOff,
        "allNotesOff", &dsp_primitives::MidiVoiceNode::allNotesOff,
        "allSoundOff", &dsp_primitives::MidiVoiceNode::allSoundOff,
        "pitchBend", &dsp_primitives::MidiVoiceNode::pitchBend,
        "controlChange", &dsp_primitives::MidiVoiceNode::controlChange
    );

    lua.new_usertype<dsp_primitives::MidiInputNode>("MidiInputNode",
        sol::constructors<std::shared_ptr<dsp_primitives::MidiInputNode>()>(),
        "setChannelFilter", &dsp_primitives::MidiInputNode::setChannelFilter,
        "setChannelMask", &dsp_primitives::MidiInputNode::setChannelMask,
        "setOmniMode", &dsp_primitives::MidiInputNode::setOmniMode,
        "setMonophonic", &dsp_primitives::MidiInputNode::setMonophonic,
        "setPortamento", &dsp_primitives::MidiInputNode::setPortamento,
        "setPitchBendRange", &dsp_primitives::MidiInputNode::setPitchBendRange,
        "setEnabled", &dsp_primitives::MidiInputNode::setEnabled,
        "setEchoOutput", &dsp_primitives::MidiInputNode::setEchoOutput,
        "getChannelFilter", &dsp_primitives::MidiInputNode::getChannelFilter,
        "isOmniMode", &dsp_primitives::MidiInputNode::isOmniMode,
        "isMonophonic", &dsp_primitives::MidiInputNode::isMonophonic,
        "getPortamento", &dsp_primitives::MidiInputNode::getPortamento,
        "getPitchBendRange", &dsp_primitives::MidiInputNode::getPitchBendRange,
        "isEnabled", &dsp_primitives::MidiInputNode::isEnabled,
        "isEchoingOutput", &dsp_primitives::MidiInputNode::isEchoingOutput,
        "getLastNote", &dsp_primitives::MidiInputNode::getLastNote,
        "getLastVelocity", &dsp_primitives::MidiInputNode::getLastVelocity,
        "getCurrentPitchBend", &dsp_primitives::MidiInputNode::getCurrentPitchBend,
        "connectToVoiceNode", &dsp_primitives::MidiInputNode::connectToVoiceNode,
        "triggerNoteOn", &dsp_primitives::MidiInputNode::triggerNoteOn,
        "triggerNoteOff", &dsp_primitives::MidiInputNode::triggerNoteOff,
        "triggerPitchBend", &dsp_primitives::MidiInputNode::triggerPitchBend
    );

    // Node factories
    lua["Primitives"]["PlayheadNode"] = lua.create_table();
    lua["Primitives"]["PlayheadNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::PlayheadNode>();
        graph->registerNode(node);
        return node;
    };

    lua["Primitives"]["PassthroughNode"] = lua.create_table();
    lua["Primitives"]["PassthroughNode"]["new"] = [graph](int numChannels) {
        auto node = std::make_shared<dsp_primitives::PassthroughNode>(numChannels);
        graph->registerNode(node);
        return node;
    };

    lua["Primitives"]["OscillatorNode"] = lua.create_table();
    lua["Primitives"]["OscillatorNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::OscillatorNode>();
        graph->registerNode(node);
        return node;
    };

    lua["Primitives"]["ReverbNode"] = lua.create_table();
    lua["Primitives"]["ReverbNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::ReverbNode>();
        graph->registerNode(node);
        return node;
    };

    lua["Primitives"]["FilterNode"] = lua.create_table();
    lua["Primitives"]["FilterNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::FilterNode>();
        graph->registerNode(node);
        return node;
    };

    lua["Primitives"]["DistortionNode"] = lua.create_table();
    lua["Primitives"]["DistortionNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::DistortionNode>();
        graph->registerNode(node);
        return node;
    };

    lua["Primitives"]["SVFNode"] = lua.create_table();
    lua["Primitives"]["SVFNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::SVFNode>();
        graph->registerNode(node);
        return node;
    };
    lua["Primitives"]["SVFNode"]["Mode"] = lua.create_table_with(
        "Lowpass", 0,
        "Bandpass", 1,
        "Highpass", 2,
        "Notch", 3,
        "Peak", 4
    );

    lua["Primitives"]["StereoDelayNode"] = lua.create_table();
    lua["Primitives"]["StereoDelayNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::StereoDelayNode>();
        graph->registerNode(node);
        return node;
    };
    lua["Primitives"]["StereoDelayNode"]["TimeMode"] = lua.create_table_with(
        "Free", 0,
        "Synced", 1
    );
    lua["Primitives"]["StereoDelayNode"]["Division"] = lua.create_table_with(
        "ThirtySecond", 0,
        "Sixteenth", 1,
        "Eighth", 2,
        "Quarter", 3,
        "Half", 4,
        "Whole", 5,
        "DottedEighth", 6,
        "DottedQuarter", 7,
        "TripletSixteenth", 8,
        "TripletEighth", 9,
        "TripletQuarter", 10
    );

    // Connection helpers
    auto toPrimitiveNode = [](const sol::object& obj) -> std::shared_ptr<dsp_primitives::IPrimitiveNode> {
        if (obj.is<std::shared_ptr<dsp_primitives::PlayheadNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::PlayheadNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::PassthroughNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::PassthroughNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::OscillatorNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::OscillatorNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::ReverbNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::ReverbNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::FilterNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::FilterNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::DistortionNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::DistortionNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::SVFNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::SVFNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::StereoDelayNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::StereoDelayNode>>();
        }
        return nullptr;
    };

    lua["connectNodes"] = [graph, toPrimitiveNode](const sol::object& fromObj,
                                                    const sol::object& toObj) -> bool {
        auto from = toPrimitiveNode(fromObj);
        auto to = toPrimitiveNode(toObj);
        if (!from || !to) return false;
        return graph->connect(from, 0, to, 0);
    };

    lua["hasGraphCycle"] = [graph]() -> bool {
        return graph->hasCycle();
    };

    lua["getGraphNodeCount"] = [graph]() -> int {
        return static_cast<int>(graph->getNodeCount());
    };

    lua["getGraphConnectionCount"] = [graph]() -> int {
        return static_cast<int>(graph->getConnectionCount());
    };

    lua["clearGraph"] = [graph]() {
        graph->clear();
    };

    lua["setGraphProcessingEnabled"] = [&state](bool enabled) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        processor->setGraphProcessingEnabled(enabled);
        return processor->isGraphProcessingEnabled() == enabled;
    };

    lua["isGraphProcessingEnabled"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isGraphProcessingEnabled();
    };
}

void LuaControlBindings::registerOSCBindings(sol::state& lua,
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

void LuaControlBindings::registerEventBindings(sol::state& lua,
                                               ILuaControlState& state) {
    auto looperTable = lua.create_table();

    looperTable["onTempoChanged"] = [&state](sol::function callback,
                                             sol::optional<bool> persistent) -> bool {
        if (!callback.valid()) return false;

        std::lock_guard<std::mutex> lock(state.getEventListenersMutex());
        ILuaControlState::EventListener listener;
        listener.func = callback;
        listener.persistent = persistent.value_or(false);
        state.getTempoChangedListeners().push_back(std::move(listener));
        return true;
    };

    looperTable["onCommit"] = [&state](sol::function callback,
                                       sol::optional<bool> persistent) -> bool {
        if (!callback.valid()) return false;

        std::lock_guard<std::mutex> lock(state.getEventListenersMutex());
        ILuaControlState::EventListener listener;
        listener.func = callback;
        listener.persistent = persistent.value_or(false);
        state.getCommitListeners().push_back(std::move(listener));
        return true;
    };

    looperTable["onRecordingChanged"] = [&state](sol::function callback,
                                                 sol::optional<bool> persistent) -> bool {
        if (!callback.valid()) return false;

        std::lock_guard<std::mutex> lock(state.getEventListenersMutex());
        ILuaControlState::EventListener listener;
        listener.func = callback;
        listener.persistent = persistent.value_or(false);
        state.getRecordingChangedListeners().push_back(std::move(listener));
        return true;
    };

    looperTable["onLayerStateChanged"] = [&state](sol::function callback,
                                                  sol::optional<bool> persistent) -> bool {
        if (!callback.valid()) return false;

        std::lock_guard<std::mutex> lock(state.getEventListenersMutex());
        ILuaControlState::EventListener listener;
        listener.func = callback;
        listener.persistent = persistent.value_or(false);
        state.getLayerStateChangedListeners().push_back(std::move(listener));
        return true;
    };

    looperTable["onStateChanged"] = [&state](sol::function callback,
                                             sol::optional<bool> persistent) -> bool {
        if (!callback.valid()) return false;

        std::lock_guard<std::mutex> lock(state.getEventListenersMutex());
        ILuaControlState::EventListener listener;
        listener.func = callback;
        listener.persistent = persistent.value_or(false);
        state.getStateChangedListeners().push_back(std::move(listener));
        return true;
    };

    lua["looper"] = looperTable;
}

void LuaControlBindings::registerLinkBindings(sol::state& lua,
                                              ILuaControlState& state) {
    auto linkTable = lua.create_table();

    linkTable["isEnabled"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isLinkEnabled();
    };

    linkTable["setEnabled"] = [&state](bool enabled) {
        auto* processor = state.getProcessor();
        if (!processor) return;
        processor->setLinkEnabled(enabled);
    };

    linkTable["isTempoSyncEnabled"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isLinkTempoSyncEnabled();
    };

    linkTable["setTempoSyncEnabled"] = [&state](bool enabled) {
        auto* processor = state.getProcessor();
        if (!processor) return;
        processor->setLinkTempoSyncEnabled(enabled);
    };

    linkTable["isStartStopSyncEnabled"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isLinkStartStopSyncEnabled();
    };

    linkTable["setStartStopSyncEnabled"] = [&state](bool enabled) {
        auto* processor = state.getProcessor();
        if (!processor) return;
        processor->setLinkStartStopSyncEnabled(enabled);
    };

    linkTable["getNumPeers"] = [&state]() -> int {
        auto* processor = state.getProcessor();
        if (!processor) return 0;
        return processor->getLinkNumPeers();
    };

    linkTable["isPlaying"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isLinkPlaying();
    };

    linkTable["getBeat"] = [&state]() -> double {
        auto* processor = state.getProcessor();
        if (!processor) return 0.0;
        return processor->getLinkBeat();
    };

    linkTable["getPhase"] = [&state]() -> double {
        auto* processor = state.getProcessor();
        if (!processor) return 0.0;
        return processor->getLinkPhase();
    };

    linkTable["requestTempo"] = [&state](double bpm) {
        auto* processor = state.getProcessor();
        if (!processor) return;
        processor->requestLinkTempo(bpm);
    };

    linkTable["requestStart"] = [&state]() {
        auto* processor = state.getProcessor();
        if (!processor) return;
        processor->requestLinkStart();
    };

    linkTable["requestStop"] = [&state]() {
        auto* processor = state.getProcessor();
        if (!processor) return;
        processor->requestLinkStop();
    };

    lua["link"] = linkTable;
}

void LuaControlBindings::registerUtilityBindings(sol::state& lua,
                                                 ILuaControlState& state) {
    std::fprintf(stderr, "[LuaControlBindings] registerUtilityBindings called\n");
    
    lua["getTime"] = []() -> double {
        static const auto startTime = juce::Time::getHighResolutionTicks();
        return juce::Time::highResolutionTicksToSeconds(
            juce::Time::getHighResolutionTicks() - startTime);
    };

    lua["getAudioClockInfo"] = [&state, &lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto* processor = state.getProcessor();
        result["sampleRate"] = processor ? processor->getSampleRate() : 44100.0;
        result["playTimeSamples"] = processor ? processor->getPlayTimeSamples() : 0.0;
        result["tempo"] = processor ? processor->getTempo() : 120.0f;
        result["samplesPerBar"] = processor ? processor->getSamplesPerBar() : 88200.0f;
        return result;
    };

    lua["listUiScripts"] = [&lua]() -> sol::table {
        const auto signature = currentUiScriptsSignature();
        auto& cache = scriptListingCacheState();
        std::vector<ScriptListEntry> entries;
        bool cacheHit = false;
        {
            std::lock_guard<std::mutex> lock(cache.mutex);
            if (cache.uiValid && cache.uiSignature == signature) {
                entries = cache.uiEntries;
                ++cache.uiHits;
                cacheHit = true;
            }
        }

        if (!cacheHit) {
            entries = scanUiScripts();
            std::lock_guard<std::mutex> lock(cache.mutex);
            cache.uiEntries = entries;
            cache.uiSignature = signature;
            cache.uiValid = true;
            ++cache.uiBuilds;
        }

        return scriptListToLua(lua, entries);
    };

    lua["invalidateScriptListingsCache"] = []() {
        invalidateScriptListingCaches();
    };

    lua["getScriptListingsCacheStats"] = [&lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        auto& cache = scriptListingCacheState();
        std::lock_guard<std::mutex> lock(cache.mutex);

        auto ui = sol::table(lua, sol::create);
        ui["valid"] = cache.uiValid;
        ui["signature"] = cache.uiSignature;
        ui["entries"] = static_cast<int>(cache.uiEntries.size());
        ui["builds"] = cache.uiBuilds;
        ui["hits"] = cache.uiHits;
        result["ui"] = ui;

        auto dsp = sol::table(lua, sol::create);
        dsp["valid"] = cache.dspValid;
        dsp["signature"] = cache.dspSignature;
        dsp["entries"] = static_cast<int>(cache.dspEntries.size());
        dsp["builds"] = cache.dspBuilds;
        dsp["hits"] = cache.dspHits;
        result["dsp"] = dsp;

        return result;
    };

    lua["switchUiScript"] = [&state](const std::string& path) {
        state.setPendingSwitchPath(path);
    };

    lua["closeOverlay"] = [&state]() -> bool {
        return state.closeOverlay();
    };

    lua["isOverlayActive"] = [&state]() -> bool {
        return state.isOverlayActive();
    };

    lua["setUIRendererMode"] = [&state](const std::string& mode) -> bool {
        auto* processor = state.getProcessor();
        if (processor == nullptr) {
            return false;
        }

        const std::string normalized = normalizeUIRendererMode(mode);
        if (!isValidUIRendererMode(normalized)) {
            return false;
        }

        auto& request = processor->getControlServer().getUIRendererRequest();
        std::lock_guard<std::mutex> lock(request.mutex);
        request.mode = normalized;
        request.pending.store(true, std::memory_order_release);
        return true;
    };

    lua["getUIRendererMode"] = [&state]() -> std::string {
        auto* processor = state.getProcessor();
        if (processor == nullptr) {
            return "canvas";
        }
        return uiRendererModeToString(processor->getControlServer().getCurrentUIRendererMode());
    };

    lua["getCurrentScriptPath"] = [&state]() -> std::string {
        return state.getCurrentScriptFile().getFullPathName().toStdString();
    };

    lua["showFileChooser"] = [&state](const std::string& title,
                                        const std::string& initialPath,
                                        const std::string& filePatterns,
                                        sol::function callback) {
        state.showFileChooser(title, initialPath, filePatterns, callback);
    };

    lua["showDirectoryChooser"] = [&state](const std::string& title,
                                             const std::string& initialPath,
                                             sol::function callback) {
        state.showDirectoryChooser(title, initialPath, callback);
    };

    auto debugRecordingTable = lua.create_table();
    auto startNodeRecording = [&state](const std::string& outputDir,
                                        const std::string& nodeId,
                                        uint64_t stableId,
                                        sol::optional<bool> muxAfterStop) -> std::string {
        auto* processor = state.getProcessor();
        if (processor == nullptr) {
            return "ERROR no processor";
        }
        RecordingOptions options;
        options.cropEnabled = true;
        options.cropNodeId = nodeId;
        options.cropStableId = stableId;
        options.cropW = 1;
        options.cropH = 1;
        options.streamFramesToDisk = true;
        options.muxAfterStop = muxAfterStop.value_or(true);
        options.fps = 30;
        options.muxOutputPath = outputDir + "/video.mp4";
        return processor->getControlServer().startRecording("tga", 0, outputDir, options);
    };
    debugRecordingTable["startNode"] = [startNodeRecording](const std::string& outputDir,
                                                             const std::string& nodeId,
                                                             sol::optional<bool> muxAfterStop) -> std::string {
        return startNodeRecording(outputDir, nodeId, 0, muxAfterStop);
    };
    debugRecordingTable["startStableId"] = [startNodeRecording](const std::string& outputDir,
                                                                 double stableId,
                                                                 sol::optional<bool> muxAfterStop) -> std::string {
        return startNodeRecording(outputDir, std::string(), static_cast<uint64_t>(std::max(0.0, stableId)), muxAfterStop);
    };
    debugRecordingTable["startViewport"] = [&state](const std::string& outputDir,
                                                      int x,
                                                      int y,
                                                      int w,
                                                      int h,
                                                      sol::optional<bool> muxAfterStop) -> std::string {
        auto* processor = state.getProcessor();
        if (processor == nullptr) {
            return "ERROR no processor";
        }
        RecordingOptions options;
        options.cropEnabled = true;
        options.cropX = std::max(0, x);
        options.cropY = std::max(0, y);
        options.cropW = std::max(1, w);
        options.cropH = std::max(1, h);
        options.streamFramesToDisk = true;
        options.muxAfterStop = muxAfterStop.value_or(true);
        options.fps = 30;
        options.muxOutputPath = outputDir + "/video.mp4";
        return processor->getControlServer().startRecording("tga", 0, outputDir, options);
    };
    debugRecordingTable["stop"] = [&state]() -> std::string {
        auto* processor = state.getProcessor();
        if (processor == nullptr) {
            return "ERROR no processor";
        }
        return processor->getControlServer().stopRecording();
    };
    debugRecordingTable["status"] = [&state]() -> std::string {
        auto* processor = state.getProcessor();
        if (processor == nullptr) {
            return "ERROR no processor";
        }
        return processor->getControlServer().getRecordingStatus();
    };
    lua["debugRecording"] = debugRecordingTable;

    // ==========================================================================
    // videoSampler table - audio-timed video sampler/capture bindings
    // ==========================================================================
    lua.new_usertype<manifold::video::VideoSampler>("VideoSampler",
        sol::no_constructor,
        "getId", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> std::string {
            return self ? self->getId() : std::string();
        },
        "hasFrames", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> bool {
            return self ? self->hasFrames() : false;
        },
        "getFrameCount", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> int {
            return self ? self->getFrameCount() : 0;
        },
        "getDurationSamples", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> double {
            return self ? self->getDurationSamples() : 0.0;
        },
        "getDurationSeconds", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getDurationSeconds() : 0.0f;
        },
        "getEstimatedBytes", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> double {
            return self ? static_cast<double>(self->getEstimatedBytes()) : 0.0;
        },
        "clear", [](const std::shared_ptr<manifold::video::VideoSampler>& self) {
            if (self) self->clear();
        },
        "setPosition", [](const std::shared_ptr<manifold::video::VideoSampler>& self, float normalized) {
            if (self) self->seekNormalized(normalized);
        },
        "seek", [](const std::shared_ptr<manifold::video::VideoSampler>& self, float normalized) {
            if (self) self->seekNormalized(normalized);
        },
        "getPosition", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getNormalizedPosition() : 0.0f;
        },
        "getNormalizedPosition", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getNormalizedPosition() : 0.0f;
        },
        "play", [](const std::shared_ptr<manifold::video::VideoSampler>& self) {
            if (self) self->play();
        },
        "pause", [](const std::shared_ptr<manifold::video::VideoSampler>& self) {
            if (self) self->pause();
        },
        "stop", [](const std::shared_ptr<manifold::video::VideoSampler>& self) {
            if (self) self->stop();
        },
        "trigger", [](const std::shared_ptr<manifold::video::VideoSampler>& self) {
            if (self) self->trigger();
        },
        "isPlaying", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> bool {
            return self ? self->isPlaying() : false;
        },
        "advance", [](const std::shared_ptr<manifold::video::VideoSampler>& self, double deltaSeconds) {
            if (self) self->advance(deltaSeconds);
        },
        "setOneShot", [](const std::shared_ptr<manifold::video::VideoSampler>& self, bool enabled) {
            if (self) self->setOneShot(enabled);
        },
        "isOneShot", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> bool {
            return self ? self->isOneShot() : false;
        },
        "setPlayStart", [](const std::shared_ptr<manifold::video::VideoSampler>& self, float normalized) {
            if (self) self->setPlayStart(normalized);
        },
        "getPlayStart", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getPlayStart() : 0.0f;
        },
        "setLoopStart", [](const std::shared_ptr<manifold::video::VideoSampler>& self, float normalized) {
            if (self) self->setLoopStart(normalized);
        },
        "getLoopStart", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getLoopStart() : 0.0f;
        },
        "setLoopEnd", [](const std::shared_ptr<manifold::video::VideoSampler>& self, float normalized) {
            if (self) self->setLoopEnd(normalized);
        },
        "getLoopEnd", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getLoopEnd() : 1.0f;
        },
        "setCrossfade", [](const std::shared_ptr<manifold::video::VideoSampler>& self, float normalized) {
            if (self) self->setCrossfade(normalized);
        },
        "getCrossfade", [](const std::shared_ptr<manifold::video::VideoSampler>& self) -> float {
            return self ? self->getCrossfade() : 0.0f;
        });

    lua.new_usertype<manifold::video::VideoRetrospectiveCapture>("VideoRetrospectiveCapture",
        sol::no_constructor,
        "setCaptureSeconds", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self, float seconds) {
            if (self) self->setCaptureSeconds(seconds);
        },
        "getCaptureSeconds", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> float {
            return self ? self->getCaptureSeconds() : 0.0f;
        },
        "ingestLatest", [&state](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> bool {
            auto* processor = state.getProcessor();
            if (!self || processor == nullptr) {
                return false;
            }
            return self->ingestLatestFrame(processor->getPlayTimeSamples(), highResNowSeconds());
        },
        "copyRecentToSampler", [&state](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self,
                                          const std::shared_ptr<manifold::video::VideoSampler>& sampler,
                                          double samplesBack) -> bool {
            auto* processor = state.getProcessor();
            if (!self || !sampler || processor == nullptr) {
                return false;
            }
            return self->copyRecentToSampler(*sampler,
                                             processor->getPlayTimeSamples(),
                                             samplesBack,
                                             processor->getSampleRate());
        },
        "getFrameCount", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> int {
            return self ? self->getFrameCount() : 0;
        },
        "getLockedWidth", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> int {
            return self ? self->getLockedWidth() : 0;
        },
        "getLockedHeight", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> int {
            return self ? self->getLockedHeight() : 0;
        },
        "getEstimatedBytes", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> double {
            return self ? static_cast<double>(self->getEstimatedBytes()) : 0.0;
        },
        "getMaxRetainedBytes", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) -> double {
            return self ? static_cast<double>(self->getMaxRetainedBytes()) : 0.0;
        },
        "clear", [](const std::shared_ptr<manifold::video::VideoRetrospectiveCapture>& self) {
            if (self) self->clear();
        });

    auto videoSamplerTable = lua.create_table();
    videoSamplerTable["new"] = [](sol::optional<sol::table> opts) -> std::shared_ptr<manifold::video::VideoSampler> {
        std::string id;
        if (opts) {
            sol::object idObj = (*opts)["id"];
            if (idObj.valid() && idObj.is<std::string>()) {
                id = idObj.as<std::string>();
            }
        }
        return manifold::video::VideoSamplerRegistry::instance().createSampler(id);
    };
    videoSamplerTable["capture"] = [](sol::optional<sol::table> opts) -> std::shared_ptr<manifold::video::VideoRetrospectiveCapture> {
        std::string id;
        float maxSeconds = 30.0f;
        if (opts) {
            sol::object idObj = (*opts)["id"];
            if (idObj.valid() && idObj.is<std::string>()) {
                id = idObj.as<std::string>();
            }
            sol::object maxSecondsObj = (*opts)["maxSeconds"];
            if (maxSecondsObj.valid() && maxSecondsObj.is<double>()) {
                maxSeconds = static_cast<float>(maxSecondsObj.as<double>());
            } else if (maxSecondsObj.valid() && maxSecondsObj.is<int>()) {
                maxSeconds = static_cast<float>(maxSecondsObj.as<int>());
            }
        }
        return manifold::video::VideoSamplerRegistry::instance().createCapture(id, maxSeconds);
    };
    videoSamplerTable["get"] = [](const std::string& id) -> std::shared_ptr<manifold::video::VideoSampler> {
        return manifold::video::VideoSamplerRegistry::instance().getSampler(id);
    };
    videoSamplerTable["remove"] = [](const std::string& id) {
        manifold::video::VideoSamplerRegistry::instance().unregisterSampler(id);
    };
    videoSamplerTable["removeCapture"] = [](const std::string& id) {
        manifold::video::VideoSamplerRegistry::instance().unregisterCapture(id);
    };
    videoSamplerTable["size"] = []() -> int {
        return static_cast<int>(manifold::video::VideoSamplerRegistry::instance().size());
    };
    videoSamplerTable["captureCount"] = []() -> int {
        return static_cast<int>(manifold::video::VideoSamplerRegistry::instance().captureCount());
    };
    videoSamplerTable["clearRegistry"] = []() {
        manifold::video::VideoSamplerRegistry::instance().clear();
    };
    lua["videoSampler"] = videoSamplerTable;

    // ==========================================================================
    // ml table - ML inference (TFLite) bindings
    // ==========================================================================
    auto mlTable = lua.create_table();

#if MANIFOLD_HAS_ML
    lua.new_usertype<manifold::ml::MLPipeline>("MLPipeline",
        sol::no_constructor,
        "isLoaded", &manifold::ml::MLPipeline::isLoaded,
        "inputWidth", &manifold::ml::MLPipeline::inputWidth,
        "inputHeight", &manifold::ml::MLPipeline::inputHeight,
        "inputChannels", &manifold::ml::MLPipeline::inputChannels,
        "outputElements", &manifold::ml::MLPipeline::outputElements,
        "setNormalization", &manifold::ml::MLPipeline::setNormalization,
        "lastError", &manifold::ml::MLPipeline::lastError);

    mlTable["load"] = [](const std::string& modelPath)
        -> std::shared_ptr<manifold::ml::MLPipeline> {
        auto pipeline = std::make_shared<manifold::ml::MLPipeline>();
        if (!pipeline->load(modelPath)) {
            return nullptr;
        }
        return pipeline;
    };

    // Convenience: infer from latest webcam frame
    mlTable["infer"] = [&lua](
        const std::shared_ptr<manifold::ml::MLPipeline>& pipeline)
        -> sol::optional<sol::table> {
        if (!pipeline || !pipeline->isLoaded()) return sol::nullopt;

        auto frame = manifold::video::VideoCaptureManager::instance().getLatestFrameCopy();
        if (!frame.valid()) return sol::nullopt;

        std::vector<float> output;
        if (!pipeline->infer(frame.rgba.data(), frame.width, frame.height, output))
            return sol::nullopt;

        auto result = sol::table(lua, sol::create);
        result["width"] = pipeline->inputWidth();
        result["height"] = pipeline->inputHeight();
        result["size"] = static_cast<int>(output.size());
        sol::table dataTable = sol::table(lua, sol::create);
        for (int i = 0; i < static_cast<int>(output.size()); ++i)
            dataTable[i + 1] = output[static_cast<std::size_t>(i)];
        result["data"] = dataTable;
        return result;
    };

    // Generic: infer from explicit pixel data
    // frame Lua table: { width = int, height = int, rgba = {r0,g0,b0,a0, r1,g1,b1,a1, ...} }
    mlTable["inferFrame"] = [&lua](
        const std::shared_ptr<manifold::ml::MLPipeline>& pipeline,
        sol::table frame)
        -> sol::optional<sol::table> {
        if (!pipeline || !pipeline->isLoaded()) return sol::nullopt;

        int w = frame["width"];
        int h = frame["height"];
        sol::object rgbaObj = frame["rgba"];
        if (w <= 0 || h <= 0 || !rgbaObj.is<sol::table>()) return sol::nullopt;

        sol::table rgbaTable = rgbaObj.as<sol::table>();
        std::size_t numPixels = static_cast<std::size_t>(w) * static_cast<std::size_t>(h) * 4;
        std::vector<unsigned char> rgba(numPixels);
        for (std::size_t i = 0; i < numPixels; ++i)
            rgba[i] = static_cast<unsigned char>(rgbaTable[static_cast<int>(i) + 1].get_or(0));

        std::vector<float> output;
        if (!pipeline->infer(rgba.data(), w, h, output)) return sol::nullopt;

        auto result = sol::table(lua, sol::create);
        result["width"] = pipeline->inputWidth();
        result["height"] = pipeline->inputHeight();
        result["size"] = static_cast<int>(output.size());
        sol::table dataTable = sol::table(lua, sol::create);
        for (int i = 0; i < static_cast<int>(output.size()); ++i)
            dataTable[i + 1] = output[static_cast<std::size_t>(i)];
        result["data"] = dataTable;
        return result;
    };
#endif // MANIFOLD_HAS_ML

    lua["ml"] = mlTable;

    // ==========================================================================
    // capture table - video capture hardware bindings
    // ==========================================================================
    auto captureTable = lua.create_table();
    captureTable["listDevices"] = [&lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        const auto devices = manifold::video::VideoCaptureManager::instance().listDevices();
        int luaIndex = 1;
        for (const auto& device : devices) {
            auto entry = sol::table(lua, sol::create);
            entry["index"] = device.index;
            entry["path"] = device.path;
            entry["name"] = device.name;
            entry["label"] = device.label;
            result[luaIndex++] = entry;
        }
        return result;
    };
    captureTable["listModes"] = [&lua](int deviceIndex) -> sol::table {
        auto result = sol::table(lua, sol::create);
        const auto modes = manifold::video::VideoCaptureManager::instance().listModes(deviceIndex);
        int luaIndex = 1;
        for (const auto& mode : modes) {
            auto entry = sol::table(lua, sol::create);
            entry["width"] = mode.width;
            entry["height"] = mode.height;
            entry["fps"] = mode.fps;
            entry["pixelFormat"] = mode.pixelFormat;
            entry["label"] = mode.label;
            result[luaIndex++] = entry;
        }
        return result;
    };
    captureTable["open"] = [](int deviceIndex,
                              sol::optional<int> width,
                              sol::optional<int> height,
                              sol::optional<int> fps) -> bool {
        return manifold::video::VideoCaptureManager::instance().openDevice(deviceIndex,
                                                                           width.value_or(640),
                                                                           height.value_or(480),
                                                                           fps.value_or(30));
    };
    captureTable["close"] = []() {
        manifold::video::VideoCaptureManager::instance().closeDevice();
    };
    captureTable["isOpen"] = []() -> bool {
        return manifold::video::VideoCaptureManager::instance().isOpen();
    };
    captureTable["getActiveDeviceIndex"] = []() -> int {
        return manifold::video::VideoCaptureManager::instance().getActiveDeviceIndex();
    };
    captureTable["getLastError"] = []() -> std::string {
        return manifold::video::VideoCaptureManager::instance().getLastError();
    };
    captureTable["getFrameInfo"] = [&lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        const auto frame = manifold::video::VideoCaptureManager::instance().getLatestFrameCopy();
        result["valid"] = frame.valid();
        result["width"] = frame.width;
        result["height"] = frame.height;
        result["sequence"] = static_cast<double>(frame.sequence);
        result["open"] = manifold::video::VideoCaptureManager::instance().isOpen();
        result["activeDeviceIndex"] = manifold::video::VideoCaptureManager::instance().getActiveDeviceIndex();
        return result;
    };
    lua["capture"] = captureTable;

    // ==========================================================================
    // sources table - texture source registry bindings
    // ==========================================================================
    auto sourcesTable = lua.create_table();
    sourcesTable["list"] = [&lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        int sourceIndex = 1;
        for (const auto& source : manifold::sources::TextureSourceRegistry::instance().listSources()) {
            auto sourceTable = sol::table(lua, sol::create);
            sourceTable["id"] = source.id;
            sourceTable["name"] = source.name;
            sourceTable["category"] = source.category;
            sourceTable["description"] = source.description;

            auto paramsTable = sol::table(lua, sol::create);
            int paramIndex = 1;
            for (const auto& param : source.params) {
                auto paramTable = sol::table(lua, sol::create);
                paramTable["id"] = param.id;
                paramTable["name"] = param.name;
                paramTable["unit"] = param.unit;
                paramTable["min"] = param.min;
                paramTable["max"] = param.max;
                paramTable["default"] = param.defaultValue;
                paramTable["step"] = param.step;
                paramsTable[paramIndex++] = paramTable;
            }
            sourceTable["params"] = paramsTable;
            result[sourceIndex++] = sourceTable;
        }
        return result;
    };
    lua["sources"] = sourcesTable;

    // ==========================================================================
    // shaders table - shader effect registry bindings
    // ==========================================================================
    auto shadersTable = lua.create_table();
    shadersTable["listEffects"] = [&lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        int effectIndex = 1;
        for (const auto& effect : manifold::shaders::ShaderEffectRegistry::instance().listEffects()) {
            if (effect.effectCategory != manifold::shaders::EffectCategory::Effect) {
                continue;
            }
            auto effectTable = sol::table(lua, sol::create);
            effectTable["id"] = effect.id;
            effectTable["name"] = effect.name;
            effectTable["category"] = effect.category;
            effectTable["description"] = effect.description;

            auto paramsTable = sol::table(lua, sol::create);
            int paramIndex = 1;
            for (const auto& param : effect.params) {
                auto paramTable = sol::table(lua, sol::create);
                paramTable["id"] = param.id;
                paramTable["name"] = param.name;
                paramTable["unit"] = param.unit;
                paramTable["min"] = param.min;
                paramTable["max"] = param.max;
                paramTable["default"] = param.defaultValue;
                paramTable["step"] = param.step;
                paramsTable[paramIndex++] = paramTable;
            }
            effectTable["params"] = paramsTable;
            result[effectIndex++] = effectTable;
        }
        return result;
    };
    shadersTable["listBlendOps"] = [&lua]() -> sol::table {
        auto result = sol::table(lua, sol::create);
        int effectIndex = 1;
        for (const auto& effect : manifold::shaders::ShaderEffectRegistry::instance().listEffects()) {
            if (effect.effectCategory != manifold::shaders::EffectCategory::BlendOp) {
                continue;
            }
            auto effectTable = sol::table(lua, sol::create);
            effectTable["id"] = effect.id;
            effectTable["name"] = effect.name;
            effectTable["category"] = effect.category;
            effectTable["description"] = effect.description;

            auto paramsTable = sol::table(lua, sol::create);
            int paramIndex = 1;
            for (const auto& param : effect.params) {
                auto paramTable = sol::table(lua, sol::create);
                paramTable["id"] = param.id;
                paramTable["name"] = param.name;
                paramTable["unit"] = param.unit;
                paramTable["min"] = param.min;
                paramTable["max"] = param.max;
                paramTable["default"] = param.defaultValue;
                paramTable["step"] = param.step;
                paramsTable[paramIndex++] = paramTable;
            }
            effectTable["params"] = paramsTable;
            result[effectIndex++] = effectTable;
        }
        return result;
    };
    shadersTable["buildPipeline"] = [&lua](sol::object layersArg,
                                            sol::optional<std::string> fitModeOpt,
                                            sol::optional<sol::object> sourceArgOpt) -> sol::table {
        auto parseParams = [](sol::object paramsObj) {
            std::unordered_map<std::string, float> out;
            if (!paramsObj.is<sol::table>()) {
                return out;
            }
            for (const auto& pair : paramsObj.as<sol::table>()) {
                if (!pair.first.is<std::string>()) continue;
                float value = 0.0f;
                if (pair.second.is<double>()) {
                    value = static_cast<float>(pair.second.as<double>());
                } else if (pair.second.is<int>()) {
                    value = static_cast<float>(pair.second.as<int>());
                } else {
                    continue;
                }
                out[pair.first.as<std::string>()] = value;
            }
            return out;
        };

        struct LayerRequest {
            std::string effectId;
            std::unordered_map<std::string, float> params;
        };
        std::vector<LayerRequest> layers;

        if (layersArg.is<sol::table>()) {
            auto layersTable = layersArg.as<sol::table>();
            const std::size_t count = layersTable.size();
            for (std::size_t i = 1; i <= count; ++i) {
                sol::object entry = layersTable[i];
                if (!entry.is<sol::table>()) continue;
                auto layerTable = entry.as<sol::table>();

                sol::object enabledObj = layerTable["enabled"];
                if (enabledObj.is<bool>() && !enabledObj.as<bool>()) {
                    continue;
                }

                sol::object effectIdObj = layerTable["effectId"];
                if (!effectIdObj.is<std::string>()) continue;
                const auto effectId = effectIdObj.as<std::string>();
                if (manifold::shaders::ShaderEffectRegistry::instance().findEffect(effectId) == nullptr) continue;

                LayerRequest req;
                req.effectId = effectId;
                req.params = parseParams(layerTable["params"]);
                layers.push_back(std::move(req));
            }
        }

        if (layers.empty()) {
            LayerRequest fallback;
            fallback.effectId = "none";
            layers.push_back(std::move(fallback));
        }

        std::string sourceType = "video_input";
        std::string sourceId;
        std::unordered_map<std::string, float> sourceParams;
        if (sourceArgOpt && sourceArgOpt->is<sol::table>()) {
            auto sourceTable = sourceArgOpt->as<sol::table>();
            const auto kind = sourceTable["type"].get_or(std::string("webcam"));
            if (kind == "generator") {
                auto candidateId = sourceTable["sourceId"].get_or(std::string{});
                if (manifold::sources::TextureSourceRegistry::instance().findSource(candidateId) != nullptr) {
                    sourceType = "generated_source";
                    sourceId = candidateId;
                    sourceParams = parseParams(sourceTable["params"]);
                }
            }
        }

        auto result = sol::table(lua, sol::create);
        result["version"] = 2;
        result["kind"] = "shaderQuad";
        result["shaderLanguage"] = "glsl";
        result["sourceType"] = sourceType;
        result["fitMode"] = fitModeOpt.value_or("contain");

        if (sourceType == "generated_source") {
            auto sourceShader = sol::table(lua, sol::create);
            sourceShader["vertexShader"] = manifold::shaders::ShaderEffectRegistry::instance().vertexShader();
            sourceShader["fragmentShader"] = manifold::sources::TextureSourceRegistry::instance().fragmentShaderFor(sourceId);
            auto sourceUniforms = sol::table(lua, sol::create);
            const auto sanitizedSourceParams = manifold::sources::TextureSourceRegistry::instance().sanitizeParams(sourceId, sourceParams);
            for (const auto& entry : sanitizedSourceParams) {
                sourceUniforms[entry.first] = entry.second;
            }
            sourceShader["uniforms"] = sourceUniforms;
            result["sourceShader"] = sourceShader;
            result["sourceId"] = sourceId;
        }

        auto passes = sol::table(lua, sol::create);
        int passIndex = 1;
        for (const auto& layer : layers) {
            const auto sanitizedParams = manifold::shaders::ShaderEffectRegistry::instance().sanitizeParams(layer.effectId, layer.params);
            auto pass = sol::table(lua, sol::create);
            pass["vertexShader"] = manifold::shaders::ShaderEffectRegistry::instance().vertexShader();
            pass["fragmentShader"] = manifold::shaders::ShaderEffectRegistry::instance().fragmentShaderFor(layer.effectId, false);
            pass["inputTextureUniform"] = manifold::shaders::UniformContract::kInputTex;
            pass["prevTextureUniform"] = manifold::shaders::UniformContract::kPrevTex;
            pass["chain"] = true;
            auto uniforms = sol::table(lua, sol::create);
            for (const auto& entry : sanitizedParams) {
                uniforms[entry.first] = entry.second;
            }
            pass["uniforms"] = uniforms;
            passes[passIndex++] = pass;
        }
        result["passes"] = passes;
        return result;
    };
    shadersTable["reload"] = []() {
        manifold::shaders::ShaderEffectRegistry::instance().reloadRuntimeEffects();
    };
    lua["shaders"] = shadersTable;

    lua["getRuntimeDisplayListDebugStats"] = [&lua](sol::optional<bool> resetOpt) -> sol::table {
        auto result = sol::table(lua, sol::create);
        const auto stats = RuntimeNode::getDisplayListDebugStats(resetOpt.value_or(false));
        result["setCalls"] = stats.setCalls;
        result["skippedSetCalls"] = stats.skippedSetCalls;
        result["clearCalls"] = stats.clearCalls;
        result["compileCalls"] = stats.compileCalls;
        result["setCommands"] = stats.setCommands;
        result["compiledCommands"] = stats.compiledCommands;
        result["compileMicros"] = stats.compileMicros;
        result["topSetByKey"] = pushTopEntriesTable(lua, stats.topSetByKey);
        result["topSkippedSetByKey"] = pushTopEntriesTable(lua, stats.topSkippedSetByKey);
        result["topCompileByKey"] = pushTopEntriesTable(lua, stats.topCompileByKey);
        return result;
    };

    lua["setClipboardText"] = [](const std::string& text) -> bool {
        juce::SystemClipboard::copyTextToClipboard(juce::String(text));
        return true;
    };

    lua["getClipboardText"] = []() -> std::string {
        return juce::SystemClipboard::getTextFromClipboard().toStdString();
    };

    // Debug outline control for ImGuiDirectHost (performance mode)
    lua["setDebugOutlinesEnabled"] = [&state](bool enabled) {
        state.setDebugOutlinesEnabled(enabled);
    };

    lua["areDebugOutlinesEnabled"] = [&state]() -> bool {
        return state.areDebugOutlinesEnabled();
    };

    lua["getDebugHoveredNodeId"] = [&state]() -> std::string {
        return state.getDebugHoveredNodeId();
    };

    lua["getDebugSelectedNodeId"] = [&state]() -> std::string {
        return state.getDebugSelectedNodeId();
    };

    // CopyID mode bindings
    lua["setCopyIdModeEnabled"] = [&state](bool enabled) {
        state.setCopyIdModeEnabled(enabled);
    };

    lua["isCopyIdModeEnabled"] = [&state]() -> bool {
        return state.isCopyIdModeEnabled();
    };

    lua["writeTextFile"] = [](const std::string& path,
                               const std::string& text) -> bool {
        juce::File outFile(path);
        return outFile.replaceWithText(juce::String(text), false, false, "\n");
    };

    lua["readTextFile"] = [](const std::string& path) -> std::string {
        juce::File inFile(path);
        if (!inFile.existsAsFile()) {
            return "";
        }
        return inFile.loadFileAsString().toStdString();
    };

    lua["listFilesRecursive"] = [&lua](const std::string& rootPath) -> sol::table {
        auto result = sol::table(lua, sol::create);
        juce::File root(rootPath);
        if (!root.isDirectory()) {
            return result;
        }

        auto files = root.findChildFiles(juce::File::findFiles, true);
        files.sort();

        int index = 1;
        for (const auto& file : files) {
            const auto ext = file.getFileExtension();
            if (ext != ".lua" && ext != ".json5") {
                continue;
            }
            result[index++] = file.getFullPathName().toStdString();
        }
        return result;
    };

    lua["listDspScripts"] = [&lua]() -> sol::table {
        const auto signature = currentDspScriptsSignature();
        auto& cache = scriptListingCacheState();
        std::vector<ScriptListEntry> entries;
        bool cacheHit = false;
        {
            std::lock_guard<std::mutex> lock(cache.mutex);
            if (cache.dspValid && cache.dspSignature == signature) {
                entries = cache.dspEntries;
                ++cache.dspHits;
                cacheHit = true;
            }
        }

        if (!cacheHit) {
            entries = scanDspScripts();
            std::lock_guard<std::mutex> lock(cache.mutex);
            cache.dspEntries = entries;
            cache.dspSignature = signature;
            cache.dspValid = true;
            ++cache.dspBuilds;
        }

        return scriptListToLua(lua, entries);
    };

    // Settings table - persistent configuration
    auto settingsTable = lua.create_table();
    
    settingsTable["getUserScriptsDir"] = []() -> std::string {
        return Settings::getInstance().getUserScriptsDir().toStdString();
    };
    
    settingsTable["setUserScriptsDir"] = [](const std::string& path) {
        Settings::getInstance().setUserScriptsDir(juce::String(path));
        Settings::getInstance().save();
        invalidateScriptListingCaches();
    };
    
    settingsTable["getDevScriptsDir"] = []() -> std::string {
        return Settings::getInstance().getDevScriptsDir().toStdString();
    };
    
    settingsTable["setDevScriptsDir"] = [](const std::string& path) {
        Settings::getInstance().setDevScriptsDir(juce::String(path));
        Settings::getInstance().save();
        invalidateScriptListingCaches();
    };
    
    settingsTable["getOscPort"] = []() -> int {
        return Settings::getInstance().getOscPort();
    };
    
    settingsTable["setOscPort"] = [](int port) {
        Settings::getInstance().setOscPort(port);
        Settings::getInstance().save();
    };
    
    settingsTable["getOscQueryPort"] = []() -> int {
        return Settings::getInstance().getOscQueryPort();
    };
    
    settingsTable["setOscQueryPort"] = [](int port) {
        Settings::getInstance().setOscQueryPort(port);
        Settings::getInstance().save();
    };
    
    settingsTable["save"] = []() {
        Settings::getInstance().save();
    };
    
    settingsTable["getConfigPath"] = []() -> std::string {
        return Settings::getInstance().getConfigPath().toStdString();
    };
    
    // Async directory chooser - calls callback(path) when user selects
    settingsTable["browseForUserScriptsDir"] = [&state](sol::function callback) {
        std::fprintf(stderr, "[LuaSettings] browseForUserScriptsDir called\n");
        auto currentDir = Settings::getInstance().getUserScriptsDir();
        std::fprintf(stderr, "[LuaSettings] currentDir='%s'\n", currentDir.toRawUTF8());
        if (currentDir.isEmpty()) {
            currentDir = juce::File::getSpecialLocation(juce::File::userHomeDirectory).getFullPathName();
            std::fprintf(stderr, "[LuaSettings] using home dir: '%s'\n", currentDir.toRawUTF8());
        }
        std::fprintf(stderr, "[LuaSettings] calling showDirectoryChooser...\n");
        state.showDirectoryChooser("Select User Scripts Directory", 
                                    currentDir.toStdString(), 
                                    callback);
        std::fprintf(stderr, "[LuaSettings] showDirectoryChooser returned\n");
    };
    
    // DSP scripts directory
    settingsTable["getDspScriptsDir"] = []() -> std::string {
        return Settings::getInstance().getDspScriptsDir().toStdString();
    };
    
    settingsTable["setDspScriptsDir"] = [](const std::string& path) {
        Settings::getInstance().setDspScriptsDir(juce::String(path));
        Settings::getInstance().save();
        invalidateScriptListingCaches();
    };
    
    settingsTable["browseForDspScriptsDir"] = [&state](sol::function callback) {
        auto currentDir = Settings::getInstance().getDspScriptsDir();
        if (currentDir.isEmpty()) {
            currentDir = juce::File::getSpecialLocation(juce::File::userHomeDirectory).getFullPathName();
        }
        state.showDirectoryChooser("Select DSP Scripts Directory", 
                                    currentDir.toStdString(), 
                                    callback);
    };
    
    std::fprintf(stderr, "[LuaControlBindings] About to set lua['settings']...\n");
    lua["settings"] = settingsTable;
    
    // Debug: verify settings table was created properly
    std::fprintf(stderr, "[LuaSettings] Registered settings table with %zu entries\n", 
                 settingsTable.size());
    std::fprintf(stderr, "[LuaSettings] browseForUserScriptsDir valid: %d\n", 
                 settingsTable["browseForUserScriptsDir"].valid() ? 1 : 0);
    
    // Verify it was actually set
    auto verifyTable = lua["settings"];
    std::fprintf(stderr, "[LuaSettings] Verification - lua['settings'] type: %s\n", 
                 verifyTable.get_type() == sol::type::table ? "table" : "not table");
    
    // SystemPaths table - directory resolution
    auto pathsTable = lua.create_table();
    
    pathsTable["getSystemScriptsDir"] = []() -> std::string {
        return SystemPaths::getSystemScriptsDir().getFullPathName().toStdString();
    };
    
    pathsTable["getUserScriptsDir"] = []() -> std::string {
        return SystemPaths::getUserScriptsDir().getFullPathName().toStdString();
    };
    
    pathsTable["getSystemProjectsDir"] = []() -> std::string {
        return SystemPaths::getSystemProjectsDir().getFullPathName().toStdString();
    };
    
    pathsTable["getUserProjectsDir"] = []() -> std::string {
        return SystemPaths::getUserProjectsDir().getFullPathName().toStdString();
    };
    
    lua["systemPaths"] = pathsTable;
    
    // ==========================================================================
    // ImGui immediate-mode API bindings for onImGuiFrame callbacks.
    // These may ONLY be called inside an onImGuiFrame callback (between
    // ImGui::NewFrame() and ImGui::Render()). Calling outside that context
    // will trigger ImGui asserts / undefined behaviour.
    // ==========================================================================
    lua["imguiBeginMainMenuBar"] = []() -> bool { return ImGui::BeginMainMenuBar(); };
    lua["imguiEndMainMenuBar"]   = []() { ImGui::EndMainMenuBar(); };
    lua["imguiBeginMenuBar"]     = []() -> bool { return ImGui::BeginMenuBar(); };
    lua["imguiEndMenuBar"]       = []() { ImGui::EndMenuBar(); };
    lua["imguiBeginMenu"]        = [](const char* label, sol::optional<bool> enabled) -> bool {
        return ImGui::BeginMenu(label, enabled.value_or(true));
    };
    lua["imguiEndMenu"]          = []() { ImGui::EndMenu(); };
    lua["imguiMenuItem"]         = [](const char* label, sol::optional<const char*> shortcut, sol::optional<bool> selected, sol::optional<bool> enabled) -> bool {
        return ImGui::MenuItem(label, shortcut.value_or(nullptr), selected.value_or(false), enabled.value_or(true));
    };
    lua["imguiSeparator"]        = []() { ImGui::Separator(); };
    lua["imguiOpenPopup"]        = [](const char* id) { ImGui::OpenPopup(id); };
    lua["imguiBeginPopup"]       = [](const char* id) -> bool { return ImGui::BeginPopup(id); };
    lua["imguiBeginPopupModal"]  = [](const char* id, sol::optional<int> flags) -> bool {
        return ImGui::BeginPopupModal(id, nullptr, static_cast<ImGuiWindowFlags>(flags.value_or(0)));
    };
    lua["imguiEndPopup"]         = []() { ImGui::EndPopup(); };
    lua["imguiCloseCurrentPopup"]= []() { ImGui::CloseCurrentPopup(); };
    lua["imguiSelectable"]       = [](const char* label, sol::optional<bool> selected, sol::optional<int> flags, sol::optional<float> w, sol::optional<float> h) -> bool {
        return ImGui::Selectable(label, selected.value_or(false), static_cast<ImGuiSelectableFlags>(flags.value_or(0)), ImVec2(w.value_or(0), h.value_or(0)));
    };
    lua["imguiButton"]           = [](const char* label, sol::optional<float> w, sol::optional<float> h) -> bool {
        return ImGui::Button(label, ImVec2(w.value_or(0), h.value_or(0)));
    };
    lua["imguiText"]             = [](const char* text) { ImGui::TextUnformatted(text); };
    lua["imguiSameLine"]         = [](sol::optional<float> offset, sol::optional<float> spacing) {
        ImGui::SameLine(offset.value_or(0.0f), spacing.value_or(-1.0f));
    };
    lua["imguiPushStyleColor"]   = [](int idx, sol::object r, sol::optional<double> g, sol::optional<double> b, sol::optional<double> a) -> bool {
        if (g.has_value() && b.has_value() && a.has_value()) {
            ImGui::PushStyleColor(static_cast<ImGuiCol>(idx), ImVec4(static_cast<float>(r.as<double>()), static_cast<float>(*g), static_cast<float>(*b), static_cast<float>(*a)));
        } else {
            // Single uint32 color
            uint32_t col = r.is<uint32_t>() ? r.as<uint32_t>() : static_cast<uint32_t>(r.as<double>());
            float fr = static_cast<float>((col >> 16) & 0xffu) / 255.0f;
            float fg = static_cast<float>((col >> 8) & 0xffu) / 255.0f;
            float fb = static_cast<float>(col & 0xffu) / 255.0f;
            float fa = static_cast<float>((col >> 24) & 0xffu) / 255.0f;
            ImGui::PushStyleColor(static_cast<ImGuiCol>(idx), ImVec4(fr, fg, fb, fa));
        }
        return true;
    };
    lua["imguiPopStyleColor"]     = [](sol::optional<int> count) { ImGui::PopStyleColor(count.value_or(1)); };
    lua["imguiGetContentRegionAvail"] = [&lua]() -> sol::table {
        ImVec2 avail = ImGui::GetContentRegionAvail();
        auto t = sol::table(lua, sol::create);
        t["x"] = avail.x;
        t["y"] = avail.y;
        return t;
    };
    lua["imguiSetNextWindowSize"] = [](float w, float h, sol::optional<int> cond) {
        ImGui::SetNextWindowSize(ImVec2(w, h), static_cast<ImGuiCond>(cond.value_or(static_cast<int>(ImGuiCond_Appearing))));
    };
    lua["imguiSetNextWindowPos"] = [](float x, float y, sol::optional<int> cond) {
        ImGui::SetNextWindowPos(ImVec2(x, y), static_cast<ImGuiCond>(cond.value_or(0)));
    };
    lua["imguiCond_None"] = static_cast<int>(ImGuiCond_None);
    lua["imguiCond_Always"] = static_cast<int>(ImGuiCond_Always);
    lua["imguiCond_Appearing"] = static_cast<int>(ImGuiCond_Appearing);
    lua["imguiWindowFlags_NoResize"] = static_cast<int>(ImGuiWindowFlags_NoResize);
    lua["imguiWindowFlags_NoMove"] = static_cast<int>(ImGuiWindowFlags_NoMove);
    lua["imguiWindowFlags_NoCollapse"] = static_cast<int>(ImGuiWindowFlags_NoCollapse);
    lua["imguiWindowFlags_NoScrollbar"] = static_cast<int>(ImGuiWindowFlags_NoScrollbar);
    lua["imguiColorFlags_None"] = static_cast<int>(ImGuiColorEditFlags_None);

    std::fprintf(stderr, "[LuaControlBindings] Registered systemPaths table + imgui bindings\n");
}
