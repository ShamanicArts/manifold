//Do not guard against multiple inclusions - Highway works by including this file multiple times, once for each SIMD implementation

#undef HWY_TARGET_INCLUDE 
#define HWY_TARGET_INCLUDE "dsp/core/nodes/FilterNode_Highway.h"

#include "manifold/highway/HighwayWrapper.h"
#include "manifold/highway/HighwayMaths.h"

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
                typedef hwy::HWY_NAMESPACE::VFromD<hwy::HWY_NAMESPACE::ScalableTag<int32_t>> IntType;
                typedef hwy::HWY_NAMESPACE::MFromD<hwy::HWY_NAMESPACE::ScalableTag<int32_t>> IntMaskType;
                typedef hwy::HWY_NAMESPACE::MFromD<hwy::HWY_NAMESPACE::ScalableTag<float>> FltMaskType;

            public:
                FilterNodeSIMDImplementation(const std::atomic<float> * targetCutoffHz,
                                            const std::atomic<float> * targetResonance,
                                            const std::atomic<float> * targetMix,
                                            double sampleRate)
                    : targetCutoffHz_(targetCutoffHz), targetResonance_(targetResonance), targetMix_(targetMix),
                      sampleRate_(sampleRate)
                {}

                HWY_ATTR virtual void prepare(float sampleRate) override
                {
                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const int numValues = 2;
                    const size_t numLanes = HWY::Lanes(_flttype);

                    const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
                    const double smoothingTimeSeconds = 0.02;
                    smooth_ = hwy::AllocateAligned<float>(numLanes);
                    float smoothval = static_cast<float>(1.0 - std::exp(-1.0 / (smoothingTimeSeconds * sr)));
                    smoothval = juce::jlimit(0.0001f, 1.0f, smoothval);
                    HWY::Store(HWY::Set(_flttype, smoothval),  _flttype, smooth_.get());

                    // Initialize feedback state to zero
                    const FltType zero = HWY::Sub(HWY::Set(_flttype, 1.0f), HWY::Set(_flttype, 1.0f));
                    for (size_t i = 0; i < numValues; ++i) {
                        z1_[i] = hwy::AllocateAligned<float>(numLanes);
                        z2_[i] = hwy::AllocateAligned<float>(numLanes);
                        HWY::Store(zero, _flttype, z1_[i].get());
                        HWY::Store(zero, _flttype, z2_[i].get());
                    }

                    laneCount_ = numLanes;
                }

                virtual void configChanged() override
                {
                    // Config changes are handled in prepare() which recalculates everything
                }

                const char * targetName() const override
                {
                    return  hwy::TargetName(HWY_TARGET);
                }

                HWY_ATTR virtual void reset() override
                {
                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    namespace HWY = hwy::HWY_NAMESPACE;

                    const FltType zero = HWY::Sub(HWY::Set(_flttype, 1.0f), HWY::Set(_flttype, 1.0f));
                    for (size_t i = 0; i < 2; ++i) {
                        HWY::Store(zero, _flttype, z1_[i].get());
                        HWY::Store(zero, _flttype, z2_[i].get());
                    }
                }

                HWY_ATTR virtual void run(const std::vector<AudioBufferView> & inputs,
                                 std::vector<WritableAudioBufferView> & outputs,
                                 int numsamples) override
                {
                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const size_t numLanes = HWY::Lanes(_flttype);

                    const FltType zero = HWY::Sub(HWY::Set(_flttype, 1.0f), HWY::Set(_flttype, 1.0f));
                    const float smoothScalar = smooth_.get()[0];
                    const float piScalar = 3.14159265358979323846f;

                    const float targetCutoffScalar = targetCutoffHz_->load(std::memory_order_acquire);
                    const float targetResonanceScalar = targetResonance_->load(std::memory_order_acquire);
                    const float targetMixScalar = targetMix_->load(std::memory_order_acquire);

                    if (inputs.size() < 2 || outputs.size() < 2) {
                        if (!outputs.empty()) outputs[0].clear();
                        if (outputs.size() > 1) outputs[1].clear();
                        return;
                    }

                    float * outputPtrL = outputs[0].channelData[0];
                    float * outputPtrR = (outputs[0].numChannels > 1) ? outputs[0].channelData[1] : NULL;
                    size_t offset = 0;
                    size_t samplesRemain = static_cast<size_t>(numsamples);

                    while (samplesRemain > 0)
                    {
                        // Prefetch
                        hwy::Prefetch(outputPtrL + offset);
                        if(outputPtrR != NULL)
                            hwy::Prefetch(outputPtrR + offset);

                        // Process each channel
                        for (int ch = 0; ch < 2; ++ch)
                        {
                            const size_t idx = static_cast<size_t>(ch);

                            // Smooth parameters
                            float currentCutoff = cutoffHz_[idx].get()[0];
                            float currentResonance = resonance_[idx].get()[0];
                            float currentMix = mix_[idx].get()[0];

                            currentCutoff += (targetCutoffScalar - currentCutoff) * smoothScalar;
                            currentResonance += (targetResonanceScalar - currentResonance) * smoothScalar;
                            currentMix += (targetMixScalar - currentMix) * smoothScalar;

                            // Store smoothed values
                            HWY::Store(HWY::Set(_flttype, currentCutoff), _flttype, cutoffHz_[idx].get());
                            HWY::Store(HWY::Set(_flttype, currentResonance), _flttype, resonance_[idx].get());
                            HWY::Store(HWY::Set(_flttype, currentMix), _flttype, mix_[idx].get());

                            // Compute alpha (biquad coefficient)
                            const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
                            const float normalized = juce::jlimit(0.0001f, 0.49f, currentCutoff / sr);
                            const float shaping = 1.0f + currentResonance * 0.6f;
                            const float alpha = 1.0f - std::exp(-2.0f * piScalar * normalized * shaping);

                            // Feedback
                            const float feedback = currentResonance * 0.85f;
                            const float dry = 1.0f - currentMix;
                            const float wet = currentMix;

                            // Load input
                            const auto& inView = inputs[idx];
                            FltType inL, inR;

                            const size_t activeLaneCount = (samplesRemain > numLanes) ? numLanes : samplesRemain;
                            const FltMaskType activeMask = HWY::FirstN(_flttype, activeLaneCount);

                            if (samplesRemain >= numLanes)
                            {
                                inL = HWY::LoadU(_flttype, inView.channelData[0] + offset);
                                inR = (inView.numChannels > 1) ? HWY::LoadU(_flttype, inView.channelData[1] + offset) : inL;
                            }
                            else
                            {
                                inL = HWY::MaskedLoad(activeMask, _flttype, inView.channelData[0] + offset);
                                inR = (inView.numChannels > 1) ? HWY::MaskedLoad(activeMask, _flttype, inView.channelData[1] + offset) : inL;
                            }

                            // Biquad filter
                            FltType z1 = HWY::Load(_flttype, z1_[idx].get());
                            FltType z2 = HWY::Load(_flttype, z2_[idx].get());

                            // x = in - feedback * (z2 - z1)
                            FltType feedbackVec = HWY::Set(_flttype, feedback);
                            FltType x = HWY::Sub(inL, HWY::Mul(feedbackVec, HWY::Sub(z2, z1)));

                            // z1 += alpha * (x - z1)
                            z1 = HWY::Add(z1, HWY::Mul(HWY::Set(_flttype, alpha), HWY::Sub(x, z1)));

                            // z2 += alpha * (z1 - z2)
                            z2 = HWY::Add(z2, HWY::Mul(HWY::Set(_flttype, alpha), HWY::Sub(z1, z2)));

                            // Store feedback state
                            HWY::Store(z1, _flttype, z1_[idx].get());
                            HWY::Store(z2, _flttype, z2_[idx].get());

                            // Apply mix
                            FltType filtered = z2;
                            FltType out = HWY::MulAdd(inL, HWY::Set(_flttype, dry), HWY::Mul(filtered, HWY::Set(_flttype, wet)));

                            // Store output
                            if (samplesRemain >= numLanes)
                            {
                                HWY::StoreU(out, _flttype, outputPtrL + offset);
                                if (outputPtrR != NULL)
                                    HWY::StoreU(out, _flttype, outputPtrR + offset);
                            }
                            else
                            {
                                FltMaskType storeMask = HWY::FirstN(_flttype, samplesRemain);
                                HWY::BlendedStore(out, storeMask, _flttype, outputPtrL + offset);
                                if (outputPtrR != NULL)
                                    HWY::BlendedStore(out, storeMask, _flttype, outputPtrR + offset);
                            }
                        }

                        size_t activeLaneCount = (samplesRemain >= numLanes) ? numLanes : samplesRemain;
                        samplesRemain -= activeLaneCount;
                        offset += activeLaneCount;
                    }
                }

            private:
                const std::atomic<float> * targetCutoffHz_;
                const std::atomic<float> * targetResonance_;
                const std::atomic<float> * targetMix_;
                double sampleRate_;

                hwy::AlignedFreeUniquePtr<float[]> smooth_;
                std::array<hwy::AlignedFreeUniquePtr<float[]>, 2> cutoffHz_;
                std::array<hwy::AlignedFreeUniquePtr<float[]>, 2> resonance_;
                std::array<hwy::AlignedFreeUniquePtr<float[]>, 2> mix_;
                std::array<hwy::AlignedFreeUniquePtr<float[]>, 2> z1_;
                std::array<hwy::AlignedFreeUniquePtr<float[]>, 2> z2_;
                size_t laneCount_;
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