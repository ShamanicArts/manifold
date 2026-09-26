// Assemble the original C++ Main wave-only route for a sustained voice.
// The old UI envelope is deliberately excluded; its update cadence differs from v2.
#include "dsp/core/nodes/CrossfaderNode.h"
#include "dsp/core/nodes/MixerNode.h"
#include "dsp/core/nodes/OscillatorNode.h"

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

struct Stereo {
    std::vector<float> left, right;
    explicit Stereo(int frames) : left(frames, 0.0f), right(frames, 0.0f) {}
};

static void run(dsp_primitives::IPrimitiveNode& node, const std::vector<const Stereo*>& sources,
                Stereo& result, int frames) {
    std::vector<std::array<const float*, 2>> pointers;
    pointers.reserve(sources.size());
    for (const Stereo* source : sources) pointers.push_back({source->left.data(), source->right.data()});
    std::vector<dsp_primitives::AudioBufferView> inputs(sources.size());
    for (size_t index = 0; index < sources.size(); ++index) {
        inputs[index].channelData = pointers[index].data();
        inputs[index].numChannels = 2;
        inputs[index].numSamples = frames;
    }
    float* outPointers[] = {result.left.data(), result.right.data()};
    dsp_primitives::WritableAudioBufferView output;
    output.channelData = outPointers;
    output.numChannels = 2;
    output.numSamples = frames;
    std::vector<dsp_primitives::WritableAudioBufferView> outputs{output};
    node.process(inputs, outputs, frames);
}

static void crossfade(dsp_primitives::CrossfaderNode& node, int block, float position) {
    node.setPosition(position);
    node.setCurve(1.0f);
    node.setMix(1.0f);
    node.prepare(48000.0, block);
}

int main(int argc, char** argv) {
    if (argc != 8) {
        std::cerr << "usage: legacy-main-wave-voice-reference OUTPUT FREQUENCY AMPLITUDE WAVEFORM BLEND FRAMES BLOCK\n";
        return 2;
    }
    const float frequency = std::strtof(argv[2], nullptr);
    const float amplitude = std::strtof(argv[3], nullptr);
    const int waveform = std::atoi(argv[4]);
    const float blend = std::strtof(argv[5], nullptr);
    const int frames = std::atoi(argv[6]);
    const int block = std::atoi(argv[7]);
    if (frequency <= 0 || amplitude < 0 || amplitude > 1 || waveform < 0 || waveform > 4
        || blend < -1 || blend > 1 || frames <= 0 || block <= 0) return 2;

    dsp_primitives::OscillatorNode osc;
    osc.setWaveform(waveform);
    osc.setFrequency(frequency);
    osc.setAmplitude(0.0f);
    osc.prepare(48000.0, block);
    osc.disableSIMD();
    osc.setAmplitude(amplitude);
    dsp_primitives::CrossfaderNode mixCrossfade, directionCrossfade, basePathSelect;
    crossfade(mixCrossfade, block, blend);
    crossfade(directionCrossfade, block, blend);
    crossfade(basePathSelect, block, -1.0f);
    dsp_primitives::MixerNode branchMixer(-1);
    branchMixer.setInputCount(3);
    branchMixer.setGain(1, 1.0f);
    branchMixer.setGain(2, 0.0f);
    branchMixer.setGain(3, 0.0f);
    branchMixer.prepare(48000.0, block);
    dsp_primitives::MixerNode voiceMix(-1);
    voiceMix.setInputCount(4);
    for (int input = 1; input <= 3; ++input) voiceMix.setGain(input, 0.0f);
    voiceMix.setGain(4, 1.0f);
    voiceMix.prepare(48000.0, block);

    std::vector<float> result(static_cast<size_t>(frames) * 2);
    for (int offset = 0; offset < frames; offset += block) {
        const int count = std::min(block, frames - offset);
        Stereo zero(count), wave(count), base(count), direction(count), selected(count), branch(count), output(count);
        run(osc, {}, wave, count);
        run(mixCrossfade, {&wave, &zero}, base, count);
        run(directionCrossfade, {&wave, &zero}, direction, count);
        run(basePathSelect, {&base, &direction}, selected, count);
        run(branchMixer, {&selected, &zero, &zero}, branch, count);
        run(voiceMix, {&zero, &zero, &zero, &branch}, output, count);
        for (int frame = 0; frame < count; ++frame) {
            result[(offset + frame) * 2] = output.left[frame];
            result[(offset + frame) * 2 + 1] = output.right[frame];
        }
    }
    std::ofstream file(argv[1], std::ios::binary);
    file.write(reinterpret_cast<const char*>(result.data()), result.size() * sizeof(float));
    return file ? 0 : 2;
}
