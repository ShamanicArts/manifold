#include "ConstantSignalNode.h"
#include <algorithm>

namespace dsp_primitives {

ConstantSignalNode::ConstantSignalNode() = default;

void ConstantSignalNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;
    
    currentValue_ = targetValue_.load(std::memory_order_acquire);
    
    prepared_ = true;
}

void ConstantSignalNode::reset() {
    // Nothing to reset for constant signal
}

void ConstantSignalNode::process(const std::vector<AudioBufferView>& inputs,
                                  std::vector<WritableAudioBufferView>& outputs,
                                  int numSamples) {
    (void)inputs;
    
    if (!prepared_ || outputs.empty() || numSamples <= 0) {
        return;
    }

    // Read updated parameter
    float target = targetValue_.load(std::memory_order_acquire);
    
    // Smooth parameter changes
    constexpr float smoothing = 0.1f;
    currentValue_ = currentValue_ + (target - currentValue_) * smoothing;
    
    // Fill output with constant value
    const int numCh = outputs[0].numChannels;
    for (int ch = 0; ch < numCh; ++ch) {
        float* out = outputs[0].channelData[ch];
        for (int i = 0; i < numSamples; ++i) {
            out[i] = currentValue_;
        }
    }
}

void ConstantSignalNode::setValue(float value) {
    targetValue_.store(value, std::memory_order_release);
}

float ConstantSignalNode::getValue() const {
    return targetValue_.load(std::memory_order_acquire);
}

} // namespace dsp_primitives