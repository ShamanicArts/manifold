#include "dsp/core/nodes/ChorusNode.h"

#include <algorithm>
#include <cmath>

namespace dsp_primitives {

namespace {
inline float clamp01(float v) {
    return juce::jlimit(0.0f, 1.0f, v);
}
}

ChorusNode::ChorusNode() = default;

void ChorusNode::prepare(double sampleRate, int maxBlockSize) {
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    const int minSize = 512;
    const int required = static_cast<int>(std::ceil(sampleRate_ * kMaxDelaySeconds)) + std::max(8, maxBlockSize);
    bufferSize_ = std::max(minSize, required);
    delayBuffer_.setSize(2, bufferSize_, false, true, true);
    delayBuffer_.clear();
    writeIndex_ = 0;

    const double smoothTime = 0.01;
    const float coeff = static_cast<float>(1.0 - std::exp(-1.0 / (smoothTime * sampleRate_)));
    rateSmooth_ = juce::jlimit(0.0001f, 1.0f, coeff);
    depthSmooth_ = rateSmooth_;
    spreadSmooth_ = rateSmooth_;
    feedbackSmooth_ = rateSmooth_;
    mixSmooth_ = rateSmooth_;

    currentRateHz_ = targetRateHz_.load(std::memory_order_acquire);
    currentDepth_ = targetDepth_.load(std::memory_order_acquire);
    currentSpread_ = targetSpread_.load(std::memory_order_acquire);
    currentFeedback_ = targetFeedback_.load(std::memory_order_acquire);
    currentMix_ = targetMix_.load(std::memory_order_acquire);

    for (int ch = 0; ch < 2; ++ch) {
        const size_t channelIndex = static_cast<size_t>(ch);
        for (int v = 0; v < 4; ++v) {
            const size_t voiceIndex = static_cast<size_t>(v);
            const float channelOffset = (ch == 0) ? 0.0f : 0.25f;
            phase_[channelIndex][voiceIndex] = std::fmod((static_cast<float>(v) * 0.23f) + channelOffset, 1.0f);
        }
    }

    prepared_ = true;
}

void ChorusNode::reset() {
    if (bufferSize_ > 0) {
        delayBuffer_.clear();
    }
    writeIndex_ = 0;
    for (auto& channelPhases : phase_) {
        channelPhases.fill(0.0f);
    }
}

float ChorusNode::lfo(float phase, Waveform waveform) const {
    const float p = phase - std::floor(phase);
    if (waveform == Waveform::Triangle) {
        return 4.0f * std::abs(p - 0.5f) - 1.0f;
    }
    return std::sin(2.0f * juce::MathConstants<float>::pi * p);
}

float ChorusNode::readDelay(int channel, float delaySamples) const {
    const float readPos = static_cast<float>(writeIndex_) - delaySamples;
    float wrapped = readPos;
    while (wrapped < 0.0f) {
        wrapped += static_cast<float>(bufferSize_);
    }
    while (wrapped >= static_cast<float>(bufferSize_)) {
        wrapped -= static_cast<float>(bufferSize_);
    }

    const int idx0 = static_cast<int>(wrapped);
    const int idx1 = (idx0 + 1) % bufferSize_;
    const float frac = wrapped - static_cast<float>(idx0);

    const float a = delayBuffer_.getSample(channel, idx0);
    const float b = delayBuffer_.getSample(channel, idx1);
    return a + (b - a) * frac;
}

void ChorusNode::process(const std::vector<AudioBufferView>& inputs,
                         std::vector<WritableAudioBufferView>& outputs,
                         int numSamples) {
    if (!prepared_ || outputs.empty() || numSamples <= 0 || bufferSize_ <= 1) {
        if (!inputs.empty() && !outputs.empty()) {
            const int channels = std::min(inputs[0].numChannels, outputs[0].numChannels);
            for (int ch = 0; ch < channels; ++ch) {
                for (int i = 0; i < numSamples; ++i) {
                    outputs[0].setSample(ch, i, inputs[0].getSample(ch, i));
                }
            }
        }
        return;
    }

    const int inChannels = inputs.empty() ? 0 : inputs[0].numChannels;
    const int outChannels = outputs[0].numChannels;
    const int channels = std::max(1, std::min(2, std::min(inChannels, outChannels)));

    const float targetRate = targetRateHz_.load(std::memory_order_acquire);
    const float targetDepth = targetDepth_.load(std::memory_order_acquire);
    const float targetSpread = targetSpread_.load(std::memory_order_acquire);
    const float targetFeedback = targetFeedback_.load(std::memory_order_acquire);
    const float targetMix = targetMix_.load(std::memory_order_acquire);
    const int voices = juce::jlimit(1, 4, targetVoices_.load(std::memory_order_acquire));
    const Waveform waveform = targetWaveform_.load(std::memory_order_acquire);

    for (int i = 0; i < numSamples; ++i) {
        currentRateHz_ += (targetRate - currentRateHz_) * rateSmooth_;
        currentDepth_ += (targetDepth - currentDepth_) * depthSmooth_;
        currentSpread_ += (targetSpread - currentSpread_) * spreadSmooth_;
        currentFeedback_ += (targetFeedback - currentFeedback_) * feedbackSmooth_;
        currentMix_ += (targetMix - currentMix_) * mixSmooth_;

        currentDepth_ = clamp01(currentDepth_);
        currentSpread_ = clamp01(currentSpread_);
        currentMix_ = clamp01(currentMix_);

        const float phaseInc = currentRateHz_ / static_cast<float>(sampleRate_);
        const float depthMs = currentDepth_ * kMaxDepthMs;

        float inputL = inputs.empty() ? 0.0f : inputs[0].getSample(0, i);
        float inputR = (inputs.empty() || channels < 2) ? inputL : inputs[0].getSample(1, i);

        float delayedL = 0.0f;
        float delayedR = 0.0f;

        for (int v = 0; v < voices; ++v) {
            const size_t voiceIndex = static_cast<size_t>(v);
            const float voiceSpreadOffset = (static_cast<float>(v) - static_cast<float>(voices - 1) * 0.5f) * 0.12f;

            phase_[0][voiceIndex] += phaseInc;
            if (phase_[0][voiceIndex] >= 1.0f) {
                phase_[0][voiceIndex] -= 1.0f;
            }
            phase_[1][voiceIndex] += phaseInc;
            if (phase_[1][voiceIndex] >= 1.0f) {
                phase_[1][voiceIndex] -= 1.0f;
            }

            const float leftPhase = phase_[0][voiceIndex] + voiceSpreadOffset;
            const float rightPhase = phase_[1][voiceIndex] + voiceSpreadOffset + (0.25f * currentSpread_);

            const float lfoL = lfo(leftPhase, waveform);
            const float lfoR = lfo(rightPhase, waveform);

            const float delayMsL = kBaseDelayMs + depthMs * (0.5f + 0.5f * lfoL);
            const float delayMsR = kBaseDelayMs + depthMs * (0.5f + 0.5f * lfoR);

            const float delaySamplesL = juce::jlimit(1.0f, static_cast<float>(bufferSize_ - 2), delayMsL * 0.001f * static_cast<float>(sampleRate_));
            const float delaySamplesR = juce::jlimit(1.0f, static_cast<float>(bufferSize_ - 2), delayMsR * 0.001f * static_cast<float>(sampleRate_));

            delayedL += readDelay(0, delaySamplesL);
            delayedR += readDelay(1, delaySamplesR);
        }

        delayedL /= static_cast<float>(voices);
        delayedR /= static_cast<float>(voices);

        const float wetL = delayedL;
        const float wetR = delayedR;

        const float outL = inputL * (1.0f - currentMix_) + wetL * currentMix_;
        const float outR = inputR * (1.0f - currentMix_) + wetR * currentMix_;

        outputs[0].setSample(0, i, outL);
        if (channels > 1) {
            outputs[0].setSample(1, i, outR);
        }

        const float writeL = inputL + wetL * currentFeedback_;
        const float writeR = inputR + wetR * currentFeedback_;
        delayBuffer_.setSample(0, writeIndex_, writeL);
        delayBuffer_.setSample(1, writeIndex_, writeR);

        ++writeIndex_;
        if (writeIndex_ >= bufferSize_) {
            writeIndex_ = 0;
        }
    }
}

} // namespace dsp_primitives
