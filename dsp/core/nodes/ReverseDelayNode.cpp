#include "dsp/core/nodes/ReverseDelayNode.h"

#include <cmath>

namespace dsp_primitives {

namespace {
inline void copyDryToOutput(const AudioBufferView& input,
                            WritableAudioBufferView& output,
                            int numSamples) {
    for (int i = 0; i < numSamples; ++i) {
        const float inL = input.getSample(0, i);
        const float inR = input.numChannels > 1 ? input.getSample(1, i) : inL;
        output.setSample(0, i, inL);
        if (output.numChannels > 1) {
            output.setSample(1, i, inR);
        }
    }
}
}

ReverseDelayNode::ReverseDelayNode() = default;

void ReverseDelayNode::prepare(double sampleRate, int maxBlockSize) {
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    const int maxSeconds = 3;
    bufferSize_ = static_cast<int>(sampleRate_ * maxSeconds) + std::max(64, maxBlockSize);
    delayBuffer_.setSize(2, bufferSize_, false, true, true);
    delayBuffer_.clear();

    const double smoothTime = 0.01;
    smooth_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothTime * sampleRate_)));
    smooth_ = juce::jlimit(0.0001f, 1.0f, smooth_);

    currentTimeMs_ = targetTimeMs_.load(std::memory_order_acquire);
    currentWindowMs_ = targetWindowMs_.load(std::memory_order_acquire);
    currentFeedback_ = targetFeedback_.load(std::memory_order_acquire);
    currentMix_ = targetMix_.load(std::memory_order_acquire);

    reset();
    prepared_ = true;
}

void ReverseDelayNode::reset() {
    delayBuffer_.clear();
    writeIndex_ = 0;
    readPos_[0] = 0.0f;
    readPos_[1] = 0.0f;
    segmentSamplesRemaining_[0] = 0;
    segmentSamplesRemaining_[1] = 0;
}

float ReverseDelayNode::triangular(float t) {
    const float x = juce::jlimit(0.0f, 1.0f, t);
    return 1.0f - std::abs(2.0f * x - 1.0f);
}

void ReverseDelayNode::process(const std::vector<AudioBufferView>& inputs,
                               std::vector<WritableAudioBufferView>& outputs,
                               int numSamples) {
    if (!prepared_ || inputs.empty() || outputs.empty() || numSamples <= 0) {
        if (!outputs.empty()) {
            outputs[0].clear();
        }
        return;
    }

    const float tTime = targetTimeMs_.load(std::memory_order_acquire);
    const float tWindow = targetWindowMs_.load(std::memory_order_acquire);
    const float tFeedback = targetFeedback_.load(std::memory_order_acquire);
    const float tMix = targetMix_.load(std::memory_order_acquire);

    const bool dormant = tMix <= 1.0e-4f
        && currentMix_ <= 1.0e-4f
        && tFeedback <= 1.0e-4f
        && currentFeedback_ <= 1.0e-4f;
    if (dormant) {
        if (!dormantBypass_) {
            reset();
            dormantBypass_ = true;
        }
        copyDryToOutput(inputs[0], outputs[0], numSamples);
        return;
    }
    if (dormantBypass_) {
        reset();
        dormantBypass_ = false;
    }

    for (int i = 0; i < numSamples; ++i) {
        currentTimeMs_ += (tTime - currentTimeMs_) * smooth_;
        currentWindowMs_ += (tWindow - currentWindowMs_) * smooth_;
        currentFeedback_ += (tFeedback - currentFeedback_) * smooth_;
        currentMix_ += (tMix - currentMix_) * smooth_;

        const int delaySamples = juce::jlimit(
            1,
            bufferSize_ - 2,
            static_cast<int>(currentTimeMs_ * 0.001f * static_cast<float>(sampleRate_)));
        const int windowSamples = juce::jlimit(
            8,
            delaySamples,
            static_cast<int>(currentWindowMs_ * 0.001f * static_cast<float>(sampleRate_)));

        const float inL = inputs[0].getSample(0, i);
        const float inR = inputs[0].numChannels > 1 ? inputs[0].getSample(1, i) : inL;

        float wetL = 0.0f;
        float wetR = 0.0f;

        for (int ch = 0; ch < 2; ++ch) {
            if (segmentSamplesRemaining_[static_cast<size_t>(ch)] <= 0) {
                const int segmentStart = (writeIndex_ - delaySamples + bufferSize_) % bufferSize_;
                readPos_[static_cast<size_t>(ch)] = static_cast<float>(segmentStart + windowSamples - 1);
                while (readPos_[static_cast<size_t>(ch)] >= static_cast<float>(bufferSize_)) {
                    readPos_[static_cast<size_t>(ch)] -= static_cast<float>(bufferSize_);
                }
                segmentSamplesRemaining_[static_cast<size_t>(ch)] = windowSamples;
            }

            const int idx = static_cast<int>(readPos_[static_cast<size_t>(ch)]) % bufferSize_;
            float sample = delayBuffer_.getSample(ch, idx);

            const float progress = 1.0f -
                static_cast<float>(segmentSamplesRemaining_[static_cast<size_t>(ch)]) /
                static_cast<float>(juce::jmax(1, windowSamples));
            sample *= triangular(progress);

            readPos_[static_cast<size_t>(ch)] -= 1.0f;
            if (readPos_[static_cast<size_t>(ch)] < 0.0f) {
                readPos_[static_cast<size_t>(ch)] += static_cast<float>(bufferSize_);
            }
            segmentSamplesRemaining_[static_cast<size_t>(ch)] -= 1;

            if (ch == 0) {
                wetL = sample;
            } else {
                wetR = sample;
            }
        }

        delayBuffer_.setSample(0, writeIndex_, inL + wetL * currentFeedback_);
        delayBuffer_.setSample(1, writeIndex_, inR + wetR * currentFeedback_);

        writeIndex_ = (writeIndex_ + 1) % bufferSize_;

        const float dry = 1.0f - currentMix_;
        outputs[0].setSample(0, i, inL * dry + wetL * currentMix_);
        if (outputs[0].numChannels > 1) {
            outputs[0].setSample(1, i, inR * dry + wetR * currentMix_);
        }
    }
}

} // namespace dsp_primitives
