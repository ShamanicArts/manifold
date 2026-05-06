#include "LuaGraphBindings.h"

#include "LuaPrimitiveWrapperHelpers.h"
#include "../ILuaControlState.h"
#include "../DSPPrimitiveWrappers.h"
#include "../PrimitiveGraph.h"
#include "../ScriptableProcessor.h"
#include "dsp/core/nodes/PrimitiveNodes.h"
#include "dsp/core/graph/PrimitiveNode.h"

#include <memory>

namespace lua_bindings {
using namespace lua_primitive_helpers;

void registerGraphBindings(sol::state& lua,
                           ILuaControlState& state) {
    // Guard against re-registration (causes sol2 double-free on Lua cleanup)
    if (lua["__graph_bindings_registered"].valid() && lua["__graph_bindings_registered"]) {
        return;
    }
    
    // ---- DSP Primitives factory ----
    lua["Primitives"] = lua.create_table();

    lua["Primitives"]["LoopBuffer"] = lua.create_table();
    lua["Primitives"]["LoopBuffer"]["new"] = &createLoopBuffer;

    lua["Primitives"]["Playhead"] = lua.create_table();
    lua["Primitives"]["Playhead"]["new"] = &createPlayhead;

    lua["Primitives"]["CaptureBuffer"] = lua.create_table();
    lua["Primitives"]["CaptureBuffer"]["new"] = &createCaptureBuffer;

    lua["Primitives"]["Quantizer"] = lua.create_table();
    lua["Primitives"]["Quantizer"]["new"] = &createQuantizer;

    // Get graph from processor
    auto* graphProcessor = state.getProcessor();
    std::shared_ptr<dsp_primitives::PrimitiveGraph> graph;
    if (graphProcessor) {
        graph = graphProcessor->getPrimitiveGraph();
    }
    if (!graph) {
        graph = std::make_shared<dsp_primitives::PrimitiveGraph>();
    }

    // Register node usertypes
    lua.new_usertype<dsp_primitives::PlayheadNode>("PlayheadNode",
        sol::constructors<std::shared_ptr<dsp_primitives::PlayheadNode>()>(),
        "setLoopLength", &dsp_primitives::PlayheadNode::setLoopLength,
        "setSpeed", &dsp_primitives::PlayheadNode::setSpeed,
        "setReversed", &dsp_primitives::PlayheadNode::setReversed,
        "play", &dsp_primitives::PlayheadNode::play,
        "pause", &dsp_primitives::PlayheadNode::pause,
        "stop", &dsp_primitives::PlayheadNode::stop,
        "getLoopLength", &dsp_primitives::PlayheadNode::getLoopLength,
        "getSpeed", &dsp_primitives::PlayheadNode::getSpeed,
        "isReversed", &dsp_primitives::PlayheadNode::isReversed,
        "isPlaying", &dsp_primitives::PlayheadNode::isPlaying,
        "getNormalizedPosition", &dsp_primitives::PlayheadNode::getNormalizedPosition
    );

    lua.new_usertype<dsp_primitives::PassthroughNode>("PassthroughNode",
        sol::constructors<std::shared_ptr<dsp_primitives::PassthroughNode>(int)>()
    );

    lua.new_usertype<dsp_primitives::OscillatorNode>("OscillatorNode",
        sol::constructors<std::shared_ptr<dsp_primitives::OscillatorNode>()>(),
        "setFrequency", &dsp_primitives::OscillatorNode::setFrequency,
        "setAmplitude", &dsp_primitives::OscillatorNode::setAmplitude,
        "setEnabled", &dsp_primitives::OscillatorNode::setEnabled,
        "setWaveform", &dsp_primitives::OscillatorNode::setWaveform,
        "setDrive", &dsp_primitives::OscillatorNode::setDrive,
        "setDriveShape", &dsp_primitives::OscillatorNode::setDriveShape,
        "setDriveBias", &dsp_primitives::OscillatorNode::setDriveBias,
        "setDriveMix", &dsp_primitives::OscillatorNode::setDriveMix,
        "getFrequency", &dsp_primitives::OscillatorNode::getFrequency,
        "getAmplitude", &dsp_primitives::OscillatorNode::getAmplitude,
        "getDrive", &dsp_primitives::OscillatorNode::getDrive,
        "getDriveShape", &dsp_primitives::OscillatorNode::getDriveShape,
        "getDriveBias", &dsp_primitives::OscillatorNode::getDriveBias,
        "getDriveMix", &dsp_primitives::OscillatorNode::getDriveMix,
        "isEnabled", &dsp_primitives::OscillatorNode::isEnabled,
        "getWaveform", &dsp_primitives::OscillatorNode::getWaveform
    );

    lua.new_usertype<dsp_primitives::ReverbNode>("ReverbNode",
        sol::constructors<std::shared_ptr<dsp_primitives::ReverbNode>()>(),
        "setRoomSize", &dsp_primitives::ReverbNode::setRoomSize,
        "setDamping", &dsp_primitives::ReverbNode::setDamping,
        "setWetLevel", &dsp_primitives::ReverbNode::setWetLevel,
        "setDryLevel", &dsp_primitives::ReverbNode::setDryLevel,
        "setWidth", &dsp_primitives::ReverbNode::setWidth,
        "getRoomSize", &dsp_primitives::ReverbNode::getRoomSize,
        "getDamping", &dsp_primitives::ReverbNode::getDamping,
        "getWetLevel", &dsp_primitives::ReverbNode::getWetLevel,
        "getDryLevel", &dsp_primitives::ReverbNode::getDryLevel,
        "getWidth", &dsp_primitives::ReverbNode::getWidth
    );

    lua.new_usertype<dsp_primitives::FilterNode>("FilterNode",
        sol::constructors<std::shared_ptr<dsp_primitives::FilterNode>()>(),
        "setCutoff", &dsp_primitives::FilterNode::setCutoff,
        "setResonance", &dsp_primitives::FilterNode::setResonance,
        "setMix", &dsp_primitives::FilterNode::setMix,
        "getCutoff", &dsp_primitives::FilterNode::getCutoff,
        "getResonance", &dsp_primitives::FilterNode::getResonance,
        "getMix", &dsp_primitives::FilterNode::getMix
    );

    lua.new_usertype<dsp_primitives::DistortionNode>("DistortionNode",
        sol::constructors<std::shared_ptr<dsp_primitives::DistortionNode>()>(),
        "setDrive", &dsp_primitives::DistortionNode::setDrive,
        "setMix", &dsp_primitives::DistortionNode::setMix,
        "setOutput", &dsp_primitives::DistortionNode::setOutput,
        "getDrive", &dsp_primitives::DistortionNode::getDrive,
        "getMix", &dsp_primitives::DistortionNode::getMix,
        "getOutput", &dsp_primitives::DistortionNode::getOutput
    );

    lua.new_usertype<dsp_primitives::SVFNode>("SVFNode",
        sol::constructors<std::shared_ptr<dsp_primitives::SVFNode>()>(),
        "setCutoff", &dsp_primitives::SVFNode::setCutoff,
        "setResonance", &dsp_primitives::SVFNode::setResonance,
        "setMode", &dsp_primitives::SVFNode::setMode,
        "setDrive", &dsp_primitives::SVFNode::setDrive,
        "setMix", &dsp_primitives::SVFNode::setMix,
        "getCutoff", &dsp_primitives::SVFNode::getCutoff,
        "getResonance", &dsp_primitives::SVFNode::getResonance,
        "getMode", &dsp_primitives::SVFNode::getMode,
        "getDrive", &dsp_primitives::SVFNode::getDrive,
        "getMix", &dsp_primitives::SVFNode::getMix,
        "reset", &dsp_primitives::SVFNode::reset
    );

    lua.new_usertype<dsp_primitives::StereoDelayNode>("StereoDelayNode",
        sol::constructors<std::shared_ptr<dsp_primitives::StereoDelayNode>()>(),
        "setTimeMode", &dsp_primitives::StereoDelayNode::setTimeMode,
        "setTimeL", &dsp_primitives::StereoDelayNode::setTimeL,
        "setTimeR", &dsp_primitives::StereoDelayNode::setTimeR,
        "setDivisionL", &dsp_primitives::StereoDelayNode::setDivisionL,
        "setDivisionR", &dsp_primitives::StereoDelayNode::setDivisionR,
        "setFeedback", &dsp_primitives::StereoDelayNode::setFeedback,
        "setFeedbackCrossfeed", &dsp_primitives::StereoDelayNode::setFeedbackCrossfeed,
        "setFilterEnabled", &dsp_primitives::StereoDelayNode::setFilterEnabled,
        "setFilterCutoff", &dsp_primitives::StereoDelayNode::setFilterCutoff,
        "setFilterResonance", &dsp_primitives::StereoDelayNode::setFilterResonance,
        "setMix", &dsp_primitives::StereoDelayNode::setMix,
        "setPingPong", &dsp_primitives::StereoDelayNode::setPingPong,
        "setWidth", &dsp_primitives::StereoDelayNode::setWidth,
        "setFreeze", &dsp_primitives::StereoDelayNode::setFreeze,
        "setDucking", &dsp_primitives::StereoDelayNode::setDucking,
        "setTempo", &dsp_primitives::StereoDelayNode::setTempo,
        "getTimeMode", &dsp_primitives::StereoDelayNode::getTimeMode,
        "getTimeL", &dsp_primitives::StereoDelayNode::getTimeL,
        "getTimeR", &dsp_primitives::StereoDelayNode::getTimeR,
        "getMix", &dsp_primitives::StereoDelayNode::getMix,
        "getFeedback", &dsp_primitives::StereoDelayNode::getFeedback,
        "getPingPong", &dsp_primitives::StereoDelayNode::getPingPong,
        "getFreeze", &dsp_primitives::StereoDelayNode::getFreeze,
        "reset", &dsp_primitives::StereoDelayNode::reset
    );

    // MIDI Nodes
    lua.new_usertype<dsp_primitives::MidiVoiceNode>("MidiVoiceNode",
        sol::constructors<std::shared_ptr<dsp_primitives::MidiVoiceNode>()>(),
        "setWaveform", &dsp_primitives::MidiVoiceNode::setWaveform,
        "setAttack", &dsp_primitives::MidiVoiceNode::setAttack,
        "setDecay", &dsp_primitives::MidiVoiceNode::setDecay,
        "setSustain", &dsp_primitives::MidiVoiceNode::setSustain,
        "setRelease", &dsp_primitives::MidiVoiceNode::setRelease,
        "setFilterCutoff", &dsp_primitives::MidiVoiceNode::setFilterCutoff,
        "setFilterResonance", &dsp_primitives::MidiVoiceNode::setFilterResonance,
        "setFilterEnvAmount", &dsp_primitives::MidiVoiceNode::setFilterEnvAmount,
        "setEnabled", &dsp_primitives::MidiVoiceNode::setEnabled,
        "setPolyphony", &dsp_primitives::MidiVoiceNode::setPolyphony,
        "setGlide", &dsp_primitives::MidiVoiceNode::setGlide,
        "setDetune", &dsp_primitives::MidiVoiceNode::setDetune,
        "setSpread", &dsp_primitives::MidiVoiceNode::setSpread,
        "setUnison", &dsp_primitives::MidiVoiceNode::setUnison,
        "getWaveform", &dsp_primitives::MidiVoiceNode::getWaveform,
        "getAttack", &dsp_primitives::MidiVoiceNode::getAttack,
        "getDecay", &dsp_primitives::MidiVoiceNode::getDecay,
        "getSustain", &dsp_primitives::MidiVoiceNode::getSustain,
        "getRelease", &dsp_primitives::MidiVoiceNode::getRelease,
        "getFilterCutoff", &dsp_primitives::MidiVoiceNode::getFilterCutoff,
        "getFilterResonance", &dsp_primitives::MidiVoiceNode::getFilterResonance,
        "getFilterEnvAmount", &dsp_primitives::MidiVoiceNode::getFilterEnvAmount,
        "isEnabled", &dsp_primitives::MidiVoiceNode::isEnabled,
        "getPolyphony", &dsp_primitives::MidiVoiceNode::getPolyphony,
        "getNumActiveVoices", &dsp_primitives::MidiVoiceNode::getNumActiveVoices,
        "noteOn", &dsp_primitives::MidiVoiceNode::noteOn,
        "noteOff", &dsp_primitives::MidiVoiceNode::noteOff,
        "allNotesOff", &dsp_primitives::MidiVoiceNode::allNotesOff,
        "allSoundOff", &dsp_primitives::MidiVoiceNode::allSoundOff,
        "pitchBend", &dsp_primitives::MidiVoiceNode::pitchBend,
        "controlChange", &dsp_primitives::MidiVoiceNode::controlChange
    );

    lua.new_usertype<dsp_primitives::MidiInputNode>("MidiInputNode",
        sol::constructors<std::shared_ptr<dsp_primitives::MidiInputNode>()>(),
        "setChannelFilter", &dsp_primitives::MidiInputNode::setChannelFilter,
        "setChannelMask", &dsp_primitives::MidiInputNode::setChannelMask,
        "setOmniMode", &dsp_primitives::MidiInputNode::setOmniMode,
        "setMonophonic", &dsp_primitives::MidiInputNode::setMonophonic,
        "setPortamento", &dsp_primitives::MidiInputNode::setPortamento,
        "setPitchBendRange", &dsp_primitives::MidiInputNode::setPitchBendRange,
        "setEnabled", &dsp_primitives::MidiInputNode::setEnabled,
        "setEchoOutput", &dsp_primitives::MidiInputNode::setEchoOutput,
        "getChannelFilter", &dsp_primitives::MidiInputNode::getChannelFilter,
        "isOmniMode", &dsp_primitives::MidiInputNode::isOmniMode,
        "isMonophonic", &dsp_primitives::MidiInputNode::isMonophonic,
        "getPortamento", &dsp_primitives::MidiInputNode::getPortamento,
        "getPitchBendRange", &dsp_primitives::MidiInputNode::getPitchBendRange,
        "isEnabled", &dsp_primitives::MidiInputNode::isEnabled,
        "isEchoingOutput", &dsp_primitives::MidiInputNode::isEchoingOutput,
        "getLastNote", &dsp_primitives::MidiInputNode::getLastNote,
        "getLastVelocity", &dsp_primitives::MidiInputNode::getLastVelocity,
        "getCurrentPitchBend", &dsp_primitives::MidiInputNode::getCurrentPitchBend,
        "connectToVoiceNode", &dsp_primitives::MidiInputNode::connectToVoiceNode,
        "triggerNoteOn", &dsp_primitives::MidiInputNode::triggerNoteOn,
        "triggerNoteOff", &dsp_primitives::MidiInputNode::triggerNoteOff,
        "triggerPitchBend", &dsp_primitives::MidiInputNode::triggerPitchBend
    );

    // Node factories
    lua["Primitives"]["PlayheadNode"] = lua.create_table();
    lua["Primitives"]["PlayheadNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::PlayheadNode>();
        graph->registerNode(node);
        return node;
    };

    lua["Primitives"]["PassthroughNode"] = lua.create_table();
    lua["Primitives"]["PassthroughNode"]["new"] = [graph](int numChannels) {
        auto node = std::make_shared<dsp_primitives::PassthroughNode>(numChannels);
        graph->registerNode(node);
        return node;
    };

    lua["Primitives"]["OscillatorNode"] = lua.create_table();
    lua["Primitives"]["OscillatorNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::OscillatorNode>();
        graph->registerNode(node);
        return node;
    };

    lua["Primitives"]["ReverbNode"] = lua.create_table();
    lua["Primitives"]["ReverbNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::ReverbNode>();
        graph->registerNode(node);
        return node;
    };

    lua["Primitives"]["FilterNode"] = lua.create_table();
    lua["Primitives"]["FilterNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::FilterNode>();
        graph->registerNode(node);
        return node;
    };

    lua["Primitives"]["DistortionNode"] = lua.create_table();
    lua["Primitives"]["DistortionNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::DistortionNode>();
        graph->registerNode(node);
        return node;
    };

    lua["Primitives"]["SVFNode"] = lua.create_table();
    lua["Primitives"]["SVFNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::SVFNode>();
        graph->registerNode(node);
        return node;
    };
    lua["Primitives"]["SVFNode"]["Mode"] = lua.create_table_with(
        "Lowpass", 0,
        "Bandpass", 1,
        "Highpass", 2,
        "Notch", 3,
        "Peak", 4
    );

    lua["Primitives"]["StereoDelayNode"] = lua.create_table();
    lua["Primitives"]["StereoDelayNode"]["new"] = [graph]() {
        auto node = std::make_shared<dsp_primitives::StereoDelayNode>();
        graph->registerNode(node);
        return node;
    };
    lua["Primitives"]["StereoDelayNode"]["TimeMode"] = lua.create_table_with(
        "Free", 0,
        "Synced", 1
    );
    lua["Primitives"]["StereoDelayNode"]["Division"] = lua.create_table_with(
        "ThirtySecond", 0,
        "Sixteenth", 1,
        "Eighth", 2,
        "Quarter", 3,
        "Half", 4,
        "Whole", 5,
        "DottedEighth", 6,
        "DottedQuarter", 7,
        "TripletSixteenth", 8,
        "TripletEighth", 9,
        "TripletQuarter", 10
    );

    // Connection helpers
    auto toPrimitiveNode = [](const sol::object& obj) -> std::shared_ptr<dsp_primitives::IPrimitiveNode> {
        if (obj.is<std::shared_ptr<dsp_primitives::PlayheadNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::PlayheadNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::PassthroughNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::PassthroughNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::OscillatorNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::OscillatorNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::ReverbNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::ReverbNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::FilterNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::FilterNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::DistortionNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::DistortionNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::SVFNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::SVFNode>>();
        }
        if (obj.is<std::shared_ptr<dsp_primitives::StereoDelayNode>>()) {
            return obj.as<std::shared_ptr<dsp_primitives::StereoDelayNode>>();
        }
        return nullptr;
    };

    lua["connectNodes"] = [graph, toPrimitiveNode](const sol::object& fromObj,
                                                    const sol::object& toObj) -> bool {
        auto from = toPrimitiveNode(fromObj);
        auto to = toPrimitiveNode(toObj);
        if (!from || !to) return false;
        return graph->connect(from, 0, to, 0);
    };

    lua["hasGraphCycle"] = [graph]() -> bool {
        return graph->hasCycle();
    };

    lua["getGraphNodeCount"] = [graph]() -> int {
        return static_cast<int>(graph->getNodeCount());
    };

    lua["getGraphConnectionCount"] = [graph]() -> int {
        return static_cast<int>(graph->getConnectionCount());
    };

    lua["clearGraph"] = [graph]() {
        graph->clear();
    };

    lua["setGraphProcessingEnabled"] = [&state](bool enabled) -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        processor->setGraphProcessingEnabled(enabled);
        return processor->isGraphProcessingEnabled() == enabled;
    };

    lua["isGraphProcessingEnabled"] = [&state]() -> bool {
        auto* processor = state.getProcessor();
        if (!processor) return false;
        return processor->isGraphProcessingEnabled();
    };
}

} // namespace lua_bindings
