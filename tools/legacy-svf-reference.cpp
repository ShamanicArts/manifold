// Offline reference runner. Compiles the historical SVFNode.cpp from a separate checkout.
// No legacy source files are copied into or modified by Manifold v2.
#include "dsp/core/nodes/SVFNode.h"

#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <vector>

using dsp_primitives::AudioBufferView;
using dsp_primitives::SVFNode;
using dsp_primitives::WritableAudioBufferView;

// JUCE's compile-mode sentinel normally comes from juce_core.cpp. This tiny
// runner uses only header-level AudioBufferView types, so define that sentinel
// without linking the entire JUCE application.
namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode::
    this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept = default;
}

int main(int argc, char** argv) {
    if (argc != 10) {
        std::cerr << "usage: legacy-svf INPUT OUTPUT MODE CUTOFF_BEFORE CUTOFF_AFTER "
                     "RESONANCE SAMPLE_RATE BLOCK_SIZE STEP_FRAME\n";
        return 2;
    }
    const int mode = std::atoi(argv[3]);
    const float before = std::strtof(argv[4], nullptr);
    const float after = std::strtof(argv[5], nullptr);
    const float resonance = std::strtof(argv[6], nullptr);
    const double sampleRate = std::strtod(argv[7], nullptr);
    const int blockSize = std::atoi(argv[8]);
    const int stepFrame = std::atoi(argv[9]);
    if (mode < 0 || mode > 3 || blockSize < 1 || sampleRate < 8000.0) return 2;

    std::ifstream source(argv[1], std::ios::binary | std::ios::ate);
    if (!source) return 2;
    const auto bytes = source.tellg();
    if (bytes < 0 || bytes % static_cast<std::streamoff>(sizeof(float) * 2) != 0) return 2;
    source.seekg(0);
    std::vector<float> interleaved(static_cast<size_t>(bytes) / sizeof(float));
    source.read(reinterpret_cast<char*>(interleaved.data()), bytes);
    if (!source) return 2;
    const int frames = static_cast<int>(interleaved.size() / 2);
    if (stepFrame < 0 || stepFrame > frames || stepFrame % blockSize != 0) return 2;

    SVFNode node;
    node.setMode(static_cast<SVFNode::Mode>(mode));
    node.setCutoff(before);
    node.setResonance(resonance);
    node.setDrive(1.0f); // Standalone_Filter/dsp/main.lua's applyDefaults
    node.setMix(1.0f);
    node.prepare(sampleRate, blockSize);

    std::vector<float> result(interleaved.size());
    for (int offset = 0; offset < frames; offset += blockSize) {
        if (offset == stepFrame) node.setCutoff(after);
        const int count = std::min(blockSize, frames - offset);
        std::vector<float> left(count), right(count), outL(count), outR(count);
        for (int i = 0; i < count; ++i) {
            left[i] = interleaved[(offset + i) * 2];
            right[i] = interleaved[(offset + i) * 2 + 1];
        }
        const float* inputPointers[] = {left.data(), right.data()};
        float* outputPointers[] = {outL.data(), outR.data()};
        AudioBufferView input;
        input.channelData = inputPointers;
        input.numChannels = 2;
        input.numSamples = count;
        WritableAudioBufferView output;
        output.channelData = outputPointers;
        output.numChannels = 2;
        output.numSamples = count;
        std::vector<AudioBufferView> inputs{input};
        std::vector<WritableAudioBufferView> outputs{output};
        node.process(inputs, outputs, count);
        for (int i = 0; i < count; ++i) {
            result[(offset + i) * 2] = outL[i];
            result[(offset + i) * 2 + 1] = outR[i];
        }
    }
    std::ofstream destination(argv[2], std::ios::binary);
    destination.write(reinterpret_cast<const char*>(result.data()),
                      static_cast<std::streamsize>(result.size() * sizeof(float)));
    return destination ? 0 : 2;
}
