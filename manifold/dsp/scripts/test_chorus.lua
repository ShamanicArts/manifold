-- test_chorus.lua
-- Chorus/ensemble test patch

function buildPlugin(ctx)
  local osc = ctx.primitives.OscillatorNode.new()
  local chorus = ctx.primitives.ChorusNode.new()
  local gain = ctx.primitives.GainNode.new(2)

  osc:setWaveform(2)   -- saw
  osc:setFrequency(220)
  osc:setAmplitude(0.35)

  chorus:setRate(0.7)
  chorus:setDepth(0.5)
  chorus:setVoices(3)
  chorus:setSpread(0.8)
  chorus:setFeedback(0.15)
  chorus:setWaveform(0) -- sine
  chorus:setMix(0.55)

  ctx.graph.connect(osc, chorus)
  ctx.graph.connect(chorus, gain)

  ctx.params.register("/test/chorus/rate", {
    type = "f", min = 0.1, max = 10.0, default = 0.7,
    description = "LFO rate (Hz)"
  })
  ctx.params.bind("/test/chorus/rate", chorus, "setRate")

  ctx.params.register("/test/chorus/depth", {
    type = "f", min = 0.0, max = 1.0, default = 0.5,
    description = "Modulation depth"
  })
  ctx.params.bind("/test/chorus/depth", chorus, "setDepth")

  ctx.params.register("/test/chorus/voices", {
    type = "f", min = 1.0, max = 4.0, default = 3.0,
    description = "Number of chorus voices"
  })
  ctx.params.bind("/test/chorus/voices", chorus, "setVoices")

  ctx.params.register("/test/chorus/spread", {
    type = "f", min = 0.0, max = 1.0, default = 0.8,
    description = "Stereo spread"
  })
  ctx.params.bind("/test/chorus/spread", chorus, "setSpread")

  ctx.params.register("/test/chorus/feedback", {
    type = "f", min = 0.0, max = 0.9, default = 0.15,
    description = "Feedback amount"
  })
  ctx.params.bind("/test/chorus/feedback", chorus, "setFeedback")

  ctx.params.register("/test/chorus/waveform", {
    type = "f", min = 0.0, max = 1.0, default = 0.0,
    description = "LFO waveform: 0=sine, 1=triangle"
  })
  ctx.params.bind("/test/chorus/waveform", chorus, "setWaveform")

  ctx.params.register("/test/chorus/mix", {
    type = "f", min = 0.0, max = 1.0, default = 0.55,
    description = "Dry/wet mix"
  })
  ctx.params.bind("/test/chorus/mix", chorus, "setMix")

  ctx.params.register("/test/output/gain", {
    type = "f", min = 0.0, max = 1.0, default = 0.25,
    description = "Master output gain"
  })
  ctx.params.bind("/test/output/gain", gain, "setGain")

  return {
    description = "Chorus test - multi voice modulation",
    params = {
      "/test/chorus/rate",
      "/test/chorus/depth",
      "/test/chorus/voices",
      "/test/chorus/spread",
      "/test/chorus/feedback",
      "/test/chorus/waveform",
      "/test/chorus/mix",
      "/test/output/gain"
    }
  }
end

return buildPlugin
