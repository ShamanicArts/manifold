#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <array>
#include <atomic>
#include <memory>

namespace dsp_primitives {

class ChorusNode : public IPrimitiveNode,
                   public std::enable_shared_from_this<ChorusNode> {
public:
    enum class Waveform {
        Sine = 0,
        Triangle = 1
    };

    ChorusNode();

    const char* getNodeType() const override { return "Chorus"; }
    int getNumInputs() const override { return 1; }
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setRate(float hz) { targetRateHz_.store(juce::jlimit(0.05f, 10.0f, hz), std::memory_order_release); }
    void setDepth(float depth) { targetDepth_.store(juce::jlimit(0.0f, 1.0f, depth), std::memory_order_release); }
    void setVoices(int voices) { targetVoices_.store(juce::jlimit(1, 4, voices), std::memory_order_release); }
    void setSpread(float spread) { targetSpread_.store(juce::jlimit(0.0f, 1.0f, spread), std::memory_order_release); }
    void setFeedback(float feedback) { targetFeedback_.store(juce::jlimit(0.0f, 0.95f, feedback), std::memory_order_release); }
    void setWaveform(int waveform) {
        const int w = juce::jlimit(0, 1, waveform);
        targetWaveform_.store(static_cast<Waveform>(w), std::memory_order_release);
    }
    void setMix(float mix) { targetMix_.store(juce::jlimit(0.0f, 1.0f, mix), std::memory_order_release); }

    float getRate() const { return targetRateHz_.load(std::memory_order_acquire); }
    float getDepth() const { return targetDepth_.load(std::memory_order_acquire); }
    int getVoices() const { return targetVoices_.load(std::memory_order_acquire); }
    float getSpread() const { return targetSpread_.load(std::memory_order_acquire); }
    float getFeedback() const { return targetFeedback_.load(std::memory_order_acquire); }
    int getWaveform() const { return static_cast<int>(targetWaveform_.load(std::memory_order_acquire)); }
    float getMix() const { return targetMix_.load(std::memory_order_acquire); }

private:
    float lfo(float phase, Waveform waveform) const;
    float readDelay(int channel, float delaySamples) const;

    std::atomic<float> targetRateHz_{0.6f};
    std::atomic<float> targetDepth_{0.45f};
    std::atomic<int> targetVoices_{3};
    std::atomic<float> targetSpread_{0.7f};
    std::atomic<float> targetFeedback_{0.1f};
    std::atomic<Waveform> targetWaveform_{Waveform::Sine};
    std::atomic<float> targetMix_{0.5f};

    float currentRateHz_ = 0.6f;
    float currentDepth_ = 0.45f;
    float currentSpread_ = 0.7f;
    float currentFeedback_ = 0.1f;
    float currentMix_ = 0.5f;

    float rateSmooth_ = 1.0f;
    float depthSmooth_ = 1.0f;
    float spreadSmooth_ = 1.0f;
    float feedbackSmooth_ = 1.0f;
    float mixSmooth_ = 1.0f;

    std::array<std::array<float, 4>, 2> phase_{};
    juce::AudioBuffer<float> delayBuffer_;
    int bufferSize_ = 0;
    int writeIndex_ = 0;

    double sampleRate_ = 44100.0;
    bool prepared_ = false;

    static constexpr float kBaseDelayMs = 12.0f;
    static constexpr float kMaxDepthMs = 20.0f;
    static constexpr float kMaxDelaySeconds = 0.08f;
};

} // namespace dsp_primitives
