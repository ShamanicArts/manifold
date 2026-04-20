#include "dsp/core/nodes/DistortionNode.h"

#include <cmath>

namespace dsp_primitives {

DistortionNode::DistortionNode() = default;

void DistortionNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;

    const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
    const double smoothingTimeSeconds = 0.01;
    smoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothingTimeSeconds * sr)));
    smoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, smoothingCoeff_);

    drive_ = targetDrive_.load(std::memory_order_acquire);
    mix_ = targetMix_.load(std::memory_order_acquire);
    output_ = targetOutput_.load(std::memory_order_acquire);
}

void DistortionNode::process(const std::vector<AudioBufferView>& inputs,
                             std::vector<WritableAudioBufferView>& outputs,
                             int numSamples) {
    if (inputs.empty() || outputs.empty() || numSamples <= 0) {
        if (!outputs.empty()) outputs[0].clear();
        return;
    }

    const auto& input = inputs[0];
    auto& output = outputs[0];
    const int channels = juce::jmin(2, input.numChannels, output.numChannels);
    if (channels <= 0) {
        output.clear();
        return;
    }

    const float targetDrive = targetDrive_.load(std::memory_order_acquire);
    const float targetMix = targetMix_.load(std::memory_order_acquire);
    const float targetOutput = targetOutput_.load(std::memory_order_acquire);

    for (int i = 0; i < numSamples; ++i) {
        drive_ += (targetDrive - drive_) * smoothingCoeff_;
        mix_ += (targetMix - mix_) * smoothingCoeff_;
        output_ += (targetOutput - output_) * smoothingCoeff_;

        const float dry = 1.0f - mix_;
        const float wet = mix_;

        for (int ch = 0; ch < channels; ++ch) {
            const float in = input.getSample(ch, i);
            const float shaped = std::tanh(in * drive_);
            float outSample = (in * dry + shaped * wet) * output_;
            outSample = juce::jlimit(-1.0f, 1.0f, outSample);
            output.setSample(ch, i, outSample);
        }
    }
}

} // namespace dsp_primitives
