local M = {}

M.SOURCE_LIVE = 0
M.SOURCE_LAYER_MIN = 1
M.SOURCE_LAYER_MAX = 4

function M.buildConfig(options)
  options = options or {}

  local sourceSpecs = {}
  local liveInput = options.liveInput
  local layerSourceNodes = options.layerSourceNodes or {}

  if liveInput then
    sourceSpecs[#sourceSpecs + 1] = {
      id = M.SOURCE_LIVE,
      name = "live",
      node = liveInput,
      kind = "live",
    }
  end

  for i = M.SOURCE_LAYER_MIN, M.SOURCE_LAYER_MAX do
    local node = layerSourceNodes[i]
    if node then
      sourceSpecs[#sourceSpecs + 1] = {
        id = i,
        name = string.format("layer%d", i),
        node = node,
        kind = "layer",
        layerIndex = i,
      }
    end
  end

  table.sort(sourceSpecs, function(a, b)
    return (tonumber(a and a.id) or 0) < (tonumber(b and b.id) or 0)
  end)

  return {
    sourceSpecs = sourceSpecs,
    defaultSourceId = M.SOURCE_LIVE,
    paramMin = M.SOURCE_LIVE,
    paramMax = M.SOURCE_LAYER_MAX,
  }
end

return M
