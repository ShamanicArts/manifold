-- Rack Layout Engine Module
-- Extracted from midisynth.lua
-- Owns rack pagination, drag/reorder behavior, shell layout, and full layout refresh.

local M = {}
local deps = {}
local host = nil

local dragState = {
  active = false,
  sourceKind = nil,
  shellId = nil,
  moduleId = nil,
  row = nil,
  paletteEntryId = nil,
  unregisterOnCancel = false,
  startX = 0,
  startY = 0,
  grabOffsetX = 0,
  grabOffsetY = 0,
  startIndex = nil,
  targetIndex = nil,
  previewIndex = nil,
  startPlacement = nil,
  previewPlacement = nil,
  rowSnapshot = nil,
  baseModules = nil,
  insertMode = false,
  ghostStartX = 0,
  ghostStartY = 0,
  ghostX = 0,
  ghostY = 0,
  ghostW = 0,
  ghostH = 0,
}

local function shellLayout()
  return deps.RACK_MODULE_SHELL_LAYOUT
end

function M.ensureRackPaginationState(ctx)
  if not ctx._rackPagination then
    ctx._rackPagination = {
      totalRows = 1,
      rowsPerPage = 1,
      pageCount = 1,
      visibleRows = {1},
      viewportOffset = 0,
      showAll = true,
    }
  end
  _G.__midiSynthRackPagination = ctx._rackPagination
  return ctx._rackPagination
end

function M.getRackNodeRowById(ctx, nodeId)
  local nodes = ctx and ctx._rackState and ctx._rackState.modules or nil
  if type(nodes) ~= "table" then
    return nil
  end
  for i = 1, #nodes do
    local node = nodes[i]
    if node and tostring(node.id or "") == tostring(nodeId or "") then
      return math.max(0, math.floor(tonumber(node.row) or 0))
    end
  end
  return nil
end

function M.getRackTotalRows(ctx)
  local rackState = ctx and ctx._rackState or nil
  local nodes = rackState and rackState.modules or nil
  local maxRow = -1
  if type(nodes) == "table" then
    for i = 1, #nodes do
      local node = nodes[i]
      if node then
        local row = math.max(0, math.floor(tonumber(node.row) or 0))
        if row > maxRow then
          maxRow = row
        end
      end
    end
  end

  local derivedRows = math.max(1, maxRow + 1)
  local explicitRows = math.max(0, math.floor(tonumber(rackState and rackState.rowCount) or 0))
  local totalRows = math.max(3, explicitRows, derivedRows)
  if rackState then
    rackState.rowCount = totalRows
  end
  return totalRows
end

local function preferredRackOutputRow(ctx)
  local nodes = ctx and ctx._rackState and ctx._rackState.modules or nil
  local connections = ctx and ctx._rackConnections or nil
  local normalized = deps.MidiSynthRackSpecs.normalizeConnections(connections, nodes)
  local fallbackRow = M.getRackTotalRows(ctx)

  for i = 1, #normalized do
    local conn = normalized[i]
    local from = conn and conn.from or nil
    local to = conn and conn.to or nil
    if tostring(conn and conn.kind or "") == "audio"
      and type(from) == "table"
      and type(to) == "table"
      and tostring(to.moduleId or "") == tostring(deps.MidiSynthRackSpecs.OUTPUT_NODE_ID)
      and tostring(to.portId or "") == tostring(deps.MidiSynthRackSpecs.OUTPUT_PORT_ID) then
      local row = M.getRackNodeRowById(ctx, tostring(from.moduleId or ""))
      if row ~= nil then
        return row + 1
      end
    end
  end

  return fallbackRow
end

function M.syncRackPaginationModel(ctx, viewportHeight)
  local p = M.ensureRackPaginationState(ctx)
  local totalRows = M.getRackTotalRows(ctx)
  local rackSlotH = tonumber(deps.RackLayoutManager and deps.RackLayoutManager.RACK_SLOT_H) or 220
  local rowsPerPage = math.max(1, math.floor((tonumber(viewportHeight) or 0) / rackSlotH))
  rowsPerPage = math.max(1, math.min(totalRows, rowsPerPage))

  local wasShowAll = p.showAll == true

  p.totalRows = totalRows
  p.rowsPerPage = rowsPerPage
  p.showAll = rowsPerPage >= totalRows

  local maxOffset = math.max(0, totalRows - rowsPerPage)
  local nextOffset = math.max(0, math.min(maxOffset, math.floor(tonumber(p.viewportOffset) or 0)))
  if p.showAll then
    nextOffset = 0
  elseif wasShowAll then
    local outputRow = math.max(1, math.min(totalRows, preferredRackOutputRow(ctx)))
    nextOffset = math.max(0, math.min(maxOffset, outputRow - rowsPerPage))
  end
  p.viewportOffset = nextOffset
  p.pageCount = p.showAll and totalRows or (maxOffset + 1)

  p.visibleRows = {}
  if p.showAll then
    for row = 1, totalRows do
      p.visibleRows[#p.visibleRows + 1] = row
    end
  else
    for row = 1, rowsPerPage do
      p.visibleRows[#p.visibleRows + 1] = nextOffset + row
    end
  end

  _G.__midiSynthRackPagination = p
  return p
end

function M.updateRackPaginationDots(ctx)
  local p = M.ensureRackPaginationState(ctx)
  local dots = ctx._rackDots or {}
  for _, entry in ipairs(dots) do
    local dot = entry.widget
    local i = entry.index
    if dot then
      local isVisible = i <= math.max(0, tonumber(p.totalRows) or 0)
      if dot.setVisible then
        dot:setVisible(isVisible)
      elseif dot.node and dot.node.setVisible then
        dot.node:setVisible(isVisible)
      end

      local isActive = false
      if isVisible then
        for _, rowIndex in ipairs(p.visibleRows or {}) do
          if rowIndex == i then
            isActive = true
            break
          end
        end
      end

      local newColour = isActive and 0xffffffff or 0xff475569
      if dot._colour ~= newColour then
        dot._colour = newColour
        if dot._syncRetained then dot:_syncRetained() end
        if dot.node and dot.node.repaint then dot.node:repaint() end
      end
    end
  end
end

function M.setRackViewport(ctx, offset)
  local p = M.ensureRackPaginationState(ctx)
  local maxOffset = math.max(0, (tonumber(p.totalRows) or 1) - (tonumber(p.rowsPerPage) or 1))
  p.viewportOffset = math.max(0, math.min(maxOffset, math.floor(tonumber(offset) or 0)))
  _G.__midiSynthRackPagination = p
  if ctx and ctx._lastW and ctx._lastH then
    M.refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
  else
    M.updateRackPaginationDots(ctx)
  end
end

function M.onRackDotClick(ctx, dotIndex)
  local p = M.ensureRackPaginationState(ctx)
  local targetRow = math.max(1, math.floor(tonumber(dotIndex) or 1))
  if p.showAll then
    M.updateRackPaginationDots(ctx)
    return
  end

  local firstVisible = tonumber((p.visibleRows or {})[1]) or 1
  local lastVisible = tonumber((p.visibleRows or {})[#(p.visibleRows or {})]) or firstVisible
  if targetRow >= firstVisible and targetRow <= lastVisible then
    M.updateRackPaginationDots(ctx)
    return
  end

  local rowsPerPage = math.max(1, tonumber(p.rowsPerPage) or 1)
  local maxOffset = math.max(0, (tonumber(p.totalRows) or 1) - rowsPerPage)
  local targetOffset = tonumber(p.viewportOffset) or 0
  if targetRow < firstVisible then
    targetOffset = targetRow - 1
  elseif targetRow > lastVisible then
    targetOffset = targetRow - rowsPerPage
  end
  targetOffset = math.max(0, math.min(maxOffset, targetOffset))
  M.setRackViewport(ctx, targetOffset)
end

function M.resetDragState(ctx)
  if ctx then
    ctx._dragPreviewModules = nil
  end
  dragState.active = false
  dragState.sourceKind = nil
  dragState.shellId = nil
  dragState.moduleId = nil
  dragState.row = nil
  dragState.paletteEntryId = nil
  dragState.unregisterOnCancel = false
  dragState.startX = 0
  dragState.startY = 0
  dragState.grabOffsetX = 0
  dragState.grabOffsetY = 0
  dragState.startIndex = nil
  dragState.targetIndex = nil
  dragState.previewIndex = nil
  dragState.startPlacement = nil
  dragState.previewPlacement = nil
  dragState.rowSnapshot = nil
  dragState.baseModules = nil
  dragState.insertMode = false
  dragState.ghostStartX = 0
  dragState.ghostStartY = 0
  dragState.ghostX = 0
  dragState.ghostY = 0
  dragState.ghostW = 0
  dragState.ghostH = 0
end

function M.getRackShellMetaByNodeId(nodeId)
  local layout = shellLayout()
  return type(layout) == "table" and layout[nodeId] or nil
end

function M.getRackNodeIdByShellId(shellId)
  local layout = shellLayout()
  if type(layout) ~= "table" then
    return nil, nil
  end
  for nodeId, meta in pairs(layout) do
    if type(meta) == "table" and meta.shellId == shellId then
      return nodeId, meta
    end
  end
  return nil, nil
end

function M.getWidgetBounds(widget)
  if not (widget and widget.node and widget.node.getBounds) then
    return nil
  end
  local x, y, w, h = widget.node:getBounds()
  return {
    x = tonumber(x) or 0,
    y = tonumber(y) or 0,
    w = tonumber(w) or 0,
    h = tonumber(h) or 0,
  }
end

function M.getWidgetBoundsInRoot(ctx, widget)
  if not widget then
    return nil
  end

  local bounds = M.getWidgetBounds(widget)
  if not bounds then
    return nil
  end

  local rootId = type(ctx) == "table" and ctx._globalPrefix or nil
  local record = widget._structuredRecord
  local current = type(record) == "table" and record.parent or nil

  while current do
    if current.globalId == rootId then
      break
    end

    local parentWidget = current.widget
    local parentBounds = M.getWidgetBounds(parentWidget)
    if parentBounds then
      bounds.x = bounds.x + (tonumber(parentBounds.x) or 0)
      bounds.y = bounds.y + (tonumber(parentBounds.y) or 0)
    end
    current = current.parent
  end

  return bounds
end

function M.getShellWidget(ctx, nodeId)
  local meta = M.getRackShellMetaByNodeId(nodeId)
  if not meta then
    return nil
  end
  return deps.getScopedWidget(ctx, "." .. meta.shellId)
end

function M.setShellDragPlaceholder(ctx, nodeId, active)
  local shellWidget = M.getShellWidget(ctx, nodeId)
  if not shellWidget or type(shellWidget.setStyle) ~= "function" then
    return
  end
  shellWidget:setStyle({ opacity = active and 0.22 or 1.0 })
  if shellWidget.node and shellWidget.node.repaint then
    shellWidget.node:repaint()
  end
end

function M.ensureDragGhost(ctx)
  if ctx._dragGhostCanvas then
    return ctx._dragGhostCanvas, ctx._dragGhostAccentCanvas
  end
  if not (ctx and ctx.root and ctx.root.node and ctx.root.node.addChild) then
    return nil, nil
  end

  local ghost = ctx.root.node:addChild("rackDragGhost")
  if not ghost then
    return nil, nil
  end
  ghost:setInterceptsMouse(false, false)
  ghost:setVisible(false)
  ghost:setStyle({ bg = 0xcc121a2f, border = 0xff94a3b8, borderWidth = 2, radius = 0, opacity = 0.92 })
  if ghost.toFront then
    ghost:toFront(false)
  end

  local accent = ghost:addChild("accent")
  if accent then
    accent:setInterceptsMouse(false, false)
    accent:setStyle({ bg = 0xffffffff, border = 0x00000000, borderWidth = 0, radius = 0, opacity = 1.0 })
  end

  ctx._dragGhostCanvas = ghost
  ctx._dragGhostAccentCanvas = accent
  return ghost, accent
end

function M.hideDragGhost(ctx)
  local ghost = ctx and ctx._dragGhostCanvas or nil
  if ghost then
    ghost:setVisible(false)
  end
end

function M.updateDragGhost(ctx)
  local ghost, accent = M.ensureDragGhost(ctx)
  if not ghost then
    return
  end
  ghost:setBounds(
    math.floor((dragState.ghostX or 0) + 0.5),
    math.floor((dragState.ghostY or 0) + 0.5),
    math.max(1, math.floor((dragState.ghostW or 1) + 0.5)),
    math.max(1, math.floor((dragState.ghostH or 1) + 0.5))
  )
  ghost:setVisible(true)
  if ghost.toFront then
    ghost:toFront(false)
  end
  if accent then
    accent:setBounds(0, 0, math.max(1, math.floor((dragState.ghostW or 1) + 0.5)), 12)
  end
end

function M.getActiveRackNodes(ctx)
  return (ctx and (ctx._dragPreviewModules or (ctx._rackState and ctx._rackState.modules))) or {}
end

function M.getActiveRackNodeById(ctx, nodeId)
  local nodes = M.getActiveRackNodes(ctx)
  for i = 1, #nodes do
    if nodes[i] and nodes[i].id == nodeId then
      return nodes[i]
    end
  end
  return nil
end

function M.collectRackFlowSnapshot(ctx)
  local snapshot = {}
  local orderedNodes = deps.RackLayout.getFlowModules(M.getActiveRackNodes(ctx))
  for i = 1, #orderedNodes do
    local node = orderedNodes[i]
    local meta = M.getRackShellMetaByNodeId(node.id)
    if meta then
      local shellWidget = deps.getScopedWidget(ctx, "." .. meta.shellId)
      local bounds = M.getWidgetBoundsInRoot(ctx, shellWidget)
      if bounds and bounds.w > 0 then
        snapshot[#snapshot + 1] = {
          id = node.id,
          row = tonumber(node.row) or 0,
          col = tonumber(node.col) or 0,
          bounds = bounds,
          index = i,
          w = tonumber(node.w) or 1,
        }
      end
    end
  end
  return snapshot
end

local function collectRackRowBands(ctx, snapshot)
  local rowBands = {}
  for row = 0, 7 do
    local rowWidget = deps.getScopedWidget(ctx, ".rackRow" .. tostring(row + 1))
    local visible = rowWidget and rowWidget.isVisible and rowWidget:isVisible()
    if visible ~= false then
      local rowBounds = M.getWidgetBoundsInRoot(ctx, rowWidget)
      if rowBounds and rowBounds.h > 0 then
        rowBands[#rowBands + 1] = {
          row = row,
          left = tonumber(rowBounds.x) or 0,
          right = (tonumber(rowBounds.x) or 0) + (tonumber(rowBounds.w) or 0),
          top = tonumber(rowBounds.y) or 0,
          bottom = (tonumber(rowBounds.y) or 0) + (tonumber(rowBounds.h) or 0),
        }
      end
    end
  end

  if #rowBands == 0 and type(snapshot) == "table" then
    local byRow = {}
    for i = 1, #snapshot do
      local entry = snapshot[i]
      local row = tonumber(entry.row) or 0
      local band = byRow[row]
      local top = tonumber(entry.bounds.y) or 0
      local bottom = top + (tonumber(entry.bounds.h) or 0)
      if not band then
        byRow[row] = { row = row, left = tonumber(entry.bounds.x) or 0, right = (tonumber(entry.bounds.x) or 0) + (tonumber(entry.bounds.w) or 0), top = top, bottom = bottom }
      else
        local left = tonumber(entry.bounds.x) or 0
        local right = left + (tonumber(entry.bounds.w) or 0)
        if top < band.top then band.top = top end
        if bottom > band.bottom then band.bottom = bottom end
        if left < (band.left or left) then band.left = left end
        if right > (band.right or right) then band.right = right end
      end
    end
    for _, band in pairs(byRow) do
      rowBands[#rowBands + 1] = band
    end
  end

  table.sort(rowBands, function(a, b)
    if a.top ~= b.top then
      return a.top < b.top
    end
    return (a.row or 0) < (b.row or 0)
  end)
  return rowBands
end

function M._pointInsideRackFlowBands(ctx, snapshot, centerX, centerY)
  local rowBands = collectRackRowBands(ctx, snapshot)
  if #rowBands == 0 then
    return false
  end

  local x = tonumber(centerX) or 0
  local y = tonumber(centerY) or 0
  for i = 1, #rowBands do
    local band = rowBands[i]
    if x >= (tonumber(band.left) or 0)
      and x <= (tonumber(band.right) or 0)
      and y >= (tonumber(band.top) or 0)
      and y <= (tonumber(band.bottom) or 0) then
      return true
    end
  end
  return false
end

function M.computeRackFlowTargetPlacement(ctx, snapshot, movingNodeId, centerX, centerY)
  if type(snapshot) ~= "table" or #snapshot == 0 then
    return nil
  end

  local rowBands = collectRackRowBands(ctx, snapshot)
  if #rowBands == 0 then
    return nil
  end

  local selectedBand = rowBands[1]
  local selectedRow = tonumber(selectedBand.row) or 0
  local y = tonumber(centerY) or 0
  for i = 1, #rowBands do
    local band = rowBands[i]
    local nextBand = rowBands[i + 1]
    selectedBand = band
    selectedRow = tonumber(band.row) or 0
    if not nextBand then
      break
    end
    local boundary = ((tonumber(band.bottom) or 0) + (tonumber(nextBand.top) or 0)) * 0.5
    if y < boundary then
      break
    end
  end

  local entriesByRow = {}
  local flowCount = 0
  local movingId = tostring(movingNodeId or "")
  local hasMoving = movingId == ""
  for i = 1, #snapshot do
    local entry = snapshot[i]
    if movingId ~= "" and entry.id == movingId then
      hasMoving = true
    else
      flowCount = flowCount + 1
      local row = tonumber(entry.row) or 0
      local bucket = entriesByRow[row]
      if not bucket then
        bucket = {}
        entriesByRow[row] = bucket
      end
      bucket[#bucket + 1] = entry
    end
  end
  if not hasMoving then
    return nil
  end

  local rowEntries = entriesByRow[selectedRow] or {}
  table.sort(rowEntries, function(a, b)
    local ac = tonumber(a.col) or 0
    local bc = tonumber(b.col) or 0
    if ac ~= bc then
      return ac < bc
    end
    return tostring(a.id or "") < tostring(b.id or "")
  end)

  local movingWidth = 1
  local movingHeight = 1
  for _, sourceNodes in ipairs({ dragState.baseModules, ctx and ctx._dragPreviewModules, ctx and ctx._rackState and ctx._rackState.modules }) do
    if type(sourceNodes) == "table" then
      for i = 1, #sourceNodes do
        local node = sourceNodes[i]
        if node and tostring(node.id or "") == movingId then
          movingWidth = math.max(1, tonumber(node.w) or 1)
          movingHeight = math.max(1, tonumber(node.h) or 1)
          break
        end
      end
    end
    if movingWidth ~= 1 or movingHeight ~= 1 then
      break
    end
  end

  local slotW = tonumber(deps.RackLayoutManager and deps.RackLayoutManager.RACK_SLOT_W) or 236
  local maxCols = math.max(1, tonumber(deps.RACK_COLUMNS_PER_ROW) or 5)
  local maxStartCol = math.max(0, maxCols - movingWidth)
  local rowLeft = tonumber(selectedBand.left) or 0
  local ghostLeft = (tonumber(centerX) or rowLeft) - ((movingWidth * slotW) * 0.5)
  local targetCol = math.floor(((ghostLeft - rowLeft) / slotW) + 0.5)
  if targetCol < 0 then
    targetCol = 0
  end
  if targetCol > maxStartCol then
    targetCol = maxStartCol
  end

  local sourceNodes = type(dragState.baseModules) == "table"
      and dragState.baseModules
      or (ctx and ctx._rackState and ctx._rackState.modules)
      or {}
  if deps.RackLayout.isAreaFree(sourceNodes, selectedRow, targetCol, movingWidth, movingHeight, movingId ~= "" and movingId or nil) then
    return {
      mode = "slot",
      row = selectedRow,
      col = targetCol,
    }
  end

  local rowTargetIndex = 1
  for i = 1, #rowEntries do
    local midpoint = (tonumber(rowEntries[i].bounds.x) or 0) + ((tonumber(rowEntries[i].bounds.w) or 0) * 0.5)
    if (tonumber(centerX) or 0) > midpoint then
      rowTargetIndex = rowTargetIndex + 1
    end
  end

  local targetIndex = rowTargetIndex
  for _, band in ipairs(rowBands) do
    if (tonumber(band.row) or 0) < selectedRow then
      targetIndex = targetIndex + #(entriesByRow[band.row] or {})
    end
  end

  if targetIndex < 1 then
    targetIndex = 1
  end
  if targetIndex > (flowCount + 1) then
    targetIndex = flowCount + 1
  end

  return {
    mode = "flow",
    row = selectedRow,
    index = targetIndex,
  }
end

local function samePlacement(a, b)
  return type(a) == "table" and type(b) == "table"
    and tostring(a.mode or "flow") == tostring(b.mode or "flow")
    and tonumber(a.row) == tonumber(b.row)
    and tonumber(a.col) == tonumber(b.col)
    and tonumber(a.index) == tonumber(b.index)
end

local function parseSizeKey(sizeKey)
  local h, w = tostring(sizeKey or ""):match("^(%d+)x(%d+)$")
  if h == nil or w == nil then
    return nil, nil
  end
  return tonumber(h), tonumber(w)
end

local function collapseShapeForNode(node, spec)
  local currentH = math.max(1, tonumber(node and node.h) or 1)
  local currentW = math.max(1, tonumber(node and node.w) or 1)
  local validSizes = type(spec and spec.validSizes) == "table" and spec.validSizes or {}
  local bestH = nil
  local bestW = nil
  local bestKey = nil

  for i = 1, #validSizes do
    local sizeKey = tostring(validSizes[i] or "")
    local h, w = parseSizeKey(sizeKey)
    if h ~= nil and w ~= nil and h == currentH and w < currentW then
      if bestW == nil or w < bestW then
        bestH = h
        bestW = w
        bestKey = sizeKey
      end
    end
  end

  return bestH, bestW, bestKey
end

function M.autoCollapseRowForInsertion(nodes, movingNodeId, targetRow, movingWidth, specsById, maxCols)
  local working = deps.RackLayout.cloneRackModules(nodes)
  local target = math.max(0, tonumber(targetRow) or 0)
  local widthNeeded = math.max(1, tonumber(movingWidth) or 1)
  local limit = math.max(1, tonumber(maxCols) or deps.RACK_COLUMNS_PER_ROW)
  local rowTotal = widthNeeded
  local candidates = {}

  for i = 1, #working do
    local node = working[i]
    if node and node.id ~= movingNodeId and math.max(0, tonumber(node.row) or 0) == target then
      rowTotal = rowTotal + math.max(1, tonumber(node.w) or 1)
      local spec = type(specsById) == "table" and specsById[node.id] or nil
      local nextH, nextW, nextKey = collapseShapeForNode(node, spec)
      if nextW ~= nil and nextW < math.max(1, tonumber(node.w) or 1) then
        candidates[#candidates + 1] = {
          node = node,
          nextH = nextH,
          nextW = nextW,
          nextKey = nextKey,
        }
      end
    end
  end

  table.sort(candidates, function(a, b)
    local ac = tonumber(a and a.node and a.node.col) or 0
    local bc = tonumber(b and b.node and b.node.col) or 0
    return ac > bc
  end)

  for i = 1, #candidates do
    if rowTotal <= limit then
      break
    end
    local candidate = candidates[i]
    local node = candidate.node
    local currentW = math.max(1, tonumber(node and node.w) or 1)
    local nextW = math.max(1, tonumber(candidate.nextW) or currentW)
    if nextW < currentW then
      rowTotal = rowTotal - (currentW - nextW)
      node.w = nextW
      node.h = math.max(1, tonumber(candidate.nextH) or tonumber(node.h) or 1)
      node.sizeKey = candidate.nextKey or string.format("%dx%d", node.h, node.w)
    end
  end

  return working
end

function M.previewRackDragReorder(ctx, targetPlacement)
  if not dragState.active or not dragState.moduleId then
    return false
  end
  if type(dragState.baseModules) ~= "table" then
    return false
  end

  local nextPlacement = type(targetPlacement) == "table" and targetPlacement or dragState.startPlacement
  if type(nextPlacement) ~= "table" then
    return false
  end
  if samePlacement(dragState.previewPlacement, nextPlacement) then
    return false
  end

  local movingNode = M.getActiveRackNodeById({ _dragPreviewModules = nil, _rackState = { modules = dragState.baseModules } }, dragState.moduleId)
  local movingWidth = math.max(1, tonumber(movingNode and movingNode.w) or 1)
  local workingNodes = M.autoCollapseRowForInsertion(
    dragState.baseModules,
    dragState.moduleId,
    nextPlacement.row,
    movingWidth,
    ctx and ctx._rackModuleSpecs,
    deps.RACK_COLUMNS_PER_ROW
  )

  local ok, nextNodes
  if tostring(nextPlacement.mode or "flow") == "slot" then
    local maxRows = math.max(M.getRackTotalRows(ctx), (tonumber(nextPlacement.row) or 0) + math.max(1, tonumber(movingNode and movingNode.h) or 1) + 1, 8)
    ok, nextNodes = pcall(deps.RackLayout.moveModuleToSlot, workingNodes, dragState.moduleId, nextPlacement.row, nextPlacement.col, deps.RACK_COLUMNS_PER_ROW, maxRows)
  else
    local minRows = {}
    for i = 1, #(workingNodes or {}) do
      local node = workingNodes[i]
      if node and node.id ~= dragState.moduleId then
        minRows[tostring(node.id or "")] = tonumber(node.row) or 0
      end
    end
    minRows[tostring(dragState.moduleId or "")] = tonumber(nextPlacement.row) or 0
    ok, nextNodes = pcall(deps.RackLayout.moveModuleInFlowConstrained, workingNodes, dragState.moduleId, nextPlacement.index, deps.RACK_COLUMNS_PER_ROW, 0, minRows)
  end
  if not ok or type(nextNodes) ~= "table" then
    return false
  end

  ctx._dragPreviewModules = nextNodes
  dragState.previewPlacement = {
    mode = tostring(nextPlacement.mode or "flow"),
    row = nextPlacement.row,
    col = nextPlacement.col,
    index = nextPlacement.index,
  }
  dragState.previewIndex = tonumber(nextPlacement.col or nextPlacement.index)
  dragState.targetIndex = tonumber(nextPlacement.col or nextPlacement.index)
  M.refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
  return true
end

function M.finalizeRackDragReorder(ctx)
  if not dragState.active or not dragState.moduleId then
    return false
  end

  if dragState.sourceKind == "palette" and dragState.previewPlacement == nil then
    if dragState.unregisterOnCancel then
      deps.RackModuleFactory.unregisterDynamicModuleSpec(ctx, dragState.moduleId, {
        setPath = deps.setPath,
        voiceCount = deps.VOICE_COUNT,
      })
    end
    ctx._dragPreviewModules = nil
    M.refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
    return false
  end

  local finalNodes = ctx._dragPreviewModules or dragState.baseModules
  if type(finalNodes) ~= "table" then
    return false
  end

  ctx._rackState.modules = deps.RackLayout.cloneRackModules(finalNodes)
  ctx._rackState.utilityDock = deps.ensureUtilityDockState(ctx)
  _G.__midiSynthRackState = ctx._rackState
  ctx._dragPreviewModules = nil

  local moved = false
  local beforeNode = dragState.baseModules and M.getActiveRackNodeById({ _dragPreviewModules = nil, _rackState = { modules = dragState.baseModules } }, dragState.moduleId) or nil
  local afterNode = M.getActiveRackNodeById({ _dragPreviewModules = nil, _rackState = { modules = finalNodes } }, dragState.moduleId) or nil
  if beforeNode and afterNode then
    moved = (tonumber(beforeNode.row) ~= tonumber(afterNode.row)) or (tonumber(beforeNode.col) ~= tonumber(afterNode.col))
  end

  local topologyChanged = dragState.insertMode and moved
  if topologyChanged then
    ctx._rackConnections = deps.MidiSynthRackSpecs.insertRackModuleAtVisualSlot(
      ctx._rackConnections or {},
      ctx._rackState.modules,
      dragState.moduleId,
      dragState.baseModules
    )
    _G.__midiSynthRackConnections = ctx._rackConnections
    local finalNode = afterNode or M.getActiveRackNodeById(ctx, dragState.moduleId)
    ctx._lastEvent = string.format("Rack inserted: %s → row %d col %d", tostring(dragState.moduleId), tonumber(finalNode and finalNode.row) or -1, tonumber(finalNode and finalNode.col) or -1)
    host.applyRackConnectionState(ctx, "rack-shift-insert")
  else
    ctx._rackConnections = deps.MidiSynthRackSpecs.normalizeConnections(ctx._rackConnections or {}, ctx._rackState.modules)
    _G.__midiSynthRackConnections = ctx._rackConnections
    if moved then
      local finalNode = afterNode or M.getActiveRackNodeById(ctx, dragState.moduleId)
      ctx._lastEvent = string.format("Rack moved: %s → row %d col %d", tostring(dragState.moduleId), tonumber(finalNode and finalNode.row) or -1, tonumber(finalNode and finalNode.col) or -1)
    end
  end
  M.refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
  if not topologyChanged and type(host._refreshRackPresentation) == "function" then
    host._refreshRackPresentation(ctx)
  end
  return moved
end

function M._setupShellDragHandlers(ctx)
  local layout = shellLayout()
  if type(layout) ~= "table" then
    return
  end

  for _, meta in pairs(layout) do
    local shellId = meta.shellId
    local nodeId = M.getRackNodeIdByShellId(shellId)
    local accent = deps.getScopedWidget(ctx, "." .. shellId .. ".accent")

    if accent and accent.node and nodeId then
      accent.node:setInterceptsMouse(true, true)

      local isDragging = false

      accent.node:setOnMouseDown(function(x, y, shift)
        local currentNode = M.getActiveRackNodeById(ctx, nodeId)
        local snapshot = M.collectRackFlowSnapshot(ctx)
        local shellWidget = M.getShellWidget(ctx, nodeId)
        local rootBounds = M.getWidgetBoundsInRoot(ctx, shellWidget)
        local startCenterX = rootBounds and ((rootBounds.x or 0) + ((rootBounds.w or 0) * 0.5)) or 0
        local startCenterY = rootBounds and ((rootBounds.y or 0) + ((rootBounds.h or 0) * 0.5)) or 0
        local startPlacement = M.computeRackFlowTargetPlacement(ctx, snapshot, nodeId, startCenterX, startCenterY)
        if type(startPlacement) ~= "table" or not rootBounds then
          return
        end

        isDragging = true
        dragState.active = true
        dragState.shellId = shellId
        dragState.moduleId = nodeId
        dragState.row = currentNode and currentNode.row or tonumber(meta.row) or 0
        dragState.startX = x
        dragState.startY = y
        dragState.grabOffsetX = x
        dragState.grabOffsetY = y
        dragState.startIndex = tonumber(startPlacement.col or startPlacement.index)
        dragState.targetIndex = tonumber(startPlacement.col or startPlacement.index)
        dragState.previewIndex = tonumber(startPlacement.col or startPlacement.index)
        dragState.startPlacement = {
          mode = tostring(startPlacement.mode or "flow"),
          row = startPlacement.row,
          col = startPlacement.col,
          index = startPlacement.index,
        }
        dragState.previewPlacement = {
          mode = tostring(startPlacement.mode or "flow"),
          row = startPlacement.row,
          col = startPlacement.col,
          index = startPlacement.index,
        }
        dragState.rowSnapshot = snapshot
        dragState.baseModules = deps.RackLayout.cloneRackModules((ctx._rackState and ctx._rackState.modules) or {})
        dragState.insertMode = shift == true
        dragState.ghostStartX = rootBounds.x or 0
        dragState.ghostStartY = rootBounds.y or 0
        dragState.ghostX = rootBounds.x or 0
        dragState.ghostY = rootBounds.y or 0
        dragState.ghostW = rootBounds.w or 1
        dragState.ghostH = rootBounds.h or 1

        local _, ghostAccent = M.ensureDragGhost(ctx)
        local spec = ctx._rackModuleSpecs and ctx._rackModuleSpecs[nodeId] or nil
        local ghostAccentColor = (spec and spec.accentColor) or meta.accentColor or 0xff64748b
        if ghostAccent then
          ghostAccent:setStyle({ bg = ghostAccentColor, border = 0x00000000, borderWidth = 0, radius = 0, opacity = 1.0 })
        end
        M.setShellDragPlaceholder(ctx, nodeId, true)
        M.updateDragGhost(ctx)
      end)

      accent.node:setOnMouseDrag(function(_, _, dx, dy)
        if not isDragging then return end

        dragState.ghostX = (dragState.ghostStartX or 0) + (tonumber(dx) or 0)
        dragState.ghostY = (dragState.ghostStartY or 0) + (tonumber(dy) or 0)
        M.updateDragGhost(ctx)

        local snapshot = M.collectRackFlowSnapshot(ctx)
        dragState.rowSnapshot = snapshot
        local ghostCenterX = (dragState.ghostX or 0) + ((dragState.ghostW or 0) * 0.5)
        local ghostCenterY = (dragState.ghostY or 0) + ((dragState.ghostH or 0) * 0.5)
        local targetPlacement = M.computeRackFlowTargetPlacement(ctx, snapshot, nodeId, ghostCenterX, ghostCenterY) or dragState.startPlacement
        M.previewRackDragReorder(ctx, targetPlacement)
        M.setShellDragPlaceholder(ctx, nodeId, true)
      end)

      accent.node:setOnMouseUp(function()
        if not isDragging then return end
        isDragging = false
        M.finalizeRackDragReorder(ctx)
        M.setShellDragPlaceholder(ctx, nodeId, false)
        M.hideDragGhost(ctx)
        M.resetDragState(ctx)
      end)
    end
  end
end

local function setWidgetVisible(widget, visible)
  if widget == nil then
    return
  end
  if widget.setVisible then
    widget:setVisible(visible)
  elseif widget.node and widget.node.setVisible then
    widget.node:setVisible(visible)
  end
end

local function isUtilityDockVisible(ctx)
  local dock = deps.ensureUtilityDockState(ctx)
  return dock.visible ~= false and dock.mode ~= "hidden"
end

function M.syncDockModeDots(ctx)
  local mode = ctx._dockMode or "compact_collapsed"
  local dots = ctx._dockDots
  if not dots then return end
  for _, entry in ipairs(dots) do
    local color = (entry.mode == mode) and 0xffffffff or 0xff475569
    if entry.widget and entry.widget._colour ~= color then
      entry.widget._colour = color
      if entry.widget._syncRetained then entry.widget:_syncRetained() end
      if entry.widget.node and entry.widget.node.repaint then entry.widget.node:repaint() end
    end
  end
end

function M.syncKeyboardCollapseButton(ctx)
  return deps.syncKeyboardCollapseButton(ctx)
end

local function setMeasuredWidgetBounds(widget, width, height)
  if widget == nil then
    return false
  end

  local node = widget.node
  local currentX = 0
  local currentY = 0
  local currentW = 0
  local currentH = 0
  if node and node.getBounds then
    local bx, by, bw, bh = node:getBounds()
    currentX = tonumber(bx) or 0
    currentY = tonumber(by) or 0
    currentW = tonumber(bw) or 0
    currentH = tonumber(bh) or 0
  else
    if node and node.getWidth then
      currentW = tonumber(node:getWidth()) or 0
    end
    if node and node.getHeight then
      currentH = tonumber(node:getHeight()) or 0
    end
  end

  local nextW = math.max(1, deps.round(width or currentW or 1))
  local nextH = math.max(1, deps.round(height or currentH or 1))
  if currentW == nextW and currentH == nextH then
    return false
  end

  if widget.setBounds then
    widget:setBounds(currentX, currentY, nextW, nextH)
  elseif node and node.setBounds then
    node:setBounds(currentX, currentY, nextW, nextH)
  end
  return true
end

function M.setWidgetBounds(widget, x, y, w, h)
  if widget == nil then
    return false
  end

  local nextX = deps.round(x or 0)
  local nextY = deps.round(y or 0)
  local nextW = math.max(1, deps.round(w or 1))
  local nextH = math.max(1, deps.round(h or 1))
  local currentX = 0
  local currentY = 0
  local currentW = 0
  local currentH = 0

  local node = widget.node
  if node and node.getBounds then
    local bx, by, bw, bh = node:getBounds()
    currentX = deps.round(bx or 0)
    currentY = deps.round(by or 0)
    currentW = deps.round(bw or 0)
    currentH = deps.round(bh or 0)
  end

  if currentX == nextX and currentY == nextY and currentW == nextW and currentH == nextH then
    return false
  end

  if widget.setBounds then
    widget:setBounds(nextX, nextY, nextW, nextH)
  elseif node and node.setBounds then
    node:setBounds(nextX, nextY, nextW, nextH)
  end
  return true
end

local function computeProjectedRowWidths(nodes, rowBounds)
  return deps.RackLayoutManager.computeProjectedRowWidths(nodes, rowBounds)
end

function M.syncRackShellLayout(ctx)
  local defaultRackState = deps.MidiSynthRackSpecs.defaultRackState()
  local rackState = ctx._rackState or {
    viewMode = defaultRackState.viewMode,
    densityMode = defaultRackState.densityMode,
    utilityDock = defaultRackState.utilityDock,
    modules = deps.RackLayout.cloneRackModules(defaultRackState.modules),
  }
  if #(rackState.modules or {}) == 0 then
    rackState.modules = deps.RackLayout.cloneRackModules(defaultRackState.modules)
  end
  ctx._rackState = rackState
  ctx._utilityDock = rackState.utilityDock or ctx._utilityDock

  local rowBoundsByRow = {}
  for row = 0, 7 do
    local rowWidget = deps.getScopedWidget(ctx, ".rackRow" .. tostring(row + 1))
    if rowWidget then
      rowBoundsByRow[row] = M.getWidgetBounds(rowWidget)
    end
  end

  local layoutNodes = deps.RackLayout.getFlowModules(ctx._dragPreviewModules or rackState.modules or {})
  local rowBuckets = {}
  for i = 1, #layoutNodes do
    local node = layoutNodes[i]
    local row = math.max(0, tonumber(node.row) or 0)
    local bucket = rowBuckets[row]
    if not bucket then
      bucket = {}
      rowBuckets[row] = bucket
    end
    bucket[#bucket + 1] = node
  end

  local lm = deps.RackLayoutManager
  local RACK_SLOT_W = lm.RACK_SLOT_W
  local RACK_SLOT_H = lm.RACK_SLOT_H
  local RACK_ROW_GAP = lm.RACK_ROW_GAP
  local RACK_ROW_PADDING_X = lm.RACK_ROW_PADDING_X

  local changed = false
  local layout = shellLayout() or {}
  for row, bucket in pairs(rowBuckets) do
    local rowBounds = rowBoundsByRow[row]
    if rowBounds then
      local rowLeft = (tonumber(rowBounds.x) or 0) + RACK_ROW_PADDING_X
      local rowTop = tonumber(rowBounds.y) or 0
      for i = 1, #bucket do
        local node = bucket[i]
        local shellMeta = node and layout[node.id] or nil
        if shellMeta then
          local shellWidget = deps.getScopedWidget(ctx, "." .. shellMeta.shellId)
          local width = math.max(1, tonumber(node.w) or 1) * RACK_SLOT_W
          local height = math.max(1, tonumber(node.h) or 1) * RACK_SLOT_H
          local x = rowLeft + (math.max(0, tonumber(node.col) or 0) * (RACK_SLOT_W + RACK_ROW_GAP))
          local y = rowTop
          local sizeText = type(node.sizeKey) == "string" and node.sizeKey ~= "" and node.sizeKey or string.format("%dx%d", math.max(1, tonumber(node.h) or 1), math.max(1, tonumber(node.w) or 1))
          if shellWidget then
            local componentBehavior = deps.getScopedBehavior(ctx, "." .. tostring(shellMeta.shellId or "") .. "." .. tostring(shellMeta.componentId or ""))
            if componentBehavior and componentBehavior.ctx then
              componentBehavior.ctx.instanceProps = type(componentBehavior.ctx.instanceProps) == "table" and componentBehavior.ctx.instanceProps or {}
              componentBehavior.ctx.instanceProps.sizeKey = sizeText
            end
            changed = deps.RackLayoutManager.updateWidgetRectSpec(shellWidget, x, y, width, height) or changed
            changed = M.setWidgetBounds(shellWidget, x, y, width, height) or changed
            deps.RackLayoutManager.relayoutWidgetSubtree(shellWidget, width, height)
          end
          local badge = deps.getScopedWidget(ctx, shellMeta.badgeSuffix)
          deps.syncText(badge, sizeText)
        end
      end
    end
  end

  return changed
end

function M.refreshManagedLayoutState(ctx, w, h)
  local widgets = ctx.widgets or {}
  if host and type(host._setupUtilityPaletteBrowserHandlers) == "function" then
    host._setupUtilityPaletteBrowserHandlers(ctx)
  end
  local mainStack = widgets.mainStack
  local contentRows = widgets.content_rows
  local topRow = widgets.top_row
  local bottomRow = widgets.bottom_row
  local keyboardPanel = widgets.keyboardPanel
  local keyboardBody = widgets.keyboardBody
  local utilitySplitArea = widgets.utilitySplitArea
  local utilityTopBar = widgets.utilityTopBar
  local utilityBrowserBody = widgets.utilityBrowserBody
  local utilityNavRail = widgets.utilityNavRail
  local paletteStrip = widgets.paletteStrip
  local utilityDetailPanel = widgets.utilityDetailPanel
  local keyboardGrabHandle = widgets.keyboardGrabHandle
  local midiParamRack = widgets.midiParamRack
  local keyboardHeader = widgets.keyboardHeader
  local keyboardCanvas = widgets.keyboardCanvas
  local dockModeDots = widgets.dockModeDots

  local totalW = tonumber(w) or tonumber(ctx._lastW)
  local totalH = tonumber(h) or tonumber(ctx._lastH)
  if (totalW == nil or totalH == nil) and ctx.root and ctx.root.node and ctx.root.node.getBounds then
    local _, _, bw, bh = ctx.root.node:getBounds()
    if totalW == nil then totalW = tonumber(bw) end
    if totalH == nil then totalH = tonumber(bh) end
  end
  if (totalW == nil or totalH == nil) and mainStack and mainStack.node and mainStack.node.getBounds then
    local _, _, bw, bh = mainStack.node:getBounds()
    if totalW == nil then totalW = tonumber(bw) end
    if totalH == nil then totalH = tonumber(bh) end
  end
  totalW = math.max(1, deps.round(totalW or 0))
  totalH = math.max(1, deps.round(totalH or 0))

  deps.syncKeyboardCollapsedFromUtilityDock(ctx)
  deps.syncKeyboardCollapseButton(ctx)

  local stackChanged = M.setWidgetBounds(mainStack, 0, 0, totalW, totalH)

  local dockVisible = isUtilityDockVisible(ctx)
  local dock = deps.ensureUtilityDockState(ctx)
  local isCollapsedMode = (dock.heightMode == "collapsed") or (ctx._dockMode == "compact_collapsed")
  local isCompactMode = (dock.heightMode == "compact") and not isCollapsedMode
  local bodyVisible = dockVisible and not isCollapsedMode
  local utilityVisible = dockVisible
  local utilityNavVisible = utilityVisible
  local utilityDetailVisible = utilityVisible
  local handleVisible = dockVisible
  local midiVisible = dockVisible
  local bodyVisibilityChanged = false

  if keyboardPanel and keyboardPanel.setVisible then
    local currentVisible = true
    if keyboardPanel.isVisible then
      currentVisible = keyboardPanel:isVisible()
    end
    if currentVisible ~= dockVisible then
      keyboardPanel:setVisible(dockVisible)
      bodyVisibilityChanged = true
    end
  end
  if keyboardBody and keyboardBody.setVisible then
    local currentVisible = true
    if keyboardBody.isVisible then
      currentVisible = keyboardBody:isVisible()
    end
    if currentVisible ~= bodyVisible then
      keyboardBody:setVisible(bodyVisible)
      bodyVisibilityChanged = true
    end
  end
  if keyboardCanvas and keyboardCanvas.setVisible then
    local currentVisible = true
    if keyboardCanvas.isVisible then
      currentVisible = keyboardCanvas:isVisible()
    end
    if currentVisible ~= bodyVisible then
      keyboardCanvas:setVisible(bodyVisible)
      bodyVisibilityChanged = true
    end
  end
  if utilitySplitArea and utilitySplitArea.setVisible then
    local currentVisible = true
    if utilitySplitArea.isVisible then
      currentVisible = utilitySplitArea:isVisible()
    end
    if currentVisible ~= utilityVisible then
      utilitySplitArea:setVisible(utilityVisible)
      bodyVisibilityChanged = true
    end
  end
  if utilityNavRail and utilityNavRail.setVisible then
    local currentVisible = true
    if utilityNavRail.isVisible then
      currentVisible = utilityNavRail:isVisible()
    end
    if currentVisible ~= utilityNavVisible then
      utilityNavRail:setVisible(utilityNavVisible)
      bodyVisibilityChanged = true
    end
  end
  if utilityDetailPanel and utilityDetailPanel.setVisible then
    local currentVisible = true
    if utilityDetailPanel.isVisible then
      currentVisible = utilityDetailPanel:isVisible()
    end
    if currentVisible ~= utilityDetailVisible then
      utilityDetailPanel:setVisible(utilityDetailVisible)
      bodyVisibilityChanged = true
    end
  end
  if keyboardGrabHandle and keyboardGrabHandle.setVisible then
    local currentVisible = true
    if keyboardGrabHandle.isVisible then
      currentVisible = keyboardGrabHandle:isVisible()
    end
    if currentVisible ~= handleVisible then
      keyboardGrabHandle:setVisible(handleVisible)
      bodyVisibilityChanged = true
    end
  end
  if midiParamRack and midiParamRack.setVisible then
    local currentVisible = true
    if midiParamRack.isVisible then
      currentVisible = midiParamRack:isVisible()
    end
    if currentVisible ~= midiVisible then
      midiParamRack:setVisible(midiVisible)
      bodyVisibilityChanged = true
    end
  end

  local topPad = 0
  local bottomPad = 0
  local gap = 0
  local captureH = 0
  local captureGap = 0
  local contentTop = topPad + captureH + captureGap
  local CANONICAL_RACK_HEIGHT = deps.RackLayoutManager.CANONICAL_RACK_HEIGHT
  local RACK_SLOT_H = deps.RackLayoutManager.RACK_SLOT_H
  local contentH = math.max(CANONICAL_RACK_HEIGHT, math.max(220, totalH - contentTop - bottomPad) - deps.computeKeyboardPanelHeight(ctx, totalH) - gap)
  local keyboardH = deps.computeKeyboardPanelHeight(ctx, totalH)

  local p = M.syncRackPaginationModel(ctx, contentH)
  local visibleRowSet = {}
  for _, rowIndex in ipairs(p.visibleRows or {}) do
    visibleRowSet[tonumber(rowIndex)] = true
  end

  local missingRows = 0
  for rowIndex = 1, math.max(64, p.totalRows + 4) do
    local rowWidget = deps.getScopedWidget(ctx, ".rackRow" .. tostring(rowIndex))
    if rowWidget then
      missingRows = 0
      local rowVisible = rowIndex <= p.totalRows and visibleRowSet[rowIndex] == true
      local slotIndex = p.showAll and rowIndex or (rowIndex - (tonumber(p.viewportOffset) or 0))
      local targetY = 25 + (math.max(0, slotIndex - 1) * RACK_SLOT_H)
      local bounds = M.getWidgetBounds(rowWidget)
      if bounds then
        deps.RackLayoutManager.updateWidgetRectSpec(rowWidget, bounds.x, targetY, bounds.w, bounds.h)
        M.setWidgetBounds(rowWidget, bounds.x, targetY, bounds.w, bounds.h)
      end
      if rowWidget.setVisible then
        rowWidget:setVisible(rowVisible)
      elseif rowWidget.node and rowWidget.node.setVisible then
        rowWidget.node:setVisible(rowVisible)
      end
    else
      missingRows = missingRows + 1
      if rowIndex > p.totalRows and missingRows >= 4 then
        break
      end
    end
  end

  local rackNodes = ctx._rackState and ctx._rackState.modules or {}
  local activeLayoutNodes = ctx._dragPreviewModules or rackNodes
  local activeNodesById = {}
  local createdDynamicShell = false
  local layout = shellLayout() or {}
  for i = 1, #activeLayoutNodes do
    local node = activeLayoutNodes[i]
    if node and node.id then
      activeNodesById[tostring(node.id)] = node
      if not layout[tostring(node.id)] then
        if host and type(host._ensureDynamicShellForNode) == "function" and host._ensureDynamicShellForNode(ctx, node.id) ~= nil then
          createdDynamicShell = true
        end
      end
    end
  end

  for nodeId, shellMeta in pairs(layout) do
    local node = activeNodesById[tostring(nodeId)]
    local shellWidget = deps.getScopedWidget(ctx, "." .. shellMeta.shellId)
    local deleteButton = deps.getScopedWidget(ctx, "." .. shellMeta.shellId .. ".deleteButton")
    local rowIndex = node and math.max(1, math.floor(tonumber(node.row) or 0) + 1) or nil
    local shellVisible = rowIndex ~= nil and visibleRowSet[rowIndex] == true

    setWidgetVisible(shellWidget, shellVisible)
    setWidgetVisible(deleteButton, shellVisible and deps.MidiSynthRackSpecs.isRackModuleDeletable and deps.MidiSynthRackSpecs.isRackModuleDeletable(nodeId))
  end

  M.updateRackPaginationDots(ctx)

  local rackChanged = M.syncRackShellLayout(ctx)
  local sizingChanged = false
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(topRow, {
    order = 1,
    grow = 0,
    shrink = 0,
    basisH = 220,
    minH = 220,
    maxH = 220,
  }) or sizingChanged
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(bottomRow, {
    order = 2,
    grow = 0,
    shrink = 0,
    basisH = 220,
    minH = 220,
    maxH = 220,
  }) or sizingChanged
  local keyboardBodyBasisH = isCollapsedMode and 0 or (isCompactMode and 54 or 150)
  local keyboardBodyMinH = isCollapsedMode and 0 or (isCompactMode and 46 or 110)
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(utilitySplitArea, {
    order = 1,
    grow = 1,
    shrink = 1,
    basisH = isCollapsedMode and 110 or 120,
    minH = 110,
    maxH = nil,
  }) or sizingChanged
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(utilityTopBar, {
    order = 1,
    grow = 0,
    shrink = 0,
    basisH = 20,
    minH = 20,
    maxH = 20,
  }) or sizingChanged
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(utilityBrowserBody, {
    order = 2,
    grow = 1,
    shrink = 1,
    basisH = 136,
    minH = 96,
    maxH = nil,
  }) or sizingChanged
  local utilityNavW = 248
  local utilityDetailMinW = 164
  local paletteStripW = host and type(host._palettePreferredWidth) == "function" and host._palettePreferredWidth(ctx) or 248
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(utilityNavRail, {
    basisW = utilityNavVisible and utilityNavW or 0,
    minW = utilityNavVisible and utilityNavW or 0,
    maxW = utilityNavVisible and utilityNavW or 0,
    shrink = 0,
  }) or sizingChanged
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(paletteStrip, {
    basisW = paletteStripW,
    minW = paletteStripW,
    maxW = paletteStripW,
    grow = 0,
    shrink = 0,
  }) or sizingChanged
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(utilityDetailPanel, {
    basisW = utilityDetailVisible and utilityDetailMinW or 0,
    minW = utilityDetailVisible and utilityDetailMinW or 0,
    maxW = nil,
    grow = utilityDetailVisible and 1 or 0,
    shrink = utilityDetailVisible and 1 or 0,
  }) or sizingChanged
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(keyboardGrabHandle, {
    order = 2,
    grow = 0,
    shrink = 0,
    basisH = 8,
    minH = 8,
    maxH = 8,
  }) or sizingChanged
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(midiParamRack, {
    order = 3,
    grow = 0,
    shrink = 0,
    basisH = 68,
    minH = 68,
    maxH = 68,
  }) or sizingChanged
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(keyboardBody, {
    order = 4,
    grow = 0,
    shrink = 1,
    basisH = keyboardBodyBasisH,
    minH = keyboardBodyMinH,
    maxH = isCollapsedMode and 0 or keyboardBodyBasisH,
  }) or sizingChanged
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(keyboardHeader, {
    order = 5,
    grow = 0,
    shrink = 0,
    basisH = 42,
    minH = 42,
    maxH = 42,
  }) or sizingChanged
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(contentRows, {
    order = 1,
    basisH = contentH,
    minH = contentH,
    maxH = contentH,
  }) or sizingChanged

  local rackContainer = widgets.rackContainer or deps.getScopedWidget(ctx, ".rackContainer")
  if rackContainer then
    local visibleRackH = 25 + (math.max(1, tonumber(p.rowsPerPage) or 1) * RACK_SLOT_H)
    sizingChanged = deps.RackLayoutManager.updateLayoutChild(rackContainer, {
      basisH = visibleRackH,
      minH = visibleRackH,
      maxH = visibleRackH,
    }) or sizingChanged
  end
  sizingChanged = deps.RackLayoutManager.updateLayoutChild(keyboardPanel, {
    order = 2,
    grow = 0,
    shrink = 0,
    basisH = keyboardH,
    minH = keyboardH,
    maxH = keyboardH,
  }) or sizingChanged

  local paletteChanged = host and type(host._syncPaletteCardState) == "function" and (host._syncPaletteCardState(ctx) or false) or false
  local layoutChanged = stackChanged or bodyVisibilityChanged or sizingChanged or rackChanged or paletteChanged
  if layoutChanged then
    deps.RackLayoutManager.relayoutWidgetSubtree(mainStack, totalW, totalH)
    if host and type(host._syncPaletteCardState) == "function" then
      host._syncPaletteCardState(ctx)
    end
  end

  if createdDynamicShell and ctx._rackState and (ctx._rackState.viewMode or "perf") == "patch" then
    deps.syncPatchViewMode(ctx)
  end

  deps.syncRackEdgeTerminals(ctx)
  if layoutChanged and deps.RackWireLayer and deps.RackWireLayer.refreshWires then
    local viewMode = ctx._rackState and ctx._rackState.viewMode or "perf"
    if viewMode == "patch" then
      deps.RackWireLayer.refreshWires(ctx)
    end
  end

  local dotAnchor = nil
  if bodyVisible and keyboardBody and keyboardBody.node and keyboardBody.node.getBounds then
    dotAnchor = keyboardBody
  elseif midiParamRack and midiParamRack.node and midiParamRack.node.getBounds then
    dotAnchor = midiParamRack
  end
  if dockModeDots and keyboardPanel and keyboardPanel.node and keyboardPanel.node.getBounds and dotAnchor and dotAnchor.node and dotAnchor.node.getBounds then
    local _, _, panelW, _ = keyboardPanel.node:getBounds()
    local bx, by, bw, bh = dotAnchor.node:getBounds()
    local dotsH = 46
    local dotsW = 12
    local anchorRight = (tonumber(bx) or 0) + (tonumber(bw) or 0)
    local rightPad = math.max(0, (tonumber(panelW) or 0) - anchorRight)
    local dotX = deps.round(anchorRight + math.max(0, (rightPad - dotsW) * 0.5))
    local dotY = deps.round(((tonumber(by) or 0) + (tonumber(bh) or 0)) - dotsH - 48)
    M.setWidgetBounds(dockModeDots, dotX, dotY, dotsW, dotsH)
  end

  M.syncDockModeDots(ctx)
  if bodyVisible then
    deps.syncKeyboardDisplay(ctx)
  end
  deps.MidiParamRack.sync(ctx, midiParamRack)

  if widgets.patchViewToggle and contentRows and contentRows.node then
    local _, _, rowsW, _ = contentRows.node:getBounds()
    local btnW = 60
    local btnH = 24
    local btnX = math.max(0, deps.round((tonumber(rowsW) or 1280) - btnW - 1))
    M.setWidgetBounds(widgets.patchViewToggle, btnX, 0, btnW, btnH)
  end
end

function M.attach(midiSynth)
  host = midiSynth
  midiSynth.ensureRackPaginationState = M.ensureRackPaginationState
  midiSynth.getRackNodeRowById = M.getRackNodeRowById
  midiSynth.getRackTotalRows = M.getRackTotalRows
  midiSynth.syncRackPaginationModel = M.syncRackPaginationModel
  midiSynth.updateRackPaginationDots = M.updateRackPaginationDots
  midiSynth.setRackViewport = M.setRackViewport
  midiSynth.onRackDotClick = M.onRackDotClick
  midiSynth.dragState = dragState
  midiSynth.resetDragState = M.resetDragState
  midiSynth.getRackShellMetaByNodeId = M.getRackShellMetaByNodeId
  midiSynth.getRackNodeIdByShellId = M.getRackNodeIdByShellId
  midiSynth.getWidgetBounds = M.getWidgetBounds
  midiSynth.getWidgetBoundsInRoot = M.getWidgetBoundsInRoot
  midiSynth.getShellWidget = M.getShellWidget
  midiSynth.setShellDragPlaceholder = M.setShellDragPlaceholder
  midiSynth.ensureDragGhost = M.ensureDragGhost
  midiSynth.hideDragGhost = M.hideDragGhost
  midiSynth.updateDragGhost = M.updateDragGhost
  midiSynth.getActiveRackNodes = M.getActiveRackNodes
  midiSynth.getActiveRackNodeById = M.getActiveRackNodeById
  midiSynth.collectRackFlowSnapshot = M.collectRackFlowSnapshot
  midiSynth._pointInsideRackFlowBands = M._pointInsideRackFlowBands
  midiSynth.computeRackFlowTargetPlacement = M.computeRackFlowTargetPlacement
  midiSynth.autoCollapseRowForInsertion = M.autoCollapseRowForInsertion
  midiSynth.previewRackDragReorder = M.previewRackDragReorder
  midiSynth.finalizeRackDragReorder = M.finalizeRackDragReorder
  midiSynth._setupShellDragHandlers = M._setupShellDragHandlers
  midiSynth.setWidgetBounds = M.setWidgetBounds
  midiSynth.syncDockModeDots = M.syncDockModeDots
  midiSynth.syncKeyboardCollapseButton = M.syncKeyboardCollapseButton
  midiSynth.syncRackShellLayout = M.syncRackShellLayout
  midiSynth.refreshManagedLayoutState = M.refreshManagedLayoutState
end

function M.init(options)
  options = options or {}
  deps.getScopedWidget = options.getScopedWidget
  deps.getScopedBehavior = options.getScopedBehavior
  deps.RackLayoutManager = options.RackLayoutManager or require("ui.rack_layout_manager")
  deps.MidiSynthRackSpecs = options.MidiSynthRackSpecs or require("behaviors.rack_midisynth_specs")
  deps.RackModuleFactory = options.RackModuleFactory or require("ui.rack_module_factory")
  deps.RackLayout = options.RackLayout or require("behaviors.rack_layout")
  deps.RackWireLayer = options.RackWireLayer
  deps.MidiParamRack = options.MidiParamRack
  deps.setPath = options.setPath
  deps.syncText = options.syncText
  deps.round = options.round or function(v) return math.floor((tonumber(v) or 0) + 0.5) end
  deps.RACK_COLUMNS_PER_ROW = options.RACK_COLUMNS_PER_ROW or 5
  deps.RACK_MODULE_SHELL_LAYOUT = options.RACK_MODULE_SHELL_LAYOUT
  deps.ensureUtilityDockState = options.ensureUtilityDockState
  deps.syncPatchViewMode = options.syncPatchViewMode
  deps.syncRackEdgeTerminals = options.syncRackEdgeTerminals
  deps.syncKeyboardCollapsedFromUtilityDock = options.syncKeyboardCollapsedFromUtilityDock
  deps.syncKeyboardCollapseButton = options.syncKeyboardCollapseButton
  deps.computeKeyboardPanelHeight = options.computeKeyboardPanelHeight
  deps.syncKeyboardDisplay = options.syncKeyboardDisplay
end

return M
