#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <atomic>
#include <memory>

namespace dsp_primitives {

class ResonatorNode : public IPrimitiveNode,
                      public std::enable_shared_from_this<ResonatorNode> {
public:
    ResonatorNode();

    const char* getNodeType() const override { return "Resonator"; }
    int getNumInputs() const override { return 1; }
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setGain(float gain);
    void setFrequency(float freq);
    void setQ(float q);

    float getGain() const;
    float getFrequency() const;
    float getQ() const;

private:
    std::atomic<float> targetGain_{1.0f};
    std::atomic<float> targetFrequency_{1000.0f};
    std::atomic<float> targetQ_{10.0f};

    float currentGain_ = 1.0f;
    float currentFrequency_ = 1000.0f;
    float currentQ_ = 10.0f;

    // Direct Form I state per channel
    float x1_[2] = {0.0f, 0.0f};
    float x2_[2] = {0.0f, 0.0f};
    float y1_[2] = {0.0f, 0.0f};
    float y2_[2] = {0.0f, 0.0f};

    double sampleRate_ = 44100.0;
    bool prepared_ = false;
};

} // namespace dsp_primitives