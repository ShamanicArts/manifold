#pragma once

#include "dsp/core/graph/PrimitiveNode.h"
#include "dsp/core/nodes/LoopPlaybackNode.h"
#include "dsp/core/nodes/SampleRegionPlaybackNode.h"

#include <atomic>
#include <memory>
#include <mutex>
#include <vector>

namespace dsp_primitives {

class RetrospectiveCaptureNode : public IPrimitiveNode,
                                 public std::enable_shared_from_this<RetrospectiveCaptureNode> {
public:
    explicit RetrospectiveCaptureNode(int numChannels = 2);

    const char* getNodeType() const override { return "RetrospectiveCapture"; }
    int getNumInputs() const override { return 1; }
    int getNumOutputs() const override { return 1; }
    void process(const std::vector<AudioBufferView>& inputs,
                 std::vector<WritableAudioBufferView>& outputs,
                 int numSamples) override;
    void prepare(double sampleRate, int maxBlockSize) override;

    void setCaptureSeconds(float seconds);
    float getCaptureSeconds() const;
    int getCaptureSize() const { return captureSize_.load(std::memory_order_acquire); }
    int getWriteOffset() const { return writeOffset_.load(std::memory_order_acquire); }
    void clear();

    bool copyRecentToLoop(const std::shared_ptr<LoopPlaybackNode>& playback,
                          int samplesBack,
                          bool overdub);
    bool copyRecentToLoop(const std::shared_ptr<LoopPlaybackNode>& playback,
                          int samplesBack,
                          bool overdub,
                          LoopPlaybackNode::OverdubLengthPolicy overdubLengthPolicy);
    bool copyRecentToLoop(const std::shared_ptr<SampleRegionPlaybackNode>& playback,
                          int samplesBack,
                          bool overdub);

    // Compute peaks for visualization (thread-safe, reads from capture buffer)
    // startAgo/endAgo: samples ago from current write position
    // Returns vector of peak values (0.0-1.0) sized to numBuckets
    std::vector<float> computePeaks(int startAgo, int endAgo, int numBuckets) const;

private:
    static constexpr int kPeakBlockSize = 64;

    void ensureBuffer(float sampleRate);
    void resetPeakStateLocked(int captureSize);

    int numChannels_ = 2;
    juce::AudioBuffer<float> captureBuffer_;
    std::vector<float> peakBuffer_;
    mutable std::mutex bufferMutex_;  // Only for allocation/resizing
    std::atomic<int> captureSize_{1};  // Atomic for lock-free reads
    std::atomic<int> peakBufferSize_{1};
    std::atomic<int> writeOffset_{0};
    std::atomic<int> peakCompletedBlocks_{0};
    std::atomic<int> currentPeakBlockSamples_{0};
    std::atomic<float> currentPeakBlockMax_{0.0f};
    std::atomic<float> captureSeconds_{30.0f};
    double sampleRate_ = 44100.0;
};

} // namespace dsp_primitives
