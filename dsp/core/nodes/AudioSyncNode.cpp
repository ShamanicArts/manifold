#include "dsp/core/nodes/AudioSyncNode.h"

#include <cmath>

namespace dsp_primitives {

namespace {

static int wrapIndex(int index, int bufferSize) {
    if (bufferSize <= 0) {
        return 0;
    }
    while (index < 0) {
        index += bufferSize;
    }
    while (index >= bufferSize) {
        index -= bufferSize;
    }
    return index;
}

} // namespace

AudioSyncNode::AudioSyncNode() = default;

void AudioSyncNode::prepare(double sampleRate, int maxBlockSize) {
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    const double smoothTime = 0.01;
    smooth_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothTime * sampleRate_)));
    smooth_ = juce::jlimit(0.0001f, 1.0f, smooth_);

    currentHardness_ = targetHardness_.load(std::memory_order_acquire);
    currentMix_ = targetMix_.load(std::memory_order_acquire);

    const int minBuffer = static_cast<int>(std::ceil(sampleRate_ * 0.1)) + juce::jmax(4, maxBlockSize) + 8;
    bufferSize_ = juce::jmax(4096, minBuffer);
    for (auto& channelBuffer : historyBuffer_) {
        channelBuffer.assign(static_cast<std::size_t>(bufferSize_), 0.0f);
    }

    reset();
    prepared_ = true;
}

void AudioSyncNode::reset() {
    writePos_ = 0;
    samplesSinceTrigger_ = 0;
    lastPeriodSamples_ = 128;
    cycleSample_ = 0;
    prevSyncSample_ = 0.0f;
    for (auto& channelBuffer : historyBuffer_) {
        std::fill(channelBuffer.begin(), channelBuffer.end(), 0.0f);
    }
}

void AudioSyncNode::process(const std::vector<AudioBufferView>& inputs,
                            std::vector<WritableAudioBufferView>& outputs,
                            int numSamples) {
    if (!prepared_ || outputs.empty() || numSamples <= 0) {
        if (!outputs.empty()) {
            outputs[0].clear();
        }
        return;
    }

    const bool hasSyncBus = inputs.size() >= 3;
    const float tHardness = targetHardness_.load(std::memory_order_acquire);
    const float tMix = targetMix_.load(std::memory_order_acquire);

    for (int i = 0; i < numSamples; ++i) {
        currentHardness_ += (tHardness - currentHardness_) * smooth_;
        currentMix_ += (tMix - currentMix_) * smooth_;

        const float inL = !inputs.empty() ? inputs[0].getSample(0, i) : 0.0f;
        const float inR = (!inputs.empty() && inputs[0].numChannels > 1) ? inputs[0].getSample(1, i) : inL;

        historyBuffer_[0][static_cast<std::size_t>(writePos_)] = inL;
        historyBuffer_[1][static_cast<std::size_t>(writePos_)] = inR;

        float triggerSample = 0.0f;
        if (hasSyncBus) {
            const float syncL = inputs[2].getSample(0, i);
            const float syncR = inputs[2].numChannels > 1 ? inputs[2].getSample(1, i) : syncL;
            triggerSample = 0.5f * (syncL + syncR);
        }

        const bool trigger = hasSyncBus && prevSyncSample_ <= 0.0f && triggerSample > 0.0f;
        prevSyncSample_ = triggerSample;

        if (trigger) {
            if (samplesSinceTrigger_ > 1) {
                lastPeriodSamples_ = juce::jlimit(8, bufferSize_ - 4, samplesSinceTrigger_);
            }
            samplesSinceTrigger_ = 0;
            cycleSample_ = 0;
        }

        float replayL = inL;
        float replayR = inR;
        if (hasSyncBus && lastPeriodSamples_ > 1) {
            const int cycleIndex = cycleSample_ % juce::jmax(1, lastPeriodSamples_);
            const int startIndex = writePos_ - lastPeriodSamples_ + cycleIndex;
            replayL = historyBuffer_[0][static_cast<std::size_t>(wrapIndex(startIndex, bufferSize_))];
            replayR = historyBuffer_[1][static_cast<std::size_t>(wrapIndex(startIndex, bufferSize_))];
        }

        const float wetL = inL + (replayL - inL) * currentHardness_;
        const float wetR = inR + (replayR - inR) * currentHardness_;
        const float dry = 1.0f - currentMix_;

        outputs[0].setSample(0, i, inL * dry + wetL * currentMix_);
        if (outputs[0].numChannels > 1) {
            outputs[0].setSample(1, i, inR * dry + wetR * currentMix_);
        }

        ++samplesSinceTrigger_;
        cycleSample_ = (cycleSample_ + 1) % juce::jmax(1, lastPeriodSamples_);
        writePos_ = (writePos_ + 1) % bufferSize_;
    }
}

} // namespace dsp_primitives
