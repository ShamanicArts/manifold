#include "CombNode.h"

#include <algorithm>
#include <cmath>

namespace dsp_primitives {

namespace {
inline float clampf(float v, float lo, float hi) {
    return std::max(lo, std::min(hi, v));
}

inline float wrapReadIndex(float idx, int size) {
    while (idx < 0.0f) {
        idx += static_cast<float>(size);
    }
    while (idx >= static_cast<float>(size)) {
        idx -= static_cast<float>(size);
    }
    return idx;
}

inline float readInterpolated(const std::vector<float>& buffer, float readIndex) {
    const int size = static_cast<int>(buffer.size());
    if (size <= 1) {
        return 0.0f;
    }

    const float wrapped = wrapReadIndex(readIndex, size);
    const int idxA = static_cast<int>(std::floor(wrapped));
    const int idxB = (idxA + 1) % size;
    const float frac = wrapped - static_cast<float>(idxA);
    return buffer[static_cast<size_t>(idxA)] +
           (buffer[static_cast<size_t>(idxB)] - buffer[static_cast<size_t>(idxA)]) * frac;
}

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
} // namespace

CombNode::CombNode(float maxDelayMs) {
    setMaxDelay(maxDelayMs);
    setDelay(2.0f);
    setGain(1.0f);
    setFeedforward(0.0f);
    setFeedback(0.0f);
}

void CombNode::prepare(double sampleRate, int maxBlockSize) {
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    const int absoluteMaxDelaySamples = static_cast<int>(sampleRate_ * (kAbsoluteMaxDelayMs * 0.001f));
    bufferSize_ = absoluteMaxDelaySamples + std::max(4, maxBlockSize) + 4;

    inputDelayBuffer_[0].assign(static_cast<size_t>(bufferSize_), 0.0f);
    inputDelayBuffer_[1].assign(static_cast<size_t>(bufferSize_), 0.0f);
    outputDelayBuffer_[0].assign(static_cast<size_t>(bufferSize_), 0.0f);
    outputDelayBuffer_[1].assign(static_cast<size_t>(bufferSize_), 0.0f);

    currentMaxDelayMs_ = clampf(targetMaxDelayMs_.load(std::memory_order_acquire), 0.1f, kAbsoluteMaxDelayMs);
    currentDelayMs_ = clampf(targetDelayMs_.load(std::memory_order_acquire), 0.0f, currentMaxDelayMs_);
    currentGain_ = clampf(targetGain_.load(std::memory_order_acquire), -4.0f, 4.0f);
    currentFeedforward_ = clampf(targetFeedforward_.load(std::memory_order_acquire), -4.0f, 4.0f);
    currentFeedback_ = clampf(targetFeedback_.load(std::memory_order_acquire), -0.999f, 0.999f);
    writeIdx_ = 0;

    prepared_ = true;
}

void CombNode::reset() {
    std::fill(inputDelayBuffer_[0].begin(), inputDelayBuffer_[0].end(), 0.0f);
    std::fill(inputDelayBuffer_[1].begin(), inputDelayBuffer_[1].end(), 0.0f);
    std::fill(outputDelayBuffer_[0].begin(), outputDelayBuffer_[0].end(), 0.0f);
    std::fill(outputDelayBuffer_[1].begin(), outputDelayBuffer_[1].end(), 0.0f);
    writeIdx_ = 0;
}

void CombNode::process(const std::vector<AudioBufferView>& inputs,
                       std::vector<WritableAudioBufferView>& outputs,
                       int numSamples) {
    if (!prepared_ || outputs.empty() || numSamples <= 0 || inputs.empty()) {
        if (!inputs.empty() && !outputs.empty()) {
            copyDryToOutput(inputs[0], outputs[0], numSamples);
        } else if (!outputs.empty()) {
            outputs[0].clear();
        }
        return;
    }

    const float targetMaxDelay = clampf(targetMaxDelayMs_.load(std::memory_order_acquire), 0.1f, kAbsoluteMaxDelayMs);
    const float targetDelay = clampf(targetDelayMs_.load(std::memory_order_acquire), 0.0f, targetMaxDelay);
    const float targetGain = clampf(targetGain_.load(std::memory_order_acquire), -4.0f, 4.0f);
    const float targetFeedforward = clampf(targetFeedforward_.load(std::memory_order_acquire), -4.0f, 4.0f);
    const float targetFeedback = clampf(targetFeedback_.load(std::memory_order_acquire), -0.999f, 0.999f);

    float maxDelayMs = currentMaxDelayMs_;
    float delayMs = currentDelayMs_;
    float gain = currentGain_;
    float feedforward = currentFeedforward_;
    float feedback = currentFeedback_;

    const float maxDelayStep = (targetMaxDelay - maxDelayMs) / static_cast<float>(numSamples);
    const float delayStep = (targetDelay - delayMs) / static_cast<float>(numSamples);
    const float gainStep = (targetGain - gain) / static_cast<float>(numSamples);
    const float feedforwardStep = (targetFeedforward - feedforward) / static_cast<float>(numSamples);
    const float feedbackStep = (targetFeedback - feedback) / static_cast<float>(numSamples);

    const int numCh = std::min(inputs[0].numChannels, outputs[0].numChannels);
    const float samplesPerMs = static_cast<float>(sampleRate_ * 0.001);

    for (int ch = 0; ch < numCh; ++ch) {
        const float* in = inputs[0].channelData[ch];
        float* out = outputs[0].channelData[ch];
        auto& xBuf = inputDelayBuffer_[ch];
        auto& yBuf = outputDelayBuffer_[ch];

        float sampleMaxDelay = maxDelayMs;
        float sampleDelayMs = delayMs;
        float sampleGain = gain;
        float sampleFeedforward = feedforward;
        float sampleFeedback = feedback;
        int localWriteIdx = writeIdx_;

        for (int i = 0; i < numSamples; ++i) {
            sampleMaxDelay += maxDelayStep;
            sampleDelayMs += delayStep;
            sampleGain += gainStep;
            sampleFeedforward += feedforwardStep;
            sampleFeedback += feedbackStep;

            const float maxDelayClamped = clampf(sampleMaxDelay, 0.1f, kAbsoluteMaxDelayMs);
            const float delayClamped = clampf(sampleDelayMs, 0.0f, maxDelayClamped);
            const float delaySamples = std::max(1.0f, delayClamped * samplesPerMs);
            const float readIndex = static_cast<float>(localWriteIdx) - delaySamples;

            const float delayedInput = readInterpolated(xBuf, readIndex);
            const float delayedOutput = readInterpolated(yBuf, readIndex);
            const float x = in[i];
            const float y = sampleGain * x +
                            sampleFeedforward * delayedInput +
                            sampleFeedback * delayedOutput;

            xBuf[static_cast<size_t>(localWriteIdx)] = x;
            yBuf[static_cast<size_t>(localWriteIdx)] = y;
            out[i] = y;

            localWriteIdx = (localWriteIdx + 1) % bufferSize_;
        }
    }

    writeIdx_ = (writeIdx_ + numSamples) % bufferSize_;
    currentMaxDelayMs_ = targetMaxDelay;
    currentDelayMs_ = targetDelay;
    currentGain_ = targetGain;
    currentFeedforward_ = targetFeedforward;
    currentFeedback_ = targetFeedback;
}

void CombNode::setMaxDelay(float ms) {
    targetMaxDelayMs_.store(clampf(ms, 0.1f, kAbsoluteMaxDelayMs), std::memory_order_release);
}

void CombNode::setDelay(float ms) {
    const float maxDelay = targetMaxDelayMs_.load(std::memory_order_acquire);
    targetDelayMs_.store(clampf(ms, 0.0f, maxDelay), std::memory_order_release);
}

void CombNode::setGain(float gain) {
    targetGain_.store(clampf(gain, -4.0f, 4.0f), std::memory_order_release);
}

void CombNode::setFeedforward(float feedforward) {
    targetFeedforward_.store(clampf(feedforward, -4.0f, 4.0f), std::memory_order_release);
}

void CombNode::setFeedback(float feedback) {
    targetFeedback_.store(clampf(feedback, -0.999f, 0.999f), std::memory_order_release);
}

float CombNode::getMaxDelay() const {
    return targetMaxDelayMs_.load(std::memory_order_acquire);
}

float CombNode::getDelay() const {
    return targetDelayMs_.load(std::memory_order_acquire);
}

float CombNode::getGain() const {
    return targetGain_.load(std::memory_order_acquire);
}

float CombNode::getFeedforward() const {
    return targetFeedforward_.load(std::memory_order_acquire);
}

float CombNode::getFeedback() const {
    return targetFeedback_.load(std::memory_order_acquire);
}

} // namespace dsp_primitives
