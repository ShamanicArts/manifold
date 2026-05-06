local C = require("behaviors.avsd.constants")
local U = require("behaviors.avsd.util")

local M = {}

local function rackFxBasePath(slot)
  return "/midi/synth/rack/fx/" .. math.max(1, U.round(slot or 1))
end

local function rackFxMixPath(slot)
  return rackFxBasePath(slot) .. "/mix"
end

local function rackFxParamPath(slot, paramIndex)
  return rackFxBasePath(slot) .. "/p/" .. math.max(0, U.round(paramIndex or 0))
end

function M.buildTargets()
  local targets = {
    { label = "Shader L1 P1", path = C.NS .. "/shader/layer/1/param/1", min = 0, max = 1, epsilon = 0.002 },
    { label = "FX1 Mix", path = rackFxMixPath(1), min = 0, max = 1, epsilon = 0.002 },
    { label = "Sampler Speed", path = C.NS .. "/speed", min = -2, max = 4, epsilon = 0.01 },
    { label = "Slice Select", path = C.NS .. "/selected_slice", min = 1, max = C.MAX, integer = true, epsilon = 0.0 },
  }

  for p = 2, 9 do
    targets[#targets + 1] = { label = "Shader L1 P" .. p, path = C.NS .. "/shader/layer/1/param/" .. p, min = 0, max = 1, epsilon = 0.002 }
  end
  for layer = 2, 8 do
    for p = 1, 9 do
      targets[#targets + 1] = { label = "Shader L" .. layer .. " P" .. p, path = C.NS .. "/shader/layer/" .. layer .. "/param/" .. p, min = 0, max = 1, epsilon = 0.002 }
    end
  end
  for p = 1, 5 do
    targets[#targets + 1] = { label = "FX1 Param " .. p, path = rackFxParamPath(1, p - 1), min = 0, max = 1, epsilon = 0.002 }
  end

  targets[#targets + 1] = { label = "Output", path = C.NS .. "/output", min = 0, max = 2, epsilon = 0.01 }
  targets[#targets + 1] = { label = "Root Note", path = C.NS .. "/root_note", min = 0, max = 127, integer = true, epsilon = 0.0 }
  targets[#targets + 1] = { label = "Voice Count", path = C.NS .. "/voice_count", min = 1, max = C.MAX, integer = true, epsilon = 0.0 }
  targets[#targets + 1] = { label = "Pitch Tracking", path = C.NS .. "/pitch_tracking", min = 0, max = 1, boolean = true, epsilon = 0.0 }
  targets[#targets + 1] = { label = "Play Start", path = C.NS .. "/play_start", min = 0, max = 1, epsilon = 0.002 }
  targets[#targets + 1] = { label = "Loop Start", path = C.NS .. "/loop_start", min = 0, max = 1, epsilon = 0.002 }
  targets[#targets + 1] = { label = "Loop End", path = C.NS .. "/loop_end", min = 0, max = 1, epsilon = 0.002 }
  targets[#targets + 1] = { label = "Crossfade", path = C.NS .. "/crossfade", min = 0, max = 0.5, epsilon = 0.001 }
  targets[#targets + 1] = { label = "Seg Gain", path = C.NS .. "/seg/gain", min = 0.25, max = 4, epsilon = 0.01 }
  targets[#targets + 1] = { label = "Seg Threshold", path = C.NS .. "/seg/threshold", min = 0, max = 1, epsilon = 0.002 }
  targets[#targets + 1] = { label = "Seg Feather", path = C.NS .. "/seg/feather", min = 0, max = 1, epsilon = 0.002 }
  targets[#targets + 1] = { label = "Seg Invert", path = C.NS .. "/seg/invert", min = 0, max = 1, boolean = true, epsilon = 0.0 }
  targets[#targets + 1] = { label = "Pose Confidence", path = C.NS .. "/pose/confidence", min = 0, max = 1, epsilon = 0.002 }
  return targets
end

M.TARGETS = M.buildTargets()
M.TARGET_LABELS = {}
for i = 1, #M.TARGETS do M.TARGET_LABELS[i] = M.TARGETS[i].label end

function M.targetSpec(index)
  local idx = math.max(1, math.min(#M.TARGETS, U.round(index or 1)))
  return M.TARGETS[idx], idx
end

function M.defaultMapping(track)
  return {
    enabled = track <= 2,
    source = track == 1 and 29 or (track == 2 and 32 or 1),
    target = track == 1 and 1 or (track == 2 and 2 or 1),
    min = 0.0,
    max = 1.0,
    invert = false,
  }
end

return M
