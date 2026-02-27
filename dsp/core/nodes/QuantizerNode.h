#pragma once

#include "dsp/core/graph/PrimitiveNode.h"

#include <atomic>
#include <memory>

namespace dsp_primitives {

class QuantizerNode : public IPrimitiveNode,
                      public std::enable_shared_from_this<QuantizerNode> {
public:
    QuantizerNode() = default;

    const char* getNodeType() const override { return "Quantizer"; }
    int getNumInputs() const override { return 0; }
    int getNumOutputs() const override { return 0; }
    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;

    void setTempo(float bpm);
    float getTempo() const;
    void setBeatsPerBar(float beats);
    float getBeatsPerBar() const;
    float getSamplesPerBar() const;
    int quantizeToNearestLegal(int samples) const;

private:
    std::atomic<float> tempo_{120.0f};
    std::atomic<float> beatsPerBar_{4.0f};
    std::atomic<float> sampleRate_{44100.0f};
};

} // namespace dsp_primitives
