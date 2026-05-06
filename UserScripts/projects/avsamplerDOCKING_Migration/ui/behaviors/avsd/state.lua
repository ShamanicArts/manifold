local M = {}

function M.colInit(id)
  return {
    id = id,
    source = nil,
    fx = {},
  }
end

function M.syncCol1FromShader(ctx, deps)
  ctx._colData = ctx._colData or {}
  ctx._colData[1] = ctx._colData[1] or M.colInit(1)
  local cd = ctx._colData[1]
  cd.source = deps.cloneTable(deps.currentCol1SourceSpec(ctx))
  for i = 1, 8 do
    local L = ctx.shader.layers[i]
    local eff = L and ctx.effects and ctx.effects[L.effectIndex]
    cd.fx[i] = {
      effectIndex = L.effectIndex,
      params = { table.unpack(L.params or {}) },
      enabled = L.enabled and eff ~= nil,
    }
  end
end

function M.addColumn(ctx, sourceSpec)
  ctx._colData = ctx._colData or {}
  local id = 2
  while ctx._colData[id] do id = id + 1 end
  ctx._colData[id] = M.colInit(id)
  ctx._colData[id].source = sourceSpec
  if sourceSpec.kind == "columntap" then
    ctx._colData[id].source.tapIndex = sourceSpec.tapIndex or 0
  end
  ctx.sourceSelectionCol = id
  return id
end

function M.removeColumn(ctx, col)
  if col <= 1 then return end
  ctx._colData = ctx._colData or {}
  ctx._colData[col] = nil
  local sel = ctx.selection
  if sel and sel.col == col then
    ctx.selection = { col = 1, row = 2 }
  end
  if tonumber(ctx.sourceSelectionCol) == col then
    ctx.sourceSelectionCol = 1
  end
end

function M.colAddFx(ctx, col, effectIndex, deps)
  local cd = ctx._colData and ctx._colData[col]
  if not cd then return end
  local eff = ctx.effects and ctx.effects[effectIndex]
  if not eff then return end
  local params = {}
  for p = 1, 9 do
    local spec = eff.params and eff.params[p]
    params[p] = spec and (tonumber(spec.default) or 0.5) or 0.5
  end
  local slot = #cd.fx + 1
  cd.fx[slot] = { effectIndex = effectIndex, params = params, enabled = true }
  if col == 1 then
    local L = ctx.shader.layers[slot]
    if L then
      L.effectIndex = effectIndex
      L.params = { table.unpack(params) }
      L.enabled = true
      deps.writeParam(deps.NS .. "/shader/layer/" .. slot .. "/effect", effectIndex)
      deps.updateShader(ctx)
    end
  end
  ctx.selection = { col = col, row = slot + 1 }
end

function M.colRemoveFx(ctx, col, row, deps)
  local cd = ctx._colData and ctx._colData[col]
  if not cd or row <= 1 or row > #cd.fx + 1 then return end
  local fxSlot = row - 1
  table.remove(cd.fx, fxSlot)
  if col == 1 then
    for i = fxSlot, 7 do
      local src = ctx.shader.layers[i + 1]
      local dst = ctx.shader.layers[i]
      dst.effectIndex = src.effectIndex
      dst.params = { table.unpack(src.params or {}) }
      dst.enabled = src.enabled
      deps.writeParam(deps.NS .. "/shader/layer/" .. i .. "/effect", dst.effectIndex)
      for p = 1, 9 do
        deps.writeParam(deps.NS .. "/shader/layer/" .. i .. "/param/" .. p, dst.params[p] or 0.5)
      end
      deps.writeParam(deps.NS .. "/shader/layer/" .. i .. "/enabled", dst.enabled and 1 or 0)
    end
    local last = ctx.shader.layers[8]
    last.effectIndex = 1
    last.params = {0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5}
    last.enabled = false
    deps.writeParam(deps.NS .. "/shader/layer/8/enabled", 0)
    deps.updateShader(ctx)
  end
  local sel = ctx.selection
  if sel and sel.col == col and sel.row == row then
    ctx.selection = { col = col, row = 1 }
  end
end

return M
