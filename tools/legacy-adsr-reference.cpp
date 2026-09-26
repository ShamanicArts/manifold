// Runs the original ADSREnvelopeNode.cpp scalar path on a constant stereo signal.
#include "dsp/core/nodes/ADSREnvelopeNode.h"

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
        std::cerr << "usage: adsr-reference OUTPUT ATTACK DECAY SUSTAIN RELEASE GATE_OFF "
                     "SAMPLE_RATE BLOCK_SIZE FRAMES INPUT_LEVEL\n";
        return 2;
    }
    const float attack = std::strtof(argv[2], nullptr);
    const float decay = std::strtof(argv[3], nullptr);
    const float sustain = std::strtof(argv[4], nullptr);
    const float release = std::strtof(argv[5], nullptr);
    const int gateOff = std::atoi(argv[6]);
    const double sampleRate = std::strtod(argv[7], nullptr);
    const int blockSize = std::atoi(argv[8]);
    const int frames = std::atoi(argv[9]);
    const float inputLevel = std::strtof(argv[10], nullptr);
    if (sampleRate < 8000 || blockSize < 1 || frames < 1 || gateOff < 0
        || gateOff > frames || gateOff % blockSize != 0) return 2;

    dsp_primitives::ADSREnvelopeNode node(-1); // force scalar path
    node.setAttack(attack);
    node.setDecay(decay);
    node.setSustain(sustain);
    node.setRelease(release);
    node.prepare(sampleRate, blockSize);
    node.setGate(true);
    std::vector<float> result(static_cast<size_t>(frames) * 2);
    for (int offset = 0; offset < frames; offset += blockSize) {
        if (offset == gateOff) node.setGate(false);
        const int count = std::min(blockSize, frames - offset);
        std::vector<float> inLeft(count, inputLevel), inRight(count, -inputLevel * 0.5f);
        std::vector<float> outLeft(count), outRight(count);
        const float* inPointers[] = {inLeft.data(), inRight.data()};
        float* outPointers[] = {outLeft.data(), outRight.data()};
        dsp_primitives::AudioBufferView input;
        input.channelData = inPointers; input.numChannels = 2; input.numSamples = count;
        dsp_primitives::WritableAudioBufferView output;
        output.channelData = outPointers; output.numChannels = 2; output.numSamples = count;
        std::vector<dsp_primitives::AudioBufferView> inputs{input};
        std::vector<dsp_primitives::WritableAudioBufferView> outputs{output};
        node.process(inputs, outputs, count);
        for (int frame = 0; frame < count; ++frame) {
            result[(offset + frame) * 2] = outLeft[frame];
            result[(offset + frame) * 2 + 1] = outRight[frame];
        }
    }
    std::ofstream destination(argv[1], std::ios::binary);
    destination.write(reinterpret_cast<const char*>(result.data()),
                      static_cast<std::streamsize>(result.size() * sizeof(float)));
    return destination ? 0 : 2;
}
