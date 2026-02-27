#pragma once

#include "dsp/core/graph/PrimitiveNode.h"

#include <atomic>
#include <memory>

namespace dsp_primitives {

class ForwardCommitSchedulerNode : public IPrimitiveNode,
                                   public std::enable_shared_from_this<ForwardCommitSchedulerNode> {
public:
    ForwardCommitSchedulerNode() = default;

    const char* getNodeType() const override { return "ForwardCommitScheduler"; }
    int getNumInputs() const override { return 0; }
    int getNumOutputs() const override { return 0; }
    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;

    void arm(float bars, int layerIndex, double currentSamples, float samplesPerBar);
    void clear();
    bool isArmed() const;
    float getBars() const;
    int getLayerIndex() const;
    bool shouldFire(double currentSamples);

private:
    std::atomic<bool> armed_{false};
    std::atomic<float> bars_{0.0f};
    std::atomic<int> layerIndex_{0};
    std::atomic<double> armedAtSamples_{0.0};
    std::atomic<float> samplesPerBar_{0.0f};
};

} // namespace dsp_primitives
