#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <array>
#include <atomic>
#include <memory>

namespace dsp_primitives {

class SpectrumAnalyzerNode : public IPrimitiveNode,
                             public std::enable_shared_from_this<SpectrumAnalyzerNode> {
public:
    SpectrumAnalyzerNode();

    const char* getNodeType() const override { return "SpectrumAnalyzer"; }
    int getNumInputs() const override { return 2; }
    int getNumOutputs() const override { return 2; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setSensitivity(float value) { targetSensitivity_.store(juce::jlimit(0.1f, 8.0f, value), std::memory_order_release); }
    void setSmoothing(float value) { targetSmoothing_.store(juce::jlimit(0.0f, 0.999f, value), std::memory_order_release); }
    void setFloor(float valueDb) { targetFloorDb_.store(juce::jlimit(-96.0f, -12.0f, valueDb), std::memory_order_release); }

    float getSensitivity() const { return targetSensitivity_.load(std::memory_order_acquire); }
    float getSmoothing() const { return targetSmoothing_.load(std::memory_order_acquire); }
    float getFloor() const { return targetFloorDb_.load(std::memory_order_acquire); }

    float getBand1() const { return bandsOut_[0].load(std::memory_order_acquire); }
    float getBand2() const { return bandsOut_[1].load(std::memory_order_acquire); }
    float getBand3() const { return bandsOut_[2].load(std::memory_order_acquire); }
    float getBand4() const { return bandsOut_[3].load(std::memory_order_acquire); }
    float getBand5() const { return bandsOut_[4].load(std::memory_order_acquire); }
    float getBand6() const { return bandsOut_[5].load(std::memory_order_acquire); }
    float getBand7() const { return bandsOut_[6].load(std::memory_order_acquire); }
    float getBand8() const { return bandsOut_[7].load(std::memory_order_acquire); }

private:
    static constexpr int kNumBands = 8;
    static constexpr int kNumSplits = kNumBands - 1;

    std::atomic<float> targetSensitivity_{1.0f};
    std::atomic<float> targetSmoothing_{0.85f};
    std::atomic<float> targetFloorDb_{-72.0f};

    float sensitivity_ = 1.0f;
    float smoothing_ = 0.85f;
    float floorDb_ = -72.0f;
    float smooth_ = 1.0f;

    std::array<float, kNumSplits> splitState_{};
    std::array<float, kNumSplits> splitCoeff_{};
    std::array<float, kNumBands> bandState_{};
    std::array<std::atomic<float>, kNumBands> bandsOut_;

    double sampleRate_ = 44100.0;
    bool prepared_ = false;
};

} // namespace dsp_primitives
