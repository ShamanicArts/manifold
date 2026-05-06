local C = require("behaviors.core.constants")
local U = require("behaviors.core.util")
local ML = require("behaviors.core.ml")

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

function M.applyTrack(ctx, track)
  local mapping = ctx.mappings[track]
  if not mapping or not mapping.enabled then return nil end
  local sourceValue = U.clamp(ML.poseSourceValue(ctx, track), 0, 1)
  if not mapping.invert then sourceValue = 1.0 - sourceValue end
  local target, targetIndex = M.targetSpec(mapping.target or 1)
  local minNorm = U.clamp(mapping.min or 0, 0, 1)
  local maxNorm = U.clamp(mapping.max or 1, 0, 1)
  local normalizedTarget = minNorm + sourceValue * (maxNorm - minNorm)
  local value = target.min + normalizedTarget * (target.max - target.min)
  if target.boolean then
    value = normalizedTarget >= 0.5 and 1 or 0
  elseif target.integer then
    value = U.round(value)
  end
  U.writeParamIfChanged(ctx, "mapping." .. track .. "." .. target.path, target.path, value, target.epsilon or 0.002)
  return {
    track = track,
    sourceValue = sourceValue,
    value = value,
    targetIndex = targetIndex,
    targetLabel = target.label,
  }
end

function M.apply(ctx, deps)
  if deps and deps.profileStart then deps.profileStart(ctx, "applyMapping") end
  local active, firstSummary = 0, nil
  for t = 1, C.MAX_MAPPINGS do
    if ctx.mappings[t] and ctx.mappings[t].enabled then
      active = active + 1
      local summary = M.applyTrack(ctx, t)
      if firstSummary == nil and summary ~= nil then firstSummary = summary end
    end
  end
  if active <= 0 then
    if deps and deps.profileEnd then deps.profileEnd(ctx, "applyMapping") end
    U.setText(ctx.widgets.mappingStatus, "Mapping: disabled")
    return
  end
  if firstSummary then
    U.setText(ctx.widgets.mappingStatus, string.format(
      "Mapping: %d active | T%d %s %.2f → %.3f",
      active,
      firstSummary.track,
      firstSummary.targetLabel,
      firstSummary.sourceValue,
      firstSummary.value
    ))
  else
    U.setText(ctx.widgets.mappingStatus, string.format("Mapping: %d active", active))
  end
  if deps and deps.profileEnd then deps.profileEnd(ctx, "applyMapping") end
end

return M
