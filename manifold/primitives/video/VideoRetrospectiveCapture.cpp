#include "VideoRetrospectiveCapture.h"

#include <algorithm>
#include <cmath>
#include <utility>

namespace manifold::video {

VideoRetrospectiveCapture::VideoRetrospectiveCapture(float captureSeconds)
    : captureSeconds_(std::clamp(captureSeconds, 0.1f, 600.0f)) {}

bool VideoRetrospectiveCapture::isFinite(double value) {
    return std::isfinite(value);
}

void VideoRetrospectiveCapture::setCaptureSeconds(float seconds) {
    if (!std::isfinite(seconds)) {
        seconds = 30.0f;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    captureSeconds_ = std::clamp(seconds, 0.1f, 600.0f);
    if (!frames_.empty()) {
        pruneLocked(frames_.back().hostTimeSeconds);
    }
}

float VideoRetrospectiveCapture::getCaptureSeconds() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return captureSeconds_;
}

bool VideoRetrospectiveCapture::ingestLatestFrame(double hostSamplePosition,
                                                  double hostTimeSeconds) {
    auto frame = VideoCaptureManager::instance().getLatestFrameCopy();
    return ingestFrame(std::move(frame), hostSamplePosition, hostTimeSeconds);
}

bool VideoRetrospectiveCapture::ingestFrame(FrameData frame,
                                            double hostSamplePosition,
                                            double hostTimeSeconds) {
    if (!frame.valid() || !isFinite(hostSamplePosition) || !isFinite(hostTimeSeconds)) {
        return false;
    }

    std::lock_guard<std::mutex> lock(mutex_);

    if (hasLastIngestedSequence_ && frame.sequence == lastIngestedSequence_) {
        return false;
    }

    if (lockedWidth_ == 0 || lockedHeight_ == 0) {
        lockedWidth_ = frame.width;
        lockedHeight_ = frame.height;
    }

    if (frame.width != lockedWidth_ || frame.height != lockedHeight_) {
        return false;
    }

    TimedVideoFrame timed;
    timed.frame = std::move(frame);
    timed.hostSamplePosition = hostSamplePosition;
    timed.hostTimeSeconds = hostTimeSeconds;
    frames_.push_back(std::move(timed));

    lastIngestedSequence_ = frames_.back().frame.sequence;
    hasLastIngestedSequence_ = true;
    pruneLocked(hostTimeSeconds);
    return true;
}

void VideoRetrospectiveCapture::pruneLocked(double newestHostTimeSeconds) {
    if (!isFinite(newestHostTimeSeconds) || captureSeconds_ <= 0.0f) {
        return;
    }

    const double cutoff = newestHostTimeSeconds - static_cast<double>(captureSeconds_);
    while (!frames_.empty() && frames_.front().hostTimeSeconds < cutoff) {
        frames_.pop_front();
    }
}

bool VideoRetrospectiveCapture::copyRecentToSampler(VideoSampler& sampler,
                                                    double nowSamples,
                                                    double samplesBack) const {
    return copyRecentToSampler(sampler, nowSamples, samplesBack, 44100.0);
}

bool VideoRetrospectiveCapture::copyRecentToSampler(VideoSampler& sampler,
                                                    double nowSamples,
                                                    double samplesBack,
                                                    double sampleRate) const {
    if (!isFinite(nowSamples) || !isFinite(samplesBack) || samplesBack <= 0.0) {
        return false;
    }

    const double sanitizedSampleRate = (isFinite(sampleRate) && sampleRate > 0.0)
        ? sampleRate
        : 44100.0;
    const double windowStart = nowSamples - samplesBack;
    std::vector<CommittedVideoFrame> committed;

    {
        std::lock_guard<std::mutex> lock(mutex_);
        committed.reserve(frames_.size());

        for (const auto& timed : frames_) {
            if (timed.hostSamplePosition < windowStart || timed.hostSamplePosition > nowSamples) {
                continue;
            }

            CommittedVideoFrame out;
            out.frame = timed.frame;
            out.relativeSamplePosition = std::clamp(timed.hostSamplePosition - windowStart, 0.0, samplesBack);
            out.normalizedPosition = static_cast<float>(out.relativeSamplePosition / samplesBack);
            committed.push_back(std::move(out));
        }
    }

    if (committed.empty()) {
        return false;
    }

    sampler.commitFrames(std::move(committed), samplesBack, sanitizedSampleRate);
    return true;
}

int VideoRetrospectiveCapture::getFrameCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return static_cast<int>(frames_.size());
}

int VideoRetrospectiveCapture::getLockedWidth() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return lockedWidth_;
}

int VideoRetrospectiveCapture::getLockedHeight() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return lockedHeight_;
}

void VideoRetrospectiveCapture::clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    frames_.clear();
    lastIngestedSequence_ = 0;
    hasLastIngestedSequence_ = false;
    lockedWidth_ = 0;
    lockedHeight_ = 0;
}

} // namespace manifold::video
