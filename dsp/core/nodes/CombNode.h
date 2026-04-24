#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <atomic>
#include <memory>
#include <vector>

namespace dsp_primitives {

class CombNode : public IPrimitiveNode,
                 public std::enable_shared_from_this<CombNode> {
public:
    explicit CombNode(float maxDelayMs = 50.0f);

    const char* getNodeType() const override { return "Comb"; }
    int getNumInputs() const override { return 1; }
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setMaxDelay(float ms);
    void setDelay(float ms);
    void setGain(float gain);
    void setFeedforward(float feedforward);
    void setFeedback(float feedback);

    float getMaxDelay() const;
    float getDelay() const;
    float getGain() const;
    float getFeedforward() const;
    float getFeedback() const;

private:
    static constexpr float kAbsoluteMaxDelayMs = 2000.0f;

    std::atomic<float> targetMaxDelayMs_{50.0f};
    std::atomic<float> targetDelayMs_{2.0f};
    std::atomic<float> targetGain_{1.0f};
    std::atomic<float> targetFeedforward_{0.0f};
    std::atomic<float> targetFeedback_{0.0f};

    float currentMaxDelayMs_ = 50.0f;
    float currentDelayMs_ = 2.0f;
    float currentGain_ = 1.0f;
    float currentFeedforward_ = 0.0f;
    float currentFeedback_ = 0.0f;

    std::vector<float> inputDelayBuffer_[2];
    std::vector<float> outputDelayBuffer_[2];
    int bufferSize_ = 0;
    int writeIdx_ = 0;

    double sampleRate_ = 44100.0;
    bool prepared_ = false;
};

} // namespace dsp_primitives
