-- test_svf.lua
-- Test script for State Variable Filter
-- Usage: ctx = { primitives = ..., graph = ..., params = ... }

function buildPlugin(ctx)
  local osc = ctx.primitives.OscillatorNode.new()
  local svf = ctx.primitives.SVFNode.new()
  local gain = ctx.primitives.GainNode.new(2)  -- Stereo output
  
  -- Use sawtooth (waveform 1) for better filter audibility
  osc:setWaveform(1)
  
  -- Signal chain: osc -> svf -> gain -> output
  ctx.graph.connect(osc, svf)
  ctx.graph.connect(svf, gain)
  
  -- Parameters
  ctx.params.register("/test/svf/cutoff", {
    type = "f",
    min = 40.0,
    max = 10000.0,
    default = 1000.0,
    description = "Filter cutoff frequency"
  })
  ctx.params.bind("/test/svf/cutoff", svf, "setCutoff")
  
  ctx.params.register("/test/svf/resonance", {
    type = "f",
    min = 0.0,
    max = 1.0,
    default = 0.5,
    description = "Filter resonance/Q"
  })
  ctx.params.bind("/test/svf/resonance", svf, "setResonance")
  
  ctx.params.register("/test/svf/mode", {
    type = "i",
    min = 0,
    max = 4,
    default = 0,
    description = "Filter mode: 0=LP, 1=BP, 2=HP, 3=Notch, 4=Peak"
  })
  ctx.params.bind("/test/svf/mode", svf, "setMode")
  
  ctx.params.register("/test/svf/drive", {
    type = "f",
    min = 0.0,
    max = 10.0,
    default = 0.0,
    description = "Input drive/saturation"
  })
  ctx.params.bind("/test/svf/drive", svf, "setDrive")
  
  ctx.params.register("/test/svf/mix", {
    type = "f",
    min = 0.0,
    max = 1.0,
    default = 1.0,
    description = "Dry/wet mix"
  })
  ctx.params.bind("/test/svf/mix", svf, "setMix")
  
  ctx.params.register("/test/osc/freq", {
    type = "f",
    min = 40.0,
    max = 2000.0,
    default = 220.0,
    description = "Oscillator frequency"
  })
  ctx.params.bind("/test/osc/freq", osc, "setFrequency")
  
  ctx.params.register("/test/output/gain", {
    type = "f",
    min = 0.0,
    max = 1.0,
    default = 0.3,
    description = "Output gain"
  })
  ctx.params.bind("/test/output/gain", gain, "setGain")
  
  return {
    description = "SVF Filter Test - Sweepable resonant filter on oscillator",
    params = {
      "/test/svf/cutoff",
      "/test/svf/resonance",
      "/test/svf/mode",
      "/test/svf/drive",
      "/test/svf/mix",
      "/test/osc/freq",
      "/test/output/gain"
    }
  }
end

return buildPlugin
