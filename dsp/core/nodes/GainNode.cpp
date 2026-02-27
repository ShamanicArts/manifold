#include "dsp/core/nodes/GainNode.h"

namespace dsp_primitives {

GainNode::GainNode(int numChannels) : numChannels_(numChannels) {}

void GainNode::prepare(double sampleRate, int maxBlockSize) {
    (void)sampleRate;
    (void)maxBlockSize;
}

void GainNode::process(const std::vector<AudioBufferView>& inputs,
                       std::vector<WritableAudioBufferView>& outputs,
                       int numSamples) {
    const float appliedGain = muted_.load(std::memory_order_acquire)
                                  ? 0.0f
                                  : gain_.load(std::memory_order_acquire);

    const int channels = juce::jmin(numChannels_, static_cast<int>(inputs.size()),
                                    static_cast<int>(outputs.size()));
    for (int ch = 0; ch < channels; ++ch) {
        const size_t idx = static_cast<size_t>(ch);
        for (int i = 0; i < numSamples; ++i) {
            outputs[idx].setSample(ch, i, inputs[idx].getSample(ch, i) * appliedGain);
        }
    }
}

void GainNode::setGain(float gain) {
    gain_.store(juce::jmax(0.0f, gain), std::memory_order_release);
}

float GainNode::getGain() const {
    return gain_.load(std::memory_order_acquire);
}

void GainNode::setMuted(bool muted) {
    muted_.store(muted, std::memory_order_release);
}

bool GainNode::isMuted() const {
    return muted_.load(std::memory_order_acquire);
}

} // namespace dsp_primitives
