#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <memory>

namespace dsp_primitives {

class DistortionNode : public IPrimitiveNode, public std::enable_shared_from_this<DistortionNode> {
public:
    DistortionNode();

    const char* getNodeType() const override { return "Distortion"; }
    int getNumInputs() const override { return 2; }
    int getNumOutputs() const override { return 2; }
    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;

    void setDrive(float d) { drive_ = juce::jlimit(1.0f, 30.0f, d); }
    void setMix(float m) { mix_ = juce::jlimit(0.0f, 1.0f, m); }
    void setOutput(float g) { output_ = juce::jlimit(0.0f, 2.0f, g); }

    float getDrive() const { return drive_; }
    float getMix() const { return mix_; }
    float getOutput() const { return output_; }

private:
    float drive_ = 4.0f;
    float mix_ = 0.7f;
    float output_ = 0.8f;
};

} // namespace dsp_primitives
