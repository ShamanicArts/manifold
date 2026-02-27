#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
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
    void setAmplitude(float amp) { amplitude_ = amp; }
    void setEnabled(bool en) { enabled_ = en; }
    void setWaveform(int shape);
    float getFrequency() const { return frequency_; }
    float getAmplitude() const { return amplitude_; }
    bool isEnabled() const { return enabled_; }
    int getWaveform() const { return waveform_; }

private:
    float frequency_ = 440.0f;
    float amplitude_ = 0.5f;
    bool enabled_ = true;
    int waveform_ = 0;
    double sampleRate_ = 44100.0;
    double phase_ = 0.0;
    double phaseIncrement_ = 0.0;
};

} // namespace dsp_primitives
