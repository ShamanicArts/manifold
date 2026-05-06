#include "ContractHarnessUtils.h"

#include "../core/BehaviorParamSupport.h"

#include <juce_core/juce_core.h>

namespace {

using namespace contract_harness_utils;
using namespace manifold::behavior_param_support;

struct ApplyContext {
    ControlServer cs;
    std::atomic<double> sampleRate{48000.0};
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

    bool apply(const std::string& path, float value) { return
        applyParamPath(
            path, value, 8, cs, sampleRate, linkSync, graphEnabled,
            dspScriptHost, forwardScheduled, forwardFireAtSample,
            forwardScheduledBars,
            [this]() { ++scheduleCount; },
            [this, thisPtr = this]() -> float {
                const auto& s = thisPtr->cs.getAtomicState();
                const float cached = s.samplesPerBar.load(std::memory_order_relaxed);
                if (cached > 0.0f) return cached;
                const float tempo = s.tempo.load(std::memory_order_relaxed);
                if (tempo <= 0.0f) return 0.0f;
                return static_cast<float>(
                    (48000.0 * 240.0) / tempo);
            });
    }
};

void addStateSnapshot(juce::DynamicObject* obj, const ControlServer& cs,
                      const std::string& prefix) {
    auto& state = const_cast<ControlServer&>(cs).getAtomicState();
    obj->setProperty(juce::Identifier(prefix + "tempo"), state.tempo.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "targetBPM"), state.targetBPM.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "volume"), state.masterVolume.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "inputVolume"), state.inputVolume.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "passthrough"), state.passthroughEnabled.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "recording"), state.isRecording.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "overdub"), state.overdubEnabled.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "layer"), state.activeLayer.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "recordMode"), state.recordMode.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "forwardArmed"), state.forwardArmed.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "forwardBars"), state.forwardBars.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "commitCount"), state.commitCount.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "graphEnabled"), state.graphEnabled.load(std::memory_order_relaxed));
}

void addLayerSnapshot(juce::DynamicObject* obj, const ControlServer& cs,
                      int idx, const std::string& prefix) {
    auto& state = const_cast<ControlServer&>(cs).getAtomicState();
    auto& ls = state.layers[idx];
    obj->setProperty(juce::Identifier(prefix + "state"), ls.state.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "volume"), ls.volume.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "speed"), ls.speed.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "reversed"), ls.reversed.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "muted"), ls.muted.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "length"), ls.length.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "playheadPos"), ls.playheadPos.load(std::memory_order_relaxed));
    obj->setProperty(juce::Identifier(prefix + "numBars"), ls.numBars.load(std::memory_order_relaxed));
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
    // Domain 1: computeSamplesPerBar – pure function
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        obj->setProperty("normal", computeSamplesPerBar(120.0f, 48000.0));
        obj->setProperty("zeroTempo", computeSamplesPerBar(0.0f, 48000.0));
        obj->setProperty("negativeTempo", computeSamplesPerBar(-10.0f, 48000.0));
        obj->setProperty("zeroSampleRate", computeSamplesPerBar(120.0f, 0.0));
        root->setProperty("computeSamplesPerBar", juce::var(obj));
    }

    // =====================================================================
    // Domain 2: extractLayerParam – path parsing
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        int layerIdx = -1;
        std::string suffix;

        // normal match
        obj->setProperty("normalMatch",
            extractLayerParam("/core/behavior/layer/0/volume", 8, layerIdx, suffix));
        obj->setProperty("normalLayerIdx", layerIdx);
        obj->setProperty("normalSuffix", juce::var(suffix));

        // manifold prefix
        layerIdx = -1; suffix.clear();
        obj->setProperty("manifoldPrefix",
            extractLayerParam("/manifold/layer/3/mute", 8, layerIdx, suffix));
        obj->setProperty("manifoldLayerIdx", layerIdx);
        obj->setProperty("manifoldSuffix", juce::var(suffix));

        // dsp prefix
        layerIdx = -1; suffix.clear();
        obj->setProperty("dspPrefix",
            extractLayerParam("/dsp/manifold/layer/1/speed", 8, layerIdx, suffix));
        obj->setProperty("dspLayerIdx", layerIdx);
        obj->setProperty("dspSuffix", juce::var(suffix));

        // out of range layer
        layerIdx = -1; suffix.clear();
        obj->setProperty("outOfRange",
            extractLayerParam("/core/behavior/layer/99/volume", 8, layerIdx, suffix));

        // no slash after index
        layerIdx = -1; suffix.clear();
        obj->setProperty("noSlashAfterIdx",
            extractLayerParam("/core/behavior/layer/0", 8, layerIdx, suffix));

        // unknown prefix
        layerIdx = -1; suffix.clear();
        obj->setProperty("unknownPrefix",
            extractLayerParam("/foo/layer/0/volume", 8, layerIdx, suffix));

        root->setProperty("extractLayerParam", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: clearForwardSchedule
    // =====================================================================
    {
        bool scheduled = true;
        double fireAt = 1234.0;
        float bars = 2.5f;
        clearForwardSchedule(scheduled, fireAt, bars);
        auto* obj = new juce::DynamicObject();
        obj->setProperty("scheduled", scheduled);
        obj->setProperty("fireAt", fireAt);
        obj->setProperty("bars", bars);
        root->setProperty("clearForwardSchedule", juce::var(obj));
    }

    // =====================================================================
    // Domain 4: applyParamPath – core behavior paths
    // =====================================================================
    {
        ApplyContext ctx;
        auto* obj = new juce::DynamicObject();

        // tempo
        ctx.apply("/core/behavior/tempo", 140.0f);
        addStateSnapshot(obj, ctx.cs, "tempo_");
        obj->setProperty("tempo_scheduleCount", ctx.scheduleCount);

        // targetBPM (fresh context to avoid state carry-over)
        ApplyContext ctx2;
        ctx2.apply("/core/behavior/targetbpm", 130.0f);
        addStateSnapshot(obj, ctx2.cs, "targetbpm_");

        // volume
        ApplyContext ctx3;
        ctx3.apply("/core/behavior/volume", 1.5f);
        addStateSnapshot(obj, ctx3.cs, "vol_");

        // inputVolume
        ApplyContext ctx4;
        ctx4.apply("/core/behavior/inputVolume", 0.75f);
        addStateSnapshot(obj, ctx4.cs, "inputVol_");

        // passthrough disable
        ApplyContext ctx5;
        ctx5.apply("/core/behavior/passthrough", 0.0f);
        addStateSnapshot(obj, ctx5.cs, "passthrough_");

        // layer select
        ApplyContext ctx6;
        ctx6.apply("/core/behavior/layer", 3);
        addStateSnapshot(obj, ctx6.cs, "layer_");

        // mode
        ApplyContext ctx7;
        ctx7.apply("/core/behavior/mode", 2);
        addStateSnapshot(obj, ctx7.cs, "mode_");

        // graph enabled
        ApplyContext ctx8;
        ctx8.apply("/core/behavior/graph/enabled", 1.0f);
        addStateSnapshot(obj, ctx8.cs, "graph_");

        // link
        ApplyContext ctx9;
        ctx9.apply("/core/behavior/link/enabled", 1.0f);
        ctx9.apply("/core/behavior/link/tempoSync", 1.0f);
        ctx9.apply("/core/behavior/link/startStopSync", 1.0f);
        addStateSnapshot(obj, ctx.cs, "targetbpm_");

        // volume
        ctx.apply("/core/behavior/volume", 1.5f);
        addStateSnapshot(obj, ctx.cs, "vol_");

        // inputVolume
        ctx.apply("/core/behavior/inputVolume", 0.75f);
        addStateSnapshot(obj, ctx.cs, "inputVol_");

        // passthrough disable
        ctx.apply("/core/behavior/passthrough", 0.0f);
        addStateSnapshot(obj, ctx.cs, "passthrough_");

        // layer select
        ctx.apply("/core/behavior/layer", 3);
        addStateSnapshot(obj, ctx.cs, "layer_");

        // mode
        ctx.apply("/core/behavior/mode", 2);
        addStateSnapshot(obj, ctx.cs, "mode_");

        // graph enabled
        ctx.apply("/core/behavior/graph/enabled", 1.0f);
        addStateSnapshot(obj, ctx.cs, "graph_");

        // link
        ctx.apply("/core/behavior/link/enabled", 1.0f);
        ctx.apply("/core/behavior/link/tempoSync", 1.0f);
        ctx.apply("/core/behavior/link/startStopSync", 1.0f);

        root->setProperty("applyCoreParams", juce::var(obj));
    }

    // =====================================================================
    // Domain 5: applyParamPath – recording + forward + commit
    // =====================================================================
    {
        ApplyContext ctx;
        auto* obj = new juce::DynamicObject();

        // recording on
        ctx.apply("/core/behavior/recording", 1.0f);
        addLayerSnapshot(obj, ctx.cs, 0, "recOn_");

        // overdub
        ctx.apply("/core/behavior/overdub", 1.0f);
        addStateSnapshot(obj, ctx.cs, "overdub_");

        // forward armed
        ctx.apply("/core/behavior/forwardArmed", 1.0f);
        addStateSnapshot(obj, ctx.cs, "fwdArmed_");

        // forward bars
        ctx.apply("/core/behavior/forwardBars", 4.0f);
        addStateSnapshot(obj, ctx.cs, "fwdBars_");

        // forward
        ctx.apply("/core/behavior/forward", 2.0f);
        addStateSnapshot(obj, ctx.cs, "forward_");

        // commit (with scheduled forward cleared)
        ctx.apply("/core/behavior/commit", 1.0f);
        addLayerSnapshot(obj, ctx.cs, 0, "commit_");

        // recording off
        ctx.apply("/core/behavior/recording", 0.0f);
        obj->setProperty("recOff_forwardArmed",
            ctx.cs.getAtomicState().forwardArmed.load(std::memory_order_relaxed));

        root->setProperty("applyRecordingAndCommit", juce::var(obj));
    }

    // =====================================================================
    // Domain 6: applyParamPath – transport
    // =====================================================================
    {
        ApplyContext ctx;
        auto* obj = new juce::DynamicObject();

        // set all layers to playing first then transport=2 (pause)
        ctx.apply("/core/behavior/transport", 1.0f);
        obj->setProperty("transport_play_state0",
            ctx.cs.getAtomicState().layers[0].state.load(std::memory_order_relaxed));

        ctx.apply("/core/behavior/transport", 2.0f);
        obj->setProperty("transport_pause_state0",
            ctx.cs.getAtomicState().layers[0].state.load(std::memory_order_relaxed));

        ctx.apply("/core/behavior/transport", 0.0f);
        obj->setProperty("transport_stop_state0",
            ctx.cs.getAtomicState().layers[0].state.load(std::memory_order_relaxed));

        root->setProperty("transport", juce::var(obj));
    }

    // =====================================================================
    // Domain 7: applyParamPath – layer sub-params
    // =====================================================================
    {
        ApplyContext ctx;
        auto* obj = new juce::DynamicObject();

        ctx.apply("/core/behavior/layer/0/volume", 1.2f);
        obj->setProperty("layer0_volume",
            ctx.cs.getAtomicState().layers[0].volume.load(std::memory_order_relaxed));

        ctx.apply("/core/behavior/layer/0/speed", -2.0f);
        obj->setProperty("layer0_speed",
            ctx.cs.getAtomicState().layers[0].speed.load(std::memory_order_relaxed));

        ctx.apply("/core/behavior/layer/0/reverse", 1.0f);
        obj->setProperty("layer0_reverse",
            ctx.cs.getAtomicState().layers[0].reversed.load(std::memory_order_relaxed));

        ctx.apply("/core/behavior/layer/0/mute", 1.0f);
        obj->setProperty("layer0_mute",
            ctx.cs.getAtomicState().layers[0].muted.load(std::memory_order_relaxed));

        ctx.apply("/core/behavior/layer/0/play", 0.0f);
        obj->setProperty("layer0_play",
            ctx.cs.getAtomicState().layers[0].state.load(std::memory_order_relaxed));

        ctx.apply("/core/behavior/layer/0/pause", 0.0f);
        obj->setProperty("layer0_pause",
            ctx.cs.getAtomicState().layers[0].state.load(std::memory_order_relaxed));

        ctx.apply("/core/behavior/layer/0/stop", 0.0f);
        obj->setProperty("layer0_stop",
            ctx.cs.getAtomicState().layers[0].state.load(std::memory_order_relaxed));

        ctx.apply("/core/behavior/layer/0/clear", 0.0f);
        obj->setProperty("layer0_clear_len",
            ctx.cs.getAtomicState().layers[0].length.load(std::memory_order_relaxed));
        obj->setProperty("layer0_clear_state",
            ctx.cs.getAtomicState().layers[0].state.load(std::memory_order_relaxed));

        // seek within committed layer
        ctx.apply("/core/behavior/commit", 8.0f);
        ctx.apply("/core/behavior/layer/0/seek", 0.5f); // 50%
        obj->setProperty("layer0_seek",
            ctx.cs.getAtomicState().layers[0].playheadPos.load(std::memory_order_relaxed));

        root->setProperty("applyLayerSubParams", juce::var(obj));
    }

    // =====================================================================
    // Domain 8: applyParamPath – unknown path
    // =====================================================================
    {
        ApplyContext ctx;
        auto* obj = new juce::DynamicObject();
        const bool result = ctx.apply("/core/behavior/unknown", 1.0f);
        obj->setProperty("unknownPathResult", result);
        root->setProperty("unknownPath", juce::var(obj));
    }

    // =====================================================================
    // Domain 9: readCoreParamPath – default values
    // =====================================================================
    {
        ControlServer cs;
        std::atomic<bool> graphEnabled{false};
        LinkSync linkSync;
        linkSync.initialise(48000.0);
        std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>> emptySlots;

        auto* obj = new juce::DynamicObject();
        obj->setProperty("tempo",
            readCoreParamPath("/core/behavior/tempo", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("targetbpm",
            readCoreParamPath("/core/behavior/targetbpm", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("volume",
            readCoreParamPath("/core/behavior/volume", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("inputVolume",
            readCoreParamPath("/core/behavior/inputVolume", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("passthrough",
            readCoreParamPath("/core/behavior/passthrough", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("recording",
            readCoreParamPath("/core/behavior/recording", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("overdub",
            readCoreParamPath("/core/behavior/overdub", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("layer",
            readCoreParamPath("/core/behavior/layer", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("forwardArmed",
            readCoreParamPath("/core/behavior/forwardArmed", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("forwardBars",
            readCoreParamPath("/core/behavior/forwardBars", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("mode",
            readCoreParamPath("/core/behavior/mode", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("graphEnabled",
            readCoreParamPath("/core/behavior/graph/enabled", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("linkEnabled",
            readCoreParamPath("/core/behavior/link/enabled", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("linkTempoSync",
            readCoreParamPath("/core/behavior/link/tempoSync", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("linkStartStopSync",
            readCoreParamPath("/core/behavior/link/startStopSync", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("linkPeers",
            readCoreParamPath("/core/behavior/link/peers", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("linkPhase",
            readCoreParamPath("/core/behavior/link/phase", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        // link/playing/beat may vary depending on link sync state
        obj->setProperty("linkPlaying",
            readCoreParamPath("/core/behavior/link/playing", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));

        // unknown path
        obj->setProperty("unknownPath",
            readCoreParamPath("/core/behavior/nonexistent", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));

        root->setProperty("readCoreParams", juce::var(obj));
    }

    // =====================================================================
    // Domain 10: readCoreParamPath – layer sub-params
    // =====================================================================
    {
        ControlServer cs;
        std::atomic<bool> graphEnabled{false};
        LinkSync linkSync;
        linkSync.initialise(48000.0);
        std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>> emptySlots;

        auto* obj = new juce::DynamicObject();
        obj->setProperty("layer0_volume",
            readCoreParamPath("/core/behavior/layer/0/volume", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("layer0_speed",
            readCoreParamPath("/core/behavior/layer/0/speed", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("layer0_reverse",
            readCoreParamPath("/core/behavior/layer/0/reverse", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("layer0_mute",
            readCoreParamPath("/core/behavior/layer/0/mute", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("layer0_length",
            readCoreParamPath("/core/behavior/layer/0/length", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));
        obj->setProperty("layer0_position",
            readCoreParamPath("/core/behavior/layer/0/position", 8, cs, graphEnabled, linkSync, nullptr, emptySlots));

        root->setProperty("readLayerParams", juce::var(obj));
    }

    // =====================================================================
    // Domain 11: hasCoreEndpoint
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        OSCEndpointRegistry registry;
        std::unordered_map<std::string, std::unique_ptr<DSPPluginScriptHost>> emptySlots;

        obj->setProperty("graphEnabled",
            hasCoreEndpoint("/core/behavior/graph/enabled", registry, nullptr, emptySlots));
        obj->setProperty("linkPrefix",
            hasCoreEndpoint("/core/behavior/link/tempo", registry, nullptr, emptySlots));
        obj->setProperty("unknown",
            hasCoreEndpoint("/core/behavior/nonexistent", registry, nullptr, emptySlots));
        obj->setProperty("withNullHostAndUnknown",
            hasCoreEndpoint("/dsp/unknown", registry, nullptr, emptySlots));

        root->setProperty("hasCoreEndpoint", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    return finishJsonContract(opts, "BehaviorParamSupport contract", contract);
}
