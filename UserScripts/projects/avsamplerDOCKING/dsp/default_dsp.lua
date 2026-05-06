-- avsamplerDOCKING DSP stub.
-- Minimal passthrough — the UI docking skeleton is the focus.

local NS = "/avsampler"
local MAX = 8

function buildPlugin(ctx)
  local P = ctx.primitives
  local input = P.PassthroughNode.new(2)
  local output = P.GainNode.new(2)
  output:setGain(1.0)

  ctx.graph.connect(input, output)
  if ctx.graph.markInput then ctx.graph.markInput(input) end
  if ctx.graph.markOutput then ctx.graph.markOutput(output) end

  -- Register params (mirrors UI skeleton's registerParam calls for safety)
  local function reg(path, min, max, default)
    ctx.params.register(path, { type="f", min=min, max=max, default=default })
  end
  reg(NS .. "/mode", 0, 1, 0)
  reg(NS .. "/capture_mode", 0, 1, 0)
  reg(NS .. "/speed", -2, 4, 1)
  reg(NS .. "/output", 0, 2, 0.8)
  reg(NS .. "/root_note", 0, 127, 60)
  reg(NS .. "/pitch_tracking", 0, 1, 1)
  reg(NS .. "/voice_count", 1, MAX, MAX)
  reg(NS .. "/capture_seconds", 0.25, 6, 4)
  reg(NS .. "/capture_trigger", 0, 1000000, 0)
  reg(NS .. "/play_trigger", 0, 1000000, 0)
  reg(NS .. "/stop_trigger", 0, 1000000, 0)
  reg(NS .. "/play_start", 0, 1, 0)
  reg(NS .. "/loop_start", 0, 1, 0)
  reg(NS .. "/loop_end", 0, 1, 1)
  reg(NS .. "/crossfade", 0, 0.5, 0.03)
  reg(NS .. "/one_shot", 0, 1, 0)
  reg(NS .. "/selected_slice", 1, MAX, 1)
  reg(NS .. "/seg/gain", 0.25, 4, 1)
  reg(NS .. "/seg/threshold", 0, 1, 0.5)
  reg(NS .. "/seg/feather", 0, 1, 0.15)
  reg(NS .. "/seg/invert", 0, 1, 0)
  reg(NS .. "/pose/confidence", 0, 1, 0.3)
  reg(NS .. "/shader/source", 1, 128, 1)
  reg(NS .. "/shader/active_layer", 1, 8, 1)
  for i = 1, MAX do
    reg(NS .. "/slice/" .. i .. "/start", 0, 0.999, (i-1)/MAX)
    reg(NS .. "/slice/" .. i .. "/trigger", 0, 1000000, 0)
    reg(NS .. "/slice/" .. i .. "/velocity", 0, 127, 127)
  end
  for i = 1, 8 do
    reg(NS .. "/shader/layer/" .. i .. "/enabled", 0, 1, i == 1 and 1 or 0)
    reg(NS .. "/shader/layer/" .. i .. "/effect", 1, 128, 1)
    for p = 1, 9 do reg(NS .. "/shader/layer/" .. i .. "/param/" .. p, 0, 1, 0.5) end
  end
  for i = 1, 8 do
    reg(NS .. "/mapping/" .. i .. "/enabled", 0, 1, i <= 2 and 1 or 0)
    reg(NS .. "/mapping/" .. i .. "/source", 1, 64, i == 1 and 29 or (i == 2 and 32 or 1))
    reg(NS .. "/mapping/" .. i .. "/target", 1, 128, 1)
    reg(NS .. "/mapping/" .. i .. "/min", 0, 1, 0)
    reg(NS .. "/mapping/" .. i .. "/max", 0, 1, 1)
    reg(NS .. "/mapping/" .. i .. "/invert", 0, 1, 0)
  end
  for s = 1, 2 do
    reg("/midi/synth/rack/fx/" .. s .. "/type", 0, 20, 0)
    reg("/midi/synth/rack/fx/" .. s .. "/mix", 0, 1, 0)
    for p = 0, 4 do reg("/midi/synth/rack/fx/" .. s .. "/p/" .. p, 0, 1, 0.5) end
  end

  return { description = "AVSamplerDocking — UI skeleton with ImGui docking", input = input, output = output, onParamChange = function(path, value) end }
end
