local legacy = loadDspModule("../donut_looper_super_dsp.lua")

local M = {}

function M.buildPlugin(ctx)
  if type(legacy) == "function" then
    return legacy(ctx)
  end
  if type(legacy) == "table" and type(legacy.buildPlugin) == "function" then
    return legacy.buildPlugin(ctx)
  end
  error("system donut super module did not expose buildPlugin(ctx)")
end

return M
