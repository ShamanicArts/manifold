#include "dsp/core/nodes/RetrospectiveCaptureNode.h"

#include <cmath>

namespace dsp_primitives {

RetrospectiveCaptureNode::RetrospectiveCaptureNode(int numChannels)
    : numChannels_(numChannels) {}

void RetrospectiveCaptureNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    const float newRate = sampleRate > 1.0 ? static_cast<float>(sampleRate) : 44100.0f;

    const int oldSize = captureSize_.load(std::memory_order_acquire);
    const int oldChannels = captureBuffer_.getNumChannels();

    sampleRate_ = newRate;
    ensureBuffer(sampleRate_);

    const bool recreated = (captureSize_.load(std::memory_order_acquire) != oldSize) ||
                           (captureBuffer_.getNumChannels() != oldChannels);
    if (recreated) {
        writeOffset_.store(0, std::memory_order_release);
    }
}

void RetrospectiveCaptureNode::process(const std::vector<AudioBufferView>& inputs,
                                       std::vector<WritableAudioBufferView>& outputs,
                                       int numSamples) {
    if (outputs.empty() || numSamples <= 0) {
        return;
    }

    auto& output = outputs[0];
    const AudioBufferView* input = inputs.empty() ? nullptr : &inputs[0];
    const int channels = input != nullptr
        ? juce::jmin(numChannels_, input->numChannels, output.numChannels)
        : juce::jmin(numChannels_, output.numChannels);
    if (channels <= 0) {
        output.clear();
        return;
    }

    // Lock-free: read state once, process all samples, then publish updates.
    const int size = captureSize_.load(std::memory_order_acquire);
    const int peakCapacity = peakBufferSize_.load(std::memory_order_acquire);
    int write = writeOffset_.load(std::memory_order_acquire);
    int completedBlocks = peakCompletedBlocks_.load(std::memory_order_acquire);
    int currentPeakSamples = currentPeakBlockSamples_.load(std::memory_order_acquire);
    float currentPeakMax = currentPeakBlockMax_.load(std::memory_order_acquire);

    for (int i = 0; i < numSamples; ++i) {
        const int writeIdx = write % size;
        float samplePeak = 0.0f;

        for (int ch = 0; ch < channels; ++ch) {
            const float s = input != nullptr ? input->getSample(ch, i) : 0.0f;
            samplePeak = std::max(samplePeak, std::abs(s));
            captureBuffer_.setSample(ch, writeIdx, s);
            output.setSample(ch, i, s);
        }

        currentPeakMax = std::max(currentPeakMax, samplePeak);
        ++currentPeakSamples;
        if (currentPeakSamples >= kPeakBlockSize) {
            if (peakCapacity > 0 && !peakBuffer_.empty()) {
                peakBuffer_[static_cast<size_t>(completedBlocks % peakCapacity)] = currentPeakMax;
            }
            ++completedBlocks;
            currentPeakSamples = 0;
            currentPeakMax = 0.0f;
        }

        ++write;
    }

    writeOffset_.store(write, std::memory_order_release);
    peakCompletedBlocks_.store(completedBlocks, std::memory_order_release);
    currentPeakBlockSamples_.store(currentPeakSamples, std::memory_order_release);
    currentPeakBlockMax_.store(currentPeakMax, std::memory_order_release);
}

void RetrospectiveCaptureNode::setCaptureSeconds(float seconds) {
    captureSeconds_.store(juce::jlimit(1.0f, 120.0f, seconds), std::memory_order_release);
    ensureBuffer(sampleRate_);
}

float RetrospectiveCaptureNode::getCaptureSeconds() const {
    return captureSeconds_.load(std::memory_order_acquire);
}

void RetrospectiveCaptureNode::clear() {
    std::lock_guard<std::mutex> lock(bufferMutex_);
    captureBuffer_.clear();
    resetPeakStateLocked(captureSize_.load(std::memory_order_acquire));
    writeOffset_.store(0, std::memory_order_release);
}

bool RetrospectiveCaptureNode::copyRecentToLoop(const std::shared_ptr<LoopPlaybackNode>& playback,
                                                int samplesBack,
                                                bool overdub) {
    return copyRecentToLoop(playback, samplesBack, overdub,
                            LoopPlaybackNode::OverdubLengthPolicy::LegacyRepeat);
}

bool RetrospectiveCaptureNode::copyRecentToLoop(const std::shared_ptr<LoopPlaybackNode>& playback,
                                                int samplesBack,
                                                bool overdub,
                                                LoopPlaybackNode::OverdubLengthPolicy overdubLengthPolicy) {
    const int size = captureSize_.load(std::memory_order_acquire);
    if (!playback || samplesBack <= 0 || size <= 0) {
        return false;
    }

    // Lock during copy to ensure consistent buffer state
    std::lock_guard<std::mutex> lock(bufferMutex_);
    const int currentSize = captureSize_.load(std::memory_order_acquire);
    const int clamped = juce::jmin(samplesBack, currentSize);
    int start = getWriteOffset() - clamped;
    while (start < 0) {
        start += currentSize;
    }
    start %= currentSize;

    playback->copyFromCaptureBuffer(captureBuffer_, currentSize, start, clamped,
                                    overdub, overdubLengthPolicy);
    return true;
}

bool RetrospectiveCaptureNode::copyRecentToLoop(const std::shared_ptr<SampleRegionPlaybackNode>& playback,
                                                int samplesBack,
                                                bool overdub) {
    const int size = captureSize_.load(std::memory_order_acquire);
    if (!playback || samplesBack <= 0 || size <= 0) {
        return false;
    }

    std::lock_guard<std::mutex> lock(bufferMutex_);
    const int currentSize = captureSize_.load(std::memory_order_acquire);
    const int clamped = juce::jmin(samplesBack, currentSize);
    int start = getWriteOffset() - clamped;
    while (start < 0) {
        start += currentSize;
    }
    start %= currentSize;

    playback->copyFromCaptureBuffer(captureBuffer_, currentSize, start, clamped, overdub);
    return true;
}

void RetrospectiveCaptureNode::ensureBuffer(float sampleRate) {
    const float seconds = getCaptureSeconds();
    const int target = juce::jmax(1, static_cast<int>(sampleRate * seconds));
    const int currentSize = captureSize_.load(std::memory_order_acquire);
    if (target == currentSize && captureBuffer_.getNumChannels() == numChannels_) {
        return;
    }

    std::lock_guard<std::mutex> lock(bufferMutex_);
    captureSize_.store(target, std::memory_order_release);
    captureBuffer_.setSize(numChannels_, target, false, true, true);
    captureBuffer_.clear();
    resetPeakStateLocked(target);
    writeOffset_.store(0, std::memory_order_release);
}

void RetrospectiveCaptureNode::resetPeakStateLocked(int captureSize) {
    const int peakCapacity = juce::jmax(1, (captureSize + kPeakBlockSize - 1) / kPeakBlockSize + 2);
    peakBuffer_.assign(static_cast<size_t>(peakCapacity), 0.0f);
    peakBufferSize_.store(peakCapacity, std::memory_order_release);
    peakCompletedBlocks_.store(0, std::memory_order_release);
    currentPeakBlockSamples_.store(0, std::memory_order_release);
    currentPeakBlockMax_.store(0.0f, std::memory_order_release);
}

std::vector<float> RetrospectiveCaptureNode::computePeaks(int startAgo, int endAgo, int numBuckets) const {
    std::vector<float> result;
    const int size = captureSize_.load(std::memory_order_acquire);
    if (numBuckets <= 0 || size <= 0) {
        return result;
    }

    const int start = juce::jlimit(0, size, startAgo);
    const int end = juce::jlimit(0, size, endAgo);
    if (end <= start) {
        return result;
    }

    const int viewSamples = end - start;
    const int bucketSize = juce::jmax(1, viewSamples / numBuckets);
    result.resize(static_cast<size_t>(numBuckets), 0.0f);

    const int writePos = writeOffset_.load(std::memory_order_acquire);
    const int numCh = captureBuffer_.getNumChannels();
    const int peakCapacity = peakBufferSize_.load(std::memory_order_acquire);
    const int completedBlocks = peakCompletedBlocks_.load(std::memory_order_acquire);
    const int currentPeakSamples = currentPeakBlockSamples_.load(std::memory_order_acquire);
    const float currentPeakMax = currentPeakBlockMax_.load(std::memory_order_acquire);
    const bool usePeakBuffer = peakCapacity > 0 && bucketSize >= kPeakBlockSize;

    const auto scanAbsoluteRange = [this, size, numCh](int absStart, int absEnd) -> float {
        if (absEnd <= absStart || numCh <= 0 || size <= 0) {
            return 0.0f;
        }

        absStart = juce::jmax(0, absStart);
        absEnd = juce::jmax(absStart, absEnd);
        if (absEnd <= absStart) {
            return 0.0f;
        }

        const int length = absEnd - absStart;
        const int startIdx = absStart % size;
        float peak = 0.0f;

        const auto scanSegment = [this, numCh, &peak](int segmentStart, int segmentLength) {
            if (segmentLength <= 0) {
                return;
            }

            for (int ch = 0; ch < numCh; ++ch) {
                const float* channelData = captureBuffer_.getReadPointer(ch);
                for (int i = 0; i < segmentLength; ++i) {
                    peak = std::max(peak, std::abs(channelData[segmentStart + i]));
                }
            }
        };

        const int firstLength = juce::jmin(length, size - startIdx);
        scanSegment(startIdx, firstLength);
        scanSegment(0, length - firstLength);
        return peak;
    };

    for (int b = 0; b < numBuckets; ++b) {
        // Iterate in reverse order to match BehaviorCoreProcessor::computeCapturePeaks
        // result[0] = newest (end), result[N-1] = oldest (start)
        const float t = numBuckets > 1
                            ? static_cast<float>(numBuckets - 1 - b) /
                                  static_cast<float>(numBuckets - 1)
                            : 0.0f;
        const int bucketStart = start + static_cast<int>(std::round(t * static_cast<float>(viewSamples - 1)));
        const int bucketEnd = juce::jmin(bucketStart + bucketSize, end);
        if (bucketEnd <= bucketStart) {
            continue;
        }

        const int absStart = juce::jmax(0, writePos - bucketEnd);
        const int absEnd = juce::jmax(0, writePos - bucketStart);
        if (absEnd <= absStart) {
            continue;
        }

        float peak = 0.0f;
        if (usePeakBuffer) {
            const int firstBlock = absStart / kPeakBlockSize;
            const int lastBlock = (absEnd - 1) / kPeakBlockSize;

            for (int block = firstBlock; block <= lastBlock; ++block) {
                const int blockStart = block * kPeakBlockSize;
                const int blockEnd = blockStart + kPeakBlockSize;
                const int overlapStart = juce::jmax(absStart, blockStart);
                const int overlapEnd = juce::jmin(absEnd, blockEnd);
                if (overlapEnd <= overlapStart) {
                    continue;
                }

                const bool fullBlock = overlapStart == blockStart && overlapEnd == blockEnd;
                if (fullBlock) {
                    if (block < completedBlocks) {
                        peak = std::max(peak, peakBuffer_[static_cast<size_t>(block % peakCapacity)]);
                        continue;
                    }
                    if (block == completedBlocks && currentPeakSamples > 0) {
                        peak = std::max(peak, currentPeakMax);
                        continue;
                    }
                }

                peak = std::max(peak, scanAbsoluteRange(overlapStart, overlapEnd));
            }
        } else {
            peak = scanAbsoluteRange(absStart, absEnd);
        }

        result[static_cast<size_t>(b)] = peak;
    }

    return result;
}

} // namespace dsp_primitives
