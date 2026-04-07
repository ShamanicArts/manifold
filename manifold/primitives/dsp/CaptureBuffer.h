#pragma once

#include <juce_audio_basics/juce_audio_basics.h>
#include <algorithm>
#include <cmath>
#include <vector>

class CaptureBuffer {
public:
    CaptureBuffer(int sizeSamples = 0)
        : bufferSize(sizeSamples)
        , offsetToNow(2, 0)
    {
        if (sizeSamples > 0)
            buffer.setSize(static_cast<int>(offsetToNow.size()), sizeSamples);
    }
    
    void setSize(int sizeSamples) {
        bufferSize = sizeSamples;
        const int channelCount = std::max(1, buffer.getNumChannels());
        buffer.setSize(channelCount, sizeSamples, true, true, true);
        offsetToNow.assign(static_cast<std::size_t>(channelCount), 0);
    }
    
    void setNumChannels(int channels) {
        const int safeChannels = std::max(1, channels);
        buffer.setSize(safeChannels, bufferSize, true, true, true);
        offsetToNow.assign(static_cast<std::size_t>(safeChannels), 0);
    }
    
    int getNumChannels() const { return buffer.getNumChannels(); }
    int getSize() const { return bufferSize; }
    
    void write(float sample, int channel = 0) {
        if (bufferSize == 0) return;
        const auto channelIndex = safeChannelIndex(channel);
        buffer.setSample(channel, offsetToNow[channelIndex], sample);
        offsetToNow[channelIndex] = (offsetToNow[channelIndex] + 1) % bufferSize;
    }
    
    void writeBlock(const float* samples, int numSamples, int channel = 0) {
        if (bufferSize == 0) return;
        const auto channelIndex = safeChannelIndex(channel);
        for (int i = 0; i < numSamples; ++i) {
            buffer.setSample(channel, offsetToNow[channelIndex], samples[i]);
            offsetToNow[channelIndex] = (offsetToNow[channelIndex] + 1) % bufferSize;
        }
    }

    void writeBlock(const float* samples, int numSamples, int channel, float gain) {
        if (bufferSize == 0) return;
        const auto channelIndex = safeChannelIndex(channel);
        for (int i = 0; i < numSamples; ++i) {
            buffer.setSample(channel, offsetToNow[channelIndex], samples[i] * gain);
            offsetToNow[channelIndex] = (offsetToNow[channelIndex] + 1) % bufferSize;
        }
    }
    
    float getSample(int samplesAgo, int channel = 0) const {
        if (bufferSize == 0) return 0.0f;
        const auto channelIndex = safeChannelIndex(channel);
        int idx = offsetToNow[channelIndex] - 1 - samplesAgo;
        while (idx < 0) idx += bufferSize;
        return buffer.getSample(channel, idx);
    }
    
    void readBlock(float* dest, int numSamples, int samplesAgo, int channel = 0) const {
        if (bufferSize == 0) {
            std::fill(dest, dest + numSamples, 0.0f);
            return;
        }
        for (int i = 0; i < numSamples; ++i) {
            dest[i] = getSample(samplesAgo + i, channel);
        }
    }
    
    int getOffsetToNow(int channel = 0) const { return offsetToNow[safeChannelIndex(channel)]; }
    
    void clear() {
        buffer.clear();
        std::fill(offsetToNow.begin(), offsetToNow.end(), 0);
    }
    
    juce::AudioBuffer<float>* getRawBuffer() { return &buffer; }
    const juce::AudioBuffer<float>* getRawBuffer() const { return &buffer; }
    
private:
    std::size_t safeChannelIndex(int channel) const {
        const auto channelCount = offsetToNow.size();
        if (channelCount == 0) {
            return 0;
        }
        return static_cast<std::size_t>(juce::jlimit(0, static_cast<int>(channelCount) - 1, channel));
    }

    juce::AudioBuffer<float> buffer;
    int bufferSize = 0;
    std::vector<int> offsetToNow;
};
