// Runs the original PhaserNode.cpp scalar stereo path without editing the legacy checkout.
#include "dsp/core/nodes/PhaserNode.h"

#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <vector>

namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode::
    this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept = default;
}

static void setParams(dsp_primitives::PhaserNode& node, const float* values) {
    node.setRate(values[0]);
    node.setDepth(values[1]);
    node.setStages(static_cast<int>(values[2]));
    node.setFeedback(values[3]);
    node.setSpread(values[4]);
}

int main(int argc, char** argv) {
    if (argc != 17) {
        std::cerr << "usage: phaser-reference INPUT OUTPUT RATE BLOCK STEP FRAMES BEFORE[5] AFTER[5]\n";
        return 2;
    }
    const double sampleRate = std::strtod(argv[3], nullptr);
    const int blockSize = std::atoi(argv[4]);
    const int stepFrame = std::atoi(argv[5]);
    const int frames = std::atoi(argv[6]);
    if (sampleRate < 8000 || blockSize < 1 || frames < 1 || stepFrame < 0 || stepFrame > frames
        || stepFrame % blockSize != 0) return 2;
    float before[5], after[5];
    for (int index = 0; index < 5; ++index) {
        before[index] = std::strtof(argv[7 + index], nullptr);
        after[index] = std::strtof(argv[12 + index], nullptr);
    }
    std::vector<float> input(static_cast<size_t>(frames) * 2);
    std::ifstream source(argv[1], std::ios::binary);
    source.read(reinterpret_cast<char*>(input.data()), static_cast<std::streamsize>(input.size() * sizeof(float)));
    if (!source || source.gcount() != static_cast<std::streamsize>(input.size() * sizeof(float))) return 2;
    dsp_primitives::PhaserNode node;
    setParams(node, before);
    node.prepare(sampleRate, blockSize);
    std::vector<float> result(input.size());
    for (int offset = 0; offset < frames; offset += blockSize) {
        if (offset == stepFrame) setParams(node, after);
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
    destination.write(reinterpret_cast<const char*>(result.data()),
                      static_cast<std::streamsize>(result.size() * sizeof(float)));
    return destination ? 0 : 2;
}
