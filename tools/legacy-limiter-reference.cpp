// Original scalar LimiterNode with stereo audio and block-level gain reduction.
#include "dsp/core/nodes/LimiterNode.h"
#include <algorithm>
#include <array>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <vector>

namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode::
    this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept = default;
}
using Parameters = std::array<float, 5>;

void set_controls(dsp_primitives::LimiterNode& node, const Parameters& p) {
    node.setThreshold(p[0]); node.setRelease(p[1]); node.setMakeup(p[2]);
    node.setSoftClip(p[3]); node.setMix(p[4]);
}

int main(int argc, char** argv) {
    if (argc != 18) {
        std::cerr << "usage: limiter INPUT AUDIO METERS BEFORE[5] AFTER[5] RATE BLOCK STEP FRAMES\n";
        return 2;
    }
    Parameters before{}, after{};
    for (int index = 0; index < 5; ++index) {
        before[index] = std::strtof(argv[4 + index], nullptr);
        after[index] = std::strtof(argv[9 + index], nullptr);
    }
    const double sampleRate = std::strtod(argv[14], nullptr);
    const int block = std::atoi(argv[15]);
    const int step = std::atoi(argv[16]);
    const int frames = std::atoi(argv[17]);
    if (sampleRate < 8000 || block < 1 || frames < 1 || step < 0 || step > frames || step % block != 0) return 2;
    std::vector<float> input(static_cast<size_t>(frames) * 2);
    std::ifstream source(argv[1], std::ios::binary);
    source.read(reinterpret_cast<char*>(input.data()), static_cast<std::streamsize>(input.size() * sizeof(float)));
    if (!source || source.gcount() != static_cast<std::streamsize>(input.size() * sizeof(float))) return 2;

    dsp_primitives::LimiterNode node;
    set_controls(node, before);
    node.prepare(sampleRate, block);
    std::vector<float> audio(input.size());
    std::vector<float> meters;
    meters.reserve(static_cast<size_t>((frames + block - 1) / block));
    for (int offset = 0; offset < frames; offset += block) {
        if (offset == step) set_controls(node, after);
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
        meters.push_back(node.getGainReduction());
    }
    std::ofstream audioOut(argv[2], std::ios::binary);
    audioOut.write(reinterpret_cast<const char*>(audio.data()), static_cast<std::streamsize>(audio.size() * sizeof(float)));
    std::ofstream meterOut(argv[3], std::ios::binary);
    meterOut.write(reinterpret_cast<const char*>(meters.data()), static_cast<std::streamsize>(meters.size() * sizeof(float)));
    return audioOut && meterOut ? 0 : 2;
}
