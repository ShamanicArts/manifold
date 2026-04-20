#include "dsp/core/nodes/PlaybackStateGateNode.h"

#include <cmath>

namespace dsp_primitives {

PlaybackStateGateNode::PlaybackStateGateNode(int numChannels)
    : numChannels_(numChannels) {}

void PlaybackStateGateNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;

    const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
    const double smoothingTimeSeconds = 0.01;
    smoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothingTimeSeconds * sr)));
    smoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, smoothingCoeff_);

    const bool shouldPass = playing_.load(std::memory_order_acquire) &&
                            !muted_.load(std::memory_order_acquire);
    gateGain_ = shouldPass ? 1.0f : 0.0f;
}

void PlaybackStateGateNode::process(const std::vector<AudioBufferView>& inputs,
                                    std::vector<WritableAudioBufferView>& outputs,
                                    int numSamples) {
    if (outputs.empty() || numSamples <= 0) {
        return;
    }

    auto& output = outputs[0];
    if (inputs.empty()) {
        output.clear();
        return;
    }

    const auto& input = inputs[0];
    const int channels = juce::jmin(numChannels_, input.numChannels, output.numChannels);
    if (channels <= 0) {
        output.clear();
        return;
    }

    const bool shouldPass = playing_.load(std::memory_order_acquire) &&
                            !muted_.load(std::memory_order_acquire);
    const float targetGain = shouldPass ? 1.0f : 0.0f;

    for (int i = 0; i < numSamples; ++i) {
        gateGain_ += (targetGain - gateGain_) * smoothingCoeff_;

        for (int ch = 0; ch < channels; ++ch) {
            output.setSample(ch, i, input.getSample(ch, i) * gateGain_);
        }
    }
}

void PlaybackStateGateNode::play() {
    playing_.store(true, std::memory_order_release);
}

void PlaybackStateGateNode::pause() {
    playing_.store(false, std::memory_order_release);
}

void PlaybackStateGateNode::stop() {
    playing_.store(false, std::memory_order_release);
}

void PlaybackStateGateNode::setPlaying(bool playing) {
    playing_.store(playing, std::memory_order_release);
}

bool PlaybackStateGateNode::isPlaying() const {
    return playing_.load(std::memory_order_acquire);
}

void PlaybackStateGateNode::setMuted(bool muted) {
    muted_.store(muted, std::memory_order_release);
}

bool PlaybackStateGateNode::isMuted() const {
    return muted_.load(std::memory_order_acquire);
}

} // namespace dsp_primitives
