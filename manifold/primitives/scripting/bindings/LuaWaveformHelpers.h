#pragma once

#define SOL_ALL_SAFETIES_ON 1
#include <sol/sol.hpp>

#include "dsp/core/nodes/PartialData.h"
#include "dsp/core/nodes/SampleAnalysis.h"
#include "dsp/core/nodes/TemporalPartialData.h"

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>

#include <cstdint>
#include <mutex>
#include <string>
#include <unordered_map>
#include <utility>
#include <vector>

namespace lua_waveform_helpers {

struct CapturePeaksDebugStats {
    std::mutex mutex;
    uint64_t calls = 0;
    uint64_t totalBuckets = 0;
    uint64_t totalMicros = 0;
    std::unordered_map<std::string, uint64_t> callsByPath;
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

CapturePeaksDebugStats& capturePeaksDebugStats();
WaveformPeakCacheState& waveformPeakCacheState();
void invalidateWaveformPeakCache();
void recordCapturePeaksCall(const std::string& path, int numBuckets, uint64_t elapsedMicros);
std::vector<std::pair<std::string, uint64_t>> topCaptureEntries(
    const std::unordered_map<std::string, uint64_t>& source,
    size_t limit = 12);

sol::table sampleAnalysisToLua(sol::state& lua, const dsp_primitives::SampleAnalysis& analysis);
sol::table partialDataToLua(sol::state& lua, const dsp_primitives::PartialData& partials);
std::vector<float> harmonicWeightsFromLuaObject(const sol::object& harmonicsObj);
juce::AudioBuffer<float> renderSineBankBuffer(const dsp_primitives::PartialData& partials,
                                              float targetFrequency,
                                              float amplitude,
                                              float sampleRate,
                                              int numSamples,
                                              float stereoSpread = 0.0f);

inline constexpr double kWaveformPeakCacheWindowSeconds = 1.0 / 30.0;
inline constexpr size_t kWaveformPeakCacheMaxEntries = 128;

double highResNowSeconds();
std::string makeWaveformPeakCacheKey(const char* kind,
                                     const std::string& path,
                                     int a,
                                     int b,
                                     int c);
std::string makeWaveformPeakCacheKey(const char* kind,
                                     uintptr_t ptr,
                                     int a,
                                     int b,
                                     int c);
std::string makeWaveformPeakCacheKey(const char* kind,
                                     int a,
                                     int b,
                                     int c);
bool tryGetWaveformPeakCache(const std::string& key,
                             std::vector<float>& outPeaks,
                             double maxAgeSeconds = kWaveformPeakCacheWindowSeconds);
void storeWaveformPeakCache(const std::string& key,
                            const std::vector<float>& peaks);

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

} // namespace lua_waveform_helpers
