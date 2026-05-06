#include "manifold/primitives/video/VideoSampler.h"

#include <cmath>
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>

using manifold::video::CommittedVideoFrame;
using manifold::video::FrameData;
using manifold::video::VideoSampler;
using manifold::video::VideoSamplerRegistry;

namespace {

FrameData makeFrame(std::uint64_t sequence) {
    FrameData frame;
    frame.width = 1;
    frame.height = 1;
    frame.sequence = sequence;
    frame.rgba = {
        static_cast<std::uint8_t>(sequence & 0xffu),
        0u,
        0u,
        255u,
    };
    return frame;
}

bool expect(bool condition, const std::string& message) {
    if (!condition) {
        std::cerr << "FAIL: " << message << '\n';
        return false;
    }
    return true;
}

bool expectSequence(const VideoSampler& sampler, float position, std::uint64_t expected) {
    const auto frame = sampler.getFrameAtNormalizedPosition(position);
    if (frame.sequence != expected) {
        std::cerr << "FAIL: position " << position << " expected sequence " << expected
                  << " got " << frame.sequence << '\n';
        return false;
    }
    return true;
}

} // namespace

int main() {
    bool ok = true;

    constexpr int frameCount = 30;
    constexpr double durationSamples = 30000.0;
    constexpr double sampleRate = 3000.0;

    std::vector<CommittedVideoFrame> frames;
    frames.reserve(frameCount);
    for (int i = 0; i < frameCount; ++i) {
        CommittedVideoFrame committed;
        committed.frame = makeFrame(static_cast<std::uint64_t>(i));
        committed.relativeSamplePosition = (durationSamples * static_cast<double>(i))
                                         / static_cast<double>(frameCount - 1);
        frames.push_back(std::move(committed));
    }

    VideoSampler sampler("unit_sampler");
    sampler.commitFrames(std::move(frames), durationSamples, sampleRate);

    ok &= expect(sampler.getId() == "unit_sampler", "explicit sampler id is preserved");
    ok &= expect(sampler.hasFrames(), "sampler reports committed frames");
    ok &= expect(sampler.getFrameCount() == frameCount, "frame count matches commit");
    ok &= expect(std::abs(sampler.getDurationSamples() - durationSamples) < 0.001,
                 "duration samples matches commit");
    ok &= expect(std::abs(sampler.getDurationSeconds() - 10.0f) < 0.001f,
                 "duration seconds uses supplied sample rate");

    ok &= expectSequence(sampler, 0.0f, 0u);
    ok &= expectSequence(sampler, -1.0f, 0u);
    ok &= expectSequence(sampler, 1.0f, 29u);
    ok &= expectSequence(sampler, 2.0f, 29u);
    ok &= expectSequence(sampler, 0.5f, 14u);
    ok &= expectSequence(sampler, 0.52f, 15u);

    sampler.setPlayStart(0.25f);
    sampler.trigger();
    ok &= expect(sampler.isPlaying(), "trigger starts fallback transport");
    ok &= expect(std::abs(sampler.getNormalizedPosition() - 0.25f) < 0.001f,
                 "trigger uses play start");
    sampler.advance(2.5);
    ok &= expect(std::abs(sampler.getNormalizedPosition() - 0.5f) < 0.001f,
                 "fallback advance moves by duration-normalized delta");
    sampler.pause();
    ok &= expect(!sampler.isPlaying(), "pause stops fallback transport");

    sampler.clear();
    ok &= expect(!sampler.hasFrames(), "clear removes committed frames");
    ok &= expect(sampler.getFrameCount() == 0, "clear resets frame count");
    ok &= expect(!sampler.getFrameAtNormalizedPosition(0.5f).valid(),
                 "empty lookup returns invalid frame");

    auto& registry = VideoSamplerRegistry::instance();
    registry.clear();
    const auto registered = registry.createSampler("registry_sampler");
    ok &= expect(registered != nullptr, "registry creates sampler");
    ok &= expect(registry.getSampler("registry_sampler") == registered,
                 "registry returns created sampler");
    ok &= expect(registry.size() == 1u, "registry size tracks sampler");
    registry.unregisterSampler("registry_sampler");
    ok &= expect(registry.getSampler("registry_sampler") == nullptr,
                 "registry unregister removes sampler");

    if (!ok) {
        return 1;
    }

    std::cout << "VideoSamplerHarness OK\n";
    return 0;
}
