#include "dsp/core/nodes/FrequencyShiftNode.h"
#include <cmath>

namespace dsp_primitives {

FrequencyShiftNode::FrequencyShiftNode() = default;

void FrequencyShiftNode::buildHilbertFIR() {
    hilbertCoefs_.resize(kHilbertTaps);
    const int M = kHilbertDelay;

    for (int n = 0; n < kHilbertTaps; ++n) {
        if (n == M) {
            hilbertCoefs_[n] = 0.0f;
            continue;
        }
        const float nm = static_cast<float>(n - M);
        // h[n] = (2/π) * sin²(π*(n-M)/2) / (n-M)
        const float s = std::sin(juce::MathConstants<float>::pi * nm * 0.5f);
        float coef = (2.0f / juce::MathConstants<float>::pi) * (s * s) / nm;
        // Hamming window
        const float window = 0.54f - 0.46f * std::cos(juce::MathConstants<float>::twoPi * n / (kHilbertTaps - 1));
        hilbertCoefs_[n] = coef * window;
    }
}

void FrequencyShiftNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    const double smoothTime = 0.01;
    smooth_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothTime * sampleRate_)));
    smooth_ = juce::jlimit(0.0001f, 1.0f, smooth_);

    buildHilbertFIR();

    currentShiftHz_ = targetShiftHz_.load(std::memory_order_acquire);
    currentMix_ = targetMix_.load(std::memory_order_acquire);

    reset();
    prepared_ = true;
}

void FrequencyShiftNode::reset() {
    lfoPhase_ = 0.0f;
    for (auto& ch : channels_) {
        std::fill(ch.delayLine.begin(), ch.delayLine.end(), 0.0f);
        ch.writePos = 0;
    }
}

float FrequencyShiftNode::processHilbert(int ch, float sample) {
    auto& state = channels_[ch];
    auto& dl = state.delayLine;
    int& wp = state.writePos;

    dl[wp] = sample;
    float out = 0.0f;
    for (int i = 0; i < kHilbertTaps; ++i) {
        int idx = wp - i;
        if (idx < 0) idx += kHilbertTaps;
        out += hilbertCoefs_[i] * dl[idx];
    }
    wp = (wp + 1) % kHilbertTaps;
    return out;
}

void FrequencyShiftNode::process(const std::vector<AudioBufferView>& inputs,
                                 std::vector<WritableAudioBufferView>& outputs,
                                 int numSamples) {
    if (!prepared_ || inputs.empty() || outputs.empty() || numSamples <= 0) {
        if (!outputs.empty()) {
            outputs[0].clear();
        }
        return;
    }

    const int numChannels = std::min(inputs[0].numChannels, outputs[0].numChannels);
    if (numChannels <= 0) {
        outputs[0].clear();
        return;
    }

    if (static_cast<int>(channels_.size()) < numChannels) {
        const size_t oldSize = channels_.size();
        channels_.resize(numChannels);
        for (size_t c = oldSize; c < channels_.size(); ++c) {
            channels_[c].delayLine.resize(kHilbertTaps, 0.0f);
            channels_[c].writePos = 0;
        }
    }

    const float tShift = targetShiftHz_.load(std::memory_order_acquire);
    const float tMix = targetMix_.load(std::memory_order_acquire);

    for (int i = 0; i < numSamples; ++i) {
        currentShiftHz_ += (tShift - currentShiftHz_) * smooth_;
        currentMix_ += (tMix - currentMix_) * smooth_;

        const float phaseInc = currentShiftHz_ / static_cast<float>(sampleRate_);
        lfoPhase_ += phaseInc;
        lfoPhase_ -= std::floor(lfoPhase_);

        const float cosVal = std::cos(juce::MathConstants<float>::twoPi * lfoPhase_);
        const float sinVal = std::sin(juce::MathConstants<float>::twoPi * lfoPhase_);
        const bool transparent = std::abs(currentShiftHz_) < 0.001f;

        for (int ch = 0; ch < numChannels; ++ch) {
            const float inSample = inputs[0].getSample(ch, i);
            if (transparent) {
                outputs[0].setSample(ch, i, inSample);
                continue;
            }

            const float hilbertSample = processHilbert(ch, inSample);
            const float shifted = inSample * cosVal - hilbertSample * sinVal;

            const float dry = 1.0f - currentMix_;
            outputs[0].setSample(ch, i, inSample * dry + shifted * currentMix_);
        }
    }

    for (int ch = numChannels; ch < outputs[0].numChannels; ++ch) {
        for (int i = 0; i < numSamples; ++i) {
            outputs[0].setSample(ch, i, 0.0f);
        }
    }
}

} // namespace dsp_primitives
