#include "dsp/core/nodes/GainNode.h"
#include "dsp/core/nodes/GainNode_Highway.h"

#include <cmath>

namespace dsp_primitives {

GainNode::GainNode(int numChannels) : numChannels_(numChannels) {}

void GainNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;

    const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
    const double smoothingTimeSeconds = 0.01;
    smoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothingTimeSeconds * sr)));
    smoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, smoothingCoeff_);

    currentGain_ = juce::jmax(0.0f, targetGain_.load(std::memory_order_acquire));

    simd_implementation_ = std::unique_ptr<IPrimitiveNodeSIMDImplementation>(
        dsp_primitives::GainNode_Highway::__CreateInstance(
            static_cast<float>(sampleRate), numChannels_, &targetGain_, &muted_)
    );
    simd_implementation_->prepare(static_cast<float>(sampleRate));
    prepared_ = true;
}

void GainNode::process(const std::vector<AudioBufferView>& inputs,
                       std::vector<WritableAudioBufferView>& outputs,
                       int numSamples) {
    if (simd_implementation_) {
        simd_implementation_->run(inputs, outputs, numSamples);
        return;
    }

    if (inputs.empty() || outputs.empty() || numSamples <= 0)
        return;

    const int channels = juce::jmin(numChannels_,
                                    inputs[0].numChannels,
                                    outputs[0].numChannels);

    const float requestedGain = juce::jmax(0.0f, targetGain_.load(std::memory_order_acquire));
    const float target = muted_.load(std::memory_order_acquire) ? 0.0f : requestedGain;

    for (int i = 0; i < numSamples; ++i) {
        currentGain_ += (target - currentGain_) * smoothingCoeff_;

        for (int ch = 0; ch < channels; ++ch) {
            outputs[0].channelData[ch][i] = inputs[0].channelData[ch][i] * currentGain_;
        }
    }
}

void GainNode::setGain(float gain) {
    targetGain_.store(juce::jmax(0.0f, gain), std::memory_order_release);
}

float GainNode::getGain() const {
    return targetGain_.load(std::memory_order_acquire);
}

void GainNode::reset() {
    currentGain_ = 0.0f;

    if (simd_implementation_) {
        simd_implementation_->reset();
    }
}

void GainNode::disableSIMD() {
    simd_implementation_.reset();
}

void GainNode::setMuted(bool muted) {
    muted_.store(muted, std::memory_order_release);
    notifyConfigChangeSimdImplementation();
}

bool GainNode::isMuted() const {
    return muted_.load(std::memory_order_acquire);
}

} // namespace dsp_primitives
