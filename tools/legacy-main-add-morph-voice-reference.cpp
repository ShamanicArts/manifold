// Original Main Add/Morph path with one fixed, published source spectrum.
// Temporal spectrum updates, the vocoder and the UI-rate voice envelope are excluded.
#include "dsp/core/nodes/CrossfaderNode.h"
#include "dsp/core/nodes/GainNode.h"
#include "dsp/core/nodes/MixerNode.h"
#include "dsp/core/nodes/OscillatorNode.h"
#include "dsp/core/nodes/SampleRegionPlaybackNode.h"
#include "dsp/core/nodes/SineBankNode.h"

#include <algorithm>
#include <array>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

namespace juce {
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
        std::cerr << "usage: legacy-main-add-morph-voice-reference SAMPLE OUTPUT SAMPLE_FRAMES FREQ AMP WAVEFORM BLEND DEPTH MODE FRAMES BLOCK SOURCE_PARTIALS\n";
        return 2;
    }
    const int sampleFrames = std::atoi(argv[3]);
    const float frequency = std::strtof(argv[4], nullptr);
    const float amplitude = std::strtof(argv[5], nullptr);
    const int waveform = std::atoi(argv[6]);
    const float blend = std::strtof(argv[7], nullptr);
    const float depth = std::strtof(argv[8], nullptr);
    const int mode = std::atoi(argv[9]);
    const int frames = std::atoi(argv[10]);
    const int block = std::atoi(argv[11]);
    if (sampleFrames < 2 || frequency <= 0 || amplitude < 0 || amplitude > 1
        || waveform < 0 || waveform > 4 || blend < -1 || blend > 1
        || depth < 0 || depth > 1 || (mode != 4 && mode != 5)
        || frames <= 0 || block <= 0) return 2;
    std::vector<float> values;
    std::istringstream partialInput(argv[12]);
    for (std::string field; std::getline(partialInput, field, ',');) {
        values.push_back(std::strtof(field.c_str(), nullptr));
    }
    if (values.empty() || values.size() % 4 || values.size() > 32 * 4) return 2;
    std::vector<float> source(static_cast<size_t>(sampleFrames) * 2);
    std::ifstream input(argv[1], std::ios::binary);
    input.read(reinterpret_cast<char*>(source.data()), source.size() * sizeof(float));
    if (!input) return 3;
    juce::AudioBuffer<float> captured(2, sampleFrames);
    for (int frame = 0; frame < sampleFrames; frame++) {
        captured.setSample(0, frame, source[frame * 2]);
        captured.setSample(1, frame, source[frame * 2 + 1]);
    }

    auto player = std::make_shared<dsp_primitives::SampleRegionPlaybackNode>(2);
    player->prepare(48000.0, block);
    player->copyFromCaptureBuffer(captured, sampleFrames, 0, sampleFrames, false);
    dsp_primitives::PartialData spectrum;
    spectrum.fundamental = frequency;
    spectrum.activeCount = static_cast<int>(values.size() / 4);
    for (int i = 0; i < spectrum.activeCount; ++i) {
        spectrum.frequencies[i] = frequency * values[i * 4];
        spectrum.amplitudes[i] = values[i * 4 + 1];
        spectrum.phases[i] = values[i * 4 + 2];
        spectrum.decayRates[i] = values[i * 4 + 3];
    }
    player->publishAsyncAnalysisResult(0, {}, spectrum, {});
    player->setSpeed(1.0f);
    player->trigger();
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
    dsp_primitives::CrossfaderNode mixCrossfade, basePathSelect, addCrossfade;
    crossfade(mixCrossfade, block, blend);
    crossfade(basePathSelect, block, -1.0f);
    crossfade(addCrossfade, block, mode == 5 ? 1.0f : blend);
    dsp_primitives::OscillatorNode blendAddOsc;
    blendAddOsc.setWaveform(waveform);
    blendAddOsc.setFrequency(220.0f);
    blendAddOsc.setAmplitude(0.0f);
    blendAddOsc.setRenderMode(1);
    blendAddOsc.setAdditivePartials(8);
    blendAddOsc.prepare(48000.0, block);
    blendAddOsc.disableSIMD();
    blendAddOsc.setFrequency(frequency);
    blendAddOsc.setAmplitude(amplitude * 2.0f);
    dsp_primitives::SineBankNode sampleAdditive;
    sampleAdditive.setAmplitude(0.0f);
    sampleAdditive.setSpectralMode(mode == 4 ? 1 : 2);
    sampleAdditive.setSpectralSamplePlayback(player);
    sampleAdditive.setSpectralWaveform(waveform);
    sampleAdditive.setSpectralMorphAmount(1.0f);
    sampleAdditive.setSpectralMorphDepth(1.0f);
    sampleAdditive.setSpectralMorphCurve(2);
    sampleAdditive.prepare(48000.0, block);
    // The Main voice is prepared at the node default, then retuned on note-on.
    sampleAdditive.setFrequency(frequency);
    sampleAdditive.setAmplitude(amplitude * 2.0f);
    dsp_primitives::GainNode sampleAdditiveGain(2), addPhraseGain(2), addBranchGain(2);
    for (auto* gain : {&sampleAdditiveGain, &addPhraseGain, &addBranchGain}) {
        gain->overrideHighwayImplementationTarget(-1);
        gain->setGain(1.0f);
        gain->prepare(48000.0, block);
    }
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

    std::vector<float> result(static_cast<size_t>(frames) * 2);
    for (int offset = 0; offset < frames; offset += block) {
        const int count = std::min(block, frames - offset);
        Stereo raw(count), wave(count), sample(count), base(count), selected(count), addWave(count), addSample(count), gainedSample(count), addMixed(count), phrased(count), addBranch(count), zero(count), branch(count), output(count);
        run(*player, {}, raw, count);
        run(osc, {&raw}, wave, count);
        run(sampleBlendGain, {&raw}, sample, count);
        run(mixCrossfade, {&wave, &sample}, base, count);
        run(basePathSelect, {&base, &zero}, selected, count);
        run(blendAddOsc, {}, addWave, count);
        run(sampleAdditive, {}, addSample, count);
        run(sampleAdditiveGain, {&addSample}, gainedSample, count);
        run(addCrossfade, {&addWave, &gainedSample}, addMixed, count);
        run(addPhraseGain, {&addMixed}, phrased, count);
        run(addBranchGain, {&phrased}, addBranch, count);
        run(branchMixer, {&selected, &zero, &addBranch}, branch, count);
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
