local C = require("behaviors.avsd.constants")

local M = {}

local CELL_SRC_TINT = 0xff0d2028
local CELL_FX_TINT = 0xff0d1420
local CELL_BORDER = 0xff1a1a22
local CELL_SRC_SEL_BD = 0xff22d3ee
local CELL_FX_SEL_BD = 0xfff97316
local EMPTY_CELL_BG = 0xff080c18

function M.selectedGridClip(ctx)
  local sel = ctx and ctx.selection or nil
  if not sel then return nil end
  return ctx.clips and ctx.clips[sel.col] and ctx.clips[sel.col][sel.row] or nil
end

function M.selectionSummary(ctx)
  local clip = M.selectedGridClip(ctx)
  if not clip then return "Selected: --" end
  if clip.kind == "source" then
    return string.format("Selected: Source — %s", clip.name or clip.sourceType or "Source")
  end
  local state = clip.enabled and "enabled" or "disabled"
  return string.format("Selected: FX L%d — %s (%s)", clip.layerIndex or 0, clip.fxName or clip.fxId or "Effect", state)
end

function M.selectGridCell(ctx, col, row, deps)
  local clip = ctx.clips and ctx.clips[col] and ctx.clips[col][row] or nil
  if not clip then return end

  ctx.selectedView = "grid"

  if row <= 1 then
    ctx.sourceSelectionCol = col
    return
  end

  if clip and clip.kind == "output" then
    ctx.selection = { col = col, row = row }
    return
  end

  ctx.selection = { col = col, row = row }
  local cd = ctx._colData and ctx._colData[col]

  if col == 1 then
    local nextLayer = math.max(1, math.min(8, clip.layerIndex or (row - 1)))
    if nextLayer ~= ctx.shader.activeLayer then
      ctx.shader.activeLayer = nextLayer
      deps.writeParam(C.NS .. "/shader/active_layer", nextLayer)
    end
    deps.setSelectedSilently(ctx.widgets.shaderLayer, ctx.shader.activeLayer)
    deps.syncShaderEditor(ctx)
    return
  end

  local fxSlot = row - 1
  local f = cd and cd.fx[fxSlot]
  if f then
    deps.setSelectedSilently(ctx.widgets.shaderLayer, fxSlot)
    deps.setSelectedSilently(ctx.widgets.effectSelect, f.effectIndex)
    deps.syncShaderEditor(ctx)
  end
end

function M.ensureGridCells(ctx, deps)
  deps.profileStart(ctx, "ensureGridCells")
  local parentNode = ctx.widgets and ctx.widgets.deckEmbed and ctx.widgets.deckEmbed.node
  if not parentNode then deps.profileEnd(ctx, "ensureGridCells"); return 0, 0 end
  local numCols, numRows = deps.syncClipModel(ctx)
  ctx._gridCells = ctx._gridCells or {}

  for col = 1, numCols do
    for row = 1, numRows do
      local key = tostring(col) .. "_" .. tostring(row)
      if not ctx._gridCells[key] then
        local cell = parentNode:addChild("gridCell_" .. key)
        local thumb = cell:addChild("gridCell_" .. key .. "_thumb")
        local lbl = cell:addChild("gridCell_" .. key .. "_lbl")
        thumb:setInterceptsMouse(false, false)
        lbl:setInterceptsMouse(false, false)
        if cell.setInterceptsMouse then cell:setInterceptsMouse(true, true) end
        if cell.setOnMouseDown then
          local clickCol, clickRow = col, row
          cell:setOnMouseDown(function()
            M.selectGridCell(ctx, clickCol, clickRow, deps)
          end)
        end
        ctx._gridCells[key] = { node = cell, thumb = thumb, label = lbl, col = col, row = row }
      end
    end
  end
  for _, cell in pairs(ctx._gridCells) do
    if cell.col > numCols or cell.row > numRows then
      cell.node:setBounds(0, 0, 0, 0)
    end
  end
  deps.profileEnd(ctx, "ensureGridCells")
  return numCols, numRows
end

function M.updateGridThumbnails(ctx, deps)
  deps.profileStart(ctx, "updateGridThumbnails")
  local cells = ctx._gridCells or {}
  local numCols, numRows = deps.syncClipModel(ctx)
  ctx._gridThumbSigs = ctx._gridThumbSigs or {}
  for col = 1, numCols do
    for row = 1, numRows do
      local key = tostring(col) .. "_" .. tostring(row)
      local cell = cells[key]
      if not cell then break end
      local clip = ctx.clips[col] and ctx.clips[col][row]
      local thumb = cell.thumb
      if clip and not clip.empty then
        local sig = tostring(col) .. "_" .. tostring(row)

        if row == 1 and clip.kind == "source" then
          sig = sig .. "|" .. deps.sourceSpecSignature(ctx, col)
          if ctx._gridThumbSigs[key] ~= sig then
            ctx._gridThumbSigs[key] = sig
            local payload = deps.buildNodePassthroughPayload(deps.stackNodeIdForRow(col, 1))
            if payload then thumb:setCustomSurface("gpu_shader", payload) else deps.clearNodeSurface(thumb) end
          end
        elseif clip.kind == "fx" and clip.enabled then
          sig = deps.stackTapSignature(ctx, col, row)
          if ctx._gridThumbSigs[key] ~= sig then
            ctx._gridThumbSigs[key] = sig
            local payload = deps.buildNodePassthroughPayload(deps.stackNodeIdForRow(col, row))
            if payload then thumb:setCustomSurface("gpu_shader", payload) else deps.clearNodeSurface(thumb) end
          end
        elseif clip.kind == "output" then
          sig = deps.stackTapSignature(ctx, col, 10) .. "|output"
          if ctx._gridThumbSigs[key] ~= sig then
            ctx._gridThumbSigs[key] = sig
            local payload = deps.buildNodePassthroughPayload(deps.stackNodeIdForRow(col, 10))
            if payload then thumb:setCustomSurface("gpu_shader", payload) else deps.clearNodeSurface(thumb) end
          end
        else
          deps.clearNodeSurface(thumb)
        end
      else
        deps.clearNodeSurface(thumb)
      end
    end
  end
  deps.profileEnd(ctx, "updateGridThumbnails")
end

function M.layoutClipGrid(ctx, w, h, deps)
  deps.setBounds(ctx.widgets.deckEmbed, 0, 0, w, h)
  deps.syncClipModel(ctx)
  local pad, gap = 8, 4
  local availW = math.max(1, w - pad * 2)
  local availH = math.max(1, h - pad * 2)
  local numCols, numRows = M.ensureGridCells(ctx, deps)
  if numCols < 1 or numRows < 1 then return end
  M.updateGridThumbnails(ctx, deps)

  local alignment = ctx.gridAlignment or "bottom-up"
  local cellW, cellH

  if alignment == "left-to-right" then
    cellH = math.max(24, math.floor((availH - gap * (numCols - 1)) / numCols))
    cellW = math.max(40, math.floor((availW - gap * (numRows - 1)) / numRows))
  else
    cellW = math.max(40, math.floor((availW - gap * (numCols - 1)) / numCols))
    cellH = math.max(24, math.floor((availH - gap * (numRows - 1)) / numRows))
  end

  local thumbH, labelH, isOverlay
  if alignment == "left-to-right" then
    thumbH = math.max(1, cellH - 4)
    labelH = 12
    isOverlay = true
  else
    thumbH = math.max(1, cellH - 16)
    labelH = math.max(1, cellH - thumbH - 4)
    isOverlay = false
  end

  for col = 1, numCols do
    for row = 1, numRows do
      local key = tostring(col) .. "_" .. tostring(row)
      local cell = ctx._gridCells[key]
      if not cell then break end

      local cx, cy
      if alignment == "bottom-up" then
        local displayRow = numRows - row + 1
        cx = pad + (col - 1) * (cellW + gap)
        cy = pad + (displayRow - 1) * (cellH + gap)
      elseif alignment == "left-to-right" then
        cx = pad + (row - 1) * (cellW + gap)
        cy = pad + (col - 1) * (cellH + gap)
      else
        cx = pad + (col - 1) * (cellW + gap)
        cy = pad + (row - 1) * (cellH + gap)
      end

      cell.node:setBounds(cx, cy, cellW, cellH)

      local clip = ctx.clips[col] and ctx.clips[col][row]
      local isSource = (row == 1)
      local isEmpty = clip and clip.empty
      local isEnabled = (not isSource) and clip and clip.enabled
      local isOutput = clip and clip.kind == "output"

      local isSourceSelected = isSource and ((tonumber(ctx.sourceSelectionCol) or 1) == col)
      local isEffectSelected = (not isSource) and ctx.selection and ctx.selection.col == col and ctx.selection.row == row
      local bg, borderClr, borderThick
      if isEmpty then
        bg = EMPTY_CELL_BG
        borderClr = 0xff0f1520
        borderThick = 1
      elseif isSource then
        bg = CELL_SRC_TINT
        borderClr = isSourceSelected and CELL_SRC_SEL_BD or 0xff22d3ee
        borderThick = isSourceSelected and 2 or 1
      elseif isEnabled or isOutput then
        bg = CELL_FX_TINT
        borderClr = isEffectSelected and CELL_FX_SEL_BD or CELL_BORDER
        borderThick = isEffectSelected and 2 or 1
      else
        bg = EMPTY_CELL_BG
        borderClr = isEffectSelected and CELL_FX_SEL_BD or 0xff0f1520
        borderThick = isEffectSelected and 2 or 1
      end

      cell.node:setDisplayList({
        { cmd = "fillRoundedRect", x = 0, y = 0, w = cellW, h = cellH, radius = 3, color = bg },
        { cmd = "drawRoundedRect", x = 0, y = 0, w = cellW, h = cellH, radius = 3, color = borderClr, thickness = borderThick },
      })

      if isEmpty then
        cell.thumb:setBounds(0, 0, 0, 0)
        cell.label:setBounds(0, 0, cellW, cellH)
        cell.label:setDisplayList({
          { cmd = "drawText", text = "No Source", color = 0xff334155, fontSize = 9, align = "center", valign = "middle" },
        })
      elseif isSource or isEnabled or isOutput then
        local contentAspectW, contentAspectH = deps.canonicalAspectSize(ctx)
        if isOverlay then
          local ix, iy, iw, ih = deps.fitBox(math.max(1, cellW - 4), math.max(1, cellH - 4), contentAspectW, contentAspectH)
          cell.thumb:setBounds(2 + ix, 2 + iy, iw, ih)
          cell.label:setBounds(4, math.max(1, cellH - 13), math.max(1, cellW - 8), labelH)
          local labelText = isOutput and "OUT" or (clip and (clip.name or clip.fxName) or "")
          local labelClr = isSource and 0xff22d3ee or (isOutput and 0xffa78bfa or 0xff94a3b8)
          cell.label:setDisplayList({
            { cmd = "fillRect", x = 0, y = 0, w = cellW + 8, h = labelH + 2, color = 0xaa000000 },
            { cmd = "drawText", text = labelText, color = labelClr, fontSize = 8, align = isOutput and "right" or "left", valign = "middle" },
          })
        else
          local ix, iy, iw, ih = deps.fitBox(math.max(1, cellW - 4), math.max(1, thumbH - 2), contentAspectW, contentAspectH)
          cell.thumb:setBounds(2 + ix, 2 + iy, iw, ih)
          local labelText = isOutput and "OUT" or (clip and (clip.name or clip.fxName) or "")
          cell.label:setBounds(4, math.max(1, thumbH + 2), math.max(1, cellW - 8), labelH)
          local labelClr = isSource and 0xff22d3ee or (isOutput and 0xffa78bfa or (isEnabled and 0xff94a3b8 or 0xff334155))
          cell.label:setDisplayList({
            { cmd = "fillRect", x = 0, y = 0, w = cellW + 8, h = labelH + 2, color = bg },
            { cmd = "drawText", text = labelText, color = labelClr, fontSize = 8 },
          })
        end
      else
        cell.thumb:setBounds(0, 0, 0, 0)
        local labelText = clip and clip.fxName or ""
        cell.label:setBounds(4, 4, math.max(1, cellW - 8), math.max(1, cellH - 8))
        cell.label:setDisplayList({
          { cmd = "fillRect", x = 0, y = 0, w = cellW + 8, h = cellH, color = bg },
          { cmd = "drawText", text = labelText, color = 0xff334155, fontSize = 8, align = "center", valign = "middle" },
        })
      end
    end
  end
end

function M.renderGridToolbar(ctx, parentW, deps)
  local toolbarH = 24
  imguiBeginChild("##gridToolbar", parentW, toolbarH, false, 0)

  local alignments = {
    { "^BU", "bottom-up", "Bottom-Up" },
    { ">LR", "left-to-right", "Left-to-Right" },
    { "vTD", "top-down", "Top-Down" },
  }
  for _, a in ipairs(alignments) do
    local isActive = ctx.gridAlignment == a[2]
    if isActive then imguiTextColored(0xff22d3ee, a[1]) else if imguiButton(a[1]) then ctx.gridAlignment = a[2] end end
    imguiSameLine()
  end

  if imguiButton("+Stack") then imguiOpenPopup("##srcPicker") end
  imguiSameLine()

  if imguiBeginPopup("##srcPicker") then
    if imguiMenuItem("Webcam") then deps.addColumn(ctx, { kind = "webcam" }); imguiCloseCurrentPopup() end

    if imguiBeginMenu("Generators") then
      for _, g in ipairs(ctx.sources or {}) do
        if g.kind == "generator" and imguiMenuItem(g.name or g.id) then
          local params = {}
          for _, pspec in ipairs(g.params or {}) do
            local defaultNorm = (tonumber(pspec.default) or 0 - tonumber(pspec.min or 0)) / math.max(0.001, tonumber(pspec.max or 1) - tonumber(pspec.min or 0))
            params[pspec.id] = deps.clamp(defaultNorm, 0, 1)
          end
          deps.addColumn(ctx, { kind = "generator", sourceId = g.id, params = params })
          imguiCloseCurrentPopup()
        end
      end
      imguiEndMenu()
    end

    if imguiBeginMenu("ML") then
      if imguiMenuItem("Segmented") then deps.addColumn(ctx, { kind = "ml", mlType = "segmented" }); imguiCloseCurrentPopup() end
      if imguiMenuItem("Pose") then deps.addColumn(ctx, { kind = "ml", mlType = "pose" }); imguiCloseCurrentPopup() end
      imguiEndMenu()
    end

    local hasTappable = false
    for _, cd in pairs(ctx._colData or {}) do if cd and cd.source then hasTappable = true; break end end
    if hasTappable and imguiBeginMenu("From Column") then
      for colId, cd in pairs(ctx._colData or {}) do
        if cd and cd.source then
          local label = "Stack " .. tostring(colId) .. " (" .. deps.colSourceLabel(ctx, colId) .. ")"
          if imguiMenuItem(label .. " / Raw (T0)") then deps.addColumn(ctx, { kind = "columntap", sourceCol = colId, tapIndex = 0 }); imguiCloseCurrentPopup() end
          for ti = 1, math.min(#cd.fx, 8) do
            if cd.fx[ti] and cd.fx[ti].enabled then
              local fxName = deps.colFxLabel(ctx, colId, ti)
              if imguiMenuItem(label .. " / " .. fxName .. " (T" .. ti .. ")") then deps.addColumn(ctx, { kind = "columntap", sourceCol = colId, tapIndex = ti }); imguiCloseCurrentPopup() end
            end
          end
        end
      end
      imguiEndMenu()
    end
    imguiEndPopup()
  end

  local sourceCol = tonumber(ctx.sourceSelectionCol) or 1
  local sel = ctx.selection
  if sourceCol > 1 then
    if imguiButton("Del") then deps.removeColumn(ctx, sourceCol) end
    imguiSameLine()
  end

  if sel and sel.col then
    local cd = ctx._colData and ctx._colData[sel.col]
    local clip = ctx.clips and ctx.clips[sel.col] and ctx.clips[sel.col][sel.row]
    if cd and cd.source and clip then
      local isAddCell = clip.emptyFx == true
      local isFxCell = clip.kind == "fx"
      if isAddCell or isFxCell then
        if imguiButton("+FX") then imguiOpenPopup("##fxPicker") end
        imguiSameLine()
        if imguiBeginPopup("##fxPicker") then
          for i, eff in ipairs(ctx.effects or {}) do
            if imguiMenuItem(eff.name or eff.id or ("Effect " .. i)) then deps.colAddFx(ctx, sel.col, i); imguiCloseCurrentPopup() end
          end
          imguiEndPopup()
        end
        if isFxCell and sel.row > 1 then
          if imguiButton("RmFX") then deps.colRemoveFx(ctx, sel.col, sel.row) end
          imguiSameLine()
        end
      end
    end
  end

  imguiText("")
  imguiSameLine()

  local colCount = 0
  if ctx._colData then for _ in pairs(ctx._colData) do colCount = colCount + 1 end end
  imguiText("  " .. tostring(colCount) .. " cols")
  imguiEndChild()
  return toolbarH
end

function M.renderDeckPanel(ctx, deps)
  local av = imguiGetContentRegionAvail()
  if av.x < 4 or av.y < 4 then return end
  local pw = math.floor(av.x)
  local ph = math.floor(av.y)

  local toolbarH = M.renderGridToolbar(ctx, pw, deps)
  local gridH = math.max(1, ph - toolbarH)

  deps.setBounds(ctx.widgets.deckEmbed, 0, 0, pw, gridH)
  M.layoutClipGrid(ctx, pw, gridH, deps)
  imguiRetainedPanel(ctx.widgets.deckEmbed.node, pw, gridH, true)
end

return M
