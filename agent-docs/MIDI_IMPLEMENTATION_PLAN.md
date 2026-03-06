# MIDI Support Implementation Plan

## Overview
Make MIDI a first-class citizen: receive, route, transform, and output MIDI through the DSP graph, with full Lua scripting access.

## Status: Phase 1 & 2 Complete ✅

### Implemented

1. **Core MIDI plumbing**
   - `manifold/primitives/midi/MidiRingBuffer.h` - Lock-free SPSC MIDI message queue
   - Updated `BehaviorCoreProcessor.h`: `acceptsMidi() → true`, `producesMidi() → true`

2. **Lua API (`Midi` table)**
   - `Midi.sendNoteOn(channel, note, velocity)` - placeholder
   - `Midi.sendNoteOff(channel, note)` - placeholder
   - `Midi.sendCC(channel, cc, value)` - placeholder
   - `Midi.sendPitchBend(channel, value)` - placeholder
   - `Midi.sendProgramChange(channel, program)` - placeholder
   - `Midi.onNoteOn(callback)` - placeholder
   - `Midi.onNoteOff(callback)` - placeholder
   - `Midi.onControlChange(callback)` - placeholder
   - `Midi.onPitchBend(callback)` - placeholder
   - `Midi.onProgramChange(callback)` - placeholder
   - `Midi.learn(paramPath)` - placeholder
   - `Midi.unlearn(paramPath)` - placeholder
   - `Midi.getMappings()` - placeholder
   - `Midi.thruEnabled([enabled])` - placeholder
   - `Midi.inputDevices()` - placeholder
   - `Midi.outputDevices()` - placeholder
   - `Midi.openInput(deviceIndex)` - placeholder
   - `Midi.openOutput(deviceIndex)` - placeholder
   - `Midi.closeInput()` - placeholder
   - `Midi.closeOutput()` - placeholder
   - `Midi.allNotesOff()` - placeholder
   - MIDI Constants: `NOTE_OFF`, `NOTE_ON`, `AFTERTOUCH`, `CONTROL_CHANGE`, `PROGRAM_CHANGE`, `CHANNEL_PRESSURE`, `PITCH_BEND`, `SYSEX`
   - CC Constants: `CC_MODWHEEL`, `CC_VOLUME`, `CC_PAN`, `CC_EXPRESSION`, `CC_SUSTAIN`, etc.

## Remaining Work

### Phase 3: Core Processor Integration
- Wire `juce::MidiBuffer` from `processBlock()` through `MidiRingBuffer`
- Add MIDI device enumeration (JUCE `MidiInput`/`MidiOutput`)
- Implement actual send/receive methods

### Phase 4: MIDI Learn System
- Store MIDI mappings in settings
- Implement learn mode UI and logic

### Phase 5: DSP Graph MIDI Nodes
- `MidiInputNode` - Receive MIDI into graph
- `MidiOutputNode` - Output MIDI from graph
- `MidiThruNode` - Pass-through with filtering/transform

### Phase 6: UI Components
- MIDI activity meter
- MIDI learn indicator
- Device selection
