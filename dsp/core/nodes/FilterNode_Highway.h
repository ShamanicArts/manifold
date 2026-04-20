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
                      sampleRate_(sampleRate), laneCount_(0),configChanged_(true)
                {}

                HWY_ATTR virtual void prepare(float sampleRate) override
                {
                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const int numValues = 2;
                    const size_t numLanes = HWY::Lanes(_flttype);

                    if((laneCount_ != numLanes) || (configChanged_))
                        configure();

                    const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
                    const double smoothingTimeSeconds = 0.02;
                    
                    if(!smooth_ || (numLanes != laneCount_))
                        smooth_ = hwy::AllocateAligned<float>(numLanes);
                    
                    float smoothval = static_cast<float>(1.0 - std::exp(-1.0 / (smoothingTimeSeconds * sr)));
                    smoothval = juce::jlimit(0.0001f, 1.0f, smoothval);
                    HWY::Store(HWY::Set(_flttype, smoothval),  _flttype, smooth_.get());

                    //Set up current state
                    if(!currentState_ || (numLanes != laneCount_))
                        currentState_ = hwy::AllocateAligned<float>( (numValues < numLanes) ? numLanes : ((1+(numValues / numLanes)) * numLanes)  );

                    float * stateptr = currentState_.get();
                    stateptr[StateIndex_CutOff] = targetCutoffHz_->load(std::memory_order_acquire);
                    stateptr[StateIndex_Mix] = targetMix_->load(std::memory_order_acquire);
                    stateptr[StateIndex_Resonance] = targetResonance_->load(std::memory_order_acquire);
                   
                    // Initialize feedback state to zero
                    if(!z1_ || (numLanes != laneCount_))
                        z1_ = hwy::AllocateAligned<float>(numLanes);

                    if(!z2_ || (numLanes != laneCount_))
                        z2_ = hwy::AllocateAligned<float>(numLanes);

                    memset(z1_.get(), 0, numLanes * sizeof(float));
                    memset(z2_.get(), 0, numLanes * sizeof(float));

                    laneCount_ = numLanes;
                }

                virtual void configChanged() override
                {
                    configChanged_ = true;
                }

                const char * targetName() const override
                {
                    return  hwy::TargetName(HWY_TARGET);
                }

                HWY_ATTR virtual void reset() override
                {
                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const size_t numLanes = HWY::Lanes(_flttype);

                     // Initialize feedback state to zero
                    if(!z1_ || (numLanes != laneCount_))
                        z1_ = hwy::AllocateAligned<float>(numLanes);

                    if(!z2_ || (numLanes != laneCount_))
                        z2_ = hwy::AllocateAligned<float>(numLanes);

                    memset(z1_.get(), 0, numLanes * sizeof(float));
                    memset(z2_.get(), 0, numLanes * sizeof(float));
                }

                HWY_ATTR virtual void run(const std::vector<AudioBufferView> & inputs,
                                 std::vector<WritableAudioBufferView> & outputs,
                                 int numsamples) override
                {
                    //It is assumed that the caller, the base implementation of FilterNode, has 
                    //already checked the input and output buffer counts

                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const size_t numLanes = HWY::Lanes(_flttype);
                    const size_t lanesPerBlock = 4; //128 bits
                    const size_t numBlocks = HWY::Blocks(_flttype);

                    if((laneCount_ != numLanes) || (configChanged_))
                        configure();

                    
                    const float targetCutoffScalar = targetCutoffHz_->load(std::memory_order_acquire);
                    const float targetResonanceScalar = targetResonance_->load(std::memory_order_acquire);
                    const float targetMixScalar = targetMix_->load(std::memory_order_acquire);

                    const float * inputPtrL = inputs[0].channelData[0];
                    const float * inputPtrR = (inputs[0].numChannels > 1) ? inputs[0].channelData[1] : NULL;
                    float * outputPtrL = outputs[0].channelData[0];
                    float * outputPtrR = (outputs[0].numChannels > 1) ? outputs[0].channelData[1] : NULL;
                    size_t offset = 0;
                    size_t samplesRemain = static_cast<size_t>(numsamples);

                    const FltType one = HWY::Set(_flttype, 1.0f);
                    const FltType zero = HWY::Sub(one,one);
                    const FltType sampleRateRcp = HWY::Set(_flttype, static_cast<float>(1.0 / sampleRate_));
                    const FltType neg2xpi = HWY::Set(_flttype, -2 * 3.141592653589793238f);
                    const FltType minNormalised = HWY::Set(_flttype, 0.0001f);
                    const FltType maxNormalised = HWY::Set(_flttype, 0.49f);
                    const FltType resonanceScaler = HWY::Set(_flttype, 0.6f);
                    const FltType feedbackScaler = HWY::Set(_flttype, -0.85f);

                    //Load current state
                    FltType currentStateValues = HWY::Load(_flttype, currentState_.get());
                    FltType targetStateValues = HWY::Load(_flttype, targetState_.get());
                    FltType smooth = HWY::Load(_flttype, smooth_.get());
                    FltType z1 = HWY::Load(_flttype, z1_.get());
                    FltType z2 = HWY::Load(_flttype, z2_.get());
                    FltType currentResonance = HWY::Zero(_flttype);
                    FltType currentMix = currentResonance;
                    FltType currentCutoff = currentResonance;
                    FltType newStateValues, inL, inR, normalised, alpha, negfeedback, x, tmp, combinedIn, curInL, curInR;
                    FltType outL = zero;
                    FltType outR = zero;
                    
                    FltMaskType stateMask, laneMask, sampleLaneMask;
                    size_t sampleLaneCount;
                    int blk;
                    while (samplesRemain > 0)
                    {
                        //Pre-fetch
                        hwy::Prefetch(inputPtrL + offset);
                        if(inputPtrR != NULL)
                            hwy::Prefetch(inputPtrR + offset);

                        sampleLaneCount = (samplesRemain > numLanes) ? numLanes : samplesRemain;

                        //Generate values for all lanes
                        stateMask = HWY::Not(HWY::MaskFalse(_flttype));
                        laneMask = HWY::FirstN(_flttype, static_cast<int>( StateIndex_Count));
                        for(int lane = 0; lane < sampleLaneCount; ++lane)
                        {
                            newStateValues = HWY::MulAdd(HWY::Sub(targetStateValues, currentStateValues), smooth, currentStateValues);
                            if((lane > 0) && HWY::AllFalse(_flttype, HWY::MaskedNe(laneMask, newStateValues, currentStateValues)))
                            {
                                //If we're here, then the target and current state values are no longer moving.
                                //Thus, it is safe to skip the calculation for the remainder of the lanes - since
                                //the broadcast(s) would have set the remainder of the lanes already.
                                //It does mean the broadcasts need running at least once, so only skip if lane > 0
                                
                                //Update state mask
                                stateMask =  HWY::SlideMaskUpLanes(_flttype, stateMask, sampleLaneCount - lane);
                                break;
                            }
                            
                            currentStateValues = newStateValues;
                            currentCutoff = HWY::IfThenElse(stateMask, HWY::BroadcastLane< static_cast<int>(StateIndex_CutOff) >(currentStateValues), currentCutoff);
                            currentResonance = HWY::IfThenElse(stateMask, HWY::BroadcastLane< static_cast<int>(StateIndex_Resonance) >(currentStateValues), currentResonance);
                            currentMix = HWY::IfThenElse(stateMask,  HWY::BroadcastLane< static_cast<int>(StateIndex_Mix) >(currentStateValues), currentMix);
                            stateMask = HWY::SlideMaskUpLanes(_flttype, stateMask, 1);
                        }

                        //mask out lanes we're not processing (due to incomplete block)
                        sampleLaneMask = HWY::Not(stateMask); 

                        // Compute alpha (biquad coefficient)
                        //
                        //const float normalized = juce::jlimit(0.0001f, 0.49f, currentCutoff / sr);  
                        //(1 / sr * currentCutOff)
                        normalised = HWY::Mul(sampleRateRcp, currentCutoff);
                        normalised = HWY::IfThenElse(HWY::Lt(normalised, minNormalised), minNormalised, normalised);
                        normalised = HWY::IfThenElse(HWY::Gt(normalised, maxNormalised), maxNormalised, normalised);
                        
                        //const float shaping = 1.0f + currentResonance * 0.6f;
                        tmp = HWY::MulAdd(currentResonance, resonanceScaler, one);
                        
                        //const float alpha = 1.0f - std::exp(-2.0f * piScalar * normalized * shaping);
                        //  - shaping is 'tmp'
                        //  - normalised is 'normalised'
                        //  - -2 x pi   is 'neg2xpi'
                        alpha = HWY::Mul(neg2xpi, normalised);
                        alpha = HWY::Mul(alpha, tmp);
                        alpha = HWY::Exp(_flttype, alpha);
                        alpha = HWY::Sub(one, alpha);

                        //const float feedback = resonance_ * 0.85f;
                        //We've set 'feedbackScaler' to a negative value, thus negfeedback = resonance_ * -0.85f
                        negfeedback = HWY::Mul(currentResonance, feedbackScaler);

                        // Load data from each channel
                        if(samplesRemain >= numLanes)
                        {
                            inL =  HWY::LoadU(_flttype, inputPtrL + offset);
                            inR = (inputPtrR == NULL) ? inL : HWY::LoadU(_flttype, inputPtrR + offset);
                        }
                        else
                        {
                            //Partial read - 
                            inL = HWY::MaskedLoad(sampleLaneMask, _flttype, inputPtrL + offset);
                            inR = (inputPtrR == NULL) ? inL : HWY::MaskedLoad(sampleLaneMask, _flttype, inputPtrR + offset);
                        }

                        //z1 and z2 depend on previous values -
                        //and the next z1 and z2 depend on the X value caclulated for the 'current' sample
                        //Each lane represents 1 sample in time, thus we need to calculate the X, z1 and z2 values
                        //based on previous ones.
                        //
                        //We use Highway blocks here, which are 128 bits, to process 2 samples of 2 channels (4x32 = 128)
                        laneMask = HWY::Not(HWY::MaskFalse(_flttype));
                        blk = 0;
                        curInL = inL;
                        curInR = inR;
                        do
                        {
                            //Combine the first L and R into lanes 0 and 1 respectivly
                            //Lane 0 = left
                            //Lane 1 = right
                            combinedIn = HWY::InterleaveLower(curInL, curInR);
                            
                            //Set up alpha and negative feedback vectors for processing stereo
                            //samples in groups of 2 blocks (4 values per block)
                            tmp = HWY::DupEven(alpha);
                            
                            //1 stereo sample - (left and right values) - per 64 bits
                            //a block is 128 bits
                            //Process both parts of a block
                            
                            //const float x = in - feedback * (z2_[idx] - z1_[idx]);
                            //X lane 0 is left
                            //X lane 1 is right
                            x = HWY::MulAdd(HWY::DupEven(negfeedback), HWY::Sub(z2, z1), combinedIn);

                            // z1_[idx] += alpha * (x - z1_[idx]);
                            z1 = HWY::MulAdd(tmp, HWY::Sub(x, z1), z1);
    
                            //z2_[idx] += alpha * (z1_[idx] - z2_[idx]);
                            z2 = HWY::MulAdd(tmp, HWY::Sub(z1, z2), z2);

                            //Swap 64 bits in each block (putting the next samples in lanes 0 and 1)
                            combinedIn = HWY::Shuffle1032(combinedIn);

                            //const float filtered = z2_[idx];
                            outL = HWY::IfThenElse(laneMask, HWY::BroadcastLane<0>(z2), outL);
                            outR = HWY::IfThenElse(laneMask, HWY::BroadcastLane<1>(z2), outR);

                            //Update mask for broadcasting to next lane
                            laneMask = HWY::SlideMask1Up(_flttype, laneMask);

                            //Exit on incomplete blocks
                            ++blk;
                            if(blk >= sampleLaneCount)
                                break;

                            //Use 'odd' this time for lane 1
                            tmp = HWY::DupOdd(alpha);
                            x = HWY::MulAdd(HWY::DupOdd(negfeedback), HWY::Sub(z2, z1), combinedIn);
                            z1 = HWY::MulAdd(tmp, HWY::Sub(x, z1), z1);
                            z2 = HWY::MulAdd(tmp, HWY::Sub(z1, z2), z2);

                            
                            //output current samples and prepare for Next 2 samples 
                            negfeedback = HWY::SlideDownLanes(_flttype, negfeedback, 2);
                            outL = HWY::IfThenElse(laneMask, HWY::BroadcastLane<0>(z2), outL);
                            alpha = HWY::SlideDownLanes(_flttype, alpha, 2);
                            outR = HWY::IfThenElse(laneMask, HWY::BroadcastLane<1>(z2), outR);
                            laneMask = HWY::SlideMask1Up(_flttype, laneMask);
                            curInL = HWY::Compress( inL, laneMask);
                            curInR = HWY::Compress(inR, laneMask);
                            ++blk;
                        }
                        while(blk < sampleLaneCount);

                        //outL and outR are all 'filtered' values for the approrpate channel and sample
                        //
                        //outputs[idx].setSample(ch, i, in * dry + filtered * wet);
                        //where 'filtered' is outL and  outR
                        //where 'wet' is currentMix
                        //where 'dry' is 1 - currentMix
                        outL = HWY::MulAdd(outL, currentMix, HWY::Mul(inL, HWY::Sub(one, currentMix)));
                        outR = HWY::MulAdd(outR, currentMix, HWY::Mul(inR, HWY::Sub(one, currentMix)));

                        // Store output
                        if (samplesRemain >= numLanes)
                        {
                            HWY::StoreU(outL, _flttype, outputPtrL + offset);
                            if (outputPtrR != NULL)
                                HWY::StoreU(outR, _flttype, outputPtrR + offset);
                        }
                        else
                        {
                            FltMaskType storeMask = HWY::FirstN(_flttype, samplesRemain);
                            HWY::BlendedStore(outL, storeMask, _flttype, outputPtrL + offset);
                            if (outputPtrR != NULL)
                                HWY::BlendedStore(outR, storeMask, _flttype, outputPtrR + offset);
                        }

                        //Next
                        size_t activeLaneCount = (samplesRemain >= numLanes) ? numLanes : samplesRemain;
                        samplesRemain -= activeLaneCount;
                        offset += activeLaneCount;
                    }

                    //Update state
                    HWY::Store(currentStateValues, _flttype, currentState_.get());
                    HWY::Store(z1, _flttype, z1_.get());
                    HWY::Store(z2, _flttype, z2_.get());
                }

            private:
                HWY_ATTR void configure()
                {
                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    
                    size_t numLanes = HWY::Lanes(_flttype);
                    const int numValues = StateIndex_Count;
                    
                    if(!targetState_ || (numLanes != laneCount_))
                        targetState_ = hwy::AllocateAligned<float>( (numValues < numLanes) ? numLanes : ((1+(numValues / numLanes)) * numLanes)  );
                    
                    //Set up target values
                    float * stateptr = targetState_.get();
                    stateptr[StateIndex_CutOff] = targetCutoffHz_->load(std::memory_order_acquire);
                    stateptr[StateIndex_Mix] = targetMix_->load(std::memory_order_acquire);
                    stateptr[StateIndex_Resonance] = targetResonance_->load(std::memory_order_acquire);
                   
                    if(!currentState_ || (numLanes != laneCount_))
                        currentState_ = hwy::AllocateAligned<float>( (numValues < numLanes) ? numLanes : ((1+(numValues / numLanes)) * numLanes)  );
                
                
                    configChanged_ = false;
                }

                enum State_Index
                {
                    StateIndex_CutOff = 0,
                    StateIndex_Resonance = 1,
                    StateIndex_Mix = 2,
                    StateIndex_Count = 3,
                };

                const std::atomic<float> * targetCutoffHz_;
                const std::atomic<float> * targetResonance_;
                const std::atomic<float> * targetMix_;
                double sampleRate_;

                hwy::AlignedFreeUniquePtr<float[]> smooth_;
                hwy::AlignedFreeUniquePtr<float[]> currentState_;
                hwy::AlignedFreeUniquePtr<float[]> targetState_;
                hwy::AlignedFreeUniquePtr<float[]> z1_;
                hwy::AlignedFreeUniquePtr<float[]> z2_;

                size_t laneCount_;
                bool configChanged_;
                
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