// Runs the original MixerNode.cpp scalar path with deterministic stereo busses.
#include "dsp/core/nodes/MixerNode.h"

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
    if (argc != 15) {
        std::cerr << "usage: mixer-reference INPUT OUTPUT BUSSES GAIN1 GAIN2 PAN1 PAN2 MASTER "
                     "GAIN2_AFTER PAN2_AFTER MASTER_AFTER SAMPLE_RATE BLOCK_SIZE STEP_FRAME\n";
        return 2;
    }
    const int busCount = std::atoi(argv[3]);
    const float gain1 = std::strtof(argv[4], nullptr);
    const float gain2 = std::strtof(argv[5], nullptr);
    const float pan1 = std::strtof(argv[6], nullptr);
    const float pan2 = std::strtof(argv[7], nullptr);
    const float master = std::strtof(argv[8], nullptr);
    const float gain2After = std::strtof(argv[9], nullptr);
    const float pan2After = std::strtof(argv[10], nullptr);
    const float masterAfter = std::strtof(argv[11], nullptr);
    const double sampleRate = std::strtod(argv[12], nullptr);
    const int blockSize = std::atoi(argv[13]);
    const int stepFrame = std::atoi(argv[14]);
    if (busCount < 2 || busCount > 32 || sampleRate < 8000 || blockSize < 1) return 2;
    std::ifstream source(argv[1], std::ios::binary | std::ios::ate);
    if (!source) return 2;
    const auto bytes = source.tellg();
    if (bytes < 0 || bytes % static_cast<std::streamoff>(sizeof(float) * 2) != 0) return 2;
    source.seekg(0);
    std::vector<float> input(static_cast<size_t>(bytes) / sizeof(float));
    source.read(reinterpret_cast<char*>(input.data()), bytes);
    if (!source) return 2;
    const int frames = static_cast<int>(input.size() / 2);
    if (stepFrame < 0 || stepFrame > frames || stepFrame % blockSize != 0) return 2;

    dsp_primitives::MixerNode node(-1); // Pin to the legacy scalar implementation.
    node.setInputCount(busCount);
    node.setGain(1, gain1);
    node.setGain(2, gain2);
    node.setPan(1, pan1);
    node.setPan(2, pan2);
    node.setMaster(master);
    for (int bus = 3; bus <= busCount; ++bus) node.setGain(bus, 0.02f);
    node.prepare(sampleRate, blockSize);

    std::vector<float> result(input.size());
    for (int offset = 0; offset < frames; offset += blockSize) {
        if (offset == stepFrame) {
            node.setGain(2, gain2After);
            node.setPan(2, pan2After);
            node.setMaster(masterAfter);
        }
        const int count = std::min(blockSize, frames - offset);
        std::vector<std::vector<float>> left(busCount, std::vector<float>(count));
        std::vector<std::vector<float>> right(busCount, std::vector<float>(count));
        for (int frame = 0; frame < count; ++frame) {
            left[0][frame] = input[(offset + frame) * 2];
            right[0][frame] = input[(offset + frame) * 2 + 1];
            left[1][frame] = right[1][frame] = 0.25f;
            for (int bus = 2; bus < busCount; ++bus) {
                left[bus][frame] = right[bus][frame] = 0.1f + 0.01f * static_cast<float>(bus + 1);
            }
        }
        std::vector<dsp_primitives::AudioBufferView> inputs(busCount);
        for (int bus = 0; bus < busCount; ++bus) {
            // The input view stores channel pointers; keep their arrays alive until process returns.
            inputs[bus].numChannels = 2;
            inputs[bus].numSamples = count;
        }
        std::vector<const float*> pointers(static_cast<size_t>(busCount) * 2);
        for (int bus = 0; bus < busCount; ++bus) {
            pointers[bus * 2] = left[bus].data();
            pointers[bus * 2 + 1] = right[bus].data();
            inputs[bus].channelData = &pointers[bus * 2];
        }
        std::vector<float> outLeft(count), outRight(count);
        float* outputPointers[] = {outLeft.data(), outRight.data()};
        dsp_primitives::WritableAudioBufferView output;
        output.channelData = outputPointers;
        output.numChannels = 2;
        output.numSamples = count;
        std::vector<dsp_primitives::WritableAudioBufferView> outputs{output};
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
