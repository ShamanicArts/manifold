#include "LuaUtilityHelpers.h"

#include "../../core/Settings.h"
#include "../../core/SystemPaths.h"

#include <algorithm>
#include <cstdio>
#include <cmath>
#include <map>
#include <mutex>
#include <set>
#include <string>
#include <unordered_map>
#include <unordered_set>
#include <vector>

namespace lua_utility_helpers {

ScriptListingCacheState& scriptListingCacheState() {
    static ScriptListingCacheState state;
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

double highResNowSeconds() {
    return juce::Time::highResolutionTicksToSeconds(juce::Time::getHighResolutionTicks());
}

float mlClamp01(float v) {
    return std::clamp(v, 0.0f, 1.0f);
}

float mlSigmoid(float x) {
    if (x >= 0.0f) {
        const float z = std::exp(-x);
        return 1.0f / (1.0f + z);
    }
    const float z = std::exp(x);
    return z / (1.0f + z);
}

float mlSmoothstep(float edge0, float edge1, float x) {
    if (edge1 <= edge0) {
        return x >= edge1 ? 1.0f : 0.0f;
    }
    const float t = mlClamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3.0f - 2.0f * t);
}

float mlPostprocessMaskValue(float rawValue,
                             float gain,
                             bool useSigmoid,
                             float threshold,
                             float feather,
                             bool invert,
                             bool applySigmoid) {
    float value = rawValue;
    if (useSigmoid && applySigmoid) {
        value = mlSigmoid(value);
    }
    value = mlClamp01(value * std::max(0.01f, gain));

    if (feather > 0.0f) {
        const float half = feather * 0.5f;
        value = mlSmoothstep(threshold - half, threshold + half, value);
    } else {
        value = value >= threshold ? 1.0f : 0.0f;
    }

    if (invert) {
        value = 1.0f - value;
    }
    return mlClamp01(value);
}

float mlSampleMaskNearest(const std::vector<float>& mask,
                          int maskW,
                          int maskH,
                          int dstX,
                          int dstY,
                          int dstW,
                          int dstH) {
    if (mask.empty() || maskW <= 0 || maskH <= 0 || dstW <= 0 || dstH <= 0) {
        return 0.0f;
    }
    const float u = (static_cast<float>(dstX) + 0.5f) / static_cast<float>(dstW);
    const float v = (static_cast<float>(dstY) + 0.5f) / static_cast<float>(dstH);
    const int sx = std::clamp(static_cast<int>(u * static_cast<float>(maskW)), 0, maskW - 1);
    const int sy = std::clamp(static_cast<int>(v * static_cast<float>(maskH)), 0, maskH - 1);
    return mask[static_cast<std::size_t>(sy) * static_cast<std::size_t>(maskW) + static_cast<std::size_t>(sx)];
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

} // namespace lua_utility_helpers
