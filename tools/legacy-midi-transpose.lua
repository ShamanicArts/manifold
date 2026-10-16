-- Offline behavior oracle for the old Standalone Transpose adapter.
-- No Lua code enters the v2 runtime; this script runs the old files read-only.
local old = os.getenv("MANIFOLD_LEGACY_DIR") or "/home/shamanic/dev/my-plugin"
package.path = old .. "/UserScripts/projects/Main/lib/?.lua;"
  .. old .. "/UserScripts/projects/Main/lib/?/init.lua;" .. package.path
package.loaded.parameter_binder = {
  dynamicTransposeBasePath = function() return "/midi/synth/rack/transpose/1" end,
  buildDynamicSlotSchema = function() return {} end,
}

local input = {}
local output = {}
local semitones = 0
local function emit(...) output[#output + 1] = table.concat({...}, ",") end
Midi = {
  NOTE_ON = 0x90, NOTE_OFF = 0x80, CONTROL_CHANGE = 0xB0, PITCH_BEND = 0xE0,
  pollInputEvent = function() return table.remove(input, 1) end,
  sendNoteOn = function(ch, note, velocity) emit("on", ch - 1, note, velocity) end,
  sendNoteOff = function(ch, note) emit("off", ch - 1, note) end,
  sendPitchBend = function(ch, value) emit("bend", ch - 1, value + 8192) end,
}
getParam = function(path) if path:match("/semitones$") then return semitones end end

local effect = require("export_midi_effect_scaffold").buildMidiEffect({params = {register = function() end}}, {
  schemaSpecId = "transpose", slotIndex = 1, instanceNodeId = "standalone_transpose_1",
  voiceCount = 8, adapterRequire = "export_midi_effects.transpose",
})
local function set(value)
  semitones = value
  effect.onParamChange("/midi/synth/rack/transpose/1/semitones", value)
end
local function send(kind, channel, data1, data2)
  input[#input + 1] = {type = kind, channel = channel + 1, data1 = data1, data2 = data2 or 0}
  effect.process(128, 48000)
end

set(7)
send(Midi.NOTE_ON, 2, 60, 96)
set(-12)
send(Midi.NOTE_OFF, 2, 60)
set(24)
send(Midi.NOTE_ON, 0, 120, 100)
send(Midi.NOTE_OFF, 0, 120)
set(0)
for note = 60, 68 do send(Midi.NOTE_ON, 0, note, 100) end
send(Midi.CONTROL_CHANGE, 0, 123, 0)
send(Midi.PITCH_BEND, 0, 0, 64)
io.write(table.concat(output, "\n"), "\n")
