#include "dsp/core/nodes/MixerNode.h"

#include <cmath>

namespace dsp_primitives {

MixerNode::MixerNode() {
    for (int i = 0; i < kMaxBusses; ++i) {
        targetGains_[static_cast<size_t>(i)].store(1.0f, std::memory_order_release);
        targetPans_[static_cast<size_t>(i)].store(0.0f, std::memory_order_release);
        gains_[static_cast<size_t>(i)] = 1.0f;
        pans_[static_cast<size_t>(i)] = 0.0f;
    }
}

void MixerNode::setGain(int busIndex, float g) {
    const int idx = juce::jlimit(1, kMaxBusses, busIndex) - 1;
    targetGains_[static_cast<size_t>(idx)].store(
        juce::jlimit(0.0f, 2.0f, g), std::memory_order_release);
}

void MixerNode::setPan(int busIndex, float p) {
    const int idx = juce::jlimit(1, kMaxBusses, busIndex) - 1;
    targetPans_[static_cast<size_t>(idx)].store(
        juce::jlimit(-1.0f, 1.0f, p), std::memory_order_release);
}

float MixerNode::getGain(int busIndex) const {
    const int idx = juce::jlimit(1, kMaxBusses, busIndex) - 1;
    return targetGains_[static_cast<size_t>(idx)].load(std::memory_order_acquire);
}

float MixerNode::getPan(int busIndex) const {
    const int idx = juce::jlimit(1, kMaxBusses, busIndex) - 1;
    return targetPans_[static_cast<size_t>(idx)].load(std::memory_order_acquire);
}

void MixerNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;

    const double smoothTime = 0.01;
    smooth_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothTime * sr)));
    smooth_ = juce::jlimit(0.0001f, 1.0f, smooth_);

    for (int i = 0; i < kMaxBusses; ++i) {
        gains_[static_cast<size_t>(i)] =
            targetGains_[static_cast<size_t>(i)].load(std::memory_order_acquire);
        pans_[static_cast<size_t>(i)] =
            targetPans_[static_cast<size_t>(i)].load(std::memory_order_acquire);
    }

    master_ = targetMaster_.load(std::memory_order_acquire);
    prepared_ = true;
}

void MixerNode::reset() {
    // no internal state
}

static inline void equalPowerPan(float pan, float& gainL, float& gainR) {
    const float t = 0.5f * (juce::jlimit(-1.0f, 1.0f, pan) + 1.0f);
    gainL = std::cos(0.5f * juce::MathConstants<float>::pi * t);
    gainR = std::sin(0.5f * juce::MathConstants<float>::pi * t);
}

void MixerNode::process(const std::vector<AudioBufferView>& inputs,
                        std::vector<WritableAudioBufferView>& outputs,
                        int numSamples) {
    if (!prepared_ || outputs.empty() || numSamples <= 0) {
        if (!outputs.empty()) {
            outputs[0].clear();
        }
        return;
    }

    const int inputCount = inputCount_.load(std::memory_order_acquire);
    const float tMaster = targetMaster_.load(std::memory_order_acquire);

    for (int i = 0; i < numSamples; ++i) {
        float outL = 0.0f;
        float outR = 0.0f;

        for (int bus = 0; bus < inputCount; ++bus) {
            const size_t busIndex = static_cast<size_t>(bus);
            const float targetGain = targetGains_[busIndex].load(std::memory_order_acquire);
            const float targetPan = targetPans_[busIndex].load(std::memory_order_acquire);

            gains_[busIndex] += (targetGain - gains_[busIndex]) * smooth_;
            pans_[busIndex] += (targetPan - pans_[busIndex]) * smooth_;

            const int viewIndex = bus * 2;
            if (inputs.size() <= static_cast<size_t>(viewIndex)) {
                continue;
            }

            const auto& inView = inputs[static_cast<size_t>(viewIndex)];
            const float inL = inView.getSample(0, i);
            const float inR = inView.numChannels > 1
                                  ? inView.getSample(1, i)
                                  : inL;

            float panL = 1.0f;
            float panR = 1.0f;
            equalPowerPan(pans_[busIndex], panL, panR);

            outL += inL * gains_[busIndex] * panL;
            outR += inR * gains_[busIndex] * panR;
        }

        master_ += (tMaster - master_) * smooth_;
        outL *= master_;
        outR *= master_;

        outputs[0].setSample(0, i, outL);
        if (outputs[0].numChannels > 1) {
            outputs[0].setSample(1, i, outR);
        }
    }
}

} // namespace dsp_primitives
