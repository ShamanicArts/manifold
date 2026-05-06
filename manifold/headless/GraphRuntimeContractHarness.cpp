// GraphRuntimeContractHarness — contract tests for the graph compilation & runtime
// pipeline: PrimitiveGraph → compileGraphRuntime() → GraphRuntime
//
// Exercises:
//   • Empty graph compilation
//   • Single-node passthrough via host input
//   • Node chain (topology ordering + signal routing)
//   • Gain + filter chain (processing correctness)
//   • Branch topology (signal fan-out to multiple sinks)
//   • Cycle detection (validateConnection + hasCycle)
//   • Role gating (Monitor role enabled/disabled)
//   • State continuity (delay buffer survives recompile)
//
// Usage:
//   --print-contract                    Print contract JSON to stdout
//   --write-contract PATH               Write golden file
//   --verify-contract PATH              Compare against golden file
//   --help                              This message

#include "dsp/core/graph/PrimitiveNode.h"
#include "manifold/primitives/scripting/PrimitiveGraph.h"
#include "manifold/primitives/scripting/GraphRuntime.h"

#include "dsp/core/nodes/PassthroughNode.h"
#include "dsp/core/nodes/GainNode.h"
#include "dsp/core/nodes/FilterNode.h"
#include "dsp/core/nodes/MixerNode.h"
#include "dsp/core/nodes/OscillatorNode.h"
#include "dsp/core/nodes/ConstantSignalNode.h"
#include "dsp/core/nodes/StereoDelayNode.h"

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
#include <juce_audio_basics/juce_audio_basics.h>

// ============================================================================
// Shared test utilities (copied from DspNodeContractHarness.cpp — duplication
// is fine for test code)
// ============================================================================

namespace {

constexpr double kSampleRate = 44100.0;
constexpr int    kBlockSize  = 512;
constexpr int    kChannels   = 2;
constexpr float  kTestFreq   = 440.0f;
constexpr float  kTestAmp    = 0.5f;
constexpr int    kWarmup     = 4;
constexpr int    kMeasure    = 2;

struct OutputMetrics {
    float peakL = 0.0f;
    float peakR = 0.0f;
    float rmsL  = 0.0f;
    float rmsR  = 0.0f;
    float dcL   = 0.0f;
    float dcR   = 0.0f;
    bool  hasNaN = false;
    bool  hasInf = false;
};

OutputMetrics computeMetrics(const juce::AudioBuffer<float>& buffer) {
    OutputMetrics m;
    const int ch = juce::jmin(2, buffer.getNumChannels());
    for (int c = 0; c < ch; ++c) {
        const float* data = buffer.getReadPointer(c);
        const int n = buffer.getNumSamples();
        float peak = 0.0f;
        double sum = 0.0;
        double sumSq = 0.0;
        for (int i = 0; i < n; ++i) {
            const float s = data[i];
            if (std::isnan(s)) m.hasNaN = true;
            if (std::isinf(s)) m.hasInf = true;
            peak = std::max(peak, std::abs(s));
            sum += s;
            sumSq += static_cast<double>(s) * static_cast<double>(s);
        }
        const float rms = (n > 0) ? std::sqrt(static_cast<float>(sumSq / n)) : 0.0f;
        const float dc  = (n > 0) ? static_cast<float>(sum / n) : 0.0f;
        if (c == 0) { m.peakL = peak; m.rmsL = rms; m.dcL = dc; }
        else        { m.peakR = peak; m.rmsR = rms; m.dcR = dc; }
    }
    return m;
}

juce::var metricsToVar(const OutputMetrics& m) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("peakL", static_cast<double>(m.peakL));
    obj->setProperty("peakR", static_cast<double>(m.peakR));
    obj->setProperty("rmsL",  static_cast<double>(m.rmsL));
    obj->setProperty("rmsR",  static_cast<double>(m.rmsR));
    obj->setProperty("dcL",   static_cast<double>(m.dcL));
    obj->setProperty("dcR",   static_cast<double>(m.dcR));
    obj->setProperty("hasNaN", m.hasNaN);
    obj->setProperty("hasInf", m.hasInf);
    return juce::var(obj);
}

juce::AudioBuffer<float> generateSine(float freqHz, float amplitude, int numSamples) {
    juce::AudioBuffer<float> tone(kChannels, numSamples);
    tone.clear();
    for (int ch = 0; ch < kChannels; ++ch) {
        auto* data = tone.getWritePointer(ch);
        for (int i = 0; i < numSamples; ++i) {
            data[i] = amplitude * std::sin(2.0f * juce::MathConstants<float>::pi
                        * freqHz * static_cast<float>(i) / static_cast<float>(kSampleRate));
        }
    }
    return tone;
}

juce::AudioBuffer<float> generateSilence(int numSamples) {
    juce::AudioBuffer<float> silence(kChannels, numSamples);
    silence.clear();
    return silence;
}

juce::AudioBuffer<float> generateImpulse(float amplitude, int numSamples) {
    juce::AudioBuffer<float> impulse(kChannels, numSamples);
    impulse.clear();
    impulse.setSample(0, 0, amplitude);
    if (kChannels > 1) impulse.setSample(1, 0, amplitude);
    return impulse;
}

// Process N blocks of input through the runtime, return accumulated metrics
OutputMetrics processAndMeasure(dsp_primitives::GraphRuntime& runtime,
                                const juce::AudioBuffer<float>& inputSignal,
                                int numBlocks) {
    OutputMetrics accumulated;
    int count = 0;
    for (int b = 0; b < numBlocks; ++b) {
        juce::AudioBuffer<float> buf(inputSignal);
        runtime.process(buf, nullptr, nullptr);
        const auto m = computeMetrics(buf);
        // Accumulate peak values, take average of RMS/DC
        if (count == 0) {
            accumulated = m;
        } else {
            accumulated.peakL = std::max(accumulated.peakL, m.peakL);
            accumulated.peakR = std::max(accumulated.peakR, m.peakR);
            accumulated.rmsL = (accumulated.rmsL * static_cast<float>(count) + m.rmsL) / static_cast<float>(count + 1);
            accumulated.rmsR = (accumulated.rmsR * static_cast<float>(count) + m.rmsR) / static_cast<float>(count + 1);
            accumulated.dcL = (accumulated.dcL * static_cast<float>(count) + m.dcL) / static_cast<float>(count + 1);
            accumulated.dcR = (accumulated.dcR * static_cast<float>(count) + m.dcR) / static_cast<float>(count + 1);
            accumulated.hasNaN = accumulated.hasNaN || m.hasNaN;
            accumulated.hasInf = accumulated.hasInf || m.hasInf;
        }
        ++count;
    }
    return accumulated;
}

// ============================================================================
// Struct to hold a compiled graph + its output metrics
// ============================================================================

struct GraphTestResult {
    std::string name;
    bool compilationSuccess = false;
    bool isValid = false;
    int nodeCount = 0;
    int connectionCount = 0;
    bool hasCycle = false;
    std::vector<std::string> topologyOrder;
    OutputMetrics warmupMetrics;
    OutputMetrics outputMetrics;
};

// ============================================================================
// Harness options & CLI
// ============================================================================

struct HarnessOptions {
    enum Mode { Print, Write, Verify } mode = Print;
    std::string contractPath;
};

void printUsage(const char* name) {
    std::fprintf(stderr,
        "Usage: %s [--print-contract | --write-contract PATH | "
        "--verify-contract PATH]\n", name);
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
        std::fprintf(stdout, "OK: graph runtime contract matches golden file\n");
        return true;
    }

    const size_t minLen = std::min(goldenStr.size(), currentStr.size());
    size_t diffPos = 0;
    while (diffPos < minLen && goldenStr[diffPos] == currentStr[diffPos])
        ++diffPos;

    std::fprintf(stderr, "FAIL: graph runtime contract mismatch\n");
    std::fprintf(stderr, "  golden: %zu bytes, current: %zu bytes\n",
                 goldenStr.size(), currentStr.size());
    std::fprintf(stderr, "  first diff at byte %zu\n", diffPos);

    auto printAround = [](const std::string& s, size_t pos, const char* label) {
        const size_t start = (pos > 60) ? pos - 60 : 0;
        const size_t end = std::min(pos + 60, s.size());
        std::fprintf(stderr, "  %s context [%zu..%zu]:\n", label, start, end);
        std::fprintf(stderr, "    %s\n", s.substr(start, end - start).c_str());
    };
    printAround(goldenStr, diffPos, "golden");
    printAround(currentStr, diffPos, "current");

    return false;
}

// ============================================================================
// Test cases
// ============================================================================

juce::var runEmptyGraphTest() {
    auto* info = new juce::DynamicObject();

    dsp_primitives::PrimitiveGraph graph;
    auto runtime = dsp_primitives::compileGraphRuntime(graph, kSampleRate, kBlockSize, kChannels);

    info->setProperty("compilationSuccess", runtime != nullptr);
    info->setProperty("isValid", runtime ? runtime->isValid() : false);
    info->setProperty("nodeCount", 0);
    info->setProperty("connectionCount", 0);
    info->setProperty("hasCycle", graph.hasCycle());

    return juce::var(info);
}

juce::var runSinglePassthroughTest() {
    auto* info = new juce::DynamicObject();

    auto node = std::make_shared<dsp_primitives::PassthroughNode>();
    dsp_primitives::PrimitiveGraph graph;
    graph.registerNode(node);
    graph.setNodeRole(node, dsp_primitives::PrimitiveGraph::NodeRole::OutputDSP);

    auto runtime = dsp_primitives::compileGraphRuntime(graph, kSampleRate, kBlockSize, kChannels);
    info->setProperty("compilationSuccess", runtime != nullptr);
    if (!runtime || !runtime->isValid()) {
        info->setProperty("isValid", false);
        info->setProperty("outputMetrics", metricsToVar(OutputMetrics{}));
        return juce::var(info);
    }

    info->setProperty("isValid", runtime->isValid());
    info->setProperty("nodeCount", runtime->getCompiledNodeCount());
    info->setProperty("connectionCount", runtime->getRouteCount());

    // Feed host input sine to the PassthroughNode (it accepts host input when unconnected)
    const auto sine = generateSine(kTestFreq, kTestAmp, kBlockSize);
    const auto warmupMetrics = processAndMeasure(*runtime, sine, kWarmup);
    const auto outputMetrics = processAndMeasure(*runtime, sine, kMeasure);
    info->setProperty("warmupMetrics", metricsToVar(warmupMetrics));
    info->setProperty("outputMetrics", metricsToVar(outputMetrics));

    return juce::var(info);
}

juce::var runPassthroughChainTest() {
    auto* info = new juce::DynamicObject();

    auto a = std::make_shared<dsp_primitives::PassthroughNode>();
    auto b = std::make_shared<dsp_primitives::PassthroughNode>();
    auto c = std::make_shared<dsp_primitives::PassthroughNode>();

    dsp_primitives::PrimitiveGraph graph;
    graph.registerNode(a);
    graph.registerNode(b);
    graph.registerNode(c);
    graph.connect(a, 0, b, 0);
    graph.connect(b, 0, c, 0);
    graph.setNodeRole(c, dsp_primitives::PrimitiveGraph::NodeRole::OutputDSP);

    auto runtime = dsp_primitives::compileGraphRuntime(graph, kSampleRate, kBlockSize, kChannels);
    info->setProperty("compilationSuccess", runtime != nullptr);
    if (!runtime || !runtime->isValid()) {
        info->setProperty("isValid", false);
        info->setProperty("outputMetrics", metricsToVar(OutputMetrics{}));
        return juce::var(info);
    }

    info->setProperty("isValid", runtime->isValid());
    info->setProperty("nodeCount", runtime->getCompiledNodeCount());
    info->setProperty("connectionCount", runtime->getRouteCount());

    // First node (a) accepts host input → feeds b → feeds c (OutputDSP)
    const auto sine = generateSine(kTestFreq, kTestAmp, kBlockSize);
    const auto warmupMetrics = processAndMeasure(*runtime, sine, kWarmup);
    const auto outputMetrics = processAndMeasure(*runtime, sine, kMeasure);
    info->setProperty("warmupMetrics", metricsToVar(warmupMetrics));
    info->setProperty("outputMetrics", metricsToVar(outputMetrics));

    return juce::var(info);
}

juce::var runGainFilterChainTest() {
    auto* info = new juce::DynamicObject();

    // Pattern: PassthroughNode (host input) → GainNode(0.5) → FilterNode(1000Hz) → OutputDSP
    auto input = std::make_shared<dsp_primitives::PassthroughNode>();
    auto gain  = std::make_shared<dsp_primitives::GainNode>();
    auto filter = std::make_shared<dsp_primitives::FilterNode>();
    auto output = std::make_shared<dsp_primitives::PassthroughNode>();

    gain->setGain(0.5f);
    filter->setCutoff(1000.0f);
    filter->setResonance(0.5f);

    dsp_primitives::PrimitiveGraph graph;
    graph.registerNode(input);
    graph.registerNode(gain);
    graph.registerNode(filter);
    graph.registerNode(output);
    graph.connect(input, 0, gain, 0);
    graph.connect(gain, 0, filter, 0);
    graph.connect(filter, 0, output, 0);
    graph.setNodeRole(output, dsp_primitives::PrimitiveGraph::NodeRole::OutputDSP);

    auto runtime = dsp_primitives::compileGraphRuntime(graph, kSampleRate, kBlockSize, kChannels);
    info->setProperty("compilationSuccess", runtime != nullptr);
    if (!runtime || !runtime->isValid()) {
        info->setProperty("isValid", false);
        info->setProperty("outputMetrics", metricsToVar(OutputMetrics{}));
        return juce::var(info);
    }

    info->setProperty("isValid", runtime->isValid());
    info->setProperty("nodeCount", runtime->getCompiledNodeCount());
    info->setProperty("connectionCount", runtime->getRouteCount());

    const auto sine = generateSine(kTestFreq, kTestAmp, kBlockSize);
    const auto warmupMetrics = processAndMeasure(*runtime, sine, kWarmup);
    const auto outputMetrics = processAndMeasure(*runtime, sine, kMeasure);
    info->setProperty("warmupMetrics", metricsToVar(warmupMetrics));
    info->setProperty("outputMetrics", metricsToVar(outputMetrics));

    return juce::var(info);
}

juce::var runBranchMixTest() {
    auto* info = new juce::DynamicObject();

    // Pattern: PassthroughNode(input) splits to:
    //   → GainNode(0.25, OutputDSP)
    //   → GainNode(0.75, OutputDSP)
    // Both sinks sum to output: 0.25 + 0.75 = 1.0x input
    auto input = std::make_shared<dsp_primitives::PassthroughNode>();
    auto gainA = std::make_shared<dsp_primitives::GainNode>();
    auto gainB = std::make_shared<dsp_primitives::GainNode>();

    gainA->setGain(0.25f);
    gainB->setGain(0.75f);

    dsp_primitives::PrimitiveGraph graph;
    graph.registerNode(input);
    graph.registerNode(gainA);
    graph.registerNode(gainB);
    graph.connect(input, 0, gainA, 0);
    graph.connect(input, 0, gainB, 0);
    graph.setNodeRole(gainA, dsp_primitives::PrimitiveGraph::NodeRole::OutputDSP);
    graph.setNodeRole(gainB, dsp_primitives::PrimitiveGraph::NodeRole::OutputDSP);

    auto runtime = dsp_primitives::compileGraphRuntime(graph, kSampleRate, kBlockSize, kChannels);
    info->setProperty("compilationSuccess", runtime != nullptr);
    if (!runtime || !runtime->isValid()) {
        info->setProperty("isValid", false);
        info->setProperty("outputMetrics", metricsToVar(OutputMetrics{}));
        return juce::var(info);
    }

    info->setProperty("isValid", runtime->isValid());
    info->setProperty("nodeCount", runtime->getCompiledNodeCount());
    info->setProperty("connectionCount", runtime->getRouteCount());

    const auto sine = generateSine(kTestFreq, kTestAmp, kBlockSize);
    const auto warmupMetrics = processAndMeasure(*runtime, sine, kWarmup);
    const auto outputMetrics = processAndMeasure(*runtime, sine, kMeasure);
    info->setProperty("warmupMetrics", metricsToVar(warmupMetrics));
    info->setProperty("outputMetrics", metricsToVar(outputMetrics));

    return juce::var(info);
}

juce::var runCycleDetectionTest() {
    auto* info = new juce::DynamicObject();

    auto a = std::make_shared<dsp_primitives::PassthroughNode>();
    auto b = std::make_shared<dsp_primitives::PassthroughNode>();

    dsp_primitives::PrimitiveGraph graph;
    graph.registerNode(a);
    graph.registerNode(b);

    // Connect A→B
    bool abConnected = graph.connect(a, 0, b, 0);
    info->setProperty("aToBConnected", abConnected);

    // Attempt B→A (should fail — would create cycle)
    bool baConnected = graph.connect(b, 0, a, 0);
    info->setProperty("bToARejected", !baConnected);

    // After failed attempt, graph has only A→B — no actual cycle
    info->setProperty("hasCycleAfterRejected", graph.hasCycle());

    // Compile should succeed (no cycle in the graph)
    auto runtime = dsp_primitives::compileGraphRuntime(graph, kSampleRate, kBlockSize, kChannels);
    info->setProperty("compilationSuccess", runtime != nullptr);

    // Now directly inject a cycle to test hasCycle() independently
    b->addOutputConnection(a, 0, 0);
    info->setProperty("hasCycleWithDirectCycle", graph.hasCycle());
    // Clean up the direct cycle
    a->removeAllConnections();
    b->removeAllConnections();

    // Self-connection rejection
    std::string selfError;
    bool selfValid = graph.validateConnection(a, a, selfError);
    info->setProperty("selfConnectionRejected", !selfValid);

    // Validate connection failure for non-registered node
    auto orphan = std::make_shared<dsp_primitives::PassthroughNode>();
    std::string orphanError;
    bool orphanValid = graph.validateConnection(orphan, a, orphanError);
    info->setProperty("orphanNodeRejected", !orphanValid);

    return juce::var(info);
}

juce::var runRoleGatingTest() {
    auto* info = new juce::DynamicObject();

    // Pattern: PassthroughNode(input) → PassthroughNode(Monitor role)
    auto input   = std::make_shared<dsp_primitives::PassthroughNode>();
    auto monitor = std::make_shared<dsp_primitives::PassthroughNode>();

    dsp_primitives::PrimitiveGraph graph;
    graph.registerNode(input);
    graph.registerNode(monitor);
    graph.connect(input, 0, monitor, 0);
    graph.setNodeRole(monitor, dsp_primitives::PrimitiveGraph::NodeRole::Monitor);

    auto runtime = dsp_primitives::compileGraphRuntime(graph, kSampleRate, kBlockSize, kChannels);
    info->setProperty("compilationSuccess", runtime != nullptr);
    if (!runtime || !runtime->isValid()) {
        info->setProperty("outputMetrics", metricsToVar(OutputMetrics{}));
        return juce::var(info);
    }

    const auto sine = generateSine(kTestFreq, kTestAmp, kBlockSize);

    // Phase 1: Monitor enabled → output should match input
    runtime->setMonitorEnabled(true);
    const auto enabledMetrics = processAndMeasure(*runtime, sine, kWarmup + kMeasure);
    info->setProperty("monitorEnabled", metricsToVar(enabledMetrics));

    // Phase 2: Monitor disabled → output should be silence
    runtime->setMonitorEnabled(false);
    const auto disabledMetrics = processAndMeasure(*runtime, sine, kMeasure);
    info->setProperty("monitorDisabled", metricsToVar(disabledMetrics));

    // Phase 3: Monitor re-enabled → output should return
    runtime->setMonitorEnabled(true);
    const auto reEnabledMetrics = processAndMeasure(*runtime, sine, kWarmup + kMeasure);
    info->setProperty("monitorReEnabled", metricsToVar(reEnabledMetrics));

    return juce::var(info);
}

juce::var runStateContinuityTest() {
    auto* info = new juce::DynamicObject();

    // Pattern: PassthroughNode(input) → StereoDelayNode → PassthroughNode(OutputDSP)
    // Phase 1: Process impulse through delay → fills delay buffer
    // Phase 2: Recompile (same graph, same node instances)
    // Phase 3: Process silence → delay tail should appear (buffer survived recompile)
    auto input = std::make_shared<dsp_primitives::PassthroughNode>();
    auto delay = std::make_shared<dsp_primitives::StereoDelayNode>();
    auto output = std::make_shared<dsp_primitives::PassthroughNode>();

    delay->setFeedback(0.5f);
    delay->setTimeL(100.0f);   // 100ms left channel
    delay->setTimeR(150.0f);   // 150ms right channel
    delay->setMix(1.0f);       // 100% wet
    delay->setTimeMode(dsp_primitives::StereoDelayNode::TimeMode::Free);

    dsp_primitives::PrimitiveGraph graph;
    graph.registerNode(input);
    graph.registerNode(delay);
    graph.registerNode(output);
    graph.connect(input, 0, delay, 0);
    graph.connect(delay, 0, output, 0);
    graph.setNodeRole(output, dsp_primitives::PrimitiveGraph::NodeRole::OutputDSP);

    // Phase 1: Compile first runtime and process impulse to fill delay buffer
    auto runtimeA = dsp_primitives::compileGraphRuntime(graph, kSampleRate, kBlockSize, kChannels);
    info->setProperty("compilationSuccess", runtimeA != nullptr);
    if (!runtimeA || !runtimeA->isValid()) {
        info->setProperty("isValid", false);
        return juce::var(info);
    }
    info->setProperty("isValid", true);

    // Fill delay buffer with impulse blocks
    const auto impulse = generateImpulse(1.0f, kBlockSize);
    // Need enough blocks to fill both delay lines: 150ms @ 44.1kHz = ~6615 samples = ~13 blocks
    const int fillBlocks = 20;
    const auto fillMetrics = processAndMeasure(*runtimeA, impulse, fillBlocks);
    info->setProperty("fillMetrics", metricsToVar(fillMetrics));

    // Phase 2: Recompile — same graph, same node instances
    auto runtimeB = dsp_primitives::compileGraphRuntime(graph, kSampleRate, kBlockSize, kChannels);
    info->setProperty("recompileSuccess", runtimeB != nullptr);
    if (!runtimeB || !runtimeB->isValid()) {
        info->setProperty("recompiledValid", false);
        return juce::var(info);
    }

    // Phase 3: Process silence — if state survived, delay tail should be audible
    const auto silence = generateSilence(kBlockSize);
    const auto silenceMetrics = processAndMeasure(*runtimeB, silence, kWarmup + kMeasure);
    info->setProperty("silenceAfterRecompile", metricsToVar(silenceMetrics));

    // For reference: process silence through a fresh graph (no delay buffer) to show diff
    auto input2 = std::make_shared<dsp_primitives::PassthroughNode>();
    auto delay2 = std::make_shared<dsp_primitives::StereoDelayNode>();
    auto output2 = std::make_shared<dsp_primitives::PassthroughNode>();
    delay2->setFeedback(0.5f);
    delay2->setTimeL(100.0f);
    delay2->setTimeR(150.0f);
    delay2->setMix(1.0f);
    delay2->setTimeMode(dsp_primitives::StereoDelayNode::TimeMode::Free);

    dsp_primitives::PrimitiveGraph freshGraph;
    freshGraph.registerNode(input2);
    freshGraph.registerNode(delay2);
    freshGraph.registerNode(output2);
    freshGraph.connect(input2, 0, delay2, 0);
    freshGraph.connect(delay2, 0, output2, 0);
    freshGraph.setNodeRole(output2, dsp_primitives::PrimitiveGraph::NodeRole::OutputDSP);

    auto freshRuntime = dsp_primitives::compileGraphRuntime(freshGraph, kSampleRate, kBlockSize, kChannels);
    if (freshRuntime && freshRuntime->isValid()) {
        const auto freshSilenceMetrics = processAndMeasure(*freshRuntime, silence, kWarmup + kMeasure);
        info->setProperty("freshSilenceMetrics", metricsToVar(freshSilenceMetrics));
        info->setProperty("statePreserved",
            silenceMetrics.peakL > freshSilenceMetrics.peakL * 1.1f);
    } else {
        info->setProperty("freshSilenceMetrics", metricsToVar(OutputMetrics{}));
        info->setProperty("statePreserved", false);
    }

    return juce::var(info);
}

// ============================================================================
// Main
// ============================================================================

} // anonymous namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    auto* root = new juce::DynamicObject();
    auto* metadata = new juce::DynamicObject();
    metadata->setProperty("testGraphCount", 8);
    metadata->setProperty("exitCode", 0);
    root->setProperty("metadata", juce::var(metadata));

    auto* testGraphs = new juce::DynamicObject();

    // Run all test cases
    int failed = 0;

    auto runTest = [&](const char* name, auto&& fn) {
        try {
            testGraphs->setProperty(name, fn());
        } catch (const std::exception& e) {
            std::fprintf(stderr, "FAIL: %s threw: %s\n", name, e.what());
            auto* err = new juce::DynamicObject();
            err->setProperty("error", e.what());
            testGraphs->setProperty(name, juce::var(err));
            ++failed;
        } catch (...) {
            std::fprintf(stderr, "FAIL: %s threw unknown exception\n", name);
            auto* err = new juce::DynamicObject();
            err->setProperty("error", "unknown exception");
            testGraphs->setProperty(name, juce::var(err));
            ++failed;
        }
    };

    runTest("emptyGraph",             runEmptyGraphTest);
    runTest("singlePassthrough",      runSinglePassthroughTest);
    runTest("passthroughChain",       runPassthroughChainTest);
    runTest("gainFilterChain",        runGainFilterChainTest);
    runTest("branchMix",              runBranchMixTest);
    runTest("cycleDetection",         runCycleDetectionTest);
    runTest("roleGating",             runRoleGatingTest);
    runTest("stateContinuity",        runStateContinuityTest);

    metadata->setProperty("failed", failed);
    root->setProperty("metadata", juce::var(metadata));
    root->setProperty("testGraphs", juce::var(testGraphs));

    const auto contractStr = juce::JSON::toString(juce::var(root), true).toStdString();

    if (opts.mode == HarnessOptions::Print) {
        std::printf("%s\n", contractStr.c_str());
    } else if (opts.mode == HarnessOptions::Write) {
        std::ofstream out(opts.contractPath);
        if (!out.is_open()) {
            std::fprintf(stderr, "ERROR: cannot write to %s\n",
                         opts.contractPath.c_str());
            return 1;
        }
        out << contractStr;
        std::fprintf(stdout, "Wrote graph runtime contract to %s (%zu bytes)\n",
                     opts.contractPath.c_str(), contractStr.size());
    } else if (opts.mode == HarnessOptions::Verify) {
        if (!verifyContract(contractStr, opts.contractPath)) {
            return 1;
        }
    }

    return failed > 0 ? 1 : 0;
}
