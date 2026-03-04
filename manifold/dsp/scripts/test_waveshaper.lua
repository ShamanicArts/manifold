-- test_waveshaper.lua
-- Wave shaper test patch with multiple curve types

function buildPlugin(ctx)
  local osc = ctx.primitives.OscillatorNode.new()
  local shaper = ctx.primitives.WaveShaperNode.new()
  local gain = ctx.primitives.GainNode.new(2)

  -- Saw wave input for rich harmonic content
  osc:setWaveform(2)
  osc:setFrequency(110)
  osc:setAmplitude(0.5)

  -- Default to tanh (musical soft clipping)
  shaper:setCurve(0)      -- Tanh
  shaper:setDrive(12.0)   -- Moderate drive
  shaper:setOutput(-3.0)  -- Slight compensation
  shaper:setPreFilter(0)  -- Bypass pre-filter
  shaper:setPostFilter(0) -- Bypass post-filter
  shaper:setBias(0.0)     -- Symmetric
  shaper:setMix(1.0)      -- Full wet
  shaper:setOversample(2) -- 2x oversampling

  ctx.graph.connect(osc, shaper)
  ctx.graph.connect(shaper, gain)

  -- Curve type (0-6)
  ctx.params.register("/test/waveshaper/curve", { 
    type = "f", min = 0, max = 6, default = 0,
    description = "0=Tanh,1=Tube,2=Tape,3=HardClip,4=Foldback,5=Sigmoid,6=SoftClip"
  })
  ctx.params.bind("/test/waveshaper/curve", shaper, "setCurve")

  -- Drive (0-40 dB)
  ctx.params.register("/test/waveshaper/drive", { type = "f", min = 0, max = 40, default = 12 })
  ctx.params.bind("/test/waveshaper/drive", shaper, "setDrive")

  -- Output gain (-20 to +20 dB)
  ctx.params.register("/test/waveshaper/output", { type = "f", min = -20, max = 20, default = -3 })
  ctx.params.bind("/test/waveshaper/output", shaper, "setOutput")

  -- Pre-filter (0 = bypass, 20-20000 Hz)
  ctx.params.register("/test/waveshaper/prefilter", { type = "f", min = 0, max = 10000, default = 0 })
  ctx.params.bind("/test/waveshaper/prefilter", shaper, "setPreFilter")

  -- Post-filter (0 = bypass, 20-20000 Hz)
  ctx.params.register("/test/waveshaper/postfilter", { type = "f", min = 0, max = 10000, default = 0 })
  ctx.params.bind("/test/waveshaper/postfilter", shaper, "setPostFilter")

  -- Bias (-1 to +1 for asymmetric distortion)
  ctx.params.register("/test/waveshaper/bias", { type = "f", min = -1, max = 1, default = 0 })
  ctx.params.bind("/test/waveshaper/bias", shaper, "setBias")

  -- Mix (0-1, wet/dry)
  ctx.params.register("/test/waveshaper/mix", { type = "f", min = 0, max = 1, default = 1 })
  ctx.params.bind("/test/waveshaper/mix", shaper, "setMix")

  -- Oversampling (1, 2, or 4)
  ctx.params.register("/test/waveshaper/oversample", { type = "f", min = 1, max = 4, default = 2 })
  ctx.params.bind("/test/waveshaper/oversample", shaper, "setOversample")

  -- Output gain
  ctx.params.register("/test/output/gain", { type = "f", min = 0, max = 1, default = 0.3 })
  ctx.params.bind("/test/output/gain", gain, "setGain")

  return {
    description = "Wave Shaper test - multiple distortion curves",
    params = {
      "/test/waveshaper/curve",
      "/test/waveshaper/drive",
      "/test/waveshaper/output",
      "/test/waveshaper/prefilter",
      "/test/waveshaper/postfilter",
      "/test/waveshaper/bias",
      "/test/waveshaper/mix",
      "/test/waveshaper/oversample",
      "/test/output/gain"
    }
  }
end

return buildPlugin
