//Do not guard against multiple inclusions - Highway works by including this file multiple times, once for each SIMD implementation

#undef HWY_TARGET_INCLUDE
#define HWY_TARGET_INCLUDE "dsp/core/nodes/OscillatorNode_Highway.h"

#include "manifold/highway/HighwayWrapper.h"
#include "manifold/highway/HighwayMaths.h"

#include <algorithm>
#include <cmath>
#include <memory>

namespace dsp_primitives
{
    namespace OscillatorNode_Highway
    {
        namespace HWY_NAMESPACE
        {
            class OscillatorNodeSIMDImplementation : public IPrimitiveNodeSIMDImplementation
            {
            private:
                using FltType = hwy::HWY_NAMESPACE::VFromD<hwy::HWY_NAMESPACE::ScalableTag<float>>;
                using FltMaskType = hwy::HWY_NAMESPACE::MFromD<hwy::HWY_NAMESPACE::ScalableTag<float>>;

                struct AdditiveControls
                {
                    int partialCount = 8;
                    float tilt = 0.0f;
                    float drift = 0.0f;
                    int waveform = 0;
                };

            public:
                OscillatorNodeSIMDImplementation(float samplerate,
                                                 const std::atomic<float>* targetFrequency,
                                                 const std::atomic<float>* targetAmplitude,
                                                 const std::atomic<int>* targetWaveform,
                                                 const std::atomic<float>* targetPulseWidth,
                                                 const std::atomic<float>* targetDrive,
                                                 const std::atomic<int>* targetDriveShape,
                                                 const std::atomic<float>* targetDriveBias,
                                                 const std::atomic<float>* targetDriveMix,
                                                 const std::atomic<int>* targetRenderMode,
                                                 const std::atomic<int>* targetAdditivePartials,
                                                 const std::atomic<float>* targetAdditiveTilt,
                                                 const std::atomic<float>* targetAdditiveDrift,
                                                 const std::shared_ptr<const WaveAddTableSet>* targetWaveAddTableSet,
                                                 const std::atomic<int>* targetUnisonVoices,
                                                 const std::atomic<float>* targetDetuneCents,
                                                 const std::atomic<float>* targetStereoSpread)
                    : targetFrequency_(targetFrequency)
                    , targetAmplitude_(targetAmplitude)
                    , targetWaveform_(targetWaveform)
                    , targetPulseWidth_(targetPulseWidth)
                    , targetDrive_(targetDrive)
                    , targetDriveShape_(targetDriveShape)
                    , targetDriveBias_(targetDriveBias)
                    , targetDriveMix_(targetDriveMix)
                    , targetRenderMode_(targetRenderMode)
                    , targetAdditivePartials_(targetAdditivePartials)
                    , targetAdditiveTilt_(targetAdditiveTilt)
                    , targetAdditiveDrift_(targetAdditiveDrift)
                    , targetWaveAddTableSet_(targetWaveAddTableSet)
                    , targetUnisonVoices_(targetUnisonVoices)
                    , targetDetuneCents_(targetDetuneCents)
                    , targetStereoSpread_(targetStereoSpread)
                    , sampleRate_(samplerate > 1.0f ? samplerate : 44100.0f)
                {
                }

                const char* targetName() const override
                {
                    return hwy::TargetName(HWY_TARGET);
                }

                void configChanged() override
                {
                    configChanged_ = true;
                }

                void reset() override
                {
                    phase_ = 0.0;
                    for (double& phase : unisonPhases_)
                    {
                        phase = 0.0;
                    }

                    unisonVoiceGains_[0] = 1.0f;
                    for (int i = 1; i < 8; ++i)
                    {
                        unisonVoiceGains_[static_cast<size_t>(i)] = 0.0f;
                    }
                    lastRequestedUnison_ = 1;
                }

                HWY_ATTR void prepare(float sampleRate) override
                {
                    sampleRate_ = sampleRate > 1.0f ? sampleRate : 44100.0f;

                    const double sr = sampleRate_;
                    const double freqTimeSeconds = 0.02;
                    const double ampTimeSeconds = 0.01;
                    const double renderTimeSeconds = 0.008;
                    const double detuneTimeSeconds = 0.012;
                    const double spreadTimeSeconds = 0.012;
                    const double unisonVoiceTimeSeconds = 0.008;

                    freqSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (freqTimeSeconds * sr)));
                    ampSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (ampTimeSeconds * sr)));
                    renderMixSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (renderTimeSeconds * sr)));
                    detuneSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (detuneTimeSeconds * sr)));
                    spreadSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (spreadTimeSeconds * sr)));
                    unisonVoiceSmoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (unisonVoiceTimeSeconds * sr)));

                    freqSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, freqSmoothingCoeff_);
                    ampSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, ampSmoothingCoeff_);
                    renderMixSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, renderMixSmoothingCoeff_);
                    detuneSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, detuneSmoothingCoeff_);
                    spreadSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, spreadSmoothingCoeff_);
                    unisonVoiceSmoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, unisonVoiceSmoothingCoeff_);

                    currentFrequency_ = targetFrequency_->load(std::memory_order_acquire);
                    currentAmplitude_ = targetAmplitude_->load(std::memory_order_acquire);
                    currentRenderMix_ = targetRenderMode_->load(std::memory_order_acquire) == 1 ? 1.0f : 0.0f;
                    currentDetuneCents_ = targetDetuneCents_->load(std::memory_order_acquire);
                    currentSpread_ = targetStereoSpread_->load(std::memory_order_acquire);

                    const hwy::HWY_NAMESPACE::ScalableTag<float> d;
                    laneCount_ = hwy::HWY_NAMESPACE::Lanes(d);

                    phaseNormScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    phaseWorkScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    frequencyScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    amplitudeScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    renderMixScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    detuneScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    spreadScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    maxRatioScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    sampleScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    voiceGainScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    panLeftScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    panRightScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    outputLeftScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    outputRightScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    contributingVoicesScratch_ = hwy::AllocateAligned<int>(laneCount_);

                    reset();
                    configChanged_ = false;
                }

                HWY_ATTR void run(const std::vector<AudioBufferView>& /*inputs*/,
                                  std::vector<WritableAudioBufferView>& outputs,
                                  int numsamples) override
                {
                    if (outputs.empty() || numsamples <= 0)
                    {
                        return;
                    }

                    const hwy::HWY_NAMESPACE::ScalableTag<float> d;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const size_t numLanes = HWY::Lanes(d);

                    float* outputPtrL = outputs[0].channelData[0];
                    float* outputPtrR = outputs[0].numChannels > 1 ? outputs[0].channelData[1] : nullptr;

                    const int waveform = targetWaveform_->load(std::memory_order_acquire);
                    const float targetPulseWidth = targetPulseWidth_->load(std::memory_order_acquire);
                    const float drive = targetDrive_->load(std::memory_order_acquire);
                    const int driveShape = targetDriveShape_->load(std::memory_order_acquire);
                    const float driveBias = targetDriveBias_->load(std::memory_order_acquire);
                    const float driveMix = targetDriveMix_->load(std::memory_order_acquire);
                    const float targetFrequency = targetFrequency_->load(std::memory_order_acquire);
                    const float targetAmplitude = targetAmplitude_->load(std::memory_order_acquire);
                    const float targetRenderMix = targetRenderMode_->load(std::memory_order_acquire) == 1 ? 1.0f : 0.0f;
                    const int targetUnison = juce::jlimit(1, 8, targetUnisonVoices_->load(std::memory_order_acquire));
                    const float targetDetuneCents = targetDetuneCents_->load(std::memory_order_acquire);
                    const float targetSpread = targetStereoSpread_->load(std::memory_order_acquire);
                    const auto waveAddTables = std::atomic_load_explicit(targetWaveAddTableSet_, std::memory_order_acquire);

                    AdditiveControls additiveControls;
                    additiveControls.partialCount = juce::jlimit(1, 12, targetAdditivePartials_->load(std::memory_order_acquire));
                    additiveControls.tilt = juce::jlimit(-1.0f, 1.0f, targetAdditiveTilt_->load(std::memory_order_acquire));
                    additiveControls.drift = juce::jlimit(0.0f, 1.0f, targetAdditiveDrift_->load(std::memory_order_acquire));
                    additiveControls.waveform = waveform;

                    int layoutUnison = lastRequestedUnison_;
                    if (targetUnison > lastRequestedUnison_)
                    {
                        for (int v = lastRequestedUnison_; v < targetUnison; ++v)
                        {
                            unisonPhases_[static_cast<size_t>(v)] = phase_;
                            unisonVoiceGains_[static_cast<size_t>(v)] = 0.0f;
                        }
                        lastRequestedUnison_ = targetUnison;
                        layoutUnison = targetUnison;
                    }
                    else
                    {
                        layoutUnison = juce::jmax(targetUnison, lastRequestedUnison_);
                    }

                    const int voiceLimit = juce::jlimit(1, 8, layoutUnison);
                    const int placementCount = juce::jmax(1, layoutUnison);
                    const float placementCenter = (static_cast<float>(placementCount) - 1.0f) * 0.5f;

                    size_t offset = 0;
                    size_t samplesRemain = static_cast<size_t>(numsamples);
                    bool higherVoicesStillActive = false;

                    while (samplesRemain > 0)
                    {
                        const size_t lanesThisBlock = samplesRemain > numLanes ? numLanes : samplesRemain;

                        std::fill_n(phaseNormScratch_.get(), numLanes, 0.0f);
                        std::fill_n(phaseWorkScratch_.get(), numLanes, 0.0f);
                        std::fill_n(frequencyScratch_.get(), numLanes, 0.0f);
                        std::fill_n(amplitudeScratch_.get(), numLanes, 0.0f);
                        std::fill_n(renderMixScratch_.get(), numLanes, 0.0f);
                        std::fill_n(detuneScratch_.get(), numLanes, 0.0f);
                        std::fill_n(spreadScratch_.get(), numLanes, 0.0f);
                        std::fill_n(maxRatioScratch_.get(), numLanes, 1.0f);
                        std::fill_n(sampleScratch_.get(), numLanes, 0.0f);
                        std::fill_n(voiceGainScratch_.get(), numLanes, 0.0f);
                        std::fill_n(panLeftScratch_.get(), numLanes, 0.0f);
                        std::fill_n(panRightScratch_.get(), numLanes, 0.0f);
                        std::fill_n(outputLeftScratch_.get(), numLanes, 0.0f);
                        std::fill_n(outputRightScratch_.get(), numLanes, 0.0f);
                        std::fill_n(contributingVoicesScratch_.get(), numLanes, 0);

                        bool blockNeedStandard = false;
                        bool blockNeedAdditive = false;
                        bool blockNeedBlend = false;
                        for (size_t lane = 0; lane < lanesThisBlock; ++lane)
                        {
                            currentFrequency_ += (targetFrequency - currentFrequency_) * freqSmoothingCoeff_;
                            currentAmplitude_ += (targetAmplitude - currentAmplitude_) * ampSmoothingCoeff_;
                            currentRenderMix_ += (targetRenderMix - currentRenderMix_) * renderMixSmoothingCoeff_;
                            currentDetuneCents_ += (targetDetuneCents - currentDetuneCents_) * detuneSmoothingCoeff_;
                            currentSpread_ += (targetSpread - currentSpread_) * spreadSmoothingCoeff_;

                            frequencyScratch_[lane] = currentFrequency_;
                            amplitudeScratch_[lane] = currentAmplitude_;
                            renderMixScratch_[lane] = juce::jlimit(0.0f, 1.0f, currentRenderMix_);
                            detuneScratch_[lane] = currentDetuneCents_;
                            spreadScratch_[lane] = currentSpread_;

                            if (renderMixScratch_[lane] > 0.0001f)
                            {
                                blockNeedAdditive = true;
                            }
                            if (renderMixScratch_[lane] < 0.9999f)
                            {
                                blockNeedStandard = true;
                            }
                            if (renderMixScratch_[lane] > 0.0001f && renderMixScratch_[lane] < 0.9999f)
                            {
                                blockNeedBlend = true;
                            }
                        }

                        FltType outputLeftV = HWY::Zero(d);
                        FltType outputRightV = HWY::Zero(d);
                        higherVoicesStillActive = false;

                        for (int v = 0; v < voiceLimit; ++v)
                        {
                            std::fill_n(phaseNormScratch_.get(), numLanes, 0.0f);
                            std::fill_n(maxRatioScratch_.get(), numLanes, 1.0f);
                            std::fill_n(sampleScratch_.get(), numLanes, 0.0f);
                            std::fill_n(voiceGainScratch_.get(), numLanes, 0.0f);
                            std::fill_n(panLeftScratch_.get(), numLanes, 0.0f);
                            std::fill_n(panRightScratch_.get(), numLanes, 0.0f);

                            const size_t voiceSlot = static_cast<size_t>(v);
                            const float targetVoiceGain = (v < targetUnison) ? 1.0f : 0.0f;
                            const float voiceOffset = static_cast<float>(v) - placementCenter;
                            double& voicePhase = (v == 0) ? phase_ : unisonPhases_[voiceSlot];

                            for (size_t lane = 0; lane < lanesThisBlock; ++lane)
                            {
                                unisonVoiceGains_[voiceSlot] += (targetVoiceGain - unisonVoiceGains_[voiceSlot]) * unisonVoiceSmoothingCoeff_;
                                const float voiceGain = unisonVoiceGains_[voiceSlot];

                                if ((v >= targetUnison) && (voiceGain > 1.0e-4f))
                                {
                                    higherVoicesStillActive = true;
                                }

                                if (voiceGain <= 1.0e-4f)
                                {
                                    continue;
                                }

                                contributingVoicesScratch_[lane] += 1;
                                voiceGainScratch_[lane] = voiceGain;
                                phaseNormScratch_[lane] = static_cast<float>(voicePhase / kTwoPi);

                                const float detuneAmount = voiceOffset * detuneScratch_[lane] / 100.0f;
                                const double freqMult = std::pow(2.0, static_cast<double>(detuneAmount) / 12.0);
                                const float voiceFrequency = frequencyScratch_[lane] * static_cast<float>(freqMult);
                                maxRatioScratch_[lane] = std::max(1.0f,
                                                                  static_cast<float>((sampleRate_ * 0.475f)
                                                                      / std::max(1.0f, std::abs(voiceFrequency))));
                                const double voicePhaseInc = (kTwoPi * static_cast<double>(frequencyScratch_[lane])
                                                            / static_cast<double>(sampleRate_)) * freqMult;

                                const float pan = juce::jlimit(0.0f,
                                                               1.0f,
                                                               0.5f + voiceOffset * spreadScratch_[lane]
                                                                   / static_cast<float>(juce::jmax(1, placementCount)));
                                panLeftScratch_[lane] = std::sqrt(1.0f - pan);
                                panRightScratch_[lane] = std::sqrt(pan);

                                voicePhase += voicePhaseInc;
                                while (voicePhase >= kTwoPi)
                                {
                                    voicePhase -= kTwoPi;
                                }
                                while (voicePhase < 0.0)
                                {
                                    voicePhase += kTwoPi;
                                }
                            }

                            const FltType phaseNormV = HWY::LoadU(d, phaseNormScratch_.get());
                            FltType sampleV = HWY::Zero(d);
                            if (blockNeedBlend)
                            {
                                const FltType renderMixV = HWY::LoadU(d, renderMixScratch_.get());
                                const FltType standardV = renderStandardWaveform(d, phaseNormV, waveform, targetPulseWidth);
                                const FltType additiveV = renderAdditiveWaveform(d, phaseNormV, waveform, targetPulseWidth,
                                                                                  additiveControls, maxRatioScratch_.get(), waveAddTables);
                                sampleV = HWY::Mul(HWY::Sub(additiveV, standardV), renderMixV);
                                sampleV = HWY::Add(standardV, sampleV);
                            }
                            else if (blockNeedAdditive)
                            {
                                sampleV = renderAdditiveWaveform(d, phaseNormV, waveform, targetPulseWidth,
                                                                 additiveControls, maxRatioScratch_.get(), waveAddTables);
                            }
                            else if (blockNeedStandard)
                            {
                                sampleV = renderStandardWaveform(d, phaseNormV, waveform, targetPulseWidth);
                            }

                            HWY::StoreU(sampleV, d, sampleScratch_.get());
                            for (size_t lane = 0; lane < lanesThisBlock; ++lane)
                            {
                                if (voiceGainScratch_[lane] <= 1.0e-4f)
                                {
                                    sampleScratch_[lane] = 0.0f;
                                    continue;
                                }

                                float sample = applyDrive(sampleScratch_[lane], drive, driveShape, driveBias, driveMix);
                                if (!std::isfinite(sample))
                                {
                                    sample = 0.0f;
                                }
                                sampleScratch_[lane] = sample * voiceGainScratch_[lane];
                            }

                            sampleV = HWY::LoadU(d, sampleScratch_.get());
                            const FltType panLeftV = HWY::LoadU(d, panLeftScratch_.get());
                            const FltType panRightV = HWY::LoadU(d, panRightScratch_.get());

                            outputLeftV = HWY::Add(outputLeftV, HWY::Mul(sampleV, panLeftV));
                            outputRightV = HWY::Add(outputRightV, HWY::Mul(sampleV, panRightV));
                        }

                        HWY::StoreU(outputLeftV, d, outputLeftScratch_.get());
                        HWY::StoreU(outputRightV, d, outputRightScratch_.get());

                        for (size_t lane = 0; lane < lanesThisBlock; ++lane)
                        {
                            const int contributingVoices = contributingVoicesScratch_[lane];
                            const float normGain = (contributingVoices > 0)
                                ? (1.0f / std::sqrt(static_cast<float>(contributingVoices))) * amplitudeScratch_[lane]
                                : 0.0f;

                            float leftSample = outputLeftScratch_[lane] * normGain;
                            float rightSample = outputRightScratch_[lane] * normGain;
                            if (!std::isfinite(leftSample))
                            {
                                leftSample = 0.0f;
                            }
                            if (!std::isfinite(rightSample))
                            {
                                rightSample = 0.0f;
                            }

                            outputLeftScratch_[lane] = leftSample;
                            outputRightScratch_[lane] = rightSample;
                        }

                        outputLeftV = HWY::LoadU(d, outputLeftScratch_.get());
                        outputRightV = HWY::LoadU(d, outputRightScratch_.get());

                        if (lanesThisBlock == numLanes)
                        {
                            if (outputPtrR != nullptr)
                            {
                                HWY::StoreU(outputLeftV, d, outputPtrL + offset);
                                HWY::StoreU(outputRightV, d, outputPtrR + offset);
                            }
                            else
                            {
                                const FltType monoV = HWY::Mul(HWY::Add(outputLeftV, outputRightV), HWY::Set(d, 0.5f));
                                HWY::StoreU(monoV, d, outputPtrL + offset);
                            }
                        }
                        else
                        {
                            const FltMaskType mask = HWY::FirstN(d, lanesThisBlock);
                            if (outputPtrR != nullptr)
                            {
                                HWY::BlendedStore(outputLeftV, mask, d, outputPtrL + offset);
                                HWY::BlendedStore(outputRightV, mask, d, outputPtrR + offset);
                            }
                            else
                            {
                                const FltType monoV = HWY::Mul(HWY::Add(outputLeftV, outputRightV), HWY::Set(d, 0.5f));
                                HWY::BlendedStore(monoV, mask, d, outputPtrL + offset);
                            }
                        }

                        samplesRemain -= lanesThisBlock;
                        offset += lanesThisBlock;
                    }

                    if (!higherVoicesStillActive)
                    {
                        lastRequestedUnison_ = targetUnison;
                    }
                }

            private:
                HWY_ATTR static FltType clampUnit(const hwy::HWY_NAMESPACE::ScalableTag<float>& d, FltType value)
                {
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const FltType one = HWY::Set(d, 1.0f);
                    const FltType negOne = HWY::Set(d, -1.0f);
                    value = HWY::IfThenElse(HWY::Gt(value, one), one, value);
                    value = HWY::IfThenElse(HWY::Lt(value, negOne), negOne, value);
                    return value;
                }

                HWY_ATTR static FltType divideOrZero(const hwy::HWY_NAMESPACE::ScalableTag<float>& d,
                                                     FltType numerator,
                                                     FltType denominator)
                {
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const FltType eps = HWY::Set(d, 1.0e-6f);
                    const FltMaskType valid = HWY::Gt(denominator, eps);
                    const FltType divided = HWY::Div(numerator, denominator);
                    return HWY::IfThenElse(valid, divided, HWY::Zero(d));
                }

                HWY_ATTR FltType renderStandardWaveform(const hwy::HWY_NAMESPACE::ScalableTag<float>& d,
                                                        FltType phaseNorm,
                                                        int waveform,
                                                        float pulseWidth) const
                {
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const FltType one = HWY::Set(d, 1.0f);
                    const FltType negOne = HWY::Neg(one);
                    const FltType half = HWY::Set(d, 0.5f);
                    const FltType two = HWY::Add(one, one);
                    const FltType four = HWY::Add(two, two);
                    const FltType phaseRadians = HWY::Mul(phaseNorm, HWY::Set(d, static_cast<float>(kTwoPi)));

                    FltType sine;
                    FltType cosine;
                    HWY::SinCos(d, phaseRadians, sine, cosine);
                    const FltType saw = HWY::Sub(HWY::Mul(phaseNorm, two), one);
                    const FltType square = HWY::IfThenElse(HWY::Gt(sine, HWY::Zero(d)), one, negOne);
                    const FltType triangle = HWY::Sub(one, HWY::Mul(four, HWY::Abs(HWY::Sub(phaseNorm, half))));
                    const FltType pulse = HWY::IfThenElse(HWY::Lt(phaseNorm, HWY::Set(d, pulseWidth)), one, negOne);

                    switch (waveform)
                    {
                        case 0: return sine;
                        case 1: return saw;
                        case 2: return square;
                        case 3: return triangle;
                        case 4: return HWY::Add(HWY::Mul(sine, HWY::Set(d, 0.45f)), HWY::Mul(saw, HWY::Set(d, 0.55f)));
                        case 6: return pulse;
                        case 7:
                        {
                            HWY::StoreU(phaseNorm, d, phaseWorkScratch_.get());
                            for (size_t lane = 0; lane < laneCount_; ++lane)
                            {
                                const float phase = phaseWorkScratch_[lane];
                                const float s1 = 2.0f * phase - 1.0f;
                                const float s2 = 2.0f * std::fmod(phase * 1.01f, 1.0f) - 1.0f;
                                const float s3 = 2.0f * std::fmod(phase * 0.99f, 1.0f) - 1.0f;
                                phaseWorkScratch_[lane] = (s1 + s2 * 0.5f + s3 * 0.5f) * 0.5f;
                            }
                            return HWY::LoadU(d, phaseWorkScratch_.get());
                        }
                        default: return sine;
                    }
                }

                HWY_ATTR void addShapedPartialSample(const hwy::HWY_NAMESPACE::ScalableTag<float>& d,
                                                     FltType phaseNorm,
                                                     FltType maxRatio,
                                                     double ratio,
                                                     float amplitude,
                                                     double phaseOffset,
                                                     const AdditiveControls& controls,
                                                     FltType& sum,
                                                     FltType& amplitudeSum) const
                {
                    namespace HWY = hwy::HWY_NAMESPACE;
                    if (amplitude <= 1.0e-6f)
                    {
                        return;
                    }

                    const double safeRatio = std::max(0.1, ratio);
                    const float tiltScale = std::max(0.12f, std::pow(static_cast<float>(safeRatio), controls.tilt * 0.85f));
                    const double ratioJitter = std::sin(safeRatio * 2.173 + static_cast<double>(controls.waveform) * 0.53);
                    const double phaseJitter = std::sin(safeRatio * 1.618 + static_cast<double>(controls.waveform) * 0.37);
                    const double driftRatio = 1.0 + ratioJitter * static_cast<double>(controls.drift) * 0.035 * (1.0 + safeRatio * 0.05);
                    const double shapedRatio = std::max(0.1, safeRatio * driftRatio);
                    const double shapedPhase = phaseOffset + phaseJitter * static_cast<double>(controls.drift) * 0.85;
                    const float shapedAmplitude = amplitude * tiltScale;
                    const FltMaskType include = HWY::Ge(maxRatio, HWY::Set(d, static_cast<float>(safeRatio)));

                    if (HWY::AllFalse(d, include))
                    {
                        return;
                    }

                    const FltType phase = HWY::MulAdd(phaseNorm,
                                                      HWY::Set(d, static_cast<float>(kTwoPi * shapedRatio)),
                                                      HWY::Set(d, static_cast<float>(shapedPhase)));
                    FltType sine;
                    FltType cosine;
                    HWY::SinCos(d, phase, sine, cosine);
                    const FltType amp = HWY::Set(d, shapedAmplitude);
                    sum = HWY::IfThenElse(include, HWY::MulAdd(sine, amp, sum), sum);
                    amplitudeSum = HWY::IfThenElse(include, HWY::Add(amplitudeSum, amp), amplitudeSum);
                }

                HWY_ATTR FltType additiveSaw(const hwy::HWY_NAMESPACE::ScalableTag<float>& d,
                                             FltType phaseNorm,
                                             FltType maxRatio,
                                             const AdditiveControls& controls) const
                {
                    namespace HWY = hwy::HWY_NAMESPACE;
                    FltType sum = HWY::Zero(d);
                    FltType amplitudeSum = HWY::Zero(d);

                    for (int harmonic = 1; harmonic <= controls.partialCount; ++harmonic)
                    {
                        const bool negative = (harmonic % 2) == 0;
                        addShapedPartialSample(d,
                                               phaseNorm,
                                               maxRatio,
                                               static_cast<double>(harmonic),
                                               1.0f / static_cast<float>(harmonic),
                                               negative ? M_PI : 0.0,
                                               controls,
                                               sum,
                                               amplitudeSum);
                    }

                    return divideOrZero(d, sum, amplitudeSum);
                }

                HWY_ATTR FltType additiveSquare(const hwy::HWY_NAMESPACE::ScalableTag<float>& d,
                                                FltType phaseNorm,
                                                FltType maxRatio,
                                                const AdditiveControls& controls) const
                {
                    namespace HWY = hwy::HWY_NAMESPACE;
                    FltType sum = HWY::Zero(d);
                    FltType amplitudeSum = HWY::Zero(d);
                    int added = 0;
                    for (int harmonic = 1; (harmonic <= 23) && (added < controls.partialCount); harmonic += 2, ++added)
                    {
                        addShapedPartialSample(d,
                                               phaseNorm,
                                               maxRatio,
                                               static_cast<double>(harmonic),
                                               1.0f / static_cast<float>(harmonic),
                                               0.0,
                                               controls,
                                               sum,
                                               amplitudeSum);
                    }

                    return divideOrZero(d, sum, amplitudeSum);
                }

                HWY_ATTR FltType additiveTriangle(const hwy::HWY_NAMESPACE::ScalableTag<float>& d,
                                                  FltType phaseNorm,
                                                  FltType maxRatio,
                                                  const AdditiveControls& controls) const
                {
                    namespace HWY = hwy::HWY_NAMESPACE;
                    FltType sum = HWY::Zero(d);
                    FltType amplitudeSum = HWY::Zero(d);
                    int added = 0;
                    for (int harmonic = 1; (harmonic <= 23) && (added < controls.partialCount); harmonic += 2, ++added)
                    {
                        const bool positiveCosine = ((harmonic / 2) % 2) == 1;
                        addShapedPartialSample(d,
                                               phaseNorm,
                                               maxRatio,
                                               static_cast<double>(harmonic),
                                               1.0f / static_cast<float>(harmonic * harmonic),
                                               positiveCosine ? (M_PI * 0.5) : (-M_PI * 0.5),
                                               controls,
                                               sum,
                                               amplitudeSum);
                    }

                    return divideOrZero(d, sum, amplitudeSum);
                }

                HWY_ATTR FltType additiveBlend(const hwy::HWY_NAMESPACE::ScalableTag<float>& d,
                                               FltType phaseNorm,
                                               FltType maxRatio,
                                               const AdditiveControls& controls) const
                {
                    namespace HWY = hwy::HWY_NAMESPACE;
                    FltType sine;
                    FltType cosine;
                    HWY::SinCos(d, HWY::Mul(phaseNorm, HWY::Set(d, static_cast<float>(kTwoPi))), sine, cosine);
                    const FltType saw = additiveSaw(d, phaseNorm, maxRatio, controls);
                    return clampUnit(d, HWY::MulAdd(saw, HWY::Set(d, 0.55f), HWY::Mul(sine, HWY::Set(d, 0.45f))));
                }

                HWY_ATTR FltType additivePulse(const hwy::HWY_NAMESPACE::ScalableTag<float>& d,
                                               FltType phaseNorm,
                                               FltType maxRatio,
                                               float pulseWidth,
                                               const AdditiveControls& controls) const
                {
                    namespace HWY = hwy::HWY_NAMESPACE;
                    FltType sum = HWY::Zero(d);
                    FltType amplitudeSum = HWY::Zero(d);
                    const float width = juce::jlimit(0.01f, 0.99f, pulseWidth);
                    for (int harmonic = 1; harmonic <= controls.partialCount; ++harmonic)
                    {
                        const float coeff = std::sin(static_cast<float>(M_PI) * static_cast<float>(harmonic) * width);
                        addShapedPartialSample(d,
                                               phaseNorm,
                                               maxRatio,
                                               static_cast<double>(harmonic),
                                               std::abs(coeff) / static_cast<float>(harmonic),
                                               coeff < 0.0f ? M_PI : 0.0,
                                               controls,
                                               sum,
                                               amplitudeSum);
                    }

                    return divideOrZero(d, sum, amplitudeSum);
                }

                HWY_ATTR FltType additiveSuperSaw(const hwy::HWY_NAMESPACE::ScalableTag<float>& d,
                                                  FltType phaseNorm,
                                                  FltType maxRatio,
                                                  const AdditiveControls& controls) const
                {
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const int layerLimit = juce::jlimit(1, 5, controls.partialCount);
                    FltType sum = HWY::Zero(d);
                    float amplitudeSum = 0.0f;

                    for (int layer = 0; layer < layerLimit; ++layer)
                    {
                        float detuneCents = 0.0f;
                        float gain = 1.0f;
                        double phaseOffset = 0.0;
                        switch (layer)
                        {
                            case 0: detuneCents = -18.0f; gain = 0.55f; phaseOffset = 0.17; break;
                            case 1: detuneCents = -7.0f;  gain = 0.82f; phaseOffset = 0.51; break;
                            case 2: detuneCents = 0.0f;   gain = 1.00f; phaseOffset = 0.00; break;
                            case 3: detuneCents = 8.0f;   gain = 0.79f; phaseOffset = 0.33; break;
                            case 4: detuneCents = 19.0f;  gain = 0.50f; phaseOffset = 0.74; break;
                        }

                        const double detuneRatio = std::pow(2.0, static_cast<double>(detuneCents) / 1200.0);
                        HWY::StoreU(phaseNorm, d, phaseWorkScratch_.get());
                        HWY::StoreU(maxRatio, d, maxRatioScratch_.get());
                        for (size_t lane = 0; lane < laneCount_; ++lane)
                        {
                            float layerPhase = phaseWorkScratch_[lane] * static_cast<float>(detuneRatio)
                                + static_cast<float>(phaseOffset / kTwoPi);
                            layerPhase -= std::floor(layerPhase);
                            if (layerPhase < 0.0f)
                            {
                                layerPhase += 1.0f;
                            }
                            phaseWorkScratch_[lane] = layerPhase;
                            maxRatioScratch_[lane] = std::max(1.0f, maxRatioScratch_[lane] / static_cast<float>(detuneRatio));
                        }

                        const FltType layerPhase = HWY::LoadU(d, phaseWorkScratch_.get());
                        const FltType layerMaxRatio = HWY::LoadU(d, maxRatioScratch_.get());
                        const FltType layerSample = additiveSaw(d, layerPhase, layerMaxRatio, controls);
                        sum = HWY::Add(sum, HWY::Mul(layerSample, HWY::Set(d, gain)));
                        amplitudeSum += gain;
                    }

                    return amplitudeSum > 1.0e-6f ? HWY::Mul(sum, HWY::Set(d, 1.0f / amplitudeSum)) : HWY::Zero(d);
                }

                HWY_ATTR FltType renderAdditiveWaveform(const hwy::HWY_NAMESPACE::ScalableTag<float>& d,
                                                        FltType phaseNorm,
                                                        int waveform,
                                                        float pulseWidth,
                                                        const AdditiveControls& controls,
                                                        const float* maxRatioPtr,
                                                        const std::shared_ptr<const WaveAddTableSet>& waveAddTables) const
                {
                    namespace HWY = hwy::HWY_NAMESPACE;

                    if (waveAddTables)
                    {
                        HWY::StoreU(phaseNorm, d, phaseWorkScratch_.get());
                        for (size_t lane = 0; lane < laneCount_; ++lane)
                        {
                            const float ratio = std::max(1.0f, maxRatioPtr[lane]);
                            const int ratioBucket = static_cast<int>(std::floor(std::min(ratio, 20.0f)));
                            const int bandIndex = juce::jlimit(0, 19, ratioBucket - 1);
                            sampleScratch_[lane] = lookupWaveAddSample(*waveAddTables, phaseWorkScratch_[lane], bandIndex);
                        }

                        FltType sample = HWY::LoadU(d, sampleScratch_.get());
                        const float trim = additiveOutputTrim(waveform);
                        const float tiltComp = 1.0f + juce::jlimit(-0.12f, 0.10f, controls.tilt * -0.10f);
                        const float driftComp = 1.0f - controls.drift * 0.08f;
                        return clampUnit(d, HWY::Mul(sample, HWY::Set(d, trim * tiltComp * driftComp)));
                    }

                    const FltType maxRatio = HWY::LoadU(d, maxRatioPtr);
                    FltType sample;
                    switch (waveform)
                    {
                        case 0:
                        {
                            FltType sine;
                            FltType cosine;
                            HWY::SinCos(d, HWY::Mul(phaseNorm, HWY::Set(d, static_cast<float>(kTwoPi))), sine, cosine);
                            sample = sine;
                            break;
                        }
                        case 1:
                            sample = additiveSaw(d, phaseNorm, maxRatio, controls);
                            break;
                        case 2:
                            sample = additiveSquare(d, phaseNorm, maxRatio, controls);
                            break;
                        case 3:
                            sample = additiveTriangle(d, phaseNorm, maxRatio, controls);
                            break;
                        case 4:
                            sample = additiveBlend(d, phaseNorm, maxRatio, controls);
                            break;
                        case 6:
                            sample = additivePulse(d, phaseNorm, maxRatio, pulseWidth, controls);
                            break;
                        case 7:
                            sample = additiveSuperSaw(d, phaseNorm, maxRatio, controls);
                            break;
                        default:
                        {
                            FltType sine;
                            FltType cosine;
                            HWY::SinCos(d, HWY::Mul(phaseNorm, HWY::Set(d, static_cast<float>(kTwoPi))), sine, cosine);
                            sample = sine;
                            break;
                        }
                    }

                    const float trim = additiveOutputTrim(waveform);
                    const float tiltComp = 1.0f + juce::jlimit(-0.12f, 0.10f, controls.tilt * -0.10f);
                    const float driftComp = 1.0f - controls.drift * 0.08f;
                    return clampUnit(d, HWY::Mul(sample, HWY::Set(d, trim * tiltComp * driftComp)));
                }

                HWY_ATTR static float additiveOutputTrim(int waveform)
                {
                    switch (waveform)
                    {
                        case 1: return 0.96f;
                        case 2: return 0.98f;
                        case 3: return 1.06f;
                        case 4: return 0.94f;
                        case 6: return 1.00f;
                        case 7: return 0.84f;
                        case 0:
                        default:
                            return 1.0f;
                    }
                }

                HWY_ATTR static float foldToUnit(float value)
                {
                    value = juce::jlimit(-32.0f, 32.0f, value);
                    while (value > 1.0f || value < -1.0f)
                    {
                        if (value > 1.0f)
                        {
                            value = 2.0f - value;
                        }
                        else
                        {
                            value = -2.0f - value;
                        }
                    }
                    return value;
                }

                HWY_ATTR static float applyDriveTransfer(float sample, float drive, int shape)
                {
                    const float drv = juce::jlimit(0.0f, 20.0f, drive);
                    if (drv <= 0.0001f)
                    {
                        return juce::jlimit(-1.0f, 1.0f, sample);
                    }

                    switch (juce::jlimit(0, 3, shape))
                    {
                        case 1:
                        {
                            const float gain = 1.0f + drv * 1.35f;
                            const float normaliser = std::atan(gain);
                            if (normaliser <= 1.0e-6f)
                            {
                                return juce::jlimit(-1.0f, 1.0f, sample);
                            }
                            return std::atan(sample * gain) / normaliser;
                        }
                        case 2:
                        {
                            const float gain = 1.0f + drv * 1.2f;
                            return juce::jlimit(-1.0f, 1.0f, sample * gain);
                        }
                        case 3:
                        {
                            const float gain = 1.0f + drv * 1.1f;
                            return foldToUnit(sample * gain);
                        }
                        case 0:
                        default:
                        {
                            const float gain = 1.0f + drv * 0.85f;
                            const float normaliser = std::tanh(gain);
                            if (normaliser <= 1.0e-6f)
                            {
                                return juce::jlimit(-1.0f, 1.0f, sample);
                            }
                            return std::tanh(sample * gain) / normaliser;
                        }
                    }
                }

                HWY_ATTR static float applyDrive(float sample, float drive, int shape, float bias, float mix)
                {
                    const float drv = juce::jlimit(0.0f, 20.0f, drive);
                    const float wetMix = juce::jlimit(0.0f, 1.0f, mix);
                    if (drv <= 0.0001f || wetMix <= 0.0001f)
                    {
                        return juce::jlimit(-1.0f, 1.0f, sample);
                    }

                    const float biasOffset = juce::jlimit(-1.0f, 1.0f, bias) * 0.75f;
                    const float center = applyDriveTransfer(biasOffset, drv, shape);
                    const float pos = std::abs(applyDriveTransfer(1.0f + biasOffset, drv, shape) - center);
                    const float neg = std::abs(applyDriveTransfer(-1.0f + biasOffset, drv, shape) - center);
                    const float normaliser = std::max(1.0e-6f, std::max(pos, neg));
                    const float shaped = (applyDriveTransfer(sample + biasOffset, drv, shape) - center) / normaliser;
                    const float wet = juce::jlimit(-1.0f, 1.0f, shaped);
                    return juce::jlimit(-1.0f, 1.0f, sample + (wet - sample) * wetMix);
                }

                const std::atomic<float>* targetFrequency_;
                const std::atomic<float>* targetAmplitude_;
                const std::atomic<int>* targetWaveform_;
                const std::atomic<float>* targetPulseWidth_;
                const std::atomic<float>* targetDrive_;
                const std::atomic<int>* targetDriveShape_;
                const std::atomic<float>* targetDriveBias_;
                const std::atomic<float>* targetDriveMix_;
                const std::atomic<int>* targetRenderMode_;
                const std::atomic<int>* targetAdditivePartials_;
                const std::atomic<float>* targetAdditiveTilt_;
                const std::atomic<float>* targetAdditiveDrift_;
                const std::shared_ptr<const WaveAddTableSet>* targetWaveAddTableSet_;
                const std::atomic<int>* targetUnisonVoices_;
                const std::atomic<float>* targetDetuneCents_;
                const std::atomic<float>* targetStereoSpread_;

                double phase_ = 0.0;
                float sampleRate_ = 44100.0f;
                float currentFrequency_ = 440.0f;
                float currentAmplitude_ = 0.5f;
                float currentRenderMix_ = 0.0f;
                float currentDetuneCents_ = 0.0f;
                float currentSpread_ = 0.0f;
                float freqSmoothingCoeff_ = 1.0f;
                float ampSmoothingCoeff_ = 1.0f;
                float renderMixSmoothingCoeff_ = 1.0f;
                float detuneSmoothingCoeff_ = 1.0f;
                float spreadSmoothingCoeff_ = 1.0f;
                float unisonVoiceSmoothingCoeff_ = 1.0f;
                bool configChanged_ = false;
                size_t laneCount_ = 0;

                double unisonPhases_[8] = {0.0};
                float unisonVoiceGains_[8] = {1.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f, 0.0f};
                int lastRequestedUnison_ = 1;

                hwy::AlignedFreeUniquePtr<float[]> phaseNormScratch_;
                hwy::AlignedFreeUniquePtr<float[]> phaseWorkScratch_;
                hwy::AlignedFreeUniquePtr<float[]> frequencyScratch_;
                hwy::AlignedFreeUniquePtr<float[]> amplitudeScratch_;
                hwy::AlignedFreeUniquePtr<float[]> renderMixScratch_;
                hwy::AlignedFreeUniquePtr<float[]> detuneScratch_;
                hwy::AlignedFreeUniquePtr<float[]> spreadScratch_;
                hwy::AlignedFreeUniquePtr<float[]> maxRatioScratch_;
                hwy::AlignedFreeUniquePtr<float[]> sampleScratch_;
                hwy::AlignedFreeUniquePtr<float[]> voiceGainScratch_;
                hwy::AlignedFreeUniquePtr<float[]> panLeftScratch_;
                hwy::AlignedFreeUniquePtr<float[]> panRightScratch_;
                hwy::AlignedFreeUniquePtr<float[]> outputLeftScratch_;
                hwy::AlignedFreeUniquePtr<float[]> outputRightScratch_;
                hwy::AlignedFreeUniquePtr<int[]> contributingVoicesScratch_;

                static constexpr double kTwoPi = 2.0 * M_PI;
            };

            HWY_API IPrimitiveNodeSIMDImplementation* __CreateInstanceForCPU(float samplerate,
                                                                             const std::atomic<float>* targetFrequency,
                                                                             const std::atomic<float>* targetAmplitude,
                                                                             const std::atomic<int>* targetWaveform,
                                                                             const std::atomic<float>* targetPulseWidth,
                                                                             const std::atomic<float>* targetDrive,
                                                                             const std::atomic<int>* targetDriveShape,
                                                                             const std::atomic<float>* targetDriveBias,
                                                                             const std::atomic<float>* targetDriveMix,
                                                                             const std::atomic<int>* targetRenderMode,
                                                                             const std::atomic<int>* targetAdditivePartials,
                                                                             const std::atomic<float>* targetAdditiveTilt,
                                                                             const std::atomic<float>* targetAdditiveDrift,
                                                                             const std::shared_ptr<const WaveAddTableSet>* targetWaveAddTableSet,
                                                                             const std::atomic<int>* targetUnisonVoices,
                                                                             const std::atomic<float>* targetDetuneCents,
                                                                             const std::atomic<float>* targetStereoSpread)
            {
                return new OscillatorNodeSIMDImplementation(samplerate,
                                                            targetFrequency,
                                                            targetAmplitude,
                                                            targetWaveform,
                                                            targetPulseWidth,
                                                            targetDrive,
                                                            targetDriveShape,
                                                            targetDriveBias,
                                                            targetDriveMix,
                                                            targetRenderMode,
                                                            targetAdditivePartials,
                                                            targetAdditiveTilt,
                                                            targetAdditiveDrift,
                                                            targetWaveAddTableSet,
                                                            targetUnisonVoices,
                                                            targetDetuneCents,
                                                            targetStereoSpread);
            }
        }

        #if HWY_ONCE || HWY_IDE

            IPrimitiveNodeSIMDImplementation* __CreateInstance(float samplerate,
                                                               const std::atomic<float>* targetFrequency,
                                                               const std::atomic<float>* targetAmplitude,
                                                               const std::atomic<int>* targetWaveform,
                                                               const std::atomic<float>* targetPulseWidth,
                                                               const std::atomic<float>* targetDrive,
                                                               const std::atomic<int>* targetDriveShape,
                                                               const std::atomic<float>* targetDriveBias,
                                                               const std::atomic<float>* targetDriveMix,
                                                               const std::atomic<int>* targetRenderMode,
                                                               const std::atomic<int>* targetAdditivePartials,
                                                               const std::atomic<float>* targetAdditiveTilt,
                                                               const std::atomic<float>* targetAdditiveDrift,
                                                               const std::shared_ptr<const WaveAddTableSet>* targetWaveAddTableSet,
                                                               const std::atomic<int>* targetUnisonVoices,
                                                               const std::atomic<float>* targetDetuneCents,
                                                               const std::atomic<float>* targetStereoSpread)
            {
                HWY_EXPORT_T(_create_instance_table, __CreateInstanceForCPU);
                return HWY_DYNAMIC_DISPATCH_T(_create_instance_table)(samplerate,
                                                                      targetFrequency,
                                                                      targetAmplitude,
                                                                      targetWaveform,
                                                                      targetPulseWidth,
                                                                      targetDrive,
                                                                      targetDriveShape,
                                                                      targetDriveBias,
                                                                      targetDriveMix,
                                                                      targetRenderMode,
                                                                      targetAdditivePartials,
                                                                      targetAdditiveTilt,
                                                                      targetAdditiveDrift,
                                                                      targetWaveAddTableSet,
                                                                      targetUnisonVoices,
                                                                      targetDetuneCents,
                                                                      targetStereoSpread);
            }

        #endif
    }
}
