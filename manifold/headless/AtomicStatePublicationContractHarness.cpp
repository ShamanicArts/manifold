#include "ContractHarnessUtils.h"

#include "../primitives/control/ControlServer.h"

#include <condition_variable>
#include <mutex>
#include <thread>

#include <juce_core/juce_core.h>

namespace {

using namespace contract_harness_utils;

struct ProjectionSummary {
    double tempo = 0.0;
    int activeLayer = -1;
    int forwardArmed = 0;
    double forwardBars = 0.0;
    juce::String selectedLayerState;
};

void seedSnapshotA(AtomicState& state) {
    state.tempo.store(120.0f, std::memory_order_relaxed);
    state.activeLayer.store(1, std::memory_order_relaxed);
    state.forwardArmed.store(false, std::memory_order_relaxed);
    state.forwardBars.store(0.0f, std::memory_order_relaxed);
    for (int i = 0; i < AtomicState::MAX_LAYERS; ++i) {
        auto& layer = state.layers[i];
        layer.state.store(static_cast<int>(i == 1 ? 1 : 0), std::memory_order_relaxed);
        layer.length.store(1000 + i, std::memory_order_relaxed);
        layer.playheadPos.store(10 + i, std::memory_order_relaxed);
        layer.speed.store(1.0f, std::memory_order_relaxed);
        layer.reversed.store(false, std::memory_order_relaxed);
        layer.volume.store(1.0f, std::memory_order_relaxed);
        layer.numBars.store(1.0f, std::memory_order_relaxed);
        layer.muted.store(false, std::memory_order_relaxed);
    }
}

ProjectionSummary readProjectionSummary(ControlServer& server) {
    ProjectionSummary summary;
    const auto parsed = juce::JSON::parse(server.getStateJson());
    const auto params = parsed.getProperty("params", juce::var());
    const auto* paramsObj = params.getDynamicObject();
    if (paramsObj == nullptr) {
        return summary;
    }

    summary.tempo = static_cast<double>(paramsObj->getProperty("/core/behavior/tempo"));
    summary.activeLayer = static_cast<int>(paramsObj->getProperty("/core/behavior/layer"));
    summary.forwardArmed = static_cast<int>(paramsObj->getProperty("/core/behavior/forwardArmed"));
    summary.forwardBars = static_cast<double>(paramsObj->getProperty("/core/behavior/forwardBars"));
    const juce::String selectedLayerPath = "/core/behavior/layer/" + juce::String(summary.activeLayer) + "/state";
    summary.selectedLayerState = paramsObj->getProperty(selectedLayerPath).toString();
    return summary;
}

juce::var toVar(const ProjectionSummary& summary) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("tempo", summary.tempo);
    obj->setProperty("activeLayer", summary.activeLayer);
    obj->setProperty("forwardArmed", summary.forwardArmed);
    obj->setProperty("forwardBars", summary.forwardBars);
    obj->setProperty("selectedLayerState", summary.selectedLayerState);
    return juce::var(obj);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    ControlServer server;
    auto& state = server.getAtomicState();
    seedSnapshotA(state);

    std::mutex phaseMutex;
    std::condition_variable phaseCv;
    int phase = 0;

    std::thread writer([&]() {
        {
            std::unique_lock<std::mutex> lock(phaseMutex);
            phaseCv.wait(lock, [&]() { return phase == 1; });
        }

        state.tempo.store(155.0f, std::memory_order_relaxed);
        state.activeLayer.store(3, std::memory_order_relaxed);
        state.forwardArmed.store(true, std::memory_order_relaxed);

        {
            std::lock_guard<std::mutex> lock(phaseMutex);
            phase = 2;
        }
        phaseCv.notify_all();

        {
            std::unique_lock<std::mutex> lock(phaseMutex);
            phaseCv.wait(lock, [&]() { return phase == 3; });
        }

        state.forwardBars.store(4.0f, std::memory_order_relaxed);
        state.layers[3].state.store(2, std::memory_order_relaxed);
        state.layers[3].length.store(4096, std::memory_order_relaxed);
        state.layers[3].numBars.store(4.0f, std::memory_order_relaxed);

        {
            std::lock_guard<std::mutex> lock(phaseMutex);
            phase = 4;
        }
        phaseCv.notify_all();
    });

    const auto initial = readProjectionSummary(server);

    {
        std::lock_guard<std::mutex> lock(phaseMutex);
        phase = 1;
    }
    phaseCv.notify_all();

    {
        std::unique_lock<std::mutex> lock(phaseMutex);
        phaseCv.wait(lock, [&]() { return phase == 2; });
    }
    const auto mid = readProjectionSummary(server);

    {
        std::lock_guard<std::mutex> lock(phaseMutex);
        phase = 3;
    }
    phaseCv.notify_all();

    {
        std::unique_lock<std::mutex> lock(phaseMutex);
        phaseCv.wait(lock, [&]() { return phase == 4; });
    }
    const auto final = readProjectionSummary(server);

    writer.join();

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);
    root->setProperty("initial", toVar(initial));
    root->setProperty("midTransition", toVar(mid));
    root->setProperty("final", toVar(final));

    auto* invariants = new juce::DynamicObject();
    invariants->setProperty("initialIsSnapshotA",
                            initial.tempo == 120.0 &&
                                initial.activeLayer == 1 &&
                                initial.forwardArmed == 0 &&
                                initial.forwardBars == 0.0 &&
                                initial.selectedLayerState == "playing");
    invariants->setProperty("midShowsPartialPublication",
                            mid.tempo == 155.0 &&
                                mid.activeLayer == 3 &&
                                mid.forwardArmed == 1 &&
                                mid.forwardBars == 0.0 &&
                                mid.selectedLayerState == "empty");
    invariants->setProperty("finalIsSnapshotB",
                            final.tempo == 155.0 &&
                                final.activeLayer == 3 &&
                                final.forwardArmed == 1 &&
                                final.forwardBars == 4.0 &&
                                final.selectedLayerState == "recording");
    root->setProperty("invariants", juce::var(invariants));

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    return finishJsonContract(opts, "AtomicStatePublication contract", contract);
}
