// Original SampleRegionPlaybackNode with a prepared stereo capture buffer.
#include "dsp/core/nodes/SampleRegionPlaybackNode.h"

#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <vector>

namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode::
    this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept = default;
template<> void FloatVectorOperationsBase<float, int>::clear(float* destination, int count) noexcept {
    std::fill_n(destination, count, 0.0f);
}
template<> void FloatVectorOperationsBase<float, int>::copy(float* destination, const float* source, int count) noexcept {
    std::copy_n(source, count, destination);
}
}

int main(int argc, char** argv) {
    if (argc != 9) {
        std::cerr << "usage: legacy-main-sample-playback-reference SAMPLE OUTPUT SAMPLE_FRAMES OUTPUT_FRAMES BLOCK SPEED ONE_SHOT CROSSFADE\n";
        return 2;
    }
    const int sourceFrames = std::atoi(argv[3]);
    const int frames = std::atoi(argv[4]);
    const int block = std::atoi(argv[5]);
    const float speed = std::strtof(argv[6], nullptr);
    const int oneShot = std::atoi(argv[7]);
    const float crossfade = std::strtof(argv[8], nullptr);
    if (sourceFrames < 2 || frames < 1 || block < 1 || speed <= 0 || speed > 8
        || (oneShot != 0 && oneShot != 1) || crossfade < 0 || crossfade > .5f) return 2;
    std::vector<float> source(static_cast<size_t>(sourceFrames) * 2);
    std::ifstream input(argv[1], std::ios::binary);
    input.read(reinterpret_cast<char*>(source.data()), source.size() * sizeof(float));
    if (!input) return 3;
    juce::AudioBuffer<float> captured(2, sourceFrames);
    for (int frame = 0; frame < sourceFrames; frame++) {
        captured.setSample(0, frame, source[frame * 2]);
        captured.setSample(1, frame, source[frame * 2 + 1]);
    }
    dsp_primitives::SampleRegionPlaybackNode player(2);
    player.prepare(48000.0, block);
    player.copyFromCaptureBuffer(captured, sourceFrames, 0, sourceFrames, false);
    player.setSpeed(speed);
    player.setOneShot(oneShot == 1);
    player.setCrossfade(crossfade);
    player.trigger();
    std::vector<float> result(static_cast<size_t>(frames) * 2);
    for (int offset = 0; offset < frames; offset += block) {
        const int count = std::min(block, frames - offset);
        std::vector<float> left(count), right(count);
        float* pointers[] = {left.data(), right.data()};
        dsp_primitives::WritableAudioBufferView output;
        output.channelData = pointers; output.numChannels = 2; output.numSamples = count;
        std::vector<dsp_primitives::WritableAudioBufferView> outputs{output};
        std::vector<dsp_primitives::AudioBufferView> inputs;
        player.process(inputs, outputs, count);
        for (int frame = 0; frame < count; frame++) {
            result[(offset + frame) * 2] = left[frame];
            result[(offset + frame) * 2 + 1] = right[frame];
        }
    }
    std::ofstream file(argv[2], std::ios::binary);
    file.write(reinterpret_cast<const char*>(result.data()), result.size() * sizeof(float));
    return file ? 0 : 4;
}
