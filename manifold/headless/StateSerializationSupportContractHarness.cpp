#include "ContractHarnessUtils.h"

#include "../core/BehaviorCoreProcessor.h"
#include "../core/StateSerializationSupport.h"

#include <sol/sol.hpp>

#include <algorithm>
#include <cstdio>
#include <cstdlib>
#include <mutex>
#include <unordered_map>
#include <vector>

namespace {

using namespace contract_harness_utils;
using namespace manifold::state_serialization;

bool containsPath(const std::vector<std::string>& paths, const std::string& target) {
    return std::find(paths.begin(), paths.end(), target) != paths.end();
}

juce::var stringVectorToVar(const std::vector<std::string>& values) {
    juce::Array<juce::var> out;
    for (const auto& value : values) {
        out.add(juce::String(value));
    }
    return juce::var(out);
}

void seedProcessor(BehaviorCoreProcessor& processor) {
    auto& state = processor.getControlServer().getAtomicState();
    state.tempo.store(133.5f);
    state.targetBPM.store(127.25f);
    state.samplesPerBar.store(88200.0f);
    state.sampleRate.store(44100.0);
    state.captureSize.store(4096);
    state.isRecording.store(true);
    state.overdubEnabled.store(false);
    state.forwardArmed.store(true);
    state.forwardBars.store(1.5f);
    state.activeLayer.store(2);
    state.masterVolume.store(0.78f);
    state.inputVolume.store(0.55f);
    state.passthroughEnabled.store(false);
    state.playTime.store(2048.0);
    state.commitCount.store(9);

    for (int i = 0; i < BehaviorCoreProcessor::MAX_LAYERS; ++i) {
        auto& layer = state.layers[i];
        layer.length.store(1000 + i * 200);
        layer.playheadPos.store(100 + i * 40);
        layer.speed.store(1.0f + 0.1f * static_cast<float>(i));
        layer.reversed.store((i % 2) == 1);
        layer.volume.store(0.9f - 0.1f * static_cast<float>(i));
        layer.numBars.store(2.0f + 0.5f * static_cast<float>(i));
        layer.state.store(i == 0 ? 1 : i == 1 ? 2 : i == 2 ? 5 : 0);
        layer.muted.store(false);
    }

    processor.setLinkEnabled(true);
    processor.setLinkTempoSyncEnabled(false);
    processor.setLinkStartStopSyncEnabled(true);
    processor.requestLinkTempo(142.0);
    processor.processLinkPendingRequests();
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    juce::ScopedJuceInitialiser_GUI juceInit;
    BehaviorCoreProcessor processor;
    processor.getControlServer().start(&processor);
    processor.prepareToPlay(44100.0, 512);
    seedProcessor(processor);

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // =====================================================================
    // Domain 1: helper strings and path extraction
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        juce::Array<juce::var> layerStates;
        layerStates.add(toLayerStateString(ScriptableLayerState::Empty));
        layerStates.add(toLayerStateString(ScriptableLayerState::Playing));
        layerStates.add(toLayerStateString(ScriptableLayerState::Recording));
        layerStates.add(toLayerStateString(ScriptableLayerState::Overdubbing));
        layerStates.add(toLayerStateString(ScriptableLayerState::Muted));
        layerStates.add(toLayerStateString(ScriptableLayerState::Stopped));
        layerStates.add(toLayerStateString(ScriptableLayerState::Paused));
        layerStates.add(toLayerStateString(ScriptableLayerState::Unknown));
        obj->setProperty("layerStateStrings", juce::var(layerStates));

        juce::Array<juce::var> recordModes;
        recordModes.add(toRecordModeString(0));
        recordModes.add(toRecordModeString(1));
        recordModes.add(toRecordModeString(2));
        recordModes.add(toRecordModeString(3));
        recordModes.add(toRecordModeString(99));
        obj->setProperty("recordModeStrings", juce::var(recordModes));

        std::string suffix;
        obj->setProperty("extractCoreBehaviorTempo", extractBehaviorSuffix("/core/behavior/tempo", suffix));
        obj->setProperty("coreBehaviorTempoSuffix", juce::String(suffix));
        obj->setProperty("extractManifoldTempo", extractBehaviorSuffix("/manifold/tempo", suffix));
        obj->setProperty("manifoldTempoSuffix", juce::String(suffix));
        obj->setProperty("extractUnknown", extractBehaviorSuffix("/not/known", suffix));

        int layerIndex = -1;
        std::string layerSuffix;
        obj->setProperty("extractLayerPath", extractLayerParamForStatePath("/core/behavior/layer/2/speed", layerIndex, layerSuffix));
        obj->setProperty("layerIndex", layerIndex);
        obj->setProperty("layerSuffix", juce::String(layerSuffix));
        obj->setProperty("extractBadLayerPath", extractLayerParamForStatePath("/core/behavior/layer/99/speed", layerIndex, layerSuffix));

        root->setProperty("helpers", juce::var(obj));
    }

    // =====================================================================
    // Domain 2: serialized entry / map aliases
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        const auto entries = buildSerializedStateEntries(processor);
        const auto stateMap = buildSerializedStateMap(processor);

        obj->setProperty("entryCount", static_cast<int>(entries.size()));
        obj->setProperty("tempoCore", juce::String(stateMap.at("/core/behavior/tempo")));
        obj->setProperty("tempoManifold", juce::String(stateMap.at("/manifold/tempo")));
        obj->setProperty("tempoDsp", juce::String(stateMap.at("/dsp/manifold/tempo")));
        obj->setProperty("modeCore", juce::String(stateMap.at("/core/behavior/mode")));
        obj->setProperty("layer2State", juce::String(stateMap.at("/core/behavior/layer/2/state")));
        obj->setProperty("layer0Speed", juce::String(stateMap.at("/core/behavior/layer/0/speed")));
        obj->setProperty("linkEnabled", juce::String(stateMap.at("/core/behavior/link/enabled")));
        obj->setProperty("spectrumPrefix", juce::String(stateMap.at("/core/behavior/spectrum").substr(0, 24)));
        root->setProperty("serializedMap", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: Lua full + incremental serialization
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        sol::state lua;
        lua.open_libraries(sol::lib::base, sol::lib::package, sol::lib::table, sol::lib::math, sol::lib::string);
        serializeStateToLua(lua, processor);

        sol::table state = lua["state"];
        sol::table params = state["params"];
        sol::table voices = state["voices"];
        sol::table link = state["link"];

        obj->setProperty("projectionVersion", state["projectionVersion"].get_or(0));
        obj->setProperty("numVoices", state["numVoices"].get_or(0));
        obj->setProperty("tempo", params["/core/behavior/tempo"].get_or(0.0));
        obj->setProperty("layerValue", params["/core/behavior/layer"].get_or(-1));
        obj->setProperty("voice1State", juce::String(voices[1]["state"].get_or(std::string{})));
        obj->setProperty("linkEnabled", link["enabled"].get_or(false));
        obj->setProperty("linkTempoSync", link["tempoSync"].get_or(false));

        auto& atomicState = processor.getControlServer().getAtomicState();
        atomicState.tempo.store(145.0f);
        atomicState.activeLayer.store(1);
        atomicState.layers[0].speed.store(1.75f);

        serializeStateToLuaIncremental(
            lua,
            processor,
            {"/core/behavior/tempo", "/core/behavior/layer", "/core/behavior/layer/0/speed"});

        sol::table stateAfter = lua["state"];
        sol::table paramsAfter = stateAfter["params"];
        obj->setProperty("tempoAfterIncremental", paramsAfter["/core/behavior/tempo"].get_or(0.0));
        obj->setProperty("layerAfterIncremental", paramsAfter["/core/behavior/layer"].get_or(-1));
        obj->setProperty("layer0SpeedAfterIncremental", paramsAfter["/core/behavior/layer/0/speed"].get_or(0.0));
        root->setProperty("luaSerialization", juce::var(obj));
    }

    // =====================================================================
    // Domain 4: change-cache helpers and contract builders
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        std::mutex cacheMutex;
        std::unordered_map<std::string, std::string> cache;

        updateChangeCache(processor, cacheMutex, cache);
        obj->setProperty("cacheSizeAfterUpdate", static_cast<int>(cache.size()));
        obj->setProperty("tempoChangedInitially", hasPathChanged("/core/behavior/tempo", processor, cacheMutex, cache));

        auto& state = processor.getControlServer().getAtomicState();
        state.tempo.store(150.0f);
        state.layers[0].speed.store(2.0f);

        obj->setProperty("tempoChangedAfterMutation", hasPathChanged("/core/behavior/tempo", processor, cacheMutex, cache));
        const auto changedPaths = getChangedPathsAndUpdateCache(processor, cacheMutex, cache);
        obj->setProperty("changedPathCount", static_cast<int>(changedPaths.size()));
        obj->setProperty("changedPathsContainTempo", containsPath(changedPaths, "/core/behavior/tempo"));
        obj->setProperty("changedPathsContainTempoAlias", containsPath(changedPaths, "/manifold/tempo"));
        obj->setProperty("changedPathsContainLayer0Speed", containsPath(changedPaths, "/core/behavior/layer/0/speed"));

        obj->setProperty("linkContract", buildLinkContract(processor));
        obj->setProperty("runtimeContract", buildRuntimeContract(44100.0, 512, processor.getPlayTimeSamples(), processor.isGraphProcessingEnabled()));
        root->setProperty("cacheAndContracts", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    const int rc = finishJsonContract(opts, "StateSerializationSupport contract", contract);
    std::fflush(stdout);
    std::fflush(stderr);
    std::_Exit(rc);
}
