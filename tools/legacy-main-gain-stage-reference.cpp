// Compiled C++ reference for the old Main sample-only voice gain chain.
#include "dsp/core/nodes/CrossfaderNode.h"
#include "dsp/core/nodes/GainNode.h"
#include "dsp/core/nodes/MixerNode.h"

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

int main(int argc, char** argv) {
    if (argc != 7) {
        std::cerr << "usage: legacy-main-gain-stage-reference SOURCE OUTPUT AMP DEPTH FRAMES BLOCK\n";
        return 2;
    }
    const float amp = std::strtof(argv[3], nullptr);
    const float depth = std::strtof(argv[4], nullptr);
    const int frames = std::atoi(argv[5]);
    const int block = std::atoi(argv[6]);
    if (!(amp >= 0.0f && amp <= 1.0f && depth >= 0.0f && depth <= 1.0f)
        || frames <= 0 || block <= 0) return 2;
    std::ifstream sourceFile(argv[1], std::ios::binary | std::ios::ate);
    if (!sourceFile) return 2;
    const auto bytes = sourceFile.tellg();
    if (bytes < static_cast<std::streamoff>(frames * 2 * sizeof(float))) return 2;
    sourceFile.seekg(0);
    std::vector<float> source(static_cast<size_t>(frames) * 2);
    sourceFile.read(reinterpret_cast<char*>(source.data()), source.size() * sizeof(float));
    if (!sourceFile) return 2;

    dsp_primitives::GainNode sampleBlendGain(2);
    sampleBlendGain.overrideHighwayImplementationTarget(-1);
    sampleBlendGain.setGain(amp * 2.0f);
    sampleBlendGain.prepare(48000.0, block);
    dsp_primitives::CrossfaderNode mixCrossfade;
    mixCrossfade.setPosition(1.0f);
    mixCrossfade.setCurve(1.0f);
    mixCrossfade.setMix(1.0f);
    mixCrossfade.prepare(48000.0, block);
    dsp_primitives::MixerNode branchMixer(-1);
    branchMixer.setInputCount(3);
    branchMixer.setGain(1, 1.0f - depth);
    branchMixer.setGain(2, 0.0f);
    branchMixer.setGain(3, depth);
    branchMixer.prepare(48000.0, block);
    dsp_primitives::MixerNode voiceMix(-1);
    voiceMix.setInputCount(4);
    for (int bus = 1; bus <= 3; ++bus) voiceMix.setGain(bus, 0.0f);
    voiceMix.setGain(4, 1.0f);
    voiceMix.prepare(48000.0, block);

    std::vector<float> result(source.size());
    for (int offset = 0; offset < frames; offset += block) {
        const int count = std::min(block, frames - offset);
        Stereo input(count), zero(count), scaled(count), base(count), branch(count), output(count);
        for (int i = 0; i < count; ++i) {
            input.left[i] = source[(offset + i) * 2];
            input.right[i] = source[(offset + i) * 2 + 1];
        }
        run(sampleBlendGain, {&input}, scaled, count);
        run(mixCrossfade, {&zero, &scaled}, base, count);
        run(branchMixer, {&base, &zero, &zero}, branch, count);
        run(voiceMix, {&zero, &zero, &zero, &branch}, output, count);
        for (int i = 0; i < count; ++i) {
            result[(offset + i) * 2] = output.left[i];
            result[(offset + i) * 2 + 1] = output.right[i];
        }
    }
    std::ofstream destination(argv[2], std::ios::binary);
    destination.write(reinterpret_cast<const char*>(result.data()), result.size() * sizeof(float));
    return destination ? 0 : 2;
}
