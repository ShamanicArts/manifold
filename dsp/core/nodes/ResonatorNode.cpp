#include "ResonatorNode.h"

#include <algorithm>
#include <cmath>

namespace dsp_primitives {

namespace {
inline float clampf(float v, float lo, float hi) {
    return std::max(lo, std::min(hi, v));
}
} // namespace

ResonatorNode::ResonatorNode() = default;

void ResonatorNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    currentGain_ = targetGain_.load(std::memory_order_acquire);
    currentFrequency_ = targetFrequency_.load(std::memory_order_acquire);
    currentQ_ = targetQ_.load(std::memory_order_acquire);

    reset();
    prepared_ = true;
}

void ResonatorNode::reset() {
    x1_[0] = x1_[1] = 0.0f;
    x2_[0] = x2_[1] = 0.0f;
    y1_[0] = y1_[1] = 0.0f;
    y2_[0] = y2_[1] = 0.0f;
}

void ResonatorNode::process(const std::vector<AudioBufferView>& inputs,
                            std::vector<WritableAudioBufferView>& outputs,
                            int numSamples) {
    if (!prepared_ || outputs.empty() || numSamples <= 0 || inputs.empty()) {
        if (!inputs.empty() && !outputs.empty()) {
            const int numCh = std::min(inputs[0].numChannels, outputs[0].numChannels);
            for (int ch = 0; ch < numCh; ++ch) {
                for (int i = 0; i < numSamples; ++i) {
                    outputs[0].setSample(ch, i, inputs[0].getSample(ch, i));
                }
            }
        }
        return;
    }

    const float targetGain = clampf(targetGain_.load(std::memory_order_acquire), 0.0f, 4.0f);
    const float targetFreq = clampf(targetFrequency_.load(std::memory_order_acquire), 20.0f,
                                    static_cast<float>(sampleRate_ * 0.45));
    const float targetQ = clampf(targetQ_.load(std::memory_order_acquire), 0.01f, 500.0f);

    float gain = currentGain_;
    float freq = currentFrequency_;
    float q = currentQ_;

    const float gainStep = (targetGain - gain) / static_cast<float>(numSamples);
    const float freqStep = (targetFreq - freq) / static_cast<float>(numSamples);
    const float qStep = (targetQ - q) / static_cast<float>(numSamples);

    const int numCh = std::min(inputs[0].numChannels, outputs[0].numChannels);

    for (int ch = 0; ch < numCh; ++ch) {
        const float* in = inputs[0].channelData[ch];
        float* out = outputs[0].channelData[ch];

        float x1 = x1_[ch];
        float x2 = x2_[ch];
        float y1 = y1_[ch];
        float y2 = y2_[ch];

        float sampleGain = gain;
        float sampleFreq = freq;
        float sampleQ = q;

        for (int i = 0; i < numSamples; ++i) {
            sampleGain += gainStep;
            sampleFreq += freqStep;
            sampleQ += qStep;

            const float clampedFreq = clampf(sampleFreq, 20.0f, static_cast<float>(sampleRate_ * 0.45));
            const float clampedQ = clampf(sampleQ, 0.01f, 500.0f);

            const float omega = 2.0f * juce::MathConstants<float>::pi * clampedFreq /
                                static_cast<float>(sampleRate_);
            const float sinOmega = std::sin(omega);
            const float cosOmega = std::cos(omega);
            const float alpha = sinOmega / (2.0f * clampedQ);

            float b0 = alpha;
            float b1 = 0.0f;
            float b2 = -alpha;
            const float a0 = 1.0f + alpha;
            float a1 = -2.0f * cosOmega;
            float a2 = 1.0f - alpha;

            b0 = (b0 / a0) * sampleGain;
            b1 = (b1 / a0) * sampleGain;
            b2 = (b2 / a0) * sampleGain;
            a1 /= a0;
            a2 /= a0;

            const float x = in[i];
            float y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
            if (!std::isfinite(y)) {
                y = 0.0f;
                x1 = 0.0f;
                x2 = 0.0f;
                y1 = 0.0f;
                y2 = 0.0f;
            }

            x2 = x1;
            x1 = x;
            y2 = y1;
            y1 = y;

            out[i] = y;
        }

        x1_[ch] = x1;
        x2_[ch] = x2;
        y1_[ch] = y1;
        y2_[ch] = y2;
    }

    currentGain_ = targetGain;
    currentFrequency_ = targetFreq;
    currentQ_ = targetQ;
}

void ResonatorNode::setGain(float gain) {
    targetGain_.store(clampf(gain, 0.0f, 4.0f), std::memory_order_release);
}

void ResonatorNode::setFrequency(float freq) {
    targetFrequency_.store(clampf(freq, 20.0f, 20000.0f), std::memory_order_release);
}

void ResonatorNode::setQ(float q) {
    targetQ_.store(clampf(q, 0.01f, 500.0f), std::memory_order_release);
}

float ResonatorNode::getGain() const {
    return targetGain_.load(std::memory_order_acquire);
}

float ResonatorNode::getFrequency() const {
    return targetFrequency_.load(std::memory_order_acquire);
}

float ResonatorNode::getQ() const {
    return targetQ_.load(std::memory_order_acquire);
}

} // namespace dsp_primitives
