// Isolated renderer using the original JUCE PhaseVocoderNode and FFT.
#include <juce_dsp/juce_dsp.h>
#include "dsp/core/nodes/PhaseVocoderNode.h"
#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <thread>
#include <vector>

#include "juce_dsp/frequency/juce_FFT.cpp"
#include "dsp/core/nodes/PhaseVocoderNode.cpp"
namespace juce {
void SpinLock::enter() const noexcept { while (!tryEnter()) std::this_thread::yield(); }
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode
    ::this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept {}
template<> void FloatVectorOperationsBase<float, int>::clear(float* destination, int count) noexcept {
    std::fill_n(destination, count, 0.0f);
}
}

int main(int argc, char** argv) {
    if (argc != 11) return 2;
    const int rate = std::atoi(argv[3]);
    const int block = std::atoi(argv[4]);
    const int frames = std::atoi(argv[5]);
    if (rate < 8000 || block < 1 || frames < block) return 2;
    std::vector<float> source(static_cast<size_t>(frames) * 2);
    std::ifstream input(argv[1], std::ios::binary);
    input.read(reinterpret_cast<char*>(source.data()), static_cast<std::streamsize>(source.size() * sizeof(float)));
    if (!input) return 3;
    dsp_primitives::PhaseVocoderNode node(2);
    node.setMode(std::atoi(argv[6]));
    node.setPitchSemitones(std::strtof(argv[7], nullptr));
    node.setMix(std::strtof(argv[9], nullptr));
    node.setFFTOrder(std::atoi(argv[10]));
    node.prepare(rate, block);
    node.setTimeStretch(std::strtof(argv[8], nullptr));
    std::vector<float> result(source.size());
    for (int offset = 0; offset < frames; offset += block) {
        const int count = std::min(block, frames - offset);
        std::vector<float> left(count), right(count), outLeft(count), outRight(count);
        for (int frame = 0; frame < count; frame++) {
            left[frame] = source[static_cast<size_t>(offset + frame) * 2];
            right[frame] = source[static_cast<size_t>(offset + frame) * 2 + 1];
        }
        const float* inputPointers[] = {left.data(), right.data()};
        float* outputPointers[] = {outLeft.data(), outRight.data()};
        dsp_primitives::AudioBufferView in;
        in.channelData = inputPointers; in.numChannels = 2; in.numSamples = count;
        dsp_primitives::WritableAudioBufferView out;
        out.channelData = outputPointers; out.numChannels = 2; out.numSamples = count;
        std::vector<dsp_primitives::AudioBufferView> inputs{in};
        std::vector<dsp_primitives::WritableAudioBufferView> outputs{out};
        node.process(inputs, outputs, count);
        for (int frame = 0; frame < count; frame++) {
            result[static_cast<size_t>(offset + frame) * 2] = outLeft[frame];
            result[static_cast<size_t>(offset + frame) * 2 + 1] = outRight[frame];
        }
    }
    std::ofstream output(argv[2], std::ios::binary);
    output.write(reinterpret_cast<const char*>(result.data()), static_cast<std::streamsize>(result.size() * sizeof(float)));
    return output ? 0 : 4;
}
