#include "SlewLimiterNode.h"

#include <algorithm>

namespace dsp_primitives {

namespace {
inline float clampSlide(float v) {
    // Max slide~ treats 1 as immediate tracking. Values <= 1 are effectively direct.
    return std::max(1.0f, v);
}
} // namespace

SlewLimiterNode::SlewLimiterNode() = default;

void SlewLimiterNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    currentSlideUp_ = clampSlide(targetSlideUp_.load(std::memory_order_acquire));
    currentSlideDown_ = clampSlide(targetSlideDown_.load(std::memory_order_acquire));

    lastOutput_[0] = 0.0f;
    lastOutput_[1] = 0.0f;
    prepared_ = true;
}

void SlewLimiterNode::reset() {
    lastOutput_[0] = 0.0f;
    lastOutput_[1] = 0.0f;
}

void SlewLimiterNode::process(const std::vector<AudioBufferView>& inputs,
                              std::vector<WritableAudioBufferView>& outputs,
                              int numSamples) {
    if (!prepared_ || outputs.empty() || numSamples <= 0) {
        if (!inputs.empty() && !outputs.empty()) {
            const int numCh = std::min(inputs[0].numChannels, outputs[0].numChannels);
            for (int ch = 0; ch < numCh; ++ch) {
                for (int i = 0; i < numSamples; ++i) {
                    outputs[0].setSample(ch, i, inputs[0].getSample(ch, i));
                }
            }
        }
        return;
    }

    const float targetUp = clampSlide(targetSlideUp_.load(std::memory_order_acquire));
    const float targetDown = clampSlide(targetSlideDown_.load(std::memory_order_acquire));

    const float upStep = (targetUp - currentSlideUp_) / static_cast<float>(numSamples);
    const float downStep = (targetDown - currentSlideDown_) / static_cast<float>(numSamples);

    const int numCh = std::min(inputs[0].numChannels, outputs[0].numChannels);

    for (int ch = 0; ch < numCh; ++ch) {
        const float* in = inputs[0].channelData[ch];
        float* out = outputs[0].channelData[ch];
        float lastOut = lastOutput_[ch];
        float slideUp = currentSlideUp_;
        float slideDown = currentSlideDown_;

        for (int i = 0; i < numSamples; ++i) {
            slideUp += upStep;
            slideDown += downStep;

            const float input = in[i];
            const float divisor = input > lastOut ? clampSlide(slideUp) : clampSlide(slideDown);
            lastOut += (input - lastOut) / divisor;
            out[i] = lastOut;
        }

        lastOutput_[ch] = lastOut;
    }

    currentSlideUp_ = targetUp;
    currentSlideDown_ = targetDown;
}

void SlewLimiterNode::setSlideUp(float slide) {
    targetSlideUp_.store(std::max(0.0f, slide), std::memory_order_release);
}

void SlewLimiterNode::setSlideDown(float slide) {
    targetSlideDown_.store(std::max(0.0f, slide), std::memory_order_release);
}

float SlewLimiterNode::getSlideUp() const {
    return targetSlideUp_.load(std::memory_order_acquire);
}

float SlewLimiterNode::getSlideDown() const {
    return targetSlideDown_.load(std::memory_order_acquire);
}

} // namespace dsp_primitives
