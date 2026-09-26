-- Offline probe of the old Scale Quantizer export; legacy files remain read-only.
local old = os.getenv("MANIFOLD_LEGACY_DIR") or "/home/shamanic/dev/my-plugin"
package.path = old .. "/UserScripts/projects/Main/lib/?.lua;"
  .. old .. "/UserScripts/projects/Main/lib/?/init.lua;" .. package.path
package.loaded.parameter_binder = {
  dynamicScaleQuantizerBasePath = function() return "/midi/synth/rack/scale_quantizer/1" end,
  buildDynamicSlotSchema = function() return {} end,
}

local input, output = {}, {}
local params = {root = 0, scale = 1, direction = 1}
local function emit(...) output[#output + 1] = table.concat({...}, ",") end
Midi = {
  NOTE_ON = 0x90, NOTE_OFF = 0x80, CONTROL_CHANGE = 0xB0, PITCH_BEND = 0xE0,
  pollInputEvent = function() return table.remove(input, 1) end,
  sendNoteOn = function(ch, note, velocity) emit("on", ch - 1, note, velocity) end,
  sendNoteOff = function(ch, note) emit("off", ch - 1, note) end,
  sendPitchBend = function(ch, value) emit("bend", ch - 1, value + 8192) end,
}
getParam = function(path) return params[path:match("/([^/]+)$")] end

local effect = require("export_midi_effect_scaffold").buildMidiEffect({params = {register = function() end}}, {
  schemaSpecId = "scale_quantizer", slotIndex = 1, instanceNodeId = "standalone_scale_quantizer_1",
  voiceCount = 8, adapterRequire = "export_midi_effects.scale_quantizer",
})
local function set(name, value)
  params[name] = value
  effect.onParamChange("/midi/synth/rack/scale_quantizer/1/" .. name, value)
end
local function send(kind, note, velocity)
  input[#input + 1] = {type = kind, channel = 1, data1 = note, data2 = velocity or 0}
  effect.process(128, 48000)
end

send(Midi.NOTE_ON, 61, 90)
send(Midi.NOTE_ON, 64, 100)
set("direction", 2)
send(Midi.NOTE_OFF, 61)
send(Midi.NOTE_OFF, 64)
io.write(table.concat(output, "\n"), "\n")
