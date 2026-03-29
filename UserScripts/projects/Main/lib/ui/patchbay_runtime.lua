-- Patchbay Runtime Module
-- Owns patchbay lifecycle/runtime coordination outside widget generation.

local Patchbay = require("ui.patchbay_generator")

local M = {}

function M.getInstances()
  return Patchbay.getInstances()
end

function M.clearPortRegistryForShell(shellId, ctx)
  return Patchbay.clearPortRegistryForShell(shellId, ctx)
end

function M.registerPort(entry, ctx)
  return Patchbay.registerPort(entry, ctx)
end

function M.cleanupFromRuntime(shellId, ctx, deps)
  deps = deps or {}
  return Patchbay.cleanupFromRuntime(shellId, ctx, deps.RackWireLayer)
end

function M.invalidate(moduleId, ctx, deps)
  deps = deps or {}
  return Patchbay.invalidate(moduleId, ctx, deps.RACK_MODULE_SHELL_LAYOUT, deps.RackWireLayer)
end

function M.ensureWidgets(ctx, shellId, moduleId, specId, currentPage, deps)
  return Patchbay.ensureWidgets(ctx, shellId, moduleId, specId, currentPage, deps)
end

function M.registerShellMapping(shellId, moduleId, specId, componentId)
  return Patchbay.registerShellMapping(shellId, moduleId, specId, componentId)
end

function M.unregisterShellMapping(shellId)
  return Patchbay.unregisterShellMapping(shellId)
end

function M.syncValues(ctx, deps)
  deps = deps or {}
  return Patchbay.syncValues(ctx, deps.readParam, deps.setWidgetValueSilently, deps.getModTargetState)
end

function M.findRegisteredPort(ctx, moduleId, portId, direction)
  return Patchbay.findRegisteredPort(ctx, moduleId, portId, direction)
end

function M.bindWirePortWidget(ctx, portWidget, entry, deps)
  deps = deps or {}
  if not (portWidget and portWidget.node and type(entry) == "table") then
    return
  end

  entry.widget = portWidget
  Patchbay.registerPort(entry, ctx)
  portWidget.node:setInterceptsMouse(true, true)

  local RackWireLayer = deps.RackWireLayer
  local RackModPopover = deps.RackModPopover
  if portWidget.node.setOnMouseDown then
    portWidget.node:setOnMouseDown(function(mx, my, shift, ctrl, alt, right)
      if right and RackModPopover and RackModPopover.openPortForWidget then
        RackModPopover.openPortForWidget(ctx, entry, portWidget, deps)
        return
      end
      if shift and RackWireLayer and RackWireLayer.spliceNodeForPort then
        if RackWireLayer.spliceNodeForPort(ctx, entry) then
          return
        end
      end
      if ctrl and RackWireLayer and RackWireLayer.deleteConnectionsForPort then
        RackWireLayer.deleteConnectionsForPort(ctx, entry)
        return
      end
      if RackWireLayer and RackWireLayer.beginWireDrag then
        RackWireLayer.beginWireDrag(ctx, entry)
        if RackWireLayer.updateWireDragPointer then
          RackWireLayer.updateWireDragPointer(ctx, portWidget, mx, my)
        end
      end
    end)
  end

  if portWidget.node.setOnMouseDrag then
    portWidget.node:setOnMouseDrag(function(mx, my)
      if RackWireLayer and RackWireLayer.updateWireDragPointer then
        RackWireLayer.updateWireDragPointer(ctx, portWidget, mx, my)
      end
    end)
  end

  if portWidget.node.setOnMouseUp then
    portWidget.node:setOnMouseUp(function(mx, my)
      if RackWireLayer and RackWireLayer.updateWireDragPointer then
        RackWireLayer.updateWireDragPointer(ctx, portWidget, mx, my)
      end
      if RackWireLayer and RackWireLayer.finishWireDrag then
        RackWireLayer.finishWireDrag(ctx)
      end
    end)
  end
end

local function setWidgetVisibleState(widget, visible)
  if widget == nil then
    return
  end
  if widget.setVisible then
    widget:setVisible(visible)
  elseif widget.node and widget.node.setVisible then
    widget.node:setVisible(visible)
  end
end

local function isWidgetVisible(widget)
  if widget == nil then
    return false
  end

  local function localVisible(w)
    if w == nil then
      return true
    end
    if w.isVisible then
      return w:isVisible()
    end
    if w.node and w.node.isVisible then
      return w.node:isVisible()
    end
    return true
  end

  if not localVisible(widget) then
    return false
  end

  local record = widget._structuredRecord
  local current = type(record) == "table" and record.parent or nil
  while current do
    if current.widget and not localVisible(current.widget) then
      return false
    end
    current = current.parent
  end

  return true
end

function M.syncRackEdgeTerminals(ctx, deps)
  deps = deps or {}
  local getScopedWidget = deps.getScopedWidget
  local getWidgetBoundsInRoot = deps.getWidgetBoundsInRoot
  local round = deps.round

  local function getModulesForRow(row)
    local modules = ctx and ctx._rackState and ctx._rackState.modules or nil
    local out = {}
    if type(modules) ~= "table" then
      return out
    end
    for i = 1, #modules do
      local module = modules[i]
      if module and math.max(0, math.floor(tonumber(module.row) or 0)) == row then
        out[#out + 1] = module
      end
    end
    table.sort(out, function(a, b)
      local aCol = math.floor(tonumber(a.col) or 0)
      local bCol = math.floor(tonumber(b.col) or 0)
      if aCol == bCol then
        return tostring(a.id or "") < tostring(b.id or "")
      end
      return aCol < bCol
    end)
    return out
  end

  local function findRowAnchor(row, direction)
    local registry = ctx and ctx._patchbayPortRegistry or nil
    if type(registry) ~= "table" then
      return nil
    end

    local modules = getModulesForRow(row)
    local startIndex = 1
    local endIndex = #modules
    local step = 1
    local preferredPortId = "in"

    if direction == "output" then
      startIndex = #modules
      endIndex = 1
      step = -1
      preferredPortId = "out"
    end

    local bestFallback = nil
    local i = startIndex
    while (step > 0 and i <= endIndex) or (step < 0 and i >= endIndex) do
      local module = modules[i]
      for _, entry in pairs(registry) do
        if type(entry) == "table"
          and entry.moduleId == module.id
          and entry.direction == direction
          and tostring(entry.portType or "") == "audio"
          and isWidgetVisible(entry.widget) then
          if entry.portId == preferredPortId then
            return entry
          end
          if bestFallback == nil then
            bestFallback = entry
          end
        end
      end
      if bestFallback ~= nil then
        return bestFallback
      end
      i = i + step
    end

    return nil
  end

  local isPatch = (ctx and ctx._rackState and ctx._rackState.viewMode or "perf") == "patch"
  local rackContainer = getScopedWidget(ctx, ".rackContainer")
  local rackBounds = getWidgetBoundsInRoot(ctx, rackContainer)

  local midiInWidget = getScopedWidget(ctx, ".rackContainer.leftMidiIn")
  local midiVisible = isPatch and rackBounds ~= nil
  setWidgetVisibleState(midiInWidget, midiVisible)
  if midiVisible and midiInWidget and midiInWidget.node and midiInWidget.node.setBounds then
    midiInWidget.node:setBounds(round(6), round(128), 14, 14)
  end

  local rails = {
    { suffix = ".rackContainer.rightRailSend1", direction = "output", row = 0, x = 1232 },
    { suffix = ".rackContainer.leftRailRecv2", direction = "input", row = 1, x = 6 },
    { suffix = ".rackContainer.rightRailSend2", direction = "output", row = 1, x = 1232 },
    { suffix = ".rackContainer.leftRailRecv3", direction = "input", row = 2, x = 6 },
    { suffix = ".rackContainer.rightRailSend3", direction = "output", row = 2, x = 1232 },
  }

  for _, rail in ipairs(rails) do
    local railWidget = getScopedWidget(ctx, rail.suffix)
    local anchor = isPatch and findRowAnchor(rail.row, rail.direction) or nil
    local anchorBounds = anchor and getWidgetBoundsInRoot(ctx, anchor.widget) or nil
    local visible = isPatch and rackBounds ~= nil and anchorBounds ~= nil
    setWidgetVisibleState(railWidget, visible)

    if visible and railWidget and railWidget.node and railWidget.node.setBounds then
      local localX = tonumber(rail.x) or 6
      local localY = (anchorBounds.y - rackBounds.y) + math.floor((anchorBounds.h - 14) * 0.5)
      railWidget.node:setBounds(round(localX), round(localY), 14, 14)
    end
  end
end

function M.syncPatchViewMode(ctx, deps)
  deps = deps or {}
  local forwarded = {}
  for key, value in pairs(deps) do
    forwarded[key] = value
  end
  forwarded.syncRackEdgeTerminals = function(innerCtx)
    M.syncRackEdgeTerminals(innerCtx, deps)
  end
  return Patchbay.syncPatchViewMode(ctx, forwarded)
end

function M.toggleNodeWidth(ctx, moduleId, deps)
  deps = deps or {}
  local invalidatePatchbay = deps.invalidatePatchbay
  local refreshManagedLayoutState = deps.refreshManagedLayoutState
  local syncPatchViewMode = deps.syncPatchViewMode
  local RackLayout = deps.RackLayout
  local getRackTotalRows = deps.getRackTotalRows
  local columnsPerRow = math.max(1, tonumber(deps.columnsPerRow) or 5)

  if type(RackLayout) ~= "table" then
    return false
  end

  local rackState = ctx and ctx._rackState or nil
  local modules = rackState and rackState.modules or nil
  if type(modules) ~= "table" then
    return false
  end

  local workingModules = RackLayout.cloneRackModules(modules)
  local moduleIndex = RackLayout.findRackModuleIndex(workingModules, moduleId)
  if moduleIndex == nil then
    return false
  end

  local module = workingModules[moduleIndex]
  local currentW = math.max(1, tonumber(module and module.w) or 1)
  local newW = (currentW == 1) and 2 or 1
  module.w = newW
  module.sizeKey = string.format("%dx%d", math.max(1, tonumber(module and module.h) or 1), newW)

  local nextModules = workingModules
  if newW > currentW then
    local maxRows = math.max(
      3,
      tonumber(getRackTotalRows and getRackTotalRows(ctx) or 3) or 3,
      (tonumber(module and module.row) or 0) + math.max(1, tonumber(module and module.h) or 1) + 1,
      8
    )
    nextModules = RackLayout.moveModuleToSlot(
      workingModules,
      tostring(moduleId or ""),
      tonumber(module and module.row) or 0,
      tonumber(module and module.col) or 0,
      columnsPerRow,
      maxRows
    )
    if type(nextModules) ~= "table" then
      return false
    end
  else
    nextModules = RackLayout.getFlowModules(workingModules)
  end

  rackState.modules = RackLayout.cloneRackModules(nextModules)
  _G.__midiSynthRackState = rackState

  if type(invalidatePatchbay) == "function" then
    invalidatePatchbay(moduleId, ctx)
  end
  if ctx and ctx._lastW and ctx._lastH and type(refreshManagedLayoutState) == "function" then
    refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
  end
  local viewMode = ctx and ctx._rackState and ctx._rackState.viewMode or "perf"
  if viewMode == "patch" and type(syncPatchViewMode) == "function" then
    syncPatchViewMode(ctx)
  end
  return true
end

function M.setupResizeToggleHandlers(ctx, deps)
  deps = deps or {}
  local RACK_MODULE_SHELL_LAYOUT = deps.RACK_MODULE_SHELL_LAYOUT
  local getScopedWidget = deps.getScopedWidget

  if type(RACK_MODULE_SHELL_LAYOUT) ~= "table" then
    return
  end

  for moduleId, meta in pairs(RACK_MODULE_SHELL_LAYOUT) do
    local shellId = meta.shellId
    local toggle = getScopedWidget(ctx, "." .. shellId .. ".resizeToggle")
    if toggle and toggle.node then
      toggle.node:setInterceptsMouse(true, true)
      toggle.node:setOnMouseDown(function()
        M.toggleNodeWidth(ctx, moduleId, deps)
      end)
    end
  end
end

return M
