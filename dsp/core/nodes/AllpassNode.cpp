#include "AllpassNode.h"

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
} // namespace

AllpassNode::AllpassNode(float maxDelayMs) {
    setMaxDelay(maxDelayMs);
    setDelay(2.0f);
    setFeedback(0.0f);
}

void AllpassNode::prepare(double sampleRate, int maxBlockSize) {
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    const int absoluteMaxDelaySamples = static_cast<int>(sampleRate_ * (kAbsoluteMaxDelayMs * 0.001f));
    bufferSize_ = absoluteMaxDelaySamples + std::max(4, maxBlockSize) + 4;

    delayBuffer_[0].assign(static_cast<size_t>(bufferSize_), 0.0f);
    delayBuffer_[1].assign(static_cast<size_t>(bufferSize_), 0.0f);

    currentMaxDelayMs_ = clampf(targetMaxDelayMs_.load(std::memory_order_acquire), 0.1f, kAbsoluteMaxDelayMs);
    currentDelayMs_ = clampf(targetDelayMs_.load(std::memory_order_acquire), 0.0f, currentMaxDelayMs_);
    currentFeedback_ = clampf(targetFeedback_.load(std::memory_order_acquire), -0.999f, 0.999f);
    writeIdx_ = 0;

    prepared_ = true;
}

void AllpassNode::reset() {
    std::fill(delayBuffer_[0].begin(), delayBuffer_[0].end(), 0.0f);
    std::fill(delayBuffer_[1].begin(), delayBuffer_[1].end(), 0.0f);
    writeIdx_ = 0;
}

void AllpassNode::process(const std::vector<AudioBufferView>& inputs,
                          std::vector<WritableAudioBufferView>& outputs,
                          int numSamples) {
    if (!prepared_ || outputs.empty() || numSamples <= 0 || inputs.empty()) {
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

    const float targetMaxDelay = clampf(targetMaxDelayMs_.load(std::memory_order_acquire), 0.1f, kAbsoluteMaxDelayMs);
    const float targetFeedback = clampf(targetFeedback_.load(std::memory_order_acquire), -0.999f, 0.999f);
    const float targetDelay = clampf(targetDelayMs_.load(std::memory_order_acquire), 0.0f, targetMaxDelay);

    float maxDelayMs = currentMaxDelayMs_;
    float delayMs = currentDelayMs_;
    float feedback = currentFeedback_;

    const float maxDelayStep = (targetMaxDelay - maxDelayMs) / static_cast<float>(numSamples);
    const float delayStep = (targetDelay - delayMs) / static_cast<float>(numSamples);
    const float feedbackStep = (targetFeedback - feedback) / static_cast<float>(numSamples);

    const int numCh = std::min(inputs[0].numChannels, outputs[0].numChannels);
    const float samplesPerMs = static_cast<float>(sampleRate_ * 0.001);

    for (int ch = 0; ch < numCh; ++ch) {
        const float* in = inputs[0].channelData[ch];
        float* out = outputs[0].channelData[ch];
        auto& buf = delayBuffer_[ch];

        float sampleMaxDelay = maxDelayMs;
        float sampleDelayMs = delayMs;
        float sampleFeedback = feedback;
        int localWriteIdx = writeIdx_;

        for (int i = 0; i < numSamples; ++i) {
            sampleMaxDelay += maxDelayStep;
            sampleDelayMs += delayStep;
            sampleFeedback += feedbackStep;

            const float maxDelayClamped = clampf(sampleMaxDelay, 0.1f, kAbsoluteMaxDelayMs);
            const float delayClamped = clampf(sampleDelayMs, 0.0f, maxDelayClamped);
            const float delaySamples = std::max(1.0f, delayClamped * samplesPerMs);
            const float readIndex = static_cast<float>(localWriteIdx) - delaySamples;
            const float delayedState = readInterpolated(buf, readIndex);

            const float x = in[i];
            const float state = x + sampleFeedback * delayedState;
            const float y = delayedState - sampleFeedback * state;

            buf[static_cast<size_t>(localWriteIdx)] = state;
            out[i] = y;

            localWriteIdx = (localWriteIdx + 1) % bufferSize_;
        }
    }

    writeIdx_ = (writeIdx_ + numSamples) % bufferSize_;
    currentMaxDelayMs_ = targetMaxDelay;
    currentDelayMs_ = targetDelay;
    currentFeedback_ = targetFeedback;
}

void AllpassNode::setMaxDelay(float ms) {
    targetMaxDelayMs_.store(clampf(ms, 0.1f, kAbsoluteMaxDelayMs), std::memory_order_release);
}

void AllpassNode::setDelay(float ms) {
    const float maxDelay = targetMaxDelayMs_.load(std::memory_order_acquire);
    targetDelayMs_.store(clampf(ms, 0.0f, maxDelay), std::memory_order_release);
}

void AllpassNode::setFeedback(float feedback) {
    targetFeedback_.store(clampf(feedback, -0.999f, 0.999f), std::memory_order_release);
}

float AllpassNode::getMaxDelay() const {
    return targetMaxDelayMs_.load(std::memory_order_acquire);
}

float AllpassNode::getDelay() const {
    return targetDelayMs_.load(std::memory_order_acquire);
}

float AllpassNode::getFeedback() const {
    return targetFeedback_.load(std::memory_order_acquire);
}

} // namespace dsp_primitives
