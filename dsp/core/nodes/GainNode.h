#pragma once

#include "dsp/core/graph/PrimitiveNode.h"

#include <atomic>
#include <memory>

// Forward declaration for SIMD implementation
class IPrimitiveNodeSIMDImplementation;

namespace dsp_primitives {

class GainNode : public IPrimitiveNode, public std::enable_shared_from_this<GainNode> {
public:
    explicit GainNode(int numChannels = 2);
    
    const char* getNodeType() const override { return "Gain"; }
    int getNumInputs() const override { return 1; }
    int getNumOutputs() const override { return 1; }
    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;

    void setGain(float gain);
    float getGain() const;
    void setMuted(bool muted);
    void reset();
    bool isMuted() const;


    //Because constructor is explicit, we cannot set the target using it
    //Instead we have an override method that the testing system can use instead.
    void overrideHighwayImplementationTarget(int target)
    {
        //Ensure this is called before prepare()
        if(simd_implementation_ != NULL)
            throw "Cannot override SIMD target when implementation has been instantiated";

        simdTarget_ = target;
    }

    const char * getHighwayImplementationTargetName() const
    {
        if(simd_implementation_.get() == NULL)
            return NULL;

        return simd_implementation_->targetName();
    }

    int getHighwayErrorCode() const { return highwayErrCode_;}

private:
    inline void notifyConfigChangeSimdImplementation()
    {
        if(simd_implementation_ != nullptr)
            simd_implementation_->configChanged();
    }

    int numChannels_ = 2;
    int simdTarget_ = 0;
    int highwayErrCode_ = 0;

    std::atomic<float> targetGain_{1.0f};
    std::atomic<bool> muted_{false};

    float currentGain_ = 1.0f;
    float smoothingCoeff_ = 1.0f;
    bool prepared_ = false;

    // SIMD implementation
    std::unique_ptr<IPrimitiveNodeSIMDImplementation> simd_implementation_;
};

} // namespace dsp_primitives
