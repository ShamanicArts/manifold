#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <array>
#include <atomic>
#include <cstdint>
#include <memory>

namespace dsp_primitives {

class NoiseGeneratorNode : public IPrimitiveNode,
                           public std::enable_shared_from_this<NoiseGeneratorNode> {
public:
    NoiseGeneratorNode();

    const char* getNodeType() const override { return "NoiseGenerator"; }
    int getNumInputs() const override { return 0; }
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setLevel(float level) { targetLevel_.store(juce::jlimit(0.0f, 1.0f, level), std::memory_order_release); }

    // 0 = white, 1 = darker (simple lowpass on noise)
    void setColor(float color) { targetColor_.store(juce::jlimit(0.0f, 1.0f, color), std::memory_order_release); }

    float getLevel() const { return targetLevel_.load(std::memory_order_acquire); }
    float getColor() const { return targetColor_.load(std::memory_order_acquire); }

private:
    static uint32_t xorshift32(uint32_t& state);
    static float u32ToFloatSigned(uint32_t v);

    std::atomic<float> targetLevel_{0.2f};
    std::atomic<float> targetColor_{0.0f};

    float level_ = 0.2f;
    float color_ = 0.0f;
    float smooth_ = 1.0f;

    std::array<uint32_t, 2> rng_{{0x12345678u, 0x87654321u}};
    std::array<float, 2> lpState_{{0.0f, 0.0f}};

    double sampleRate_ = 44100.0;
    bool prepared_ = false;
};

} // namespace dsp_primitives
