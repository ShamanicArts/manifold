#include "dsp/core/nodes/AudioFmNode.h"

#include <cmath>

namespace dsp_primitives {

namespace {

static float readWrappedLinear(const std::vector<float>& buffer,
                               int bufferSize,
                               float index) {
    if (bufferSize <= 1 || static_cast<int>(buffer.size()) < bufferSize) {
        return 0.0f;
    }

    while (index < 0.0f) {
        index += static_cast<float>(bufferSize);
    }
    while (index >= static_cast<float>(bufferSize)) {
        index -= static_cast<float>(bufferSize);
    }

    const int indexA = juce::jlimit(0, bufferSize - 1, static_cast<int>(std::floor(index)));
    const int indexB = (indexA + 1) % bufferSize;
    const float frac = index - static_cast<float>(indexA);
    return buffer[static_cast<std::size_t>(indexA)]
         + (buffer[static_cast<std::size_t>(indexB)] - buffer[static_cast<std::size_t>(indexA)]) * frac;
}

} // namespace

AudioFmNode::AudioFmNode() = default;

void AudioFmNode::prepare(double sampleRate, int maxBlockSize) {
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    const double smoothTime = 0.01;
    smooth_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothTime * sampleRate_)));
    smooth_ = juce::jlimit(0.0001f, 1.0f, smooth_);

    currentAmount_ = targetAmount_.load(std::memory_order_acquire);
    currentMix_ = targetMix_.load(std::memory_order_acquire);

    const int minBuffer = static_cast<int>(std::ceil(sampleRate_ * 0.03)) + juce::jmax(4, maxBlockSize) + 8;
    bufferSize_ = juce::jmax(2048, minBuffer);
    for (auto& channelBuffer : delayBuffer_) {
        channelBuffer.assign(static_cast<std::size_t>(bufferSize_), 0.0f);
    }

    reset();
    prepared_ = true;
}

void AudioFmNode::reset() {
    writePos_ = 0;
    for (auto& channelBuffer : delayBuffer_) {
        std::fill(channelBuffer.begin(), channelBuffer.end(), 0.0f);
    }
}

void AudioFmNode::process(const std::vector<AudioBufferView>& inputs,
                          std::vector<WritableAudioBufferView>& outputs,
                          int numSamples) {
    if (!prepared_ || outputs.empty() || numSamples <= 0) {
        if (!outputs.empty()) {
            outputs[0].clear();
        }
        return;
    }

    const bool hasModBus = inputs.size() >= 3;
    const float tAmount = targetAmount_.load(std::memory_order_acquire);
    const float tMix = targetMix_.load(std::memory_order_acquire);
    const float maxModSamples = juce::jlimit(1.0f, static_cast<float>(bufferSize_ - 8), static_cast<float>(sampleRate_ * 0.005));
    const float centerDelay = maxModSamples + 2.0f;

    for (int i = 0; i < numSamples; ++i) {
        currentAmount_ += (tAmount - currentAmount_) * smooth_;
        currentMix_ += (tMix - currentMix_) * smooth_;

        const float inL = !inputs.empty() ? inputs[0].getSample(0, i) : 0.0f;
        const float inR = (!inputs.empty() && inputs[0].numChannels > 1) ? inputs[0].getSample(1, i) : inL;
        const float modL = hasModBus ? juce::jlimit(-1.0f, 1.0f, inputs[2].getSample(0, i)) : 0.0f;
        const float modR = hasModBus
            ? juce::jlimit(-1.0f, 1.0f, inputs[2].numChannels > 1 ? inputs[2].getSample(1, i) : modL)
            : modL;

        delayBuffer_[0][static_cast<std::size_t>(writePos_)] = inL;
        delayBuffer_[1][static_cast<std::size_t>(writePos_)] = inR;

        const float delayL = juce::jlimit(1.0f, static_cast<float>(bufferSize_ - 4), centerDelay + modL * currentAmount_ * maxModSamples);
        const float delayR = juce::jlimit(1.0f, static_cast<float>(bufferSize_ - 4), centerDelay + modR * currentAmount_ * maxModSamples);

        const float delayedL = readWrappedLinear(delayBuffer_[0], bufferSize_, static_cast<float>(writePos_) - delayL);
        const float delayedR = readWrappedLinear(delayBuffer_[1], bufferSize_, static_cast<float>(writePos_) - delayR);

        const float wetL = inL + (delayedL - inL) * currentAmount_;
        const float wetR = inR + (delayedR - inR) * currentAmount_;
        const float dry = 1.0f - currentMix_;

        outputs[0].setSample(0, i, inL * dry + wetL * currentMix_);
        if (outputs[0].numChannels > 1) {
            outputs[0].setSample(1, i, inR * dry + wetR * currentMix_);
        }

        writePos_ = (writePos_ + 1) % bufferSize_;
    }
}

} // namespace dsp_primitives
