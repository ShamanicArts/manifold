local legacy = loadDspModule("../looper_primitives_dsp.lua")

local M = {}

function M.buildPlugin(ctx)
  if type(legacy) ~= "table" or type(legacy.buildPlugin) ~= "function" then
    error("system looper primitives module did not expose buildPlugin(ctx)")
  end
  return legacy.buildPlugin(ctx)
end

return M
