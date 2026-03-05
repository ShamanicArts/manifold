#include "dsp/core/nodes/NoiseGeneratorNode.h"

#include <cmath>

namespace dsp_primitives {

NoiseGeneratorNode::NoiseGeneratorNode() = default;

void NoiseGeneratorNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    const double smoothTime = 0.01;
    smooth_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothTime * sampleRate_)));
    smooth_ = juce::jlimit(0.0001f, 1.0f, smooth_);

    level_ = targetLevel_.load(std::memory_order_acquire);
    color_ = targetColor_.load(std::memory_order_acquire);

    reset();
    prepared_ = true;
}

void NoiseGeneratorNode::reset() {
    rng_[0] = 0x12345678u;
    rng_[1] = 0x87654321u;
    lpState_[0] = 0.0f;
    lpState_[1] = 0.0f;
}

uint32_t NoiseGeneratorNode::xorshift32(uint32_t& state) {
    uint32_t x = state;
    x ^= x << 13;
    x ^= x >> 17;
    x ^= x << 5;
    state = x;
    return x;
}

float NoiseGeneratorNode::u32ToFloatSigned(uint32_t v) {
    // Convert to [-1, 1]
    const float u01 = static_cast<float>(v) * (1.0f / 4294967295.0f);
    return u01 * 2.0f - 1.0f;
}

void NoiseGeneratorNode::process(const std::vector<AudioBufferView>& inputs,
                                 std::vector<WritableAudioBufferView>& outputs,
                                 int numSamples) {
    (void)inputs;
    if (!prepared_ || outputs.empty() || numSamples <= 0) {
        if (!outputs.empty()) {
            outputs[0].clear();
        }
        return;
    }

    const float tLevel = targetLevel_.load(std::memory_order_acquire);
    const float tColor = targetColor_.load(std::memory_order_acquire);

    for (int i = 0; i < numSamples; ++i) {
        level_ += (tLevel - level_) * smooth_;
        color_ += (tColor - color_) * smooth_;

        // Map color -> lowpass cutoff between ~16k (white-ish) and ~600 Hz (dark)
        const float cutoff = juce::jmap(color_, 16000.0f, 600.0f);
        const float a = juce::jlimit(
            0.0001f,
            1.0f,
            2.0f * juce::MathConstants<float>::pi * cutoff /
                (2.0f * juce::MathConstants<float>::pi * cutoff + static_cast<float>(sampleRate_)));

        for (int ch = 0; ch < outputs[0].numChannels; ++ch) {
            const int c = juce::jlimit(0, 1, ch);
            const float n = u32ToFloatSigned(xorshift32(rng_[static_cast<size_t>(c)]));

            lpState_[static_cast<size_t>(c)] += a * (n - lpState_[static_cast<size_t>(c)]);
            const float out = lpState_[static_cast<size_t>(c)] * level_;

            outputs[0].setSample(ch, i, out);
        }
    }
}

} // namespace dsp_primitives
