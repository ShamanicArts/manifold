// Isolated old temporal extractor with an explicitly supplied pitch decision.
// The original PartialsExtractor and JUCE FFT implementation are compiled here;
// the full legacy pitch detector and sample playback host are outside this probe.
#include <juce_dsp/juce_dsp.h>
#include "dsp/core/nodes/PartialsExtractor.h"
#include <cmath>
#include <cstdlib>
#include <fstream>
#include <iomanip>
#include <thread>
#include <vector>

// The JUCE FFT translation unit is self-contained apart from a core SpinLock
// function. This isolated, uncontended runner supplies its normal spin behavior.
#include "juce_dsp/frequency/juce_FFT.cpp"
namespace juce {
void SpinLock::enter() const noexcept { while (!tryEnter()) std::this_thread::yield(); }
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode
    ::this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept {}
}

int main(int argc, char** argv) {
    // OUTPUT INPUT SOURCE_FRAMES RATE REGION_START REGION_END FUNDAMENTAL MAX_FRAMES
    if (argc != 9) return 2;
    const int sourceFrames = std::atoi(argv[3]);
    const float rate = std::strtof(argv[4], nullptr);
    const int regionStart = std::atoi(argv[5]);
    const int regionEnd = std::atoi(argv[6]);
    const float fundamental = std::strtof(argv[7], nullptr);
    const int maxFrames = std::atoi(argv[8]);
    if (sourceFrames < 256 || rate < 8000 || regionStart < 0 || regionEnd > sourceFrames
        || regionEnd - regionStart < 256 || maxFrames < 1 || maxFrames > 128) return 2;
    std::vector<float> stereo(static_cast<size_t>(sourceFrames) * 2);
    std::ifstream input(argv[2], std::ios::binary);
    input.read(reinterpret_cast<char*>(stereo.data()), static_cast<std::streamsize>(stereo.size() * sizeof(float)));
    if (!input) return 3;
    std::vector<float> mono(static_cast<size_t>(regionEnd - regionStart));
    for (int frame = regionStart; frame < regionEnd; ++frame) {
        mono[static_cast<size_t>(frame - regionStart)] =
            (stereo[static_cast<size_t>(frame) * 2] + stereo[static_cast<size_t>(frame) * 2 + 1]) * 0.5f;
    }
    dsp_primitives::SampleAnalysis analysis;
    analysis.frequency = fundamental;
    analysis.isReliable = fundamental > 0;
    const auto result = dsp_primitives::PartialsExtractor::extractTemporalFrames(
        mono.data(), static_cast<int>(mono.size()), rate, analysis, 2, 32, 2048, 1024, maxFrames);
    std::ofstream output(argv[1]);
    output << std::setprecision(9) << "{\"globalFundamental\":" << result.globalFundamental
           << ",\"frameCount\":" << result.frameCount << ",\"frames\":[";
    for (int index = 0; index < result.frameCount; ++index) {
        if (index) output << ',';
        const auto& frame = result.frames[static_cast<size_t>(index)];
        output << "{\"position\":" << result.frameTimes[static_cast<size_t>(index)]
               << ",\"rms\":" << frame.rmsLevel
               << ",\"brightness\":" << frame.brightness
               << ",\"fundamental\":" << frame.fundamental << ",\"partials\":[";
        for (int partial = 0; partial < frame.activeCount; ++partial) {
            if (partial) output << ',';
            const auto slot = static_cast<size_t>(partial);
            output << '[' << frame.frequencies[slot] << ',' << frame.amplitudes[slot]
                   << ',' << frame.phases[slot] << ',' << frame.decayRates[slot] << ']';
        }
        output << "]}";
    }
    output << "]}\n";
    return output ? 0 : 4;
}
