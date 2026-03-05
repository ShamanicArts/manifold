-- test_spectrum.lua
-- Spectrum analyzer test

function buildPlugin(ctx)
  local osc = ctx.primitives.OscillatorNode.new()
  local sat = ctx.primitives.WaveShaperNode.new()
  local spec = ctx.primitives.SpectrumAnalyzerNode.new()
  local out = ctx.primitives.GainNode.new(2)

  osc:setWaveform(2)
  osc:setFrequency(90)
  osc:setAmplitude(0.35)

  sat:setDrive(10.0)
  sat:setMix(1.0)

  spec:setSensitivity(1.4)
  spec:setSmoothing(0.88)
  spec:setFloor(-72)

  out:setGain(0.25)

  ctx.graph.connect(osc, sat)
  ctx.graph.connect(sat, spec)
  ctx.graph.connect(spec, out)

  ctx.params.register("/test/spec/freq", { type = "f", min = 40, max = 1200, default = 90 })
  ctx.params.bind("/test/spec/freq", osc, "setFrequency")

  ctx.params.register("/test/spec/sensitivity", { type = "f", min = 0.1, max = 8.0, default = 1.4 })
  ctx.params.bind("/test/spec/sensitivity", spec, "setSensitivity")

  ctx.params.register("/test/spec/smoothing", { type = "f", min = 0.0, max = 0.999, default = 0.88 })
  ctx.params.bind("/test/spec/smoothing", spec, "setSmoothing")

  ctx.params.register("/test/spec/floor", { type = "f", min = -96, max = -12, default = -72 })
  ctx.params.bind("/test/spec/floor", spec, "setFloor")

  ctx.params.register("/test/spec/drive", { type = "f", min = 0, max = 40, default = 10 })
  ctx.params.bind("/test/spec/drive", sat, "setDrive")

  ctx.params.register("/test/output/gain", { type = "f", min = 0, max = 1, default = 0.25 })
  ctx.params.bind("/test/output/gain", out, "setGain")

  return {
    description = "Spectrum analyzer test",
    params = {
      "/test/spec/freq",
      "/test/spec/sensitivity",
      "/test/spec/smoothing",
      "/test/spec/floor",
      "/test/spec/drive",
      "/test/output/gain"
    }
  }
end

return buildPlugin
