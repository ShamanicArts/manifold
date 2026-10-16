// Isolate the old fx_slot.lua gain/mixer routing with two identity effects.
// Compile against the old C++ nodes; no Lua or JUCE runtime is imported into v2.
#include "dsp/core/nodes/GainNode.h"
#include "dsp/core/nodes/MixerNode.h"

#include <array>
#include <fstream>
#include <iostream>
#include <vector>

namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode::
    this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept = default;
}

using dsp_primitives::AudioBufferView;
using dsp_primitives::WritableAudioBufferView;

struct Stereo {
    std::vector<float> left, right;
    explicit Stereo(int frames) : left(frames), right(frames) {}
};

static void runGain(dsp_primitives::GainNode& node, const Stereo& input, Stereo& output, int frames) {
    const float* in[] = {input.left.data(), input.right.data()};
    float* out[] = {output.left.data(), output.right.data()};
    AudioBufferView source;
    source.channelData = in; source.numChannels = 2; source.numSamples = frames;
    WritableAudioBufferView destination;
    destination.channelData = out; destination.numChannels = 2; destination.numSamples = frames;
    std::vector<AudioBufferView> inputs{source};
    std::vector<WritableAudioBufferView> outputs{destination};
    node.process(inputs, outputs, frames);
}

static void runMixer(dsp_primitives::MixerNode& node, const Stereo& a, const Stereo& b,
                     Stereo& output, int frames) {
    const float* aChannels[] = {a.left.data(), a.right.data()};
    const float* bChannels[] = {b.left.data(), b.right.data()};
    float* out[] = {output.left.data(), output.right.data()};
    AudioBufferView first, second;
    first.channelData = aChannels; first.numChannels = 2; first.numSamples = frames;
    second.channelData = bChannels; second.numChannels = 2; second.numSamples = frames;
    WritableAudioBufferView destination;
    destination.channelData = out; destination.numChannels = 2; destination.numSamples = frames;
    std::vector<AudioBufferView> inputs{first, second};
    std::vector<WritableAudioBufferView> outputs{destination};
    node.process(inputs, outputs, frames);
}

int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "usage: legacy-fx-routing-probe OUTPUT.f32\n";
        return 2;
    }
    constexpr int sampleRate = 48000, block = 128, total = 8192;
    dsp_primitives::GainNode dry(2), gateA(2), gateB(2), trim(2);
    for (auto* node : {&dry, &gateA, &gateB, &trim}) node->overrideHighwayImplementationTarget(-1);
    dry.setGain(1.0f);
    gateA.setGain(1.0f);
    gateB.setGain(0.0f);
    trim.setGain(0.0f);
    for (auto* node : {&dry, &gateA, &gateB, &trim}) node->prepare(sampleRate, block);
    dsp_primitives::MixerNode wet(-1), output(-1);
    for (auto* node : {&wet, &output}) {
        node->setInputCount(2);
        node->setGain(1, 1.0f);
        node->setGain(2, 1.0f);
        node->setPan(1, 0.0f);
        node->setPan(2, 0.0f);
        node->setMaster(1.0f);
        node->prepare(sampleRate, block);
    }
    Stereo input(block), dryAudio(block), gateAAudio(block), gateBAudio(block),
        wetAudio(block), trimmed(block), mixed(block);
    input.left.assign(block, 0.8f);
    input.right.assign(block, 0.6f);
    std::ofstream file(argv[1], std::ios::binary);
    if (!file) return 2;
    for (int offset = 0; offset < total; offset += block) {
        if (offset == 2048) { dry.setGain(0.0f); trim.setGain(1.4f); }
        if (offset == 4096) { gateA.setGain(0.0f); gateB.setGain(1.0f); trim.setGain(1.1f); }
        if (offset == 6144) { gateA.setGain(1.0f); gateB.setGain(0.0f); trim.setGain(1.4f); }
        runGain(dry, input, dryAudio, block);
        runGain(gateA, input, gateAAudio, block);
        runGain(gateB, input, gateBAudio, block);
        runMixer(wet, gateAAudio, gateBAudio, wetAudio, block);
        runGain(trim, wetAudio, trimmed, block);
        runMixer(output, dryAudio, trimmed, mixed, block);
        for (int i = 0; i < block; ++i) {
            const std::array<float, 2> sample{mixed.left[i], mixed.right[i]};
            file.write(reinterpret_cast<const char*>(sample.data()), sizeof(sample));
        }
    }
    return file ? 0 : 2;
}
