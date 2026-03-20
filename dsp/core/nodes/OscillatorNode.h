#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include <atomic>
#include <memory>

namespace dsp_primitives {

class OscillatorNode : public IPrimitiveNode, public std::enable_shared_from_this<OscillatorNode> {
public:
    OscillatorNode();

    const char* getNodeType() const override { return "Oscillator"; }
    int getNumInputs() const override { return 0; }
    int getNumOutputs() const override { return 1; }
    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;

    void setFrequency(float freq);
    void setAmplitude(float amp) { targetAmplitude_.store(juce::jlimit(0.0f, 1.0f, amp), std::memory_order_release); }
    void setEnabled(bool en) { enabled_.store(en, std::memory_order_release); }
    void setWaveform(int shape);
    float getFrequency() const { return targetFrequency_.load(std::memory_order_acquire); }
    float getAmplitude() const { return targetAmplitude_.load(std::memory_order_acquire); }
    bool isEnabled() const { return enabled_.load(std::memory_order_acquire); }
    int getWaveform() const { return waveform_.load(std::memory_order_acquire); }

    // Pulse width for pulse waveform (0.0 to 1.0, default 0.5 = square)
    void setPulseWidth(float width) { pulseWidth_.store(juce::jlimit(0.01f, 0.99f, width), std::memory_order_release); }
    float getPulseWidth() const { return pulseWidth_.load(std::memory_order_acquire); }

    // Unison settings for supersaw and rich tones
    void setUnison(int voices) { unisonVoices_.store(juce::jlimit(1, 8, voices), std::memory_order_release); }
    void setDetune(float cents) { detuneCents_.store(juce::jlimit(0.0f, 100.0f, cents), std::memory_order_release); }
    void setSpread(float amount) { stereoSpread_.store(juce::jlimit(0.0f, 1.0f, amount), std::memory_order_release); }
    int getUnison() const { return unisonVoices_.load(std::memory_order_acquire); }
    float getDetune() const { return detuneCents_.load(std::memory_order_acquire); }
    float getSpread() const { return stereoSpread_.load(std::memory_order_acquire); }

private:
    std::atomic<float> targetFrequency_{440.0f};
    std::atomic<float> targetAmplitude_{0.5f};
    std::atomic<bool> enabled_{true};
    std::atomic<int> waveform_{0};

    // New parameters
    std::atomic<float> pulseWidth_{0.5f};      // For pulse waveform (0.01-0.99)
    std::atomic<int> unisonVoices_{1};          // Number of unison voices (1-8)
    std::atomic<float> detuneCents_{0.0f};      // Detune amount in cents (0-100)
    std::atomic<float> stereoSpread_{0.0f};     // Stereo spread (0-1)

    float currentFrequency_ = 440.0f;
    float currentAmplitude_ = 0.5f;
    float freqSmoothingCoeff_ = 1.0f;
    float ampSmoothingCoeff_ = 1.0f;

    double sampleRate_ = 44100.0;
    double phase_ = 0.0;

    // Per-unison-voice phases for supersaw
    double unisonPhases_[8] = {0.0};
};

} // namespace dsp_primitives
