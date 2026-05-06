//Do not guard against multiple inclusions - Highway works by including this file multiple times, once for each SIMD implementation

#undef HWY_TARGET_INCLUDE 
#define HWY_TARGET_INCLUDE "dsp/core/nodes/FilterNode_Highway.h"

#include "manifold/highway/HighwayWrapper.h"
#include "manifold/highway/HighwayMaths.h"
#include "manifold/highway/HighwaySmoother.h"
#include "manifold/highway/HighwayUtils.h"

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
                typedef hwy::HWY_NAMESPACE::VFromD<hwy::HWY_NAMESPACE::BlockDFromD< hwy::HWY_NAMESPACE::DFromV<FltType>>> FltBlkType;
                typedef hwy::HWY_NAMESPACE::VFromD<hwy::HWY_NAMESPACE::ScalableTag<int32_t>> IntType;
                typedef hwy::HWY_NAMESPACE::MFromD<hwy::HWY_NAMESPACE::ScalableTag<int32_t>> IntMaskType;
                typedef hwy::HWY_NAMESPACE::MFromD<hwy::HWY_NAMESPACE::ScalableTag<float>> FltMaskType;
                typedef hwy::HWY_NAMESPACE::MFromD<hwy::HWY_NAMESPACE::BlockDFromD< hwy::HWY_NAMESPACE::DFromV<FltType>>> FltBlkMaskType;

            public:
                FilterNodeSIMDImplementation(const std::atomic<float> * targetCutoffHz,
                                            const std::atomic<float> * targetResonance,
                                            const std::atomic<float> * targetMix)        : laneCount_(0),configChanged_(true)
                {
                    smoother_.initialise(targetCutoffHz, targetResonance, targetMix);
                }

                HWY_ATTR virtual void prepare(float sampleRate) override
                {
                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    const size_t numLanes = HWY::Lanes(_flttype);

                    //Set up value smoother
                    const double sr = sampleRate > 1.0 ? sampleRate : 44100.0;
                    const double smoothingTimeSeconds = 0.02;
                    float smoothval = static_cast<float>(1.0 - std::exp(-1.0 / (smoothingTimeSeconds * sr)));
                    smoothval = juce::jlimit(0.0001f, 1.0f, smoothval);
                    smoother_.SetSmooth(smoothval);
                    smoother_.PrepareCurrentValues();

                    //Store 1 / sample rate
                    sampleRateRcp_ = hwy::AllocateAligned<float>(numLanes);
                    HWY::Store(HWY::Set(_flttype, static_cast<float>(1.0 / sr)), _flttype, sampleRateRcp_.get());

                    // Initialize feedback state to zero
                    //Two channels, so x number of lanes by 2
                    if(!z1_ || (numLanes != laneCount_))
                        z1_ = hwy::AllocateAligned<float>(numLanes * 2);

                    if(!z2_ || (numLanes != laneCount_))
                        z2_ = hwy::AllocateAligned<float>(numLanes * 2);

                    memset(z1_.get(), 0, numLanes * 2 * sizeof(float));
                    memset(z2_.get(), 0, numLanes * 2 * sizeof(float));

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
                    //Two channels, so x number of lanes by 2
                    if(!z1_ || (numLanes != laneCount_))
                        z1_ = hwy::AllocateAligned<float>(numLanes * 2);

                    if(!z2_ || (numLanes != laneCount_))
                        z2_ = hwy::AllocateAligned<float>(numLanes * 2);

                    memset(z1_.get(), 0, numLanes * 2 * sizeof(float));
                    memset(z2_.get(), 0, numLanes * 2 * sizeof(float));
                }

                HWY_ATTR virtual void run(const std::vector<AudioBufferView> & inputs,
                                 std::vector<WritableAudioBufferView> & outputs,
                                 int numsamples) override
                {
                    //It is assumed that the caller, the base implementation of FilterNode, has 
                    //already checked the input and output buffer counts

                    const hwy::HWY_NAMESPACE::ScalableTag<float> _flttype;
                    const hwy::HWY_NAMESPACE::DFromV<FltBlkType> _blktype;
                    namespace HWY = hwy::HWY_NAMESPACE;
                    constexpr size_t numLanes = _flttype.MaxLanes();
                    constexpr size_t lanesPerBlock = 4; //128 bits
                    constexpr size_t numBlocks = _flttype.MaxBlocks();

                    if((laneCount_ != numLanes) || (configChanged_))
                    {
                        laneCount_ = numLanes;
                        configChanged_ = false;
                        smoother_.UpdateTargetValues();
                    }
                    
                   
                    const float * inputPtrL = inputs[0].channelData[0];
                    const float * inputPtrR = (inputs[0].numChannels > 1) ? inputs[0].channelData[1] : NULL;
                    float * outputPtrL = outputs[0].channelData[0];
                    float * outputPtrR = (outputs[0].numChannels > 1) ? outputs[0].channelData[1] : NULL;
                    
                    const FltType one = HWY::Set(_flttype, 1.0f);
                    const FltType zero = HWY::Sub(one,one);
                    const FltType sampleRateRcp = HWY::Load(_flttype, sampleRateRcp_.get());
                    const FltType neg2xpi = HWY::Set(_flttype, -2 * 3.141592653589793238f);
                    const FltType minNormalised = HWY::Set(_flttype, 0.0001f);
                    const FltType maxNormalised = HWY::Set(_flttype, 0.49f);
                    const FltType resonanceScaler = HWY::Set(_flttype, 0.6f);
                    const FltType feedbackScaler = HWY::Set(_flttype, -0.85f);
                    const FltBlkMaskType upperBlockMask = HWY::Dup128MaskFromMaskBits(_blktype, 0xC);

                    //Load current state
                    FltType z1L = HWY::Load(_flttype, z1_.get());
                    FltType z1R = HWY::Load(_flttype, z1_.get() + numLanes);
                    FltType z2L = HWY::Load(_flttype, z2_.get());
                    FltType z2R = HWY::Load(_flttype, z2_.get() + numLanes);
                    FltType currentResonance = zero;
                    FltType currentMix = currentResonance;
                    FltType currentCutoff = currentResonance;
                    FltType inL, inR, normalised, alpha, negfeedback, tmp, origL, origR;
                    FltType outL = zero;
                    FltType outR = zero;
                    FltMaskType  sampleLaneMask;
                    FltBlkType curAlpha, curNegFeedback, curIn, curZ1, curZ2, x, z1Lower, z2Lower;
                    
                    //Start the smoother to get current state
                    Smoother::ValueType targetValues, currentValues, smoothValues;
                    smoother_.Start(targetValues, currentValues, smoothValues);

                    //Pre-fetch
                    hwy::Prefetch(inputPtrL);
                    if(inputPtrR != NULL)
                        hwy::Prefetch(inputPtrR);

                    size_t sampleLaneCount;
                    size_t offset = 0;
                    size_t samplesRemain = static_cast<size_t>(numsamples);
                    while (samplesRemain > 0)
                    {
                        if(samplesRemain >= numLanes)
                        {
                            sampleLaneCount = numLanes;
                            inL =  HWY::LoadU(_flttype, inputPtrL + offset);
                            inR = (inputPtrR == NULL) ? inL : HWY::LoadU(_flttype, inputPtrR + offset);
                            sampleLaneMask = HWY::Not(HWY::MaskFalse(_flttype));
                        }
                        else
                        {
                            sampleLaneCount = samplesRemain;
                            sampleLaneMask = HWY::FirstN(_flttype, sampleLaneCount);
                            
                            //Partial read - 
                            inL = HWY::MaskedLoad(sampleLaneMask, _flttype, inputPtrL + offset);
                            inR = (inputPtrR == NULL) ? inL : HWY::MaskedLoad(sampleLaneMask, _flttype, inputPtrR + offset);
                        }
                        
                        //Run the smoother to get the next N values for cutoff, resonance and mix.
                        //Run it in reverse mode to return the values in reverse order (such that lane 0 contains the last value)
                        smoother_.Run(sampleLaneCount, smoothValues, targetValues, currentValues,
                                       currentCutoff, currentResonance, currentMix);

                        //const float feedback = resonance_ * 0.85f;
                        //We've set 'feedbackScaler' to a negative value, thus negfeedback = resonance_ * -0.85f
                        negfeedback = HWY::Mul(currentResonance, feedbackScaler);

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

                        //z1 and z2 depend on previous values -
                        //and the next z1 and z2 depend on the X value caclulated for the 'current' sample
                        //Each lane represents 1 sample in time, thus we need to calculate the X, z1 and z2 values
                        //based on previous ones.
                        //
                        //
                        //Work on a block by block basis - where a block consists of 2 samples of 2 channels each.
                        //This prevents multiple blocks being operated on at the same time, which can decrease performance
                        //with certain operations (e.g: shifting lanes)
                        //
                        //First get the latest Z values into the block.
                        //The first part of the for loop will Broadcast the last lane in that block - we just want to 
                        //positon the last block for broadcasting of its last lanes.
                        //We also interleave left and right channels into a single vector - which is where the '2 samples of 2 channels in a block' comes from... 
                        curZ1 = HWY::InterleaveUpper(_blktype, HWY::ResizeBitCast(_blktype, HWY::BroadcastBlock<numBlocks-1>(z1L)), HWY::ResizeBitCast(_blktype, HWY::BroadcastBlock<numBlocks-1>(z1R)));
                        curZ2 = HWY::InterleaveUpper(_blktype, HWY::ResizeBitCast(_blktype, HWY::BroadcastBlock<numBlocks-1>(z2L)), HWY::ResizeBitCast(_blktype, HWY::BroadcastBlock<numBlocks-1>(z2R)));
                        origL = inL;
                        origR = inR;
                        for(size_t i=0; i < numLanes; i += lanesPerBlock)
                        {
                            //Take the last values in the Z blocks
                            curZ1 = HWY::Per4LaneBlockShuffle<3,2,3,2>(curZ1);
                            curZ2 = HWY::Per4LaneBlockShuffle<3,2,3,2>(curZ2);

                            //SlideDownBlocks<1> will faill to build if there are only 1 blocks (4 lanes) per register
                            //In that situation, there is no need to shift or cast - since a block and FltType types are the same size.
                            #if HWY_MAX_BYTES > 16
                                if(i > 0)
                                {
                                    //Next block of samples
                                    inL = HWY::SlideDownBlocks<1>(_flttype, inL);
                                    inR = HWY::SlideDownBlocks<1>(_flttype, inR);

                                    //Next block of smoothed values
                                    alpha = HWY::SlideDownBlocks<1>(_flttype, alpha);
                                    negfeedback = HWY::SlideDownBlocks<1>(_flttype, negfeedback);
                                }
                            #endif

                            //Use the current bottom 4 lanes of the values to make a block of 2 samples of 2 channels (4 values, 2 values per sample)
                            curIn= HWY::InterleaveLower(_blktype, HWY::ResizeBitCast(_blktype,inL), HWY::ResizeBitCast(_blktype, inR));

                            //Alpha and feedback values are the same for both channels
                            //
                            //X1 X1 | X0 X0
                            curAlpha = HWY::Per4LaneBlockShuffle<1,1,0,0>(HWY::ResizeBitCast(_blktype, alpha));
                            curNegFeedback = HWY::Per4LaneBlockShuffle<1,1,0,0>(HWY::ResizeBitCast(_blktype, negfeedback));

                            //Value 0
                            //
                            //Zx = Zx_R1, Zx_L1 | Zx_R0 Zx_L0
                            x = HWY::MulAdd(curNegFeedback, HWY::Sub(curZ2, curZ1), curIn); //const float x = in - feedback * (z2_[idx] - z1_[idx]);
                            curZ1 = HWY::MulAdd( curAlpha, HWY::Sub(x, curZ1), curZ1); // z1_[idx] += alpha * (x - z1_[idx]);
                            curZ2 = HWY::MulAdd(curAlpha, HWY::Sub(curZ1, curZ2), curZ2); //z2_[idx] += alpha * (z1_[idx] - z2_[idx]);

                            //Value 1
                            curZ1 = HWY::Per4LaneBlockShuffle<1, 0, 1, 0>(curZ1); //duplicate value 0 into value 1 lanes
                            curZ2 = HWY::Per4LaneBlockShuffle<1, 0, 1, 0>(curZ2);
                            x = HWY::MulAdd(curNegFeedback, HWY::Sub(curZ2, curZ1), curIn); //const float x = in - feedback * (z2_[idx] - z1_[idx]);
                            curZ1 = HWY::MaskedMulAddOr(curZ1, upperBlockMask, curAlpha, HWY::Sub(x, curZ1), curZ1); // z1_[idx] += alpha * (x - z1_[idx]);
                            z1Lower = curZ1;
                            curZ2 = HWY::MaskedMulAddOr(curZ2, upperBlockMask,  curAlpha, HWY::Sub(curZ1, curZ2), curZ2); //z2_[idx] += alpha * (z1_[idx] - z2_[idx]);
                            z2Lower = curZ2;

                            //------------------------------

                            //Upper half of block carries on from where the lower half of block left off above
                            //3R 3L | 2R 2L
                            curZ1 = HWY::Per4LaneBlockShuffle<3, 2, 3, 2>(curZ1);
                            curZ2 = HWY::Per4LaneBlockShuffle<3, 2, 3, 2>(curZ2);

                            //Get upper block of samples 
                            curIn= HWY::InterleaveUpper(_blktype, HWY::ResizeBitCast(_blktype, inL), HWY::ResizeBitCast(_blktype, inR));

                            //Alpha and feedback values are the same for both channels
                            //
                            //X3 X3 | X2 X2
                            curAlpha = HWY::Per4LaneBlockShuffle<3,3,2,2>(HWY::ResizeBitCast(_blktype, alpha));
                            curNegFeedback = HWY::Per4LaneBlockShuffle<3,3,2,2>(HWY::ResizeBitCast(_blktype, negfeedback));

                            //Value 2
                            //
                            //Zx = Zx_R1, Zx_L1 | Zx_R0 Zx_L0
                            x = HWY::MulAdd(curNegFeedback, HWY::Sub(curZ2, curZ1), curIn); //const float x = in - feedback * (z2_[idx] - z1_[idx]);
                            curZ1 = HWY::MulAdd( curAlpha, HWY::Sub(x, curZ1), curZ1); // z1_[idx] += alpha * (x - z1_[idx]);
                            curZ2 = HWY::MulAdd(curAlpha, HWY::Sub(curZ1, curZ2), curZ2); //z2_[idx] += alpha * (z1_[idx] - z2_[idx]);

                            //Value 3
                            curZ1 = HWY::Per4LaneBlockShuffle<1, 0, 1, 0>(curZ1); //duplicate value 0 into value 1 lanes
                            curZ2 = HWY::Per4LaneBlockShuffle<1, 0, 1, 0>(curZ2);
                            x = HWY::MulAdd(curNegFeedback, HWY::Sub(curZ2, curZ1), curIn); //const float x = in - feedback * (z2_[idx] - z1_[idx]);
                            curZ1 = HWY::MaskedMulAddOr(curZ1, upperBlockMask, curAlpha, HWY::Sub(x, curZ1), curZ1); // z1_[idx] += alpha * (x - z1_[idx]);
                            curZ2 = HWY::MaskedMulAddOr(curZ2, upperBlockMask,  curAlpha, HWY::Sub(curZ1, curZ2), curZ2); //z2_[idx] += alpha * (z1_[idx] - z2_[idx]);
                            

                            //Put blocks back into z1 and z2
                        #if HWY_MAX_BYTES  > 16
                            z1L = HWY::InsertBlock<numBlocks - 1>(HWY::SlideDownBlocks<1>(_flttype, z1L), HWY::ConcatEven(_blktype,  curZ1, z1Lower));
                            z1R = HWY::InsertBlock<numBlocks - 1>(HWY::SlideDownBlocks<1>(_flttype, z1R), HWY::ConcatOdd(_blktype,  curZ1, z1Lower));
                            z2L = HWY::InsertBlock<numBlocks - 1>(HWY::SlideDownBlocks<1>(_flttype, z2L), HWY::ConcatEven(_blktype,  curZ2, z2Lower));
                            z2R = HWY::InsertBlock<numBlocks - 1>(HWY::SlideDownBlocks<1>(_flttype, z2R), HWY::ConcatOdd(_blktype,  curZ2, z2Lower));
                        #else
                            //Blocks are same size as vector - just separate left and right 
                            z1L = HWY::ConcatEven(_blktype, curZ1, z1Lower);
                            z1R = HWY::ConcatOdd(_blktype, curZ1, z1Lower);
                            z2L = HWY::ConcatEven(_blktype, curZ2, z2Lower);
                            z2R = HWY::ConcatOdd(_blktype, curZ2, z2Lower);
                        #endif
                        }

                        //const float filtered = z2_[idx];
                        //outputs[idx].setSample(ch, i, in * dry + filtered * wet);
                        //
                        //'filtered' is z2
                        //'wet' is currentMix
                        //'dry' is 1 - currentMix
                        outL = HWY::MulAdd(z2L, currentMix, HWY::Mul(origL, HWY::Sub(one, currentMix)));
                        outR = HWY::MulAdd(z2R, currentMix, HWY::Mul(origR, HWY::Sub(one, currentMix)));

                        // Store output
                        if (samplesRemain >= numLanes)
                        {
                            HWY::StoreU(outL, _flttype, outputPtrL + offset);
                            if (outputPtrR != NULL)
                                HWY::StoreU(outR, _flttype, outputPtrR + offset);

                            samplesRemain -= numLanes;
                            offset += numLanes;
                        }
                        else
                        {
                            HWY::StoreN(outL,  _flttype, outputPtrL + offset, samplesRemain);
                            if (outputPtrR != NULL)
                                HWY::StoreN(outR, _flttype, outputPtrR + offset, samplesRemain);

                            //Broadcast the last Z values to the vector with the correct and latest Z values in the upper lames
                            if(samplesRemain > 1)
                            {
                                z1L = HWY::SlideDownLanes(_flttype, z1L, samplesRemain - 1);
                                z1R = HWY::SlideDownLanes(_flttype, z1R, samplesRemain - 1);
                                z2L = HWY::SlideDownLanes(_flttype, z2L, samplesRemain - 1);
                                z2R = HWY::SlideDownLanes(_flttype, z2R, samplesRemain - 1);
                            }

                            //Make sure the upper lane is set to the latest value
                            //(quicker to broadcast said value, which should be in lane 0)
                            z1L = HWY::BroadcastLane<0>(z1L);
                            z1R = HWY::BroadcastLane<0>(z1R);
                            z2L = HWY::BroadcastLane<0>(z2L);
                            z2R = HWY::BroadcastLane<0>(z2R);

                            samplesRemain = 0;
                            offset += sampleLaneCount;
                        }
                    }

                    //Update state
                    smoother_.End(currentValues);
                    HWY::Store(z1L, _flttype, z1_.get());
                    HWY::Store(z1R, _flttype, z1_.get() + numLanes);
                    HWY::Store(z2L, _flttype, z2_.get());
                    HWY::Store(z2R, _flttype, z2_.get() + numLanes);
                }

            private:
                typedef hwy::HWY_NAMESPACE::HighwayValueSmoother<float, 3> Smoother;

                Smoother smoother_;
                hwy::AlignedFreeUniquePtr<float[]> z1_;
                hwy::AlignedFreeUniquePtr<float[]> z2_;
                hwy::AlignedFreeUniquePtr<float[]> sampleRateRcp_;

                size_t laneCount_;
                bool configChanged_;
                
            };

            //Create CPU specific instance
            HWY_API IPrimitiveNodeSIMDImplementation *  __CreateInstanceForCPU(const std::atomic<float> * targetCutoffHz,
                                                                                const std::atomic<float> * targetResonance,
                                                                                const std::atomic<float> * targetMix)
            {
                return new FilterNodeSIMDImplementation(targetCutoffHz, targetResonance, targetMix);
            }
        }

        //========================================================================
        //Highway bootstrap

        #if HWY_ONCE || HWY_IDE

            IPrimitiveNodeSIMDImplementation *  __CreateInstance(int target, 
                                                                 const std::atomic<float> * targetCutoffHz,
                                                                const std::atomic<float> * targetResonance,
                                                                const std::atomic<float> * targetMix,
                                                                hwy::RunHighwayErrorCode * retErrorCode)
            {
                HWY_EXPORT_T(_create_instance_table, __CreateInstanceForCPU);
                IPrimitiveNodeSIMDImplementation * retiface = NULL;

                hwy::RunHighwayErrorCode res =  hwy::RunHighwayFunction(target, &retiface, HWY_DISPATCH_TABLE(_create_instance_table),
                                                                        targetCutoffHz, targetResonance, targetMix);

                *retErrorCode = res;
                return retiface;
            }

        #endif
    }
}