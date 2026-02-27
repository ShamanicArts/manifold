#include "dsp/core/nodes/QuantizerNode.h"

#include <cmath>

namespace dsp_primitives {

void QuantizerNode::process(const std::vector<AudioBufferView>& inputs,
                            std::vector<WritableAudioBufferView>& outputs,
                            int numSamples) {
    (void)inputs;
    (void)outputs;
    (void)numSamples;
}

void QuantizerNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    sampleRate_.store(static_cast<float>(sampleRate > 1.0 ? sampleRate : 44100.0),
                      std::memory_order_release);
}

void QuantizerNode::setTempo(float bpm) {
    tempo_.store(juce::jlimit(20.0f, 300.0f, bpm), std::memory_order_release);
}

float QuantizerNode::getTempo() const {
    return tempo_.load(std::memory_order_acquire);
}

void QuantizerNode::setBeatsPerBar(float beats) {
    beatsPerBar_.store(juce::jlimit(1.0f, 16.0f, beats), std::memory_order_release);
}

float QuantizerNode::getBeatsPerBar() const {
    return beatsPerBar_.load(std::memory_order_acquire);
}

float QuantizerNode::getSamplesPerBar() const {
    const float bpm = getTempo();
    const float sr = sampleRate_.load(std::memory_order_acquire);
    const float beats = getBeatsPerBar();
    if (bpm <= 0.0f || sr <= 0.0f) {
        return 0.0f;
    }
    const float samplesPerBeat = sr * 60.0f / bpm;
    return samplesPerBeat * beats;
}

int QuantizerNode::quantizeToNearestLegal(int samples) const {
    if (samples <= 0) {
        return 0;
    }

    const float samplesPerBar = getSamplesPerBar();
    if (samplesPerBar <= 0.0f) {
        return samples;
    }

    const float candidates[] = {
        samplesPerBar,
        samplesPerBar * 0.5f,
        samplesPerBar * 0.25f,
        samplesPerBar * 0.125f,
        samplesPerBar * 0.0625f,
    };

    int best = samples;
    int bestDistance = std::abs(samples - best);

    for (const float candidate : candidates) {
        const int size = juce::jmax(1, static_cast<int>(candidate));
        const int quantized = static_cast<int>(std::round(static_cast<float>(samples) /
                                                           static_cast<float>(size))) * size;
        const int distance = std::abs(samples - quantized);
        if (distance < bestDistance) {
            bestDistance = distance;
            best = quantized;
        }
    }

    return juce::jmax(1, best);
}

} // namespace dsp_primitives
