-- Offline probe of the old Arpeggiator export; legacy files remain read-only.
local old = os.getenv("MANIFOLD_LEGACY_DIR") or "/home/shamanic/dev/my-plugin"
package.path = old .. "/UserScripts/projects/Main/lib/?.lua;"
  .. old .. "/UserScripts/projects/Main/lib/?/init.lua;" .. package.path
package.loaded.parameter_binder = {
  dynamicArpBasePath = function() return "/midi/synth/rack/arp/1" end,
  buildDynamicSlotSchema = function() return {} end,
}

local input, output = {}, {}
local params = {rate = 8, mode = 0, octaves = 1, gate = 0.6, hold = 0}
local callbackEnd = 0
local function emit(...) output[#output + 1] = callbackEnd .. "," .. table.concat({...}, ",") end
Midi = {
  NOTE_ON = 0x90, NOTE_OFF = 0x80, CONTROL_CHANGE = 0xB0, PITCH_BEND = 0xE0,
  pollInputEvent = function() return table.remove(input, 1) end,
  sendNoteOn = function(ch, note, velocity) emit("on", ch - 1, note, velocity) end,
  sendNoteOff = function(ch, note) emit("off", ch - 1, note) end,
  sendPitchBend = function(ch, value) emit("bend", ch - 1, value + 8192) end,
}
getParam = function(path) return params[path:match("/([^/]+)$")] end

local effect = require("export_midi_effect_scaffold").buildMidiEffect({params = {register = function() end}}, {
  schemaSpecId = "arp", slotIndex = 1, instanceNodeId = "standalone_arp_1",
  voiceCount = 8, adapterRequire = "export_midi_effects.arp",
})
local frame = 0
local function tick(frames)
  callbackEnd = frame + frames
  effect.process(frames, 48000)
  frame = frame + frames
end
local function send(kind, note, velocity)
  input[#input + 1] = {type = kind, channel = 1, data1 = note, data2 = velocity or 0}
end

send(Midi.NOTE_ON, 60, 90)
for _ = 1, 64 do
  if frame == 512 then send(Midi.NOTE_ON, 64, 100) end
  tick(128)
end
io.write(table.concat(output, "\n"), "\n")
