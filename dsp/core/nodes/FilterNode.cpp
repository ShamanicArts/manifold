#include "dsp/core/nodes/FilterNode.h"

#include <cmath>

namespace dsp_primitives {

FilterNode::FilterNode() {
    updateAlpha();
}

void FilterNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    sampleRate_ = sampleRate;
    z1_[0] = 0.0f;
    z1_[1] = 0.0f;
    z2_[0] = 0.0f;
    z2_[1] = 0.0f;
    updateAlpha();
}

void FilterNode::setCutoff(float hz) {
    cutoffHz_ = juce::jlimit(20.0f, 18000.0f, hz);
    updateAlpha();
}

void FilterNode::setResonance(float q) {
    resonance_ = juce::jlimit(0.0f, 1.0f, q);
    updateAlpha();
}

void FilterNode::setMix(float mix) {
    mix_ = juce::jlimit(0.0f, 1.0f, mix);
}

void FilterNode::updateAlpha() {
    const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
    const float normalized = juce::jlimit(0.0001f, 0.49f, cutoffHz_ / sr);
    const float shaping = 1.0f + resonance_ * 0.6f;
    alpha_ = 1.0f - std::exp(-2.0f * juce::MathConstants<float>::pi * normalized * shaping);
    alpha_ = juce::jlimit(0.0001f, 0.999f, alpha_);
}

void FilterNode::process(const std::vector<AudioBufferView>& inputs,
                         std::vector<WritableAudioBufferView>& outputs,
                         int numSamples) {
    if (inputs.size() < 2 || outputs.size() < 2) {
        if (!outputs.empty()) outputs[0].clear();
        if (outputs.size() > 1) outputs[1].clear();
        return;
    }

    const float dry = 1.0f - mix_;
    const float wet = mix_;
    const float feedback = resonance_ * 0.85f;

    for (int i = 0; i < numSamples; ++i) {
        for (int ch = 0; ch < 2; ++ch) {
            const float in = inputs[ch].getSample(ch, i);
            const size_t idx = static_cast<size_t>(ch);
            const float x = in - feedback * (z2_[idx] - z1_[idx]);
            z1_[idx] += alpha_ * (x - z1_[idx]);
            z2_[idx] += alpha_ * (z1_[idx] - z2_[idx]);
            const float filtered = z2_[idx];
            outputs[ch].setSample(ch, i, in * dry + filtered * wet);
        }
    }
}

} // namespace dsp_primitives
