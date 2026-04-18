//Do not guard against multiple inclusions - Highway works by including this file multiple times, once for each SIMD implementation

#undef HWY_TARGET_INCLUDE
#define HWY_TARGET_INCLUDE "dsp/core/nodes/GainNode_Highway.h"

#include "manifold/highway/HighwayWrapper.h"

namespace dsp_primitives
{
    namespace GainNode_Highway
    {
        //Do not change this namespace. This separates the specific SIMD implementaions from each other
        namespace HWY_NAMESPACE
        {

            class GainNodeSIMDImplementation : public IPrimitiveNodeSIMDImplementation
            {
            private:
                typedef hwy::HWY_NAMESPACE::VFromD<hwy::HWY_NAMESPACE::ScalableTag<float>> FltType;

            public:
                GainNodeSIMDImplementation(float sampleRate,
                                           int numChannels,
                                           const std::atomic<float> * targetGain,
                                           const std::atomic<bool> * targetMuted)
                    : numChannels_(numChannels)
                    , targetGain_(targetGain)
                    , targetMuted_(targetMuted)
                    , sampleRate_(sampleRate > 1.0f ? sampleRate : 44100.0f)
                    , laneCount_(0)
                {}

                const char * targetName() const override
                {
                    return hwy::TargetName(HWY_TARGET);
                }

                virtual void configChanged() override
                {
                    // Nothing to precompute; targets are loaded each run()
                }

                virtual void reset() override
                {
                    currentGain_ = computeTarget();
                }

                HWY_ATTR virtual void prepare(float sampleRate) override
                {
                    sampleRate_ = (sampleRate > 1.0f) ? sampleRate : 44100.0f;

                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const size_t numLanes = HWY::Lanes(_flttype);

                    // Exponential smoothing coefficient:  coeff = 1 - exp(-1 / (time * sr))
                    const double smoothingTimeSeconds = 0.01;
                    float coeff = static_cast<float>(1.0 - std::exp(-1.0 / (smoothingTimeSeconds * static_cast<double>(sampleRate_))));
                    coeff = juce::jlimit(0.0001f, 1.0f, coeff);
                    const float a = 1.0f - coeff; // per-sample decay factor

                    // Precompute per-lane powers: powers_[k] = a^(k+1)
                    // These let us compute gains[k] = target + (g - target) * a^(k+1)
                    powers_ = hwy::AllocateAligned<float>(numLanes);
                    float p = 1.0f;
                    for (size_t k = 0; k < numLanes; ++k)
                    {
                        p *= a;           // p = a^(k+1)
                        powers_[k] = p;
                    }
                    aPowLanes_ = p;       // a^numLanes, advance factor across a full chunk

                    laneCount_ = numLanes;
                    currentGain_ = computeTarget();
                }

                HWY_ATTR virtual void run(const std::vector<AudioBufferView> & inputs,
                                 std::vector<WritableAudioBufferView> & outputs,
                                 int numsamples) override
                {
                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const size_t numLanes = HWY::Lanes(_flttype);

                    if (numLanes != laneCount_)
                        prepare(sampleRate_);

                    if (inputs.empty() || outputs.empty() || numsamples <= 0)
                        return;

                    const int channels = juce::jmin(numChannels_,
                                                   inputs[0].numChannels,
                                                   outputs[0].numChannels);
                    if (channels <= 0)
                        return;

                    const float target = computeTarget();
                    const FltType targetVec = HWY::Set(_flttype, target);
                    const FltType powsVec = HWY::Load(_flttype, powers_.get());

                    float g = currentGain_;
                    size_t offset = 0;
                    size_t samplesRemain = static_cast<size_t>(numsamples);

                    while (samplesRemain >= numLanes)
                    {
                        // gains[k] = target + (g - target) * a^(k+1)
                        const FltType gains = HWY::MulAdd(powsVec,
                                                          HWY::Set(_flttype, g - target),
                                                          targetVec);

                        for (int ch = 0; ch < channels; ++ch)
                        {
                            const FltType in = HWY::LoadU(_flttype, inputs[0].channelData[ch] + offset);
                            HWY::StoreU(HWY::Mul(in, gains), _flttype, outputs[0].channelData[ch] + offset);
                        }

                        // Advance g by a^numLanes
                        g = target + (g - target) * aPowLanes_;

                        samplesRemain -= numLanes;
                        offset += numLanes;
                    }

                    if (samplesRemain > 0)
                    {
                        const auto mask = HWY::FirstN(_flttype, samplesRemain);
                        const FltType gains = HWY::MulAdd(powsVec,
                                                          HWY::Set(_flttype, g - target),
                                                          targetVec);

                        for (int ch = 0; ch < channels; ++ch)
                        {
                            const FltType in = HWY::MaskedLoad(mask, _flttype, inputs[0].channelData[ch] + offset);
                            HWY::BlendedStore(HWY::Mul(in, gains), mask, _flttype, outputs[0].channelData[ch] + offset);
                        }

                        // Advance g by a^samplesRemain
                        g = target + (g - target) * powers_[samplesRemain - 1];
                    }

                    currentGain_ = g;
                }

            private:
                float computeTarget() const
                {
                    const float requested = juce::jmax(0.0f, targetGain_->load(std::memory_order_acquire));
                    const bool muted = targetMuted_->load(std::memory_order_acquire);
                    return muted ? 0.0f : requested;
                }

                int numChannels_;
                const std::atomic<float> * targetGain_;
                const std::atomic<bool> * targetMuted_;

                float sampleRate_;
                size_t laneCount_;
                float currentGain_ = 0.0f;
                float aPowLanes_ = 0.0f;

                hwy::AlignedFreeUniquePtr<float[]> powers_;
            };

            //Create CPU specific instance
            HWY_API IPrimitiveNodeSIMDImplementation * __CreateInstanceForCPU(float sampleRate,
                                                                              int numChannels,
                                                                              const std::atomic<float> * targetGain,
                                                                              const std::atomic<bool> * targetMuted)
            {
                return new GainNodeSIMDImplementation(sampleRate, numChannels, targetGain, targetMuted);
            }
        }

        //========================================================================
        //Highway bootstrap

        #if HWY_ONCE || HWY_IDE

            IPrimitiveNodeSIMDImplementation * __CreateInstance(float sampleRate,
                                                                int numChannels,
                                                                const std::atomic<float> * targetGain,
                                                                const std::atomic<bool> * targetMuted)
            {
                HWY_EXPORT_T(_create_instance_table, __CreateInstanceForCPU);
                return HWY_DYNAMIC_DISPATCH_T(_create_instance_table)(sampleRate, numChannels, targetGain, targetMuted);
            }

        #endif
    }
}
