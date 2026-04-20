#include "dsp/core/graph/PrimitiveNode.h"
#include "dsp/core/nodes/DistortionNode.h"
#include "dsp/core/nodes/FilterNode.h"
#include "dsp/core/nodes/LoopPlaybackNode.h"
#include "dsp/core/nodes/PlaybackStateGateNode.h"
#include "dsp/core/nodes/RetrospectiveCaptureNode.h"
#include "dsp/core/nodes/SampleRegionPlaybackNode.h"

#include <cmath>
#include <exception>
#include <functional>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace {

constexpr double kSampleRate = 48000.0;
constexpr int kBlockSize = 16;
constexpr float kTolerance = 1.0e-5f;

using dsp_primitives::AudioBufferView;
using dsp_primitives::WritableAudioBufferView;

struct TestFailure : std::runtime_error {
    using std::runtime_error::runtime_error;
};

void expectNear(float actual, float expected, const std::string& label, float tolerance = kTolerance) {
    if (std::abs(actual - expected) > tolerance) {
        std::ostringstream oss;
        oss << label << ": expected " << expected << ", got " << actual;
        throw TestFailure(oss.str());
    }
}

juce::AudioBuffer<float> makeStereoBuffer(std::initializer_list<float> left,
                                          std::initializer_list<float> right) {
    if (left.size() != right.size()) {
        throw TestFailure("makeStereoBuffer(): left/right size mismatch");
    }

    juce::AudioBuffer<float> buffer(2, static_cast<int>(left.size()));
    int i = 0;
    for (float v : left) {
        buffer.setSample(0, i++, v);
    }
    i = 0;
    for (float v : right) {
        buffer.setSample(1, i++, v);
    }
    return buffer;
}

std::vector<AudioBufferView> makeSingleStereoInputView(const juce::AudioBuffer<float>& buffer) {
    return { AudioBufferView(buffer) };
}

std::vector<WritableAudioBufferView> makeSingleStereoOutputView(juce::AudioBuffer<float>& buffer) {
    return { WritableAudioBufferView(buffer) };
}

void expectStereoEquals(const juce::AudioBuffer<float>& actual,
                        const juce::AudioBuffer<float>& expected,
                        const std::string& label) {
    if (actual.getNumChannels() < 2 || expected.getNumChannels() < 2) {
        throw TestFailure(label + ": expected stereo buffers");
    }

    for (int ch = 0; ch < 2; ++ch) {
        for (int i = 0; i < expected.getNumSamples(); ++i) {
            expectNear(actual.getSample(ch, i),
                       expected.getSample(ch, i),
                       label + " ch=" + std::to_string(ch) + " i=" + std::to_string(i));
        }
    }
}

void testFilterScalarSingleStereoPort() {
    dsp_primitives::FilterNode node;
    node.disableSIMD();
    node.setMix(0.0f);
    node.prepare(kSampleRate, kBlockSize);

    auto input = makeStereoBuffer({0.25f, -0.5f, 0.1f}, {0.75f, 0.33f, -0.2f});
    juce::AudioBuffer<float> output(2, input.getNumSamples());
    output.clear();

    auto inputs = makeSingleStereoInputView(input);
    auto outputs = makeSingleStereoOutputView(output);
    node.process(inputs, outputs, input.getNumSamples());

    expectStereoEquals(output, input, "FilterNode scalar single stereo port passthrough");
}

void testFilterSIMDSingleStereoPort() {
    dsp_primitives::FilterNode node;
    node.setMix(0.0f);
    node.prepare(kSampleRate, kBlockSize);

    auto input = makeStereoBuffer({0.1f, 0.2f, 0.3f}, {-0.2f, -0.1f, 0.05f});
    juce::AudioBuffer<float> output(2, input.getNumSamples());
    output.clear();

    auto inputs = makeSingleStereoInputView(input);
    auto outputs = makeSingleStereoOutputView(output);
    node.process(inputs, outputs, input.getNumSamples());

    expectStereoEquals(output, input, "FilterNode SIMD single stereo port passthrough");
}

void testDistortionSingleStereoPort() {
    dsp_primitives::DistortionNode node;
    node.setMix(0.0f);
    node.setDrive(1.0f);
    node.setOutput(1.0f);
    node.prepare(kSampleRate, kBlockSize);

    auto input = makeStereoBuffer({0.1f, -0.2f, 0.3f}, {-0.45f, 0.6f, -0.7f});
    juce::AudioBuffer<float> output(2, input.getNumSamples());
    output.clear();

    auto inputs = makeSingleStereoInputView(input);
    auto outputs = makeSingleStereoOutputView(output);
    node.process(inputs, outputs, input.getNumSamples());

    expectStereoEquals(output, input, "DistortionNode single stereo port passthrough");
}

void testPlaybackStateGateSingleStereoPort() {
    dsp_primitives::PlaybackStateGateNode node(2);
    node.prepare(kSampleRate, kBlockSize);
    node.setPlaying(true);
    node.setMuted(false);

    auto input = makeStereoBuffer({0.3f, 0.4f, -0.5f}, {-0.8f, 0.2f, 0.9f});
    juce::AudioBuffer<float> output(2, input.getNumSamples());
    output.clear();

    auto inputs = makeSingleStereoInputView(input);
    auto outputs = makeSingleStereoOutputView(output);
    node.process(inputs, outputs, input.getNumSamples());

    expectStereoEquals(output, input, "PlaybackStateGateNode single stereo port passthrough");
}

void testRetrospectiveCaptureSingleStereoPort() {
    dsp_primitives::RetrospectiveCaptureNode node(2);
    node.prepare(kSampleRate, kBlockSize);

    auto input = makeStereoBuffer({0.9f, -0.1f, 0.25f}, {-0.4f, 0.7f, -0.8f});
    juce::AudioBuffer<float> output(2, input.getNumSamples());
    output.clear();

    auto inputs = makeSingleStereoInputView(input);
    auto outputs = makeSingleStereoOutputView(output);
    node.process(inputs, outputs, input.getNumSamples());

    expectStereoEquals(output, input, "RetrospectiveCaptureNode single stereo port passthrough");
}

void testLoopPlaybackSingleStereoOutputPort() {
    dsp_primitives::LoopPlaybackNode node(2);
    node.prepare(kSampleRate, kBlockSize);

    auto capture = makeStereoBuffer({0.11f, 0.22f, 0.33f, 0.44f}, {-0.55f, -0.66f, -0.77f, -0.88f});
    node.copyFromCaptureBuffer(capture, capture.getNumSamples(), 0, capture.getNumSamples(), false);
    node.play();
    node.seekNormalized(0.0f);

    juce::AudioBuffer<float> output(2, 1);
    output.clear();
    std::vector<AudioBufferView> inputs;
    auto outputs = makeSingleStereoOutputView(output);
    node.process(inputs, outputs, 1);

    expectNear(output.getSample(0, 0), 0.11f, "LoopPlaybackNode single stereo output left");
    expectNear(output.getSample(1, 0), -0.55f, "LoopPlaybackNode single stereo output right");
}

void testSampleRegionPlaybackSingleStereoOutputPort() {
    dsp_primitives::SampleRegionPlaybackNode node(2);
    node.prepare(kSampleRate, kBlockSize);

    auto capture = makeStereoBuffer({0.15f, 0.25f, 0.35f, 0.45f}, {-0.1f, -0.2f, -0.3f, -0.4f});
    node.copyFromCaptureBuffer(capture, capture.getNumSamples(), 0, capture.getNumSamples(), false);
    node.play();
    node.setSpeed(1.0f);

    juce::AudioBuffer<float> output(2, 1);
    output.clear();
    std::vector<AudioBufferView> inputs;
    auto outputs = makeSingleStereoOutputView(output);
    node.process(inputs, outputs, 1);

    const float equalPowerPan = std::sqrt(0.5f);
    expectNear(output.getSample(0, 0), 0.15f * equalPowerPan, "SampleRegionPlaybackNode single stereo output left");
    expectNear(output.getSample(1, 0), -0.1f * equalPowerPan, "SampleRegionPlaybackNode single stereo output right");
}

using TestFn = std::function<void()>;

int runNamedTest(const std::string& name, const TestFn& fn) {
    try {
        fn();
        std::cout << "PASS " << name << '\n';
        return 0;
    } catch (const std::exception& e) {
        std::cerr << "FAIL " << name << ": " << e.what() << '\n';
        return 1;
    }
}

} // namespace

int main(int argc, char** argv) {
    const std::vector<std::pair<std::string, TestFn>> tests = {
        {"filter-scalar", testFilterScalarSingleStereoPort},
        {"filter-simd", testFilterSIMDSingleStereoPort},
        {"distortion", testDistortionSingleStereoPort},
        {"playback-gate", testPlaybackStateGateSingleStereoPort},
        {"retrospective-capture", testRetrospectiveCaptureSingleStereoPort},
        {"loop-playback", testLoopPlaybackSingleStereoOutputPort},
        {"sample-region-playback", testSampleRegionPlaybackSingleStereoOutputPort},
    };

    if (argc == 2) {
        const std::string selected = argv[1];
        for (const auto& [name, fn] : tests) {
            if (name == selected) {
                return runNamedTest(name, fn);
            }
        }

        std::cerr << "Unknown test: " << selected << '\n';
        return 2;
    }

    int failures = 0;
    for (const auto& [name, fn] : tests) {
        failures += runNamedTest(name, fn);
    }

    if (failures != 0) {
        std::cerr << failures << " test(s) failed\n";
        return 1;
    }

    std::cout << "All single-port semantics tests passed\n";
    return 0;
}
