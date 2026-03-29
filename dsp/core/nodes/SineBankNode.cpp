#include "dsp/core/nodes/SineBankNode.h"
#include "dsp/core/nodes/OscillatorNode.h"
#include "dsp/core/nodes/SampleRegionPlaybackNode.h"

#include <algorithm>
#include <cmath>

namespace dsp_primitives {

namespace {
inline float foldToUnit(float x) {
    x = juce::jlimit(-32.0f, 32.0f, x);
    while (x > 1.0f || x < -1.0f) {
        if (x > 1.0f) {
            x = 2.0f - x;
        } else {
            x = -2.0f - x;
        }
    }
    return x;
}

inline float applyDriveTransfer(float sample, float drive, int shape) {
    const float drv = juce::jlimit(0.0f, 20.0f, drive);
    if (drv <= 0.0001f) {
        return juce::jlimit(-1.0f, 1.0f, sample);
    }

    switch (juce::jlimit(0, 3, shape)) {
        case 1: {
            const float gain = 1.0f + drv * 1.35f;
            const float normaliser = std::atan(gain);
            if (normaliser <= 1.0e-6f) {
                return juce::jlimit(-1.0f, 1.0f, sample);
            }
            return std::atan(sample * gain) / normaliser;
        }
        case 2: {
            const float gain = 1.0f + drv * 1.2f;
            return juce::jlimit(-1.0f, 1.0f, sample * gain);
        }
        case 3: {
            const float gain = 1.0f + drv * 1.1f;
            return foldToUnit(sample * gain);
        }
        case 0:
        default: {
            const float gain = 1.0f + drv * 0.85f;
            const float normaliser = std::tanh(gain);
            if (normaliser <= 1.0e-6f) {
                return juce::jlimit(-1.0f, 1.0f, sample);
            }
            return std::tanh(sample * gain) / normaliser;
        }
    }
}

inline float applyDriveShape(float sample, float drive, int shape, float bias, float mix) {
    const float drv = juce::jlimit(0.0f, 20.0f, drive);
    const float wetMix = juce::jlimit(0.0f, 1.0f, mix);
    if (drv <= 0.0001f || wetMix <= 0.0001f) {
        return juce::jlimit(-1.0f, 1.0f, sample);
    }

    const float biasOffset = juce::jlimit(-1.0f, 1.0f, bias) * 0.75f;
    const float center = applyDriveTransfer(biasOffset, drv, shape);
    const float pos = std::abs(applyDriveTransfer(1.0f + biasOffset, drv, shape) - center);
    const float neg = std::abs(applyDriveTransfer(-1.0f + biasOffset, drv, shape) - center);
    const float normaliser = std::max(1.0e-6f, std::max(pos, neg));
    const float shaped = (applyDriveTransfer(sample + biasOffset, drv, shape) - center) / normaliser;
    const float wet = juce::jlimit(-1.0f, 1.0f, shaped);
    return juce::jlimit(-1.0f, 1.0f, sample + (wet - sample) * wetMix);
}

constexpr int kSpectralModeManual = 0;
constexpr int kSpectralModeAdd = 1;
constexpr int kSpectralModeMorph = 2;
constexpr int kSpectralAddFlavorSelf = 0;
constexpr int kSpectralAddFlavorDriven = 1;

inline bool hasUsableSamplePartials(const PartialData& partials) {
    return partials.activeCount > 0 && partials.fundamental > 0.0f;
}

inline PartialData normalizeToRatioSpace(const PartialData& partials) {
    if (partials.activeCount <= 0) {
        return {};
    }

    float fundamental = partials.fundamental;
    if (fundamental <= 1.0e-6f && partials.activeCount > 0) {
        fundamental = partials.frequencies[0];
    }
    if (fundamental <= 1.0e-6f) {
        return {};
    }

    PartialData result = partials;
    result.fundamental = 1.0f;
    result.activeCount = juce::jlimit(0, PartialData::kMaxPartials, partials.activeCount);
    result.algorithm = partials.algorithm + std::string("-ratio");

    for (int i = 0; i < result.activeCount; ++i) {
        const auto idx = static_cast<size_t>(i);
        const float freq = partials.frequencies[idx];
        result.frequencies[idx] = (freq > 0.0f) ? std::max(0.01f, freq / fundamental) : 0.0f;
        result.amplitudes[idx] = std::max(0.0f, partials.amplitudes[idx]);
        result.phases[idx] = partials.phases[idx];
        result.decayRates[idx] = std::max(0.0f, partials.decayRates[idx]);
    }
    for (int i = result.activeCount; i < PartialData::kMaxPartials; ++i) {
        const auto idx = static_cast<size_t>(i);
        result.frequencies[idx] = 0.0f;
        result.amplitudes[idx] = 0.0f;
        result.phases[idx] = 0.0f;
        result.decayRates[idx] = 0.0f;
    }
    return result;
}

inline float buildDrivenWaveWeight(int waveform, int harmonicNumber, float pulseWidth) {
    const int wf = juce::jlimit(0, 7, waveform);
    const int h = std::max(1, harmonicNumber);
    const float width = juce::jlimit(0.01f, 0.99f, pulseWidth);

    switch (wf) {
        case 0: return (h == 1) ? 1.0f : 0.0f;
        case 1: return 1.0f / static_cast<float>(h);
        case 2: return ((h % 2) == 1) ? (1.0f / static_cast<float>(h)) : 0.0f;
        case 3: return ((h % 2) == 1) ? (1.0f / static_cast<float>(h * h)) : 0.0f;
        case 4: return ((h == 1) ? 0.45f : 0.0f) + (0.55f / static_cast<float>(h));
        case 5: return 1.0f / std::sqrt(static_cast<float>(h));
        case 6: return std::abs(std::sin(static_cast<float>(juce::MathConstants<double>::pi) * static_cast<float>(h) * width))
                        / static_cast<float>(h);
        case 7:
            return (1.0f / static_cast<float>(h))
                * (1.0f + 0.22f * std::cos(static_cast<float>(h) * 0.73f)
                   + 0.15f * std::sin(static_cast<float>(h) * 1.11f));
        default:
            return 1.0f / static_cast<float>(h);
    }
}

inline PartialData buildDrivenSamplePartials(const PartialData& sourcePartials, int waveform, float pulseWidth) {
    if (!hasUsableSamplePartials(sourcePartials)) {
        return sourcePartials;
    }

    PartialData result;
    result.fundamental = sourcePartials.fundamental;
    result.inharmonicity = sourcePartials.inharmonicity;
    result.brightness = sourcePartials.brightness;
    result.rmsLevel = sourcePartials.rmsLevel;
    result.peakLevel = sourcePartials.peakLevel;
    result.attackTimeMs = sourcePartials.attackTimeMs;
    result.spectralCentroidHz = sourcePartials.spectralCentroidHz;
    result.analysisStartSample = sourcePartials.analysisStartSample;
    result.analysisEndSample = sourcePartials.analysisEndSample;
    result.numSamples = sourcePartials.numSamples;
    result.numChannels = sourcePartials.numChannels;
    result.sampleRate = sourcePartials.sampleRate;
    result.isPercussive = sourcePartials.isPercussive;
    result.isReliable = sourcePartials.isReliable;
    result.algorithm = "wave-driven-additive";

    float maxAmp = 0.0f;
    int added = 0;
    const int limit = std::min(8, juce::jlimit(0, PartialData::kMaxPartials, sourcePartials.activeCount));
    for (int i = 0; i < limit && added < PartialData::kMaxPartials; ++i) {
        const auto idx = static_cast<size_t>(i);
        const float srcAmp = std::max(0.0f, sourcePartials.amplitudes[idx]);
        const float weight = std::max(0.0f, buildDrivenWaveWeight(waveform, i + 1, pulseWidth));
        const float amp = srcAmp * weight;
        result.frequencies[static_cast<size_t>(added)] = sourcePartials.frequencies[idx];
        result.amplitudes[static_cast<size_t>(added)] = amp;
        result.phases[static_cast<size_t>(added)] = sourcePartials.phases[idx];
        result.decayRates[static_cast<size_t>(added)] = sourcePartials.decayRates[idx];
        maxAmp = std::max(maxAmp, amp);
        ++added;
    }

    if (maxAmp <= 1.0e-6f) {
        return {};
    }

    PartialData pruned = result;
    pruned.activeCount = 0;
    for (int i = 0; i < added && pruned.activeCount < PartialData::kMaxPartials; ++i) {
        const auto idx = static_cast<size_t>(i);
        if (result.amplitudes[idx] > (maxAmp * 0.02f)) {
            const auto outIdx = static_cast<size_t>(pruned.activeCount);
            pruned.frequencies[outIdx] = result.frequencies[idx];
            pruned.amplitudes[outIdx] = result.amplitudes[idx] / maxAmp;
            pruned.phases[outIdx] = result.phases[idx];
            pruned.decayRates[outIdx] = result.decayRates[idx];
            ++pruned.activeCount;
        }
    }
    if (pruned.activeCount <= 0) {
        return {};
    }
    return pruned;
}

inline PartialData applySpectralShaping(const PartialData& partials, float stretch, int tiltMode) {
    const float clampedStretch = juce::jlimit(0.0f, 1.0f, stretch);
    const int clampedTiltMode = juce::jlimit(0, 2, tiltMode);
    if (partials.activeCount <= 0 || (clampedStretch <= 0.001f && clampedTiltMode == 0)) {
        return partials;
    }

    PartialData result = partials;
    const int count = std::max(1, juce::jlimit(0, PartialData::kMaxPartials, partials.activeCount));
    result.activeCount = count;

    for (int i = 0; i < count; ++i) {
        const auto idx = static_cast<size_t>(i);
        const int partialIdx = i;
        const float spectralPos = (count > 1)
            ? static_cast<float>(partialIdx) / static_cast<float>(count - 1)
            : 0.0f;
        float freq = partials.frequencies[idx];
        float amp = partials.amplitudes[idx];

        if (freq > 0.01f && clampedStretch > 0.001f) {
            const float stretchPow = 1.0f + clampedStretch * 0.65f;
            const float spreadBias = 1.0f + static_cast<float>(partialIdx) * clampedStretch * 0.035f;
            freq = std::pow(freq, stretchPow) * spreadBias;
        }
        if (amp > 0.0f) {
            if (clampedTiltMode == 1) {
                const float tiltGain = 0.90f + spectralPos * 1.75f;
                amp *= tiltGain;
            } else if (clampedTiltMode == 2) {
                const float tiltGain = 1.12f - spectralPos * 0.78f;
                amp *= std::max(0.18f, tiltGain);
            }
        }

        result.frequencies[idx] = freq;
        result.amplitudes[idx] = amp;
    }

    return result;
}

inline PartialData morphRatioPartials(const PartialData& partialsA,
                                      const PartialData& partialsB,
                                      float position,
                                      int curve,
                                      float depth) {
    const bool hasA = partialsA.activeCount > 0;
    const bool hasB = partialsB.activeCount > 0;
    if (!hasA && !hasB) {
        return {};
    }
    if (!hasA) {
        return partialsB;
    }
    if (!hasB) {
        return partialsA;
    }

    const float pos = juce::jlimit(0.0f, 1.0f, position);
    const float dep = juce::jlimit(0.0f, 1.0f, depth);
    float aCoeff = 1.0f - pos;
    float bCoeff = pos;
    switch (juce::jlimit(0, 2, curve)) {
        case 1: {
            const float t = 0.5f - 0.5f * std::cos(pos * static_cast<float>(juce::MathConstants<double>::pi));
            aCoeff = 1.0f - t;
            bCoeff = t;
            break;
        }
        case 2:
        default:
            aCoeff = std::cos(pos * static_cast<float>(juce::MathConstants<double>::halfPi));
            bCoeff = std::sin(pos * static_cast<float>(juce::MathConstants<double>::halfPi));
            break;
        case 0:
            break;
    }

    PartialData result;
    result.activeCount = std::min(PartialData::kMaxPartials, std::max(partialsA.activeCount, partialsB.activeCount));
    result.fundamental = 1.0f;
    result.algorithm = "spectral-morph";

    const float freqMorphT = pos * dep;
    for (int i = 0; i < result.activeCount; ++i) {
        const auto idx = static_cast<size_t>(i);
        const float aRatio = (i < partialsA.activeCount) ? partialsA.frequencies[idx] : 0.0f;
        const float aAmp = (i < partialsA.activeCount) ? partialsA.amplitudes[idx] : 0.0f;
        const float aPhase = (i < partialsA.activeCount) ? partialsA.phases[idx] : 0.0f;
        const float aDecay = (i < partialsA.activeCount) ? partialsA.decayRates[idx] : 0.0f;
        const float bRatio = (i < partialsB.activeCount) ? partialsB.frequencies[idx] : 0.0f;
        const float bAmp = (i < partialsB.activeCount) ? partialsB.amplitudes[idx] : 0.0f;
        const float bPhase = (i < partialsB.activeCount) ? partialsB.phases[idx] : 0.0f;
        const float bDecay = (i < partialsB.activeCount) ? partialsB.decayRates[idx] : 0.0f;

        float morphRatio = 0.0f;
        if (aRatio <= 0.01f && bRatio <= 0.01f) {
            morphRatio = 0.0f;
        } else if (aRatio <= 0.01f) {
            morphRatio = bRatio;
        } else if (bRatio <= 0.01f) {
            morphRatio = aRatio;
        } else {
            morphRatio = std::exp(std::log(aRatio) + (std::log(bRatio) - std::log(aRatio)) * freqMorphT);
        }

        result.frequencies[idx] = morphRatio;
        result.amplitudes[idx] = aAmp * aCoeff + bAmp * bCoeff;
        result.phases[idx] = aPhase + (bPhase - aPhase) * pos;
        result.decayRates[idx] = aDecay + (bDecay - aDecay) * pos;
    }

    return result;
}
}

SineBankNode::SineBankNode() = default;

void SineBankNode::setSpectralSamplePlayback(const std::shared_ptr<SampleRegionPlaybackNode>& playback) {
    std::atomic_store_explicit(&spectralSamplePlayback_, playback, std::memory_order_release);
}

void SineBankNode::clearSpectralSamplePlayback() {
    std::atomic_store_explicit(&spectralSamplePlayback_, std::shared_ptr<SampleRegionPlaybackNode>{}, std::memory_order_release);
}

bool SineBankNode::hasSpectralSamplePlayback() const {
    return static_cast<bool>(std::atomic_load_explicit(&spectralSamplePlayback_, std::memory_order_acquire));
}

void SineBankNode::setFrequency(float freq) {
    targetFrequency_.store(juce::jlimit(1.0f, 20000.0f, freq), std::memory_order_release);
}

void SineBankNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;

    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    const double freqTimeSeconds = 0.02;
    const double ampTimeSeconds = 0.01;
    const double detuneTimeSeconds = 0.012;
    const double spreadTimeSeconds = 0.012;
    const double unisonVoiceTimeSeconds = 0.008;
    const double partialAmpTimeSeconds = 0.005; // 5ms for partial amplitude smoothing
    const double phraseGainTimeSeconds = 0.008;
    freqSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (freqTimeSeconds * sampleRate_)));
    ampSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (ampTimeSeconds * sampleRate_)));
    detuneSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (detuneTimeSeconds * sampleRate_)));
    spreadSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (spreadTimeSeconds * sampleRate_)));
    unisonVoiceSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (unisonVoiceTimeSeconds * sampleRate_)));
    partialAmpSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (partialAmpTimeSeconds * sampleRate_)));
    phraseGainSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (phraseGainTimeSeconds * sampleRate_)));
    freqSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, freqSmoothingCoeff_);
    ampSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, ampSmoothingCoeff_);
    detuneSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, detuneSmoothingCoeff_);
    spreadSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, spreadSmoothingCoeff_);
    unisonVoiceSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, unisonVoiceSmoothingCoeff_);
    partialAmpSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, partialAmpSmoothingCoeff_);
    phraseGainSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, phraseGainSmoothingCoeff_);

    currentFrequency_ = targetFrequency_.load(std::memory_order_acquire);
    currentAmplitude_ = targetAmplitude_.load(std::memory_order_acquire);
    currentDetuneCents_ = detuneCents_.load(std::memory_order_acquire);
    currentSpread_ = stereoSpread_.load(std::memory_order_acquire);
    currentSpectralPhraseGain_ = spectralPhraseGain_.load(std::memory_order_acquire);
    currentPartialAmplitudes_.fill(0.0f);
    reset();
    prepared_ = true;
}

void SineBankNode::reset() {
    prevSyncSample_ = 0.0f;
    for (int v = 0; v < kMaxUnisonVoices; ++v) {
        for (int i = 0; i < kMaxPartials; ++i) {
            runningPhases_[static_cast<size_t>(v)][static_cast<size_t>(i)] = partialPhaseOffsets_[static_cast<size_t>(i)];
        }
        unisonVoiceGains_[static_cast<size_t>(v)] = (v == 0) ? 1.0f : 0.0f;
    }
    lastRequestedUnison_ = 1;
    currentSpectralPhraseGain_ = spectralPhraseGain_.load(std::memory_order_acquire);
    // Reset smoothed partial amplitudes to 0 for smooth note-on fade-in
    // (they'll ramp up to target values over ~5ms, eliminating clicks)
    currentPartialAmplitudes_.fill(0.0f);
}

void SineBankNode::clearPartials() {
    activePartials_.store(0, std::memory_order_release);
    referenceFundamental_.store(440.0f, std::memory_order_release);
    partialFrequencies_.fill(0.0f);
    partialAmplitudes_.fill(0.0f);
    partialPhaseOffsets_.fill(0.0f);
    partialDecayRates_.fill(0.0f);
    reset();
}

void SineBankNode::setPartial(int index, float frequency, float amplitude, float phase, float decayRate) {
    if (index < 0 || index >= kMaxPartials) {
        return;
    }

    const size_t idx = static_cast<size_t>(index);
    partialFrequencies_[idx] = juce::jlimit(0.0f, 24000.0f, frequency);
    partialAmplitudes_[idx] = juce::jmax(0.0f, amplitude);
    partialPhaseOffsets_[idx] = phase;
    partialDecayRates_[idx] = juce::jmax(0.0f, decayRate);
    for (int v = 0; v < kMaxUnisonVoices; ++v) {
        runningPhases_[static_cast<size_t>(v)][idx] = phase;
    }
    activePartials_.store(juce::jmax(activePartials_.load(std::memory_order_acquire), index + 1), std::memory_order_release);
}

void SineBankNode::setPartials(const PartialData& data) {
    const int previousCount = activePartials_.load(std::memory_order_acquire);
    const int count = juce::jlimit(0, kMaxPartials, data.activeCount);
    referenceFundamental_.store(data.fundamental > 0.0f ? data.fundamental : 440.0f,
                                std::memory_order_release);

    for (int i = 0; i < count; ++i) {
        const size_t idx = static_cast<size_t>(i);
        partialFrequencies_[idx] = juce::jlimit(0.0f, 24000.0f, data.frequencies[idx]);
        partialAmplitudes_[idx] = juce::jmax(0.0f, data.amplitudes[idx]);
        partialPhaseOffsets_[idx] = data.phases[idx];
        partialDecayRates_[idx] = juce::jmax(0.0f, data.decayRates[idx]);

        if (i >= previousCount) {
            for (int v = 0; v < kMaxUnisonVoices; ++v) {
                runningPhases_[static_cast<size_t>(v)][idx] = partialPhaseOffsets_[idx];
            }
        }
    }

    for (int i = count; i < kMaxPartials; ++i) {
        const size_t idx = static_cast<size_t>(i);
        partialFrequencies_[idx] = 0.0f;
        partialAmplitudes_[idx] = 0.0f;
        partialPhaseOffsets_[idx] = 0.0f;
        partialDecayRates_[idx] = 0.0f;
    }

    activePartials_.store(count, std::memory_order_release);
}

PartialData SineBankNode::getPartials() const {
    PartialData out;
    out.activeCount = activePartials_.load(std::memory_order_acquire);
    out.fundamental = referenceFundamental_.load(std::memory_order_acquire);
    for (int i = 0; i < out.activeCount && i < kMaxPartials; ++i) {
        out.frequencies[static_cast<size_t>(i)] = partialFrequencies_[static_cast<size_t>(i)];
        out.amplitudes[static_cast<size_t>(i)] = partialAmplitudes_[static_cast<size_t>(i)];
        out.phases[static_cast<size_t>(i)] = partialPhaseOffsets_[static_cast<size_t>(i)];
        out.decayRates[static_cast<size_t>(i)] = partialDecayRates_[static_cast<size_t>(i)];
    }
    return out;
}

void SineBankNode::refreshSpectralWaveRecipe() {
    const int waveform = spectralWaveform_.load(std::memory_order_acquire);
    const int partialCount = spectralAdditivePartials_.load(std::memory_order_acquire);
    const float tilt = spectralAdditiveTilt_.load(std::memory_order_acquire);
    const float drift = spectralAdditiveDrift_.load(std::memory_order_acquire);
    const float pulseWidth = spectralPulseWidth_.load(std::memory_order_acquire);

    if (spectralWaveRecipeValid_
        && cachedSpectralWaveform_ == waveform
        && cachedSpectralPartials_ == partialCount
        && std::abs(cachedSpectralTilt_ - tilt) <= 1.0e-6f
        && std::abs(cachedSpectralDrift_ - drift) <= 1.0e-6f
        && std::abs(cachedSpectralPulseWidth_ - pulseWidth) <= 1.0e-6f) {
        return;
    }

    spectralWaveRecipe_ = buildWavePartials(waveform, 1.0f, partialCount, tilt, drift, pulseWidth);
    spectralWaveRecipe_.fundamental = 1.0f;
    spectralWaveRecipeValid_ = spectralWaveRecipe_.activeCount > 0;
    cachedSpectralWaveform_ = waveform;
    cachedSpectralPartials_ = partialCount;
    cachedSpectralTilt_ = tilt;
    cachedSpectralDrift_ = drift;
    cachedSpectralPulseWidth_ = pulseWidth;
}

PartialData SineBankNode::buildSpectralTargetPartials() {
    spectralPhraseGain_.store(1.0f, std::memory_order_release);

    const int mode = spectralMode_.load(std::memory_order_acquire);
    if (mode == kSpectralModeManual) {
        return {};
    }

    const auto playback = std::atomic_load_explicit(&spectralSamplePlayback_, std::memory_order_acquire);
    PartialData samplePartials;
    PartialData referencePartials;
    bool hasSample = false;
    bool usingTemporalFrame = false;

    if (playback) {
        const int temporalFrames = playback->getTemporalFrameCount();
        if (temporalFrames > 1) {
            const float temporalPos = spectralTemporalPosition_.load(std::memory_order_acquire);
            samplePartials = playback->getTemporalFrameAtPosition(
                temporalPos,
                spectralTemporalSmooth_.load(std::memory_order_acquire),
                spectralTemporalContrast_.load(std::memory_order_acquire));
            hasSample = hasUsableSamplePartials(samplePartials);
            usingTemporalFrame = hasSample;
        }

        referencePartials = playback->getLastPartials();

        if (!hasSample) {
            samplePartials = referencePartials;
            hasSample = hasUsableSamplePartials(samplePartials);
        }
    }

    const float stretch = spectralStretch_.load(std::memory_order_acquire);
    const int tiltMode = spectralTiltMode_.load(std::memory_order_acquire);

    // Phrase envelope is applied after the Add/Morph crossfade in Lua so the control
    // affects the whole rendered branch, not just one internal endpoint.
    (void)usingTemporalFrame;
    (void)referencePartials;

    if (mode == kSpectralModeAdd) {
        if (!hasSample) {
            return {};
        }

        PartialData addPartials = applySpectralShaping(samplePartials, stretch, tiltMode);
        if (spectralAddFlavor_.load(std::memory_order_acquire) == kSpectralAddFlavorDriven) {
            addPartials = buildDrivenSamplePartials(addPartials,
                                                   spectralWaveform_.load(std::memory_order_acquire),
                                                   spectralPulseWidth_.load(std::memory_order_acquire));
        }
        return normalizeToRatioSpace(addPartials);
    }

    refreshSpectralWaveRecipe();
    const PartialData wavePartials = spectralWaveRecipeValid_ ? spectralWaveRecipe_ : PartialData{};
    const PartialData sampleRatioPartials = hasSample ? normalizeToRatioSpace(samplePartials) : PartialData{};

    PartialData morphed = morphRatioPartials(wavePartials,
                                             sampleRatioPartials,
                                             spectralMorphAmount_.load(std::memory_order_acquire),
                                             spectralMorphCurve_.load(std::memory_order_acquire),
                                             spectralMorphDepth_.load(std::memory_order_acquire));
    morphed = applySpectralShaping(morphed, stretch, tiltMode);
    return morphed;
}

void SineBankNode::process(const std::vector<AudioBufferView>& inputs,
                           std::vector<WritableAudioBufferView>& outputs,
                           int numSamples) {
    if (outputs.empty() || numSamples <= 0 || !prepared_) {
        if (!outputs.empty()) {
            outputs[0].clear();
        }
        return;
    }

    auto& out = outputs[0];
    const bool enabled = enabled_.load(std::memory_order_acquire);
    const int spectralMode = spectralMode_.load(std::memory_order_acquire);
    if (spectralMode != kSpectralModeManual) {
        setPartials(buildSpectralTargetPartials());
    }
    const int active = activePartials_.load(std::memory_order_acquire);
    if (!enabled || active <= 0) {
        out.clear();
        return;
    }

    const bool syncOn = syncEnabled_.load(std::memory_order_acquire);
    const bool hasSyncInput = syncOn && !inputs.empty() && inputs[0].numChannels > 0;

    const float targetFreq = targetFrequency_.load(std::memory_order_acquire);
    const float targetAmp = targetAmplitude_.load(std::memory_order_acquire);
    const float targetSpread = stereoSpread_.load(std::memory_order_acquire);
    const int targetUnison = unisonVoices_.load(std::memory_order_acquire);
    const float targetDetuneCents = detuneCents_.load(std::memory_order_acquire);
    const float drive = drive_.load(std::memory_order_acquire);
    const int driveShape = driveShape_.load(std::memory_order_acquire);
    const float driveBias = driveBias_.load(std::memory_order_acquire);
    const float driveMix = driveMix_.load(std::memory_order_acquire);
    const float targetPhraseGain = spectralPhraseGain_.load(std::memory_order_acquire);
    const float referenceFundamental = juce::jmax(1.0f, referenceFundamental_.load(std::memory_order_acquire));
    int layoutUnison = lastRequestedUnison_;
    if (targetUnison > lastRequestedUnison_) {
        for (int v = lastRequestedUnison_; v < targetUnison; ++v) {
            for (int p = 0; p < kMaxPartials; ++p) {
                runningPhases_[static_cast<size_t>(v)][static_cast<size_t>(p)] =
                    runningPhases_[0][static_cast<size_t>(p)];
            }
            unisonVoiceGains_[static_cast<size_t>(v)] = 0.0f;
        }
        lastRequestedUnison_ = targetUnison;
        layoutUnison = targetUnison;
    } else {
        layoutUnison = juce::jmax(targetUnison, lastRequestedUnison_);
    }

    float amplitudeSum = 0.0f;
    for (int i = 0; i < active; ++i) {
        amplitudeSum += juce::jmax(0.0f, partialAmplitudes_[static_cast<size_t>(i)]);
    }
    const float bankNormaliser = amplitudeSum > 1.0e-6f ? (1.0f / amplitudeSum) : 1.0f;
    const int voiceLimit = juce::jlimit(1, kMaxUnisonVoices, layoutUnison);
    const int placementCount = juce::jmax(1, layoutUnison);
    const float placementCenter = (static_cast<float>(placementCount) - 1.0f) * 0.5f;

    for (int i = 0; i < numSamples; ++i) {
        if (hasSyncInput) {
            const float syncSample = inputs[0].getSample(0, i);
            if (prevSyncSample_ <= 0.0f && syncSample > 0.0f) {
                reset();
            }
            prevSyncSample_ = syncSample;
        }

        currentFrequency_ += (targetFreq - currentFrequency_) * freqSmoothingCoeff_;
        currentAmplitude_ += (targetAmp - currentAmplitude_) * ampSmoothingCoeff_;
        currentDetuneCents_ += (targetDetuneCents - currentDetuneCents_) * detuneSmoothingCoeff_;
        currentSpread_ += (targetSpread - currentSpread_) * spreadSmoothingCoeff_;
        currentSpectralPhraseGain_ += (targetPhraseGain - currentSpectralPhraseGain_) * phraseGainSmoothingCoeff_;
        const double pitchRatio = static_cast<double>(juce::jmax(1.0f, currentFrequency_))
            / static_cast<double>(referenceFundamental);

        float left = 0.0f;
        float right = 0.0f;
        int contributingVoices = 0;

        for (int p = 0; p < active; ++p) {
            const size_t idx = static_cast<size_t>(p);
            const float targetPartialAmp = partialAmplitudes_[idx];
            currentPartialAmplitudes_[idx] += (targetPartialAmp - currentPartialAmplitudes_[idx]) * partialAmpSmoothingCoeff_;
        }

        bool higherVoicesStillActive = false;
        for (int v = 0; v < voiceLimit; ++v) {
            const float targetVoiceGain = (v < targetUnison) ? 1.0f : 0.0f;
            unisonVoiceGains_[static_cast<size_t>(v)] +=
                (targetVoiceGain - unisonVoiceGains_[static_cast<size_t>(v)]) * unisonVoiceSmoothingCoeff_;
            const float voiceGain = unisonVoiceGains_[static_cast<size_t>(v)];
            if (v >= targetUnison && voiceGain > 1.0e-4f) {
                higherVoicesStillActive = true;
            }
            if (voiceGain <= 1.0e-4f) {
                continue;
            }
            ++contributingVoices;

            const float voiceOffset = static_cast<float>(v) - placementCenter;
            const float detuneSemitones = voiceOffset * currentDetuneCents_ / 100.0f;
            const double detuneRatio = std::pow(2.0, detuneSemitones / 12.0);

            float voiceSample = 0.0f;
            auto& phases = runningPhases_[static_cast<size_t>(v)];

            for (int p = 0; p < active; ++p) {
                const size_t idx = static_cast<size_t>(p);
                const float partialAmp = currentPartialAmplitudes_[idx];

                if (partialAmp <= 1.0e-6f) {
                    continue;
                }

                const double baseFreq = static_cast<double>(partialFrequencies_[idx]);
                const double renderedFreq = baseFreq * pitchRatio * detuneRatio;
                if (renderedFreq <= 0.0 || renderedFreq >= (sampleRate_ * 0.5)) {
                    continue;
                }

                voiceSample += std::sin(phases[idx]) * partialAmp;

                const double phaseInc = juce::MathConstants<double>::twoPi * renderedFreq / sampleRate_;
                phases[idx] += phaseInc;
                while (phases[idx] >= juce::MathConstants<double>::twoPi) {
                    phases[idx] -= juce::MathConstants<double>::twoPi;
                }
                while (phases[idx] < 0.0) {
                    phases[idx] += juce::MathConstants<double>::twoPi;
                }
            }

            voiceSample *= bankNormaliser;
            voiceSample = applyDriveShape(voiceSample, drive, driveShape, driveBias, driveMix);
            voiceSample *= currentSpectralPhraseGain_;
            if (!std::isfinite(voiceSample)) {
                voiceSample = 0.0f;
            }
            voiceSample *= voiceGain;

            const float pan = (placementCount > 1)
                ? juce::jlimit(0.0f, 1.0f, 0.5f + voiceOffset * (currentSpread_ / static_cast<float>(placementCount - 1)))
                : 0.5f;
            const float leftPan = std::sqrt(1.0f - pan);
            const float rightPan = std::sqrt(pan);

            left += voiceSample * leftPan;
            right += voiceSample * rightPan;
        }

        if (!higherVoicesStillActive) {
            lastRequestedUnison_ = targetUnison;
        }

        const float unisonNormaliser = (contributingVoices > 0)
            ? (1.0f / std::sqrt(static_cast<float>(contributingVoices)))
            : 0.0f;
        left *= unisonNormaliser * currentAmplitude_;
        right *= unisonNormaliser * currentAmplitude_;
        if (!std::isfinite(left)) {
            left = 0.0f;
        }
        if (!std::isfinite(right)) {
            right = 0.0f;
        }

        if (out.numChannels >= 2) {
            out.setSample(0, i, left);
            out.setSample(1, i, right);
        } else {
            out.setSample(0, i, 0.5f * (left + right));
        }
    }
}

} // namespace dsp_primitives
