-- test_stereo_delay.lua
-- Test script for Stereo Delay

function buildPlugin(ctx)
  local osc = ctx.primitives.OscillatorNode.new()
  local delay = ctx.primitives.StereoDelayNode.new()
  local gain = ctx.primitives.GainNode.new(2)
  
  -- Use sawtooth (waveform 1) for better delay audibility
  osc:setWaveform(1)
  
  -- Signal chain: osc -> delay -> gain
  ctx.graph.connect(osc, delay)
  ctx.graph.connect(delay, gain)
  
  -- Tempo for synced mode
  delay:setTempo(120)
  
  -- Parameters
  ctx.params.register("/test/delay/timemode", {
    type = "i",
    min = 0,
    max = 1,
    default = 0,
    description = "0=Free(ms), 1=Synced(division)"
  })
  ctx.params.bind("/test/delay/timemode", delay, "setTimeMode")
  
  ctx.params.register("/test/delay/timel", {
    type = "f",
    min = 10,
    max = 2000,
    default = 250,
    description = "Left delay time (ms)"
  })
  ctx.params.bind("/test/delay/timel", delay, "setTimeL")
  
  ctx.params.register("/test/delay/timer", {
    type = "f",
    min = 10,
    max = 2000,
    default = 375,
    description = "Right delay time (ms)"
  })
  ctx.params.bind("/test/delay/timer", delay, "setTimeR")
  
  ctx.params.register("/test/delay/feedback", {
    type = "f",
    min = 0,
    max = 1.2,
    default = 0.3,
    description = "Feedback amount"
  })
  ctx.params.bind("/test/delay/feedback", delay, "setFeedback")
  
  ctx.params.register("/test/delay/pingpong", {
    type = "i",
    min = 0,
    max = 1,
    default = 0,
    description = "Ping-pong mode"
  })
  ctx.params.bind("/test/delay/pingpong", delay, "setPingPong")
  
  ctx.params.register("/test/delay/filter", {
    type = "i",
    min = 0,
    max = 1,
    default = 0,
    description = "Enable feedback filter"
  })
  ctx.params.bind("/test/delay/filter", delay, "setFilterEnabled")
  
  ctx.params.register("/test/delay/filtercutoff", {
    type = "f",
    min = 200,
    max = 10000,
    default = 4000,
    description = "Filter cutoff"
  })
  ctx.params.bind("/test/delay/filtercutoff", delay, "setFilterCutoff")
  
  ctx.params.register("/test/delay/mix", {
    type = "f",
    min = 0,
    max = 1,
    default = 0.5,
    description = "Dry/wet mix"
  })
  ctx.params.bind("/test/delay/mix", delay, "setMix")
  
  ctx.params.register("/test/delay/freeze", {
    type = "i",
    min = 0,
    max = 1,
    default = 0,
    description = "Freeze buffer"
  })
  ctx.params.bind("/test/delay/freeze", delay, "setFreeze")
  
  ctx.params.register("/test/osc/freq", {
    type = "f",
    min = 40,
    max = 880,
    default = 220,
    description = "Oscillator frequency"
  })
  ctx.params.bind("/test/osc/freq", osc, "setFrequency")
  
  ctx.params.register("/test/output/gain", {
    type = "f",
    min = 0,
    max = 1,
    default = 0.4,
    description = "Output gain"
  })
  ctx.params.bind("/test/output/gain", gain, "setGain")
  
  return {
    description = "Stereo Delay Test - Ping-pong and filtered delays",
    params = {
      "/test/delay/timemode",
      "/test/delay/timel",
      "/test/delay/timer",
      "/test/delay/feedback",
      "/test/delay/pingpong",
      "/test/delay/filter",
      "/test/delay/filtercutoff",
      "/test/delay/mix",
      "/test/delay/freeze",
      "/test/osc/freq",
      "/test/output/gain"
    }
  }
end

return buildPlugin
