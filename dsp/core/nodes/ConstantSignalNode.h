#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <atomic>
#include <memory>

namespace dsp_primitives {

class ConstantSignalNode : public IPrimitiveNode,
                          public std::enable_shared_from_this<ConstantSignalNode> {
public:
    ConstantSignalNode();

    const char* getNodeType() const override { return "ConstantSignal"; }
    int getNumInputs() const override { return 0; }  // No input needed
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setValue(float value);
    float getValue() const;

private:
    std::atomic<float> targetValue_{0.0f};
    float currentValue_ = 0.0f;

    double sampleRate_ = 44100.0;
    bool prepared_ = false;
};

} // namespace dsp_primitives