// Old C++ graph-runtime reconstruction of the Lua FX slot's Delay/BitCrusher switch.
// The old checkout is included and linked read-only; no Lua is loaded here.
#include "dsp/core/nodes/ChorusNode.h"
#include "dsp/core/nodes/GainNode.h"
#include "dsp/core/nodes/MixerNode.h"
#include "dsp/core/nodes/BitCrusherNode.h"
#include "dsp/core/nodes/PassthroughNode.h"
#include "dsp/core/nodes/StereoDelayNode.h"
#include "manifold/primitives/scripting/GraphRuntime.h"
#include "manifold/primitives/scripting/PrimitiveGraph.h"

#include <algorithm>
#include <array>
#include <cmath>
#include <cstdio>
#include <fstream>
#include <memory>

namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode::
    this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept = default;
template<>
void FloatVectorOperationsBase<float, int>::clear(float* dst, int count) noexcept { std::fill_n(dst, count, 0.0f); }
template<>
void FloatVectorOperationsBase<float, int>::copy(float* dst, const float* src, int count) noexcept { std::copy_n(src, count, dst); }
template<>
void FloatVectorOperationsBase<float, int>::copyWithMultiply(float* dst, const float* src, float gain, int count) noexcept {
    for (int index = 0; index < count; ++index) dst[index] = src[index] * gain;
}
template<>
void FloatVectorOperationsBase<float, int>::addWithMultiply(float* dst, const float* src, float gain, int count) noexcept {
    for (int index = 0; index < count; ++index) dst[index] += src[index] * gain;
}
}

using dsp_primitives::ChorusNode;
using dsp_primitives::GainNode;
using dsp_primitives::GraphRuntime;
using dsp_primitives::IPrimitiveNode;
using dsp_primitives::MixerNode;
using dsp_primitives::BitCrusherNode;
using dsp_primitives::PassthroughNode;
using dsp_primitives::PrimitiveGraph;
using dsp_primitives::StereoDelayNode;

template<typename Node>
static std::shared_ptr<Node> registerNode(PrimitiveGraph& graph, std::shared_ptr<Node> node) {
    graph.registerNode(node);
    return node;
}

static void connect(PrimitiveGraph& graph, std::shared_ptr<IPrimitiveNode> source,
                    std::shared_ptr<IPrimitiveNode> destination, int destinationInput = 0) {
    if (!graph.connect(source, 0, destination, destinationInput)) throw 2;
}

static std::unique_ptr<GraphRuntime> compile(PrimitiveGraph& graph, const GraphRuntime* previous = nullptr) {
    auto runtime = graph.compileRuntime(48000, 128, 2, previous);
    if (!runtime || !runtime->isValid()) throw 3;
    return runtime;
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
    try {
        PrimitiveGraph graph;
        auto input = registerNode(graph, std::make_shared<PassthroughNode>());
        auto dry = registerNode(graph, std::make_shared<GainNode>(2));
        auto wetMixer = registerNode(graph, std::make_shared<MixerNode>(-1));
        auto trim = registerNode(graph, std::make_shared<GainNode>(2));
        auto output = registerNode(graph, std::make_shared<MixerNode>(-1));
        auto chorus = registerNode(graph, std::make_shared<ChorusNode>());
        auto chorusGate = registerNode(graph, std::make_shared<GainNode>(2));
        for (const auto& gain : {dry, trim, chorusGate}) gain->overrideHighwayImplementationTarget(-1);
        chorus->setRate(1.24f); chorus->setDepth(0.525f); chorus->setVoices(3);
        chorus->setSpread(0.6f); chorus->setFeedback(0.07f); chorus->setWaveform(0); chorus->setMix(1);
        dry->setGain(1); trim->setGain(0); chorusGate->setGain(1);
        output->setInputCount(2);
        wetMixer->setInputCount(1);
        connect(graph, input, dry);
        connect(graph, dry, output, 0);
        connect(graph, wetMixer, trim);
        connect(graph, trim, output, 2);
        connect(graph, input, chorus);
        connect(graph, chorus, chorusGate);
        connect(graph, chorusGate, wetMixer, 0);
        graph.setNodeRole(output, PrimitiveGraph::NodeRole::OutputDSP);
        auto runtime = compile(graph);

        // Lua has already created Chorus by default. Delay is first selected now.
        auto delay = registerNode(graph, std::make_shared<StereoDelayNode>());
        auto delayGate = registerNode(graph, std::make_shared<GainNode>(2));
        delayGate->overrideHighwayImplementationTarget(-1);
        delay->setTempo(120); delay->setTimeMode(StereoDelayNode::TimeMode::Free);
        delay->setTimeL(40); delay->setTimeR(60); delay->setFeedback(0.552f);
        delay->setFeedbackCrossfeed(0.12f); delay->setFilterEnabled(false);
        delay->setFilterCutoff(4200); delay->setFilterResonance(0.5f); delay->setMix(1);
        delay->setPingPong(true); delay->setWidth(1); delay->setFreeze(false); delay->setDucking(0);
        delayGate->setGain(0);
        wetMixer->setInputCount(9);
        connect(graph, input, delay);
        connect(graph, delay, delayGate);
        connect(graph, delayGate, wetMixer, 16);
        chorusGate->setGain(0); delayGate->setGain(1);
        dry->setGain(0); trim->setGain(1.1f);
        runtime = compile(graph, runtime.get());
        std::printf("select_delay_first_visit_transfers=%d\n", runtime->getExplicitContinuityTransferCount());

        std::shared_ptr<GainNode> crusherGate;
        std::shared_ptr<BitCrusherNode> crusher;
        std::ofstream capture(argv[1], std::ios::binary);
        if (!capture) return 2;
        for (int offset = 0; offset < 32768; offset += 128) {
            if (offset == 8192) {
                crusher = registerNode(graph, std::make_shared<BitCrusherNode>());
                crusherGate = registerNode(graph, std::make_shared<GainNode>(2));
                crusherGate->overrideHighwayImplementationTarget(-1);
                crusher->setBits(6); crusher->setRateReduction(9);
                crusher->setMix(1); crusher->setOutput(1.2125f); crusher->setLogicMode(0);
                crusherGate->setGain(1);
                connect(graph, input, crusher);
                connect(graph, crusher, crusherGate);
                wetMixer->setInputCount(13);
                connect(graph, crusherGate, wetMixer, 24);
                chorusGate->setGain(0); delayGate->setGain(0); trim->setGain(1.0f);
                runtime = compile(graph, runtime.get());
                std::printf("select_bitcrusher_transfers=%d\n", runtime->getExplicitContinuityTransferCount());
            }
            if (offset == 11008) {
                crusherGate->setGain(0);
                delayGate->setGain(1); trim->setGain(1.1f);
                runtime = compile(graph, runtime.get());
                std::printf("reselect_delay_transfers=%d\n", runtime->getExplicitContinuityTransferCount());
            }
            if (offset == 11520) {
                crusherGate->setGain(1); delayGate->setGain(0); trim->setGain(1.0f);
                runtime = compile(graph, runtime.get());
                std::printf("reselect_bitcrusher_transfers=%d\n", runtime->getExplicitContinuityTransferCount());
            }
            juce::AudioBuffer<float> block(2, 128);
            for (int frame = 0; frame < 128; ++frame) {
                block.setSample(0, frame, inputSample(offset + frame, 0));
                block.setSample(1, frame, inputSample(offset + frame, 1));
            }
            runtime->process(block);
            for (int frame = 0; frame < 128; ++frame) {
                const std::array<float, 2> sample{block.getSample(0, frame), block.getSample(1, frame)};
                capture.write(reinterpret_cast<const char*>(sample.data()), sizeof(sample));
            }
        }
        return capture ? 0 : 2;
    } catch (...) {
        std::fputs("old FX runtime graph failed\n", stderr);
        return 1;
    }
}
