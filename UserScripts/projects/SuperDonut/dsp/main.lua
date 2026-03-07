-- Project DSP entry for SuperDonut.
--
-- The project owns the top-level composition here:
-- 1. project-local reusable looper baseline
-- 2. project-local Super FX extension
-- 3. one single dispatch seam for runtime params
--
-- This keeps authorship explicit without hiding the project behind a system DSP
-- script or trying to run multiple buildPlugin(ctx) bodies on the same graph.

local looperBaseline = loadDspModule("./looper_baseline.lua")
local super = loadDspModule("./super_extension.lua")

local function normalizePath(path)
  if type(path) ~= "string" then
    return path
  end
  if string.sub(path, 1, 21) == "/core/behavior/super/" then
    return "/core/super/" .. string.sub(path, 22)
  end
  return path
end

function buildPlugin(ctx)
  if type(looperBaseline) ~= "table" or type(looperBaseline.attach) ~= "function" then
    error("project looper baseline did not expose attach(ctx)")
  end

  local baseline = looperBaseline.attach(ctx)
  local superFx = nil

  if type(super) == "table" and type(super.attach) == "function" then
    superFx = super.attach(ctx, baseline.layers)
  end

  return {
    onParamChange = function(path, value)
      path = normalizePath(path)

      if baseline and type(baseline.applyParam) == "function" and baseline.applyParam(path, value) then
        return
      end

      if superFx and type(superFx.applyParam) == "function" and superFx.applyParam(path, value) then
        return
      end
    end,
  }
end
