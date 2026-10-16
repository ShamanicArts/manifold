// Runs the original DistortionNode.cpp scalar stereo path.
#include "dsp/core/nodes/DistortionNode.h"

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
    if (argc != 13) {
        std::cerr << "usage: distortion-reference INPUT OUTPUT DRIVE_BEFORE DRIVE_AFTER MIX_BEFORE MIX_AFTER "
                     "OUTPUT_BEFORE OUTPUT_AFTER SAMPLE_RATE BLOCK_SIZE STEP_FRAME FRAMES\n";
        return 2;
    }
    const float driveBefore = std::strtof(argv[3], nullptr);
    const float driveAfter = std::strtof(argv[4], nullptr);
    const float mixBefore = std::strtof(argv[5], nullptr);
    const float mixAfter = std::strtof(argv[6], nullptr);
    const float outputBefore = std::strtof(argv[7], nullptr);
    const float outputAfter = std::strtof(argv[8], nullptr);
    const double sampleRate = std::strtod(argv[9], nullptr);
    const int blockSize = std::atoi(argv[10]);
    const int stepFrame = std::atoi(argv[11]);
    const int frames = std::atoi(argv[12]);
    if (sampleRate < 8000 || blockSize < 1 || frames < 1 || stepFrame < 0
        || stepFrame > frames || stepFrame % blockSize != 0) return 2;
    std::vector<float> input(static_cast<size_t>(frames) * 2);
    std::ifstream source(argv[1], std::ios::binary);
    source.read(reinterpret_cast<char*>(input.data()), static_cast<std::streamsize>(input.size() * sizeof(float)));
    if (!source || source.gcount() != static_cast<std::streamsize>(input.size() * sizeof(float))) return 2;

    dsp_primitives::DistortionNode node;
    node.setDrive(driveBefore);
    node.setMix(mixBefore);
    node.setOutput(outputBefore);
    node.prepare(sampleRate, blockSize);
    std::vector<float> result(static_cast<size_t>(frames) * 2);
    for (int offset = 0; offset < frames; offset += blockSize) {
        if (offset == stepFrame) {
            node.setDrive(driveAfter);
            node.setMix(mixAfter);
            node.setOutput(outputAfter);
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
    destination.write(reinterpret_cast<const char*>(result.data()),
                      static_cast<std::streamsize>(result.size() * sizeof(float)));
    return destination ? 0 : 2;
}
