#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <atomic>
#include <memory>

namespace dsp_primitives {

class SlewLimiterNode : public IPrimitiveNode,
                        public std::enable_shared_from_this<SlewLimiterNode> {
public:
    SlewLimiterNode();

    const char* getNodeType() const override { return "SlewLimiter"; }
    int getNumInputs() const override { return 1; }
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setSlideUp(float slide);
    void setSlideDown(float slide);
    float getSlideUp() const;
    float getSlideDown() const;

    // Backwards-compatible aliases for older lab code.
    void setRiseRate(float rate) { setSlideUp(rate); }
    void setFallRate(float rate) { setSlideDown(rate); }
    float getRiseRate() const { return getSlideUp(); }
    float getFallRate() const { return getSlideDown(); }

private:
    std::atomic<float> targetSlideUp_{1.0f};
    std::atomic<float> targetSlideDown_{1.0f};

    float currentSlideUp_ = 1.0f;
    float currentSlideDown_ = 1.0f;

    // Per-channel state: last output value
    float lastOutput_[2] = {0.0f, 0.0f};

    double sampleRate_ = 44100.0;
    bool prepared_ = false;
};

} // namespace dsp_primitives