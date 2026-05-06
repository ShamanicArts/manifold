#include "VideoSampler.h"
#include "VideoRetrospectiveCapture.h"

#include <algorithm>
#include <cmath>
#include <limits>
#include <utility>

namespace manifold::video {

namespace {

std::atomic<std::uint64_t> nextSamplerId{1};
std::atomic<std::uint64_t> nextCaptureId{1};

bool isFinite(double value) {
    return std::isfinite(value);
}

std::string makeGeneratedCaptureId() {
    const auto id = nextCaptureId.fetch_add(1, std::memory_order_relaxed);
    return "video_capture_" + std::to_string(id);
}

} // namespace

VideoSampler::VideoSampler(std::string id)
    : id_(id.empty() ? makeGeneratedId() : std::move(id)) {}

const std::string& VideoSampler::getId() const {
    return id_;
}

std::string VideoSampler::makeGeneratedId() {
    const auto id = nextSamplerId.fetch_add(1, std::memory_order_relaxed);
    return "video_sampler_" + std::to_string(id);
}

float VideoSampler::clamp01(float value) {
    if (!std::isfinite(value)) {
        return 0.0f;
    }
    return std::clamp(value, 0.0f, 1.0f);
}

void VideoSampler::commitFrames(std::vector<CommittedVideoFrame> frames,
                                double durationSamples,
                                double sampleRate) {
    const double sanitizedDuration = (isFinite(durationSamples) && durationSamples > 0.0)
        ? durationSamples
        : 0.0;
    const double sanitizedSampleRate = (isFinite(sampleRate) && sampleRate > 0.0)
        ? sampleRate
        : 44100.0;

    std::vector<CommittedVideoFrame> sanitized;
    sanitized.reserve(frames.size());

    for (auto& frame : frames) {
        if (!frame.frame.valid()) {
            continue;
        }

        if (!isFinite(frame.relativeSamplePosition)) {
            frame.relativeSamplePosition = 0.0;
        }

        if (sanitizedDuration > 0.0) {
            const double normalized = frame.relativeSamplePosition / sanitizedDuration;
            frame.normalizedPosition = clamp01(static_cast<float>(normalized));
            frame.relativeSamplePosition = std::clamp(frame.relativeSamplePosition, 0.0, sanitizedDuration);
        } else {
            frame.normalizedPosition = clamp01(frame.normalizedPosition);
            frame.relativeSamplePosition = std::max(0.0, frame.relativeSamplePosition);
        }

        sanitized.push_back(std::move(frame));
    }

    std::sort(sanitized.begin(), sanitized.end(), [](const auto& a, const auto& b) {
        if (a.normalizedPosition < b.normalizedPosition) {
            return true;
        }
        if (b.normalizedPosition < a.normalizedPosition) {
            return false;
        }
        return a.frame.sequence < b.frame.sequence;
    });

    std::lock_guard<std::mutex> lock(mutex_);
    frames_ = std::move(sanitized);
    durationSamples_ = sanitizedDuration;
    sampleRate_ = sanitizedSampleRate;
    positionNorm_.store(playStartNorm_.load(std::memory_order_acquire), std::memory_order_release);
}

bool VideoSampler::hasFrames() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return !frames_.empty();
}

int VideoSampler::getFrameCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return static_cast<int>(frames_.size());
}

double VideoSampler::getDurationSamples() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return durationSamples_;
}

float VideoSampler::getDurationSeconds() const {
    std::lock_guard<std::mutex> lock(mutex_);
    if (sampleRate_ <= 0.0 || durationSamples_ <= 0.0) {
        return 0.0f;
    }
    return static_cast<float>(durationSamples_ / sampleRate_);
}

std::size_t VideoSampler::getEstimatedBytes() const {
    std::lock_guard<std::mutex> lock(mutex_);
    std::size_t total = 0;
    for (const auto& frame : frames_) {
        total += frame.frame.rgba.size();
    }
    return total;
}

FrameData VideoSampler::getFrameAtNormalizedPosition(float normalized) const {
    const float target = clamp01(normalized);

    std::lock_guard<std::mutex> lock(mutex_);
    if (frames_.empty()) {
        return {};
    }
    if (frames_.size() == 1u) {
        return frames_.front().frame;
    }

    const auto it = std::lower_bound(frames_.begin(), frames_.end(), target,
        [](const CommittedVideoFrame& candidate, float value) {
            return candidate.normalizedPosition < value;
        });

    if (it == frames_.begin()) {
        return it->frame;
    }
    if (it == frames_.end()) {
        return frames_.back().frame;
    }

    const auto before = std::prev(it);
    const float beforeDistance = std::abs(target - before->normalizedPosition);
    const float afterDistance = std::abs(it->normalizedPosition - target);
    return (beforeDistance <= afterDistance + 1.0e-6f) ? before->frame : it->frame;
}

void VideoSampler::play() {
    playing_.store(true, std::memory_order_release);
}

void VideoSampler::pause() {
    playing_.store(false, std::memory_order_release);
}

void VideoSampler::stop() {
    playing_.store(false, std::memory_order_release);
    positionNorm_.store(0.0f, std::memory_order_release);
}

void VideoSampler::trigger() {
    positionNorm_.store(computeFallbackLoopStart(), std::memory_order_release);
    playing_.store(true, std::memory_order_release);
}

bool VideoSampler::isPlaying() const {
    return playing_.load(std::memory_order_acquire);
}

void VideoSampler::seekNormalized(float normalized) {
    positionNorm_.store(clamp01(normalized), std::memory_order_release);
}

float VideoSampler::getNormalizedPosition() const {
    return clamp01(positionNorm_.load(std::memory_order_acquire));
}

float VideoSampler::computeFallbackLoopStart() const {
    const float loopStart = std::min(clamp01(loopStartNorm_.load(std::memory_order_acquire)), 0.999999f);
    const float playStart = clamp01(playStartNorm_.load(std::memory_order_acquire));
    const float loopEnd = computeFallbackLoopEnd(loopStart);
    if (playStart >= loopEnd) {
        return loopStart;
    }
    return playStart;
}

float VideoSampler::computeFallbackLoopEnd(float loopStart) const {
    const float safeLoopStart = std::min(clamp01(loopStart), 0.999999f);
    const float loopEnd = clamp01(loopEndNorm_.load(std::memory_order_acquire));
    if (loopEnd <= safeLoopStart) {
        return std::min(1.0f, safeLoopStart + 0.000001f);
    }
    return loopEnd;
}

void VideoSampler::advance(double deltaSeconds) {
    if (!playing_.load(std::memory_order_acquire)) {
        return;
    }
    if (!isFinite(deltaSeconds) || deltaSeconds <= 0.0) {
        return;
    }

    const float durationSeconds = getDurationSeconds();
    if (durationSeconds <= 0.0f) {
        return;
    }

    const float loopStart = std::min(clamp01(loopStartNorm_.load(std::memory_order_acquire)), 0.999999f);
    const float loopEnd = computeFallbackLoopEnd(loopStart);
    const bool oneShot = oneShot_.load(std::memory_order_acquire);
    const float deltaNorm = static_cast<float>(deltaSeconds / static_cast<double>(durationSeconds));
    float position = clamp01(positionNorm_.load(std::memory_order_acquire)) + deltaNorm;

    if (oneShot) {
        if (position >= 1.0f) {
            position = 1.0f;
            playing_.store(false, std::memory_order_release);
        }
    } else {
        const float loopWindow = std::max(loopEnd - loopStart, std::numeric_limits<float>::epsilon());
        position = loopStart + std::fmod(position - loopStart, loopWindow);
        if (position < loopStart) {
            position += loopWindow;
        }
        position = clamp01(position);
    }

    positionNorm_.store(position, std::memory_order_release);
}

void VideoSampler::setOneShot(bool enabled) {
    oneShot_.store(enabled, std::memory_order_release);
}

bool VideoSampler::isOneShot() const {
    return oneShot_.load(std::memory_order_acquire);
}

void VideoSampler::setPlayStart(float normalized) {
    playStartNorm_.store(clamp01(normalized), std::memory_order_release);
}

float VideoSampler::getPlayStart() const {
    return clamp01(playStartNorm_.load(std::memory_order_acquire));
}

void VideoSampler::setLoopStart(float normalized) {
    loopStartNorm_.store(clamp01(normalized), std::memory_order_release);
}

float VideoSampler::getLoopStart() const {
    return clamp01(loopStartNorm_.load(std::memory_order_acquire));
}

void VideoSampler::setLoopEnd(float normalized) {
    loopEndNorm_.store(clamp01(normalized), std::memory_order_release);
}

float VideoSampler::getLoopEnd() const {
    return clamp01(loopEndNorm_.load(std::memory_order_acquire));
}

void VideoSampler::setCrossfade(float normalized) {
    if (!std::isfinite(normalized)) {
        normalized = 0.0f;
    }
    crossfadeNorm_.store(std::clamp(normalized, 0.0f, 0.5f), std::memory_order_release);
}

float VideoSampler::getCrossfade() const {
    const float value = crossfadeNorm_.load(std::memory_order_acquire);
    if (!std::isfinite(value)) {
        return 0.0f;
    }
    return std::clamp(value, 0.0f, 0.5f);
}

void VideoSampler::clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    frames_.clear();
    durationSamples_ = 0.0;
    positionNorm_.store(0.0f, std::memory_order_release);
    playing_.store(false, std::memory_order_release);
}

VideoSamplerRegistry& VideoSamplerRegistry::instance() {
    static VideoSamplerRegistry registry;
    return registry;
}

std::shared_ptr<VideoSampler> VideoSamplerRegistry::createSampler(std::string id) {
    auto sampler = std::make_shared<VideoSampler>(std::move(id));
    registerSampler(sampler->getId(), sampler);
    return sampler;
}

void VideoSamplerRegistry::registerSampler(const std::string& id, std::shared_ptr<VideoSampler> sampler) {
    if (id.empty() || !sampler) {
        return;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    samplers_[id] = std::move(sampler);
}

void VideoSamplerRegistry::unregisterSampler(const std::string& id) {
    std::lock_guard<std::mutex> lock(mutex_);
    samplers_.erase(id);
}

std::shared_ptr<VideoSampler> VideoSamplerRegistry::getSampler(const std::string& id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto it = samplers_.find(id);
    if (it == samplers_.end()) {
        return nullptr;
    }
    return it->second;
}

std::shared_ptr<VideoRetrospectiveCapture> VideoSamplerRegistry::createCapture(std::string id,
                                                                               float captureSeconds) {
    const std::string captureId = id.empty() ? makeGeneratedCaptureId() : std::move(id);
    auto capture = std::make_shared<VideoRetrospectiveCapture>(captureSeconds);
    registerCapture(captureId, capture);
    return capture;
}

void VideoSamplerRegistry::registerCapture(const std::string& id,
                                           std::shared_ptr<VideoRetrospectiveCapture> capture) {
    if (id.empty() || !capture) {
        return;
    }

    std::lock_guard<std::mutex> lock(mutex_);
    captures_[id] = std::move(capture);
}

void VideoSamplerRegistry::unregisterCapture(const std::string& id) {
    std::lock_guard<std::mutex> lock(mutex_);
    captures_.erase(id);
}

std::shared_ptr<VideoRetrospectiveCapture> VideoSamplerRegistry::getCapture(const std::string& id) const {
    std::lock_guard<std::mutex> lock(mutex_);
    const auto it = captures_.find(id);
    if (it == captures_.end()) {
        return nullptr;
    }
    return it->second;
}

void VideoSamplerRegistry::clear() {
    std::lock_guard<std::mutex> lock(mutex_);
    samplers_.clear();
    captures_.clear();
}

std::size_t VideoSamplerRegistry::size() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return samplers_.size();
}

std::size_t VideoSamplerRegistry::captureCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return captures_.size();
}

} // namespace manifold::video
