#pragma once

#include "VideoCaptureManager.h"

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace manifold::video {

struct CommittedVideoFrame {
    FrameData frame;
    double relativeSamplePosition = 0.0;
    float normalizedPosition = 0.0f;
};

class VideoRetrospectiveCapture;

class VideoSampler {
public:
    explicit VideoSampler(std::string id = {});

    const std::string& getId() const;

    void commitFrames(std::vector<CommittedVideoFrame> frames,
                      double durationSamples,
                      double sampleRate);

    bool hasFrames() const;
    int getFrameCount() const;
    double getDurationSamples() const;
    float getDurationSeconds() const;

    // Primary synced lookup. This does not advance transport state.
    FrameData getFrameAtNormalizedPosition(float normalized) const;

    // Standalone fallback transport only. Synced playback should be driven by
    // SampleRegionPlaybackNode::getLoopAwarePosition() and the lookup above.
    void play();
    void pause();
    void stop();
    void trigger();
    bool isPlaying() const;
    void seekNormalized(float normalized);
    float getNormalizedPosition() const;
    void advance(double deltaSeconds);

    void setOneShot(bool enabled);
    bool isOneShot() const;
    void setPlayStart(float normalized);
    float getPlayStart() const;
    void setLoopStart(float normalized);
    float getLoopStart() const;
    void setLoopEnd(float normalized);
    float getLoopEnd() const;
    void setCrossfade(float normalized);
    float getCrossfade() const;

    void clear();

private:
    static std::string makeGeneratedId();
    static float clamp01(float value);
    float computeFallbackLoopStart() const;
    float computeFallbackLoopEnd(float loopStart) const;

    mutable std::mutex mutex_;
    std::string id_;
    std::vector<CommittedVideoFrame> frames_;
    double durationSamples_ = 0.0;
    double sampleRate_ = 44100.0;

    std::atomic<bool> playing_{false};
    std::atomic<bool> oneShot_{false};
    std::atomic<float> positionNorm_{0.0f};
    std::atomic<float> playStartNorm_{0.0f};
    std::atomic<float> loopStartNorm_{0.0f};
    std::atomic<float> loopEndNorm_{1.0f};
    std::atomic<float> crossfadeNorm_{0.0f};
};

class VideoSamplerRegistry {
public:
    static VideoSamplerRegistry& instance();

    std::shared_ptr<VideoSampler> createSampler(std::string id = {});
    void registerSampler(const std::string& id, std::shared_ptr<VideoSampler> sampler);
    void unregisterSampler(const std::string& id);
    std::shared_ptr<VideoSampler> getSampler(const std::string& id) const;

    std::shared_ptr<VideoRetrospectiveCapture> createCapture(std::string id = {}, float captureSeconds = 30.0f);
    void registerCapture(const std::string& id, std::shared_ptr<VideoRetrospectiveCapture> capture);
    void unregisterCapture(const std::string& id);
    std::shared_ptr<VideoRetrospectiveCapture> getCapture(const std::string& id) const;

    void clear();
    std::size_t size() const;
    std::size_t captureCount() const;

private:
    VideoSamplerRegistry() = default;

    mutable std::mutex mutex_;
    std::unordered_map<std::string, std::shared_ptr<VideoSampler>> samplers_;
    std::unordered_map<std::string, std::shared_ptr<VideoRetrospectiveCapture>> captures_;
};

} // namespace manifold::video
