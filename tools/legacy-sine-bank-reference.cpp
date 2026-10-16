// Manual-mode capture of the original SineBankNode. Unused spectral collaborators
// abort if entered: this runner deliberately exercises only manual partial mode.
#include "dsp/core/nodes/SineBankNode.h"
#include "dsp/core/nodes/OscillatorNode.h"
#include "dsp/core/nodes/SampleRegionPlaybackNode.h"
#include <algorithm>
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <vector>

namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode
    ::this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept {}
template<>
void FloatVectorOperationsBase<float, int>::clear(float* destination, int count) noexcept {
    std::fill_n(destination, count, 0.0f);
}
}

namespace dsp_primitives {
PartialData buildWavePartials(int, float, int, float, float, float) { std::abort(); }
int SampleRegionPlaybackNode::getTemporalFrameCount() const { std::abort(); }
PartialData SampleRegionPlaybackNode::getTemporalFrameAtPosition(float, float, float) const { std::abort(); }
PartialData SampleRegionPlaybackNode::getLastPartials() const { std::abort(); }
}

static void apply(dsp_primitives::SineBankNode& node, int id, float value) {
    switch (id) {
        case 0: node.setFrequency(value); break;
        case 1: node.setAmplitude(value); break;
        case 2: node.setEnabled(value >= 0.5f); break;
        case 3: node.setStereoSpread(value); break;
        case 4: node.setUnison(static_cast<int>(std::round(value))); break;
        case 5: node.setDetune(value); break;
        case 6: node.setDrive(value); break;
        case 7: node.setDriveShape(static_cast<int>(std::round(value))); break;
        case 8: node.setDriveBias(value); break;
        case 9: node.setDriveMix(value); break;
        case 10: node.setSyncEnabled(value >= 0.5f); break;
    }
}

int main(int argc, char** argv) {
    // OUTPUT INPUT RATE BLOCK FRAMES STEP PRESET BEFORE[11] AFTER[11]
    if (argc != 30) return 2;
    const int sampleRate = std::atoi(argv[3]);
    const int blockSize = std::atoi(argv[4]);
    const int frames = std::atoi(argv[5]);
    const int stepFrame = std::atoi(argv[6]);
    const int preset = std::atoi(argv[7]);
    if (sampleRate < 8000 || blockSize < 1 || frames < 1 || stepFrame < 0 || stepFrame > frames || stepFrame % blockSize) return 2;
    std::ifstream source(argv[2], std::ios::binary);
    std::vector<float> input(static_cast<size_t>(frames) * 2);
    source.read(reinterpret_cast<char*>(input.data()), static_cast<std::streamsize>(input.size() * sizeof(float)));
    if (!source) return 3;

    dsp_primitives::SineBankNode node;
    for (int id = 0; id < 11; ++id) apply(node, id, std::strtof(argv[8 + id], nullptr));
    node.prepare(sampleRate, blockSize);
    dsp_primitives::PartialData partials;
    partials.fundamental = 440.0f;
    partials.activeCount = preset == 0 ? 0 : preset == 1 ? 1 : preset == 2 ? 8 : 32;
    for (int index = 0; index < partials.activeCount; ++index) {
        const int harmonic = index + 1;
        partials.frequencies[index] = 440.0f * harmonic;
        partials.amplitudes[index] = preset == 1 ? 1.0f : preset == 2 ? 1.0f / harmonic :
            (harmonic % 2 == 1 ? 1.0f / harmonic : 0.0f);
        partials.phases[index] = 0.0f;
        partials.decayRates[index] = 0.25f; // stored, not used by the manual audio loop
    }
    node.setPartials(partials);

    std::vector<float> result(input.size());
    for (int offset = 0; offset < frames; offset += blockSize) {
        if (offset == stepFrame) for (int id = 0; id < 11; ++id) apply(node, id, std::strtof(argv[19 + id], nullptr));
        const int count = std::min(blockSize, frames - offset);
        std::vector<float> sync(count), left(count), right(count);
        for (int frame = 0; frame < count; ++frame) sync[frame] = input[(offset + frame) * 2];
        const float* inputPointers[] = {sync.data()};
        float* outputPointers[] = {left.data(), right.data()};
        dsp_primitives::AudioBufferView in;
        in.channelData = inputPointers; in.numChannels = 1; in.numSamples = count;
        dsp_primitives::WritableAudioBufferView out;
        out.channelData = outputPointers; out.numChannels = 2; out.numSamples = count;
        std::vector<dsp_primitives::AudioBufferView> inputs{in};
        std::vector<dsp_primitives::WritableAudioBufferView> outputs{out};
        node.process(inputs, outputs, count);
        for (int frame = 0; frame < count; ++frame) {
            result[(offset + frame) * 2] = left[frame];
            result[(offset + frame) * 2 + 1] = right[frame];
        }
    }
    std::ofstream destination(argv[1], std::ios::binary);
    destination.write(reinterpret_cast<const char*>(result.data()), static_cast<std::streamsize>(result.size() * sizeof(float)));
    return destination ? 0 : 4;
}
