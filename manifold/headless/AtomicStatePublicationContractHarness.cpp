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

void seedSnapshotA(ControlServer& server) {
    auto controlState = controlStateView(server);
    auto runtimeTelemetry = runtimeTelemetryView(server);
    controlState.setTempo(120.0f);
    runtimeTelemetry.setTempo(120.0f);
    controlState.setActiveLayer(1);
    controlState.setForwardArmed(false);
    controlState.setForwardBars(0.0f);
    for (int i = 0; i < manifold::BehaviorControlState::MAX_LAYERS; ++i) {
        runtimeTelemetry.setLayerState(i, static_cast<int>(i == 1 ? 1 : 0));
        runtimeTelemetry.setLayerLength(i, 1000 + i);
        runtimeTelemetry.setLayerPlayheadPos(i, 10 + i);
        controlState.setLayerSpeed(i, 1.0f);
        controlState.setLayerReversed(i, false);
        controlState.setLayerVolume(i, 1.0f);
        runtimeTelemetry.setLayerNumBars(i, 1.0f);
        controlState.setLayerMuted(i, false);
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
    seedSnapshotA(server);

    std::mutex phaseMutex;
    std::condition_variable phaseCv;
    int phase = 0;

    std::thread writer([&]() {
        {
            std::unique_lock<std::mutex> lock(phaseMutex);
            phaseCv.wait(lock, [&]() { return phase == 1; });
        }

        auto controlState = controlStateView(server);
        auto runtimeTelemetry = runtimeTelemetryView(server);
        controlState.setTempo(155.0f);
        runtimeTelemetry.setTempo(155.0f);
        controlState.setActiveLayer(3);
        controlState.setForwardArmed(true);

        {
            std::lock_guard<std::mutex> lock(phaseMutex);
            phase = 2;
        }
        phaseCv.notify_all();

        {
            std::unique_lock<std::mutex> lock(phaseMutex);
            phaseCv.wait(lock, [&]() { return phase == 3; });
        }

        controlState.setForwardBars(4.0f);
        runtimeTelemetry.setLayerState(3, 2);
        runtimeTelemetry.setLayerLength(3, 4096);
        runtimeTelemetry.setLayerNumBars(3, 4.0f);

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
