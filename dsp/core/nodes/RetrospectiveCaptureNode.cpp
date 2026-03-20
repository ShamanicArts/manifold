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
    const int channels = juce::jmin(numChannels_, static_cast<int>(outputs.size()));
    if (channels <= 0 || numSamples <= 0) {
        return;
    }

    // Lock-free: read size once, process all samples, then update write offset
    const int size = captureSize_.load(std::memory_order_acquire);
    int write = writeOffset_.load(std::memory_order_acquire);

    for (int i = 0; i < numSamples; ++i) {
        for (int ch = 0; ch < channels; ++ch) {
            const size_t idx = static_cast<size_t>(ch);
            float s = 0.0f;
            if (ch < static_cast<int>(inputs.size())) {
                s = inputs[idx].getSample(ch, i);
            }
            // Wrap write index within current size
            const int writeIdx = write % size;
            captureBuffer_.setSample(ch, writeIdx, s);
            outputs[idx].setSample(ch, i, s);
        }

        ++write;
    }

    writeOffset_.store(write, std::memory_order_release);
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
    writeOffset_.store(0, std::memory_order_release);
}

std::vector<float> RetrospectiveCaptureNode::computePeaks(int startAgo, int endAgo, int numBuckets) const {
    std::vector<float> result;
    // Lock-free: snapshot atomic values, then read without mutex
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

    // Snapshot write position atomically - may be slightly stale but consistent
    const int writePos = writeOffset_.load(std::memory_order_acquire);
    const int numCh = captureBuffer_.getNumChannels();

    for (int b = 0; b < numBuckets; ++b) {
        // Iterate in reverse order to match BehaviorCoreProcessor::computeCapturePeaks
        // result[0] = newest (end), result[N-1] = oldest (start)
        const float t = numBuckets > 1
                            ? static_cast<float>(numBuckets - 1 - b) /
                                  static_cast<float>(numBuckets - 1)
                            : 0.0f;
        const int bucketStart = start + static_cast<int>(std::round(t * static_cast<float>(viewSamples - 1)));
        const int bucketEnd = juce::jmin(bucketStart + bucketSize, end);

        float peak = 0.0f;
        for (int s = bucketStart; s < bucketEnd; ++s) {
            // Calculate actual index in circular buffer using modulo
            int idx = (writePos - 1 - s) % size;
            if (idx < 0) idx += size;

            for (int ch = 0; ch < numCh; ++ch) {
                // Lock-free read - may occasionally be torn during buffer resize,
                // but that's acceptable for visualization
                peak = std::max(peak, std::abs(captureBuffer_.getSample(ch, idx)));
            }
        }
        result[static_cast<size_t>(b)] = peak;
    }

    return result;
}

} // namespace dsp_primitives
