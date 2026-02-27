#include "dsp/core/nodes/DistortionNode.h"

#include <cmath>

namespace dsp_primitives {

DistortionNode::DistortionNode() = default;

void DistortionNode::prepare(double sampleRate, int maxBlockSize) {
    (void)sampleRate;
    (void)maxBlockSize;
}

void DistortionNode::process(const std::vector<AudioBufferView>& inputs,
                             std::vector<WritableAudioBufferView>& outputs,
                             int numSamples) {
    if (inputs.size() < 2 || outputs.size() < 2) {
        if (!outputs.empty()) outputs[0].clear();
        if (outputs.size() > 1) outputs[1].clear();
        return;
    }

    const float dry = 1.0f - mix_;
    const float wet = mix_;

    for (int i = 0; i < numSamples; ++i) {
        for (int ch = 0; ch < 2; ++ch) {
            const float in = inputs[ch].getSample(ch, i);
            const float shaped = std::tanh(in * drive_);
            float out = (in * dry + shaped * wet) * output_;
            out = juce::jlimit(-1.0f, 1.0f, out);
            outputs[ch].setSample(ch, i, out);
        }
    }
}

} // namespace dsp_primitives
