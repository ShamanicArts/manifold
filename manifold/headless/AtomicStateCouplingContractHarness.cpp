#include "ContractHarnessUtils.h"

#include "../core/BehaviorHousekeepingSupport.h"
#include "../core/BehaviorParamSupport.h"

#include <juce_core/juce_core.h>

namespace {

using namespace contract_harness_utils;
using namespace manifold::behavior_housekeeping_support;
using namespace manifold::behavior_param_support;

struct ApplyContext {
    ControlServer controlServer;
    std::atomic<double> sampleRate{48000.0};
    std::atomic<double> playTimeSamples{10000.0};
    LinkSync linkSync;
    std::atomic<bool> graphEnabled{false};
    DSPPluginScriptHost* dspScriptHost = nullptr;
    bool forwardScheduled = false;
    double forwardFireAtSample = 0.0;
    float forwardScheduledBars = 0.0f;
    int scheduleCount = 0;

    ApplyContext() {
        linkSync.initialise(48000.0);
    }

    bool apply(const std::string& path, float value) {
        return applyParamPath(
            path,
            value,
            8,
            controlServer,
            sampleRate,
            linkSync,
            graphEnabled,
            dspScriptHost,
            forwardScheduled,
            forwardFireAtSample,
            forwardScheduledBars,
            [this]() { ++scheduleCount; },
            [this]() -> float {
                const auto& state = controlServer.getAtomicState();
                const float cached = state.samplesPerBar.load(std::memory_order_relaxed);
                if (cached > 0.0f) {
                    return cached;
                }
                const float tempo = state.tempo.load(std::memory_order_relaxed);
                if (tempo <= 0.0f) {
                    return 0.0f;
                }
                return static_cast<float>((sampleRate.load(std::memory_order_relaxed) * 240.0) / tempo);
            });
    }
};

juce::var stateSummary(const AtomicState& state) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("tempo", state.tempo.load(std::memory_order_relaxed));
    obj->setProperty("samplesPerBar", state.samplesPerBar.load(std::memory_order_relaxed));
    obj->setProperty("isRecording", state.isRecording.load(std::memory_order_relaxed));
    obj->setProperty("overdubEnabled", state.overdubEnabled.load(std::memory_order_relaxed));
    obj->setProperty("forwardArmed", state.forwardArmed.load(std::memory_order_relaxed));
    obj->setProperty("forwardBars", state.forwardBars.load(std::memory_order_relaxed));
    obj->setProperty("activeLayer", state.activeLayer.load(std::memory_order_relaxed));
    obj->setProperty("recordMode", state.recordMode.load(std::memory_order_relaxed));
    obj->setProperty("graphEnabled", state.graphEnabled.load(std::memory_order_relaxed));
    obj->setProperty("commitCount", state.commitCount.load(std::memory_order_relaxed));
    return juce::var(obj);
}

juce::var layerSummary(const AtomicLayerState& layer) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("state", layer.state.load(std::memory_order_relaxed));
    obj->setProperty("length", layer.length.load(std::memory_order_relaxed));
    obj->setProperty("playheadPos", layer.playheadPos.load(std::memory_order_relaxed));
    obj->setProperty("speed", layer.speed.load(std::memory_order_relaxed));
    obj->setProperty("reversed", layer.reversed.load(std::memory_order_relaxed));
    obj->setProperty("volume", layer.volume.load(std::memory_order_relaxed));
    obj->setProperty("numBars", layer.numBars.load(std::memory_order_relaxed));
    obj->setProperty("muted", layer.muted.load(std::memory_order_relaxed));
    return juce::var(obj);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // =====================================================================
    // Domain 1: tempo write also updates samplesPerBar
    // =====================================================================
    {
        ApplyContext ctx;
        auto* obj = new juce::DynamicObject();
        obj->setProperty("applyResult", ctx.apply("/core/behavior/tempo", 150.0f));
        const auto& state = ctx.controlServer.getAtomicState();
        obj->setProperty("tempo", state.tempo.load(std::memory_order_relaxed));
        obj->setProperty("samplesPerBar", state.samplesPerBar.load(std::memory_order_relaxed));
        obj->setProperty("expectedSamplesPerBar", computeSamplesPerBar(150.0f, 48000.0));
        obj->setProperty("scheduleCount", ctx.scheduleCount);
        root->setProperty("tempoUpdatesSamplesPerBar", juce::var(obj));
    }

    // =====================================================================
    // Domain 2: recording acts on the selected active layer
    // =====================================================================
    {
        ApplyContext ctx;
        auto* obj = new juce::DynamicObject();
        ctx.apply("/core/behavior/layer", 3.0f);
        obj->setProperty("recordingApplyResult", ctx.apply("/core/behavior/recording", 1.0f));

        const auto& state = ctx.controlServer.getAtomicState();
        obj->setProperty("state", stateSummary(state));
        obj->setProperty("selectedLayer", layerSummary(state.layers[3]));
        obj->setProperty("layer0", layerSummary(state.layers[0]));
        obj->setProperty("expectedRecordingState", static_cast<int>(ScriptableLayerState::Recording));
        obj->setProperty("scheduleCount", ctx.scheduleCount);
        root->setProperty("recordingUsesActiveLayer", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: stopping recording clears forward-commit state
    // =====================================================================
    {
        ApplyContext ctx;
        auto* obj = new juce::DynamicObject();
        ctx.apply("/core/behavior/forward", 2.5f);
        ctx.apply("/core/behavior/recording", 1.0f);
        obj->setProperty("recordingOffApplyResult", ctx.apply("/core/behavior/recording", 0.0f));
        obj->setProperty("state", stateSummary(ctx.controlServer.getAtomicState()));
        obj->setProperty("forwardScheduled", ctx.forwardScheduled);
        obj->setProperty("forwardFireAtSample", ctx.forwardFireAtSample);
        obj->setProperty("forwardScheduledBars", ctx.forwardScheduledBars);
        root->setProperty("recordingOffClearsForward", juce::var(obj));
    }

    // =====================================================================
    // Domain 4: commit uses the currently selected layer and resets forward state
    // =====================================================================
    {
        ApplyContext ctx;
        auto* obj = new juce::DynamicObject();
        ctx.apply("/core/behavior/layer", 2.0f);
        ctx.apply("/core/behavior/forward", 1.5f);
        obj->setProperty("commitApplyResult", ctx.apply("/core/behavior/commit", 1.25f));

        const auto& state = ctx.controlServer.getAtomicState();
        obj->setProperty("state", stateSummary(state));
        obj->setProperty("selectedLayer", layerSummary(state.layers[2]));
        obj->setProperty("otherLayer", layerSummary(state.layers[1]));
        obj->setProperty("expectedLength", static_cast<int>(1.25f * 96000.0f));
        obj->setProperty("expectedBars", 1.25f);
        obj->setProperty("expectedPlayingState", static_cast<int>(ScriptableLayerState::Playing));
        root->setProperty("commitUsesActiveLayer", juce::var(obj));
    }

    // =====================================================================
    // Domain 5: forward fields are read together by housekeeping scheduling
    // =====================================================================
    {
        ApplyContext ctx;
        auto* obj = new juce::DynamicObject();
        ctx.apply("/core/behavior/forward", 2.0f);
        scheduleForwardCommitIfNeeded(
            ctx.controlServer,
            ctx.playTimeSamples,
            ctx.forwardScheduled,
            ctx.forwardFireAtSample,
            ctx.forwardScheduledBars);

        const auto& state = ctx.controlServer.getAtomicState();
        obj->setProperty("state", stateSummary(state));
        obj->setProperty("forwardScheduled", ctx.forwardScheduled);
        obj->setProperty("forwardFireAtSample", ctx.forwardFireAtSample);
        obj->setProperty("forwardScheduledBars", ctx.forwardScheduledBars);
        obj->setProperty("expectedFireAt", 10000.0 + 2.0 * 96000.0);
        root->setProperty("forwardSchedulingCoupling", juce::var(obj));
    }

    // =====================================================================
    // Domain 6: per-layer param writes stay local to the selected layer endpoint
    // =====================================================================
    {
        ApplyContext ctx;
        auto* obj = new juce::DynamicObject();
        obj->setProperty("speedApplyResult", ctx.apply("/core/behavior/layer/4/speed", -2.0f));
        obj->setProperty("muteApplyResult", ctx.apply("/core/behavior/layer/4/mute", 1.0f));
        const auto& state = ctx.controlServer.getAtomicState();
        obj->setProperty("layer4", layerSummary(state.layers[4]));
        obj->setProperty("layer3", layerSummary(state.layers[3]));
        root->setProperty("layerParamLocality", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    return finishJsonContract(opts, "AtomicStateCoupling contract", contract);
}
