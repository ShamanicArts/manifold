#pragma once

#include "dsp/core/graph/PrimitiveNode.h"

#include <atomic>
#include <memory>

namespace dsp_primitives {

class RecordModePolicyNode : public IPrimitiveNode,
                             public std::enable_shared_from_this<RecordModePolicyNode> {
public:
    enum class Mode {
        FirstLoop = 0,
        FreeMode = 1,
        Traditional = 2,
        Retrospective = 3,
    };

    RecordModePolicyNode() = default;

    const char* getNodeType() const override { return "RecordModePolicy"; }
    int getNumInputs() const override { return 0; }
    int getNumOutputs() const override { return 0; }
    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;

    void setMode(int modeIndex);
    int getMode() const;
    bool usesRetrospectiveCommit() const;
    bool schedulesForwardCommitWhenIdle() const;

private:
    std::atomic<int> mode_{static_cast<int>(Mode::FirstLoop)};
};

} // namespace dsp_primitives
