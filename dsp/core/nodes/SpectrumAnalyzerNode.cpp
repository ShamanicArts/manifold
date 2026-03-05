#include "dsp/core/nodes/SpectrumAnalyzerNode.h"

#include <cmath>

namespace dsp_primitives {

SpectrumAnalyzerNode::SpectrumAnalyzerNode() {
    for (auto& band : bandsOut_) {
        band.store(0.0f, std::memory_order_release);
    }
}

void SpectrumAnalyzerNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    const std::array<float, kNumSplits> splitFreqs{{60.0f, 120.0f, 250.0f, 500.0f, 1000.0f, 2500.0f, 6000.0f}};
    for (size_t i = 0; i < splitCoeff_.size(); ++i) {
        splitCoeff_[i] = std::exp(-2.0f * juce::MathConstants<float>::pi * splitFreqs[i] /
                                  static_cast<float>(sampleRate_));
    }

    const double smoothTime = 0.01;
    smooth_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothTime * sampleRate_)));
    smooth_ = juce::jlimit(0.0001f, 1.0f, smooth_);

    sensitivity_ = targetSensitivity_.load(std::memory_order_acquire);
    smoothing_ = targetSmoothing_.load(std::memory_order_acquire);
    floorDb_ = targetFloorDb_.load(std::memory_order_acquire);

    reset();
    prepared_ = true;
}

void SpectrumAnalyzerNode::reset() {
    for (auto& s : splitState_) {
        s = 0.0f;
    }
    for (auto& b : bandState_) {
        b = 0.0f;
    }
    for (auto& out : bandsOut_) {
        out.store(0.0f, std::memory_order_release);
    }
}

void SpectrumAnalyzerNode::process(const std::vector<AudioBufferView>& inputs,
                                   std::vector<WritableAudioBufferView>& outputs,
                                   int numSamples) {
    if (!prepared_ || inputs.empty() || outputs.empty() || numSamples <= 0) {
        if (!outputs.empty()) {
            outputs[0].clear();
        }
        return;
    }

    const float targetSensitivity = targetSensitivity_.load(std::memory_order_acquire);
    const float targetSmoothing = targetSmoothing_.load(std::memory_order_acquire);
    const float targetFloor = targetFloorDb_.load(std::memory_order_acquire);

    for (int i = 0; i < numSamples; ++i) {
        sensitivity_ += (targetSensitivity - sensitivity_) * smooth_;
        smoothing_ += (targetSmoothing - smoothing_) * smooth_;
        floorDb_ += (targetFloor - floorDb_) * smooth_;

        const float inL = inputs[0].getSample(0, i);
        const float inR = inputs[0].numChannels > 1 ? inputs[0].getSample(1, i) : inL;
        const float mono = 0.5f * (inL + inR);
        const float detector = std::abs(mono) * sensitivity_;

        outputs[0].setSample(0, i, inL);
        if (outputs[0].numChannels > 1) {
            outputs[0].setSample(1, i, inR);
        }

        float prev = 0.0f;
        for (int b = 0; b < kNumSplits; ++b) {
            const float a = splitCoeff_[static_cast<size_t>(b)];
            splitState_[static_cast<size_t>(b)] = a * splitState_[static_cast<size_t>(b)] + (1.0f - a) * detector;
            const float split = splitState_[static_cast<size_t>(b)];
            const float band = juce::jmax(0.0f, split - prev);
            prev = split;

            bandState_[static_cast<size_t>(b)] =
                bandState_[static_cast<size_t>(b)] * smoothing_ + band * (1.0f - smoothing_);
        }

        const float highBand = juce::jmax(0.0f, detector - prev);
        bandState_[kNumBands - 1] = bandState_[kNumBands - 1] * smoothing_ + highBand * (1.0f - smoothing_);
    }

    const float floorLin = std::pow(10.0f, floorDb_ / 20.0f);
    const float invSpan = 1.0f / juce::jmax(0.000001f, 1.0f - floorLin);
    for (int b = 0; b < kNumBands; ++b) {
        const float norm = juce::jlimit(0.0f, 1.0f,
                                        (bandState_[static_cast<size_t>(b)] - floorLin) * invSpan);
        bandsOut_[static_cast<size_t>(b)].store(norm, std::memory_order_release);
    }
}

} // namespace dsp_primitives
