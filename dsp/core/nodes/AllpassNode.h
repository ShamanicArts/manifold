#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <atomic>
#include <memory>

namespace dsp_primitives {

class AllpassNode : public IPrimitiveNode,
                   public std::enable_shared_from_this<AllpassNode> {
public:
    explicit AllpassNode(float maxDelayMs = 10.0f);

    const char* getNodeType() const override { return "Allpass"; }
    int getNumInputs() const override { return 1; }
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setMaxDelay(float ms);
    void setDelay(float ms);
    void setFeedback(float feedback);
    void setGain(float gain) { setFeedback(gain); }

    float getMaxDelay() const;
    float getDelay() const;
    float getFeedback() const;
    float getGain() const { return getFeedback(); }

private:
    static constexpr float kAbsoluteMaxDelayMs = 2000.0f;

    std::atomic<float> targetMaxDelayMs_{10.0f};
    std::atomic<float> targetDelayMs_{2.0f};
    std::atomic<float> targetFeedback_{0.0f};

    float currentMaxDelayMs_ = 10.0f;
    float currentDelayMs_ = 2.0f;
    float currentFeedback_ = 0.0f;

    // Delay line state (stereo). Stores the allpass state variable, not dry audio.
    std::vector<float> delayBuffer_[2];
    int bufferSize_ = 0;
    int writeIdx_ = 0;

    double sampleRate_ = 44100.0;
    bool prepared_ = false;
};

} // namespace dsp_primitives