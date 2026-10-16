// Original Main Ring path: sample player + oscillator + gain + crossfades + mixers.
// The PhaseVocoder has mix zero and the UI-rate voice envelope is not constructed here.
#include "dsp/core/nodes/CrossfaderNode.h"
#include "dsp/core/nodes/GainNode.h"
#include "dsp/core/nodes/MixerNode.h"
#include "dsp/core/nodes/OscillatorNode.h"
#include "dsp/core/nodes/RingModulatorNode.h"
#include "dsp/core/nodes/SampleRegionPlaybackNode.h"

#include <algorithm>
#include <array>
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
    if (argc != 13) {
        std::cerr << "usage: legacy-main-ring-voice-reference SAMPLE OUTPUT SAMPLE_FRAMES FREQ AMP WAVEFORM BLEND DEPTH WAVE_TO_SAMPLE SAMPLE_TO_WAVE FRAMES BLOCK\n";
        return 2;
    }
    const int sampleFrames = std::atoi(argv[3]);
    const float frequency = std::strtof(argv[4], nullptr);
    const float amplitude = std::strtof(argv[5], nullptr);
    const int waveform = std::atoi(argv[6]);
    const float blend = std::strtof(argv[7], nullptr);
    const float depth = std::strtof(argv[8], nullptr);
    const float waveToSample = std::strtof(argv[9], nullptr);
    const float sampleToWave = std::strtof(argv[10], nullptr);
    const int frames = std::atoi(argv[11]);
    const int block = std::atoi(argv[12]);
    if (sampleFrames < 2 || frequency <= 0 || amplitude < 0 || amplitude > 1
        || waveform < 0 || waveform > 4 || blend < -1 || blend > 1
        || depth < 0 || depth > 1 || waveToSample < 0 || waveToSample > 1
        || sampleToWave < 0 || sampleToWave > 1
        || frames <= 0 || block <= 0) return 2;
    std::vector<float> source(static_cast<size_t>(sampleFrames) * 2);
    std::ifstream input(argv[1], std::ios::binary);
    input.read(reinterpret_cast<char*>(source.data()), source.size() * sizeof(float));
    if (!input) return 3;
    juce::AudioBuffer<float> captured(2, sampleFrames);
    for (int frame = 0; frame < sampleFrames; frame++) {
        captured.setSample(0, frame, source[frame * 2]);
        captured.setSample(1, frame, source[frame * 2 + 1]);
    }

    dsp_primitives::SampleRegionPlaybackNode player(2);
    player.prepare(48000.0, block);
    player.copyFromCaptureBuffer(captured, sampleFrames, 0, sampleFrames, false);
    player.setSpeed(1.0f);
    player.trigger();
    dsp_primitives::OscillatorNode osc;
    osc.setWaveform(waveform);
    osc.setFrequency(frequency);
    osc.setAmplitude(0.0f);
    osc.prepare(48000.0, block);
    osc.disableSIMD();
    osc.setAmplitude(amplitude);
    dsp_primitives::GainNode sampleBlendGain(2);
    sampleBlendGain.overrideHighwayImplementationTarget(-1);
    sampleBlendGain.setGain(amplitude * 2.0f);
    sampleBlendGain.prepare(48000.0, block);
    dsp_primitives::CrossfaderNode mixCrossfade, directionCrossfade, basePathSelect;
    crossfade(mixCrossfade, block, blend);
    crossfade(directionCrossfade, block, blend);
    crossfade(basePathSelect, block, -1.0f);
    dsp_primitives::RingModulatorNode ringSampleToWave, ringWaveToSample;
    for (auto* ring : {&ringSampleToWave, &ringWaveToSample}) {
        ring->setFrequency(120.0f);
        ring->setDepth(0.0f);
        ring->setMix(0.0f);
        ring->setSpread(0.0f);
        ring->setEnabled(false);
        ring->prepare(48000.0, block);
    }
    ringSampleToWave.setEnabled(true);
    ringSampleToWave.setFrequency(frequency);
    ringSampleToWave.setDepth(depth);
    ringSampleToWave.setMix(1.0f);
    ringSampleToWave.setSpread(waveToSample * 180.0f);
    ringWaveToSample.setEnabled(true);
    ringWaveToSample.setFrequency(frequency);
    ringWaveToSample.setDepth(depth);
    ringWaveToSample.setMix(1.0f);
    ringWaveToSample.setSpread(sampleToWave * 180.0f);
    dsp_primitives::CrossfaderNode ringCrossfade;
    crossfade(ringCrossfade, block, blend);
    dsp_primitives::MixerNode branchMixer(-1);
    branchMixer.setInputCount(3);
    branchMixer.setGain(1, 0.0f);
    branchMixer.setGain(2, 1.0f);
    branchMixer.setGain(3, 0.0f);
    branchMixer.prepare(48000.0, block);
    dsp_primitives::MixerNode voiceMix(-1);
    voiceMix.setInputCount(4);
    for (int bus = 1; bus <= 3; ++bus) voiceMix.setGain(bus, 0.0f);
    voiceMix.setGain(4, 1.0f);
    voiceMix.prepare(48000.0, block);

    std::vector<float> result(static_cast<size_t>(frames) * 2);
    for (int offset = 0; offset < frames; offset += block) {
        const int count = std::min(block, frames - offset);
        Stereo raw(count), wave(count), sample(count), base(count), direction(count), selected(count), ringA(count), ringB(count), ringBus(count), zero(count), branch(count), output(count);
        run(player, {}, raw, count);
        run(osc, {&raw}, wave, count);
        run(sampleBlendGain, {&raw}, sample, count);
        run(mixCrossfade, {&wave, &sample}, base, count);
        run(directionCrossfade, {&wave, &sample}, direction, count);
        run(basePathSelect, {&base, &direction}, selected, count);
        run(ringSampleToWave, {&wave, &sample}, ringA, count);
        run(ringWaveToSample, {&sample, &wave}, ringB, count);
        run(ringCrossfade, {&ringA, &ringB}, ringBus, count);
        run(branchMixer, {&selected, &ringBus, &zero}, branch, count);
        run(voiceMix, {&zero, &zero, &zero, &branch}, output, count);
        for (int frame = 0; frame < count; frame++) {
            result[(offset + frame) * 2] = output.left[frame];
            result[(offset + frame) * 2 + 1] = output.right[frame];
        }
    }
    std::ofstream file(argv[2], std::ios::binary);
    file.write(reinterpret_cast<const char*>(result.data()), result.size() * sizeof(float));
    return file ? 0 : 4;
}
