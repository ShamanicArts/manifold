#pragma once

#include "dsp/core/graph/PrimitiveNode.h"

#include <array>
#include <atomic>
#include <memory>
#include <vector>

namespace dsp_primitives {

class AudioSyncNode : public IPrimitiveNode,
                      public std::enable_shared_from_this<AudioSyncNode> {
public:
    AudioSyncNode();

    const char* getNodeType() const override { return "AudioSync"; }
    int getNumInputs() const override { return 2; }
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setHardness(float hardness) { targetHardness_.store(juce::jlimit(0.0f, 1.0f, hardness), std::memory_order_release); }
    void setMix(float mix) { targetMix_.store(juce::jlimit(0.0f, 1.0f, mix), std::memory_order_release); }

    float getHardness() const { return targetHardness_.load(std::memory_order_acquire); }
    float getMix() const { return targetMix_.load(std::memory_order_acquire); }

private:
    std::atomic<float> targetHardness_{0.0f};
    std::atomic<float> targetMix_{0.0f};

    float currentHardness_ = 0.0f;
    float currentMix_ = 0.0f;
    float smooth_ = 1.0f;
    double sampleRate_ = 44100.0;
    int bufferSize_ = 0;
    int writePos_ = 0;
    int samplesSinceTrigger_ = 0;
    int lastPeriodSamples_ = 128;
    int cycleSample_ = 0;
    float prevSyncSample_ = 0.0f;
    bool prepared_ = false;
    std::array<std::vector<float>, 2> historyBuffer_;
};

} // namespace dsp_primitives
