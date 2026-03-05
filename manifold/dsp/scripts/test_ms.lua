-- test_ms.lua
-- MS encode/decode + width test

function buildPlugin(ctx)
  local o1 = ctx.primitives.OscillatorNode.new()
  local o2 = ctx.primitives.OscillatorNode.new()
  local mix = ctx.primitives.MixerNode.new()
  local enc = ctx.primitives.MSEncoderNode.new()
  local dec = ctx.primitives.MSDecoderNode.new()
  local gain = ctx.primitives.GainNode.new(2)

  o1:setWaveform(2)
  o1:setFrequency(110)
  o1:setAmplitude(0.22)

  o2:setWaveform(2)
  o2:setFrequency(220)
  o2:setAmplitude(0.22)

  mix:setGain1(1.0)
  mix:setGain2(1.0)
  mix:setPan1(-1.0)
  mix:setPan2(1.0)
  mix:setMaster(1.0)

  enc:setWidth(1.0)
  gain:setGain(0.3)

  ctx.graph.connect(o1, mix, 0, 0)
  ctx.graph.connect(o2, mix, 0, 1)
  ctx.graph.connect(mix, enc)
  ctx.graph.connect(enc, dec)
  ctx.graph.connect(dec, gain)

  ctx.params.register("/test/ms/width", { type = "f", min = 0, max = 2, default = 1.0 })
  ctx.params.bind("/test/ms/width", enc, "setWidth")

  ctx.params.register("/test/output/gain", { type = "f", min = 0, max = 1, default = 0.3 })
  ctx.params.bind("/test/output/gain", gain, "setGain")

  return {
    description = "MS encode/decode test",
    params = {
      "/test/ms/width",
      "/test/output/gain"
    }
  }
end

return buildPlugin
