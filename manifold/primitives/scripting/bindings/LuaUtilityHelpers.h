#pragma once

#define SOL_ALL_SAFETIES_ON 1
#include <sol/sol.hpp>

#include <juce_core/juce_core.h>

#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace lua_utility_helpers {

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

ScriptListingCacheState& scriptListingCacheState();

sol::table pushTopEntriesTable(sol::state& lua,
                               const std::vector<std::pair<std::string, uint64_t>>& entries);
sol::table scriptListToLua(sol::state& lua,
                           const std::vector<ScriptListEntry>& entries);

void invalidateScriptListingCaches();

bool isUiScriptFile(const juce::File& script);
bool isProjectManifestFile(const juce::File& file);
std::string normalizeUIRendererMode(const std::string& raw);
bool isValidUIRendererMode(const std::string& mode);
double highResNowSeconds();
float mlClamp01(float v);
float mlSigmoid(float x);
float mlSmoothstep(float edge0, float edge1, float x);
float mlPostprocessMaskValue(float rawValue,
                             float gain,
                             bool useSigmoid,
                             float threshold,
                             float feather,
                             bool invert,
                             bool applySigmoid);
float mlSampleMaskNearest(const std::vector<float>& mask,
                          int maskW,
                          int maskH,
                          int dstX,
                          int dstY,
                          int dstW,
                          int dstH);
const char* uiRendererModeToString(int mode);
juce::String readProjectDisplayName(const juce::File& manifestFile);
std::string currentUiScriptsSignature();
std::string currentDspScriptsSignature();
std::vector<ScriptListEntry> scanUiScripts();
std::vector<ScriptListEntry> scanDspScripts();

} // namespace lua_utility_helpers
