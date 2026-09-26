// File-backed stereo reference runner for the original GranulatorNode.
#include "dsp/core/nodes/GranulatorNode.h"
#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <vector>

namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode
    ::this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept {}
template<>
void FloatVectorOperationsBase<float, int>::clear(float* destination, int count) noexcept {
    std::fill_n(destination, count, 0.0f);
}
template<>
void FloatVectorOperationsBase<float, int>::copy(float* destination, const float* source, int count) noexcept {
    std::copy_n(source, count, destination);
}
Random::Random() : seed(12345) {}
float Random::nextFloat() noexcept { return 0.5f; }
}

static void apply(dsp_primitives::GranulatorNode& node, int id, float value) {
    switch (id) {
        case 0: node.setGrainSize(value); break;
        case 1: node.setDensity(value); break;
        case 2: node.setPosition(value); break;
        case 3: node.setPitch(value); break;
        case 4: node.setSpray(value); break;
        case 5: node.setMix(value); break;
        case 6: node.setFreeze(value >= 0.5f); break;
        case 7: node.setEnvelope(static_cast<int>(value)); break;
        case 8: node.setEnabled(value >= 0.5f); break;
    }
}

int main(int argc, char** argv) {
    if (argc != 25 && argc != 30) return 2;
    const bool sourceMode = argc == 30;
    const int sampleRate = std::atoi(argv[3]);
    const int blockSize = std::atoi(argv[4]);
    const int stepFrame = std::atoi(argv[5]);
    const int frames = std::atoi(argv[6]);
    std::ifstream source(argv[1], std::ios::binary);
    std::vector<float> input(static_cast<size_t>(frames) * 2);
    source.read(reinterpret_cast<char*>(input.data()), static_cast<std::streamsize>(input.size() * sizeof(float)));
    if (!source) return 3;
    dsp_primitives::GranulatorNode node;
    for (int id = 0; id < 9; ++id) apply(node, id, std::strtof(argv[7 + id], nullptr));
    if (sourceMode) node.setSourceRegion(std::strtof(argv[16], nullptr), std::strtof(argv[17], nullptr));
    node.prepare(sampleRate, blockSize);
    if (sourceMode) {
        std::ifstream sourceFile(argv[29], std::ios::binary | std::ios::ate);
        if (!sourceFile) return 5;
        const auto bytes = sourceFile.tellg();
        if (bytes <= 0 || static_cast<size_t>(bytes) % (sizeof(float) * 2) != 0) return 5;
        sourceFile.seekg(0);
        std::vector<float> sourceStereo(static_cast<size_t>(bytes) / sizeof(float));
        sourceFile.read(reinterpret_cast<char*>(sourceStereo.data()), bytes);
        if (!sourceFile) return 5;
        const int sourceFrames = static_cast<int>(sourceStereo.size() / 2);
        juce::AudioBuffer<float> sourceBuffer(2, sourceFrames);
        for (int frame = 0; frame < sourceFrames; ++frame) {
            sourceBuffer.setSample(0, frame, sourceStereo[frame * 2]);
            sourceBuffer.setSample(1, frame, sourceStereo[frame * 2 + 1]);
        }
        node.copyFromCaptureBuffer(sourceBuffer, sourceFrames, 0, sourceFrames);
    }
    std::vector<float> result(input.size());
    for (int offset = 0; offset < frames; offset += blockSize) {
        if (offset == stepFrame) {
            for (int id = 0; id < 9; ++id) apply(node, id, std::strtof(argv[(sourceMode ? 18 : 16) + id], nullptr));
            if (sourceMode) node.setSourceRegion(std::strtof(argv[27], nullptr), std::strtof(argv[28], nullptr));
        }
        const int count = std::min(blockSize, frames - offset);
        std::vector<float> left(count), right(count), outLeft(count), outRight(count);
        for (int frame = 0; frame < count; ++frame) {
            left[frame] = input[(offset + frame) * 2];
            right[frame] = input[(offset + frame) * 2 + 1];
        }
        const float* inPointers[] = {left.data(), right.data()};
        float* outPointers[] = {outLeft.data(), outRight.data()};
        dsp_primitives::AudioBufferView in;
        in.channelData = inPointers; in.numChannels = 2; in.numSamples = count;
        dsp_primitives::WritableAudioBufferView out;
        out.channelData = outPointers; out.numChannels = 2; out.numSamples = count;
        std::vector<dsp_primitives::AudioBufferView> inputs{in};
        std::vector<dsp_primitives::WritableAudioBufferView> outputs{out};
        node.process(inputs, outputs, count);
        for (int frame = 0; frame < count; ++frame) {
            result[(offset + frame) * 2] = outLeft[frame];
            result[(offset + frame) * 2 + 1] = outRight[frame];
        }
    }
    std::ofstream destination(argv[2], std::ios::binary);
    destination.write(reinterpret_cast<const char*>(result.data()), static_cast<std::streamsize>(result.size() * sizeof(float)));
    return destination ? 0 : 4;
}
