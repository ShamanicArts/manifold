// DspNodeContractHarness — parameterized contract test for DSP node types
//
// Audited 2026-05-03:
// - project has 56 node .cpp files under dsp/core/nodes/
// - this harness captures direct per-node contracts where isolated execution is meaningful
// - remaining gaps must be explicitly reported, not silently ignored
//
// Iterates node types, exercises prepare/process, and captures deterministic
// output metrics + parameter/state into a golden JSON contract.
//
// Usage:
//   --print-contract                    Print contract JSON to stdout
//   --write-contract PATH               Write golden file
//   --verify-contract PATH              Compare against golden file
//   --help                              This message
//
// The contract captures per node:
//   • Node metadata (type, I/O counts, hasSIMD)
//   • Parameter getter state after prepare()
//   • Output metrics (peak, RMS, DC offset per channel) for standard test tone
//   • NaN/inf detection
//   • Scalar vs SIMD dual-path comparison (max absolute difference)
//   • Silence-input test (verifies zero output for unconnected-input nodes)
//   • Post-configure parameter state + output after parameter change

#include "dsp/core/graph/PrimitiveNode.h"
#include "dsp/core/nodes/PrimitiveNodes.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <memory>
#include <map>
#include <string>
#include <vector>

#include <juce_core/juce_core.h>

// ============================================================================
// Contract harness infrastructure (reuses pattern from
// BehaviorCoreMidiContractHarness)
// ============================================================================

namespace {

struct HarnessOptions {
    enum Mode { Print, Write, Verify } mode = Print;
    std::string contractPath;
};

void printUsage(const char* name) {
    std::fprintf(stderr,
        "Usage: %s [--print-contract | --write-contract PATH | "
        "--verify-contract PATH]\n",
        name);
}

bool parseOptions(int argc, char* argv[], HarnessOptions& out) {
    for (int i = 1; i < argc; ++i) {
        const std::string arg = argv[i];
        if (arg == "--print-contract") {
            out.mode = HarnessOptions::Print;
        } else if (arg == "--write-contract" && i + 1 < argc) {
            out.mode = HarnessOptions::Write;
            out.contractPath = argv[++i];
        } else if (arg == "--verify-contract" && i + 1 < argc) {
            out.mode = HarnessOptions::Verify;
            out.contractPath = argv[++i];
        } else if (arg == "--help" || arg == "-h") {
            printUsage(argv[0]);
            return false;
        } else {
            std::fprintf(stderr, "Unknown argument: %s\n", argv[i]);
            printUsage(argv[0]);
            return false;
        }
    }
    return true;
}

std::string readFile(const std::string& path) {
    std::ifstream file(path);
    if (!file.is_open()) {
        std::fprintf(stderr, "ERROR: cannot read file: %s\n", path.c_str());
        std::exit(2);
    }
    return std::string((std::istreambuf_iterator<char>(file)),
                       std::istreambuf_iterator<char>());
}

bool verifyContract(const std::string& rawCurrent, const std::string& goldenPath) {
    const auto rawGolden = readFile(goldenPath);
    const auto goldenVar = juce::JSON::parse(rawGolden);
    const auto currentVar = juce::JSON::parse(rawCurrent);

    if (goldenVar.isVoid() || currentVar.isVoid()) {
        std::fprintf(stderr, "FAIL: could not parse contract JSON\n");
        return false;
    }

    const auto goldenStr = juce::JSON::toString(goldenVar).toStdString();
    const auto currentStr = juce::JSON::toString(currentVar).toStdString();
    if (goldenStr == currentStr) {
        std::fprintf(stdout, "OK: DSP node contract matches golden file\n");
        return true;
    }

    const size_t minLen = std::min(goldenStr.size(), currentStr.size());
    size_t diffPos = 0;
    while (diffPos < minLen && goldenStr[diffPos] == currentStr[diffPos])
        ++diffPos;

    std::fprintf(stderr, "FAIL: DSP node contract mismatch\n");
    std::fprintf(stderr, "  golden: %zu bytes, current: %zu bytes\n",
                 goldenStr.size(), currentStr.size());
    std::fprintf(stderr, "  first diff at byte %zu\n", diffPos);

    // Show context around the diff
    const auto& g = goldenStr;
    const auto& c = currentStr;
    auto printAround = [](const std::string& s, size_t pos, const char* label) {
        size_t start = (pos > 60) ? pos - 60 : 0;
        size_t end = std::min(pos + 60, s.size());
        std::fprintf(stderr, "  %s context [%zu..%zu]:\n", label, start, end);
        std::fprintf(stderr, "    %s\n", s.substr(start, end - start).c_str());
    };
    printAround(g, diffPos, "golden");
    printAround(c, diffPos, "current");

    return false;
}

// ============================================================================
// Test signal generation & analysis utilities
// ============================================================================

constexpr double kTestSampleRate = 44100.0;
constexpr int    kTestBlockSize  = 512;
constexpr int    kTestChannels   = 2;
constexpr float  kTestFreq       = 440.0f;
constexpr float  kTestAmplitude  = 0.5f; // -6 dBFS
constexpr int    kWarmupBlocks   = 4;    // for stateful nodes (filters, delays)
constexpr int    kTestBlocks     = 2;    // measurement blocks after warmup

struct OutputMetrics {
    float peakL = 0.0f;
    float peakR = 0.0f;
    float rmsL = 0.0f;
    float rmsR = 0.0f;
    float dcL = 0.0f;
    float dcR = 0.0f;
    bool hasNaN = false;
    bool hasInf = false;
};

OutputMetrics computeMetrics(const juce::AudioBuffer<float>& buffer) {
    OutputMetrics m;
    int ch = juce::jmin(2, buffer.getNumChannels());
    for (int c = 0; c < ch; ++c) {
        const float* data = buffer.getReadPointer(c);
        int n = buffer.getNumSamples();
        float peak = 0.0f;
        double sum = 0.0;
        double sumSq = 0.0;
        for (int i = 0; i < n; ++i) {
            float s = data[i];
            if (std::isnan(s)) m.hasNaN = true;
            if (std::isinf(s)) m.hasInf = true;
            peak = std::max(peak, std::abs(s));
            sum += s;
            sumSq += (double)s * (double)s;
        }
        float rms = (n > 0) ? std::sqrt((float)(sumSq / n)) : 0.0f;
        float dc = (n > 0) ? (float)(sum / n) : 0.0f;
        if (c == 0) {
            m.peakL = peak; m.rmsL = rms; m.dcL = dc;
        } else {
            m.peakR = peak; m.rmsR = rms; m.dcR = dc;
        }
    }
    return m;
}

juce::var metricsToVar(const OutputMetrics& m) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("peakL", (double)m.peakL);
    obj->setProperty("peakR", (double)m.peakR);
    obj->setProperty("rmsL", (double)m.rmsL);
    obj->setProperty("rmsR", (double)m.rmsR);
    obj->setProperty("dcL", (double)m.dcL);
    obj->setProperty("dcR", (double)m.dcR);
    obj->setProperty("hasNaN", m.hasNaN);
    obj->setProperty("hasInf", m.hasInf);
    return juce::var(obj);
}

juce::AudioBuffer<float> generateSine(float freqHz, float amplitude, int numSamples, float phaseOffset = 0.0f) {
    juce::AudioBuffer<float> tone(kTestChannels, numSamples);
    tone.clear();
    for (int ch = 0; ch < kTestChannels; ++ch) {
        auto* data = tone.getWritePointer(ch);
        for (int i = 0; i < numSamples; ++i) {
            const float phase = phaseOffset + 2.0f * juce::MathConstants<float>::pi
                * freqHz * (float)i / (float)kTestSampleRate;
            data[i] = amplitude * std::sin(phase);
        }
    }
    return tone;
}

juce::AudioBuffer<float> generatePulseTrain(int numSamples, int periodSamples, int pulseWidthSamples = 1, float amplitude = 1.0f) {
    juce::AudioBuffer<float> pulse(kTestChannels, numSamples);
    pulse.clear();
    const int period = juce::jmax(2, periodSamples);
    const int width = juce::jlimit(1, period - 1, pulseWidthSamples);
    for (int ch = 0; ch < kTestChannels; ++ch) {
        auto* data = pulse.getWritePointer(ch);
        for (int i = 0; i < numSamples; ++i) {
            data[i] = ((i % period) < width) ? amplitude : -amplitude;
        }
    }
    return pulse;
}

// Generate silent buffer
juce::AudioBuffer<float> generateSilence(int numSamples) {
    juce::AudioBuffer<float> silence(kTestChannels, numSamples);
    silence.clear();
    return silence;
}

using InputBufferSet = std::vector<juce::AudioBuffer<float>>;

InputBufferSet buildGenericInputBuses(int busCount, int numSamples, bool silence) {
    InputBufferSet buffers;
    if (busCount <= 0) {
        return buffers;
    }

    static const float freqs[] = { 440.0f, 220.0f, 660.0f, 330.0f, 880.0f, 110.0f };
    const float amplitude = (busCount > 1) ? 0.25f : kTestAmplitude;
    buffers.reserve(static_cast<size_t>(busCount));
    for (int bus = 0; bus < busCount; ++bus) {
        if (silence) {
            buffers.push_back(generateSilence(numSamples));
            continue;
        }
        const float freq = freqs[static_cast<size_t>(bus) % (sizeof(freqs) / sizeof(freqs[0]))];
        buffers.push_back(generateSine(freq, amplitude, numSamples,
            0.25f * static_cast<float>(bus) * juce::MathConstants<float>::pi));
    }
    return buffers;
}

juce::AudioBuffer<float> generateSeedCaptureBuffer(int numSamples) {
    return generateSine(440.0f, 0.5f, numSamples);
}

// ============================================================================
// AudioBufferView adapters from raw buffers
// ============================================================================

std::vector<dsp_primitives::AudioBufferView>
makeInputViews(const std::vector<juce::AudioBuffer<float>>& bufs) {
    std::vector<dsp_primitives::AudioBufferView> views;
    views.reserve(bufs.size());
    for (const auto& b : bufs)
        views.emplace_back(dsp_primitives::AudioBufferView(b));
    return views;
}

std::vector<dsp_primitives::WritableAudioBufferView>
makeOutputViews(std::vector<juce::AudioBuffer<float>>& bufs) {
    std::vector<dsp_primitives::WritableAudioBufferView> views;
    views.reserve(bufs.size());
    for (auto& b : bufs)
        views.emplace_back(dsp_primitives::WritableAudioBufferView(b));
    return views;
}

// ============================================================================
// Node factory + test specification
// ============================================================================

using InputBuilder = std::function<InputBufferSet(int numSamples, bool silence)>;

struct NodeTestSpec {
    std::string typeName;
    std::function<std::shared_ptr<dsp_primitives::IPrimitiveNode>()> factory;
    // Optional: configure node with known parameters before processing
    std::function<void(dsp_primitives::IPrimitiveNode&)> configure;
    // Snapshot getter state as JSON (used before and after processing)
    std::function<juce::var(dsp_primitives::IPrimitiveNode&)> snapshotGetters;
    bool hasSIMD = false;
    InputBuilder buildInputs;
};

// ============================================================================
// Per-node getter snapshot functions
// ============================================================================

juce::var snapshotNoGetters(dsp_primitives::IPrimitiveNode&) {
    return juce::var(new juce::DynamicObject());
}

juce::var snapshotGainNode(dsp_primitives::IPrimitiveNode& node) {
    auto& g = dynamic_cast<dsp_primitives::GainNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("gain", (double)g.getGain());
    obj->setProperty("muted", g.isMuted());
    return juce::var(obj);
}

juce::var snapshotFilterNode(dsp_primitives::IPrimitiveNode& node) {
    auto& f = dynamic_cast<dsp_primitives::FilterNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("cutoff", (double)f.getCutoff());
    obj->setProperty("resonance", (double)f.getResonance());
    obj->setProperty("mix", (double)f.getMix());
    return juce::var(obj);
}

juce::var snapshotOscillatorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& o = dynamic_cast<dsp_primitives::OscillatorNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("frequency", (double)o.getFrequency());
    obj->setProperty("amplitude", (double)o.getAmplitude());
    obj->setProperty("enabled", o.isEnabled());
    obj->setProperty("waveform", o.getWaveform());
    obj->setProperty("drive", (double)o.getDrive());
    obj->setProperty("driveShape", o.getDriveShape());
    obj->setProperty("driveBias", (double)o.getDriveBias());
    obj->setProperty("driveMix", (double)o.getDriveMix());
    obj->setProperty("pulseWidth", (double)o.getPulseWidth());
    obj->setProperty("unison", o.getUnison());
    obj->setProperty("detune", (double)o.getDetune());
    obj->setProperty("spread", (double)o.getSpread());
    obj->setProperty("renderMode", o.getRenderMode());
    obj->setProperty("additivePartials", o.getAdditivePartials());
    obj->setProperty("additiveTilt", (double)o.getAdditiveTilt());
    obj->setProperty("additiveDrift", (double)o.getAdditiveDrift());
    return juce::var(obj);
}

juce::var snapshotReverbNode(dsp_primitives::IPrimitiveNode& node) {
    auto& r = dynamic_cast<dsp_primitives::ReverbNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("roomSize", (double)r.getRoomSize());
    obj->setProperty("damping", (double)r.getDamping());
    obj->setProperty("wetLevel", (double)r.getWetLevel());
    obj->setProperty("dryLevel", (double)r.getDryLevel());
    obj->setProperty("width", (double)r.getWidth());
    return juce::var(obj);
}

juce::var snapshotStereoDelayNode(dsp_primitives::IPrimitiveNode& node) {
    auto& d = dynamic_cast<dsp_primitives::StereoDelayNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("timeMode", static_cast<int>(d.getTimeMode()));
    obj->setProperty("timeL", (double)d.getTimeL());
    obj->setProperty("timeR", (double)d.getTimeR());
    obj->setProperty("feedback", (double)d.getFeedback());
    obj->setProperty("feedbackCrossfeed", (double)d.getFeedbackCrossfeed());
    obj->setProperty("filterEnabled", d.getFilterEnabled());
    obj->setProperty("filterCutoff", (double)d.getFilterCutoff());
    obj->setProperty("filterResonance", (double)d.getFilterResonance());
    obj->setProperty("mix", (double)d.getMix());
    obj->setProperty("pingPong", d.getPingPong());
    obj->setProperty("width", (double)d.getWidth());
    obj->setProperty("freeze", d.getFreeze());
    obj->setProperty("ducking", (double)d.getDucking());
    return juce::var(obj);
}

juce::var snapshotDistortionNode(dsp_primitives::IPrimitiveNode& node) {
    auto& d = dynamic_cast<dsp_primitives::DistortionNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("drive", (double)d.getDrive());
    obj->setProperty("mix", (double)d.getMix());
    obj->setProperty("output", (double)d.getOutput());
    return juce::var(obj);
}

juce::var snapshotSVFNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::SVFNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("cutoff", (double)s.getCutoff());
    obj->setProperty("resonance", (double)s.getResonance());
    obj->setProperty("drive", (double)s.getDrive());
    obj->setProperty("mix", (double)s.getMix());
    return juce::var(obj);
}

juce::var snapshotCompressorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& c = dynamic_cast<dsp_primitives::CompressorNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("threshold", (double)c.getThreshold());
    obj->setProperty("ratio", (double)c.getRatio());
    obj->setProperty("attack", (double)c.getAttack());
    obj->setProperty("release", (double)c.getRelease());
    obj->setProperty("makeup", (double)c.getMakeup());
    obj->setProperty("mix", (double)c.getMix());
    obj->setProperty("gainReduction", (double)c.getGainReduction());
    return juce::var(obj);
}

juce::var snapshotLimiterNode(dsp_primitives::IPrimitiveNode& node) {
    auto& l = dynamic_cast<dsp_primitives::LimiterNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("threshold", (double)l.getThreshold());
    obj->setProperty("release", (double)l.getRelease());
    obj->setProperty("makeup", (double)l.getMakeup());
    obj->setProperty("softClip", (double)l.getSoftClip());
    obj->setProperty("mix", (double)l.getMix());
    obj->setProperty("gainReduction", (double)l.getGainReduction());
    return juce::var(obj);
}

juce::var snapshotWaveShaperNode(dsp_primitives::IPrimitiveNode& node) {
    auto& w = dynamic_cast<dsp_primitives::WaveShaperNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("curve", w.getCurve());
    obj->setProperty("drive", (double)w.getDrive());
    obj->setProperty("output", (double)w.getOutput());
    obj->setProperty("preFilter", (double)w.getPreFilter());
    obj->setProperty("postFilter", (double)w.getPostFilter());
    obj->setProperty("bias", (double)w.getBias());
    obj->setProperty("mix", (double)w.getMix());
    obj->setProperty("oversample", w.getOversample());
    return juce::var(obj);
}

juce::var snapshotChorusNode(dsp_primitives::IPrimitiveNode& node) {
    auto& c = dynamic_cast<dsp_primitives::ChorusNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("rate", (double)c.getRate());
    obj->setProperty("depth", (double)c.getDepth());
    obj->setProperty("voices", c.getVoices());
    obj->setProperty("feedback", (double)c.getFeedback());
    obj->setProperty("mix", (double)c.getMix());
    obj->setProperty("spread", (double)c.getSpread());
    obj->setProperty("waveform", c.getWaveform());
    return juce::var(obj);
}

juce::var snapshotPhaserNode(dsp_primitives::IPrimitiveNode& node) {
    auto& p = dynamic_cast<dsp_primitives::PhaserNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("rate", (double)p.getRate());
    obj->setProperty("depth", (double)p.getDepth());
    obj->setProperty("stages", p.getStages());
    obj->setProperty("feedback", (double)p.getFeedback());
    obj->setProperty("spread", (double)p.getSpread());
    return juce::var(obj);
}

juce::var snapshotEQNode(dsp_primitives::IPrimitiveNode& node) {
    auto& e = dynamic_cast<dsp_primitives::EQNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("lowGain", (double)e.getLowGain());
    obj->setProperty("lowFreq", (double)e.getLowFreq());
    obj->setProperty("midGain", (double)e.getMidGain());
    obj->setProperty("midFreq", (double)e.getMidFreq());
    obj->setProperty("midQ", (double)e.getMidQ());
    obj->setProperty("highGain", (double)e.getHighGain());
    obj->setProperty("highFreq", (double)e.getHighFreq());
    obj->setProperty("output", (double)e.getOutput());
    obj->setProperty("mix", (double)e.getMix());
    return juce::var(obj);
}

juce::var snapshotEQ8Node(dsp_primitives::IPrimitiveNode& node) {
    auto& e = dynamic_cast<dsp_primitives::EQ8Node&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("output", (double)e.getOutput());
    obj->setProperty("mix", (double)e.getMix());
    juce::Array<juce::var> bands;
    for (int i = 0; i < 8; ++i) {
        auto* band = new juce::DynamicObject();
        band->setProperty("enabled", e.getBandEnabled(i));
        band->setProperty("type", e.getBandType(i));
        band->setProperty("frequency", (double)e.getBandFreq(i));
        band->setProperty("gain", (double)e.getBandGain(i));
        band->setProperty("Q", (double)e.getBandQ(i));
        bands.add(juce::var(band));
    }
    obj->setProperty("bands", juce::var(bands));
    return juce::var(obj);
}

juce::var snapshotStereoWidenerNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::StereoWidenerNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("width", (double)s.getWidth());
    obj->setProperty("monoLowFreq", (double)s.getMonoLowFreq());
    obj->setProperty("monoLowEnable", s.getMonoLowEnable());
    obj->setProperty("correlation", (double)s.getCorrelation());
    return juce::var(obj);
}

juce::var snapshotGranulatorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& g = dynamic_cast<dsp_primitives::GranulatorNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("grainSize", (double)g.getGrainSize());
    obj->setProperty("density", (double)g.getDensity());
    obj->setProperty("position", (double)g.getPosition());
    obj->setProperty("pitch", (double)g.getPitch());
    obj->setProperty("spray", (double)g.getSpray());
    obj->setProperty("freeze", g.getFreeze());
    obj->setProperty("enabled", g.getEnabled());
    obj->setProperty("envelope", g.getEnvelope());
    obj->setProperty("mix", (double)g.getMix());
    obj->setProperty("bufferSeconds", (double)g.getBufferSeconds());
    return juce::var(obj);
}

juce::var snapshotMultitapDelayNode(dsp_primitives::IPrimitiveNode& node) {
    auto& m = dynamic_cast<dsp_primitives::MultitapDelayNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("tapCount", m.getTapCount());
    obj->setProperty("feedback", (double)m.getFeedback());
    obj->setProperty("mix", (double)m.getMix());
    return juce::var(obj);
}

juce::var snapshotPitchShifterNode(dsp_primitives::IPrimitiveNode& node) {
    auto& p = dynamic_cast<dsp_primitives::PitchShifterNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("pitch", (double)p.getPitch());
    obj->setProperty("window", (double)p.getWindow());
    obj->setProperty("feedback", (double)p.getFeedback());
    obj->setProperty("mix", (double)p.getMix());
    return juce::var(obj);
}

juce::var snapshotRingModulatorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& r = dynamic_cast<dsp_primitives::RingModulatorNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("frequency", (double)r.getFrequency());
    obj->setProperty("depth", (double)r.getDepth());
    obj->setProperty("mix", (double)r.getMix());
    obj->setProperty("spread", (double)r.getSpread());
    return juce::var(obj);
}

juce::var snapshotShimmerNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::ShimmerNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("size", (double)s.getSize());
    obj->setProperty("pitch", (double)s.getPitch());
    obj->setProperty("feedback", (double)s.getFeedback());
    obj->setProperty("mix", (double)s.getMix());
    obj->setProperty("modulation", (double)s.getModulation());
    obj->setProperty("filter", (double)s.getFilter());
    return juce::var(obj);
}

juce::var snapshotFormantFilterNode(dsp_primitives::IPrimitiveNode& node) {
    auto& f = dynamic_cast<dsp_primitives::FormantFilterNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("vowel", (double)f.getVowel());
    obj->setProperty("shift", (double)f.getShift());
    obj->setProperty("resonance", (double)f.getResonance());
    obj->setProperty("drive", (double)f.getDrive());
    obj->setProperty("mix", (double)f.getMix());
    return juce::var(obj);
}

juce::var snapshotReverseDelayNode(dsp_primitives::IPrimitiveNode& node) {
    auto& r = dynamic_cast<dsp_primitives::ReverseDelayNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("time", (double)r.getTime());
    obj->setProperty("window", (double)r.getWindow());
    obj->setProperty("feedback", (double)r.getFeedback());
    obj->setProperty("mix", (double)r.getMix());
    return juce::var(obj);
}

juce::var snapshotEnvelopeFollowerNode(dsp_primitives::IPrimitiveNode& node) {
    auto& e = dynamic_cast<dsp_primitives::EnvelopeFollowerNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("attack", (double)e.getAttack());
    obj->setProperty("release", (double)e.getRelease());
    obj->setProperty("envelope", (double)e.getEnvelope());
    return juce::var(obj);
}

juce::var snapshotNoiseGeneratorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& n = dynamic_cast<dsp_primitives::NoiseGeneratorNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("level", (double)n.getLevel());
    obj->setProperty("color", (double)n.getColor());
    return juce::var(obj);
}

juce::var snapshotResonatorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& r = dynamic_cast<dsp_primitives::ResonatorNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("gain", (double)r.getGain());
    obj->setProperty("frequency", (double)r.getFrequency());
    obj->setProperty("Q", (double)r.getQ());
    return juce::var(obj);
}

juce::var snapshotMixerNode(dsp_primitives::IPrimitiveNode& node) {
    auto& m = dynamic_cast<dsp_primitives::MixerNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("inputCount", m.getInputCount());
    obj->setProperty("gain1", (double)m.getGain1());
    obj->setProperty("gain2", (double)m.getGain2());
    obj->setProperty("gain3", (double)m.getGain3());
    obj->setProperty("gain4", (double)m.getGain4());
    obj->setProperty("pan1", (double)m.getPan1());
    obj->setProperty("pan2", (double)m.getPan2());
    obj->setProperty("pan3", (double)m.getPan3());
    obj->setProperty("pan4", (double)m.getPan4());
    obj->setProperty("master", (double)m.getMaster());
    return juce::var(obj);
}

juce::var snapshotSineBankNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::SineBankNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("frequency", (double)s.getFrequency());
    obj->setProperty("amplitude", (double)s.getAmplitude());
    obj->setProperty("enabled", true);
    obj->setProperty("stereoSpread", (double)s.getStereoSpread());
    obj->setProperty("unison", s.getUnison());
    obj->setProperty("detune", (double)s.getDetune());
    obj->setProperty("drive", (double)s.getDrive());
    obj->setProperty("driveShape", s.getDriveShape());
    obj->setProperty("driveBias", (double)s.getDriveBias());
    obj->setProperty("driveMix", (double)s.getDriveMix());
    obj->setProperty("activePartialCount", s.getActivePartialCount());
    obj->setProperty("spectralMode", s.getSpectralMode());
    return juce::var(obj);
}

juce::var snapshotSpectrumAnalyzerNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::SpectrumAnalyzerNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("sensitivity", (double)s.getSensitivity());
    obj->setProperty("smoothing", (double)s.getSmoothing());
    obj->setProperty("floor", (double)s.getFloor());
    obj->setProperty("band1", (double)s.getBand1());
    obj->setProperty("band2", (double)s.getBand2());
    obj->setProperty("band3", (double)s.getBand3());
    obj->setProperty("band4", (double)s.getBand4());
    obj->setProperty("band5", (double)s.getBand5());
    obj->setProperty("band6", (double)s.getBand6());
    obj->setProperty("band7", (double)s.getBand7());
    obj->setProperty("band8", (double)s.getBand8());
    return juce::var(obj);
}

juce::var snapshotCrusherNode(dsp_primitives::IPrimitiveNode& node) {
    auto& b = dynamic_cast<dsp_primitives::BitCrusherNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("bits", (double)b.getBits());
    obj->setProperty("rateReduction", (double)b.getRateReduction());
    obj->setProperty("mix", (double)b.getMix());
    obj->setProperty("output", (double)b.getOutput());
    obj->setProperty("logicMode", b.getLogicMode());
    return juce::var(obj);
}

juce::var snapshotADSRNode(dsp_primitives::IPrimitiveNode&) {
    // ADSREnvelopeNode has no public getters — all parameters are private atomics.
    // State is observable only through output metrics.
    return juce::var(new juce::DynamicObject());
}

juce::var snapshotSlewLimiterNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::SlewLimiterNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("riseRate", (double)s.getRiseRate());
    obj->setProperty("fallRate", (double)s.getFallRate());
    return juce::var(obj);
}

juce::var snapshotMSEncoderNode(dsp_primitives::IPrimitiveNode& node) {
    auto& m = dynamic_cast<dsp_primitives::MSEncoderNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("width", (double)m.getWidth());
    return juce::var(obj);
}

juce::var snapshotStutterNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::StutterNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("length", (double)s.getLength());
    obj->setProperty("gate", (double)s.getGate());
    obj->setProperty("filterDecay", (double)s.getFilterDecay());
    obj->setProperty("pitchDecay", (double)s.getPitchDecay());
    obj->setProperty("probability", (double)s.getProbability());
    obj->setProperty("pattern", s.getPattern());
    obj->setProperty("mix", (double)s.getMix());
    return juce::var(obj);
}

juce::var snapshotTransientShaperNode(dsp_primitives::IPrimitiveNode& node) {
    auto& t = dynamic_cast<dsp_primitives::TransientShaperNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("attack", (double)t.getAttack());
    obj->setProperty("sustain", (double)t.getSustain());
    obj->setProperty("sensitivity", (double)t.getSensitivity());
    obj->setProperty("mix", (double)t.getMix());
    obj->setProperty("transient", (double)t.getTransient());
    return juce::var(obj);
}

juce::var snapshotPitchDetectorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& p = dynamic_cast<dsp_primitives::PitchDetectorNode&>(node);
    auto* obj = new juce::DynamicObject();
    obj->setProperty("frequency", (double)p.getFrequency());
    obj->setProperty("midiNote", p.getMidiNote());
    obj->setProperty("clarity", (double)p.getClarity());
    return juce::var(obj);
}

// ============================================================================
// Per-node configuration functions (set parameters to known test values)
// ============================================================================

void configureGainNode(dsp_primitives::IPrimitiveNode& node) {
    auto& g = dynamic_cast<dsp_primitives::GainNode&>(node);
    g.setGain(0.75f);
}

void configureFilterNode(dsp_primitives::IPrimitiveNode& node) {
    auto& f = dynamic_cast<dsp_primitives::FilterNode&>(node);
    f.setCutoff(5000.0f);
    f.setResonance(0.5f);
    f.setMix(0.7f);
}

void configureOscillatorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& o = dynamic_cast<dsp_primitives::OscillatorNode&>(node);
    o.setFrequency(440.0f);
    o.setAmplitude(0.5f);
    o.setWaveform(0); // sine
    o.setEnabled(true);
}

void configureReverbNode(dsp_primitives::IPrimitiveNode& node) {
    auto& r = dynamic_cast<dsp_primitives::ReverbNode&>(node);
    r.setRoomSize(0.6f);
    r.setDamping(0.3f);
    r.setWetLevel(0.4f);
    r.setDryLevel(0.8f);
    r.setWidth(0.7f);
}

void configureStereoDelayNode(dsp_primitives::IPrimitiveNode& node) {
    auto& d = dynamic_cast<dsp_primitives::StereoDelayNode&>(node);
    d.setTimeL(250.0f);
    d.setTimeR(375.0f);
    d.setFeedback(0.3f);
    d.setMix(0.5f);
    d.setTempo(120.0f);
}

void configureDistortionNode(dsp_primitives::IPrimitiveNode& node) {
    auto& d = dynamic_cast<dsp_primitives::DistortionNode&>(node);
    d.setDrive(6.0f);
    d.setMix(0.6f);
    d.setOutput(0.0f);
}

void configureSVFNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::SVFNode&>(node);
    s.setCutoff(3000.0f);
    s.setResonance(0.3f);
    s.setMix(0.6f);
}

void configureCompressorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& c = dynamic_cast<dsp_primitives::CompressorNode&>(node);
    c.setThreshold(-12.0f);
    c.setRatio(4.0f);
    c.setAttack(5.0f);
    c.setRelease(50.0f);
    c.setMakeup(3.0f);
    c.setMix(0.8f);
}

void configureLimiterNode(dsp_primitives::IPrimitiveNode& node) {
    auto& l = dynamic_cast<dsp_primitives::LimiterNode&>(node);
    l.setThreshold(-3.0f);
    l.setRelease(50.0f);
    l.setMakeup(4.0f);
    l.setSoftClip(0.4f);
    l.setMix(0.8f);
}

void configureWaveShaperNode(dsp_primitives::IPrimitiveNode& node) {
    auto& w = dynamic_cast<dsp_primitives::WaveShaperNode&>(node);
    w.setCurve(2); // sine shaper
    w.setDrive(12.0f);
    w.setOutput(-3.0f);
    w.setMix(0.6f);
}

void configureChorusNode(dsp_primitives::IPrimitiveNode& node) {
    auto& c = dynamic_cast<dsp_primitives::ChorusNode&>(node);
    c.setRate(0.5f);
    c.setDepth(0.5f);
    c.setVoices(3);
    c.setFeedback(0.2f);
    c.setMix(0.4f);
    c.setSpread(0.6f);
    c.setWaveform(0); // sine
}

void configurePhaserNode(dsp_primitives::IPrimitiveNode& node) {
    auto& p = dynamic_cast<dsp_primitives::PhaserNode&>(node);
    p.setRate(0.4f);
    p.setDepth(0.6f);
    p.setStages(4);
    p.setFeedback(0.3f);
    p.setSpread(90.0f);
}

void configureEQNode(dsp_primitives::IPrimitiveNode& node) {
    auto& e = dynamic_cast<dsp_primitives::EQNode&>(node);
    e.setLowGain(-3.0f);
    e.setLowFreq(200.0f);
    e.setMidGain(-2.0f);
    e.setMidFreq(1000.0f);
    e.setMidQ(1.0f);
    e.setHighGain(1.0f);
    e.setHighFreq(6000.0f);
    e.setOutput(0.0f);
    e.setMix(0.8f);
}

void configureEQ8Node(dsp_primitives::IPrimitiveNode& node) {
    auto& e = dynamic_cast<dsp_primitives::EQ8Node&>(node);
    e.setOutput(0.0f);
    e.setMix(0.8f);
    for (int i = 0; i < 8; ++i) {
        if (i % 2 == 0) {
            e.setBandEnabled(i, true);
            e.setBandType(i, 0); // peak
            e.setBandFreq(i, 200.0f * (i + 1));
            e.setBandGain(i, (i % 3 == 0) ? -3.0f : 2.0f);
            e.setBandQ(i, 1.0f);
        } else {
            e.setBandEnabled(i, false);
        }
    }
}

void configureStereoWidenerNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::StereoWidenerNode&>(node);
    s.setWidth(1.2f);
    s.setMonoLowFreq(150.0f);
    s.setMonoLowEnable(true);
}

void configureGranulatorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& g = dynamic_cast<dsp_primitives::GranulatorNode&>(node);
    g.setGrainSize(100.0f);
    g.setDensity(20.0f);
    g.setPosition(0.5f);
    g.setPitch(0.0f);
    g.setSpray(0.2f);
    g.setFreeze(false);
    g.setEnabled(true);
    g.setEnvelope(1); // gaussian
    g.setMix(0.5f);
    g.setBufferSeconds(5.0f);
}

void configureMultitapDelayNode(dsp_primitives::IPrimitiveNode& node) {
    auto& m = dynamic_cast<dsp_primitives::MultitapDelayNode&>(node);
    m.setTapCount(4);
    for (int i = 0; i < 4; ++i) {
        m.setTapTime(i, 100.0f * (i + 1));
        m.setTapGain(i, 1.0f / (i + 1));
        m.setTapPan(i, (i % 2 == 0) ? -0.5f : 0.5f);
    }
    m.setFeedback(0.2f);
    m.setMix(0.5f);
}

void configurePitchShifterNode(dsp_primitives::IPrimitiveNode& node) {
    auto& p = dynamic_cast<dsp_primitives::PitchShifterNode&>(node);
    p.setPitch(5.0f);
    p.setWindow(50.0f);
    p.setFeedback(0.1f);
    p.setMix(0.6f);
}

void configureRingModulatorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& r = dynamic_cast<dsp_primitives::RingModulatorNode&>(node);
    r.setFrequency(200.0f);
    r.setDepth(0.7f);
    r.setMix(0.5f);
    r.setSpread(45.0f);
}

void configureShimmerNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::ShimmerNode&>(node);
    s.setSize(0.5f);
    s.setPitch(7.0f);
    s.setFeedback(0.4f);
    s.setMix(0.4f);
    s.setModulation(0.3f);
    s.setFilter(5000.0f);
}

void configureBitCrusherNode(dsp_primitives::IPrimitiveNode& node) {
    auto& b = dynamic_cast<dsp_primitives::BitCrusherNode&>(node);
    b.setBits(8.0f);
    b.setRateReduction(4.0f);
    b.setMix(0.6f);
    b.setOutput(1.0f);
}

void configureFormantFilterNode(dsp_primitives::IPrimitiveNode& node) {
    auto& f = dynamic_cast<dsp_primitives::FormantFilterNode&>(node);
    f.setVowel(2.0f);
    f.setShift(0.0f);
    f.setResonance(6.0f);
    f.setDrive(1.5f);
    f.setMix(0.7f);
}

void configureReverseDelayNode(dsp_primitives::IPrimitiveNode& node) {
    auto& r = dynamic_cast<dsp_primitives::ReverseDelayNode&>(node);
    r.setTime(500.0f);
    r.setWindow(100.0f);
    r.setFeedback(0.2f);
    r.setMix(0.5f);
}

void configureEnvelopeFollowerNode(dsp_primitives::IPrimitiveNode& node) {
    auto& e = dynamic_cast<dsp_primitives::EnvelopeFollowerNode&>(node);
    e.setAttack(5.0f);
    e.setRelease(50.0f);
}

void configureNoiseGeneratorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& n = dynamic_cast<dsp_primitives::NoiseGeneratorNode&>(node);
    n.setLevel(0.5f);
    n.setColor(0.3f);
}

void configureResonatorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& r = dynamic_cast<dsp_primitives::ResonatorNode&>(node);
    r.setGain(0.8f);
    r.setFrequency(440.0f);
    r.setQ(5.0f);
}

void configureMixerNode(dsp_primitives::IPrimitiveNode& node) {
    auto& m = dynamic_cast<dsp_primitives::MixerNode&>(node);
    m.setInputCount(4);
    m.setGain1(0.8f);  m.setGain2(0.5f);
    m.setGain3(0.3f);  m.setGain4(0.6f);
    m.setPan1(-0.5f);  m.setPan2(0.2f);
    m.setPan3(-0.8f);  m.setPan4(0.6f);
    m.setMaster(0.9f);
}

void configureSineBankNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::SineBankNode&>(node);
    s.setFrequency(220.0f);
    s.setAmplitude(0.4f);
    s.setEnabled(true);
    s.setStereoSpread(0.5f);
    s.setPartial(0, 220.0f, 1.0f, 0.0f, 0.0f);
}

void configureADSREnvelopeNode(dsp_primitives::IPrimitiveNode& node) {
    auto& a = dynamic_cast<dsp_primitives::ADSREnvelopeNode&>(node);
    a.setAttack(10.0f);
    a.setDecay(50.0f);
    a.setSustain(0.6f);
    a.setRelease(100.0f);
    a.setGate(true);
}

void configureSlewLimiterNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::SlewLimiterNode&>(node);
    s.setSlideUp(10.0f);
    s.setSlideDown(50.0f);
}

void configureSpectrumAnalyzerNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::SpectrumAnalyzerNode&>(node);
    s.setSensitivity(1.0f);
    s.setSmoothing(0.5f);
    s.setFloor(-60.0f);
}

void configureStutterNode(dsp_primitives::IPrimitiveNode& node) {
    auto& s = dynamic_cast<dsp_primitives::StutterNode&>(node);
    s.setLength(0.5f);
    s.setGate(0.75f);
    s.setFilterDecay(0.3f);
    s.setPitchDecay(0.2f);
    s.setProbability(0.8f);
    s.setPattern(0b10101010);
    s.setTempo(120.0f);
    s.setMix(0.5f);
}

void configureTransientShaperNode(dsp_primitives::IPrimitiveNode& node) {
    auto& t = dynamic_cast<dsp_primitives::TransientShaperNode&>(node);
    t.setAttack(0.5f);
    t.setSustain(0.3f);
    t.setSensitivity(1.0f);
    t.setMix(0.7f);
}

void configurePitchDetectorNode(dsp_primitives::IPrimitiveNode& node) {
    auto& p = dynamic_cast<dsp_primitives::PitchDetectorNode&>(node);
    p.setWindowSize(2048);
    p.setFrequencyRange(80.0f, 1600.0f);
    p.setThreshold(0.8f);
    p.setEnabled(true);
}

// Default no-op configure
void configureDefault(dsp_primitives::IPrimitiveNode&) {}

// ============================================================================
// Node factory table — 56 node types from dsp/core/nodes/*.cpp
// ============================================================================

std::map<std::string, NodeTestSpec> buildNodeTestSpecs() {
    std::map<std::string, NodeTestSpec> specs;

    // Helper to register a node type
    auto add = [&](const std::string& name,
                   auto factory,
                   auto configure,
                   auto snapshot,
                   bool hasSIMD,
                   InputBuilder buildInputs = {}) {
        specs[name] = {
            name,
            factory,
            configure,
            snapshot,
            hasSIMD,
            buildInputs
        };
    };

    // ========================================================================
    // STATELESS NODES (19) — pure sample-by-sample math
    // ========================================================================

    add("Gain",
        []{ return std::make_shared<dsp_primitives::GainNode>(2); },
        configureGainNode,
        snapshotGainNode,
        true);

    add("Passthrough",
        []{ return std::make_shared<dsp_primitives::PassthroughNode>(2); },
        configureDefault,
        snapshotNoGetters,
        false);

    add("ConstantSignal",
        []{ return std::make_shared<dsp_primitives::ConstantSignalNode>(); },
        [](auto& n) { dynamic_cast<dsp_primitives::ConstantSignalNode&>(n).setValue(0.5f); },
        [](auto& n) {
            auto& c = dynamic_cast<dsp_primitives::ConstantSignalNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("value", (double)c.getValue());
            return juce::var(o);
        },
        false);

    add("Crossfader",
        []{ return std::make_shared<dsp_primitives::CrossfaderNode>(); },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::CrossfaderNode&>(n);
            x.setPosition(0.25f);
            x.setCurve(0.5f);
            x.setMix(1.0f);
        },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::CrossfaderNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("position", (double)x.getPosition());
            o->setProperty("curve", (double)x.getCurve());
            o->setProperty("mix", (double)x.getMix());
            return juce::var(o);
        },
        false);

    add("Distortion",
        []{ return std::make_shared<dsp_primitives::DistortionNode>(); },
        configureDistortionNode,
        snapshotDistortionNode,
        false);

    add("WaveShaper",
        []{ return std::make_shared<dsp_primitives::WaveShaperNode>(); },
        configureWaveShaperNode,
        snapshotWaveShaperNode,
        true);

    add("RingModulator",
        []{ return std::make_shared<dsp_primitives::RingModulatorNode>(); },
        configureRingModulatorNode,
        snapshotRingModulatorNode,
        false);

    add("MSEncoder",
        []{ return std::make_shared<dsp_primitives::MSEncoderNode>(); },
        configureDefault,
        snapshotMSEncoderNode,
        false);

    add("AudioFm",
        []{ return std::make_shared<dsp_primitives::AudioFmNode>(); },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::AudioFmNode&>(n);
            x.setAmount(0.65f);
            x.setMix(1.0f);
        },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::AudioFmNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("amount", (double)x.getAmount());
            o->setProperty("mix", (double)x.getMix());
            return juce::var(o);
        },
        false);

    add("AudioSync",
        []{ return std::make_shared<dsp_primitives::AudioSyncNode>(); },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::AudioSyncNode&>(n);
            x.setHardness(0.8f);
            x.setMix(1.0f);
        },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::AudioSyncNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("hardness", (double)x.getHardness());
            o->setProperty("mix", (double)x.getMix());
            return juce::var(o);
        },
        false,
        [](int numSamples, bool silence) {
            InputBufferSet inputs;
            inputs.push_back(silence ? generateSilence(numSamples) : generateSine(440.0f, 0.5f, numSamples));
            inputs.push_back(silence ? generateSilence(numSamples) : generatePulseTrain(numSamples, 64, 2, 1.0f));
            return inputs;
        });

    add("PlaybackStateGate",
        []{ return std::make_shared<dsp_primitives::PlaybackStateGateNode>(2); },
        configureDefault,
        snapshotNoGetters,
        false);

    // ========================================================================
    // STATEFUL — FAST DECAY / FILTER-LIKE (15)
    // ========================================================================

    add("Filter",
        []{ return std::make_shared<dsp_primitives::FilterNode>(); },
        configureFilterNode,
        snapshotFilterNode,
        true);

    add("SVF",
        []{ return std::make_shared<dsp_primitives::SVFNode>(); },
        configureSVFNode,
        snapshotSVFNode,
        false);

    add("Comb",
        []{ return std::make_shared<dsp_primitives::CombNode>(); },
        configureDefault,
        snapshotNoGetters,
        false);

    add("Allpass",
        []{ return std::make_shared<dsp_primitives::AllpassNode>(); },
        configureDefault,
        snapshotNoGetters,
        false);

    add("EQ",
        []{ return std::make_shared<dsp_primitives::EQNode>(); },
        configureEQNode,
        snapshotEQNode,
        false);

    add("EQ8",
        []{ return std::make_shared<dsp_primitives::EQ8Node>(); },
        configureEQ8Node,
        snapshotEQ8Node,
        false);

    add("FormantFilter",
        []{ return std::make_shared<dsp_primitives::FormantFilterNode>(); },
        configureFormantFilterNode,
        snapshotFormantFilterNode,
        false);

    add("BitCrusher",
        []{ return std::make_shared<dsp_primitives::BitCrusherNode>(); },
        configureBitCrusherNode,
        snapshotCrusherNode,
        true);

    add("SlewLimiter",
        []{ return std::make_shared<dsp_primitives::SlewLimiterNode>(); },
        configureSlewLimiterNode,
        snapshotSlewLimiterNode,
        false);

    // ========================================================================
    // STATEFUL — LONG TAIL / DELAY + REVERB (12)
    // ========================================================================

    add("StereoDelay",
        []{ return std::make_shared<dsp_primitives::StereoDelayNode>(); },
        configureStereoDelayNode,
        snapshotStereoDelayNode,
        false);

    add("Reverb",
        []{ return std::make_shared<dsp_primitives::ReverbNode>(); },
        configureReverbNode,
        snapshotReverbNode,
        false);

    add("MultitapDelay",
        []{ return std::make_shared<dsp_primitives::MultitapDelayNode>(); },
        configureMultitapDelayNode,
        snapshotMultitapDelayNode,
        false);

    add("Chorus",
        []{ return std::make_shared<dsp_primitives::ChorusNode>(); },
        configureChorusNode,
        snapshotChorusNode,
        false);

    add("Phaser",
        []{ return std::make_shared<dsp_primitives::PhaserNode>(); },
        configurePhaserNode,
        snapshotPhaserNode,
        false);

    add("ReverseDelay",
        []{ return std::make_shared<dsp_primitives::ReverseDelayNode>(); },
        configureReverseDelayNode,
        snapshotReverseDelayNode,
        false);

    add("Shimmer",
        []{ return std::make_shared<dsp_primitives::ShimmerNode>(); },
        configureShimmerNode,
        snapshotShimmerNode,
        false);

    add("Stutter",
        []{ return std::make_shared<dsp_primitives::StutterNode>(); },
        configureStutterNode,
        snapshotStutterNode,
        false);

    add("PitchShifter",
        []{ return std::make_shared<dsp_primitives::PitchShifterNode>(); },
        configurePitchShifterNode,
        snapshotPitchShifterNode,
        false);

    add("FrequencyShift",
        []{ return std::make_shared<dsp_primitives::FrequencyShiftNode>(); },
        configureDefault,
        [](auto& n) {
            auto& f = dynamic_cast<dsp_primitives::FrequencyShiftNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("shiftHz", (double)f.getShiftHz());
            o->setProperty("mix", (double)f.getMix());
            return juce::var(o);
        },
        false);

    // ========================================================================
    // STATEFUL — ENVELOPE / DYNAMICS (5)
    // ========================================================================

    add("ADSREnvelope",
        []{ return std::make_shared<dsp_primitives::ADSREnvelopeNode>(); },
        configureADSREnvelopeNode,
        snapshotADSRNode,
        true);

    add("Compressor",
        []{ return std::make_shared<dsp_primitives::CompressorNode>(); },
        configureCompressorNode,
        snapshotCompressorNode,
        false);

    add("Limiter",
        []{ return std::make_shared<dsp_primitives::LimiterNode>(); },
        configureLimiterNode,
        snapshotLimiterNode,
        false);

    add("TransientShaper",
        []{ return std::make_shared<dsp_primitives::TransientShaperNode>(); },
        configureTransientShaperNode,
        snapshotTransientShaperNode,
        false);

    add("EnvelopeFollower",
        []{ return std::make_shared<dsp_primitives::EnvelopeFollowerNode>(); },
        configureEnvelopeFollowerNode,
        snapshotEnvelopeFollowerNode,
        false);

    // ========================================================================
    // SOURCE NODES (4)
    // ========================================================================

    add("Oscillator",
        []{ return std::make_shared<dsp_primitives::OscillatorNode>(); },
        configureOscillatorNode,
        snapshotOscillatorNode,
        true,
        [](int numSamples, bool /*silence*/) {
            return InputBufferSet{ generateSilence(numSamples) };
        });

    add("SineBank",
        []{ return std::make_shared<dsp_primitives::SineBankNode>(); },
        configureSineBankNode,
        snapshotSineBankNode,
        false);

    add("NoiseGenerator",
        []{ return std::make_shared<dsp_primitives::NoiseGeneratorNode>(); },
        configureNoiseGeneratorNode,
        snapshotNoiseGeneratorNode,
        false);

    // ========================================================================
    // STATE MACHINE NODES (4)
    // ========================================================================

    add("RecordState",
        []{ return std::make_shared<dsp_primitives::RecordStateNode>(); },
        configureDefault,
        snapshotNoGetters,
        false);

    add("RecordModePolicy",
        []{ return std::make_shared<dsp_primitives::RecordModePolicyNode>(); },
        configureDefault,
        snapshotNoGetters,
        false);

    add("TransportState",
        []{ return std::make_shared<dsp_primitives::TransportStateNode>(); },
        configureDefault,
        snapshotNoGetters,
        false);

    add("LoopPlayback",
        []{ return std::make_shared<dsp_primitives::LoopPlaybackNode>(2); },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::LoopPlaybackNode&>(n);
            auto seed = generateSeedCaptureBuffer(1000);
            x.copyFromCaptureBuffer(seed, seed.getNumSamples(), 0, seed.getNumSamples(), false);
            x.setSpeed(1.0f);
            x.play();
        },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::LoopPlaybackNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("loopLength", x.getLoopLength());
            o->setProperty("speed", (double)x.getSpeed());
            o->setProperty("reversed", x.isReversed());
            o->setProperty("playing", x.isPlaying());
            o->setProperty("normalizedPosition", (double)x.getNormalizedPosition());
            return juce::var(o);
        },
        false);

    add("Playhead",
        []{ return std::make_shared<dsp_primitives::PlayheadNode>(); },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::PlayheadNode&>(n);
            x.setLoopLength(1000);
            x.setSpeed(1.0f);
            x.play();
        },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::PlayheadNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("loopLength", x.getLoopLength());
            o->setProperty("speed", (double)x.getSpeed());
            o->setProperty("reversed", x.isReversed());
            o->setProperty("playing", x.isPlaying());
            o->setProperty("normalizedPosition", (double)x.getNormalizedPosition());
            return juce::var(o);
        },
        false);

    add("SampleRegionPlayback",
        []{ return std::make_shared<dsp_primitives::SampleRegionPlaybackNode>(2); },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::SampleRegionPlaybackNode&>(n);
            auto seed = generateSeedCaptureBuffer(1000);
            x.copyFromCaptureBuffer(seed, seed.getNumSamples(), 0, seed.getNumSamples(), false);
            x.setSpeed(1.0f);
            x.play();
        },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::SampleRegionPlaybackNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("loopLength", x.getLoopLength());
            o->setProperty("speed", (double)x.getSpeed());
            o->setProperty("reversed", x.isReversed());
            o->setProperty("oneShot", x.isOneShot());
            o->setProperty("playing", x.isPlaying());
            o->setProperty("normalizedPosition", (double)x.getNormalizedPosition());
            o->setProperty("playStart", (double)x.getPlayStart());
            o->setProperty("loopStart", (double)x.getLoopStart());
            o->setProperty("loopEnd", (double)x.getLoopEnd());
            o->setProperty("crossfade", (double)x.getCrossfade());
            o->setProperty("unison", x.getUnison());
            o->setProperty("detune", (double)x.getDetune());
            o->setProperty("spread", (double)x.getSpread());
            return juce::var(o);
        },
        false);

    add("Quantizer",
        []{ return std::make_shared<dsp_primitives::QuantizerNode>(); },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::QuantizerNode&>(n);
            x.setTempo(128.0f);
            x.setBeatsPerBar(7.0f);
        },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::QuantizerNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("tempo", (double)x.getTempo());
            o->setProperty("beatsPerBar", (double)x.getBeatsPerBar());
            o->setProperty("samplesPerBar", (double)x.getSamplesPerBar());
            o->setProperty("quantized12345", x.quantizeToNearestLegal(12345));
            return juce::var(o);
        },
        false);

    add("ForwardCommitScheduler",
        []{ return std::make_shared<dsp_primitives::ForwardCommitSchedulerNode>(); },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::ForwardCommitSchedulerNode&>(n);
            x.arm(1.0f, 2, 128.0, 44100.0f);
        },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::ForwardCommitSchedulerNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("armed", x.isArmed());
            o->setProperty("bars", (double)x.getBars());
            o->setProperty("layerIndex", x.getLayerIndex());
            return juce::var(o);
        },
        false);

    add("RetrospectiveCapture",
        []{ return std::make_shared<dsp_primitives::RetrospectiveCaptureNode>(2); },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::RetrospectiveCaptureNode&>(n);
            x.setCaptureSeconds(2.0f);
        },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::RetrospectiveCaptureNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("captureSeconds", (double)x.getCaptureSeconds());
            o->setProperty("captureSize", x.getCaptureSize());
            o->setProperty("writeOffset", x.getWriteOffset());
            return juce::var(o);
        },
        false);

    add("MidiVoice",
        []{ return std::make_shared<dsp_primitives::MidiVoiceNode>(); },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::MidiVoiceNode&>(n);
            x.setWaveform(0);
            x.setAttack(0.01f);
            x.setDecay(0.1f);
            x.setSustain(0.7f);
            x.setRelease(0.2f);
            x.setFilterCutoff(12000.0f);
            x.setEnabled(true);
            x.noteOn(0, 60, 100);
        },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::MidiVoiceNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("waveform", x.getWaveform());
            o->setProperty("attack", (double)x.getAttack());
            o->setProperty("decay", (double)x.getDecay());
            o->setProperty("sustain", (double)x.getSustain());
            o->setProperty("release", (double)x.getRelease());
            o->setProperty("filterCutoff", (double)x.getFilterCutoff());
            o->setProperty("filterResonance", (double)x.getFilterResonance());
            o->setProperty("filterEnvAmount", (double)x.getFilterEnvAmount());
            o->setProperty("enabled", x.isEnabled());
            o->setProperty("polyphony", x.getPolyphony());
            o->setProperty("activeVoices", x.getNumActiveVoices());
            return juce::var(o);
        },
        false);

    add("MidiInput",
        []{ return std::make_shared<dsp_primitives::MidiInputNode>(); },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::MidiInputNode&>(n);
            x.setMonophonic(true);
            x.setPitchBendRange(7.0f);
            x.triggerNoteOn(60, 100);
            x.triggerPitchBend(2048);
        },
        [](auto& n) {
            auto& x = dynamic_cast<dsp_primitives::MidiInputNode&>(n);
            auto* o = new juce::DynamicObject();
            o->setProperty("channelFilter", x.getChannelFilter());
            o->setProperty("omniMode", x.isOmniMode());
            o->setProperty("monophonic", x.isMonophonic());
            o->setProperty("portamento", (double)x.getPortamento());
            o->setProperty("pitchBendRange", (double)x.getPitchBendRange());
            o->setProperty("enabled", x.isEnabled());
            o->setProperty("echoOutput", x.isEchoingOutput());
            o->setProperty("lastNote", (int)x.getLastNote());
            o->setProperty("lastVelocity", (int)x.getLastVelocity());
            o->setProperty("currentPitchBend", (double)x.getCurrentPitchBend());
            return juce::var(o);
        },
        false);

    // ========================================================================
    // ANALYSIS NODES (2)
    // ========================================================================

    add("SpectrumAnalyzer",
        []{ return std::make_shared<dsp_primitives::SpectrumAnalyzerNode>(); },
        configureSpectrumAnalyzerNode,
        snapshotSpectrumAnalyzerNode,
        false);

    add("PitchDetector",
        []{ return std::make_shared<dsp_primitives::PitchDetectorNode>(2); },
        configurePitchDetectorNode,
        snapshotPitchDetectorNode,
        false);

    // ========================================================================
    // MIXER / ROUTING (3)
    // ========================================================================

    add("Mixer",
        []{ return std::make_shared<dsp_primitives::MixerNode>(); },
        configureMixerNode,
        snapshotMixerNode,
        true);

    add("StereoWidener",
        []{ return std::make_shared<dsp_primitives::StereoWidenerNode>(); },
        configureStereoWidenerNode,
        snapshotStereoWidenerNode,
        false);

    add("Resonator",
        []{ return std::make_shared<dsp_primitives::ResonatorNode>(); },
        configureResonatorNode,
        snapshotResonatorNode,
        false);

    // ========================================================================
    // SPECIAL-CASE NODES
    // ========================================================================

    // Granulator and PhaseVocoder are included here, but this harness still only
    // gives them single-node contract coverage. Their deeper correctness surface
    // (temporal buffering, FFT/grain continuity across graph/runtime swaps) still
    // needs GraphRuntime-level tests.

    add("Granulator",
        []{ return std::make_shared<dsp_primitives::GranulatorNode>(); },
        configureGranulatorNode,
        snapshotGranulatorNode,
        false);

    add("PhaseVocoder",
        []{ return std::make_shared<dsp_primitives::PhaseVocoderNode>(); },
        configureDefault,
        snapshotNoGetters,
        false);

    return specs;
}

// ============================================================================
// Test runner
// ============================================================================

static bool hasDisableSIMD(const std::string& typeName) {
    // Nodes known to have disableSIMD()
    static const std::vector<std::string> simdNodes = {
        "ADSREnvelope", "BitCrusher", "Filter", "Gain",
        "Mixer", "Oscillator", "WaveShaper"
    };
    return std::find(simdNodes.begin(), simdNodes.end(), typeName) != simdNodes.end();
}

juce::var testNode(const NodeTestSpec& spec) {
    auto* nodeObj = new juce::DynamicObject();
    nodeObj->setProperty("nodeType", juce::var(spec.typeName));

    // Create and prepare
    auto node = spec.factory();
    node->prepare(kTestSampleRate, kTestBlockSize);

    nodeObj->setProperty("numInputs", node->getNumInputs());
    nodeObj->setProperty("numOutputs", node->getNumOutputs());
    nodeObj->setProperty("nodeTypeString", node->getNodeType());
    nodeObj->setProperty("controlOnly", node->getNumOutputs() == 0);

    auto makeInputs = [&](bool silence) {
        if (spec.buildInputs) {
            return spec.buildInputs(kTestBlockSize, silence);
        }
        return buildGenericInputBuses(node->getNumInputs(), kTestBlockSize, silence);
    };

    // --- Phase 1: Snapshot after prepare (default state) ---
    nodeObj->setProperty("defaultState", spec.snapshotGetters(*node));

    // --- Phase 2: Process with silence input (check zero output) ---
    {
        auto inputs = makeInputs(true);
        std::vector<juce::AudioBuffer<float>> outputs(1);
        outputs[0] = juce::AudioBuffer<float>(kTestChannels, kTestBlockSize);
        outputs[0].clear();
        auto inViews = makeInputViews(inputs);
        auto outViews = makeOutputViews(outputs);

        if (!inputs.empty())
            node->process(inViews, outViews, kTestBlockSize);
        else
            node->process({}, outViews, kTestBlockSize);

        auto metrics = computeMetrics(outputs[0]);
        nodeObj->setProperty("silenceOutput", metricsToVar(metrics));
    }

    // --- Phase 3: Configure with known parameters ---
    spec.configure(*node);
    nodeObj->setProperty("configuredState", spec.snapshotGetters(*node));

    // --- Phase 4: Process with test tone (steady-state measurement) ---
    {
        auto inputs = makeInputs(false);
        std::vector<juce::AudioBuffer<float>> outputs(1);
        outputs[0] = juce::AudioBuffer<float>(kTestChannels, kTestBlockSize);

        auto inViews = makeInputViews(inputs);
        auto outViews = makeOutputViews(outputs);

        // Warmup blocks for stateful nodes
        for (int w = 0; w < kWarmupBlocks; ++w) {
            outputs[0].clear();
            if (!inputs.empty())
                node->process(inViews, outViews, kTestBlockSize);
            else
                node->process({}, outViews, kTestBlockSize);
        }

        // Measurement blocks — accumulate
        double sumPeakL = 0, sumPeakR = 0, sumRmsL = 0, sumRmsR = 0;
        double sumDcL = 0, sumDcR = 0;
        int validBlocks = 0;
        bool anyNaN = false;
        bool anyInf = false;

        for (int m = 0; m < kTestBlocks; ++m) {
            outputs[0].clear();
            if (!inputs.empty())
                node->process(inViews, outViews, kTestBlockSize);
            else
                node->process({}, outViews, kTestBlockSize);

            auto m2 = computeMetrics(outputs[0]);
            sumPeakL += m2.peakL; sumPeakR += m2.peakR;
            sumRmsL += m2.rmsL;   sumRmsR += m2.rmsR;
            sumDcL += m2.dcL;     sumDcR += m2.dcR;
            if (m2.hasNaN) anyNaN = true;
            if (m2.hasInf) anyInf = true;
            ++validBlocks;
        }

        if (validBlocks > 0) {
            OutputMetrics avg;
            avg.peakL = (float)(sumPeakL / validBlocks);
            avg.peakR = (float)(sumPeakR / validBlocks);
            avg.rmsL  = (float)(sumRmsL / validBlocks);
            avg.rmsR  = (float)(sumRmsR / validBlocks);
            avg.dcL   = (float)(sumDcL / validBlocks);
            avg.dcR   = (float)(sumDcR / validBlocks);
            avg.hasNaN = anyNaN;
            avg.hasInf = anyInf;
            nodeObj->setProperty("toneOutput", metricsToVar(avg));
        }
        nodeObj->setProperty("postProcessState", spec.snapshotGetters(*node));
    }

    // --- Phase 5: SIMD vs scalar dual-path comparison (if applicable) ---
    if (hasDisableSIMD(spec.typeName)) {
        auto scalarNode = spec.factory();
        scalarNode->prepare(kTestSampleRate, kTestBlockSize);
        spec.configure(*scalarNode);

        auto simdNode = spec.factory();
        simdNode->prepare(kTestSampleRate, kTestBlockSize);
        spec.configure(*simdNode);

        // Attempt to disable SIMD on the scalar node
        // We use dynamic_cast and try disableSIMD if available
        auto* scalarBase = scalarNode.get();
        if (auto* gain = dynamic_cast<dsp_primitives::GainNode*>(scalarBase))
            gain->disableSIMD();
        else if (auto* filter = dynamic_cast<dsp_primitives::FilterNode*>(scalarBase))
            filter->disableSIMD();
        else if (auto* osc = dynamic_cast<dsp_primitives::OscillatorNode*>(scalarBase))
            osc->disableSIMD();
        else if (auto* waveshaper = dynamic_cast<dsp_primitives::WaveShaperNode*>(scalarBase))
            waveshaper->disableSIMD();
        else if (auto* mixer = dynamic_cast<dsp_primitives::MixerNode*>(scalarBase))
            mixer->disableSIMD();
        else if (auto* crusher = dynamic_cast<dsp_primitives::BitCrusherNode*>(scalarBase))
            crusher->disableSIMD();
        else if (auto* adsr = dynamic_cast<dsp_primitives::ADSREnvelopeNode*>(scalarBase))
            adsr->disableSIMD();

        auto inputs = makeInputs(false);
        std::vector<juce::AudioBuffer<float>> outScalars(1);
        outScalars[0] = juce::AudioBuffer<float>(kTestChannels, kTestBlockSize);
        std::vector<juce::AudioBuffer<float>> outSIMDs(1);
        outSIMDs[0] = juce::AudioBuffer<float>(kTestChannels, kTestBlockSize);
        auto inViews = makeInputViews(inputs);
        auto outViewsScalar = makeOutputViews(outScalars);
        auto outViewsSIMD = makeOutputViews(outSIMDs);

        // Feed same tone to both
        for (int w = 0; w < kWarmupBlocks; ++w) {
            outScalars[0].clear(); outSIMDs[0].clear();
            if (!inputs.empty()) {
                scalarNode->process(inViews, outViewsScalar, kTestBlockSize);
                simdNode->process(inViews, outViewsSIMD, kTestBlockSize);
            } else {
                scalarNode->process({}, outViewsScalar, kTestBlockSize);
                simdNode->process({}, outViewsSIMD, kTestBlockSize);
            }
        }

        // Measure diff
        float maxDiff = 0.0f;
        int ch = juce::jmin(kTestChannels, outScalars[0].getNumChannels(), outSIMDs[0].getNumChannels());
        for (int c = 0; c < ch; ++c) {
            auto* s = outScalars[0].getReadPointer(c);
            auto* d = outSIMDs[0].getReadPointer(c);
            for (int i = 0; i < kTestBlockSize; ++i)
                maxDiff = std::max(maxDiff, std::abs(s[i] - d[i]));
        }

        auto* diffObj = new juce::DynamicObject();
        diffObj->setProperty("maxAbsDiff", (double)maxDiff);
        diffObj->setProperty("withinTolerance", maxDiff <= 1e-4f);
        nodeObj->setProperty("scalarVsSIMD", juce::var(diffObj));
    }

    return juce::var(nodeObj);
}

} // anonymous namespace

// ============================================================================
// Main
// ============================================================================

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts))
        return 1;

    juce::ScopedJuceInitialiser_GUI juceInit;

    auto specs = buildNodeTestSpecs();

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);
    root->setProperty("sampleRate", kTestSampleRate);
    root->setProperty("blockSize", kTestBlockSize);
    root->setProperty("numChannels", kTestChannels);
    root->setProperty("testFrequencyHz", (double)kTestFreq);
    root->setProperty("testAmplitude", (double)kTestAmplitude);
    root->setProperty("warmupBlocks", kWarmupBlocks);
    root->setProperty("testBlocks", kTestBlocks);

    juce::Array<juce::var> results;
    int tested = 0;
    int skipped = 0;
    int failed = 0;

    for (const auto& [name, spec] : specs) {
        try {
            auto result = testNode(spec);
            results.add(result);
            ++tested;
        } catch (const std::exception& e) {
            std::fprintf(stderr, "ERROR testing node '%s': %s\n",
                         name.c_str(), e.what());
            ++failed;
            auto* errObj = new juce::DynamicObject();
            errObj->setProperty("nodeType", juce::var(name));
            errObj->setProperty("error", e.what());
            results.add(juce::var(errObj));
        }
    }

    root->setProperty("nodes", juce::var(results));
    root->setProperty("tested", tested);
    root->setProperty("skipped", skipped);
    root->setProperty("failed", failed);

    const std::string contract = juce::JSON::toString(juce::var(root), true).toStdString();

    switch (opts.mode) {
        case HarnessOptions::Write: {
            std::ofstream file(opts.contractPath);
            if (!file.is_open()) {
                std::fprintf(stderr, "ERROR: cannot write to %s\n",
                             opts.contractPath.c_str());
                std::_Exit(2);
            }
            file << contract;
            file.close();
            std::fprintf(stdout, "OK: wrote DSP node contract (%zu bytes, %d nodes, %d failed) to %s\n",
                         contract.size(), tested, failed, opts.contractPath.c_str());
            std::fflush(stdout);
            std::fflush(stderr);
            std::_Exit(failed > 0 ? 1 : 0);
        }
        case HarnessOptions::Verify: {
            const bool ok = verifyContract(contract, opts.contractPath);
            std::fprintf(stdout, "  tested: %d, failed: %d\n", tested, failed);
            std::fflush(stdout);
            std::fflush(stderr);
            std::_Exit((ok && failed == 0) ? 0 : 1);
        }
        case HarnessOptions::Print: {
            std::fprintf(stdout, "%s", contract.c_str());
            std::fflush(stdout);
            std::fflush(stderr);
            std::_Exit(failed > 0 ? 1 : 0);
        }
    }

    std::_Exit(0);
}
