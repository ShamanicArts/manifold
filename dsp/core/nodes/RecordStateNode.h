#pragma once

#include "dsp/core/graph/PrimitiveNode.h"

#include <atomic>
#include <memory>

namespace dsp_primitives {

class RecordStateNode : public IPrimitiveNode,
                        public std::enable_shared_from_this<RecordStateNode> {
public:
    RecordStateNode() = default;

    const char* getNodeType() const override { return "RecordState"; }
    int getNumInputs() const override { return 0; }
    int getNumOutputs() const override { return 0; }
    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;

    void startRecording();
    void stopRecording();
    bool isRecording() const;
    void setOverdub(bool enabled);
    bool isOverdub() const;

private:
    std::atomic<bool> recording_{false};
    std::atomic<bool> overdub_{false};
};

} // namespace dsp_primitives
