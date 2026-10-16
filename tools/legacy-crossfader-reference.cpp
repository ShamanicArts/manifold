// Runs the original CrossfaderNode.cpp against a deterministic stereo input.
#include "dsp/core/nodes/CrossfaderNode.h"

#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <vector>

namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode::
    this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept = default;
}

int main(int argc, char** argv) {
    if (argc != 10) {
        std::cerr << "usage: crossfader-reference INPUT OUTPUT POSITION_BEFORE POSITION_AFTER "
                     "CURVE MIX SAMPLE_RATE BLOCK_SIZE STEP_FRAME\n";
        return 2;
    }
    const float before = std::strtof(argv[3], nullptr);
    const float after = std::strtof(argv[4], nullptr);
    const float curve = std::strtof(argv[5], nullptr);
    const float mix = std::strtof(argv[6], nullptr);
    const double sampleRate = std::strtod(argv[7], nullptr);
    const int blockSize = std::atoi(argv[8]);
    const int stepFrame = std::atoi(argv[9]);
    if (sampleRate < 8000 || blockSize < 1) return 2;
    std::ifstream source(argv[1], std::ios::binary | std::ios::ate);
    if (!source) return 2;
    const auto bytes = source.tellg();
    if (bytes < 0 || bytes % static_cast<std::streamoff>(sizeof(float) * 2) != 0) return 2;
    source.seekg(0);
    std::vector<float> input(static_cast<size_t>(bytes) / sizeof(float));
    source.read(reinterpret_cast<char*>(input.data()), bytes);
    if (!source) return 2;
    const int frames = static_cast<int>(input.size() / 2);
    if (stepFrame < 0 || stepFrame > frames || stepFrame % blockSize != 0) return 2;

    dsp_primitives::CrossfaderNode node;
    node.setPosition(before);
    node.setCurve(curve);
    node.setMix(mix);
    node.prepare(sampleRate, blockSize);
    std::vector<float> result(input.size());
    for (int offset = 0; offset < frames; offset += blockSize) {
        if (offset == stepFrame) node.setPosition(after);
        const int count = std::min(blockSize, frames - offset);
        std::vector<float> aLeft(count), aRight(count), bLeft(count, 0.25f), bRight(count, 0.25f);
        std::vector<float> outLeft(count), outRight(count);
        for (int i = 0; i < count; ++i) {
            aLeft[i] = input[(offset + i) * 2];
            aRight[i] = input[(offset + i) * 2 + 1];
        }
        const float* aPointers[] = {aLeft.data(), aRight.data()};
        const float* bPointers[] = {bLeft.data(), bRight.data()};
        float* outputPointers[] = {outLeft.data(), outRight.data()};
        dsp_primitives::AudioBufferView a, b;
        a.channelData = aPointers; a.numChannels = 2; a.numSamples = count;
        b.channelData = bPointers; b.numChannels = 2; b.numSamples = count;
        dsp_primitives::WritableAudioBufferView output;
        output.channelData = outputPointers; output.numChannels = 2; output.numSamples = count;
        std::vector<dsp_primitives::AudioBufferView> inputs{a, b};
        std::vector<dsp_primitives::WritableAudioBufferView> outputs{output};
        node.process(inputs, outputs, count);
        for (int i = 0; i < count; ++i) {
            result[(offset + i) * 2] = outLeft[i];
            result[(offset + i) * 2 + 1] = outRight[i];
        }
    }
    std::ofstream destination(argv[2], std::ios::binary);
    destination.write(reinterpret_cast<const char*>(result.data()),
                      static_cast<std::streamsize>(result.size() * sizeof(float)));
    return destination ? 0 : 2;
}
