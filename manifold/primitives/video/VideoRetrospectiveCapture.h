#pragma once

#include "VideoCaptureManager.h"
#include "VideoSampler.h"

#include <cstdint>
#include <deque>
#include <mutex>

namespace manifold::video {

struct TimedVideoFrame {
    FrameData frame;
    double hostSamplePosition = 0.0;
    double hostTimeSeconds = 0.0;
};

class VideoRetrospectiveCapture {
public:
    explicit VideoRetrospectiveCapture(float captureSeconds = 30.0f);

    void setCaptureSeconds(float seconds);
    float getCaptureSeconds() const;

    // Pull latest FrameData from VideoCaptureManager and stamp it with host timing.
    bool ingestLatestFrame(double hostSamplePosition, double hostTimeSeconds);

    // Source-agnostic ingest path used by tests and future non-webcam producers.
    bool ingestFrame(FrameData frame, double hostSamplePosition, double hostTimeSeconds);

    bool copyRecentToSampler(VideoSampler& sampler,
                             double nowSamples,
                             double samplesBack) const;
    bool copyRecentToSampler(VideoSampler& sampler,
                             double nowSamples,
                             double samplesBack,
                             double sampleRate) const;

    int getFrameCount() const;
    int getLockedWidth() const;
    int getLockedHeight() const;
    void clear();

private:
    static bool isFinite(double value);
    void pruneLocked(double newestHostTimeSeconds);

    mutable std::mutex mutex_;
    std::deque<TimedVideoFrame> frames_;
    float captureSeconds_ = 30.0f;
    uint64_t lastIngestedSequence_ = 0;
    bool hasLastIngestedSequence_ = false;
    int lockedWidth_ = 0;
    int lockedHeight_ = 0;
};

} // namespace manifold::video
