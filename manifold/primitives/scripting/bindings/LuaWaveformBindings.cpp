#include "LuaWaveformBindings.h"

#include "LuaUtilityHelpers.h"
#include "LuaWaveformHelpers.h"
#include "../ILuaControlState.h"
#include "../ScriptableProcessor.h"
#include "../PrimitiveGraph.h"
#include "dsp/core/nodes/PartialData.h"
#include "dsp/core/nodes/PrimitiveNodes.h"
#include "dsp/core/nodes/PitchDetector.h"
#include "dsp/core/nodes/RetrospectiveCaptureNode.h"
#include "dsp/core/nodes/SineBankNode.h"
#include "dsp/core/graph/PrimitiveNode.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <vector>

namespace {
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
} // namespace

namespace lua_bindings {
using namespace lua_waveform_helpers;
using lua_utility_helpers::pushTopEntriesTable;

void registerWaveformBindings(sol::state& lua,
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

} // namespace lua_bindings
