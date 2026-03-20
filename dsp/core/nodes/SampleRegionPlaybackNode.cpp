#include "dsp/core/nodes/SampleRegionPlaybackNode.h"

#include <cmath>

namespace dsp_primitives {

namespace {

float clamp01f(float v) {
    return juce::jlimit(0.0f, 1.0f, v);
}

} // namespace

SampleRegionPlaybackNode::SampleRegionPlaybackNode(int numChannels) : numChannels_(numChannels) {}

void SampleRegionPlaybackNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;

    const double newSampleRate = sampleRate > 0.0 ? sampleRate : 44100.0;
    const int newMaxLoopSamples = juce::jmax(1, static_cast<int>(newSampleRate * 30.0));

    const bool needsReallocate =
        loopBufferA_.getNumChannels() != numChannels_ ||
        loopBufferA_.getNumSamples() != newMaxLoopSamples ||
        loopBufferB_.getNumChannels() != numChannels_ ||
        loopBufferB_.getNumSamples() != newMaxLoopSamples;

    sampleRate_ = newSampleRate;
    maxLoopSamples_ = newMaxLoopSamples;

    if (needsReallocate) {
        loopBufferA_.setSize(numChannels_, maxLoopSamples_, false, true, true);
        loopBufferB_.setSize(numChannels_, maxLoopSamples_, false, true, true);
        loopBufferA_.clear();
        loopBufferB_.clear();
        activeLoopBufferIndex_.store(0, std::memory_order_release);
        readPosition_ = 0.0;
        lastPosition_.store(0, std::memory_order_release);
        firstPass_ = true;
    } else {
        const int sampleLength = juce::jmax(1, loopLength_.load(std::memory_order_acquire));
        readPosition_ = clampPosition(readPosition_, sampleLength);
        lastPosition_.store(static_cast<int>(readPosition_), std::memory_order_release);
    }

    const int currentLength = juce::jlimit(0, maxLoopSamples_, loopLength_.load(std::memory_order_acquire));
    loopLength_.store(currentLength, std::memory_order_release);
}

void SampleRegionPlaybackNode::setLoopLength(int samples) {
    const int clamped = juce::jlimit(0, maxLoopSamples_, samples);
    loopLength_.store(clamped, std::memory_order_release);
}

int SampleRegionPlaybackNode::getLoopLength() const {
    return loopLength_.load(std::memory_order_acquire);
}

void SampleRegionPlaybackNode::setSpeed(float speed) {
    speed_.store(juce::jlimit(0.0f, 8.0f, speed), std::memory_order_release);
}

float SampleRegionPlaybackNode::getSpeed() const {
    return speed_.load(std::memory_order_acquire);
}

void SampleRegionPlaybackNode::play() {
    playing_.store(true, std::memory_order_release);
}

void SampleRegionPlaybackNode::pause() {
    playing_.store(false, std::memory_order_release);
}

void SampleRegionPlaybackNode::stop() {
    playing_.store(false, std::memory_order_release);
    triggerRequest_.store(false, std::memory_order_release);
    seekRequest_.store(-1, std::memory_order_release);
    readPosition_ = 0.0;
    lastPosition_.store(0, std::memory_order_release);
    firstPass_ = true;
}

void SampleRegionPlaybackNode::trigger() {
    triggerRequest_.store(true, std::memory_order_release);
    playing_.store(true, std::memory_order_release);
}

bool SampleRegionPlaybackNode::isPlaying() const {
    return playing_.load(std::memory_order_acquire);
}

void SampleRegionPlaybackNode::seekNormalized(float normalized) {
    const int sampleLength = juce::jmax(1, loopLength_.load(std::memory_order_acquire));
    const float clamped = clamp01f(normalized);
    const int position = juce::jlimit(0, sampleLength - 1,
                                      static_cast<int>(clamped * static_cast<float>(sampleLength - 1)));
    seekRequest_.store(position, std::memory_order_release);
}

float SampleRegionPlaybackNode::getNormalizedPosition() const {
    const int sampleLength = juce::jmax(1, loopLength_.load(std::memory_order_acquire));
    const int position = juce::jlimit(0, sampleLength - 1, lastPosition_.load(std::memory_order_acquire));
    return static_cast<float>(position) / static_cast<float>(sampleLength);
}

void SampleRegionPlaybackNode::setPlayStart(float normalized) {
    playStartNorm_.store(clamp01f(normalized), std::memory_order_release);
}

float SampleRegionPlaybackNode::getPlayStart() const {
    return playStartNorm_.load(std::memory_order_acquire);
}

void SampleRegionPlaybackNode::setLoopStart(float normalized) {
    loopStartNorm_.store(clamp01f(normalized), std::memory_order_release);
}

float SampleRegionPlaybackNode::getLoopStart() const {
    return loopStartNorm_.load(std::memory_order_acquire);
}

void SampleRegionPlaybackNode::setLoopEnd(float normalized) {
    loopEndNorm_.store(clamp01f(normalized), std::memory_order_release);
}

float SampleRegionPlaybackNode::getLoopEnd() const {
    return loopEndNorm_.load(std::memory_order_acquire);
}

void SampleRegionPlaybackNode::setCrossfade(float normalized) {
    crossfadeNorm_.store(juce::jlimit(0.0f, 0.5f, normalized), std::memory_order_release);
}

float SampleRegionPlaybackNode::getCrossfade() const {
    return crossfadeNorm_.load(std::memory_order_acquire);
}

double SampleRegionPlaybackNode::clampPosition(double position, int sampleLength) {
    if (sampleLength <= 0) {
        return 0.0;
    }
    if (position < 0.0) {
        return 0.0;
    }
    const double maxPos = static_cast<double>(juce::jmax(0, sampleLength - 1));
    if (position > maxPos) {
        return maxPos;
    }
    return position;
}

SampleRegionPlaybackNode::RegionState SampleRegionPlaybackNode::computeRegionState() const {
    RegionState s;
    s.sampleLength = juce::jmax(1, loopLength_.load(std::memory_order_acquire));

    const float playStartNorm = clamp01f(playStartNorm_.load(std::memory_order_acquire));
    const float loopStartNorm = clamp01f(loopStartNorm_.load(std::memory_order_acquire));
    const float loopEndNorm = clamp01f(loopEndNorm_.load(std::memory_order_acquire));
    const float crossfadeNorm = juce::jlimit(0.0f, 0.5f, crossfadeNorm_.load(std::memory_order_acquire));

    s.playStart = juce::jlimit(0, s.sampleLength - 1,
                               static_cast<int>(playStartNorm * static_cast<float>(s.sampleLength - 1)));
    s.loopStart = juce::jlimit(0, s.sampleLength - 1,
                               static_cast<int>(loopStartNorm * static_cast<float>(s.sampleLength - 1)));
    s.loopEnd = juce::jlimit(1, s.sampleLength,
                             static_cast<int>(std::round(loopEndNorm * static_cast<float>(s.sampleLength))));

    if (s.loopEnd <= s.loopStart) {
        s.loopEnd = juce::jmin(s.sampleLength, s.loopStart + 1);
    }
    if (s.playStart >= s.loopEnd) {
        s.playStart = s.loopStart;
    }

    s.loopWindow = juce::jmax(1, s.loopEnd - s.loopStart);
    s.crossfadeSamples = juce::jlimit(0, juce::jmax(0, s.loopWindow - 1),
                                      static_cast<int>(std::round(crossfadeNorm * static_cast<float>(s.loopWindow))));
    return s;
}

float SampleRegionPlaybackNode::readSample(const juce::AudioBuffer<float>& buffer,
                                           int channel,
                                           double position) const {
    const int sampleLength = juce::jmax(1, loopLength_.load(std::memory_order_acquire));
    const double clampedPos = clampPosition(position, sampleLength);
    const int indexA = juce::jlimit(0, sampleLength - 1, static_cast<int>(clampedPos));
    const int indexB = juce::jlimit(0, sampleLength - 1, indexA + 1);
    const float frac = static_cast<float>(clampedPos - static_cast<double>(indexA));
    const float a = buffer.getSample(channel, indexA);
    const float b = buffer.getSample(channel, indexB);
    return a + (b - a) * frac;
}

void SampleRegionPlaybackNode::applyPendingControlChanges(const RegionState& region) {
    if (triggerRequest_.exchange(false, std::memory_order_acq_rel)) {
        readPosition_ = static_cast<double>(region.playStart);
        lastPosition_.store(region.playStart, std::memory_order_release);
        firstPass_ = true;
        playing_.store(true, std::memory_order_release);
    }

    const int seek = seekRequest_.exchange(-1, std::memory_order_acq_rel);
    if (seek >= 0) {
        readPosition_ = static_cast<double>(juce::jlimit(0, region.sampleLength - 1, seek));
        lastPosition_.store(static_cast<int>(readPosition_), std::memory_order_release);
        firstPass_ = (readPosition_ < static_cast<double>(region.loopStart));
    }
}

void SampleRegionPlaybackNode::process(const std::vector<AudioBufferView>& inputs,
                                       std::vector<WritableAudioBufferView>& outputs,
                                       int numSamples) {
    (void)inputs;
    const int channels = juce::jmin(numChannels_, static_cast<int>(outputs.size()));
    if (channels <= 0 || numSamples <= 0) {
        return;
    }

    const RegionState region = computeRegionState();
    applyPendingControlChanges(region);

    if (region.sampleLength <= 0 || !playing_.load(std::memory_order_acquire)) {
        for (int ch = 0; ch < channels; ++ch) {
            const size_t idx = static_cast<size_t>(ch);
            for (int i = 0; i < numSamples; ++i) {
                outputs[idx].setSample(ch, i, 0.0f);
            }
        }
        return;
    }

    const int activeIndex = activeLoopBufferIndex_.load(std::memory_order_acquire);
    juce::AudioBuffer<float>& activeLoop = (activeIndex == 0) ? loopBufferA_ : loopBufferB_;

    const double speed = static_cast<double>(juce::jlimit(0.0f, 8.0f, speed_.load(std::memory_order_acquire)));
    if (speed <= 0.0) {
        for (int ch = 0; ch < channels; ++ch) {
            const size_t idx = static_cast<size_t>(ch);
            for (int i = 0; i < numSamples; ++i) {
                outputs[idx].setSample(ch, i, 0.0f);
            }
        }
        return;
    }

    if (firstPass_) {
        readPosition_ = juce::jlimit(static_cast<double>(region.playStart),
                                     static_cast<double>(region.loopEnd - 1),
                                     readPosition_);
    } else {
        while (readPosition_ >= static_cast<double>(region.loopEnd)) {
            readPosition_ -= static_cast<double>(region.loopWindow);
        }
        while (readPosition_ < static_cast<double>(region.loopStart)) {
            readPosition_ += static_cast<double>(region.loopWindow);
        }
    }

    const double crossfadeStart = static_cast<double>(region.loopEnd - region.crossfadeSamples);

    for (int i = 0; i < numSamples; ++i) {
        const bool inBoundaryCrossfade = region.crossfadeSamples > 0 &&
                                         readPosition_ >= crossfadeStart &&
                                         readPosition_ < static_cast<double>(region.loopEnd);

        for (int ch = 0; ch < channels; ++ch) {
            const size_t idx = static_cast<size_t>(ch);
            float out = 0.0f;
            if (inBoundaryCrossfade) {
                const double seamOffset = readPosition_ - crossfadeStart;
                const double headPosition = static_cast<double>(region.loopStart) + seamOffset;
                const float mix = static_cast<float>(seamOffset / static_cast<double>(region.crossfadeSamples));
                const float tailGain = std::cos(mix * juce::MathConstants<float>::halfPi);
                const float headGain = std::sin(mix * juce::MathConstants<float>::halfPi);
                const float tailSample = readSample(activeLoop, ch, readPosition_);
                const float headSample = readSample(activeLoop, ch, headPosition);
                out = tailSample * tailGain + headSample * headGain;
            } else {
                out = readSample(activeLoop, ch, readPosition_);
            }
            outputs[idx].setSample(ch, i, out);
        }

        readPosition_ += speed;
        if (firstPass_) {
            if (readPosition_ >= static_cast<double>(region.loopEnd)) {
                const double overshoot = readPosition_ - static_cast<double>(region.loopEnd);
                const double resumeOffset = static_cast<double>(region.crossfadeSamples);
                readPosition_ = static_cast<double>(region.loopStart) + resumeOffset + overshoot;
                while (readPosition_ >= static_cast<double>(region.loopEnd)) {
                    readPosition_ -= static_cast<double>(region.loopWindow);
                }
                firstPass_ = false;
            }
        } else {
            while (readPosition_ >= static_cast<double>(region.loopEnd)) {
                const double overshoot = readPosition_ - static_cast<double>(region.loopEnd);
                const double resumeOffset = static_cast<double>(region.crossfadeSamples);
                readPosition_ = static_cast<double>(region.loopStart) + resumeOffset + overshoot;
            }
        }
    }

    lastPosition_.store(juce::jlimit(0, region.sampleLength - 1, static_cast<int>(readPosition_)),
                        std::memory_order_release);
}

bool SampleRegionPlaybackNode::computePeaks(int numBuckets, std::vector<float>& outPeaks) const {
    outPeaks.clear();
    if (numBuckets <= 0) {
        return false;
    }

    const int sampleLength = juce::jmax(0, loopLength_.load(std::memory_order_acquire));
    if (sampleLength <= 0) {
        return false;
    }

    const int activeIndex = activeLoopBufferIndex_.load(std::memory_order_acquire);
    const juce::AudioBuffer<float>& activeLoop = (activeIndex == 0) ? loopBufferA_ : loopBufferB_;
    if (activeLoop.getNumSamples() <= 0 || activeLoop.getNumChannels() <= 0) {
        return false;
    }

    outPeaks.resize(static_cast<size_t>(numBuckets), 0.0f);
    const int bucketSize = juce::jmax(1, sampleLength / numBuckets);
    const int channels = juce::jmin(numChannels_, activeLoop.getNumChannels());

    float highest = 0.0f;
    for (int x = 0; x < numBuckets; ++x) {
        const int start = juce::jmin(sampleLength - 1, x * bucketSize);
        const int count = juce::jmin(bucketSize, sampleLength - start);
        float peak = 0.0f;

        for (int i = 0; i < count; ++i) {
            const int idx = start + i;
            for (int ch = 0; ch < channels; ++ch) {
                peak = juce::jmax(peak, std::abs(activeLoop.getSample(ch, idx)));
            }
        }

        outPeaks[static_cast<size_t>(x)] = peak;
        highest = juce::jmax(highest, peak);
    }

    const float rescale = highest > 0.0f
                              ? juce::jmin(8.0f, juce::jmax(1.0f, 1.0f / highest))
                              : 1.0f;
    for (auto& peak : outPeaks) {
        peak = juce::jmin(1.0f, peak * rescale);
    }

    return true;
}

std::vector<float> SampleRegionPlaybackNode::getPeaks(int numBuckets) const {
    std::vector<float> peaks;
    computePeaks(numBuckets, peaks);
    return peaks;
}

void SampleRegionPlaybackNode::clearLoop() {
    const int activeIndex = activeLoopBufferIndex_.load(std::memory_order_acquire);
    const int writeIndex = (activeIndex == 0) ? 1 : 0;
    juce::AudioBuffer<float>& writeBuffer = (writeIndex == 0) ? loopBufferA_ : loopBufferB_;
    writeBuffer.clear();
    activeLoopBufferIndex_.store(writeIndex, std::memory_order_release);
    readPosition_ = 0.0;
    lastPosition_.store(0, std::memory_order_release);
    loopLength_.store(0, std::memory_order_release);
    firstPass_ = true;
}

void SampleRegionPlaybackNode::copyFromCaptureBuffer(const juce::AudioBuffer<float>& captureBuffer,
                                                     int captureSize,
                                                     int captureStartOffset,
                                                     int numSamples,
                                                     bool overdub) {
    if (captureSize <= 0 || numSamples <= 0 || captureBuffer.getNumChannels() <= 0) {
        return;
    }

    const int requestedLength = juce::jlimit(1, maxLoopSamples_, numSamples);

    const int activeIndex = activeLoopBufferIndex_.load(std::memory_order_acquire);
    const int writeIndex = (activeIndex == 0) ? 1 : 0;
    juce::AudioBuffer<float>& writeBuffer = (writeIndex == 0) ? loopBufferA_ : loopBufferB_;
    const juce::AudioBuffer<float>& activeBuffer = (activeIndex == 0) ? loopBufferA_ : loopBufferB_;

    const int previousLength = juce::jlimit(0, maxLoopSamples_, loopLength_.load(std::memory_order_acquire));
    const int targetLength = requestedLength;
    const int channels = juce::jmin(numChannels_, captureBuffer.getNumChannels(), writeBuffer.getNumChannels());

    int start = captureStartOffset;
    while (start < 0) {
        start += captureSize;
    }
    start %= captureSize;

    writeBuffer.clear();

    if (!overdub || previousLength <= 0) {
        for (int ch = 0; ch < channels; ++ch) {
            for (int i = 0; i < targetLength; ++i) {
                const int src = (start + i) % captureSize;
                writeBuffer.setSample(ch, i, captureBuffer.getSample(ch, src));
            }
        }
    } else {
        for (int ch = 0; ch < channels; ++ch) {
            for (int i = 0; i < targetLength; ++i) {
                const float existing = activeBuffer.getSample(ch, i % previousLength);
                const int src = (start + i) % captureSize;
                writeBuffer.setSample(ch, i, existing + captureBuffer.getSample(ch, src));
            }
        }
    }

    loopLength_.store(targetLength, std::memory_order_release);
    activeLoopBufferIndex_.store(writeIndex, std::memory_order_release);
    readPosition_ = 0.0;
    lastPosition_.store(0, std::memory_order_release);
    firstPass_ = true;
}

} // namespace dsp_primitives
