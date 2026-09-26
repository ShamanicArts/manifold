-- Exercise the original Main Lua control law with minimal voice/node doubles.
local legacy = assert(arg[1], "legacy Main/lib directory required")
local scenarios = assert(arg[2], "scenario CSV required")
package.path = legacy .. "/?.lua;" .. package.path
local synth = require("sample_synth").create({}, {})
local position, speed, frequency = 0, 1, 330
local triggers, plays = 0, 0
local voice = { gate = 1, freq = 330,
  samplePlayback = {
    getNormalizedPosition = function() return position end,
    setSpeed = function(_, value) speed = value end,
    trigger = function() triggers = triggers + 1 end,
    play = function() plays = plays + 1 end,
  },
  osc = { setFrequency = function(_, value) frequency = value end },
}
local first = true
for line in io.lines(scenarios) do
  if first then first = false else
    local values = {}
    for field in line:gmatch("[^,]+") do values[#values + 1] = tonumber(field) end
    assert(#values == 9, "invalid scenario")
    local mode, samplePosition, depth, waveToSample, sampleToWave, retrigger, blend, gate, baseFrequency = table.unpack(values)
    position, voice.gate, voice.freq = samplePosition, gate, baseFrequency
    if gate <= 0.5 then
      synth.resetBlendVoiceFrameState(voice)
    else
      synth.updateBlendVoiceFrame(voice, {
        blendMode = mode, blendAmount = (blend + 1) * 0.5, blendModAmount = depth,
        waveToSample = waveToSample, sampleToWave = sampleToWave,
        sampleRetrigger = retrigger > 0.5, sr = 48000, blockSamples = 128,
        blendKeyTrack = 0, blendSamplePitch = 0, samplePitchMode = 0,
      })
    end
    io.write(string.format("%.17g,%.17g,%d,%d\n", frequency, speed, triggers, plays))
  end
end
