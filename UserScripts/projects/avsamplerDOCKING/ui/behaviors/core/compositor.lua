local M = {}

function M.layoutCompoLayerControls(ctx, w, h, deps)
  local embed = ctx.widgets.compoLayerEmbed
  if not embed then return end
  deps.setBounds(embed, 0, 0, w, h)

  local selIdx = ctx.compositorSelection and ctx.compositorSelection.layerIndex
  local layer = selIdx and ctx.compositor and ctx.compositor.layers[selIdx]
  if not layer then
    for _, id in ipairs{"compoColumn","compoTap","compoBlend","compoOpacity","compoVisible"} do
      if ctx.widgets[id] then deps.setVisible(ctx.widgets[id], false) end
    end
    return
  end

  local curCol = layer.sourceColumn or 1
  ctx._compoColLabels = ctx._compoColLabels or {}
  local colLabels = {}
  if ctx._colData then
    for cid, _ in pairs(ctx._colData) do
      table.insert(colLabels, "Stack " .. cid .. " (" .. deps.colSourceLabel(ctx, cid) .. ")")
    end
  end
  if #colLabels == 0 then table.insert(colLabels, "Stack 1") end
  if table.concat(ctx._compoColLabels) ~= table.concat(colLabels) then
    ctx._compoColLabels = colLabels
    ctx._compoColSelCache = nil
    deps.setOptions(ctx.widgets.compoColumn, colLabels)
  end
  local curColIdx = 1
  for i, label in ipairs(colLabels) do if label:match("Stack " .. curCol) then curColIdx = i break end end
  if ctx._compoColSelCache ~= curColIdx then
    ctx._compoColSelCache = curColIdx
    deps.setSelectedSilently(ctx.widgets.compoColumn, curColIdx)
  end
  deps.setBounds(ctx.widgets.compoColumn, 8, 25, 96, 18)
  ctx.widgets.compoColumn._onSelect = function(idx)
    local i = math.max(1, math.min(#colLabels, deps.round(idx)))
    local cid = tonumber(colLabels[i]:match("Stack (%d+)")) or 1
    layer.sourceColumn = cid; ctx._compoThumbSigs = {}
  end
  deps.setVisible(ctx.widgets.compoColumn, true)

  ctx._compoLastTapCol = ctx._compoLastTapCol or {}
  local tapKey = "col" .. curCol
  local cd = ctx._colData and ctx._colData[curCol]
  local numFx = cd and #cd.fx or 8
  local tapLabels = { "Output", "Raw Source" }
  local tapVals = { nil, 0 }
  for ti = 1, numFx do table.insert(tapLabels, "FX " .. ti); table.insert(tapVals, ti) end
  if ctx._compoLastTapCol ~= tapKey then
    ctx._compoLastTapCol = tapKey
    ctx._compoTapLabels = tapLabels
    ctx._compoTapVals = tapVals
    ctx._compoTapSelCache = nil
    deps.setOptions(ctx.widgets.compoTap, tapLabels)
  end
  local curTap = layer.tapIndex
  local curTapIdx = 1
  for i, v in ipairs(ctx._compoTapVals or tapVals) do if v == curTap then curTapIdx = i break end end
  if ctx._compoTapSelCache ~= curTapIdx then
    ctx._compoTapSelCache = curTapIdx
    deps.setSelectedSilently(ctx.widgets.compoTap, curTapIdx)
  end
  deps.setBounds(ctx.widgets.compoTap, 110, 25, 80, 18)
  ctx.widgets.compoTap._onSelect = function(idx)
    local vi = math.max(1, math.min(#(ctx._compoTapVals or tapVals), deps.round(idx)))
    layer.tapIndex = (ctx._compoTapVals or tapVals)[vi]; ctx._compoThumbSigs = {}
  end
  deps.setVisible(ctx.widgets.compoTap, true)

  if not ctx._compoBlendInited then
    ctx._compoBlendInited = true
    ctx._compoBlendSelCache = nil
    deps.setOptions(ctx.widgets.compoBlend, { "normal", "add", "screen", "multiply", "overlay", "difference" })
  end
  local blendModes = { "normal", "add", "screen", "multiply", "overlay", "difference" }
  local curMode = layer.blendMode or "normal"
  local curModeIdx = 1
  for i, bm in ipairs(blendModes) do if bm == curMode then curModeIdx = i break end end
  if ctx._compoBlendSelCache ~= curModeIdx then
    ctx._compoBlendSelCache = curModeIdx
    deps.setSelectedSilently(ctx.widgets.compoBlend, curModeIdx)
  end
  deps.setBounds(ctx.widgets.compoBlend, 196, 25, 70, 18)
  ctx.widgets.compoBlend._onSelect = function(idx)
    layer.blendMode = blendModes[math.max(1, math.min(#blendModes, deps.round(idx)))] or "normal"
  end
  deps.setVisible(ctx.widgets.compoBlend, true)

  local curOpacity = layer.opacity or 1.0
  if ctx._compoOpacityCache == nil or math.abs(ctx._compoOpacityCache - curOpacity) > 0.001 then
    ctx._compoOpacityCache = curOpacity
    deps.setValueSilently(ctx.widgets.compoOpacity, curOpacity)
  end
  deps.setBounds(ctx.widgets.compoOpacity, 8, 49, 100, 17)
  ctx.widgets.compoOpacity._onChange = function(v) layer.opacity = deps.clamp(v, 0, 1) end
  deps.setVisible(ctx.widgets.compoOpacity, true)

  local curVis = layer.visible == true
  if ctx._compoVisCache ~= curVis then
    ctx._compoVisCache = curVis
    deps.setValueSilently(ctx.widgets.compoVisible, curVis)
  end
  deps.setBounds(ctx.widgets.compoVisible, 114, 49, 50, 17)
  ctx.widgets.compoVisible._onChange = function(v)
    layer.visible = v == true; ctx._compoThumbSigs = {}
  end
  deps.setVisible(ctx.widgets.compoVisible, true)
end

function M.renderCompositorLayerControls(ctx, deps)
  local selIdx = ctx.compositorSelection and ctx.compositorSelection.layerIndex
  if not selIdx then imguiTextColored(0xff94a3b8, "No layer selected"); return end
  local layer = ctx.compositor and ctx.compositor.layers[selIdx]
  if not layer then imguiTextColored(0xff94a3b8, "No layer selected"); return end
  imguiTextColored(0xfff97316, "Layer " .. selIdx)
  imguiSeparator()
  deps.renderEmbeddedPanel(ctx, "compoLayerEmbed", function(innerCtx, ww, hh) return M.layoutCompoLayerControls(innerCtx, ww, hh, deps) end, 72)
end

function M.ensureCompositorCells(ctx, parentNode)
  if not parentNode then return 0 end
  local numLayers = #ctx.compositor.layers
  ctx._compoCells = ctx._compoCells or {}
  for i = 1, numLayers do
    local key = "compo_" .. i
    if not ctx._compoCells[key] then
      local cell = parentNode:addChild("compoCell_" .. i)
      local thumb = cell:addChild("compoCell_" .. i .. "_thumb")
      local lbl = cell:addChild("compoCell_" .. i .. "_lbl")
      thumb:setInterceptsMouse(false, false)
      lbl:setInterceptsMouse(false, false)
      cell:setInterceptsMouse(true, true)
      local idx = i
      cell:setOnMouseDown(function()
        ctx.selectedView = "compositor"
        ctx.compositorSelection = { layerIndex = idx }
      end)
      ctx._compoCells[key] = { node = cell, thumb = thumb, label = lbl, index = i }
    end
  end
  for _, cell in pairs(ctx._compoCells) do
    if cell.index > numLayers then cell.node:setBounds(0, 0, 0, 0) end
  end
  return numLayers
end

function M.compositorLayerCellPipeline(ctx, layer, deps)
  if not layer or not layer.visible then return nil end
  local col = layer.sourceColumn or 1
  local cd = ctx._colData and ctx._colData[col]
  if not cd or not cd.source then return nil end
  local tapIndex = layer.tapIndex
  if tapIndex == nil then
    return deps.colBuildCellPipeline(ctx, col, 10)
  elseif tapIndex == 0 then
    local descriptor, _ = deps.colSourceDescriptor(ctx, col)
    if not descriptor then return nil end
    local ok, payload = pcall(shaders.buildPipeline, {}, "contain", descriptor)
    if ok then return payload end
    return nil
  else
    return deps.colBuildCellPipeline(ctx, col, tapIndex + 1)
  end
end

function M.updateCompositorThumbnails(ctx, deps)
  deps.profileStart(ctx, "updateCompositorThumbnails")
  if not ctx._compoCells then deps.profileEnd(ctx, "updateCompositorThumbnails"); return end
  ctx._compoThumbSigs = ctx._compoThumbSigs or {}
  local graph = deps.buildCompositorGraph(ctx)
  local accByLayer = graph and graph.accumulatedKeyByLayer or {}
  for i = 1, #ctx.compositor.layers do
    local key = "compo_" .. tostring(i)
    local cell = ctx._compoCells[key]
    if cell then
      local accKey = accByLayer[i]
      local sig = accKey and ("compo|" .. tostring(i) .. "|" .. tostring(accKey)) or ("compo|" .. tostring(i) .. "|empty")
      if ctx._compoThumbSigs[key] ~= sig then
        ctx._compoThumbSigs[key] = sig
        if accKey then
          local payload = deps.buildNodePassthroughPayload(accKey)
          if payload then cell.thumb:setCustomSurface("gpu_shader", payload) else deps.clearNodeSurface(cell.thumb) end
        else
          deps.clearNodeSurface(cell.thumb)
        end
      end
    end
  end
  deps.profileEnd(ctx, "updateCompositorThumbnails")
end

function M.updateCompositorOutput(ctx, deps)
  deps.profileStart(ctx, "updateCompositorOutput")
  local outNode = ctx.widgets and ((ctx.widgets.outputSurface and ctx.widgets.outputSurface.node) or (ctx.widgets.outputViewport and ctx.widgets.outputViewport.node))
  if not outNode then deps.profileEnd(ctx, "updateCompositorOutput"); return end
  local graph = deps.buildCompositorGraph(ctx)
  local finalKey = graph and graph.finalKey or nil
  if not finalKey then deps.profileEnd(ctx, "updateCompositorOutput"); return end
  local payload = deps.buildNodePassthroughPayload(finalKey)
  if payload then
    outNode:setCustomSurface("gpu_shader", payload)
    if ctx.widgets and ctx.widgets.outputViewport and ctx.widgets.outputViewport.node and outNode ~= ctx.widgets.outputViewport.node then
      deps.clearNodeSurface(ctx.widgets.outputViewport.node)
    end
  else
    deps.clearNodeSurface(outNode)
  end
  deps.profileEnd(ctx, "updateCompositorOutput")
end

function M.renderCompositorPanel(ctx, deps)
  local av = imguiGetContentRegionAvail()
  if av.x < 4 or av.y < 4 then return end
  local pw = math.floor(av.x)
  local ph = math.floor(av.y)

  if not ctx._compositorEmbed then
    local parent = ctx.widgets and ctx.widgets.embedHost and ctx.widgets.embedHost.node
    if not parent then parent = ctx.root and ctx.root.node end
    if parent and parent.addChild then ctx._compositorEmbed = parent:addChild("__compositor_embed") end
  end

  local compo = ctx.compositor
  local pad, gap = 8, 4
  local toolbarH = 22
  local curAlign = compo.orientation or "bottom-up"
  local alignments = { "bottom-up", "left-to-right", "top-down" }
  local alignLabels = { "^BU", ">LR", "vTD" }
  for ai, a in ipairs(alignments) do
    if a == curAlign then imguiText(" " .. alignLabels[ai] .. " ")
    elseif imguiButton(alignLabels[ai] .. "##compAlign" .. ai) then compo.orientation = a end
    if ai < #alignments then imguiSameLine() end
  end
  imguiSameLine()

  if imguiButton("+Layer") then
    local idx = #compo.layers + 1
    compo.layers[idx] = { sourceColumn = 1, tapIndex = nil, blendMode = "normal", opacity = 1.0, visible = true, name = "Layer " .. idx }
    ctx.compositorSelection = { layerIndex = idx }
    ctx._compoThumbSigs = {}
  end
  imguiSameLine()

  local selIdx = ctx.compositorSelection and ctx.compositorSelection.layerIndex
  if selIdx and #compo.layers > 1 and imguiButton("Delete") then
    table.remove(compo.layers, selIdx)
    ctx.compositorSelection = { layerIndex = math.max(1, math.min(#compo.layers, selIdx)) }
    ctx._compoThumbSigs = {}
  end

  local cellsH = math.max(1, ph - toolbarH - 8)
  local numLayers = M.ensureCompositorCells(ctx, ctx._compositorEmbed)
  if numLayers < 1 then return end

  local cellW, cellH
  if compo.orientation == "left-to-right" then
    cellH = math.max(28, cellsH)
    cellW = math.max(50, math.floor((pw - pad * 2 - gap * (numLayers - 1)) / numLayers))
  else
    cellW = math.max(60, pw - pad * 2)
    cellH = math.max(28, math.floor((cellsH - gap * (numLayers - 1)) / numLayers))
  end

  deps.setBounds(ctx._compositorEmbed, pad, toolbarH, pw - pad * 2, cellsH)

  for i = 1, numLayers do
    local key = "compo_" .. i
    local cell = ctx._compoCells[key]
    if not cell then break end
    local cx, cy
    if compo.orientation == "bottom-up" then local displayIdx = numLayers - i + 1; cx = 0; cy = (displayIdx - 1) * (cellH + gap)
    elseif compo.orientation == "left-to-right" then cx = (i - 1) * (cellW + gap); cy = 0
    else cx = 0; cy = (i - 1) * (cellH + gap) end
    cell.node:setBounds(cx, cy, cellW, cellH)
    local isSelected = ctx.compositorSelection and ctx.compositorSelection.layerIndex == i
    local layer = compo.layers[i]
    local hasSignal = layer and layer.visible and ctx._colData and ctx._colData[layer.sourceColumn or 1] and ctx._colData[layer.sourceColumn or 1].source
    local bg = hasSignal and 0xff0d1420 or 0xff080c18
    local borderClr = isSelected and 0xfff97316 or 0xff1a1a22
    local borderThick = isSelected and 2 or 1
    cell.node:setDisplayList({
      { cmd = "fillRoundedRect", x = 0, y = 0, w = cellW, h = cellH, radius = 3, color = bg },
      { cmd = "drawRoundedRect", x = 0, y = 0, w = cellW, h = cellH, radius = 3, color = borderClr, thickness = borderThick },
    })
    local thumbH = math.max(1, cellH - 16)
    if hasSignal then
      local cw, ch = deps.canonicalAspectSize(ctx)
      local ix, iy, iw, ih = deps.fitBox(math.max(1, cellW - 4), thumbH, cw, ch)
      cell.thumb:setBounds(2 + ix, 2 + iy, math.max(1, iw), math.max(1, ih))
    else
      cell.thumb:setBounds(0, 0, 0, 0)
    end
    local labelText = layer and (layer.name or "Layer " .. i) or "Layer " .. i
    cell.label:setBounds(4, math.max(1, thumbH + 2), math.max(1, cellW - 8), 14)
    cell.label:setDisplayList({
      { cmd = "fillRect", x = 0, y = 0, w = cellW + 8, h = 16, color = bg },
      { cmd = "drawText", text = labelText, color = isSelected and 0xfff97316 or 0xff94a3b8, fontSize = 8 },
    })
  end

  M.updateCompositorThumbnails(ctx, deps)
  imguiRetainedPanel(ctx._compositorEmbed, pw - pad * 2, cellsH, true)
end

return M
