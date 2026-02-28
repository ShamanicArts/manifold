-- Test User DSP Script
-- Simple delay effect to verify user DSP scripts work

function buildPlugin(ctx)
  local input = ctx.primitives.PassthroughNode.new(2)
  local delay = ctx.primitives.PassthroughNode.new(2)
  local mix = ctx.primitives.PassthroughNode.new(2)

  ctx.graph.connect(input, delay)
  ctx.graph.connect(input, mix)
  ctx.graph.connect(delay, mix)

  ctx.params.register("/dsp/delay/time", { type="f", min=10, max=1000, default=250 })
  ctx.params.register("/dsp/delay/feedback", { type="f", min=0, max=0.9, default=0.3 })
  ctx.params.register("/dsp/delay/mix", { type="f", min=0, max=1, default=0.5 })

  ctx.params.bind("/dsp/delay/time", delay, "setDelayMs")
  ctx.params.bind("/dsp/delay/feedback", delay, "setFeedback")
  ctx.params.bind("/dsp/delay/mix", mix, "setMix")

  return {}
end
