#include "ContractHarnessUtils.h"

#include "../core/ControlCommandSupport.h"

#include <juce_core/juce_core.h>

#include <vector>

namespace {

using namespace contract_harness_utils;
using namespace manifold::control_command_support;

struct RecordedWrite {
    std::string path;
    float value = 0.0f;
};

class RecordingProcessor : public BehaviorCoreProcessor {
public:
    bool setParamByPath(const std::string& path, float value) override {
        writes.push_back({path, value});
        return true;
    }

    void clearWrites() { writes.clear(); }

    std::vector<RecordedWrite> writes;
};

juce::var writeToVar(const RecordedWrite& write) {
    auto* obj = new juce::DynamicObject();
    obj->setProperty("path", juce::String(write.path));
    obj->setProperty("value", write.value);
    return juce::var(obj);
}

ControlCommand makeCommand(ControlCommand::Type type, int intParam = 0, float floatParam = 0.0f) {
    ControlCommand command;
    command.type = type;
    command.intParam = intParam;
    command.floatParam = floatParam;
    return command;
}

} // namespace

int main(int argc, char* argv[]) {
    HarnessOptions opts;
    if (!parseOptions(argc, argv, opts)) {
        return 1;
    }

    juce::ScopedJuceInitialiser_GUI juceInit;
    RecordingProcessor processor;
    auto& state = processor.getControlServer().getAtomicState();
    state.overdubEnabled.store(false, std::memory_order_relaxed);

    auto* root = new juce::DynamicObject();
    root->setProperty("contractVersion", 1);

    // =====================================================================
    // Domain 1: scalar/global command routing
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        processor.clearWrites();

        applyControlCommand(processor, makeCommand(ControlCommand::Type::SetTempo, 0, 132.5f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::SetTargetBPM, 0, 140.0f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::SetMasterVolume, 0, 0.8f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::SetInputVolume, 0, 0.65f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::SetPassthroughEnabled, 0, 0.0f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::SetActiveLayer, 2, 0.0f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::SetRecordMode, 3, 0.0f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::StartRecording), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::StopRecording), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::SetOverdubEnabled, 0, 1.0f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::Commit, 0, 2.0f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::ForwardCommit, 0, 4.0f), state);

        obj->setProperty("writeCount", static_cast<int>(processor.writes.size()));
        if (!processor.writes.empty()) {
            obj->setProperty("firstWrite", writeToVar(processor.writes.front()));
            obj->setProperty("lastWrite", writeToVar(processor.writes.back()));
        }
        root->setProperty("globalRouting", juce::var(obj));
    }

    // =====================================================================
    // Domain 2: layer commands + clear-all fanout
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        processor.clearWrites();

        applyControlCommand(processor, makeCommand(ControlCommand::Type::LayerVolume, 1, 0.4f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::LayerSpeed, 2, 1.5f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::LayerReverse, 3, 1.0f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::LayerMute, 0, 1.0f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::LayerPlay, 1, 0.0f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::LayerPause, 2, 0.0f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::LayerStop, 3, 0.0f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::LayerClear, 0, 0.0f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::LayerSeek, 2, 0.33f), state);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::ClearAllLayers), state);

        obj->setProperty("writeCount", static_cast<int>(processor.writes.size()));
        if (processor.writes.size() >= 9) {
            obj->setProperty("layerVolumeWrite", writeToVar(processor.writes[0]));
            obj->setProperty("layerSeekWrite", writeToVar(processor.writes[8]));
        }

        int clearCount = 0;
        for (const auto& write : processor.writes) {
            if (juce::String(write.path).endsWith("/clear")) {
                ++clearCount;
            }
        }
        obj->setProperty("clearWriteCount", clearCount);
        root->setProperty("layerRouting", juce::var(obj));
    }

    // =====================================================================
    // Domain 3: in-place state mutation + queue draining
    // =====================================================================
    {
        auto* obj = new juce::DynamicObject();
        state.overdubEnabled.store(false, std::memory_order_relaxed);
        applyControlCommand(processor, makeCommand(ControlCommand::Type::ToggleOverdub), state);
        obj->setProperty("overdubAfterToggle", state.overdubEnabled.load(std::memory_order_relaxed));

        processor.clearWrites();
        auto& queue = processor.getControlServer().getCommandQueue();
        queue.enqueue(makeCommand(ControlCommand::Type::SetTempo, 0, 110.0f));
        queue.enqueue(makeCommand(ControlCommand::Type::LayerSpeed, 1, 0.75f));
        processControlCommands(processor, processor.getControlServer());

        obj->setProperty("queueWriteCount", static_cast<int>(processor.writes.size()));
        if (processor.writes.size() >= 2) {
            obj->setProperty("queueWrite0", writeToVar(processor.writes[0]));
            obj->setProperty("queueWrite1", writeToVar(processor.writes[1]));
        }

        ControlCommand leftover;
        obj->setProperty("queueEmptyAfterDrain", !queue.dequeue(leftover));
        root->setProperty("stateAndQueue", juce::var(obj));
    }

    const auto contract = juce::JSON::toString(juce::var(root), true).toStdString();
    const int rc = finishJsonContract(opts, "ControlCommandSupport contract", contract);
    std::fflush(stdout);
    std::fflush(stderr);
    std::_Exit(rc);
}
