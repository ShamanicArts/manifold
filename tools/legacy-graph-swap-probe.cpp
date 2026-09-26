// Read-only source probe of the old PrimitiveGraph → GraphRuntime swap path.
#include "dsp/core/nodes/GainNode.h"
#include "dsp/core/nodes/PassthroughNode.h"
#include "dsp/core/nodes/StereoDelayNode.h"
#include "manifold/primitives/scripting/GraphRuntime.h"
#include "manifold/primitives/scripting/PrimitiveGraph.h"

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <memory>

namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode::
    this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept = default;
template<>
void FloatVectorOperationsBase<float, int>::clear(float* destination, int count) noexcept {
    std::fill_n(destination, count, 0.0f);
}
template<>
void FloatVectorOperationsBase<float, int>::copy(float* destination, const float* source, int count) noexcept {
    std::copy_n(source, count, destination);
}
template<>
void FloatVectorOperationsBase<float, int>::copyWithMultiply(float* destination, const float* source,
                                                              float multiplier, int count) noexcept {
    for (int index = 0; index < count; ++index) destination[index] = source[index] * multiplier;
}
template<>
void FloatVectorOperationsBase<float, int>::addWithMultiply(float* destination, const float* source,
                                                             float multiplier, int count) noexcept {
    for (int index = 0; index < count; ++index) destination[index] += source[index] * multiplier;
}
}

using dsp_primitives::GainNode;
using dsp_primitives::GraphRuntime;
using dsp_primitives::PassthroughNode;
using dsp_primitives::PrimitiveGraph;
using dsp_primitives::StereoDelayNode;

static std::unique_ptr<GraphRuntime> compile(PrimitiveGraph& graph, const GraphRuntime* previous = nullptr) {
    auto runtime = graph.compileRuntime(48000, 128, 2, previous);
    if (!runtime || !runtime->isValid()) throw 1;
    return runtime;
}

static float sample(GraphRuntime& runtime, float value) {
    juce::AudioBuffer<float> buffer(2, 128);
    for (int channel = 0; channel < 2; ++channel) {
        for (int frame = 0; frame < 128; ++frame) buffer.setSample(channel, frame, value);
    }
    runtime.process(buffer);
    return buffer.getSample(0, 0);
}

static float delayTail(GraphRuntime& runtime, int blocks, bool impulse) {
    float peak = 0.0f;
    for (int block = 0; block < blocks; ++block) {
        juce::AudioBuffer<float> buffer(2, 128);
        buffer.clear();
        if (impulse && block == 0) buffer.setSample(0, 0, 0.7f);
        runtime.process(buffer);
        for (int frame = 0; frame < 128; ++frame) peak = std::max(peak, std::abs(buffer.getSample(0, frame)));
    }
    return peak;
}

int main() {
    try {
        PrimitiveGraph graph;
        auto input = std::make_shared<PassthroughNode>();
        auto gate = std::make_shared<GainNode>(2);
        auto output = std::make_shared<PassthroughNode>();
        gate->overrideHighwayImplementationTarget(-1);
        gate->setGain(0.0f);
        for (auto node : {std::static_pointer_cast<dsp_primitives::IPrimitiveNode>(input),
                          std::static_pointer_cast<dsp_primitives::IPrimitiveNode>(gate),
                          std::static_pointer_cast<dsp_primitives::IPrimitiveNode>(output)}) graph.registerNode(node);
        graph.connect(input, 0, gate, 0);
        graph.connect(gate, 0, output, 0);
        graph.setNodeRole(output, PrimitiveGraph::NodeRole::OutputDSP);
        auto runtime = compile(graph);
        const float closed = sample(*runtime, 1.0f);
        gate->setGain(1.0f);
        const float smoothOpen = sample(*runtime, 1.0f);
        auto rebuilt = compile(graph, runtime.get());
        const float afterReprepare = sample(*rebuilt, 1.0f);
        std::printf("gate_closed_first=%.9g\ngate_smooth_first=%.9g\ngate_after_reprepare_first=%.9g\n",
                    closed, smoothOpen, afterReprepare);

        PrimitiveGraph delayGraph;
        auto delayInput = std::make_shared<PassthroughNode>();
        auto delay = std::make_shared<StereoDelayNode>();
        auto delayOutput = std::make_shared<PassthroughNode>();
        delay->setTempo(120); delay->setTimeMode(StereoDelayNode::TimeMode::Free);
        delay->setTimeL(40); delay->setTimeR(60); delay->setFeedback(0.552f);
        delay->setFeedbackCrossfeed(0.12f); delay->setFilterEnabled(false);
        delay->setMix(1); delay->setPingPong(true); delay->setWidth(1);
        delayGraph.registerNode(delayInput);
        delayGraph.registerNode(delay);
        delayGraph.registerNode(delayOutput);
        delayGraph.connect(delayInput, 0, delay, 0);
        delayGraph.connect(delay, 0, delayOutput, 0);
        delayGraph.setNodeRole(delayOutput, PrimitiveGraph::NodeRole::OutputDSP);
        auto delayRuntime = compile(delayGraph);
        const float beforeSwapPeak = delayTail(*delayRuntime, 20, true);
        auto sameTopology = compile(delayGraph, delayRuntime.get());
        const float sameTail = delayTail(*sameTopology, 16, false);
        std::printf("before_swap_tail_peak=%.9g\nsame_topology_transfers=%d\nsame_topology_tail_peak=%.9g\n",
                    beforeSwapPeak, sameTopology->getExplicitContinuityTransferCount(), sameTail);

        auto inserted = std::make_shared<GainNode>(2);
        inserted->overrideHighwayImplementationTarget(-1);
        inserted->setGain(1);
        delayGraph.registerNode(inserted);
        delayGraph.disconnect(delayInput, 0, delay, 0);
        delayGraph.connect(delayInput, 0, inserted, 0);
        delayGraph.connect(inserted, 0, delay, 0);
        auto changedTopology = compile(delayGraph, sameTopology.get());
        const float changedTail = delayTail(*changedTopology, 16, false);
        std::printf("changed_topology_transfers=%d\nchanged_topology_tail_peak=%.9g\n",
                    changedTopology->getExplicitContinuityTransferCount(), changedTail);
    } catch (...) {
        std::fputs("graph runtime probe failed\n", stderr);
        return 1;
    }
}
