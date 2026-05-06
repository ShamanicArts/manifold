#include "manifold/primitives/video/VideoRetrospectiveCapture.h"

#include <cmath>
#include <cstdint>
#include <iostream>
#include <string>
#include <vector>

using manifold::video::FrameData;
using manifold::video::VideoRetrospectiveCapture;
using manifold::video::VideoSampler;

namespace {

FrameData makeFrame(std::uint64_t sequence, int width = 2, int height = 1) {
    FrameData frame;
    frame.width = width;
    frame.height = height;
    frame.sequence = sequence;
    frame.rgba.resize(static_cast<std::size_t>(width) * static_cast<std::size_t>(height) * 4u,
                      static_cast<std::uint8_t>(sequence & 0xffu));
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

    VideoRetrospectiveCapture capture(2.0f);

    ok &= expect(capture.ingestFrame(makeFrame(1), 1000.0, 0.0), "first frame ingests");
    ok &= expect(!capture.ingestFrame(makeFrame(1), 1010.0, 0.1), "duplicate sequence is dropped");
    ok &= expect(capture.ingestFrame(makeFrame(2), 2000.0, 1.0), "second frame ingests");
    ok &= expect(!capture.ingestFrame(makeFrame(3, 4, 1), 2500.0, 1.5), "mismatched resolution is dropped");
    ok &= expect(capture.ingestFrame(makeFrame(3), 3000.0, 2.0), "third matching frame ingests");
    ok &= expect(capture.getFrameCount() == 3, "frame count excludes duplicate and mismatch");
    ok &= expect(capture.getLockedWidth() == 2 && capture.getLockedHeight() == 1,
                 "resolution locks on first valid frame");

    ok &= expect(capture.ingestFrame(makeFrame(4), 4500.0, 3.0), "newest frame ingests");
    ok &= expect(capture.getFrameCount() == 3, "capture seconds pruning removes oldest frame");

    VideoSampler sampler("capture_commit");
    ok &= expect(capture.copyRecentToSampler(sampler, 4500.0, 2500.0, 1000.0),
                 "copyRecentToSampler commits populated window");
    ok &= expect(sampler.getFrameCount() == 3, "committed window contains expected frames");
    ok &= expect(std::abs(sampler.getDurationSamples() - 2500.0) < 0.001,
                 "committed duration samples matches samplesBack");
    ok &= expect(std::abs(sampler.getDurationSeconds() - 2.5f) < 0.001f,
                 "committed duration seconds uses supplied sample rate");
    ok &= expectSequence(sampler, 0.0f, 2u);
    ok &= expectSequence(sampler, 0.4f, 3u);
    ok &= expectSequence(sampler, 1.0f, 4u);

    VideoSampler emptySampler("empty_window");
    ok &= expect(!capture.copyRecentToSampler(emptySampler, 10000.0, 1000.0, 1000.0),
                 "empty sample window returns false");
    ok &= expect(!emptySampler.hasFrames(), "empty sample window does not commit stale data");

    capture.clear();
    ok &= expect(capture.getFrameCount() == 0, "clear removes capture frames");
    ok &= expect(capture.getLockedWidth() == 0 && capture.getLockedHeight() == 0,
                 "clear resets resolution lock");
    ok &= expect(capture.ingestFrame(makeFrame(10, 4, 1), 11000.0, 11.0),
                 "clear allows a new resolution lock");
    ok &= expect(capture.getLockedWidth() == 4, "new resolution lock after clear");

    if (!ok) {
        return 1;
    }

    std::cout << "VideoRetrospectiveCaptureHarness OK\n";
    return 0;
}
