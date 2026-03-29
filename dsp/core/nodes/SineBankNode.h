#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include "dsp/core/nodes/PartialData.h"

#include <array>
#include <atomic>
#include <memory>

namespace dsp_primitives {

class SampleRegionPlaybackNode;

class SineBankNode : public IPrimitiveNode,
                     public std::enable_shared_from_this<SineBankNode> {
public:
    SineBankNode();

    const char* getNodeType() const override { return "SineBank"; }
    int getNumInputs() const override { return 2; }
    int getNumOutputs() const override { return 1; }

    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;
    void reset();

    void setFrequency(float freq);
    float getFrequency() const { return targetFrequency_.load(std::memory_order_acquire); }

    void setAmplitude(float amp) { targetAmplitude_.store(juce::jlimit(0.0f, 1.0f, amp), std::memory_order_release); }
    float getAmplitude() const { return targetAmplitude_.load(std::memory_order_acquire); }

    void setEnabled(bool enabled) { enabled_.store(enabled, std::memory_order_release); }
    bool isEnabled() const { return enabled_.load(std::memory_order_acquire); }

    void setStereoSpread(float spread) { stereoSpread_.store(juce::jlimit(0.0f, 1.0f, spread), std::memory_order_release); }
    float getStereoSpread() const { return stereoSpread_.load(std::memory_order_acquire); }

    void setUnison(int voices) { unisonVoices_.store(juce::jlimit(1, 8, voices), std::memory_order_release); }
    int getUnison() const { return unisonVoices_.load(std::memory_order_acquire); }

    void setDetune(float cents) { detuneCents_.store(juce::jlimit(0.0f, 100.0f, cents), std::memory_order_release); }
    float getDetune() const { return detuneCents_.load(std::memory_order_acquire); }

    void setDrive(float drive) { drive_.store(juce::jlimit(0.0f, 20.0f, drive), std::memory_order_release); }
    float getDrive() const { return drive_.load(std::memory_order_acquire); }

    void setDriveShape(int shape) { driveShape_.store(juce::jlimit(0, 3, shape), std::memory_order_release); }
    int getDriveShape() const { return driveShape_.load(std::memory_order_acquire); }

    void setDriveBias(float bias) { driveBias_.store(juce::jlimit(-1.0f, 1.0f, bias), std::memory_order_release); }
    float getDriveBias() const { return driveBias_.load(std::memory_order_acquire); }

    void setDriveMix(float mix) { driveMix_.store(juce::jlimit(0.0f, 1.0f, mix), std::memory_order_release); }
    float getDriveMix() const { return driveMix_.load(std::memory_order_acquire); }

    void setSyncEnabled(bool enabled) { syncEnabled_.store(enabled, std::memory_order_release); }
    bool isSyncEnabled() const { return syncEnabled_.load(std::memory_order_acquire); }

    void clearPartials();
    void setPartial(int index, float frequency, float amplitude, float phase = 0.0f, float decayRate = 0.0f);
    void setPartials(const PartialData& data);
    PartialData getPartials() const;
    int getActivePartialCount() const { return activePartials_.load(std::memory_order_acquire); }
    float getReferenceFundamental() const { return referenceFundamental_.load(std::memory_order_acquire); }

    void setSpectralMode(int mode) { spectralMode_.store(juce::jlimit(0, 2, mode), std::memory_order_release); }
    int getSpectralMode() const { return spectralMode_.load(std::memory_order_acquire); }
    void setSpectralSamplePlayback(const std::shared_ptr<SampleRegionPlaybackNode>& playback);
    void clearSpectralSamplePlayback();
    bool hasSpectralSamplePlayback() const;
    void setSpectralWaveform(int waveform) { spectralWaveform_.store(juce::jlimit(0, 7, waveform), std::memory_order_release); }
    int getSpectralWaveform() const { return spectralWaveform_.load(std::memory_order_acquire); }
    void setSpectralPulseWidth(float width) { spectralPulseWidth_.store(juce::jlimit(0.01f, 0.99f, width), std::memory_order_release); }
    float getSpectralPulseWidth() const { return spectralPulseWidth_.load(std::memory_order_acquire); }
    void setSpectralAdditivePartials(int count) { spectralAdditivePartials_.store(juce::jlimit(1, PartialData::kMaxPartials, count), std::memory_order_release); }
    int getSpectralAdditivePartials() const { return spectralAdditivePartials_.load(std::memory_order_acquire); }
    void setSpectralAdditiveTilt(float tilt) { spectralAdditiveTilt_.store(juce::jlimit(-1.0f, 1.0f, tilt), std::memory_order_release); }
    float getSpectralAdditiveTilt() const { return spectralAdditiveTilt_.load(std::memory_order_acquire); }
    void setSpectralAdditiveDrift(float drift) { spectralAdditiveDrift_.store(juce::jlimit(0.0f, 1.0f, drift), std::memory_order_release); }
    float getSpectralAdditiveDrift() const { return spectralAdditiveDrift_.load(std::memory_order_acquire); }
    void setSpectralMorphAmount(float amount) { spectralMorphAmount_.store(juce::jlimit(0.0f, 1.0f, amount), std::memory_order_release); }
    float getSpectralMorphAmount() const { return spectralMorphAmount_.load(std::memory_order_acquire); }
    void setSpectralMorphDepth(float depth) { spectralMorphDepth_.store(juce::jlimit(0.0f, 1.0f, depth), std::memory_order_release); }
    float getSpectralMorphDepth() const { return spectralMorphDepth_.load(std::memory_order_acquire); }
    void setSpectralMorphCurve(int curve) { spectralMorphCurve_.store(juce::jlimit(0, 2, curve), std::memory_order_release); }
    int getSpectralMorphCurve() const { return spectralMorphCurve_.load(std::memory_order_acquire); }
    void setSpectralTemporalPosition(float position) { spectralTemporalPosition_.store(juce::jlimit(0.0f, 1.0f, position), std::memory_order_release); }
    float getSpectralTemporalPosition() const { return spectralTemporalPosition_.load(std::memory_order_acquire); }
    void setSpectralTemporalSpeed(float speed) { spectralTemporalSpeed_.store(juce::jlimit(0.1f, 4.0f, speed), std::memory_order_release); }
    float getSpectralTemporalSpeed() const { return spectralTemporalSpeed_.load(std::memory_order_acquire); }
    void setSpectralTemporalSmooth(float smooth) { spectralTemporalSmooth_.store(juce::jlimit(0.0f, 1.0f, smooth), std::memory_order_release); }
    float getSpectralTemporalSmooth() const { return spectralTemporalSmooth_.load(std::memory_order_acquire); }
    void setSpectralTemporalContrast(float contrast) { spectralTemporalContrast_.store(juce::jlimit(0.0f, 2.0f, contrast), std::memory_order_release); }
    float getSpectralTemporalContrast() const { return spectralTemporalContrast_.load(std::memory_order_acquire); }
    void setSpectralEnvelopeFollow(float amount) { spectralEnvelopeFollow_.store(juce::jlimit(0.0f, 1.0f, amount), std::memory_order_release); }
    float getSpectralEnvelopeFollow() const { return spectralEnvelopeFollow_.load(std::memory_order_acquire); }
    void setSpectralStretch(float stretch) { spectralStretch_.store(juce::jlimit(0.0f, 1.0f, stretch), std::memory_order_release); }
    float getSpectralStretch() const { return spectralStretch_.load(std::memory_order_acquire); }
    void setSpectralTiltMode(int mode) { spectralTiltMode_.store(juce::jlimit(0, 2, mode), std::memory_order_release); }
    int getSpectralTiltMode() const { return spectralTiltMode_.load(std::memory_order_acquire); }
    void setSpectralAddFlavor(int flavor) { spectralAddFlavor_.store(juce::jlimit(0, 1, flavor), std::memory_order_release); }
    int getSpectralAddFlavor() const { return spectralAddFlavor_.load(std::memory_order_acquire); }

private:
    static constexpr int kMaxPartials = PartialData::kMaxPartials;
    static constexpr int kMaxUnisonVoices = 8;

    void refreshSpectralWaveRecipe();
    PartialData buildSpectralTargetPartials();

    std::atomic<float> targetFrequency_{440.0f};
    std::atomic<float> targetAmplitude_{0.0f};
    std::atomic<bool> enabled_{true};
    std::atomic<float> referenceFundamental_{440.0f};
    std::atomic<float> stereoSpread_{0.0f};
    std::atomic<int> activePartials_{0};
    std::atomic<int> unisonVoices_{1};
    std::atomic<float> detuneCents_{0.0f};
    std::atomic<float> drive_{0.0f};
    std::atomic<int> driveShape_{0};
    std::atomic<float> driveBias_{0.0f};
    std::atomic<float> driveMix_{1.0f};
    std::atomic<bool> syncEnabled_{false};
    std::atomic<int> spectralMode_{0};
    std::atomic<int> spectralWaveform_{1};
    std::atomic<float> spectralPulseWidth_{0.5f};
    std::atomic<int> spectralAdditivePartials_{8};
    std::atomic<float> spectralAdditiveTilt_{0.0f};
    std::atomic<float> spectralAdditiveDrift_{0.0f};
    std::atomic<float> spectralMorphAmount_{0.5f};
    std::atomic<float> spectralMorphDepth_{0.5f};
    std::atomic<int> spectralMorphCurve_{2};
    std::atomic<float> spectralTemporalPosition_{0.0f};
    std::atomic<float> spectralTemporalSpeed_{1.0f};
    std::atomic<float> spectralTemporalSmooth_{0.0f};
    std::atomic<float> spectralTemporalContrast_{0.5f};
    std::atomic<float> spectralEnvelopeFollow_{1.0f};
    std::atomic<float> spectralPhraseGain_{1.0f};
    std::atomic<float> spectralStretch_{0.0f};
    std::atomic<int> spectralTiltMode_{0};
    std::atomic<int> spectralAddFlavor_{0};

    std::array<float, kMaxPartials> partialFrequencies_{};
    std::array<float, kMaxPartials> partialAmplitudes_{};
    std::array<float, kMaxPartials> partialPhaseOffsets_{};
    std::array<float, kMaxPartials> partialDecayRates_{};
    std::array<std::array<double, kMaxPartials>, kMaxUnisonVoices> runningPhases_{};

    // Smoothed partial amplitudes to prevent clicks when partials change
    std::array<float, kMaxPartials> currentPartialAmplitudes_{};

    float currentFrequency_ = 440.0f;
    float currentAmplitude_ = 0.0f;
    float currentDetuneCents_ = 0.0f;
    float currentSpread_ = 0.0f;
    float freqSmoothingCoeff_ = 1.0f;
    float ampSmoothingCoeff_ = 1.0f;
    float detuneSmoothingCoeff_ = 1.0f;
    float spreadSmoothingCoeff_ = 1.0f;
    float unisonVoiceSmoothingCoeff_ = 1.0f;
    float partialAmpSmoothingCoeff_ = 1.0f;
    float phraseGainSmoothingCoeff_ = 1.0f;
    double sampleRate_ = 44100.0;
    bool prepared_ = false;
    float prevSyncSample_ = 0.0f;
    std::array<float, kMaxUnisonVoices> unisonVoiceGains_{{1.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f}};
    int lastRequestedUnison_ = 1;
    float currentSpectralPhraseGain_ = 1.0f;

    std::shared_ptr<SampleRegionPlaybackNode> spectralSamplePlayback_;
    PartialData spectralWaveRecipe_{};
    bool spectralWaveRecipeValid_ = false;
    int cachedSpectralWaveform_ = -1;
    int cachedSpectralPartials_ = -1;
    float cachedSpectralTilt_ = 0.0f;
    float cachedSpectralDrift_ = 0.0f;
    float cachedSpectralPulseWidth_ = 0.5f;
};

} // namespace dsp_primitives
