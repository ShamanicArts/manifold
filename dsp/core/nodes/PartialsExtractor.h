#pragma once

#include "dsp/core/nodes/PartialData.h"
#include "dsp/core/nodes/SampleAnalysis.h"
#include "dsp/core/nodes/SampleAnalyzer.h"
#include "dsp/core/nodes/TemporalPartialData.h"

#include <juce_core/juce_core.h>
#include <juce_audio_basics/juce_audio_basics.h>

#include <algorithm>
#include <array>
#include <cmath>
#include <limits>
#include <vector>

namespace dsp_primitives {

class PartialsExtractor {
public:
    static PartialData extractBuffer(const juce::AudioBuffer<float>& buffer,
                                     int numChannels,
                                     int numSamples,
                                     float sampleRate,
                                     int maxPartials = PartialData::kMaxPartials) {
        const auto mono = SampleAnalyzer::foldToMono(buffer, numChannels, numSamples);
        const auto analysis = SampleAnalyzer::analyzeMonoBuffer(
            mono.samples.data(), static_cast<int>(mono.samples.size()), sampleRate, mono.numChannels);
        return extractMonoBuffer(mono.samples.data(),
                                 static_cast<int>(mono.samples.size()),
                                 sampleRate,
                                 analysis,
                                 mono.numChannels,
                                 maxPartials);
    }

    static PartialData extractMonoBuffer(const float* samples,
                                         int numSamples,
                                         float sampleRate,
                                         const SampleAnalysis& analysis,
                                         int numChannels = 1,
                                         int maxPartials = PartialData::kMaxPartials) {
        PartialData result;
        result.numSamples = juce::jmax(0, numSamples);
        result.numChannels = juce::jmax(1, numChannels);
        result.sampleRate = sampleRate > 0.0f ? sampleRate : 44100.0f;
        result.fundamental = analysis.frequency > 0.0f ? analysis.frequency : 0.0f;
        result.brightness = analysis.brightness;
        result.rmsLevel = analysis.rms;
        result.peakLevel = analysis.peak;
        result.attackTimeMs = analysis.attackTimeMs;
        result.spectralCentroidHz = analysis.spectralCentroidHz;
        result.analysisStartSample = analysis.analysisStartSample;
        result.analysisEndSample = analysis.analysisEndSample;
        result.isPercussive = analysis.isPercussive;
        result.isReliable = analysis.isReliable;
        result.algorithm = "harmonic-projection";

        if (!samples || numSamples <= 0 || result.sampleRate <= 0.0f) {
            result.algorithm = "none";
            return result;
        }

        const int partialLimit = juce::jlimit(1, PartialData::kMaxPartials, maxPartials);
        const int analysisStart = juce::jlimit(0, juce::jmax(0, numSamples - 1),
                                               analysis.analysisStartSample);
        const int analysisEnd = juce::jlimit(analysisStart + 1,
                                             numSamples,
                                             analysis.analysisEndSample > analysisStart
                                                 ? analysis.analysisEndSample
                                                 : numSamples);
        result.analysisStartSample = analysisStart;
        result.analysisEndSample = analysisEnd;

        const int available = analysisEnd - analysisStart;
        const int windowSize = chooseWindowSize(available);
        if (windowSize < 512) {
            result.algorithm = "spectral-peaks-window-too-small";
            return result;
        }

        const int headStart = juce::jlimit(0, numSamples - windowSize,
                                           analysisStart + juce::jmax(0, (available - windowSize) / 2));
        const int tailStart = juce::jlimit(0, numSamples - windowSize,
                                           juce::jmax(analysisStart, analysisEnd - windowSize));
        const float nyquist = result.sampleRate * 0.5f;

        auto fallbackToSpectralPeaks = [&]() {
            PartialData fallback = buildSpectralPeakPartials(samples + headStart,
                                                             windowSize,
                                                             result.sampleRate,
                                                             partialLimit,
                                                             (tailStart > headStart) ? (samples + tailStart) : nullptr,
                                                             (tailStart > headStart) ? windowSize : 0,
                                                             (tailStart > headStart)
                                                                 ? (static_cast<float>(tailStart - headStart) / result.sampleRate)
                                                                 : 0.0f);
            fallback.numSamples = result.numSamples;
            fallback.numChannels = result.numChannels;
            fallback.sampleRate = result.sampleRate;
            fallback.brightness = result.brightness;
            fallback.rmsLevel = result.rmsLevel;
            fallback.peakLevel = result.peakLevel;
            fallback.attackTimeMs = result.attackTimeMs;
            fallback.spectralCentroidHz = result.spectralCentroidHz;
            fallback.analysisStartSample = analysisStart;
            fallback.analysisEndSample = analysisEnd;
            fallback.isPercussive = result.isPercussive;
            return fallback;
        };

        if (analysis.frequency <= 0.0f) {
            return fallbackToSpectralPeaks();
        }

        struct HarmonicCandidate {
            float expectedFrequency = 0.0f;
            float measuredFrequency = 0.0f;
            float amplitude = 0.0f;
            float phase = 0.0f;
            float decayRate = 0.0f;
            int harmonicNumber = 0;
        };

        std::array<HarmonicCandidate, PartialData::kMaxPartials> candidates{};
        float strongestAmplitude = 0.0f;
        int candidateCount = 0;

        for (int i = 0; i < partialLimit; ++i) {
            const int harmonicNumber = i + 1;
            const float expectedFrequency = analysis.frequency * static_cast<float>(harmonicNumber);
            if (expectedFrequency <= 0.0f || expectedFrequency >= nyquist * 0.95f) {
                break;
            }

            HarmonicCandidate candidate;
            candidate.expectedFrequency = expectedFrequency;
            candidate.harmonicNumber = harmonicNumber;

            const Projection headProjection = scanDominantFrequency(samples + headStart,
                                                                    windowSize,
                                                                    result.sampleRate,
                                                                    expectedFrequency,
                                                                    harmonicNumber == 1 ? 0.05f : 0.035f);
            if (headProjection.amplitude <= 1.0e-5f || !std::isfinite(headProjection.amplitude)) {
                continue;
            }

            candidate.measuredFrequency = headProjection.frequency;
            candidate.amplitude = headProjection.amplitude;
            candidate.phase = headProjection.phase;

            if (tailStart > headStart) {
                const Projection tailProjection = measureProjection(samples + tailStart,
                                                                    windowSize,
                                                                    result.sampleRate,
                                                                    candidate.measuredFrequency);
                candidate.decayRate = estimateDecayRateSeconds(candidate.amplitude,
                                                               tailProjection.amplitude,
                                                               static_cast<float>(tailStart - headStart) / result.sampleRate);
            }

            candidates[static_cast<size_t>(candidateCount)] = candidate;
            strongestAmplitude = juce::jmax(strongestAmplitude, candidate.amplitude);
            ++candidateCount;
        }

        if (candidateCount <= 0 || strongestAmplitude <= 0.0f) {
            return fallbackToSpectralPeaks();
        }

        const float minAmplitude = strongestAmplitude * 0.02f;
        float inharmonicityWeighted = 0.0f;
        float inharmonicityWeight = 0.0f;

        for (int i = 0; i < candidateCount; ++i) {
            const auto& candidate = candidates[static_cast<size_t>(i)];
            if (candidate.amplitude < minAmplitude) {
                continue;
            }

            const int outIndex = result.activeCount;
            if (outIndex >= PartialData::kMaxPartials) {
                break;
            }

            result.frequencies[static_cast<size_t>(outIndex)] = candidate.measuredFrequency;
            result.amplitudes[static_cast<size_t>(outIndex)] = candidate.amplitude / strongestAmplitude;
            result.phases[static_cast<size_t>(outIndex)] = candidate.phase;
            result.decayRates[static_cast<size_t>(outIndex)] = candidate.decayRate;
            ++result.activeCount;

            if (candidate.expectedFrequency > 0.0f) {
                const float deviation = std::abs(candidate.measuredFrequency - candidate.expectedFrequency)
                    / candidate.expectedFrequency;
                inharmonicityWeighted += deviation * candidate.amplitude;
                inharmonicityWeight += candidate.amplitude;
            }
        }

        if (inharmonicityWeight > 0.0f) {
            result.inharmonicity = juce::jlimit(0.0f, 1.0f, inharmonicityWeighted / inharmonicityWeight);
        }

        if (result.activeCount <= 0) {
            return fallbackToSpectralPeaks();
        }

        result.isReliable = true;
        return result;
    }

    /// Extract temporal (multi-frame) partial data by sliding a window across the sample.
    /// Uses the global fundamental from the full-sample analysis so we don't re-detect
    /// pitch per frame (faster, avoids jitter).
    /// @param windowSize  FFT/projection window in samples (default 2048)
    /// @param hopSize     hop between frames in samples (default 1024 = 50% overlap)
    /// @param maxFrames   cap on number of frames (default 128)
    static TemporalPartialData extractTemporalFrames(
        const float* samples,
        int numSamples,
        float sampleRate,
        const SampleAnalysis& analysis,
        int numChannels = 1,
        int maxPartials = PartialData::kMaxPartials,
        int windowSize = 2048,
        int hopSize = 1024,
        int maxFrames = 128)
    {
        TemporalPartialData result;
        result.sampleRate = sampleRate > 0.0f ? sampleRate : 44100.0f;
        result.windowSize = windowSize;
        result.hopSize = hopSize;
        result.globalFundamental = analysis.frequency;

        if (!samples || numSamples <= 0 || result.sampleRate <= 0.0f) {
            return result;
        }

        result.sampleLengthSeconds = static_cast<float>(numSamples) / result.sampleRate;

        // Ensure window fits in buffer
        const int effectiveWindow = juce::jlimit(256, juce::jmax(256, numSamples), windowSize);
        const int effectiveHop = juce::jlimit(64, effectiveWindow, hopSize);

        // Calculate number of frames
        int totalFrames = 0;
        for (int offset = 0; offset + effectiveWindow <= numSamples; offset += effectiveHop) {
            ++totalFrames;
        }
        totalFrames = juce::jlimit(1, juce::jmin(maxFrames, TemporalPartialData::kMaxFrames), totalFrames);

        // If we have more potential frames than maxFrames, spread them evenly
        const int availablePositions = juce::jmax(1, (numSamples - effectiveWindow));

        result.frames.reserve(static_cast<size_t>(totalFrames));
        result.frameTimes.reserve(static_cast<size_t>(totalFrames));

        const int partialLimit = juce::jlimit(1, PartialData::kMaxPartials, maxPartials);
        const float nyquist = result.sampleRate * 0.5f;
        const bool useHarmonicTracking = analysis.isReliable && analysis.frequency > 0.0f;
        PartialData globalFallback;
        if (!useHarmonicTracking) {
            globalFallback = buildSpectralPeakPartials(samples,
                                                       numSamples,
                                                       result.sampleRate,
                                                       partialLimit);
            if (globalFallback.activeCount > 0) {
                result.globalFundamental = globalFallback.fundamental;
            }
        }

        for (int frameIdx = 0; frameIdx < totalFrames; ++frameIdx) {
            // Position this frame
            int frameStart;
            if (totalFrames <= 1) {
                frameStart = juce::jmax(0, (numSamples - effectiveWindow) / 2);
            } else {
                frameStart = (availablePositions * frameIdx) / (totalFrames - 1);
                frameStart = juce::jlimit(0, numSamples - effectiveWindow, frameStart);
            }

            const float normalizedTime = (numSamples > effectiveWindow)
                ? static_cast<float>(frameStart) / static_cast<float>(numSamples - effectiveWindow)
                : 0.5f;

            PartialData frame;
            frame.numSamples = effectiveWindow;
            frame.numChannels = juce::jmax(1, numChannels);
            frame.sampleRate = result.sampleRate;

            if (useHarmonicTracking) {
                frame.fundamental = analysis.frequency;
                frame.isReliable = true;
                frame.algorithm = "temporal-harmonic-projection";

                float strongestAmplitude = 0.0f;
                struct FrameCandidate {
                    float frequency = 0.0f;
                    float amplitude = 0.0f;
                    float phase = 0.0f;
                };
                std::array<FrameCandidate, PartialData::kMaxPartials> candidates{};
                int candidateCount = 0;

                for (int i = 0; i < partialLimit; ++i) {
                    const int harmonicNumber = i + 1;
                    const float expectedFreq = analysis.frequency * static_cast<float>(harmonicNumber);
                    if (expectedFreq >= nyquist * 0.95f) break;

                    const Projection proj = scanDominantFrequency(
                        samples + frameStart,
                        effectiveWindow,
                        result.sampleRate,
                        expectedFreq,
                        harmonicNumber == 1 ? 0.03f : 0.025f);

                    if (proj.amplitude <= 1.0e-5f || !std::isfinite(proj.amplitude)) continue;

                    candidates[static_cast<size_t>(candidateCount)] = { proj.frequency, proj.amplitude, proj.phase };
                    strongestAmplitude = juce::jmax(strongestAmplitude, proj.amplitude);
                    ++candidateCount;
                }

                if (candidateCount > 0 && strongestAmplitude > 0.0f) {
                    const float minAmp = strongestAmplitude * 0.02f;
                    for (int i = 0; i < candidateCount; ++i) {
                        if (candidates[static_cast<size_t>(i)].amplitude < minAmp) continue;
                        const int idx = frame.activeCount;
                        if (idx >= PartialData::kMaxPartials) break;

                        frame.frequencies[static_cast<size_t>(idx)] = candidates[static_cast<size_t>(i)].frequency;
                        frame.amplitudes[static_cast<size_t>(idx)] = candidates[static_cast<size_t>(i)].amplitude / strongestAmplitude;
                        frame.phases[static_cast<size_t>(idx)] = candidates[static_cast<size_t>(i)].phase;
                        ++frame.activeCount;
                    }
                }
            } else {
                frame = buildSpectralPeakPartials(samples + frameStart,
                                                 effectiveWindow,
                                                 result.sampleRate,
                                                 partialLimit);
                frame.numSamples = effectiveWindow;
                frame.numChannels = juce::jmax(1, numChannels);
                frame.sampleRate = result.sampleRate;
                if (result.globalFundamental > 0.0f) {
                    frame.fundamental = result.globalFundamental;
                }
                frame.isReliable = frame.activeCount > 0 && frame.fundamental > 0.0f;
                frame.algorithm = (frame.activeCount > 0)
                    ? "temporal-spectral-peaks"
                    : "temporal-spectral-peaks-empty";
            }

            float weightedFreq = 0.0f, totalAmp = 0.0f;
            for (int i = 0; i < frame.activeCount; ++i) {
                const auto si = static_cast<size_t>(i);
                weightedFreq += frame.frequencies[si] * frame.amplitudes[si];
                totalAmp += frame.amplitudes[si];
            }
            frame.brightness = (totalAmp > 0.0f) ? (weightedFreq / totalAmp) / nyquist : 0.0f;

            float rmsSum = 0.0f;
            for (int i = 0; i < effectiveWindow; ++i) {
                const float s = samples[frameStart + i];
                rmsSum += s * s;
            }
            frame.rmsLevel = std::sqrt(rmsSum / static_cast<float>(effectiveWindow));

            result.frames.push_back(std::move(frame));
            result.frameTimes.push_back(normalizedTime);
        }

        result.frameCount = static_cast<int>(result.frames.size());
        result.isReliable = result.frameCount > 0;
        return result;
    }

    /// Convenience: extract temporal frames from a juce::AudioBuffer
    static TemporalPartialData extractTemporalBuffer(
        const juce::AudioBuffer<float>& buffer,
        int numChannels,
        int numSamples,
        float sampleRate,
        int maxPartials = PartialData::kMaxPartials,
        int windowSize = 2048,
        int hopSize = 1024,
        int maxFrames = 128)
    {
        const auto mono = SampleAnalyzer::foldToMono(buffer, numChannels, numSamples);
        const auto analysis = SampleAnalyzer::analyzeMonoBuffer(
            mono.samples.data(), static_cast<int>(mono.samples.size()), sampleRate, mono.numChannels);
        return extractTemporalFrames(
            mono.samples.data(),
            static_cast<int>(mono.samples.size()),
            sampleRate,
            analysis,
            mono.numChannels,
            maxPartials,
            windowSize,
            hopSize,
            maxFrames);
    }

private:
    struct Projection {
        float frequency = 0.0f;
        float amplitude = 0.0f;
        float phase = 0.0f;
    };

    static int chooseWindowSize(int availableSamples) {
        if (availableSamples < 512) {
            return 0;
        }

        int size = 512;
        while (size < 8192 && (size * 2) <= availableSamples) {
            size *= 2;
        }
        return size;
    }

    static int fftOrderForSize(int fftSize) {
        int order = 0;
        int size = 1;
        while (size < fftSize) {
            size <<= 1;
            ++order;
        }
        return order;
    }

    static PartialData buildSpectralPeakPartials(const float* headSamples,
                                                 int headNumSamples,
                                                 float sampleRate,
                                                 int maxPartials,
                                                 const float* tailSamples = nullptr,
                                                 int tailNumSamples = 0,
                                                 float tailDeltaSeconds = 0.0f) {
        PartialData result;
        result.sampleRate = sampleRate > 0.0f ? sampleRate : 44100.0f;
        result.algorithm = "spectral-peaks";

        if (!headSamples || headNumSamples <= 0 || result.sampleRate <= 0.0f) {
            result.algorithm = "spectral-peaks-empty";
            return result;
        }

        const int fftSize = chooseWindowSize(headNumSamples);
        if (fftSize < 512) {
            result.algorithm = "spectral-peaks-window-too-small";
            return result;
        }

        std::vector<float> fftData(static_cast<size_t>(fftSize * 2), 0.0f);
        for (int i = 0; i < fftSize; ++i) {
            const float norm = static_cast<float>(i) / static_cast<float>(juce::jmax(1, fftSize - 1));
            const float window = 0.5f * (1.0f - std::cos(juce::MathConstants<float>::twoPi * norm));
            fftData[static_cast<size_t>(i)] = headSamples[i] * window;
        }

        juce::dsp::FFT fft(fftOrderForSize(fftSize));
        fft.performFrequencyOnlyForwardTransform(fftData.data());

        struct BinPeak {
            int bin = 0;
            float magnitude = 0.0f;
        };

        const int requestedPeaks = juce::jlimit(1, PartialData::kMaxPartials, maxPartials);
        const int bins = fftSize / 2;
        const float nyquist = result.sampleRate * 0.5f;
        const float maxFreq = nyquist * 0.95f;

        auto binToFrequency = [&](float bin) -> float {
            return (bin * result.sampleRate) / static_cast<float>(fftSize);
        };
        auto isUsableBin = [&](int bin) -> bool {
            if (bin < 2 || bin >= bins - 1) {
                return false;
            }
            const float freq = binToFrequency(static_cast<float>(bin));
            return freq >= 20.0f && freq < maxFreq;
        };
        auto addOrUpdateCandidate = [&](std::vector<BinPeak>& list, int bin, float magnitude) {
            if (!isUsableBin(bin) || magnitude <= 0.0f || !std::isfinite(magnitude)) {
                return;
            }
            for (auto& existing : list) {
                if (existing.bin == bin) {
                    existing.magnitude = juce::jmax(existing.magnitude, magnitude);
                    return;
                }
            }
            list.push_back({ bin, magnitude });
        };

        float strongestMagnitude = 0.0f;
        for (int bin = 2; bin < bins - 1; ++bin) {
            strongestMagnitude = juce::jmax(strongestMagnitude, fftData[static_cast<size_t>(bin)]);
        }
        if (strongestMagnitude <= 1.0e-8f || !std::isfinite(strongestMagnitude)) {
            result.algorithm = "spectral-peaks-silent";
            return result;
        }

        const float localPeakFloor = strongestMagnitude * 0.004f;
        const float bandPeakFloor = strongestMagnitude * 0.0015f;
        const float rawFillFloor = strongestMagnitude * 0.0008f;
        const int minBinSpacing = juce::jmax(1, static_cast<int>(std::round((12.0f * fftSize) / result.sampleRate)));

        std::vector<BinPeak> localPeaks;
        localPeaks.reserve(static_cast<size_t>(juce::jmax(16, requestedPeaks * 8)));
        for (int bin = 2; bin < bins - 1; ++bin) {
            if (!isUsableBin(bin)) {
                continue;
            }
            const float mag = fftData[static_cast<size_t>(bin)];
            if (mag < localPeakFloor) {
                continue;
            }
            if (mag < fftData[static_cast<size_t>(bin - 1)] || mag < fftData[static_cast<size_t>(bin + 1)]) {
                continue;
            }
            addOrUpdateCandidate(localPeaks, bin, mag);
        }

        auto isTooCloseToSelected = [&](const std::vector<BinPeak>& selectedBins, int bin) {
            for (const auto& existing : selectedBins) {
                if (std::abs(existing.bin - bin) < minBinSpacing) {
                    return true;
                }
            }
            return false;
        };

        std::vector<BinPeak> selectedBins;
        selectedBins.reserve(static_cast<size_t>(requestedPeaks));

        if (maxFreq > 20.0f) {
            const int bandCount = requestedPeaks;
            const double logMin = std::log(20.0);
            const double logMax = std::log(static_cast<double>(maxFreq));
            for (int band = 0; band < bandCount && static_cast<int>(selectedBins.size()) < requestedPeaks; ++band) {
                const double t0 = static_cast<double>(band) / static_cast<double>(bandCount);
                const double t1 = static_cast<double>(band + 1) / static_cast<double>(bandCount);
                int startBin = static_cast<int>(std::floor(std::exp(logMin + (logMax - logMin) * t0)
                                                           * static_cast<double>(fftSize) / result.sampleRate));
                int endBin = static_cast<int>(std::ceil(std::exp(logMin + (logMax - logMin) * t1)
                                                        * static_cast<double>(fftSize) / result.sampleRate));
                startBin = juce::jlimit(2, bins - 2, startBin);
                endBin = juce::jlimit(startBin, bins - 2, endBin);

                int bestLocalBin = -1;
                float bestLocalMag = 0.0f;
                int bestAnyBin = -1;
                float bestAnyMag = 0.0f;
                for (int bin = startBin; bin <= endBin; ++bin) {
                    if (!isUsableBin(bin)) {
                        continue;
                    }
                    const float mag = fftData[static_cast<size_t>(bin)];
                    if (!std::isfinite(mag)) {
                        continue;
                    }
                    if (mag > bestAnyMag) {
                        bestAnyMag = mag;
                        bestAnyBin = bin;
                    }
                    if (mag >= fftData[static_cast<size_t>(bin - 1)]
                        && mag >= fftData[static_cast<size_t>(bin + 1)]
                        && mag > bestLocalMag) {
                        bestLocalMag = mag;
                        bestLocalBin = bin;
                    }
                }

                const int chosenBin = (bestLocalBin >= 0) ? bestLocalBin : bestAnyBin;
                const float chosenMag = (bestLocalBin >= 0) ? bestLocalMag : bestAnyMag;
                if (chosenBin >= 0
                    && chosenMag >= bandPeakFloor
                    && !isTooCloseToSelected(selectedBins, chosenBin)) {
                    selectedBins.push_back({ chosenBin, chosenMag });
                }
            }
        }

        std::sort(localPeaks.begin(), localPeaks.end(), [](const BinPeak& a, const BinPeak& b) {
            return a.magnitude > b.magnitude;
        });
        for (const auto& candidate : localPeaks) {
            if (static_cast<int>(selectedBins.size()) >= requestedPeaks) {
                break;
            }
            if (!isTooCloseToSelected(selectedBins, candidate.bin)) {
                selectedBins.push_back(candidate);
            }
        }

        if (static_cast<int>(selectedBins.size()) < requestedPeaks) {
            std::vector<BinPeak> rawBins;
            rawBins.reserve(static_cast<size_t>(juce::jmax(16, requestedPeaks * 6)));
            for (int bin = 2; bin < bins - 1; ++bin) {
                if (!isUsableBin(bin)) {
                    continue;
                }
                const float mag = fftData[static_cast<size_t>(bin)];
                if (mag < rawFillFloor) {
                    continue;
                }
                addOrUpdateCandidate(rawBins, bin, mag);
            }
            std::sort(rawBins.begin(), rawBins.end(), [](const BinPeak& a, const BinPeak& b) {
                return a.magnitude > b.magnitude;
            });
            for (const auto& candidate : rawBins) {
                if (static_cast<int>(selectedBins.size()) >= requestedPeaks) {
                    break;
                }
                if (!isTooCloseToSelected(selectedBins, candidate.bin)) {
                    selectedBins.push_back(candidate);
                }
            }
        }

        if (selectedBins.empty()) {
            result.algorithm = "spectral-peaks-no-candidates";
            return result;
        }

        struct SelectedPeak {
            float frequency = 0.0f;
            float amplitude = 0.0f;
            float phase = 0.0f;
            float decayRate = 0.0f;
        };
        std::vector<SelectedPeak> selected;
        selected.reserve(static_cast<size_t>(requestedPeaks));

        for (const auto& candidate : selectedBins) {
            const float left = fftData[static_cast<size_t>(candidate.bin - 1)];
            const float center = fftData[static_cast<size_t>(candidate.bin)];
            const float right = fftData[static_cast<size_t>(candidate.bin + 1)];
            const float denom = left - (2.0f * center) + right;
            float delta = 0.0f;
            if (std::abs(denom) > 1.0e-8f) {
                delta = juce::jlimit(-1.0f, 1.0f, 0.5f * (left - right) / denom);
            }

            const float refinedFreq = ((static_cast<float>(candidate.bin) + delta) * result.sampleRate)
                / static_cast<float>(fftSize);
            if (refinedFreq < 20.0f || refinedFreq >= maxFreq) {
                continue;
            }

            const Projection headProjection = measureProjection(headSamples, headNumSamples, result.sampleRate, refinedFreq);
            if (headProjection.amplitude <= 1.0e-5f || !std::isfinite(headProjection.amplitude)) {
                continue;
            }

            SelectedPeak peak;
            peak.frequency = headProjection.frequency;
            peak.amplitude = headProjection.amplitude;
            peak.phase = headProjection.phase;
            if (tailSamples && tailNumSamples > 0 && tailDeltaSeconds > 0.0f) {
                const Projection tailProjection = measureProjection(tailSamples, tailNumSamples, result.sampleRate, peak.frequency);
                peak.decayRate = estimateDecayRateSeconds(peak.amplitude, tailProjection.amplitude, tailDeltaSeconds);
            }
            selected.push_back(peak);
            if (static_cast<int>(selected.size()) >= requestedPeaks) {
                break;
            }
        }

        if (selected.empty()) {
            result.algorithm = "spectral-peaks-empty";
            return result;
        }

        float strongestAmplitude = 0.0f;
        float strongestFrequency = 0.0f;
        for (const auto& peak : selected) {
            if (peak.amplitude > strongestAmplitude) {
                strongestAmplitude = peak.amplitude;
                strongestFrequency = peak.frequency;
            }
        }
        if (strongestAmplitude <= 1.0e-8f || strongestFrequency <= 0.0f) {
            result.algorithm = "spectral-peaks-empty";
            return result;
        }

        std::sort(selected.begin(), selected.end(), [](const SelectedPeak& a, const SelectedPeak& b) {
            return a.frequency < b.frequency;
        });

        result.fundamental = strongestFrequency;
        result.activeCount = juce::jlimit(0, PartialData::kMaxPartials, static_cast<int>(selected.size()));
        float weightedFrequency = 0.0f;
        float amplitudeWeight = 0.0f;
        for (int i = 0; i < result.activeCount; ++i) {
            const auto& peak = selected[static_cast<size_t>(i)];
            const auto idx = static_cast<size_t>(i);
            result.frequencies[idx] = peak.frequency;
            result.amplitudes[idx] = peak.amplitude / strongestAmplitude;
            result.phases[idx] = peak.phase;
            result.decayRates[idx] = peak.decayRate;
            weightedFrequency += peak.frequency * result.amplitudes[idx];
            amplitudeWeight += result.amplitudes[idx];
        }
        if (amplitudeWeight > 0.0f && nyquist > 0.0f) {
            result.brightness = juce::jlimit(0.0f, 1.0f, (weightedFrequency / amplitudeWeight) / nyquist);
        }
        result.isReliable = result.activeCount > 0 && result.fundamental > 0.0f;
        return result;
    }

    static Projection scanDominantFrequency(const float* samples,
                                            int numSamples,
                                            float sampleRate,
                                            float expectedFrequency,
                                            float relativeSearchWidth) {
        Projection best;
        if (!samples || numSamples <= 0 || sampleRate <= 0.0f || expectedFrequency <= 0.0f) {
            return best;
        }

        const float nyquist = sampleRate * 0.5f;
        const float searchWidth = juce::jmax(6.0f, expectedFrequency * relativeSearchWidth);
        constexpr int kSteps = 11;

        for (int step = 0; step < kSteps; ++step) {
            const float t = static_cast<float>(step) / static_cast<float>(kSteps - 1);
            const float offset = (t * 2.0f) - 1.0f;
            const float freq = juce::jlimit(20.0f, nyquist * 0.95f, expectedFrequency + searchWidth * offset);
            const Projection projection = measureProjection(samples, numSamples, sampleRate, freq);
            if (projection.amplitude > best.amplitude) {
                best = projection;
            }
        }

        return best;
    }

    static Projection measureProjection(const float* samples,
                                        int numSamples,
                                        float sampleRate,
                                        float frequency) {
        Projection result;
        result.frequency = frequency;

        if (!samples || numSamples <= 0 || sampleRate <= 0.0f || frequency <= 0.0f) {
            return result;
        }

        const double phaseInc = (juce::MathConstants<double>::twoPi * static_cast<double>(frequency))
            / static_cast<double>(sampleRate);
        double re = 0.0;
        double im = 0.0;
        double windowSum = 0.0;

        for (int i = 0; i < numSamples; ++i) {
            const double norm = static_cast<double>(i) / static_cast<double>(juce::jmax(1, numSamples - 1));
            const double window = 0.5 * (1.0 - std::cos(juce::MathConstants<double>::twoPi * norm));
            const double sample = static_cast<double>(samples[i]) * window;
            const double phase = phaseInc * static_cast<double>(i);
            re += sample * std::cos(phase);
            im -= sample * std::sin(phase);
            windowSum += window;
        }

        if (windowSum <= std::numeric_limits<double>::epsilon()) {
            return result;
        }

        const double magnitude = std::sqrt(re * re + im * im);
        result.amplitude = static_cast<float>((2.0 * magnitude) / windowSum);
        result.phase = static_cast<float>(std::atan2(im, re));
        return result;
    }

    static float estimateDecayRateSeconds(float startAmplitude,
                                          float endAmplitude,
                                          float deltaSeconds) {
        if (startAmplitude <= 1.0e-6f || endAmplitude <= 1.0e-6f || deltaSeconds <= 0.0f) {
            return 0.0f;
        }
        if (endAmplitude >= startAmplitude) {
            return 0.0f;
        }

        const float ratio = juce::jlimit(1.0e-6f, 0.999999f, endAmplitude / startAmplitude);
        const float dbDrop = -20.0f * std::log10(ratio);
        if (dbDrop <= 1.0e-3f || !std::isfinite(dbDrop)) {
            return 0.0f;
        }

        return juce::jlimit(0.0f, 60.0f, deltaSeconds * (60.0f / dbDrop));
    }
};

} // namespace dsp_primitives
