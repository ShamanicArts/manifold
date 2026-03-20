#include "dsp/core/nodes/OscillatorNode.h"

#define _USE_MATH_DEFINES
#include <cmath>
#include <cstdlib>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace dsp_primitives {

OscillatorNode::OscillatorNode() = default;

void OscillatorNode::setFrequency(float freq) {
    targetFrequency_.store(juce::jlimit(1.0f, 20000.0f, freq), std::memory_order_release);
}

void OscillatorNode::setWaveform(int shape) {
    waveform_.store(juce::jlimit(0, 7, shape), std::memory_order_release);
}

void OscillatorNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;

    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;

    const double freqTimeSeconds = 0.02;
    const double ampTimeSeconds = 0.01;
    freqSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (freqTimeSeconds * sampleRate_)));
    ampSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (ampTimeSeconds * sampleRate_)));
    freqSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, freqSmoothingCoeff_);
    ampSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, ampSmoothingCoeff_);

    currentFrequency_ = targetFrequency_.load(std::memory_order_acquire);
    currentAmplitude_ = targetAmplitude_.load(std::memory_order_acquire);
}

void OscillatorNode::process(const std::vector<AudioBufferView>& inputs,
                             std::vector<WritableAudioBufferView>& outputs,
                             int numSamples) {
    (void)inputs;

    if (outputs.empty() || !enabled_.load(std::memory_order_acquire)) {
        if (!outputs.empty()) outputs[0].clear();
        return;
    }

    auto& out = outputs[0];
    const int wf = waveform_.load(std::memory_order_acquire);
    const float targetFreq = targetFrequency_.load(std::memory_order_acquire);
    const float targetAmp = enabled_.load(std::memory_order_acquire)
                                ? targetAmplitude_.load(std::memory_order_acquire)
                                : 0.0f;
    const float pulseWidth = pulseWidth_.load(std::memory_order_acquire) * static_cast<float>(M_PI);
    const int unison = unisonVoices_.load(std::memory_order_acquire);
    const float detuneCents = detuneCents_.load(std::memory_order_acquire);
    const float spread = stereoSpread_.load(std::memory_order_acquire);

    for (int i = 0; i < numSamples; ++i) {
        currentFrequency_ += (targetFreq - currentFrequency_) * freqSmoothingCoeff_;
        currentAmplitude_ += (targetAmp - currentAmplitude_) * ampSmoothingCoeff_;

        const double phaseIncrement = 2.0 * M_PI * currentFrequency_ / sampleRate_;

        float leftSample = 0.0f;
        float rightSample = 0.0f;

        // Generate unison voices
        for (int v = 0; v < unison; ++v) {
            // Calculate detune for this voice
            float detuneAmount = (v - unison * 0.5f) * detuneCents / 100.0f;
            double freqMult = std::pow(2.0, detuneAmount / 12.0);
            double voicePhaseInc = phaseIncrement * freqMult;

            double& voicePhase = (v == 0) ? phase_ : unisonPhases_[v];

            const float sine = static_cast<float>(std::sin(voicePhase));
            const float phaseNorm = static_cast<float>(voicePhase / (2.0 * M_PI));
            const float saw = 2.0f * phaseNorm - 1.0f;
            const float square = (voicePhase < juce::MathConstants<double>::pi) ? 1.0f : -1.0f;
            const float triangle = 1.0f - 4.0f * std::abs(phaseNorm - 0.5f);

            float waveformSample = sine;
            switch (wf) {
                case 1: waveformSample = saw; break;
                case 2: waveformSample = square; break;
                case 3: waveformSample = triangle; break;
                case 4: waveformSample = 0.45f * sine + 0.55f * saw; break;  // Blend
                case 5: {  // Noise (white noise)
                    waveformSample = (static_cast<float>(std::rand()) / RAND_MAX) * 2.0f - 1.0f;
                    break;
                }
                case 6: {  // Pulse (variable width)
                    waveformSample = (voicePhase < pulseWidth) ? 1.0f : -1.0f;
                    break;
                }
                case 7: {  // SuperSaw (3 detuned saws)
                    float s1 = saw;
                    float s2 = 2.0f * std::fmod(phaseNorm * 1.01f, 1.0f) - 1.0f;
                    float s3 = 2.0f * std::fmod(phaseNorm * 0.99f, 1.0f) - 1.0f;
                    waveformSample = (s1 + s2 * 0.5f + s3 * 0.5f) * 0.5f;
                    break;
                }
                case 0:
                default:
                    waveformSample = sine;
                    break;
            }

            // Stereo spread
            float pan = 0.5f + (v - unison * 0.5f) * spread / unison;
            float leftPan = std::sqrt(1.0f - pan);
            float rightPan = std::sqrt(pan);

            leftSample += waveformSample * leftPan;
            rightSample += waveformSample * rightPan;

            // Advance phase
            voicePhase += voicePhaseInc;
            while (voicePhase >= 2.0 * M_PI) {
                voicePhase -= 2.0 * M_PI;
            }
            while (voicePhase < 0.0) {
                voicePhase += 2.0 * M_PI;
            }
        }

        // Normalize by unison count
        float normGain = (unison > 0) ? (1.0f / std::sqrt(static_cast<float>(unison))) : 0.0f;
        leftSample *= normGain * currentAmplitude_;
        rightSample *= normGain * currentAmplitude_;

        // Output
        if (out.numChannels >= 2) {
            out.setSample(0, i, leftSample);
            out.setSample(1, i, rightSample);
        } else {
            out.setSample(0, i, (leftSample + rightSample) * 0.5f);
        }
    }
}

} // namespace dsp_primitives
