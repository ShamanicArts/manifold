#include "dsp/core/nodes/ReverbNode.h"

#include <cmath>

namespace dsp_primitives {

ReverbNode::ReverbNode() {
    params_ = reverb_.getParameters();

    targetRoomSize_.store(params_.roomSize, std::memory_order_release);
    targetDamping_.store(params_.damping, std::memory_order_release);
    targetWetLevel_.store(params_.wetLevel, std::memory_order_release);
    targetDryLevel_.store(params_.dryLevel, std::memory_order_release);
    targetWidth_.store(params_.width, std::memory_order_release);
}

void ReverbNode::prepare(double sampleRate, int maxBlockSize) {
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;
    reverb_.setSampleRate(sampleRate_);
    reverb_.reset();

    left_.resize(static_cast<size_t>(maxBlockSize));
    right_.resize(static_cast<size_t>(maxBlockSize));

    const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
    const double smoothingTimeSeconds = 0.02;
    smoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothingTimeSeconds * sr)));
    smoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, smoothingCoeff_);

    currentRoomSize_ = targetRoomSize_.load(std::memory_order_acquire);
    currentDamping_ = targetDamping_.load(std::memory_order_acquire);
    currentWetLevel_ = targetWetLevel_.load(std::memory_order_acquire);
    currentDryLevel_ = targetDryLevel_.load(std::memory_order_acquire);
    currentWidth_ = targetWidth_.load(std::memory_order_acquire);

    params_.roomSize = currentRoomSize_;
    params_.damping = currentDamping_;
    params_.wetLevel = currentWetLevel_;
    params_.dryLevel = currentDryLevel_;
    params_.width = currentWidth_;
    reverb_.setParameters(params_);
}

void ReverbNode::process(const std::vector<AudioBufferView>& inputs,
                         std::vector<WritableAudioBufferView>& outputs,
                         int numSamples) {
    if (inputs.empty() || outputs.empty()) {
        if (!outputs.empty()) outputs[0].clear();
        return;
    }

    auto& output = outputs[0];
    if (numSamples > static_cast<int>(left_.size())) {
        output.clear();
        return;
    }

    const auto& input = inputs[0];
    const int channels = juce::jmin(2, input.numChannels, output.numChannels);
    if (channels <= 0) {
        output.clear();
        return;
    }

    const float targetRoomSize = targetRoomSize_.load(std::memory_order_acquire);
    const float targetDamping = targetDamping_.load(std::memory_order_acquire);
    const float targetWetLevel = targetWetLevel_.load(std::memory_order_acquire);
    const float targetDryLevel = targetDryLevel_.load(std::memory_order_acquire);
    const float targetWidth = targetWidth_.load(std::memory_order_acquire);

    currentRoomSize_ += (targetRoomSize - currentRoomSize_) * smoothingCoeff_;
    currentDamping_ += (targetDamping - currentDamping_) * smoothingCoeff_;
    currentWetLevel_ += (targetWetLevel - currentWetLevel_) * smoothingCoeff_;
    currentDryLevel_ += (targetDryLevel - currentDryLevel_) * smoothingCoeff_;
    currentWidth_ += (targetWidth - currentWidth_) * smoothingCoeff_;

    params_.roomSize = currentRoomSize_;
    params_.damping = currentDamping_;
    params_.wetLevel = currentWetLevel_;
    params_.dryLevel = currentDryLevel_;
    params_.width = currentWidth_;
    reverb_.setParameters(params_);

    for (int i = 0; i < numSamples; ++i) {
        left_[static_cast<size_t>(i)] = input.getSample(0, i);
        right_[static_cast<size_t>(i)] = channels > 1 ? input.getSample(1, i) : left_[static_cast<size_t>(i)];
    }

    reverb_.processStereo(left_.data(), right_.data(), numSamples);

    for (int i = 0; i < numSamples; ++i) {
        output.setSample(0, i, left_[static_cast<size_t>(i)]);
        if (channels > 1) {
            output.setSample(1, i, right_[static_cast<size_t>(i)]);
        }
    }
}

} // namespace dsp_primitives
