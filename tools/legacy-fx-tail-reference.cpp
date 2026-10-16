// Isolated old-node Chorus/Delay switch with persistent processing and FX gates.
#include "dsp/core/nodes/ChorusNode.h"
#include "dsp/core/nodes/GainNode.h"
#include "dsp/core/nodes/MixerNode.h"
#include "dsp/core/nodes/StereoDelayNode.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <fstream>
#include <vector>

namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode::
    this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept = default;
template<>
void FloatVectorOperationsBase<float, int>::clear(float* destination, int count) noexcept {
    std::fill_n(destination, count, 0.0f);
}
}

using dsp_primitives::AudioBufferView;
using dsp_primitives::WritableAudioBufferView;
using dsp_primitives::IPrimitiveNode;
struct Stereo {
    std::vector<float> l, r;
    explicit Stereo(int count) : l(count), r(count) {}
};

static void run(IPrimitiveNode& node, const std::vector<const Stereo*>& sources,
                Stereo& destination, int frames) {
    std::vector<AudioBufferView> inputs(sources.size());
    std::vector<std::array<const float*, 2>> pointers(sources.size());
    for (size_t bus = 0; bus < sources.size(); ++bus) {
        pointers[bus] = {sources[bus]->l.data(), sources[bus]->r.data()};
        inputs[bus].channelData = pointers[bus].data();
        inputs[bus].numChannels = 2;
        inputs[bus].numSamples = frames;
    }
    float* out[] = {destination.l.data(), destination.r.data()};
    WritableAudioBufferView view;
    view.channelData = out; view.numChannels = 2; view.numSamples = frames;
    std::vector<WritableAudioBufferView> outputs{view};
    node.process(inputs, outputs, frames);
}

static float inputSample(int frame, int channel) {
    const int pulses[] = {0, 2000, 9500, 14000, 20000};
    float value = 0.0f;
    for (int pulse : pulses) if (frame == pulse + channel * 23) value += channel ? -0.55f : 0.7f;
    if ((frame >= 4000 && frame < 6000) || (frame >= 10500 && frame < 12500)) {
        value += (channel ? 0.17f : 0.2f) * std::sin(2.0 * 3.141592653589793 * (channel ? 330.0 : 220.0) * frame / 48000.0);
    }
    return value;
}

int main(int argc, char** argv) {
    if (argc != 2) return 2;
    constexpr int rate = 48000, block = 128, frames = 32768;
    dsp_primitives::StereoDelayNode delay;
    delay.setTempo(120); delay.setTimeMode(dsp_primitives::StereoDelayNode::TimeMode::Free);
    delay.setTimeL(40); delay.setTimeR(60); delay.setFeedback(0.552f);
    delay.setFeedbackCrossfeed(0.12f); delay.setFilterEnabled(false);
    delay.setFilterCutoff(4200); delay.setFilterResonance(0.5f); delay.setMix(1);
    delay.setPingPong(true); delay.setWidth(1); delay.setFreeze(false); delay.setDucking(0);
    delay.prepare(rate, block);
    dsp_primitives::ChorusNode chorus;
    chorus.setRate(1.24f); chorus.setDepth(0.525f); chorus.setVoices(3);
    chorus.setSpread(0.6f); chorus.setFeedback(0.07f); chorus.setWaveform(0); chorus.setMix(1);
    chorus.prepare(rate, block);
    dsp_primitives::GainNode dry(2), gateChorus(2), gateDelay(2), trim(2);
    for (auto* node : {&dry, &gateChorus, &gateDelay, &trim}) node->overrideHighwayImplementationTarget(-1);
    dry.setGain(0); gateChorus.setGain(0); gateDelay.setGain(1); trim.setGain(1.1f);
    for (auto* node : {&dry, &gateChorus, &gateDelay, &trim}) node->prepare(rate, block);
    dsp_primitives::MixerNode wet(-1), output(-1);
    for (auto* node : {&wet, &output}) {
        node->setInputCount(2); node->setGain(1, 1); node->setGain(2, 1);
        node->setPan(1, 0); node->setPan(2, 0); node->setMaster(1);
        node->prepare(rate, block);
    }
    Stereo input(block), delayed(block), chorused(block), dryAudio(block),
        chorusGate(block), delayGate(block), wetAudio(block), trimmed(block), mixed(block);
    std::ofstream file(argv[1], std::ios::binary);
    if (!file) return 2;
    bool chorusVisited = false;
    for (int offset = 0; offset < frames; offset += block) {
        if (offset == 8192) {
            chorusVisited = true; gateChorus.setGain(1); gateDelay.setGain(0); trim.setGain(1.4f);
        }
        if (offset == 16384) {
            gateChorus.setGain(0); gateDelay.setGain(1); trim.setGain(1.1f);
        }
        for (int i = 0; i < block; ++i) {
            input.l[i] = inputSample(offset + i, 0);
            input.r[i] = inputSample(offset + i, 1);
        }
        run(delay, {&input}, delayed, block); // Continue through the closed gate.
        if (chorusVisited) run(chorus, {&input}, chorused, block);
        else { std::fill(chorused.l.begin(), chorused.l.end(), 0); std::fill(chorused.r.begin(), chorused.r.end(), 0); }
        run(dry, {&input}, dryAudio, block);
        run(gateChorus, {&chorused}, chorusGate, block);
        run(gateDelay, {&delayed}, delayGate, block);
        run(wet, {&chorusGate, &delayGate}, wetAudio, block);
        run(trim, {&wetAudio}, trimmed, block);
        run(output, {&dryAudio, &trimmed}, mixed, block);
        for (int i = 0; i < block; ++i) {
            const std::array<float, 2> sample{mixed.l[i], mixed.r[i]};
            file.write(reinterpret_cast<const char*>(sample.data()), sizeof(sample));
        }
    }
    return file ? 0 : 2;
}
