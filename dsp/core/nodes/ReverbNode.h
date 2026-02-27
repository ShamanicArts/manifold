#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <memory>
#include <vector>

namespace dsp_primitives {

class ReverbNode : public IPrimitiveNode, public std::enable_shared_from_this<ReverbNode> {
public:
    ReverbNode();

    const char* getNodeType() const override { return "Reverb"; }
    int getNumInputs() const override { return 2; }
    int getNumOutputs() const override { return 2; }
    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;

    void setRoomSize(float value) { params_.roomSize = value; reverb_.setParameters(params_); }
    void setDamping(float value) { params_.damping = value; reverb_.setParameters(params_); }
    void setWetLevel(float value) { params_.wetLevel = value; reverb_.setParameters(params_); }
    void setDryLevel(float value) { params_.dryLevel = value; reverb_.setParameters(params_); }
    void setWidth(float value) { params_.width = value; reverb_.setParameters(params_); }

    float getRoomSize() const { return params_.roomSize; }
    float getDamping() const { return params_.damping; }
    float getWetLevel() const { return params_.wetLevel; }
    float getDryLevel() const { return params_.dryLevel; }
    float getWidth() const { return params_.width; }

private:
    juce::Reverb reverb_;
    juce::Reverb::Parameters params_;

    std::vector<float> left_;
    std::vector<float> right_;
};

} // namespace dsp_primitives
