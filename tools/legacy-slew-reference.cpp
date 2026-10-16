// Capture the original SlewLimiterNode scalar stereo path.
#include "dsp/core/nodes/SlewLimiterNode.h"

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
    if (argc != 11) {
        std::cerr << "usage: slew-reference INPUT OUTPUT UP_BEFORE UP_AFTER DOWN_BEFORE DOWN_AFTER RATE BLOCK STEP FRAMES\n";
        return 2;
    }
    const float upBefore = std::strtof(argv[3], nullptr);
    const float upAfter = std::strtof(argv[4], nullptr);
    const float downBefore = std::strtof(argv[5], nullptr);
    const float downAfter = std::strtof(argv[6], nullptr);
    const double rate = std::strtod(argv[7], nullptr);
    const int block = std::atoi(argv[8]);
    const int step = std::atoi(argv[9]);
    const int frames = std::atoi(argv[10]);
    if (rate < 8000 || block < 1 || frames < 1 || step < 0 || step > frames || step % block != 0) return 2;
    std::vector<float> input(static_cast<size_t>(frames) * 2);
    std::ifstream source(argv[1], std::ios::binary);
    source.read(reinterpret_cast<char*>(input.data()), static_cast<std::streamsize>(input.size() * sizeof(float)));
    if (!source || source.gcount() != static_cast<std::streamsize>(input.size() * sizeof(float))) return 2;

    dsp_primitives::SlewLimiterNode node;
    node.setSlideUp(upBefore);
    node.setSlideDown(downBefore);
    node.prepare(rate, block);
    std::vector<float> result(input.size());
    for (int offset = 0; offset < frames; offset += block) {
        if (offset == step) { node.setSlideUp(upAfter); node.setSlideDown(downAfter); }
        const int count = std::min(block, frames - offset);
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
    return destination ? 0 : 2;
}
