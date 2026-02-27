#include "dsp/core/nodes/ReverbNode.h"

namespace dsp_primitives {

ReverbNode::ReverbNode() {
    params_ = reverb_.getParameters();
}

void ReverbNode::prepare(double sampleRate, int maxBlockSize) {
    reverb_.setSampleRate(sampleRate);
    reverb_.reset();

    left_.resize(static_cast<size_t>(maxBlockSize));
    right_.resize(static_cast<size_t>(maxBlockSize));
}

void ReverbNode::process(const std::vector<AudioBufferView>& inputs,
                         std::vector<WritableAudioBufferView>& outputs,
                         int numSamples) {
    if (inputs.size() < 2 || outputs.size() < 2) {
        if (!outputs.empty()) outputs[0].clear();
        if (outputs.size() > 1) outputs[1].clear();
        return;
    }

    if (numSamples > static_cast<int>(left_.size())) {
        outputs[0].clear();
        outputs[1].clear();
        return;
    }

    for (int i = 0; i < numSamples; ++i) {
        left_[static_cast<size_t>(i)] = inputs[0].getSample(0, i);
        right_[static_cast<size_t>(i)] = inputs[1].getSample(1, i);
    }

    reverb_.processStereo(left_.data(), right_.data(), numSamples);

    for (int i = 0; i < numSamples; ++i) {
        outputs[0].setSample(0, i, left_[static_cast<size_t>(i)]);
        outputs[1].setSample(1, i, right_[static_cast<size_t>(i)]);
    }
}

} // namespace dsp_primitives
