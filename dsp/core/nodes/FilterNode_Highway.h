//Do not guard against multiple inclusions - Highway works by including this file multiple times, once for each SIMD implementation

#undef HWY_TARGET_INCLUDE
#define HWY_TARGET_INCLUDE "dsp/core/nodes/FilterNode_Highway.h"

#include "manifold/highway/HighwayWrapper.h"
#include "manifold/highway/HighwayMaths.h"

#include <algorithm>
#include <cmath>

namespace dsp_primitives
{
    namespace FilterNode_Highway
    {
        //Do not change this namespace. This separates the specific SIMD implementaions from each other
        namespace HWY_NAMESPACE
        {

            class FilterNodeSIMDImplementation : public IPrimitiveNodeSIMDImplementation
            {
            private:
                typedef hwy::HWY_NAMESPACE::VFromD<hwy::HWY_NAMESPACE::ScalableTag<float>> FltType;

            public:
                FilterNodeSIMDImplementation(const std::atomic<float> * targetCutoffHz,
                                            const std::atomic<float> * targetResonance,
                                            const std::atomic<float> * targetMix,
                                            double sampleRate)
                    : targetCutoffHz_(targetCutoffHz)
                    , targetResonance_(targetResonance)
                    , targetMix_(targetMix)
                    , sampleRate_(sampleRate)
                {}

                HWY_ATTR virtual void prepare(float sampleRate) override
                {
                    const hwy::HWY_NAMESPACE::ScalableTag<float> d;
                    namespace HWY = hwy::HWY_NAMESPACE;

                    sampleRate_ = sampleRate > 1.0f ? sampleRate : 44100.0f;
                    laneCount_ = HWY::Lanes(d);

                    inputScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    outputScratch_ = hwy::AllocateAligned<float>(laneCount_);
                    z1_ = hwy::AllocateAligned<float>(laneCount_);
                    z2_ = hwy::AllocateAligned<float>(laneCount_);

                    const double smoothingTimeSeconds = 0.02;
                    smoothingCoeff_ = static_cast<float>(1.0 - std::exp(-1.0 / (smoothingTimeSeconds * sampleRate_)));
                    smoothingCoeff_ = juce::jlimit(0.0001f, 1.0f, smoothingCoeff_);

                    cutoffHz_ = targetCutoffHz_->load(std::memory_order_acquire);
                    resonance_ = targetResonance_->load(std::memory_order_acquire);
                    mix_ = targetMix_->load(std::memory_order_acquire);

                    reset();
                }

                virtual void configChanged() override
                {
                    // Targets are loaded directly in run().
                }

                const char * targetName() const override
                {
                    return hwy::TargetName(HWY_TARGET);
                }

                HWY_ATTR virtual void reset() override
                {
                    if (laneCount_ == 0 || z1_ == nullptr || z2_ == nullptr)
                        return;

                    std::fill_n(z1_.get(), laneCount_, 0.0f);
                    std::fill_n(z2_.get(), laneCount_, 0.0f);
                }

                HWY_ATTR virtual void run(const std::vector<AudioBufferView> & inputs,
                                          std::vector<WritableAudioBufferView> & outputs,
                                          int numsamples) override
                {
                    const hwy::HWY_NAMESPACE::ScalableTag<float> d;
                    namespace HWY = hwy::HWY_NAMESPACE;

                    if (inputs.empty() || outputs.empty() || numsamples <= 0)
                    {
                        if (!outputs.empty())
                            outputs[0].clear();
                        return;
                    }

                    const size_t lanes = HWY::Lanes(d);
                    if (lanes != laneCount_ || inputScratch_ == nullptr || outputScratch_ == nullptr || z1_ == nullptr || z2_ == nullptr)
                        prepare(static_cast<float>(sampleRate_));

                    const AudioBufferView& input = inputs[0];
                    WritableAudioBufferView& output = outputs[0];
                    const int channels = juce::jmin(2, input.numChannels, output.numChannels);
                    if (channels <= 0)
                    {
                        output.clear();
                        return;
                    }

                    FltType z1 = HWY::Load(d, z1_.get());
                    FltType z2 = HWY::Load(d, z2_.get());

                    for (int i = 0; i < numsamples; ++i)
                    {
                        const float targetCutoff = targetCutoffHz_->load(std::memory_order_acquire);
                        const float targetResonance = targetResonance_->load(std::memory_order_acquire);
                        const float targetMix = targetMix_->load(std::memory_order_acquire);

                        cutoffHz_ += (targetCutoff - cutoffHz_) * smoothingCoeff_;
                        resonance_ += (targetResonance - resonance_) * smoothingCoeff_;
                        mix_ += (targetMix - mix_) * smoothingCoeff_;

                        const float alpha = computeAlpha(cutoffHz_, resonance_);
                        const float feedback = resonance_ * 0.85f;
                        const float dry = 1.0f - mix_;
                        const float wet = mix_;

                        std::fill_n(inputScratch_.get(), laneCount_, 0.0f);
                        inputScratch_[0] = input.channelData[0][i];
                        if (channels > 1)
                            inputScratch_[1] = input.channelData[1][i];

                        const FltType in = HWY::Load(d, inputScratch_.get());
                        const FltType feedbackVec = HWY::Set(d, feedback);
                        const FltType alphaVec = HWY::Set(d, alpha);
                        const FltType dryVec = HWY::Set(d, dry);
                        const FltType wetVec = HWY::Set(d, wet);

                        const FltType x = HWY::Sub(in, HWY::Mul(feedbackVec, HWY::Sub(z2, z1)));
                        z1 = HWY::Add(z1, HWY::Mul(alphaVec, HWY::Sub(x, z1)));
                        z2 = HWY::Add(z2, HWY::Mul(alphaVec, HWY::Sub(z1, z2)));

                        const FltType out = HWY::MulAdd(in, dryVec, HWY::Mul(z2, wetVec));
                        HWY::Store(out, d, outputScratch_.get());

                        output.channelData[0][i] = outputScratch_[0];
                        if (channels > 1)
                            output.channelData[1][i] = outputScratch_[1];
                    }

                    HWY::Store(z1, d, z1_.get());
                    HWY::Store(z2, d, z2_.get());
                }

            private:
                float computeAlpha(float cutoffHz, float resonance) const
                {
                    const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
                    const float normalized = juce::jlimit(0.0001f, 0.49f, cutoffHz / sr);
                    const float shaping = 1.0f + resonance * 0.6f;
                    const float alpha = 1.0f - std::exp(-2.0f * juce::MathConstants<float>::pi * normalized * shaping);
                    return juce::jlimit(0.0001f, 0.999f, alpha);
                }

                const std::atomic<float> * targetCutoffHz_;
                const std::atomic<float> * targetResonance_;
                const std::atomic<float> * targetMix_;
                double sampleRate_;

                float smoothingCoeff_ = 1.0f;
                float cutoffHz_ = 1400.0f;
                float resonance_ = 0.1f;
                float mix_ = 1.0f;

                hwy::AlignedFreeUniquePtr<float[]> inputScratch_;
                hwy::AlignedFreeUniquePtr<float[]> outputScratch_;
                hwy::AlignedFreeUniquePtr<float[]> z1_;
                hwy::AlignedFreeUniquePtr<float[]> z2_;
                size_t laneCount_ = 0;
            };

            //Create CPU specific instance
            HWY_API IPrimitiveNodeSIMDImplementation *  __CreateInstanceForCPU(const std::atomic<float> * targetCutoffHz,
                                                                                const std::atomic<float> * targetResonance,
                                                                                const std::atomic<float> * targetMix,
                                                                                double sampleRate)
            {
                return new FilterNodeSIMDImplementation(targetCutoffHz, targetResonance, targetMix, sampleRate);
            }
        }

        //========================================================================
        //Highway bootstrap

        #if HWY_ONCE || HWY_IDE

            IPrimitiveNodeSIMDImplementation *  __CreateInstance(const std::atomic<float> * targetCutoffHz,
                                                                const std::atomic<float> * targetResonance,
                                                                const std::atomic<float> * targetMix,
                                                                double sampleRate)
            {
                HWY_EXPORT_T(_create_instance_table, __CreateInstanceForCPU);
                return HWY_DYNAMIC_DISPATCH_T(_create_instance_table)(targetCutoffHz, targetResonance, targetMix, sampleRate);
            }

        #endif
    }
}
