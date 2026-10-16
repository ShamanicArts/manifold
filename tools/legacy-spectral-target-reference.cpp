// Isolated old SineBankNode recipe helpers and original OscillatorNode wave recipe.
// Including the original .cpp keeps its anonymous-namespace helpers callable here.
#include "dsp/core/nodes/SineBankNode.cpp"
#include "dsp/core/nodes/TemporalPartialData.h"
#include <cstdlib>
#include <iomanip>
#include <iostream>

namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode
    ::this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept {}
}

int main(int argc, char** argv) {
    if (argc != 2) return 2;
    const int caseId = std::atoi(argv[1]);
    dsp_primitives::PartialData sample;
    sample.fundamental = 220.0f;
    sample.activeCount = 5;
    const float frequencies[] = {220.0f, 440.0f, 663.0f, 884.0f, 1320.0f};
    const float amplitudes[] = {1.0f, 0.4f, 0.2f, 0.1f, 0.08f};
    for (int i = 0; i < sample.activeCount; ++i) {
        const auto slot = static_cast<size_t>(i);
        sample.frequencies[slot] = frequencies[i];
        sample.amplitudes[slot] = amplitudes[i];
        sample.phases[slot] = 0.2f * static_cast<float>(i);
        sample.decayRates[slot] = 0.1f * static_cast<float>(i);
    }
    dsp_primitives::PartialData result;
    if (caseId >= 0 && caseId < 8) {
        result = dsp_primitives::buildWavePartials(caseId, 1.0f, 8, 0.2f, 0.3f, 0.35f);
    } else if (caseId == 8) {
        result = dsp_primitives::normalizeToRatioSpace(sample);
    } else if (caseId == 9) {
        result = dsp_primitives::normalizeToRatioSpace(
            dsp_primitives::buildDrivenSamplePartials(
                dsp_primitives::applySpectralShaping(sample, 0.2f, 1), 1, 0.35f));
    } else if (caseId == 10 || caseId == 11 || caseId == 12) {
        const auto wave = dsp_primitives::buildWavePartials(1, 1.0f, 8, 0.2f, 0.3f, 0.35f);
        const auto ratio = dsp_primitives::normalizeToRatioSpace(sample);
        const float position = caseId == 10 ? 0.0f : caseId == 11 ? 0.5f : 1.0f;
        result = dsp_primitives::applySpectralShaping(
            dsp_primitives::morphRatioPartials(wave, ratio, position, 2, 0.7f), 0.1f, 2);
    } else if (caseId >= 13 && caseId <= 16) {
        dsp_primitives::TemporalPartialData temporal;
        temporal.frameCount = 3;
        temporal.frameTimes = {0.0f, 0.5f, 1.0f};
        for (int frame = 0; frame < 3; ++frame) {
            dsp_primitives::PartialData partials;
            partials.fundamental = 220.0f;
            partials.activeCount = frame == 0 ? 2 : 3;
            for (int index = 0; index < partials.activeCount; ++index) {
                const auto slot = static_cast<size_t>(index);
                partials.frequencies[slot] = (220.0f + 5.0f * frame) * (index + 1);
                partials.amplitudes[slot] = (1.0f - 0.2f * frame) / (index + 1);
                partials.phases[slot] = 0.1f * (frame + index);
                partials.decayRates[slot] = 0.03f * index;
            }
            temporal.frames.push_back(partials);
        }
        const float position = caseId == 13 || caseId == 14 ? 0.25f : caseId == 15 ? 0.65f : 1.0f;
        const float smooth = caseId == 13 ? 0.0f : caseId == 14 ? 0.7f : 1.0f;
        const float contrast = caseId == 15 ? 1.5f : 0.5f;
        result = temporal.interpolateAtPosition(position, smooth, contrast);
    } else {
        return 2;
    }
    std::cout << std::setprecision(9) << "{\"id\":" << caseId << ",\"fundamental\":" << result.fundamental
              << ",\"partials\":[";
    for (int i = 0; i < result.activeCount; ++i) {
        if (i) std::cout << ',';
        const auto slot = static_cast<size_t>(i);
        std::cout << '[' << result.frequencies[slot] << ',' << result.amplitudes[slot]
                  << ',' << result.phases[slot] << ',' << result.decayRates[slot] << ']';
    }
    std::cout << "]}\n";
    return 0;
}
