#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <atomic>
#include <memory>

namespace dsp_primitives {

class PlayheadNode : public IPrimitiveNode, public std::enable_shared_from_this<PlayheadNode> {
public:
    PlayheadNode();

    const char* getNodeType() const override { return "Playhead"; }
    int getNumInputs() const override { return 0; }
    int getNumOutputs() const override { return 1; }
    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;

    void setLoopLength(int length);
    void setSpeed(float speed);
    void setReversed(bool reversed);
    void play();
    void pause();
    void stop();

    int getLoopLength() const;
    float getSpeed() const;
    bool isReversed() const;
    bool isPlaying() const;
    float getNormalizedPosition() const;

private:
    std::atomic<int> loopLength_{44100};
    std::atomic<int> position_{0};
    std::atomic<float> speed_{1.0f};
    std::atomic<bool> reversed_{false};
    std::atomic<bool> playing_{false};

    double sampleRate_ = 44100.0;
};

} // namespace dsp_primitives
