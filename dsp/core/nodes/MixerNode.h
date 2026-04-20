#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <array>
#include <atomic>
#include <memory>

namespace dsp_primitives {

class MixerNode : public IPrimitiveNode,
                  public std::enable_shared_from_this<MixerNode> {
public:
    static constexpr int kMaxBusses = 32;

    MixerNode();

    const char* getNodeType() const override { return "Mixer"; }

    int getNumInputs() const override {
        return inputCount_.load(std::memory_order_acquire);
    }
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setInputCount(int count) {
        inputCount_.store(juce::jlimit(1, kMaxBusses, count), std::memory_order_release);
    }
    int getInputCount() const {
        return inputCount_.load(std::memory_order_acquire);
    }

    void setGain(int busIndex, float g);
    void setPan(int busIndex, float p);
    float getGain(int busIndex) const;
    float getPan(int busIndex) const;

    void setGain1(float g) { setGain(1, g); }
    void setGain2(float g) { setGain(2, g); }
    void setGain3(float g) { setGain(3, g); }
    void setGain4(float g) { setGain(4, g); }

    void setPan1(float p) { setPan(1, p); }
    void setPan2(float p) { setPan(2, p); }
    void setPan3(float p) { setPan(3, p); }
    void setPan4(float p) { setPan(4, p); }

    void setMaster(float g) { targetMaster_.store(juce::jlimit(0.0f, 2.0f, g), std::memory_order_release); }

    float getGain1() const { return getGain(1); }
    float getGain2() const { return getGain(2); }
    float getGain3() const { return getGain(3); }
    float getGain4() const { return getGain(4); }

    float getPan1() const { return getPan(1); }
    float getPan2() const { return getPan(2); }
    float getPan3() const { return getPan(3); }
    float getPan4() const { return getPan(4); }

    float getMaster() const { return targetMaster_.load(std::memory_order_acquire); }

    void disableSIMD() //turn off SIMD implementation, for testing
    {
        simd_implementation_.reset();
    }

private:
    inline void notifyConfigChangeSimdImplementation()
    {
        if(simd_implementation_ != nullptr)
            simd_implementation_->configChanged();
    }

    std::atomic<int> inputCount_{4};
    std::array<std::atomic<float>, kMaxBusses> targetGains_{};
    std::array<std::atomic<float>, kMaxBusses> targetPans_{};
    std::atomic<float> targetMaster_{1.0f};

    std::array<float, kMaxBusses> gains_{};
    std::array<float, kMaxBusses> pans_{};

    float master_ = 1.0f;
    float smooth_ = 1.0f;

    bool prepared_ = false;

    //SIMD implementation
    std::unique_ptr<IPrimitiveNodeSIMDImplementation> simd_implementation_;
};

} // namespace dsp_primitives
