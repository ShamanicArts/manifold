#include "ContractHarnessUtils.h"

#include "../primitives/control/ControlServer.h"

#include <juce_core/juce_core.h>

namespace {

using namespace contract_harness_utils;

void seedBehaviorState(ControlServer& server) {
    auto controlState = controlStateView(server);
    auto runtimeTelemetry = runtimeTelemetryView(server);

    controlState.setTempo(147.5f);
    runtimeTelemetry.setTempo(147.5f);
    controlState.setTargetBpm(128.25f);
    runtimeTelemetry.setSamplesPerBar(72000.0f);
    runtimeTelemetry.setSampleRate(48000.0);
    runtimeTelemetry.setCaptureSize(8192);
    runtimeTelemetry.setCaptureWritePos(777);
    runtimeTelemetry.setCaptureLevel(0.375f);
    controlState.setIsRecording(true);
    controlState.setOverdubEnabled(true);
    controlState.setForwardArmed(true);
    controlState.setForwardBars(3.5f);
    controlState.setGraphEnabled(false);
    runtimeTelemetry.setGraphEnabled(false);
    controlState.setRecordMode(2);
    controlState.setActiveLayer(5);
    controlState.setMasterVolume(0.85f);
    controlState.setInputVolume(0.65f);
    controlState.setPassthroughEnabled(false);
    runtimeTelemetry.setPlayTime(12345.0);
    runtimeTelemetry.setCommitCount(11);
    runtimeTelemetry.setUptimeSeconds(42.125);

    for (int i = 0; i < manifold::BehaviorControlState::MAX_LAYERS; ++i) {
        const int stateValue = i % 7;
        runtimeTelemetry.setLayerState(i, stateValue);
        runtimeTelemetry.setLayerLength(i, 1000 + i * 37);
        runtimeTelemetry.setLayerPlayheadPos(i, 50 + i * 11);
        controlState.setLayerSpeed(i, -1.0f + 0.125f * static_cast<float>(i));
        controlState.setLayerReversed(i, (i % 2) == 1);
        controlState.setLayerVolume(i, 0.25f + 0.02f * static_cast<float>(i));
        runtimeTelemetry.setLayerNumBars(i, 0.5f + 0.25f * static_cast<float>(i));
        controlState.setLayerMuted(i, stateValue == 4);
    }
}

juce::var buildConsistencyChecks(
    const manifold::state_snapshot::BehaviorControlStateSnapshot& controlState,
    const manifold::state_snapshot::BehaviorRuntimeTelemetrySnapshot& runtimeTelemetry,
    const juce::var& projection) {
    auto* obj = new juce::DynamicObject();
    const auto projectionVersion = projection.getProperty("projectionVersion", -1);
    const auto numVoices = projection.getProperty("numVoices", -1);
    const auto params = projection.getProperty("params", juce::var());
    const auto voices = projection.getProperty("voices", juce::var());
    const auto* paramsObj = params.getDynamicObject();
    const auto* voicesArray = voices.getArray();

    obj->setProperty("projectionVersion", projectionVersion);
    obj->setProperty("numVoices", numVoices);
    obj->setProperty("voiceCountMatches",
                     voicesArray != nullptr &&
                         static_cast<int>(voicesArray->size()) ==
                             manifold::BehaviorControlState::MAX_LAYERS);
    obj->setProperty("legacyTopLevelTempoMissing",
                     projection.getProperty("tempo", juce::var()).isVoid());
    obj->setProperty("legacyTopLevelLayersMissing",
                     projection.getProperty("layers", juce::var()).isVoid());

    if (paramsObj != nullptr) {
        obj->setProperty("tempoMatchesProjection",
                         static_cast<double>(paramsObj->getProperty("/core/behavior/tempo")) ==
                             static_cast<double>(runtimeTelemetry.effectiveTempo));
        obj->setProperty("activeLayerMatchesProjection",
                         static_cast<int>(paramsObj->getProperty("/core/behavior/layer")) ==
                             controlState.activeLayer);
        obj->setProperty("layer5StateMatchesProjection",
                         paramsObj->getProperty("/core/behavior/layer/5/state").toString() ==
                             juce::String("stopped"));
        obj->setProperty("layer5MuteMatchesProjection",
                         static_cast<int>(paramsObj->getProperty("/core/behavior/layer/5/mute")) == 0);
    }

    if (voicesArray != nullptr && voicesArray->size() > 5) {
        const auto voice5 = (*voicesArray)[5];
        obj->setProperty("voice5Path", voice5.getProperty("path", juce::var()));
        obj->setProperty("voice5State", voice5.getProperty("state", juce::var()));
        obj->setProperty("voice5Bars", voice5.getProperty("bars", juce::var()));
    }

    return juce::var(obj);
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    ControlServer server;
    seedBehaviorState(server);
    const auto controlState = captureControlState(server);
    const auto runtimeTelemetry = captureRuntimeTelemetry(server);

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);
    root->setProperty("maxLayers", manifold::BehaviorControlState::MAX_LAYERS);
    root->setProperty("directAtomicState", legacyStateToVar(controlState, runtimeTelemetry));

    const auto projection = juce::JSON::parse(server.getStateJson());
    root->setProperty("stateProjection", projection);
    root->setProperty("consistencyChecks",
                      buildConsistencyChecks(controlState, runtimeTelemetry, projection));

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    return finishJsonContract(opts, "AtomicStateProjection contract", contract);
}
