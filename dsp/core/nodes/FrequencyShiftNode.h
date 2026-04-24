#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <atomic>
#include <vector>

namespace dsp_primitives {

class FrequencyShiftNode : public IPrimitiveNode {
public:
    FrequencyShiftNode();

    const char* getNodeType() const override { return "FrequencyShift"; }
    int getNumInputs() const override { return 1; }
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setShiftHz(float hz) { targetShiftHz_.store(hz, std::memory_order_release); }
    void setMix(float mix) { targetMix_.store(juce::jlimit(0.0f, 1.0f, mix), std::memory_order_release); }

    float getShiftHz() const { return targetShiftHz_.load(std::memory_order_acquire); }
    float getMix() const { return targetMix_.load(std::memory_order_acquire); }

private:
    static constexpr int kHilbertTaps = 65;
    static constexpr int kHilbertDelay = kHilbertTaps / 2; // 32

    std::atomic<float> targetShiftHz_{0.0f};
    std::atomic<float> targetMix_{1.0f};

    float currentShiftHz_ = 0.0f;
    float currentMix_ = 1.0f;
    float smooth_ = 1.0f;

    double sampleRate_ = 44100.0;
    bool prepared_ = false;

    // Hilbert FIR coefficients (precomputed in prepare)
    std::vector<float> hilbertCoefs_;

    // Per-channel delay lines for FIR convolution
    struct ChannelState {
        std::vector<float> delayLine;
        int writePos = 0;
    };
    std::vector<ChannelState> channels_;

    // Quadrature oscillator
    float lfoPhase_ = 0.0f;

    void buildHilbertFIR();
    float processHilbert(int ch, float sample);
};

} // namespace dsp_primitives
