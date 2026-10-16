// Offline historical C++ graph proxy for the portable Rack Sample fixture.
// Build with scripts/bench-legacy-rack-sample.py after building the read-only
// historical GraphRuntimePerfHarness into a separate CMake directory.
#include "dsp/core/nodes/PrimitiveNodes.h"
#include "dsp/core/nodes/SampleRegionPlaybackNode.h"
#include "dsp/core/nodes/PhaseVocoderNode.h"
#include "manifold/primitives/scripting/GraphRuntime.h"
#include "manifold/primitives/scripting/PrimitiveGraph.h"

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <memory>
#include <string_view>
#include <vector>

namespace {
constexpr int kRate = 48000;
constexpr int kFrames = 128;
constexpr int kWarmup = 128;
constexpr int kMeasured = 2048;
constexpr int kVoices = 8;

double quantile(const std::vector<double>& values, double fraction) {
    return values[static_cast<size_t>((kMeasured - 1) * fraction)];
}
}

int main(int argc, char** argv) {
    if (argc < 2 || argc > 4) {
        std::fprintf(stderr, "usage: legacy_rack_sample_bench <interleaved-stereo-f32le> [--dry] [--trace]\n");
        return 2;
    }
    bool dry = false;
    bool trace = false;
    for (int index = 2; index < argc; ++index) {
        const auto flag = std::string_view(argv[index]);
        if (flag == "--dry") dry = true;
        else if (flag == "--trace") trace = true;
        else return 2;
    }
    std::ifstream input(argv[1], std::ios::binary | std::ios::ate);
    if (!input) return 2;
    const auto byteCount = static_cast<std::streamsize>(input.tellg());
    if (byteCount <= 0 || byteCount % (2 * static_cast<int>(sizeof(float))) != 0) return 2;
    input.seekg(0);
    std::vector<float> interleaved(static_cast<size_t>(byteCount) / sizeof(float));
    input.read(reinterpret_cast<char*>(interleaved.data()), byteCount);
    if (!input) return 2;
    const int sampleFrames = static_cast<int>(interleaved.size() / 2);
    juce::AudioBuffer<float> sample(2, sampleFrames);
    for (int frame = 0; frame < sampleFrames; ++frame) {
        sample.setSample(0, frame, interleaved[static_cast<size_t>(frame * 2)]);
        sample.setSample(1, frame, interleaved[static_cast<size_t>(frame * 2 + 1)]);
    }

    dsp_primitives::PrimitiveGraph graph;
    std::array<std::shared_ptr<dsp_primitives::SampleRegionPlaybackNode>, kVoices> sources;
    auto mixer = std::make_shared<dsp_primitives::MixerNode>(-1);
    mixer->setInputCount(kVoices + 1);
    mixer->setMaster(1.0f);
    for (int bus = 1; bus <= kVoices + 1; ++bus) {
        mixer->setGain(bus, 1.0f);
        mixer->setPan(bus, 0.0f);
    }
    graph.registerNode(mixer);
    for (int voice = 0; voice < kVoices; ++voice) {
        auto playback = std::make_shared<dsp_primitives::SampleRegionPlaybackNode>(2);
        playback->setUnison(3);
        playback->setDetune(38.0f);
        playback->setSpread(0.6f);
        playback->setCrossfade(0.1f);
        auto vocoder = std::make_shared<dsp_primitives::PhaseVocoderNode>(2);
        vocoder->setFFTOrder(11);
        vocoder->setMix(dry ? 0.0f : 1.0f);
        auto gain = std::make_shared<dsp_primitives::GainNode>();
        gain->overrideHighwayImplementationTarget(-1);
        gain->setGain(0.6f);
        graph.registerNode(playback);
        graph.registerNode(vocoder);
        graph.registerNode(gain);
        if (!graph.connect(playback, 0, vocoder, 0) ||
            !graph.connect(vocoder, 0, gain, 0) ||
            !graph.connect(gain, 0, mixer, voice * 2)) return 3;
        sources[static_cast<size_t>(voice)] = std::move(playback);
    }
    auto outputGain = std::make_shared<dsp_primitives::GainNode>();
    outputGain->overrideHighwayImplementationTarget(-1);
    outputGain->setGain(0.2f);
    graph.registerNode(outputGain);
    if (!graph.connect(mixer, 0, outputGain, 0)) return 3;
    graph.setNodeRole(outputGain, dsp_primitives::PrimitiveGraph::NodeRole::OutputDSP);
    const auto prepareStart = std::chrono::steady_clock::now();
    auto runtime = dsp_primitives::compileGraphRuntime(graph, kRate, kFrames, 2);
    if (!runtime || !runtime->isValid()) return 4;
    for (auto& source : sources) {
        source->copyFromCaptureBuffer(sample, sampleFrames, 0, sampleFrames, false);
    }
    const auto prepareMs = std::chrono::duration<double, std::milli>(
        std::chrono::steady_clock::now() - prepareStart).count();

    juce::AudioBuffer<float> working(2, kFrames);
    auto block = [&](int index) {
        if (index % 32 == 0) for (auto& source : sources) source->trigger();
        working.clear();
        runtime->process(working, nullptr, nullptr);
    };
    for (int index = 0; index < kWarmup; ++index) block(index);
    std::vector<double> durations;
    durations.reserve(kMeasured);
    double checksum = 0.0;
    std::array<std::array<float, 2>, 3> checkpoints{};
    std::vector<double> blockAbsSums;
    if (trace) blockAbsSums.reserve(kMeasured);
    for (int index = 0; index < kMeasured; ++index) {
        const auto start = std::chrono::steady_clock::now();
        block(index);
        durations.push_back(std::chrono::duration<double, std::micro>(
            std::chrono::steady_clock::now() - start).count());
        checksum += std::abs(working.getSample(0, index % kFrames))
                  + std::abs(working.getSample(1, index % kFrames));
        if (index == 0 || index == 1024 || index == 2047) {
            const int slot = index == 0 ? 0 : index == 1024 ? 1 : 2;
            checkpoints[static_cast<size_t>(slot)] = {
                working.getSample(0, index % kFrames),
                working.getSample(1, index % kFrames)};
        }
        if (trace) {
            double sum = 0.0;
            for (int frame = 0; frame < kFrames; ++frame)
                sum += std::abs(working.getSample(0, frame)) + std::abs(working.getSample(1, frame));
            blockAbsSums.push_back(sum);
        }
    }
    if (checksum <= 0.01) {
        std::fprintf(stderr, "historical graph rendered silence\n");
        return 5;
    }
    std::sort(durations.begin(), durations.end());
    const auto deadline = kFrames * 1000000.0 / kRate;
    const auto misses = std::count_if(durations.begin(), durations.end(),
                                      [deadline](double value) { return value > deadline; });
    std::printf("{\"method\":\"release historical C++ GraphRuntime offline\","
                "\"sampleRate\":%d,\"blockFrames\":%d,\"warmupBlocks\":%d,"
                "\"measuredBlocks\":%d,\"sampleFrames\":%d,\"voices\":%d,"
                "\"unison\":3,\"fftOrder\":11,\"dry\":%s,\"compiledNodes\":%d,"
                "\"routes\":%d,\"prepareMs\":%.6f,\"p50Us\":%.6f,"
                "\"p95Us\":%.6f,\"p99Us\":%.6f,\"maxUs\":%.6f,"
                "\"overDeadline\":%td,\"outputChecksum\":%.9f,"
                "\"checkpoints\":[[%.9g,%.9g],[%.9g,%.9g],[%.9g,%.9g]]",
                kRate, kFrames, kWarmup, kMeasured, sampleFrames, kVoices,
                dry ? "true" : "false", runtime->getCompiledNodeCount(),
                runtime->getRouteCount(), prepareMs,
                quantile(durations, .50), quantile(durations, .95),
                quantile(durations, .99), durations.back(), misses, checksum,
                checkpoints[0][0], checkpoints[0][1], checkpoints[1][0],
                checkpoints[1][1], checkpoints[2][0], checkpoints[2][1]);
    if (trace) {
        std::printf(",\"blockAbsSums\":[");
        for (int index = 0; index < kMeasured; ++index)
            std::printf("%s%.9g", index ? "," : "", blockAbsSums[static_cast<size_t>(index)]);
        std::printf("]");
    }
    std::printf("}\n");
}
