-- Debug version of stereo delay test
function buildPlugin(ctx)
  local osc = ctx.primitives.OscillatorNode.new()
  local delay = ctx.primitives.StereoDelayNode.new()
  local gain = ctx.primitives.GainNode.new(2)
  
  -- Use sawtooth (waveform 1) for better delay audibility
  osc:setWaveform(1)
  osc:setFrequency(220)  -- A3 note
  
  -- Set extreme delay values for testing
  delay:setTimeL(500)    -- 500ms left
  delay:setTimeR(750)    -- 750ms right  
  delay:setFeedback(0.9) -- High feedback for audible repeats
  delay:setMix(0.8)      -- Mostly wet
  
  -- Signal chain
  ctx.graph.connect(osc, delay)
  ctx.graph.connect(delay, gain)
  
  -- Debug output
  print("Delay node created")
  print("Time L:", 500)
  print("Time R:", 750)
  print("Feedback:", 0.9)
  print("Mix:", 0.8)
  
  return {
    inputs = {},
    outputs = { gain },
    parameters = {
      { id = "delay_time_l", name = "Delay Time L", min = 1, max = 5000, default = 500 },
      { id = "delay_time_r", name = "Delay Time R", min = 1, max = 5000, default = 750 },
      { id = "feedback", name = "Feedback", min = 0, max = 1.2, default = 0.9 },
      { id = "mix", name = "Mix", min = 0, max = 1, default = 0.8 },
    },
    onParameterChange = function(paramId, value)
      if paramId == "delay_time_l" then
        delay:setTimeL(value)
        print("Set TimeL to:", value)
      elseif paramId == "delay_time_r" then
        delay:setTimeR(value)
        print("Set TimeR to:", value)
      elseif paramId == "feedback" then
        delay:setFeedback(value)
        print("Set Feedback to:", value)
      elseif paramId == "mix" then
        delay:setMix(value)
        print("Set Mix to:", value)
      end
    end
  }
end