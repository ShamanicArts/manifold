-- Original UI VoiceManager allocation decisions with only host-path effects mocked.
local legacy = assert(arg[1], "legacy Main/ui/behaviors directory required")
local scenarios = assert(arg[2], "scenario CSV required")
package.path = legacy .. "/?.lua;" .. package.path
local manager = require("voice_manager")
manager.init({ setPath = function() end, applyImplicitRackOscillatorKeyboardPitch = function() end,
  ParameterBinder = {}, adsr_runtime = {} })
manager.attach({ _hasAnyOscillatorGateRoute = function() return true end })
local voices = {}
for i = 1, 8 do voices[i] = { active = false, envelopeStage = "idle", envelopeLevel = 0, stamp = 0 } end
local ctx = { _voices = voices, _midiVoices = voices }
local first = true
for line in io.lines(scenarios) do
  if first then first = false else
    local values = {}
    for field in line:gmatch("[^,]+") do values[#values + 1] = field end
    assert(#values == 5, "invalid scenario")
    local action, a, b, c = values[1], tonumber(values[2]), tonumber(values[3]), tonumber(values[4])
    local chosen = 0
    if action == "on" then chosen = manager.triggerVoice(ctx, a, b)
    elseif action == "off" then manager.releaseVoice(ctx, a)
    elseif action == "stage" then
      local voice = voices[a]
      voice.envelopeStage = b == 0 and "idle" or b == 1 and "release" or "sustain"
      voice.envelopeLevel = c
      if b == 0 and voice.gate <= 0.5 then voice.active = false end
    elseif action == "panic" then manager.panicVoices(ctx)
    else error("invalid action") end
    local activeMask, releaseMask = 0, 0
    local notes = {}
    for i = 1, 8 do
      local voice = voices[i]
      if voice.active then activeMask = activeMask | (1 << (i - 1)) end
      if voice.envelopeStage == "release" then releaseMask = releaseMask | (1 << (i - 1)) end
      notes[#notes + 1] = voice.active and voice.note or -1
    end
    io.write(table.concat({ chosen, manager.chooseVoice(ctx, 0, 0), activeMask, releaseMask, table.unpack(notes) }, ",") .. "\n")
  end
end
