#pragma once

#include "dsp/core/graph/PrimitiveNode.h"

#include <array>
#include <atomic>
#include <memory>
#include <vector>

namespace dsp_primitives {

class AudioFmNode : public IPrimitiveNode,
                    public std::enable_shared_from_this<AudioFmNode> {
public:
    AudioFmNode();

    const char* getNodeType() const override { return "AudioFm"; }
    int getNumInputs() const override { return 4; }
    int getNumOutputs() const override { return 2; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setAmount(float amount) { targetAmount_.store(juce::jlimit(0.0f, 1.0f, amount), std::memory_order_release); }
    void setMix(float mix) { targetMix_.store(juce::jlimit(0.0f, 1.0f, mix), std::memory_order_release); }

    float getAmount() const { return targetAmount_.load(std::memory_order_acquire); }
    float getMix() const { return targetMix_.load(std::memory_order_acquire); }

private:
    std::atomic<float> targetAmount_{0.0f};
    std::atomic<float> targetMix_{0.0f};

    float currentAmount_ = 0.0f;
    float currentMix_ = 0.0f;
    float smooth_ = 1.0f;
    double sampleRate_ = 44100.0;
    int bufferSize_ = 0;
    int writePos_ = 0;
    bool prepared_ = false;
    std::array<std::vector<float>, 2> delayBuffer_;
};

} // namespace dsp_primitives
