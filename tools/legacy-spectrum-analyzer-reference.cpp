// Runs the original eight-band SpectrumAnalyzerNode, including its meter readout.
#include "dsp/core/nodes/SpectrumAnalyzerNode.h"

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
    if (argc != 14) {
        std::cerr << "usage: analyzer INPUT AUDIO METERS SENS_BEFORE SENS_AFTER SMOOTH_BEFORE SMOOTH_AFTER "
                     "FLOOR_BEFORE FLOOR_AFTER RATE BLOCK STEP FRAMES\n";
        return 2;
    }
    const int block = std::atoi(argv[11]);
    const int step = std::atoi(argv[12]);
    const int frames = std::atoi(argv[13]);
    if (block < 1 || frames < 1 || step < 0 || step > frames || step % block != 0) return 2;
    std::vector<float> input(static_cast<size_t>(frames) * 2);
    std::ifstream source(argv[1], std::ios::binary);
    source.read(reinterpret_cast<char*>(input.data()), static_cast<std::streamsize>(input.size() * sizeof(float)));
    if (!source || source.gcount() != static_cast<std::streamsize>(input.size() * sizeof(float))) return 2;

    dsp_primitives::SpectrumAnalyzerNode node;
    node.setSensitivity(std::strtof(argv[4], nullptr));
    node.setSmoothing(std::strtof(argv[6], nullptr));
    node.setFloor(std::strtof(argv[8], nullptr));
    node.prepare(std::strtod(argv[10], nullptr), block);
    std::vector<float> audio(input.size());
    std::vector<float> meters;
    meters.reserve(static_cast<size_t>((frames + block - 1) / block) * 8);
    for (int offset = 0; offset < frames; offset += block) {
        if (offset == step) {
            node.setSensitivity(std::strtof(argv[5], nullptr));
            node.setSmoothing(std::strtof(argv[7], nullptr));
            node.setFloor(std::strtof(argv[9], nullptr));
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
        for (float value : {node.getBand1(), node.getBand2(), node.getBand3(), node.getBand4(),
                            node.getBand5(), node.getBand6(), node.getBand7(), node.getBand8()}) {
            meters.push_back(value);
        }
    }
    std::ofstream audioOut(argv[2], std::ios::binary);
    audioOut.write(reinterpret_cast<const char*>(audio.data()), static_cast<std::streamsize>(audio.size() * sizeof(float)));
    std::ofstream meterOut(argv[3], std::ios::binary);
    meterOut.write(reinterpret_cast<const char*>(meters.data()), static_cast<std::streamsize>(meters.size() * sizeof(float)));
    return audioOut && meterOut ? 0 : 2;
}
