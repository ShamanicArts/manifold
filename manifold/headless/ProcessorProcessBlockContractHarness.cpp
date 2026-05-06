#include "../../manifold/core/BehaviorCoreProcessor.h"
#include "../../manifold/primitives/control/OSCSettingsPersistence.h"
#include "../../manifold/primitives/scripting/GraphRuntime.h"
#include "../../manifold/primitives/scripting/PrimitiveGraph.h"
#include "../../dsp/core/nodes/PassthroughNode.h"

#include "ContractHarnessUtils.h"

#include <juce_audio_basics/juce_audio_basics.h>
#include <juce_core/juce_core.h>
#include <juce_events/juce_events.h>

#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <string>
#include <vector>

namespace {

using namespace contract_harness_utils;

constexpr double kSampleRate = 44100.0;
constexpr int kBlockSize = 64;
constexpr int kChannels = 2;
constexpr float kInputSample = 0.5f;
constexpr const char* kSandboxRoot = "/tmp/manifold_processor_process_block_contract";

struct AudioSnapshot {
    double firstL = 0.0;
    double firstR = 0.0;
    double lastL = 0.0;
    double lastR = 0.0;
    double rmsL = 0.0;
    double rmsR = 0.0;
    double maxAbsL = 0.0;
    double maxAbsR = 0.0;
};

void configureSandbox() {
    auto sandboxRoot = juce::File(kSandboxRoot);
    sandboxRoot.deleteRecursively();
    sandboxRoot.createDirectory();

    auto homeDir = sandboxRoot.getChildFile("home");
    auto xdgConfigDir = sandboxRoot.getChildFile("xdg_config");
    auto manifoldConfigDir = xdgConfigDir.getChildFile("Manifold");
    homeDir.createDirectory();
    xdgConfigDir.createDirectory();
    manifoldConfigDir.createDirectory();

    if (setenv("HOME", homeDir.getFullPathName().toRawUTF8(), 1) != 0) {
        std::perror("setenv HOME");
        std::exit(2);
    }
    if (setenv("XDG_CONFIG_HOME", xdgConfigDir.getFullPathName().toRawUTF8(), 1) != 0) {
        std::perror("setenv XDG_CONFIG_HOME");
        std::exit(2);
    }

    OSCSettings oscSettings;
    oscSettings.oscEnabled = false;
    oscSettings.oscQueryEnabled = false;
    if (!OSCSettingsPersistence::save(oscSettings)) {
        std::fprintf(stderr, "FAIL: could not save sandbox OSC settings\n");
        std::exit(2);
    }
}

BehaviorCoreProcessor& makePreparedProcessor(std::vector<BehaviorCoreProcessor*>& owned) {
    auto* processor = new BehaviorCoreProcessor();
    processor->prepareToPlay(kSampleRate, kBlockSize);
    owned.push_back(processor);
    return *processor;
}

juce::AudioBuffer<float> makeConstantBuffer(float sampleValue) {
    juce::AudioBuffer<float> buffer(kChannels, kBlockSize);
    for (int ch = 0; ch < kChannels; ++ch) {
        buffer.clear(ch, 0, kBlockSize);
        buffer.applyGain(ch, 0, kBlockSize, 0.0f);
        auto* out = buffer.getWritePointer(ch);
        for (int i = 0; i < kBlockSize; ++i) {
            out[i] = sampleValue;
        }
    }
    return buffer;
}

AudioSnapshot captureAudioSnapshot(const juce::AudioBuffer<float>& buffer) {
    AudioSnapshot snapshot;
    const auto* left = buffer.getReadPointer(0);
    const auto* right = buffer.getNumChannels() > 1 ? buffer.getReadPointer(1) : left;
    double sumSqL = 0.0;
    double sumSqR = 0.0;
    double maxL = 0.0;
    double maxR = 0.0;
    for (int i = 0; i < buffer.getNumSamples(); ++i) {
        const double l = static_cast<double>(left[i]);
        const double r = static_cast<double>(right[i]);
        sumSqL += l * l;
        sumSqR += r * r;
        maxL = std::max(maxL, std::abs(l));
        maxR = std::max(maxR, std::abs(r));
    }
    snapshot.firstL = static_cast<double>(left[0]);
    snapshot.firstR = static_cast<double>(right[0]);
    snapshot.lastL = static_cast<double>(left[buffer.getNumSamples() - 1]);
    snapshot.lastR = static_cast<double>(right[buffer.getNumSamples() - 1]);
    snapshot.rmsL = std::sqrt(sumSqL / static_cast<double>(buffer.getNumSamples()));
    snapshot.rmsR = std::sqrt(sumSqR / static_cast<double>(buffer.getNumSamples()));
    snapshot.maxAbsL = maxL;
    snapshot.maxAbsR = maxR;
    return snapshot;
}

juce::var toVar(const AudioSnapshot& snapshot) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("firstL", snapshot.firstL);
    obj->setProperty("firstR", snapshot.firstR);
    obj->setProperty("lastL", snapshot.lastL);
    obj->setProperty("lastR", snapshot.lastR);
    obj->setProperty("rmsL", snapshot.rmsL);
    obj->setProperty("rmsR", snapshot.rmsR);
    obj->setProperty("maxAbsL", snapshot.maxAbsL);
    obj->setProperty("maxAbsR", snapshot.maxAbsR);
    return juce::var(obj);
}

juce::var vectorToVar(const std::vector<float>& values) {
    juce::Array<juce::var> array;
    for (const auto value : values) {
        array.add(static_cast<double>(value));
    }
    return juce::var(array);
}

juce::var atomicStateToVar(const AtomicState& state) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("graphEnabled", state.graphEnabled.load(std::memory_order_relaxed));
    obj->setProperty("masterVolume", state.masterVolume.load(std::memory_order_relaxed));
    obj->setProperty("inputVolume", state.inputVolume.load(std::memory_order_relaxed));
    obj->setProperty("passthroughEnabled", state.passthroughEnabled.load(std::memory_order_relaxed));
    obj->setProperty("captureLevel", static_cast<double>(state.captureLevel.load(std::memory_order_relaxed)));
    obj->setProperty("captureWritePos", state.captureWritePos.load(std::memory_order_relaxed));
    obj->setProperty("playTime", state.playTime.load(std::memory_order_relaxed));
    obj->setProperty("uptimeSeconds", state.uptimeSeconds.load(std::memory_order_relaxed));
    return juce::var(obj);
}

int countMidiEvents(const juce::MidiBuffer& midi) {
    int count = 0;
    for (const auto metadata : midi) {
        juce::ignoreUnused(metadata);
        ++count;
    }
    return count;
}

juce::var captureMidiSnapshot(const juce::MidiBuffer& midi) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("eventCount", countMidiEvents(midi));

    int index = 0;
    for (const auto metadata : midi) {
        const auto message = metadata.getMessage();
        obj->setProperty("firstStatus", message.getRawDataSize() > 0 ? static_cast<int>(message.getRawData()[0]) : -1);
        obj->setProperty("firstNote", message.isNoteOnOrOff() ? message.getNoteNumber() : -1);
        obj->setProperty("firstSamplePosition", metadata.samplePosition);
        break;
    }
    if (index == 0 && countMidiEvents(midi) == 0) {
        obj->setProperty("firstStatus", -1);
        obj->setProperty("firstNote", -1);
        obj->setProperty("firstSamplePosition", -1);
    }
    return juce::var(obj);
}

std::unique_ptr<dsp_primitives::GraphRuntime> makeOutputPassthroughRuntime() {
    auto input = std::make_shared<dsp_primitives::PassthroughNode>();
    dsp_primitives::PrimitiveGraph graph;
    graph.registerNode(input);
    graph.setNodeRole(input, dsp_primitives::PrimitiveGraph::NodeRole::OutputDSP);
    return dsp_primitives::compileGraphRuntime(graph, kSampleRate, kBlockSize, kChannels);
}

juce::var runNoGraphPassthroughCase(std::vector<BehaviorCoreProcessor*>& owned) {
    auto* obj = new juce::DynamicObject();
    auto& processor = makePreparedProcessor(owned);
    processor.setParamByPath("/core/behavior/graph/enabled", 0.0f);
    processor.setParamByPath("/core/behavior/volume", 0.25f);
    processor.setParamByPath("/core/behavior/inputVolume", 0.5f);
    processor.setParamByPath("/core/behavior/passthrough", 1.0f);

    auto buffer = makeConstantBuffer(kInputSample);
    juce::MidiBuffer midi;
    processor.processBlock(buffer, midi);

    obj->setProperty("output", toVar(captureAudioSnapshot(buffer)));
    obj->setProperty("state", atomicStateToVar(processor.getControlServer().getAtomicState()));
    obj->setProperty("playTimeSamples", processor.getPlayTimeSamples());
    obj->setProperty("dspScriptLoaded", processor.isDspScriptLoaded());
    return juce::var(obj);
}

juce::var runMutedCaptureCase(std::vector<BehaviorCoreProcessor*>& owned) {
    auto* obj = new juce::DynamicObject();
    auto& processor = makePreparedProcessor(owned);
    processor.setParamByPath("/core/behavior/graph/enabled", 0.0f);
    processor.setParamByPath("/core/behavior/inputVolume", 0.5f);
    processor.setParamByPath("/core/behavior/passthrough", 0.0f);

    auto buffer = makeConstantBuffer(kInputSample);
    juce::MidiBuffer midi;
    processor.processBlock(buffer, midi);

    std::vector<float> capturePeaks;
    const bool peaksOk = processor.computeCapturePeaks(0, kBlockSize, 1, capturePeaks);

    obj->setProperty("output", toVar(captureAudioSnapshot(buffer)));
    obj->setProperty("state", atomicStateToVar(processor.getControlServer().getAtomicState()));
    obj->setProperty("capturePeaksOk", peaksOk);
    obj->setProperty("capturePeaks", vectorToVar(capturePeaks));
    return juce::var(obj);
}

juce::var runGraphRuntimeMixCase(std::vector<BehaviorCoreProcessor*>& owned) {
    auto* obj = new juce::DynamicObject();
    auto& processor = makePreparedProcessor(owned);
    auto runtime = makeOutputPassthroughRuntime();
    obj->setProperty("runtimeCompiled", runtime != nullptr && runtime->isValid());
    if (runtime == nullptr || !runtime->isValid()) {
        obj->setProperty("output", toVar(AudioSnapshot{}));
        return juce::var(obj);
    }

    processor.setParamByPath("/core/behavior/inputVolume", 0.5f);
    processor.setParamByPath("/core/behavior/volume", 0.25f);
    processor.setParamByPath("/core/behavior/passthrough", 0.0f);
    processor.setGraphProcessingEnabled(true);
    processor.requestGraphRuntimeSwap(std::move(runtime));

    auto buffer = makeConstantBuffer(kInputSample);
    juce::MidiBuffer midi;
    processor.processBlock(buffer, midi);

    obj->setProperty("output", toVar(captureAudioSnapshot(buffer)));
    obj->setProperty("state", atomicStateToVar(processor.getControlServer().getAtomicState()));
    obj->setProperty("playTimeSamples", processor.getPlayTimeSamples());
    return juce::var(obj);
}

juce::var runMidiThruCase(std::vector<BehaviorCoreProcessor*>& owned) {
    auto* obj = new juce::DynamicObject();

    {
        auto& processor = makePreparedProcessor(owned);
        processor.setParamByPath("/core/behavior/graph/enabled", 0.0f);
        auto buffer = makeConstantBuffer(0.0f);
        juce::MidiBuffer midi;
        midi.addEvent(juce::MidiMessage::noteOn(1, 60, static_cast<juce::uint8>(100)), 0);
        processor.processBlock(buffer, midi);
        obj->setProperty("thruOff", captureMidiSnapshot(midi));
    }

    {
        auto& processor = makePreparedProcessor(owned);
        processor.setParamByPath("/core/behavior/graph/enabled", 0.0f);
        processor.setMidiThruEnabled(true);
        auto buffer = makeConstantBuffer(0.0f);
        juce::MidiBuffer midi;
        midi.addEvent(juce::MidiMessage::noteOn(1, 60, static_cast<juce::uint8>(100)), 0);
        processor.processBlock(buffer, midi);
        obj->setProperty("thruOn", captureMidiSnapshot(midi));
    }

    return juce::var(obj);
}

juce::var runPlayTimeCase(std::vector<BehaviorCoreProcessor*>& owned) {
    auto* obj = new juce::DynamicObject();
    auto& processor = makePreparedProcessor(owned);
    processor.setParamByPath("/core/behavior/graph/enabled", 0.0f);
    processor.setParamByPath("/core/behavior/passthrough", 0.0f);

    for (int i = 0; i < 3; ++i) {
        auto buffer = makeConstantBuffer(0.0f);
        juce::MidiBuffer midi;
        processor.processBlock(buffer, midi);
    }

    obj->setProperty("playTimeSamples", processor.getPlayTimeSamples());
    obj->setProperty("state", atomicStateToVar(processor.getControlServer().getAtomicState()));
    obj->setProperty("sampleRate", processor.getSampleRate());
    return juce::var(obj);
}

std::string buildContract() {
    std::vector<BehaviorCoreProcessor*> ownedProcessors;
    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);
    root->setProperty("sampleRate", kSampleRate);
    root->setProperty("blockSize", kBlockSize);
    root->setProperty("inputSample", static_cast<double>(kInputSample));
    root->setProperty("noGraphPassthrough", runNoGraphPassthroughCase(ownedProcessors));
    root->setProperty("mutedCapture", runMutedCaptureCase(ownedProcessors));
    root->setProperty("graphRuntimeMix", runGraphRuntimeMixCase(ownedProcessors));
    root->setProperty("midiThru", runMidiThruCase(ownedProcessors));
    root->setProperty("playTime", runPlayTimeCase(ownedProcessors));
    return juce::JSON::toString(juce::var(root), true).toStdString();
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions options;
    if (!parseOptions(argc, argv, options)) {
        return 1;
    }

    configureSandbox();
    juce::ScopedJuceInitialiser_GUI juceInit;

    const auto contract = buildContract();
    const int exitCode = finishJsonContract(options,
                                            "processor processBlock contract",
                                            contract);
    std::fflush(stdout);
    std::fflush(stderr);
    std::_Exit(exitCode);
}
