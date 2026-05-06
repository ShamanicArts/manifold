local C = require("behaviors.core.constants")
local U = require("behaviors.core.util")

local M = {}

local function profileStart(deps, ctx, key)
  if deps and deps.profileStart then deps.profileStart(ctx, key) end
end

local function profileEnd(deps, ctx, key)
  if deps and deps.profileEnd then deps.profileEnd(ctx, key) end
end

function M.canonicalAspectSizeForSpec(ctx, spec, deps, depth)
  depth = depth or 0
  if depth > 4 then
    return math.max(1, U.round(ctx.outputW or 1920)), math.max(1, U.round(ctx.outputH or 1080))
  end
  local kind = spec and spec.kind or "webcam"
  if kind == "webcam" or kind == "ml" then
    local frame = (capture and capture.getFrameInfo and capture.getFrameInfo()) or {}
    if frame.valid and tonumber(frame.width) and tonumber(frame.height) then
      return math.max(1, U.round(frame.width)), math.max(1, U.round(frame.height))
    end
    return math.max(1, U.round(ctx.outputW or 1920)), math.max(1, U.round(ctx.outputH or 1080))
  elseif kind == "columntap" then
    local sourceCol = tonumber(spec.sourceCol) or 1
    local nextSpec = deps and deps.sourceSpecForColumn and deps.sourceSpecForColumn(ctx, sourceCol) or nil
    if nextSpec and nextSpec ~= spec then
      return M.canonicalAspectSizeForSpec(ctx, nextSpec, deps, depth + 1)
    end
    return math.max(1, U.round(ctx.outputW or 1920)), math.max(1, U.round(ctx.outputH or 1080))
  end
  return math.max(1, U.round(ctx.outputW or 1920)), math.max(1, U.round(ctx.outputH or 1080))
end

function M.canonicalAspectSize(ctx, deps)
  local spec = (deps and deps.sourceSpecForColumn and deps.sourceSpecForColumn(ctx, 1))
    or (deps and deps.currentCol1SourceSpec and deps.currentCol1SourceSpec(ctx))
  return M.canonicalAspectSizeForSpec(ctx, spec, deps, 0)
end

function M.syncCanonicalSurfaceBounds(ctx, deps)
  local w, h = M.canonicalAspectSize(ctx, deps)
  if ctx._canonicalSurfaceW == w and ctx._canonicalSurfaceH == h then return w, h end
  ctx._canonicalSurfaceW, ctx._canonicalSurfaceH = w, h

  if ctx._compoOutNodes then
    for _, n in pairs(ctx._compoOutNodes) do
      if n and n.setBounds then n:setBounds(0, 0, w, h) end
    end
  end
  if ctx._stackSurfaceNodes then
    for _, n in pairs(ctx._stackSurfaceNodes) do
      if n and n.setBounds then n:setBounds(0, 0, w, h) end
    end
  end
  if ctx._auxSourceNodes then
    for _, entry in pairs(ctx._auxSourceNodes) do
      local n = entry and entry.node or nil
      if n and n.setBounds then n:setBounds(0, 0, w, h) end
    end
  end
  if ctx._shaderSourceNode and ctx._shaderSourceNode.node and ctx._shaderSourceNode.node.setBounds then
    ctx._shaderSourceNode.node:setBounds(0, 0, w, h)
  end
  ctx._stackNodeSigs = {}
  ctx._gridThumbSigs = {}
  ctx._compoThumbSigs = {}
  return w, h
end

function M.updateOutputAspect(ctx, deps)
  local mode = ctx.aspectMode or "16:9"
  if mode == "Native" then
    local frame = (capture and capture.getFrameInfo and capture.getFrameInfo()) or {}
    if frame.valid and tonumber(frame.width) and tonumber(frame.height) then
      ctx.outputW = tonumber(frame.width)
      ctx.outputH = tonumber(frame.height)
    else
      ctx.outputW = 1920
      ctx.outputH = 1080
    end
  elseif mode == "16:9" then
    ctx.outputW = 1920
    ctx.outputH = 1080
  elseif mode == "4:3" then
    ctx.outputW = 1440
    ctx.outputH = 1080
  elseif mode == "1:1" then
    ctx.outputW = 1080
    ctx.outputH = 1080
  end
  local cw, ch = M.canonicalAspectSize(ctx, deps)
  local fi = ctx.widgets and ctx.widgets.frameInfo
  if fi and fi.setText then
    fi:setText(string.format("Frame: %dx%d (%.2f:1)", cw, ch, cw / math.max(1, ch)))
  end
  M.syncCanonicalSurfaceBounds(ctx, deps)
end

function M.buildShaderSourceDescriptor(ctx, deps)
  local spec = deps.currentCol1SourceSpec(ctx)
  local descriptor, choice = deps.applySourceSpecToHiddenNode(ctx, spec, "col1_source")
  return descriptor, choice
end

function M.updateShader(ctx, deps)
  profileStart(deps, ctx, "updateShader")
  if not (ctx.widgets.outputViewport and ctx.widgets.outputViewport.node) then
    profileEnd(deps, ctx, "updateShader")
    return
  end

  local layers = {}
  for i = 1, 8 do
    local L = ctx.shader.layers[i]
    local effect = L and ctx.effects[L.effectIndex]
    if L and L.enabled and effect then
      local params = {}
      for p = 1, 9 do
        local spec = effect.params and effect.params[p]
        if spec then
          local normalized = L.params[p] or spec.default or 0
          local pmin = tonumber(spec.min) or 0
          local pmax = tonumber(spec.max) or 1
          params[spec.id] = pmin + normalized * (pmax - pmin)
        end
      end
      layers[#layers + 1] = { enabled = true, effectId = effect.id, params = params }
    end
  end

  local source, choice = M.buildShaderSourceDescriptor(ctx, deps)
  if shaders and shaders.buildPipeline then
    local ok, payload = pcall(shaders.buildPipeline, layers, "contain", source)
    if ok and payload then
      local srcSpec = deps.currentCol1SourceSpec(ctx) or { kind = "webcam" }
      local sig = tostring(srcSpec.kind or "webcam") .. "|" .. tostring(srcSpec.sourceId or srcSpec.mlType or ctx.shader.sourceIndex or 1) .. "|" .. tostring(#layers)
      for k, v in pairs(srcSpec.params or {}) do
        sig = sig .. "|src." .. tostring(k) .. "=" .. tostring(math.floor((tonumber(v) or 0) * 10000 + 0.5))
      end
      if srcSpec.kind == "columntap" then
        sig = sig .. "|srcCol=" .. tostring(srcSpec.sourceCol or 0) .. "|srcTap=" .. tostring(srcSpec.tapIndex or 0)
      end
      for _, l in ipairs(layers) do
        sig = sig .. "|" .. tostring(l.effectId)
        for k, v in pairs(l.params or {}) do
          sig = sig .. "|" .. tostring(k) .. "=" .. tostring(math.floor((tonumber(v) or 0) * 10000 + 0.5))
        end
      end
      if sig ~= ctx._lastShaderSig then
        ctx._lastShaderSig = sig
        deps.updateGridThumbnails(ctx)
      end
    end
  end

  M.updateStackRenderNodes(ctx, deps)
  local srcLabel = deps.colSourceLabel(ctx, 1)
  U.setText(
    ctx.widgets.shaderStatus,
    string.format(
      "Shader: %s %s",
      srcLabel or (choice and choice.name) or "Webcam",
      ctx.effects[(ctx.shader.layers[ctx.shader.activeLayer] or {}).effectIndex or 1]
        and ctx.effects[(ctx.shader.layers[ctx.shader.activeLayer] or {}).effectIndex or 1].name or "--"
    )
  )
  profileEnd(deps, ctx, "updateShader")
end

function M.syncShaderEditor(ctx)
  local sel = ctx.selection
  local effect, params, enabled, currentEffectIndex

  if sel and sel.col == 1 then
    local L = ctx.shader.layers[ctx.shader.activeLayer]
    currentEffectIndex = L.effectIndex or 1
    effect = ctx.effects[currentEffectIndex] or { params = {} }
    params = L.params
    enabled = L.enabled
    U.setSelectedSilently(ctx.widgets.shaderLayer, ctx.shader.activeLayer)
  elseif sel and sel.col > 1 then
    local cd = ctx._colData and ctx._colData[sel.col]
    local fxSlot = sel.row - 1
    if cd and cd.fx[fxSlot] then
      local f = cd.fx[fxSlot]
      currentEffectIndex = f.effectIndex or 1
      effect = ctx.effects[currentEffectIndex] or { params = {} }
      params = f.params
      enabled = f.enabled
      U.setSelectedSilently(ctx.widgets.shaderLayer, fxSlot)
    else
      effect = { params = {} }
      params = {}
      enabled = false
      currentEffectIndex = 1
    end
  else
    effect = { params = {} }
    params = {}
    enabled = false
    currentEffectIndex = 1
  end

  U.setSelectedSilently(ctx.widgets.effectSelect, math.max(1, math.min(#(ctx.effects or {}), U.round(currentEffectIndex or 1))))
  if ctx.widgets.shaderEnabled and ctx.widgets.shaderEnabled.setValue then
    U.setValueSilently(ctx.widgets.shaderEnabled, enabled == true)
  end

  for p = 1, 9 do
    local sl = ctx.widgets["shaderParam" .. p]
    local spec = effect.params and effect.params[p]
    if spec then
      if sl.setLabel then sl:setLabel(spec.name or spec.id or ("P" .. p)) end
      local pmin = tonumber(spec.min) or 0
      local pmax = tonumber(spec.max) or 1
      sl._min = pmin
      sl._max = pmax
      sl._step = tonumber(spec.step) or 0.01
      U.setVisible(sl, true)
      local normalized = params[p] or tonumber(spec.default) or 0
      local displayVal = U.clamp(pmin + normalized * (pmax - pmin), pmin, pmax)
      U.setValueSilently(sl, displayVal)
    else
      U.setVisible(sl, false)
    end
  end
end

function M.colSourceDescriptor(ctx, col, deps)
  local spec = deps.sourceSpecForColumn(ctx, col)
  if not spec then return { type = "webcam" }, nil end
  if spec.kind == "columntap" then
    return M.colSourceDescriptor(ctx, spec.sourceCol, deps)
  end
  return deps.applySourceSpecToHiddenNode(ctx, spec, "col" .. tostring(col) .. "_source")
end

function M.colBuildCellPipeline(ctx, col, row, deps)
  profileStart(deps, ctx, "colBuildCellPipeline")
  local cd = ctx._colData and ctx._colData[col]
  if not cd or not cd.source then
    profileEnd(deps, ctx, "colBuildCellPipeline")
    return nil
  end
  if row <= 1 then
    profileEnd(deps, ctx, "colBuildCellPipeline")
    return nil
  end

  local source = M.colSourceDescriptor(ctx, col, deps)
  local layers = {}
  for i = 1, math.min(row - 1, #cd.fx) do
    local f = cd.fx[i]
    if f and f.enabled then
      local eff = ctx.effects and ctx.effects[f.effectIndex]
      if eff then
        local params = {}
        for p = 1, 9 do
          local spec = eff.params and eff.params[p]
          if spec then
            local normalized = f.params[p] or tonumber(spec.default) or 0
            local pmin = tonumber(spec.min) or 0
            local pmax = tonumber(spec.max) or 1
            params[spec.id] = pmin + normalized * (pmax - pmin)
          end
        end
        layers[#layers + 1] = { enabled = true, effectId = eff.id, params = params }
      end
    end
  end
  local ok, payload = pcall(shaders.buildPipeline, layers, "contain", source)
  profileEnd(deps, ctx, "colBuildCellPipeline")
  if ok and payload then return payload end
  return nil
end

function M.stackNodeIdForRow(stack, row)
  stack = tonumber(stack) or 1
  row = tonumber(row) or 1
  if row <= 1 then return "__stack_" .. tostring(stack) .. "_source" end
  if row >= 10 then return "__stack_" .. tostring(stack) .. "_output" end
  return "__stack_" .. tostring(stack) .. "_tap_" .. tostring(row - 1)
end

function M.stackNodeIdForTap(stack, tapIndex)
  if tapIndex == nil then return M.stackNodeIdForRow(stack, 10) end
  local ti = tonumber(tapIndex) or 0
  if ti <= 0 then return M.stackNodeIdForRow(stack, 1) end
  if ti >= 8 then return M.stackNodeIdForRow(stack, 10) end
  return M.stackNodeIdForRow(stack, ti + 1)
end

function M.appendSigKV(parts, key, value)
  parts[#parts + 1] = tostring(key) .. "=" .. tostring(value)
end

function M.appendSortedParamSig(parts, params, prefix)
  if type(params) ~= "table" then return end
  local keys = {}
  for k in pairs(params) do keys[#keys + 1] = tostring(k) end
  table.sort(keys)
  for _, k in ipairs(keys) do
    local v = tonumber(params[k]) or 0
    M.appendSigKV(parts, (prefix or "p") .. k, math.floor(v * 10000 + 0.5))
  end
end

function M.sourceSpecSignature(ctx, col, deps)
  local spec = deps.sourceSpecForColumn(ctx, col)
  if not spec then return "nosource" end
  local parts = { "src", tostring(spec.kind or "webcam") }
  M.appendSigKV(parts, "sourceIndex", spec.sourceIndex or "")
  M.appendSigKV(parts, "sourceId", spec.sourceId or "")
  M.appendSigKV(parts, "mlType", spec.mlType or "")
  M.appendSigKV(parts, "sourceCol", spec.sourceCol or "")
  M.appendSigKV(parts, "tapIndex", spec.tapIndex == nil and "output" or spec.tapIndex)
  M.appendSortedParamSig(parts, spec.params, "sp_")
  return table.concat(parts, "|")
end

function M.stackTapSignature(ctx, col, row, deps)
  local parts = { "stack", tostring(col), tostring(row), M.sourceSpecSignature(ctx, col, deps) }
  local cd = ctx._colData and ctx._colData[col]
  if not cd then return table.concat(parts, "|") end
  local upto = math.max(0, math.min((tonumber(row) or 1) - 1, 8))
  for i = 1, upto do
    local f = cd.fx[i]
    if not f then
      M.appendSigKV(parts, "fx" .. i, "empty")
    else
      M.appendSigKV(parts, "fx" .. i .. "_effect", f.effectIndex or 0)
      M.appendSigKV(parts, "fx" .. i .. "_enabled", f.enabled and 1 or 0)
      for p = 1, 9 do
        M.appendSigKV(parts, "fx" .. i .. "_p" .. p, math.floor(((f.params and f.params[p]) or 0) * 10000 + 0.5))
      end
    end
  end
  return table.concat(parts, "|")
end

function M.clearNodeSurface(node)
  if node and node.clearCustomRenderPayload then node:clearCustomRenderPayload() end
end

function M.buildNodePassthroughPayload(sourceId)
  if not sourceId or sourceId == "" then return nil end
  local ok, payload = pcall(shaders.buildPipeline, {}, "contain", { type = "node", sourceId = sourceId })
  if ok and payload then return payload end
  return nil
end

function M.compositorBlendParams(blendOpId)
  local id = tostring(blendOpId or "normal")
  if id == "normal" then
    return { baseLevel = 1.0, topLevel = 1.0, topGamma = 1.0 }
  elseif id == "add" then
    return { gain = 1.0, bias = 0.0, softClamp = 1.0 }
  elseif id == "screen" then
    return { strength = 1.0, bias = 0.0, gamma = 1.0 }
  elseif id == "multiply" then
    return { strength = 1.0, lift = 0.0, gamma = 1.0 }
  elseif id == "overlay" then
    return { strength = 1.0, pivot = 0.5, contrast = 1.0 }
  elseif id == "difference" then
    return { strength = 1.0, bias = 0.0, contrast = 1.0 }
  end
  return {}
end

function M.ensureCompositorSurfaceNode(ctx, key, deps)
  local rootNode = ctx.root and ctx.root.node
  if not (rootNode and rootNode.addChild) then return nil end
  ctx._compoOutNodes = ctx._compoOutNodes or {}
  local cw, ch = M.canonicalAspectSize(ctx, deps)
  if not ctx._compoOutNodes[key] then
    local ok, n = pcall(rootNode.addChild, rootNode, "_n_" .. key)
    if ok and n then
      if n.setNodeId then n:setNodeId(key) end
      if n.setVisible then n:setVisible(false) end
      if n.setBounds then n:setBounds(0, 0, cw, ch) end
      ctx._compoOutNodes[key] = n
    end
  elseif ctx._compoOutNodes[key].setBounds then
    ctx._compoOutNodes[key]:setBounds(0, 0, cw, ch)
  end
  return ctx._compoOutNodes[key]
end

function M.ensureStackSurfaceNode(ctx, stack, row, deps)
  local key = M.stackNodeIdForRow(stack, row)
  local rootNode = ctx.root and ctx.root.node
  if not (rootNode and rootNode.addChild) then return nil end
  ctx._stackSurfaceNodes = ctx._stackSurfaceNodes or {}
  local cw, ch = M.canonicalAspectSize(ctx, deps)
  if not ctx._stackSurfaceNodes[key] then
    local ok, n = pcall(rootNode.addChild, rootNode, key)
    if ok and n then
      if n.setNodeId then n:setNodeId(key) end
      if n.setVisible then n:setVisible(false) end
      if n.setBounds then n:setBounds(0, 0, cw, ch) end
      ctx._stackSurfaceNodes[key] = n
    end
  elseif ctx._stackSurfaceNodes[key].setBounds then
    ctx._stackSurfaceNodes[key]:setBounds(0, 0, cw, ch)
  end
  return ctx._stackSurfaceNodes[key]
end

function M.syncClipModel(ctx, deps)
  profileStart(deps, ctx, "syncClipModel")
  ctx.clips = ctx.clips or {}
  ctx._colData = ctx._colData or {}
  deps.syncCol1FromShader(ctx)

  for colId, cd in pairs(ctx._colData) do
    ctx.clips[colId] = {}
    local src = cd.source
    if src then
      ctx.clips[colId][1] = {
        kind = "source",
        sourceType = src.kind == "mirrored" and (ctx.sources[ctx.shader.sourceIndex] or {}).kind or src.kind or "webcam",
        sourceIndex = src.sourceIndex,
        name = deps.colSourceLabel(ctx, colId),
      }
      for i = 1, 8 do
        local f = cd.fx[i]
        if f then
          local eff = ctx.effects and ctx.effects[f.effectIndex]
          ctx.clips[colId][1 + i] = {
            kind = "fx",
            fxId = eff and eff.id or nil,
            fxName = (eff and (eff.name or eff.id)) or ("Slot " .. i),
            effectIndex = f.effectIndex,
            enabled = f.enabled and eff ~= nil,
            params = f.params,
          }
        else
          ctx.clips[colId][1 + i] = {
            kind = "fx",
            fxName = "+ Add FX",
            emptyFx = true,
            enabled = false,
          }
        end
      end
      ctx.clips[colId][10] = { kind = "output", sourceColumn = colId, output = true }
    else
      ctx.clips[colId][1] = {
        kind = "source",
        sourceType = "empty",
        name = "Add Source",
        empty = true,
      }
      ctx.clips[colId][10] = { kind = "output", sourceColumn = colId, output = true }
    end
  end

  local sel = ctx.selection
  local valid = sel and ctx.clips[sel.col] and ctx.clips[sel.col][sel.row] and not ctx.clips[sel.col][sel.row].empty
  if not valid then
    local defaultRow = math.max(2, math.min(9, 1 + (ctx.shader and ctx.shader.activeLayer or 1)))
    ctx.selection = { col = 1, row = defaultRow }
  end

  local colCount = 0
  for _ in pairs(ctx._colData or {}) do colCount = colCount + 1 end
  local maxCols = math.max(tonumber(deps.gridCols) or 4, colCount + 2)
  for col = colCount + 1, maxCols do
    if not ctx.clips[col] then
      ctx.clips[col] = {}
      ctx.clips[col][1] = {
        kind = "source",
        sourceType = "empty",
        name = "No Source",
        empty = true,
      }
      for i = 2, 9 do
        ctx.clips[col][i] = {
          kind = "fx",
          fxName = "+ Add FX",
          emptyFx = true,
          enabled = false,
        }
      end
      ctx.clips[col][10] = { kind = "output", sourceColumn = col, output = true }
    end
  end
  profileEnd(deps, ctx, "syncClipModel")
  return maxCols, 10
end

function M.updateStackRenderNodes(ctx, deps)
  profileStart(deps, ctx, "updateStackRenderNodes")
  M.syncCanonicalSurfaceBounds(ctx, deps)
  local numStacks = M.syncClipModel(ctx, deps)
  ctx._stackNodeSigs = ctx._stackNodeSigs or {}

  for stack = 1, numStacks do
    local srcClip = ctx.clips and ctx.clips[stack] and ctx.clips[stack][1]
    local hasSource = srcClip and not srcClip.empty and deps.sourceSpecForColumn(ctx, stack)
    local sourceNode = M.ensureStackSurfaceNode(ctx, stack, 1, deps)
    if sourceNode then
      local sourceKey = M.stackNodeIdForRow(stack, 1)
      local srcSig = hasSource and M.sourceSpecSignature(ctx, stack, deps) or "empty"
      if ctx._stackNodeSigs[sourceKey] ~= srcSig then
        ctx._stackNodeSigs[sourceKey] = srcSig
        if hasSource then
          local descriptor = M.colSourceDescriptor(ctx, stack, deps)
          local ok, payload = pcall(shaders.buildPipeline, {}, "contain", descriptor)
          if ok and payload then
            sourceNode:setCustomSurface("gpu_shader", payload)
          else
            M.clearNodeSurface(sourceNode)
          end
        else
          M.clearNodeSurface(sourceNode)
        end
      end
    end

    for row = 2, 10 do
      local node = M.ensureStackSurfaceNode(ctx, stack, row, deps)
      local nodeKey = M.stackNodeIdForRow(stack, row)
      local clip = ctx.clips and ctx.clips[stack] and ctx.clips[stack][row]
      local active = hasSource and ((row == 10) or (clip and clip.kind == "fx" and clip.enabled))
      local sig = active and ((row == 10 and (M.stackTapSignature(ctx, stack, 10, deps) .. "|output")) or M.stackTapSignature(ctx, stack, row, deps)) or "empty"
      if node and ctx._stackNodeSigs[nodeKey] ~= sig then
        ctx._stackNodeSigs[nodeKey] = sig
        if active then
          local payload = M.colBuildCellPipeline(ctx, stack, row == 10 and 10 or row, deps)
          if payload then
            node:setCustomSurface("gpu_shader", payload)
          else
            M.clearNodeSurface(node)
          end
        else
          M.clearNodeSurface(node)
        end
      end
    end
  end
  profileEnd(deps, ctx, "updateStackRenderNodes")
end

function M.buildCompositorGraph(ctx, deps)
  local compo = ctx.compositor
  if not (compo and compo.layers) then return nil end
  M.updateStackRenderNodes(ctx, deps)

  local visible = {}
  local accumulatedKeyByLayer = {}
  local prevKey = nil

  for i = 1, #compo.layers do
    local layer = compo.layers[i]
    if layer and layer.visible then
      local sourceStack = tonumber(layer.sourceColumn) or 1
      local sourceNodeId = M.stackNodeIdForTap(sourceStack, layer.tapIndex)
      local srcNode = M.ensureCompositorSurfaceNode(ctx, "_compoSrc_" .. tostring(i), deps)
      if srcNode then
        local payload = M.buildNodePassthroughPayload(sourceNodeId)
        if payload then
          srcNode:setCustomSurface("gpu_shader", payload)
          local srcKey = "_compoSrc_" .. tostring(i)
          local accKey = srcKey
          if prevKey ~= nil then
            accKey = "_compoAcc_" .. tostring(i)
            local accNode = M.ensureCompositorSurfaceNode(ctx, accKey, deps)
            if accNode then
              local blendId = layer.blendMode or "normal"
              accNode:setCustomSurface("gpu_composite", {
                version = 1, kind = "compositeQuad", fitMode = "contain",
                bottomNodeId = prevKey, topNodeId = srcKey,
                blendOpId = blendId,
                opacity = layer.opacity or 1.0,
                blendParams = M.compositorBlendParams(blendId),
              })
            end
          end
          prevKey = accKey
          accumulatedKeyByLayer[i] = accKey
          visible[#visible + 1] = {
            idx = i,
            layer = layer,
            sourceNodeId = sourceNodeId,
            sourceStack = sourceStack,
            accKey = accKey,
            cell = ctx._compoCells and ctx._compoCells["compo_" .. i] or nil,
          }
        end
      end
    end
  end

  if #visible == 0 then return nil end
  return { visible = visible, accumulatedKeyByLayer = accumulatedKeyByLayer, finalKey = prevKey }
end

function M.buildTapPipeline(ctx, col, tapIndex, deps)
  if tapIndex <= 1 then return nil end
  return M.colBuildCellPipeline(ctx, col, tapIndex, deps)
end

function M.applyActiveLayerSelection(ctx, idx, deps)
  ctx.shader.activeLayer = math.max(1, math.min(8, U.round(idx)))
  ctx.selection = { col = 1, row = 1 + ctx.shader.activeLayer }
  deps.writeParam(C.NS .. "/shader/active_layer", ctx.shader.activeLayer)
  U.setSelectedSilently(ctx.widgets.shaderLayer, ctx.shader.activeLayer)
  M.syncShaderEditor(ctx)
end

function M.applyShaderEnabledSelection(ctx, enabled, deps)
  local v = enabled == true
  local sel = ctx.selection
  local cd = sel and ctx._colData and ctx._colData[sel.col]

  if sel and sel.col == 1 then
    ctx.shader.layers[ctx.shader.activeLayer].enabled = v
    deps.writeParam(C.NS .. "/shader/layer/" .. ctx.shader.activeLayer .. "/enabled", v and 1 or 0)
    deps.updateShader(ctx)
  elseif cd and sel and sel.row and sel.row > 1 then
    local fxSlot = sel.row - 1
    local f = cd.fx[fxSlot]
    if not f and v and fxSlot >= 1 and fxSlot <= 8 then
      local effectIndex = 1
      if ctx.widgets and ctx.widgets.effectSelect and ctx.widgets.effectSelect.getSelected then
        effectIndex = math.max(1, math.min(#(ctx.effects or {}), U.round(ctx.widgets.effectSelect:getSelected() or 1)))
      end
      local params = {}
      local eff = ctx.effects and ctx.effects[effectIndex]
      for p = 1, 9 do
        local spec = eff and eff.params and eff.params[p]
        params[p] = spec and (tonumber(spec.default) or 0.5) or 0.5
      end
      f = { effectIndex = effectIndex, params = params, enabled = true }
      cd.fx[fxSlot] = f
    end
    if f then
      f.enabled = v
      deps.updateGridThumbnails(ctx)
    end
  end
  if ctx.widgets.shaderEnabled and ctx.widgets.shaderEnabled.setValue then U.setValueSilently(ctx.widgets.shaderEnabled, v) end
end

function M.applyEffectSelection(ctx, idx, deps)
  local sel = ctx.selection
  idx = math.max(1, math.min(#(ctx.effects or {}), U.round(idx)))
  local cd = sel and ctx._colData and ctx._colData[sel.col]

  if sel and sel.col == 1 then
    local L = ctx.shader.layers[ctx.shader.activeLayer]
    L.effectIndex = idx
    deps.writeParam(C.NS .. "/shader/layer/" .. ctx.shader.activeLayer .. "/effect", idx)
    deps.updateShader(ctx)
  elseif cd and sel and sel.row > 1 then
    local fxSlot = sel.row - 1
    local f = cd.fx[fxSlot]
    if not f and fxSlot >= 1 and fxSlot <= 8 then
      f = { effectIndex = idx, params = {}, enabled = true }
      cd.fx[fxSlot] = f
    end
    if f then
      f.effectIndex = idx
      local eff = ctx.effects[idx]
      f.params = {}
      if eff then
        for p = 1, 9 do
          local spec = eff.params and eff.params[p]
          f.params[p] = spec and (tonumber(spec.default) or 0.5) or 0.5
        end
      else
        for p = 1, 9 do f.params[p] = 0.5 end
      end
      deps.updateGridThumbnails(ctx)
    end
  end
  U.setSelectedSilently(ctx.widgets.effectSelect, idx)
  M.syncShaderEditor(ctx)
  deps.syncShaderSourceParams(ctx)
end

function M.applyShaderParamDisplay(ctx, p, displayValue, deps)
  local sel = ctx.selection
  if not sel then return end
  local cd = ctx._colData and ctx._colData[sel.col]
  if not cd then return end

  if sel.col == 1 then
    local L = ctx.shader.layers[ctx.shader.activeLayer]
    local effect = ctx.effects[L.effectIndex] or {}
    local spec = effect.params and effect.params[p]
    local pmin = tonumber(spec and spec.min) or 0
    local pmax = tonumber(spec and spec.max) or 1
    local normalized = (displayValue - pmin) / math.max(0.001, pmax - pmin)
    L.params[p] = U.clamp(normalized, 0, 1)
    deps.writeParam(C.NS .. "/shader/layer/" .. ctx.shader.activeLayer .. "/param/" .. p, L.params[p])
    deps.updateShader(ctx)
  else
    local fxSlot = sel.row - 1
    local f = cd.fx[fxSlot]
    if not f then return end
    local effect = ctx.effects[f.effectIndex] or {}
    local spec = effect.params and effect.params[p]
    local pmin = tonumber(spec and spec.min) or 0
    local pmax = tonumber(spec and spec.max) or 1
    local normalized = (displayValue - pmin) / math.max(0.001, pmax - pmin)
    f.params[p] = U.clamp(normalized, 0, 1)
    deps.updateGridThumbnails(ctx)
  end
end

function M.layoutEffectEmbed(ctx, w, h)
  U.setBounds(ctx.widgets.effectEmbed, 0, 0, w, h)
  local pad = 8
  local topY = 25
  U.setBounds(ctx.widgets.shaderLayer, pad, topY, 48, 18)
  U.setBounds(ctx.widgets.shaderEnabled, pad + 52, topY, 52, 18)
  local effectX = pad + 108
  U.setBounds(ctx.widgets.effectSelect, effectX, topY, math.max(72, w - pad - effectX), 18)

  local shaderY = 49
  local cols, colW = 3, math.max(92, math.floor((w - pad * 2) / 3))
  for p = 1, 9 do
    local col = (p - 1) % cols
    local row = math.floor((p - 1) / cols)
    U.setBounds(ctx.widgets["shaderParam" .. p], pad + col * colW, shaderY + row * 22, math.max(1, colW - 6), 18)
  end
  U.setBounds(ctx.widgets.shaderStatus, pad, math.max(shaderY + 66, h - 18), math.max(1, w - pad * 2), 14)
end

return M
