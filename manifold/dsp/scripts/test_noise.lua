-- test_noise.lua
-- Noise generator test

function buildPlugin(ctx)
  local noise = ctx.primitives.NoiseGeneratorNode.new()
  local gain = ctx.primitives.GainNode.new(2)

  noise:setLevel(0.25)
  noise:setColor(0.1)

  gain:setGain(0.4)

  ctx.graph.connect(noise, gain)

  ctx.params.register("/test/noise/level", { type = "f", min = 0, max = 1, default = 0.25 })
  ctx.params.bind("/test/noise/level", noise, "setLevel")

  ctx.params.register("/test/noise/color", { type = "f", min = 0, max = 1, default = 0.1 })
  ctx.params.bind("/test/noise/color", noise, "setColor")

  ctx.params.register("/test/output/gain", { type = "f", min = 0, max = 1, default = 0.4 })
  ctx.params.bind("/test/output/gain", gain, "setGain")

  return {
    description = "Noise generator test",
    params = {
      "/test/noise/level",
      "/test/noise/color",
      "/test/output/gain"
    }
  }
end

return buildPlugin
