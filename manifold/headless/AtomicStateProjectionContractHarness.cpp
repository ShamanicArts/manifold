#include "ContractHarnessUtils.h"

#include "../primitives/control/ControlServer.h"

#include <juce_core/juce_core.h>

namespace {

using namespace contract_harness_utils;

void seedAtomicState(AtomicState& state) {
    state.tempo.store(147.5f, std::memory_order_relaxed);
    state.targetBPM.store(128.25f, std::memory_order_relaxed);
    state.samplesPerBar.store(72000.0f, std::memory_order_relaxed);
    state.sampleRate.store(48000.0, std::memory_order_relaxed);
    state.captureSize.store(8192, std::memory_order_relaxed);
    state.captureWritePos.store(777, std::memory_order_relaxed);
    state.captureLevel.store(0.375f, std::memory_order_relaxed);
    state.isRecording.store(true, std::memory_order_relaxed);
    state.overdubEnabled.store(true, std::memory_order_relaxed);
    state.forwardArmed.store(true, std::memory_order_relaxed);
    state.forwardBars.store(3.5f, std::memory_order_relaxed);
    state.graphEnabled.store(false, std::memory_order_relaxed);
    state.recordMode.store(2, std::memory_order_relaxed);
    state.activeLayer.store(5, std::memory_order_relaxed);
    state.masterVolume.store(0.85f, std::memory_order_relaxed);
    state.inputVolume.store(0.65f, std::memory_order_relaxed);
    state.passthroughEnabled.store(false, std::memory_order_relaxed);
    state.playTime.store(12345.0, std::memory_order_relaxed);
    state.commitCount.store(11, std::memory_order_relaxed);
    state.uptimeSeconds.store(42.125, std::memory_order_relaxed);

    for (int i = 0; i < AtomicState::MAX_LAYERS; ++i) {
        auto& layer = state.layers[i];
        const int stateValue = i % 7;
        layer.state.store(stateValue, std::memory_order_relaxed);
        layer.length.store(1000 + i * 37, std::memory_order_relaxed);
        layer.playheadPos.store(50 + i * 11, std::memory_order_relaxed);
        layer.speed.store(-1.0f + 0.125f * static_cast<float>(i), std::memory_order_relaxed);
        layer.reversed.store((i % 2) == 1, std::memory_order_relaxed);
        layer.volume.store(0.25f + 0.02f * static_cast<float>(i), std::memory_order_relaxed);
        layer.numBars.store(0.5f + 0.25f * static_cast<float>(i), std::memory_order_relaxed);
        layer.muted.store(stateValue == 4, std::memory_order_relaxed);
    }
}

juce::var layerToVar(const AtomicLayerState& layer, int index) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("index", index);
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

juce::var atomicStateToVar(const AtomicState& state) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("tempo", state.tempo.load(std::memory_order_relaxed));
    obj->setProperty("targetBPM", state.targetBPM.load(std::memory_order_relaxed));
    obj->setProperty("samplesPerBar", state.samplesPerBar.load(std::memory_order_relaxed));
    obj->setProperty("sampleRate", state.sampleRate.load(std::memory_order_relaxed));
    obj->setProperty("captureSize", state.captureSize.load(std::memory_order_relaxed));
    obj->setProperty("captureWritePos", state.captureWritePos.load(std::memory_order_relaxed));
    obj->setProperty("captureLevel", state.captureLevel.load(std::memory_order_relaxed));
    obj->setProperty("isRecording", state.isRecording.load(std::memory_order_relaxed));
    obj->setProperty("overdubEnabled", state.overdubEnabled.load(std::memory_order_relaxed));
    obj->setProperty("forwardArmed", state.forwardArmed.load(std::memory_order_relaxed));
    obj->setProperty("forwardBars", state.forwardBars.load(std::memory_order_relaxed));
    obj->setProperty("graphEnabled", state.graphEnabled.load(std::memory_order_relaxed));
    obj->setProperty("recordMode", state.recordMode.load(std::memory_order_relaxed));
    obj->setProperty("activeLayer", state.activeLayer.load(std::memory_order_relaxed));
    obj->setProperty("masterVolume", state.masterVolume.load(std::memory_order_relaxed));
    obj->setProperty("inputVolume", state.inputVolume.load(std::memory_order_relaxed));
    obj->setProperty("passthroughEnabled", state.passthroughEnabled.load(std::memory_order_relaxed));
    obj->setProperty("playTime", state.playTime.load(std::memory_order_relaxed));
    obj->setProperty("commitCount", state.commitCount.load(std::memory_order_relaxed));
    obj->setProperty("uptimeSeconds", state.uptimeSeconds.load(std::memory_order_relaxed));

    juce::Array<juce::var> layers;
    for (int i = 0; i < AtomicState::MAX_LAYERS; ++i) {
        layers.add(layerToVar(state.layers[i], i));
    }
    obj->setProperty("layers", juce::var(layers));
    return juce::var(obj);
}

juce::var buildConsistencyChecks(const AtomicState& state, const juce::var& projection) {
    auto* obj = new juce::DynamicObject();
    const auto projectionVersion = projection.getProperty("projectionVersion", -1);
    const auto numVoices = projection.getProperty("numVoices", -1);
    const auto params = projection.getProperty("params", juce::var());
    const auto voices = projection.getProperty("voices", juce::var());
    const auto* paramsObj = params.getDynamicObject();
    const auto* voicesArray = voices.getArray();

    obj->setProperty("projectionVersion", projectionVersion);
    obj->setProperty("numVoices", numVoices);
    obj->setProperty("voiceCountMatches", voicesArray != nullptr && static_cast<int>(voicesArray->size()) == AtomicState::MAX_LAYERS);
    obj->setProperty("legacyTopLevelTempoMissing", projection.getProperty("tempo", juce::var()).isVoid());
    obj->setProperty("legacyTopLevelLayersMissing", projection.getProperty("layers", juce::var()).isVoid());

    if (paramsObj != nullptr) {
        obj->setProperty("tempoMatchesProjection",
                         static_cast<double>(paramsObj->getProperty("/core/behavior/tempo")) ==
                             static_cast<double>(state.tempo.load(std::memory_order_relaxed)));
        obj->setProperty("activeLayerMatchesProjection",
                         static_cast<int>(paramsObj->getProperty("/core/behavior/layer")) ==
                             state.activeLayer.load(std::memory_order_relaxed));
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
    auto& state = server.getAtomicState();
    seedAtomicState(state);

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);
    root->setProperty("maxLayers", AtomicState::MAX_LAYERS);
    root->setProperty("directAtomicState", atomicStateToVar(state));

    const auto projection = juce::JSON::parse(server.getStateJson());
    root->setProperty("stateProjection", projection);
    root->setProperty("consistencyChecks", buildConsistencyChecks(state, projection));

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    return finishJsonContract(opts, "AtomicStateProjection contract", contract);
}
