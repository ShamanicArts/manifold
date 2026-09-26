// Runs the original OscillatorNode.cpp scalar standard-waveform path.
#include "dsp/core/nodes/OscillatorNode.h"

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
        std::cerr << "usage: oscillator-reference OUTPUT FREQ_BEFORE FREQ_AFTER AMP_BEFORE AMP_AFTER "
                     "WAVEFORM SAMPLE_RATE BLOCK_SIZE STEP_FRAME FRAMES\n";
        return 2;
    }
    const float freqBefore = std::strtof(argv[2], nullptr);
    const float freqAfter = std::strtof(argv[3], nullptr);
    const float ampBefore = std::strtof(argv[4], nullptr);
    const float ampAfter = std::strtof(argv[5], nullptr);
    const int waveform = std::atoi(argv[6]);
    const double sampleRate = std::strtod(argv[7], nullptr);
    const int blockSize = std::atoi(argv[8]);
    const int stepFrame = std::atoi(argv[9]);
    const int frames = std::atoi(argv[10]);
    if (sampleRate < 8000 || blockSize < 1 || frames < 1 || stepFrame < 0 || stepFrame > frames
        || stepFrame % blockSize != 0) return 2;

    dsp_primitives::OscillatorNode node;
    node.setFrequency(freqBefore);
    node.setAmplitude(ampBefore);
    node.setWaveform(waveform);
    node.prepare(sampleRate, blockSize);
    node.disableSIMD();
    std::vector<float> result(static_cast<size_t>(frames) * 2);
    for (int offset = 0; offset < frames; offset += blockSize) {
        if (offset == stepFrame) {
            node.setFrequency(freqAfter);
            node.setAmplitude(ampAfter);
        }
        const int count = std::min(blockSize, frames - offset);
        std::vector<float> left(count), right(count);
        float* pointers[] = {left.data(), right.data()};
        dsp_primitives::WritableAudioBufferView output;
        output.channelData = pointers; output.numChannels = 2; output.numSamples = count;
        std::vector<dsp_primitives::AudioBufferView> inputs;
        std::vector<dsp_primitives::WritableAudioBufferView> outputs{output};
        node.process(inputs, outputs, count);
        for (int frame = 0; frame < count; ++frame) {
            result[(offset + frame) * 2] = left[frame];
            result[(offset + frame) * 2 + 1] = right[frame];
        }
    }
    std::ofstream destination(argv[1], std::ios::binary);
    destination.write(reinterpret_cast<const char*>(result.data()),
                      static_cast<std::streamsize>(result.size() * sizeof(float)));
    return destination ? 0 : 2;
}
