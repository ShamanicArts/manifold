#include "LuaWaveformHelpers.h"

#include "dsp/core/nodes/PitchDetector.h"
#include "dsp/core/nodes/SineBankNode.h"
#include "dsp/core/nodes/TemporalPartialData.h"

#include <algorithm>
#include <cmath>

namespace lua_waveform_helpers {

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

CapturePeaksDebugStats& capturePeaksDebugStats() {
    static CapturePeaksDebugStats stats;
    return stats;
}

WaveformPeakCacheState& waveformPeakCacheState() {
    static WaveformPeakCacheState state;
    return state;
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
                                                                size_t limit) {
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
                             double maxAgeSeconds) {
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
                                              float stereoSpread) {
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

} // namespace lua_waveform_helpers
