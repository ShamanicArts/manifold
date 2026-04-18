//Do not guard against multiple inclusions - Highway works by including this file multiple times, once for each SIMD implementation

#undef HWY_TARGET_INCLUDE 
#define HWY_TARGET_INCLUDE "dsp/core/nodes/MixerNode_Highway.h"

#include "manifold/highway/HighwayWrapper.h"
#include "manifold/highway/HighwayMaths.h"

#include <cmath>

namespace dsp_primitives
{
    namespace MixerNode_Highway
    {
        //Do not change this namespace. This separates the specific SIMD implementaions from each other
        namespace HWY_NAMESPACE
        {

            class MixerNodeSIMDImplementation : public IPrimitiveNodeSIMDImplementation
            {
            private:
                typedef hwy::HWY_NAMESPACE::VFromD<hwy::HWY_NAMESPACE::ScalableTag<float>> FltType;
                typedef hwy::HWY_NAMESPACE::VFromD<hwy::HWY_NAMESPACE::ScalableTag<int32_t>> IntType;
                typedef hwy::HWY_NAMESPACE::MFromD<hwy::HWY_NAMESPACE::ScalableTag<int32_t>> IntMaskType;
                typedef hwy::HWY_NAMESPACE::MFromD<hwy::HWY_NAMESPACE::ScalableTag<float>> FltMaskType;

            public:
                MixerNodeSIMDImplementation(const std::atomic<int>* targetInputCount,
                                           const std::atomic<float>* targetGains,
                                           const std::atomic<float>* targetPans,
                                           const std::atomic<float>* targetMaster,
                                           int maxBusses)
                    : targetInputCount_(targetInputCount), targetGains_(targetGains), targetPans_(targetPans), targetMaster_(targetMaster), maxBusses_(maxBusses) {}

                HWY_ATTR virtual void prepare(float sampleRate) override
                {
                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const int numValues = MixerNode::kMaxBusses;
                    const size_t numLanes = HWY::Lanes(_flttype);

                    const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
                    const double smoothTime = 0.01;
                    smooth_ = hwy::AllocateAligned<float>(numLanes);
                    float smoothval = static_cast<float>(1.0 - std::exp(-1.0 / (smoothTime * sr)));
                    smoothval = juce::jlimit(0.0001f, 1.0f, smoothval);
                    HWY::Store(HWY::Set(_flttype, smoothval),  _flttype, smooth_.get());

                    // Initialize gains and pans to identity
                    const FltType one = HWY::Set(_flttype, 1.0f);
                    const FltType zero = HWY::Sub(one, one);

                    for (size_t i = 0; i < numValues; ++i) {
                        gains_[i] = hwy::AllocateAligned<float>(numLanes);
                        pans_[i] = hwy::AllocateAligned<float>(numLanes);

                        HWY::Store(one, _flttype, gains_[i].get());
                        HWY::Store(zero, _flttype, pans_[i].get());
                    }

                    master_ = hwy::AllocateAligned<float>(numLanes);
                    tempGain_ = hwy::AllocateAligned<float>(numLanes);
                    tempPanL_ = hwy::AllocateAligned<float>(numLanes);
                    tempPanR_ = hwy::AllocateAligned<float>(numLanes);
                    tempMaster_ = hwy::AllocateAligned<float>(numLanes);
                    HWY::Store(one, _flttype, master_.get());

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

                    const FltType one = HWY::Set(_flttype, 1.0f);
                    const FltType zero = HWY::Sub(one, one);

                    for (size_t i = 0; i < MixerNode::kMaxBusses; ++i) {
                        HWY::Store(one, _flttype, gains_[i].get());
                        HWY::Store(zero, _flttype, pans_[i].get());
                    }
                    HWY::Store(one, _flttype, master_.get());
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

                    const int inputCount = juce::jlimit(1, maxBusses_, targetInputCount_->load(std::memory_order_acquire));

                    float * outputPtrL = outputs[0].channelData[0];
                    float * outputPtrR = (outputs[0].numChannels > 1) ? outputs[0].channelData[1] : NULL;
                    size_t offset = 0;
                    size_t samplesRemain = static_cast<size_t>(numsamples);

                    float currentMasterScalar = master_.get()[0];

                    while(samplesRemain > 0)
                    {
                        // Prefetch
                        hwy::Prefetch(outputPtrL + offset);
                        if(outputPtrR != NULL)
                            hwy::Prefetch(outputPtrR + offset);

                        // Initialize output
                        FltType outL = zero;
                        FltType outR = zero;

                        const size_t activeLaneCount = (samplesRemain > numLanes) ? numLanes : samplesRemain;
                        const FltMaskType activeMask = HWY::FirstN(_flttype, activeLaneCount);

                        // Process each bus
                        for (int bus = 0; bus < inputCount; ++bus)
                        {
                            const size_t busIndex = static_cast<size_t>(bus);
                            const float targetGainScalar = targetGains_[busIndex].load(std::memory_order_acquire);
                            const float targetPanScalar = targetPans_[busIndex].load(std::memory_order_acquire);
                            float currentGainScalar = gains_[busIndex].get()[0];
                            float currentPanScalar = pans_[busIndex].get()[0];

                            for (size_t lane = 0; lane < activeLaneCount; ++lane)
                            {
                                currentGainScalar += (targetGainScalar - currentGainScalar) * smoothScalar;
                                currentPanScalar += (targetPanScalar - currentPanScalar) * smoothScalar;

                                tempGain_.get()[lane] = currentGainScalar;
                                const float t = 0.5f * (juce::jlimit(-1.0f, 1.0f, currentPanScalar) + 1.0f);
                                const float angle = 0.5f * piScalar * t;
                                tempPanL_.get()[lane] = std::cos(angle);
                                tempPanR_.get()[lane] = std::sin(angle);
                            }

                            HWY::Store(HWY::Set(_flttype, currentGainScalar), _flttype, gains_[busIndex].get());
                            HWY::Store(HWY::Set(_flttype, currentPanScalar), _flttype, pans_[busIndex].get());

                            const FltType gainVec = (samplesRemain >= numLanes)
                                ? HWY::Load(_flttype, tempGain_.get())
                                : HWY::MaskedLoad(activeMask, _flttype, tempGain_.get());
                            const FltType gainL = (samplesRemain >= numLanes)
                                ? HWY::Load(_flttype, tempPanL_.get())
                                : HWY::MaskedLoad(activeMask, _flttype, tempPanL_.get());
                            const FltType gainR = (samplesRemain >= numLanes)
                                ? HWY::Load(_flttype, tempPanR_.get())
                                : HWY::MaskedLoad(activeMask, _flttype, tempPanR_.get());

                            // Load input for this bus
                            const int viewIndex = bus * 2;
                            if (inputs.size() <= static_cast<size_t>(viewIndex))
                                continue;

                            const auto& inView = inputs[static_cast<size_t>(viewIndex)];
                            FltType inL, inR;

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

                            // Apply gain and pan
                            inL = HWY::Mul(HWY::Mul(inL, gainVec), gainL);
                            inR = HWY::Mul(HWY::Mul(inR, gainVec), gainR);

                            // Add to output
                            outL = HWY::Add(outL, inL);
                            outR = HWY::Add(outR, inR);
                        }

                        const float targetMasterScalar = targetMaster_->load(std::memory_order_acquire);
                        for (size_t lane = 0; lane < activeLaneCount; ++lane)
                        {
                            currentMasterScalar += (targetMasterScalar - currentMasterScalar) * smoothScalar;
                            tempMaster_.get()[lane] = currentMasterScalar;
                        }
                        const FltType masterVec = (samplesRemain >= numLanes)
                            ? HWY::Load(_flttype, tempMaster_.get())
                            : HWY::MaskedLoad(activeMask, _flttype, tempMaster_.get());
                        outL = HWY::Mul(outL, masterVec);
                        outR = (outputPtrR == NULL) ? zero : HWY::Mul(outR, masterVec);

                        HWY::Store(HWY::Set(_flttype, currentMasterScalar), _flttype, master_.get());

                        // Write output
                        if(samplesRemain >= numLanes)
                        {
                            HWY::StoreU(outL, _flttype, outputPtrL + offset);
                            if(outputPtrR != NULL)
                                HWY::StoreU(outR, _flttype, outputPtrR + offset);

                            samplesRemain -= numLanes;
                            offset += numLanes;
                        }
                        else
                        {
                            FltMaskType storeMask = HWY::FirstN(_flttype, samplesRemain);
                            HWY::BlendedStore(outL, storeMask, _flttype, outputPtrL + offset);
                            if(outputPtrR != NULL)
                                HWY::BlendedStore(outR, storeMask, _flttype, outputPtrR + offset);

                            samplesRemain = 0;
                        }
                    }
                }

            private:
                HWY_ATTR void configure()
                {
                    // Not used - prepare() handles everything
                }

                const std::atomic<int>* targetInputCount_;
                const std::atomic<float>* targetGains_;
                const std::atomic<float>* targetPans_;
                const std::atomic<float>* targetMaster_;
                const int maxBusses_;
                size_t laneCount_;

                hwy::AlignedFreeUniquePtr<float[]> smooth_;
                hwy::AlignedFreeUniquePtr<float[]> master_;
                hwy::AlignedFreeUniquePtr<float[]> tempGain_;
                hwy::AlignedFreeUniquePtr<float[]> tempPanL_;
                hwy::AlignedFreeUniquePtr<float[]> tempPanR_;
                hwy::AlignedFreeUniquePtr<float[]> tempMaster_;
                std::array<hwy::AlignedFreeUniquePtr<float[]>, MixerNode::kMaxBusses> gains_;
                std::array<hwy::AlignedFreeUniquePtr<float[]>, MixerNode::kMaxBusses> pans_;
            };

            //Create CPU specific instance
            HWY_API IPrimitiveNodeSIMDImplementation *  __CreateInstanceForCPU(const std::atomic<int>* targetInputCount,
                                                                               const std::atomic<float>* targetGains,
                                                                               const std::atomic<float>* targetPans,
                                                                               const std::atomic<float>* targetMaster,
                                                                               int maxBusses)
            {
                return new MixerNodeSIMDImplementation(targetInputCount, targetGains, targetPans, targetMaster, maxBusses);
            }
        }

        //========================================================================
        //Highway bootstrap

        #if HWY_ONCE || HWY_IDE

            IPrimitiveNodeSIMDImplementation *  __CreateInstance(const std::atomic<int>* targetInputCount,
                                                                 const std::atomic<float>* targetGains,
                                                                 const std::atomic<float>* targetPans,
                                                                 const std::atomic<float>* targetMaster,
                                                                 int maxBusses)
            {
                HWY_EXPORT_T(_create_instance_table, __CreateInstanceForCPU);
                return HWY_DYNAMIC_DISPATCH_T(_create_instance_table)(targetInputCount, targetGains, targetPans, targetMaster, maxBusses);
            }

        #endif
    }
}