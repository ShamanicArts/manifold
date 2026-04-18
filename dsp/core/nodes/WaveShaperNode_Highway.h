//Do not guard against multiple inclusions - Highway works by including this file multiple times, once for each SIMD implementation

#undef HWY_TARGET_INCLUDE
#define HWY_TARGET_INCLUDE "dsp/core/nodes/WaveShaperNode_Highway.h"

#include "manifold/highway/HighwayWrapper.h"
#include <cmath>

namespace dsp_primitives
{
    namespace WaveShaperNode_Highway
    {
        //Do not change this namespace. This separates the specific SIMD implementaions from each other
        namespace HWY_NAMESPACE
        {
            class WaveShaperNodeSIMDImplementation : public IPrimitiveNodeSIMDImplementation
            {
            private:
                typedef hwy::HWY_NAMESPACE::VFromD<hwy::HWY_NAMESPACE::ScalableTag<float>> FltType;
                typedef hwy::HWY_NAMESPACE::VFromD<hwy::HWY_NAMESPACE::ScalableTag<int32_t>> IntType;
                typedef hwy::HWY_NAMESPACE::MFromD<hwy::HWY_NAMESPACE::ScalableTag<int32_t>> IntMaskType;
                typedef hwy::HWY_NAMESPACE::MFromD<hwy::HWY_NAMESPACE::ScalableTag<float>> FltMaskType;

                HWY_ATTR HWY_INLINE float CustomTanh(float x)
                {
                    return std::tanh(x);
                }

                HWY_ATTR HWY_INLINE FltType CustomTanh(const FltType x)
                {
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    const FltType result = HWY::Set(_flttype, CustomTanh(HWY::ExtractLane(x, 0)));
                    return HWY::BroadcastLane<0>(result);
                }

            public:
                WaveShaperNodeSIMDImplementation(int numChannels) : numChannels_(numChannels)
                {}

                const char * targetName() const override
                {
                    return  hwy::TargetName(HWY_TARGET);
                }

                virtual ~WaveShaperNodeSIMDImplementation()
                {}

                virtual void configChanged() override
                {
                    configChanged_ = true;
                }

                virtual void reset() override
                {
                    for (int ch = 0; ch < numChannels_; ++ch)
                    {
                        preFilterState_[ch] = 0.0f;
                        postFilterState_[ch] = 0.0f;
                    }
                }

                HWY_ATTR virtual void prepare(float sampleRate) override
                {
                    sampleRate_ = sampleRate > 1.0 ? sampleRate : 44100.0f;

                    // Calculate smoothing coefficients
                    const double sr = sampleRate_;
                    // Drive/output: 10ms smoothing
                    const float paramSmooth = static_cast<float>(1.0 - std::exp(-1.0 / (0.01 * sr)));
                    // Filter frequencies: 50ms for smooth sweeps
                    const float filterSmooth = static_cast<float>(1.0 - std::exp(-1.0 / (0.05 * sr)));

                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    const size_t numLanes = hwy::HWY_NAMESPACE::Lanes(_flttype);

                    smoothDrive_ = hwy::AllocateAligned<float>(numLanes);
                    smoothOutput_ = hwy::AllocateAligned<float>(numLanes);
                    smoothBias_ = hwy::AllocateAligned<float>(numLanes);
                    smoothMix_ = hwy::AllocateAligned<float>(numLanes);
                    smoothPreFilter_ = hwy::AllocateAligned<float>(numLanes);
                    smoothPostFilter_ = hwy::AllocateAligned<float>(numLanes);

                    hwy::HWY_NAMESPACE::Store(
                        hwy::HWY_NAMESPACE::Set(_flttype, paramSmooth),
                        _flttype,
                        smoothDrive_.get());
                    hwy::HWY_NAMESPACE::Store(
                        hwy::HWY_NAMESPACE::Set(_flttype, paramSmooth),
                        _flttype,
                        smoothOutput_.get());
                    hwy::HWY_NAMESPACE::Store(
                        hwy::HWY_NAMESPACE::Set(_flttype, paramSmooth),
                        _flttype,
                        smoothBias_.get());
                    hwy::HWY_NAMESPACE::Store(
                        hwy::HWY_NAMESPACE::Set(_flttype, paramSmooth),
                        _flttype,
                        smoothMix_.get());
                    hwy::HWY_NAMESPACE::Store(
                        hwy::HWY_NAMESPACE::Set(_flttype, filterSmooth),
                        _flttype,
                        smoothPreFilter_.get());
                    hwy::HWY_NAMESPACE::Store(
                        hwy::HWY_NAMESPACE::Set(_flttype, filterSmooth),
                        _flttype,
                        smoothPostFilter_.get());

                    // Initialize current values from targets
                    currentDrive_ = targetDrive_->load(std::memory_order_acquire);
                    currentOutput_ = targetOutput_->load(std::memory_order_acquire);
                    currentBias_ = targetBias_->load(std::memory_order_acquire);
                    currentMix_ = targetMix_->load(std::memory_order_acquire);
                    currentPreFilter_ = targetPreFilter_->load(std::memory_order_acquire);
                    currentPostFilter_ = targetPostFilter_->load(std::memory_order_acquire);
                    currentCurve_ = targetCurve_->load(std::memory_order_acquire);
                    currentOversample_ = targetOversample_->load(std::memory_order_acquire);

                    oversampleFactor_ = currentOversample_;
                    if (oversampleFactor_ != 1 && oversampleFactor_ != 2 && oversampleFactor_ != 4)
                    {
                        oversampleFactor_ = 2;
                    }

                    updateFilterCoefficients();
                }

                HWY_ATTR virtual void run(const std::vector<AudioBufferView> & inputs,
                                 std::vector<WritableAudioBufferView> & outputs,
                                 int numsamples) override
                {
                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const size_t numLanes = HWY::Lanes(_flttype);

                    if (numLanes != laneCount_)
                    {
                        prepare(sampleRate_);
                    }
                    else if (configChanged_)
                    {
                        updateFilterCoefficients();
                    }

                    const int channels = numChannels_;
                    if (channels <= 0 || outputs.empty() || numsamples <= 0)
                    {
                        if (!outputs.empty())
                        {
                            outputs[0].clear();
                        }
                        if (outputs.size() > 1)
                        {
                            outputs[1].clear();
                        }
                        return;
                    }

                    // Load targets
                    const float targetDrive = targetDrive_->load(std::memory_order_acquire);
                    const float targetOutput = targetOutput_->load(std::memory_order_acquire);
                    const float targetBias = targetBias_->load(std::memory_order_acquire);
                    const float targetMix = targetMix_->load(std::memory_order_acquire);
                    const float targetPreFilter = targetPreFilter_->load(std::memory_order_acquire);
                    const float targetPostFilter = targetPostFilter_->load(std::memory_order_acquire);
                    const int targetCurve = targetCurve_->load(std::memory_order_acquire);
                    const int targetOversample = targetOversample_->load(std::memory_order_acquire);

                    // Update oversample if changed
                    if (targetOversample != currentOversample_)
                    {
                        currentOversample_ = targetOversample;
                        oversampleFactor_ = currentOversample_;
                        if (oversampleFactor_ != 1 && oversampleFactor_ != 2 && oversampleFactor_ != 4)
                        {
                            oversampleFactor_ = 2;
                        }
                    }

                    // Smooth parameters
                    const FltType targetDriveV = HWY::Set(_flttype, targetDrive);
                    const FltType targetOutputV = HWY::Set(_flttype, targetOutput);
                    const FltType targetBiasV = HWY::Set(_flttype, targetBias);
                    const FltType targetMixV = HWY::Set(_flttype, targetMix);
                    const FltType targetPreFilterV = HWY::Set(_flttype, targetPreFilter);
                    const FltType targetPostFilterV = HWY::Set(_flttype, targetPostFilter);
                    const FltType currentPreFilterV = HWY::Set(_flttype, currentPreFilter_);
                    const FltType currentPostFilterV = HWY::Set(_flttype, currentPostFilter_);

                    const FltType smoothDriveV = HWY::Load(_flttype, smoothDrive_.get());
                    const FltType smoothOutputV = HWY::Load(_flttype, smoothOutput_.get());
                    const FltType smoothBiasV = HWY::Load(_flttype, smoothBias_.get());
                    const FltType smoothMixV = HWY::Load(_flttype, smoothMix_.get());
                    const FltType smoothPreFilterV = HWY::Load(_flttype, smoothPreFilter_.get());
                    const FltType smoothPostFilterV = HWY::Load(_flttype, smoothPostFilter_.get());

                    const FltType currentDriveV = HWY::MulAdd(HWY::Sub(targetDriveV, smoothDriveV), smoothDriveV, smoothDriveV);
                    const FltType currentOutputV = HWY::MulAdd(HWY::Sub(targetOutputV, smoothOutputV), smoothOutputV, smoothOutputV);
                    const FltType currentBiasV = HWY::MulAdd(HWY::Sub(targetBiasV, smoothBiasV), smoothBiasV, smoothBiasV);
                    const FltType currentMixV = HWY::MulAdd(HWY::Sub(targetMixV, smoothMixV), smoothMixV, smoothMixV);
                    const FltType currentPreFilterV2 = HWY::MulAdd(HWY::Sub(targetPreFilterV, smoothPreFilterV), smoothPreFilterV, smoothPreFilterV);
                    const FltType currentPostFilterV2 = HWY::MulAdd(HWY::Sub(targetPostFilterV, smoothPostFilterV), smoothPostFilterV, smoothPostFilterV);

                    const int currentCurve = targetCurve;

                    // Update filter coefficients if needed
                    if (std::abs(HWY::ExtractLane(currentPreFilterV2, 0) - HWY::ExtractLane(currentPreFilterV, 0)) > 0.1f ||
                        std::abs(HWY::ExtractLane(currentPostFilterV2, 0) - HWY::ExtractLane(currentPostFilterV, 0)) > 0.1f)
                    {
                        updateFilterCoefficients();
                    }

                    for (int ch = 0; ch < channels; ++ch)
                    {
                        const auto channelIndex = static_cast<std::size_t>(ch);
                        const float * inputPtr = inputs[channelIndex].channelData[0];
                        float * outputPtr = outputs[channelIndex].channelData[0];
                        size_t offset = 0;
                        size_t samplesRemain = numsamples;

                        // Pre-filter coefficient for this channel
                        float preCoef = preFilterCoef_;
                        float postCoef = postFilterCoef_;

                        while (samplesRemain > 0)
                        {
                            // Prefetch
                            if (inputPtr)
                                hwy::Prefetch(inputPtr + offset);

                            // Load input samples
                            FltType inputV;
                            if (samplesRemain >= numLanes)
                            {
                                inputV = HWY::LoadU(_flttype, inputPtr + offset);
                            }
                            else
                            {
                                const FltMaskType mask = HWY::FirstN(_flttype, samplesRemain);
                                inputV = HWY::MaskedLoad(mask, _flttype, inputPtr + offset);
                            }

                            // Pre-filter
                            FltType wetV = inputV;
                            if (preCoef > 0.0f)
                            {
                                const FltType preCoefVScalar = HWY::Set(_flttype, preCoef);
                                FltType preState = HWY::Set(_flttype, preFilterState_[ch]);
                                wetV = HWY::MulAdd(HWY::Sub(HWY::Set(_flttype, 1.0f), preCoefVScalar), inputV, HWY::Mul(preCoefVScalar, preState));
                                preFilterState_[ch] = HWY::ExtractLane(wetV, 0);
                            }

                            // Apply bias
                            wetV = HWY::Add(wetV, currentBiasV);

                            // Apply drive (convert dB to linear)
                            const float driveGain = std::pow(10.0f, HWY::ExtractLane(currentDriveV, 0) * 0.05f);
                            const FltType driveGainV = HWY::Set(_flttype, driveGain);
                            wetV = HWY::Mul(wetV, driveGainV);

                            // Shape
                            wetV = shapeSampleSIMD(_flttype, wetV, currentCurve);

                            // Apply output gain
                            const float outputGain = std::pow(10.0f, HWY::ExtractLane(currentOutputV, 0) * 0.05f);
                            const FltType outputGainV = HWY::Set(_flttype, outputGain);
                            wetV = HWY::Mul(wetV, outputGainV);

                            // Post-filter
                            if (postCoef > 0.0f)
                            {
                                const FltType postCoefVScalar = HWY::Set(_flttype, postCoef);
                                FltType postState = HWY::Set(_flttype, postFilterState_[ch]);
                                wetV = HWY::MulAdd(HWY::Sub(HWY::Set(_flttype, 1.0f), postCoefVScalar), wetV, HWY::Mul(postCoefVScalar, postState));
                                postFilterState_[ch] = HWY::ExtractLane(wetV, 0);
                            }

                            // Mix
                            const FltType dryV = inputV;
                            const FltType mixV = currentMixV;
                            const FltType outputV = HWY::MulAdd(dryV, HWY::Sub(HWY::Set(_flttype, 1.0f), mixV), HWY::Mul(wetV, mixV));

                            // Store output
                            if (samplesRemain >= numLanes)
                            {
                                HWY::StoreU(outputV, _flttype, outputPtr + offset);
                                samplesRemain -= numLanes;
                                offset += numLanes;
                            }
                            else
                            {
                                const FltMaskType mask = HWY::FirstN(_flttype, samplesRemain);
                                HWY::BlendedStore(outputV, mask, _flttype, outputPtr + offset);
                                samplesRemain = 0;
                            }
                        }
                    }
                }

            private:
                HWY_ATTR void updateFilterCoefficients()
                {
                    const float preFilter = targetPreFilter_->load(std::memory_order_acquire);
                    const float postFilter = targetPostFilter_->load(std::memory_order_acquire);
                    const float sr = static_cast<float>(sampleRate_ > 0.0 ? sampleRate_ : 44100.0);
                    const float twoPi = 2.0f * juce::MathConstants<float>::pi;

                    if (preFilter > 20.0f)
                    {
                        preFilterCoef_ = std::exp(-twoPi * (preFilter / sr));
                        preFilterCoef_ = juce::jlimit(0.0f, 0.999f, preFilterCoef_);
                    }
                    else
                    {
                        preFilterCoef_ = 0.0f;
                    }

                    if (postFilter > 20.0f)
                    {
                        postFilterCoef_ = std::exp(-twoPi * (postFilter / sr));
                        postFilterCoef_ = juce::jlimit(0.0f, 0.999f, postFilterCoef_);
                    }
                    else
                    {
                        postFilterCoef_ = 0.0f;
                    }
                }

                HWY_ATTR HWY_INLINE FltType shapeSampleSIMD(const hwy::HWY_NAMESPACE::ScalableTag<float> & _flttype, FltType x, int curveType)
                {
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const FltType one = HWY::Set(_flttype, 1.0f);
                    const FltType zero = HWY::Sub(one, one);
                    const FltType half = HWY::Set(_flttype, 0.5f);
                    const FltType two = HWY::Add(half, half);
                    const FltType three = HWY::Add(two, one);
                    const FltType four = HWY::Add(two, two);
                    const FltType five = HWY::Add(four, one);
                    const FltType six = HWY::Add(five, one);
                    const FltType ten = HWY::Mul(two, five);
                    const FltType threshold = HWY::Set(_flttype, 1.0f);
                    const FltType thresholdHalf = HWY::Set(_flttype, 0.5f);

                    switch (curveType)
                    {
                        case 0: // Tanh
                            return CustomTanh(x);
                        case 1: // Tube
                        {
                            FltType xPos = HWY::IfThenElse(HWY::Gt(x, zero), HWY::Mul(x, HWY::Set(_flttype, 1.2f)), x);
                            FltType xPosClamped = HWY::IfThenElse(HWY::Gt(xPos, one), one, HWY::IfThenElse(HWY::Lt(xPos, HWY::Neg(one)), HWY::Neg(one), xPos));
                            FltType xNeg = HWY::IfThenElse(HWY::Lt(x, zero), HWY::Mul(x, HWY::Set(_flttype, 0.8f)), x);
                            FltType xNegClamped = HWY::IfThenElse(HWY::Gt(xNeg, one), one, HWY::IfThenElse(HWY::Lt(xNeg, HWY::Neg(one)), HWY::Neg(one), xNeg));
                            FltType result = HWY::Mul(HWY::Mul(CustomTanh(xPosClamped), HWY::Set(_flttype, 0.9f)), HWY::IfThenElse(HWY::Gt(x, zero), one, zero));
                            result = HWY::Add(result, HWY::Mul(CustomTanh(xNegClamped), HWY::IfThenElse(HWY::Lt(x, zero), one, zero)));
                            return result;
                        }
                        case 2: // Tape
                        {
                            const float tapeScale = 2.0f / juce::MathConstants<float>::pi;
                            const float atanInput = HWY::ExtractLane(HWY::Mul(x, HWY::Set(_flttype, 1.5f)), 0);
                            return HWY::Set(_flttype, tapeScale * std::atan(atanInput));
                        }
                        case 3: // HardClip
                            return HWY::IfThenElse(HWY::Gt(x, one), one, HWY::IfThenElse(HWY::Lt(x, HWY::Neg(one)), HWY::Neg(one), x));
                        case 4: // Foldback
                        {
                            FltType absX = HWY::Abs(x);
                            FltType folded = HWY::Sub(thresholdHalf, HWY::Sub(absX, thresholdHalf));
                            folded = HWY::IfThenElse(HWY::Gt(folded, thresholdHalf), thresholdHalf, HWY::IfThenElse(HWY::Lt(folded, HWY::Neg(thresholdHalf)), HWY::Neg(thresholdHalf), folded));
                            return HWY::IfThenElse(HWY::Le(absX, thresholdHalf), x, HWY::IfThenElse(HWY::Gt(x, zero), folded, HWY::Neg(folded)));
                        }
                        case 5: // Sigmoid
                        {
                            FltType xSq = HWY::Mul(x, x);
                            return HWY::Div(x, HWY::Add(one, HWY::Sqrt(HWY::Add(one, xSq))));
                        }
                        case 6: // SoftClip
                        {
                            FltType absX = HWY::Abs(x);
                            FltType result = HWY::IfThenElse(HWY::Le(absX, thresholdHalf), x,
                                HWY::Mul(CustomTanh(HWY::Sub(absX, thresholdHalf)), HWY::Mul(three, HWY::Sub(one, half))));
                            return HWY::Mul(HWY::Mul(HWY::Mul(HWY::IfThenElse(HWY::Gt(x, zero), one, zero), CustomTanh(absX)), HWY::IfThenElse(HWY::Gt(x, zero), one, zero)), result);
                        }
                        default:
                            return CustomTanh(x);
                    }
                }

                const std::atomic<float> * targetDrive_;
                const std::atomic<float> * targetOutput_;
                const std::atomic<float> * targetBias_;
                const std::atomic<float> * targetMix_;
                const std::atomic<float> * targetPreFilter_;
                const std::atomic<float> * targetPostFilter_;
                const std::atomic<int> * targetCurve_;
                const std::atomic<int> * targetOversample_;

                int currentCurve_;
                int currentOversample_;
                int oversampleFactor_;
                int numChannels_;
                float preFilterCoef_;
                float postFilterCoef_;
                float preFilterState_[2];
                float postFilterState_[2];
                float sampleRate_;
                bool configChanged_;
                size_t laneCount_;
                hwy::AlignedFreeUniquePtr<float[]> smoothDrive_;
                hwy::AlignedFreeUniquePtr<float[]> smoothOutput_;
                hwy::AlignedFreeUniquePtr<float[]> smoothBias_;
                hwy::AlignedFreeUniquePtr<float[]> smoothMix_;
                hwy::AlignedFreeUniquePtr<float[]> smoothPreFilter_;
                hwy::AlignedFreeUniquePtr<float[]> smoothPostFilter_;
            };

            //Create CPU specific instance
            HWY_API IPrimitiveNodeSIMDImplementation * __CreateInstanceForCPU(int numChannels)
            {
                return new WaveShaperNodeSIMDImplementation(numChannels);
            }
        }

        //========================================================================
        //Highway bootstrap

        #if HWY_ONCE || HWY_IDE

            IPrimitiveNodeSIMDImplementation * __CreateInstance(int numChannels)
            {
                HWY_EXPORT_T(_create_instance_table, __CreateInstanceForCPU);
                return HWY_DYNAMIC_DISPATCH_T(_create_instance_table)(numChannels);
            }

        #endif
    }
}