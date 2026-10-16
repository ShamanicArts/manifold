// Runs the original EnvelopeFollowerNode with a meter snapshot per block.
#include "dsp/core/nodes/EnvelopeFollowerNode.h"

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
    if (argc != 18) {
        std::cerr << "usage: follower INPUT AUDIO METERS ATTACK0 ATTACK1 RELEASE0 RELEASE1 SENS0 SENS1 "
                     "HIGHPASS0 HIGHPASS1 MODE0 MODE1 RATE BLOCK STEP FRAMES\n";
        return 2;
    }
    const int block = std::atoi(argv[15]);
    const int step = std::atoi(argv[16]);
    const int frames = std::atoi(argv[17]);
    if (block < 1 || frames < 1 || step < 0 || step > frames || step % block != 0) return 2;
    std::vector<float> input(static_cast<size_t>(frames) * 2);
    std::ifstream source(argv[1], std::ios::binary);
    source.read(reinterpret_cast<char*>(input.data()), static_cast<std::streamsize>(input.size() * sizeof(float)));
    if (!source || source.gcount() != static_cast<std::streamsize>(input.size() * sizeof(float))) return 2;

    dsp_primitives::EnvelopeFollowerNode node;
    node.setAttack(std::strtof(argv[4], nullptr));
    node.setRelease(std::strtof(argv[6], nullptr));
    node.setSensitivity(std::strtof(argv[8], nullptr));
    node.setHighpass(std::strtof(argv[10], nullptr));
    node.setMode(std::atoi(argv[12]));
    node.prepare(std::strtod(argv[14], nullptr), block);
    std::vector<float> audio(input.size());
    std::vector<float> meters;
    meters.reserve(static_cast<size_t>((frames + block - 1) / block));
    for (int offset = 0; offset < frames; offset += block) {
        if (offset == step) {
            node.setAttack(std::strtof(argv[5], nullptr));
            node.setRelease(std::strtof(argv[7], nullptr));
            node.setSensitivity(std::strtof(argv[9], nullptr));
            node.setHighpass(std::strtof(argv[11], nullptr));
            node.setMode(std::atoi(argv[13]));
        }
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
            audio[(offset + frame) * 2] = outLeft[frame];
            audio[(offset + frame) * 2 + 1] = outRight[frame];
        }
        meters.push_back(node.getEnvelope());
    }
    std::ofstream audioOut(argv[2], std::ios::binary);
    audioOut.write(reinterpret_cast<const char*>(audio.data()), static_cast<std::streamsize>(audio.size() * sizeof(float)));
    std::ofstream meterOut(argv[3], std::ios::binary);
    meterOut.write(reinterpret_cast<const char*>(meters.data()), static_cast<std::streamsize>(meters.size() * sizeof(float)));
    return audioOut && meterOut ? 0 : 2;
}
