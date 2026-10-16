-- Exercise original Main pitch helpers and the wave assignment with node doubles.
local legacy = assert(arg[1], "legacy Main/lib directory required")
local scenarios = assert(arg[2], "scenario CSV required")
package.path = legacy .. "/?.lua;" .. package.path
local synth = require("sample_synth").create({}, {})
local function noteToFrequency(note)
  return 440.0 * 2.0 ^ ((note - 69.0) / 12.0)
end
local wave, speed, semitones, mix = 0, 0, 0, 0
local voice = { gate = 1, freq = 220,
  samplePlayback = {
    getNormalizedPosition = function() return 0 end,
    setSpeed = function(_, value) speed = value end,
  },
  samplePhaseVocoder = {
    setPitchSemitones = function(_, value) semitones = value end,
    setMix = function(_, value) mix = value end,
  },
  osc = { setFrequency = function(_, value) wave = value end },
}
local first = true
for line in io.lines(scenarios) do
  if first then first = false else
    local values = {}
    for field in line:gmatch("[^,]+") do values[#values + 1] = tonumber(field) end
    assert(#values == 5, "invalid pitch scenario")
    local frequency, root, keytrack, pitch, mode = table.unpack(values)
    voice.freq = frequency
    local options = {
      blendKeyTrack = keytrack, blendSamplePitch = pitch, sampleRootNote = root,
      samplePitchMode = mode, samplePitchModePhaseVocoder = 1,
      samplePitchModePhaseVocoderHQ = 2, noteToFrequency = noteToFrequency,
      blendMode = 0, sr = 48000, blockSamples = 128,
    }
    synth.applyPitchModeToVoice(voice, options)
    synth.updateBlendVoiceFrame(voice, options)
    local ratio = synth.getBlendSampleDesiredPitchRatio(voice, options)
    io.write(string.format("%.17g,%.17g,%.17g,%.17g,%.17g,%d\n",
      wave, ratio, speed, semitones, mix, mode == 2 and 1 or 0))
  end
end
