#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <atomic>
#include <memory>

namespace dsp_primitives {

class MSEncoderNode : public IPrimitiveNode,
                      public std::enable_shared_from_this<MSEncoderNode> {
public:
    MSEncoderNode();

    const char* getNodeType() const override { return "MSEncoder"; }
    int getNumInputs() const override { return 1; }
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    // Scales side channel (stereo width). 0=mono, 1=neutral, >1 wider.
    void setWidth(float width) { targetWidth_.store(juce::jlimit(0.0f, 2.0f, width), std::memory_order_release); }
    float getWidth() const { return targetWidth_.load(std::memory_order_acquire); }

private:
    std::atomic<float> targetWidth_{1.0f};
    float width_ = 1.0f;
    float smooth_ = 1.0f;
    bool prepared_ = false;
};

class MSDecoderNode : public IPrimitiveNode,
                      public std::enable_shared_from_this<MSDecoderNode> {
public:
    MSDecoderNode();

    const char* getNodeType() const override { return "MSDecoder"; }
    int getNumInputs() const override { return 1; }
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

private:
    bool prepared_ = false;
};

} // namespace dsp_primitives
