#pragma once

#include "dsp/core/graph/PrimitiveNode.h"

#include <atomic>
#include <memory>

namespace dsp_primitives {

class TransportStateNode : public IPrimitiveNode,
                           public std::enable_shared_from_this<TransportStateNode> {
public:
    enum class State {
        Stopped = 0,
        Playing = 1,
        Paused = 2,
    };

    TransportStateNode() = default;

    const char* getNodeType() const override { return "TransportState"; }
    int getNumInputs() const override { return 0; }
    int getNumOutputs() const override { return 0; }
    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;

    void play();
    void pause();
    void stop();
    void setState(int stateIndex);
    int getState() const;
    bool isPlaying() const;

private:
    std::atomic<int> state_{static_cast<int>(State::Stopped)};
};

} // namespace dsp_primitives
