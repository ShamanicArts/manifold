#include "SVFNode.h"
#include <cmath>
#include <algorithm>

namespace dsp_primitives {

namespace {
    constexpr float kMinStableResonance = 0.06f;

    inline float tanh_approx(float x) {
        // Fast tanh approximation: x / (1 + |x| * (1 + |x|/3))
        const float ax = std::abs(x);
        return x / (1.0f + ax * (1.0f + ax * 0.33333333f));
    }

    inline bool isFinite(float v) {
        return std::isfinite(v);
    }
}

SVFNode::SVFNode() = default;

void SVFNode::prepare(double sampleRate, int maxBlockSize) {
    (void)maxBlockSize;
    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0;
    
    // Calculate smoothing coefficients (20ms for cutoff, 10ms for others)
    const double cutoffTimeSeconds = 0.02;
    const double otherTimeSeconds = 0.01;
    
    cutoffSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (cutoffTimeSeconds * sampleRate_)));
    resonanceSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (otherTimeSeconds * sampleRate_)));
    driveSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (otherTimeSeconds * sampleRate_)));
    mixSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (otherTimeSeconds * sampleRate_)));
    
    cutoffSmoothingCoeff_ = std::max(0.0001f, std::min(1.0f, cutoffSmoothingCoeff_));
    resonanceSmoothingCoeff_ = std::max(0.0001f, std::min(1.0f, resonanceSmoothingCoeff_));
    driveSmoothingCoeff_ = std::max(0.0001f, std::min(1.0f, driveSmoothingCoeff_));
    mixSmoothingCoeff_ = std::max(0.0001f, std::min(1.0f, mixSmoothingCoeff_));
    
    // Initialize current values from targets
    currentCutoff_ = targetCutoff_.load(std::memory_order_acquire);
    currentResonance_ = targetResonance_.load(std::memory_order_acquire);
    currentDrive_ = targetDrive_.load(std::memory_order_acquire);
    currentMix_ = targetMix_.load(std::memory_order_acquire);
    
    prepared_ = true;
}

void SVFNode::process(const std::vector<AudioBufferView>& inputs,
                      std::vector<WritableAudioBufferView>& outputs,
                      int numSamples) {
    if (!prepared_ || outputs.empty() || numSamples <= 0) {
        if (!inputs.empty() && !outputs.empty()) {
            for (int ch = 0; ch < std::min(inputs[0].numChannels, outputs[0].numChannels); ++ch) {
                for (int i = 0; i < numSamples; ++i) {
                    outputs[0].setSample(ch, i, inputs[0].getSample(ch, i));
                }
            }
        }
        return;
    }

    const Mode mode = mode_.load(std::memory_order_acquire);
    
    // Load target parameters
    const float targetCutoff = targetCutoff_.load(std::memory_order_acquire);
    const float targetResonance = targetResonance_.load(std::memory_order_acquire);
    const float targetDrive = targetDrive_.load(std::memory_order_acquire);
    const float targetMix = targetMix_.load(std::memory_order_acquire);

    const int numChannels = std::min({
        inputs.empty() ? 0 : inputs[0].numChannels,
        outputs[0].numChannels,
        2
    });

    for (int i = 0; i < numSamples; ++i) {
        // Smooth parameter changes toward targets
        currentCutoff_ += (targetCutoff - currentCutoff_) * cutoffSmoothingCoeff_;
        currentResonance_ += (targetResonance - currentResonance_) * resonanceSmoothingCoeff_;
        currentDrive_ += (targetDrive - currentDrive_) * driveSmoothingCoeff_;
        currentMix_ += (targetMix - currentMix_) * mixSmoothingCoeff_;

        // Clamp cutoff to 0.42 * sr to keep g well-behaved
        const float sr = static_cast<float>(sampleRate_);
        const float safeCutoff = std::max(20.0f, std::min(0.42f * sr, currentCutoff_));
        const float safeResonance = std::max(kMinStableResonance, std::min(1.0f, currentResonance_));

        // TPT (trapezoidal) SVF - stable at all frequencies unlike Chamberlin.
        // g = tan(pi * fc / sr), clamped to prevent numerical blowup near Nyquist.
        const float g = std::min(std::tan(3.14159265f * safeCutoff / sr), 8.0f);
        // k controls damping: k=2 is no resonance, k→0 is self-oscillation.
        // Scale so resonance=1.0 gives a strong but non-self-oscillating peak.
        const float k = 2.0f * (1.0f - safeResonance * 0.85f);  // min k=0.3 at max resonance
        const float a1 = 1.0f / (1.0f + g * (g + k));
        const float a2 = g * a1;
        const float a3 = g * a2;

        for (int ch = 0; ch < numChannels; ++ch) {
            float input = inputs.empty() ? 0.0f : inputs[0].getSample(ch, i);
            
            // Apply drive (input saturation)
            if (currentDrive_ > 0.0f) {
                input = tanh_approx(input * currentDrive_) / std::max(0.001f, currentDrive_);
            }

            ChannelState& s = state_[ch];

            // TPT SVF (Zavalishin topology) - unconditionally stable
            const float v3 = input - s.ic2eq;
            const float v1 = a1 * s.ic1eq + a2 * v3;
            const float v2 = s.ic2eq + a2 * s.ic1eq + a3 * v3;

            s.ic1eq = 2.0f * v1 - s.ic1eq;
            s.ic2eq = 2.0f * v2 - s.ic2eq;

            if (!isFinite(s.ic1eq) || !isFinite(s.ic2eq)) {
                s = ChannelState{};
                outputs[0].setSample(ch, i, input);
                continue;
            }
            
            // Output selection based on mode
            float output = 0.0f;
            switch (mode) {
                case Mode::Lowpass:
                    output = v2;
                    break;
                case Mode::Bandpass:
                    output = v1;
                    break;
                case Mode::Highpass:
                    output = input - k * v1 - v2;
                    break;
                case Mode::Notch:
                    output = input - k * v1;
                    break;
                case Mode::Peak:
                    output = input - k * v1 - 2.0f * v2;
                    break;
            }

            // Mix dry/wet
            const float dry = inputs.empty() ? 0.0f : inputs[0].getSample(ch, i);
            output = dry * (1.0f - currentMix_) + output * currentMix_;

            if (!isFinite(output)) {
                s = ChannelState{};
                output = dry;
            }
            
            outputs[0].setSample(ch, i, output);
        }
    }
}

void SVFNode::setCutoff(float freq) {
    targetCutoff_.store(std::max(20.0f, std::min(20000.0f, freq)), std::memory_order_release);
}

void SVFNode::setResonance(float q) {
    targetResonance_.store(std::max(kMinStableResonance, std::min(1.0f, q)), std::memory_order_release);
}

void SVFNode::setMode(Mode mode) {
    mode_.store(mode, std::memory_order_release);
}

void SVFNode::setDrive(float drive) {
    targetDrive_.store(std::max(0.0f, std::min(10.0f, drive)), std::memory_order_release);
}

void SVFNode::setMix(float wet) {
    targetMix_.store(std::max(0.0f, std::min(1.0f, wet)), std::memory_order_release);
}

float SVFNode::getCutoff() const {
    return targetCutoff_.load(std::memory_order_acquire);
}

float SVFNode::getResonance() const {
    return targetResonance_.load(std::memory_order_acquire);
}

SVFNode::Mode SVFNode::getMode() const {
    return mode_.load(std::memory_order_acquire);
}

float SVFNode::getDrive() const {
    return targetDrive_.load(std::memory_order_acquire);
}

float SVFNode::getMix() const {
    return targetMix_.load(std::memory_order_acquire);
}

void SVFNode::reset() {
    state_[0] = ChannelState{};
    state_[1] = ChannelState{};
}

} // namespace dsp_primitives
