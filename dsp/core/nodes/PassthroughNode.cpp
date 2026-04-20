#include "dsp/core/nodes/PassthroughNode.h"

namespace dsp_primitives {

PassthroughNode::PassthroughNode(int numChannels,
                                 HostInputMode hostInputMode)
    : numChannels_(numChannels), hostInputMode_(hostInputMode) {}

void PassthroughNode::prepare(double sampleRate, int maxBlockSize) {
    (void)sampleRate;
    (void)maxBlockSize;
}

void PassthroughNode::process(const std::vector<AudioBufferView>& inputs,
                              std::vector<WritableAudioBufferView>& outputs,
                              int numSamples) {
    if (inputs.empty() || outputs.empty() || numSamples <= 0) {
        if (!outputs.empty()) outputs[0].clear();
        return;
    }

    const auto& input = inputs[0];
    auto& output = outputs[0];
    const int channels = juce::jmin(numChannels_, input.numChannels, output.numChannels);
    if (channels <= 0) {
        output.clear();
        return;
    }

    for (int ch = 0; ch < channels; ++ch) {
        for (int i = 0; i < numSamples; ++i) {
            output.setSample(ch, i, input.getSample(ch, i));
        }
    }
}

} // namespace dsp_primitives
