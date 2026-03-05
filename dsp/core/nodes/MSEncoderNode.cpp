#include "dsp/core/nodes/MSEncoderNode.h"

#include <cmath>

namespace dsp_primitives {

MSEncoderNode::MSEncoderNode() = default;
MSDecoderNode::MSDecoderNode() = default;

void MSEncoderNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;

    const double smoothTime = 0.01;
    smooth_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothTime * sr)));
    smooth_ = juce::jlimit(0.0001f, 1.0f, smooth_);

    width_ = targetWidth_.load(std::memory_order_acquire);
    prepared_ = true;
}

void MSEncoderNode::reset() {
    // no internal state
}

void MSEncoderNode::process(const std::vector<AudioBufferView>& inputs,
                            std::vector<WritableAudioBufferView>& outputs,
                            int numSamples) {
    if (!prepared_ || inputs.empty() || outputs.empty() || numSamples <= 0) {
        if (!outputs.empty()) {
            outputs[0].clear();
        }
        return;
    }

    const float tWidth = targetWidth_.load(std::memory_order_acquire);
    constexpr float norm = 0.70710678f; // 1/sqrt(2)

    for (int i = 0; i < numSamples; ++i) {
        width_ += (tWidth - width_) * smooth_;

        const float l = inputs[0].getSample(0, i);
        const float r = inputs[0].numChannels > 1 ? inputs[0].getSample(1, i) : l;

        const float m = (l + r) * norm;
        const float s = (l - r) * norm * width_;

        outputs[0].setSample(0, i, m);
        if (outputs[0].numChannels > 1) {
            outputs[0].setSample(1, i, s);
        }
    }
}

void MSDecoderNode::prepare(double sampleRate, int maxBlockSize) {
    (void)sampleRate;
    (void)maxBlockSize;
    prepared_ = true;
}

void MSDecoderNode::reset() {
    // no internal state
}

void MSDecoderNode::process(const std::vector<AudioBufferView>& inputs,
                            std::vector<WritableAudioBufferView>& outputs,
                            int numSamples) {
    if (!prepared_ || inputs.empty() || outputs.empty() || numSamples <= 0) {
        if (!outputs.empty()) {
            outputs[0].clear();
        }
        return;
    }

    constexpr float norm = 0.70710678f; // 1/sqrt(2)

    for (int i = 0; i < numSamples; ++i) {
        const float m = inputs[0].getSample(0, i);
        const float s = inputs[0].numChannels > 1 ? inputs[0].getSample(1, i) : 0.0f;

        const float l = (m + s) * norm;
        const float r = (m - s) * norm;

        outputs[0].setSample(0, i, l);
        if (outputs[0].numChannels > 1) {
            outputs[0].setSample(1, i, r);
        }
    }
}

} // namespace dsp_primitives
