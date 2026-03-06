#include "LuaControlBindings.h"
#include "../ILuaControlState.h"
#include "../ScriptableProcessor.h"

#include "../../../core/BehaviorCoreProcessor.h"

// sol2 requires Lua headers before inclusion
extern "C" {
#include <lauxlib.h>
#include <lua.h>
#include <lualib.h>
}

#define SOL_ALL_SAFETIES_ON 1
#include <sol/sol.hpp>

#include <cstdio>
#include <map>
#include <vector>

// Helper to cast ScriptableProcessor to BehaviorCoreProcessor
static BehaviorCoreProcessor* toBcp(ScriptableProcessor* p) {
    return static_cast<BehaviorCoreProcessor*>(p);
}

// ============================================================================
// MIDI Bindings
// ============================================================================

void LuaControlBindings::registerMidiBindings(sol::state& lua,
                                              ILuaControlState& state) {
    auto* processor = state.getProcessor();
    auto* bcp = toBcp(processor);
    
    // Create MIDI namespace/table
    lua["Midi"] = lua.create_table();
    
    // ---- MIDI:sendNoteOn(channel, note, velocity) ----
    lua["Midi"]["sendNoteOn"] = [bcp](int channel, int note, int velocity) {
        if (!bcp) return;
        bcp->sendMidiNoteOn(channel, note, velocity);
    };
    
    // ---- MIDI:sendNoteOff(channel, note) ----
    lua["Midi"]["sendNoteOff"] = [bcp](int channel, int note) {
        if (!bcp) return;
        bcp->sendMidiNoteOff(channel, note);
    };
    
    // ---- MIDI:sendCC(channel, cc, value) ----
    lua["Midi"]["sendCC"] = [bcp](int channel, int cc, int value) {
        if (!bcp) return;
        bcp->sendMidiCC(channel, cc, value);
    };
    
    // ---- MIDI:sendPitchBend(channel, value) ----
    lua["Midi"]["sendPitchBend"] = [bcp](int channel, int value) {
        if (!bcp) return;
        bcp->sendMidiPitchBend(channel, value);
    };
    
    // ---- MIDI:sendProgramChange(channel, program) ----
    lua["Midi"]["sendProgramChange"] = [bcp](int channel, int program) {
        if (!bcp) return;
        bcp->sendMidiProgramChange(channel, program);
    };
    
    // ---- MIDI:onNoteOn(callback) ----
    lua["Midi"]["onNoteOn"] = [&state](sol::function callback) {
        // Register callback to be called when note on is received
        // Stored in ILuaControlState for retrieval during MIDI processing
        // For now, placeholder
        (void)callback;
    };
    
    // ---- MIDI:onNoteOff(callback) ----
    lua["Midi"]["onNoteOff"] = [&state](sol::function callback) {
        // Register callback for note off
        (void)callback;
    };
    
    // ---- MIDI:onPitchBend(callback) ----
    lua["Midi"]["onPitchBend"] = [&state](sol::function callback) {
        // Register callback for pitch bend
        (void)callback;
    };
    
    // ---- MIDI:onProgramChange(callback) ----
    lua["Midi"]["onProgramChange"] = [&state](sol::function callback) {
        // Register callback for program change
        (void)callback;
    };
    
    // ---- MIDI:learn(paramPath) ----
    lua["Midi"]["learn"] = [bcp](const std::string& paramPath) {
        (void)paramPath;
        if (!bcp) return false;
        // TODO: Implement MIDI learn
        return true;
    };
    
    // ---- MIDI:unlearn(paramPath) ----
    lua["Midi"]["unlearn"] = [bcp](const std::string& paramPath) {
        (void)paramPath;
        if (!bcp) return false;
        // TODO: Remove MIDI mapping
        return true;
    };
    
    // ---- MIDI:getMappings() ----
    lua["Midi"]["getMappings"] = [&lua]() -> sol::table {
        // Return table of current MIDI mappings
        sol::table mappings = lua.create_table();
        // TODO: Populate from stored mappings
        return mappings;
    };
    
    // ---- MIDI:thruEnabled([enabled]) ----
    lua["Midi"]["thruEnabled"] = sol::overload(
        [bcp]() -> bool {
            if (!bcp) return false;
            return bcp->isMidiThruEnabled();
        },
        [bcp](bool enabled) {
            if (!bcp) return;
            bcp->setMidiThruEnabled(enabled);
        }
    );
    
    // ---- MIDI:inputDevices() ----
    lua["Midi"]["inputDevices"] = [&lua, bcp]() -> sol::table {
        sol::table devices = lua.create_table();
        if (!bcp) return devices;
        auto deviceList = bcp->getMidiInputDevices();
        for (size_t i = 0; i < deviceList.size(); ++i) {
            devices[i + 1] = deviceList[i];
        }
        return devices;
    };
    
    // ---- MIDI:outputDevices() ----
    lua["Midi"]["outputDevices"] = [&lua, bcp]() -> sol::table {
        sol::table devices = lua.create_table();
        if (!bcp) return devices;
        auto deviceList = bcp->getMidiOutputDevices();
        for (size_t i = 0; i < deviceList.size(); ++i) {
            devices[i + 1] = deviceList[i];
        }
        return devices;
    };
    
    // ---- MIDI:openInput(deviceIndex) ----
    lua["Midi"]["openInput"] = [bcp](int deviceIndex) -> bool {
        if (!bcp) return false;
        return bcp->openMidiInput(deviceIndex);
    };
    
    // ---- MIDI:openOutput(deviceIndex) ----
    lua["Midi"]["openOutput"] = [bcp](int deviceIndex) -> bool {
        if (!bcp) return false;
        return bcp->openMidiOutput(deviceIndex);
    };
    
    // ---- MIDI:closeInput() ----
    lua["Midi"]["closeInput"] = [bcp]() {
        if (!bcp) return;
        bcp->closeMidiInput();
    };
    
    // ---- MIDI:closeOutput() ----
    lua["Midi"]["closeOutput"] = [bcp]() {
        if (!bcp) return;
        bcp->closeMidiOutput();
    };
    
    // ---- MIDI:allNotesOff() ----
    lua["Midi"]["allNotesOff"] = [bcp]() {
        if (!bcp) return;
        // Send all notes off on all channels
        for (int ch = 1; ch <= 16; ++ch) {
            bcp->sendMidiCC(ch, 123, 0); // All Notes Off
        }
    };
    
    // ---- MIDI Constants ----
    lua["Midi"]["NOTE_OFF"] = 0x80;
    lua["Midi"]["NOTE_ON"] = 0x90;
    lua["Midi"]["AFTERTOUCH"] = 0xA0;
    lua["Midi"]["CONTROL_CHANGE"] = 0xB0;
    lua["Midi"]["PROGRAM_CHANGE"] = 0xC0;
    lua["Midi"]["CHANNEL_PRESSURE"] = 0xD0;
    lua["Midi"]["PITCH_BEND"] = 0xE0;
    lua["Midi"]["SYSEX"] = 0xF0;
    
    // Common CC numbers
    lua["Midi"]["CC_MODWHEEL"] = 1;
    lua["Midi"]["CC_VOLUME"] = 7;
    lua["Midi"]["CC_PAN"] = 10;
    lua["Midi"]["CC_EXPRESSION"] = 11;
    lua["Midi"]["CC_SUSTAIN"] = 64;
    lua["Midi"]["CC_PORTAMENTO"] = 65;
    lua["Midi"]["CC_SOSTENUTO"] = 66;
    lua["Midi"]["CC_SOFT"] = 67;
    lua["Midi"]["CC_RESONANCE"] = 71;
    lua["Midi"]["CC_RELEASE"] = 72;
    lua["Midi"]["CC_ATTACK"] = 73;
}
