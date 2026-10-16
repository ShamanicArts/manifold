// File-backed stereo reference runner for the original PitchShifterNode.
#include "dsp/core/nodes/PitchShifterNode.h"
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
}

static void apply(dsp_primitives::PitchShifterNode& node, int id, float value) {
    switch (id) {
        case 0: node.setPitch(value); break;
        case 1: node.setWindow(value); break;
        case 2: node.setFeedback(value); break;
        case 3: node.setMix(value); break;
    }
}

int main(int argc, char** argv) {
    if (argc != 15) return 2;
    const int sampleRate = std::atoi(argv[3]);
    const int blockSize = std::atoi(argv[4]);
    const int stepFrame = std::atoi(argv[5]);
    const int frames = std::atoi(argv[6]);
    std::ifstream source(argv[1], std::ios::binary);
    std::vector<float> input(static_cast<size_t>(frames) * 2);
    source.read(reinterpret_cast<char*>(input.data()), static_cast<std::streamsize>(input.size() * sizeof(float)));
    if (!source) return 3;
    dsp_primitives::PitchShifterNode node;
    for (int id = 0; id < 4; ++id) apply(node, id, std::strtof(argv[7 + id], nullptr));
    node.prepare(sampleRate, blockSize);
    std::vector<float> result(input.size());
    for (int offset = 0; offset < frames; offset += blockSize) {
        if (offset == stepFrame) {
            for (int id = 0; id < 4; ++id) apply(node, id, std::strtof(argv[11 + id], nullptr));
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
