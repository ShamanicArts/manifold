local SliderWidget = require("widgets.slider").Slider
local SegmentedWidget = require("widgets.segmented")

local M = {}

local function round(v)
  return math.floor((tonumber(v) or 0) + 0.5)
end

local function clamp(value, minValue, maxValue)
  local n = tonumber(value) or 0
  if minValue ~= nil and n < minValue then
    n = minValue
  end
  if maxValue ~= nil and n > maxValue then
    n = maxValue
  end
  return n
end

local function copyTable(value, seen)
  if type(value) ~= "table" then
    return value
  end
  seen = seen or {}
  if seen[value] ~= nil then
    return seen[value]
  end
  local out = {}
  seen[value] = out
  for key, entry in pairs(value) do
    if key ~= "widget" and key ~= "node" and key ~= "_structuredRecord" and key ~= "_structuredRuntime" then
      out[key] = copyTable(entry, seen)
    end
  end
  return out
end

local function copyPortRef(portRef)
  if type(portRef) ~= "table" then
    return nil
  end
  return {
    key = portRef.key,
    moduleId = portRef.moduleId,
    shellId = portRef.shellId,
    portId = portRef.portId,
    direction = portRef.direction,
    portType = portRef.portType,
    label = portRef.label,
    group = portRef.group,
    page = portRef.page,
    side = portRef.side,
    row = portRef.row,
  }
end

local function formatNumber(value)
  local n = tonumber(value)
  if n == nil then
    return "--"
  end
  local absValue = math.abs(n)
  if absValue >= 10000 then
    return string.format("%.0f", n)
  end
  if absValue >= 1000 then
    return string.format("%.1f", n)
  end
  if absValue >= 10 then
    return string.format("%.2f", n)
  end
  return string.format("%.3f", n)
end

local function cubicPoint(x1, y1, cx1, cy1, cx2, cy2, x2, y2, t)
  local omt = 1.0 - t
  local omt2 = omt * omt
  local omt3 = omt2 * omt
  local t2 = t * t
  local t3 = t2 * t
  return {
    x = omt3 * x1 + 3.0 * omt2 * t * cx1 + 3.0 * omt * t2 * cx2 + t3 * x2,
    y = omt3 * y1 + 3.0 * omt2 * t * cy1 + 3.0 * omt * t2 * cy2 + t3 * y2,
  }
end

local function computeWireBezier(x1, y1, x2, y2)
  local dx = (x2 or 0) - (x1 or 0)
  local dy = (y2 or 0) - (y1 or 0)
  local absDx = math.abs(dx)
  local absDy = math.abs(dy)
  local cpOffset = math.max(44, math.min(180, absDx * 0.42 + absDy * 0.14))
  local cx1 = dx >= 0 and (x1 + cpOffset) or (x1 - cpOffset)
  local cx2 = dx >= 0 and (x2 - cpOffset) or (x2 + cpOffset)
  return {
    x1 = x1,
    y1 = y1,
    cx1 = cx1,
    cy1 = y1,
    cx2 = cx2,
    cy2 = y2,
    x2 = x2,
    y2 = y2,
  }
end

local function getRackContainerWidget(ctx, deps)
  local getScopedWidget = deps and deps.getScopedWidget or nil
  if type(getScopedWidget) ~= "function" then
    return nil
  end
  return getScopedWidget(ctx, ".rackContainer")
end

local function getWidgetBounds(widget)
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

local function getContainerBounds(ctx, deps)
  local rackContainer = getRackContainerWidget(ctx, deps)
  local bounds = getWidgetBounds(rackContainer)
  if not bounds then
    return nil, nil
  end
  return rackContainer, bounds
end

local function getWidgetBoundsInContainer(ctx, widget, deps)
  local getWidgetBoundsInRoot = deps and deps.getWidgetBoundsInRoot or nil
  if type(getWidgetBoundsInRoot) ~= "function" then
    return nil
  end
  local _, rackBounds = getContainerBounds(ctx, deps)
  if not rackBounds then
    return nil
  end
  local rootBounds = getWidgetBoundsInRoot(ctx, widget)
  if not rootBounds then
    return nil
  end
  return {
    x = round(rootBounds.x - rackBounds.x),
    y = round(rootBounds.y - rackBounds.y),
    w = round(rootBounds.w),
    h = round(rootBounds.h),
  }
end

local function pointIntersectsAnyRect(x, y, rects, pad)
  local px = tonumber(x) or 0
  local py = tonumber(y) or 0
  local inset = tonumber(pad) or 0
  for i = 1, #(rects or {}) do
    local rect = rects[i]
    if type(rect) == "table" then
      local rx = (tonumber(rect.x) or 0) - inset
      local ry = (tonumber(rect.y) or 0) - inset
      local rw = (tonumber(rect.w) or 0) + inset * 2
      local rh = (tonumber(rect.h) or 0) + inset * 2
      if px >= rx and py >= ry and px <= (rx + rw) and py <= (ry + rh) then
        return true
      end
    end
  end
  return false
end

local function portAnchorsCompatible(portRef, connectionEnd, direction)
  return type(portRef) == "table"
    and type(connectionEnd) == "table"
    and tostring(portRef.moduleId or "") == tostring(connectionEnd.moduleId or "")
    and tostring(portRef.portId or "") == tostring(connectionEnd.portId or "")
    and tostring(portRef.direction or "") == tostring(direction or "")
end

local function portTouchesConnection(portRef, conn)
  if type(portRef) ~= "table" or type(conn) ~= "table" then
    return false
  end
  local fromRef = type(conn.from) == "table" and conn.from or nil
  local toRef = type(conn.to) == "table" and conn.to or nil
  if not (fromRef and toRef) then
    return false
  end
  return portAnchorsCompatible(portRef, fromRef, "output") or portAnchorsCompatible(portRef, toRef, "input")
end

local function isNonAudioConnection(conn)
  return type(conn) == "table" and tostring(conn.kind or "") ~= "audio"
end

local function getPortRegistry(ctx)
  local registry = ctx and ctx._patchbayPortRegistry or nil
  return type(registry) == "table" and registry or {}
end

local function findPortEntry(ctx, moduleId, portId, direction)
  for _, entry in pairs(getPortRegistry(ctx)) do
    if type(entry) == "table"
      and tostring(entry.moduleId or "") == tostring(moduleId or "")
      and tostring(entry.portId or "") == tostring(portId or "")
      and tostring(entry.direction or "") == tostring(direction or "") then
      return entry
    end
  end
  return nil
end

local function getPortSpec(ctx, portRef)
  local specs = ctx and ctx._rackModuleSpecs or nil
  local spec = type(specs) == "table" and specs[tostring(portRef and portRef.moduleId or "")] or nil
  if type(spec) ~= "table" then
    return nil, nil
  end

  local ports = spec.ports or {}
  local groups = {}
  if tostring(portRef.direction or "") == "input" then
    groups[#groups + 1] = ports.inputs or {}
  else
    groups[#groups + 1] = ports.outputs or {}
  end
  groups[#groups + 1] = ports.params or {}

  for _, list in ipairs(groups) do
    for i = 1, #list do
      local port = list[i]
      if tostring(port.id or "") == tostring(portRef.portId or "") then
        return spec, port
      end
    end
  end

  return spec, nil
end

local function resolveEndpointId(ctx, portRef)
  local router = ctx and ctx._rackControlRouter or nil
  if type(router) ~= "table" then
    return nil
  end
  if tostring(portRef and portRef.direction or "") == "output" and type(router.resolveSourceId) == "function" then
    return router:resolveSourceId(portRef)
  end
  if tostring(portRef and portRef.direction or "") == "input" and type(router.resolveTargetId) == "function" then
    return router:resolveTargetId(portRef)
  end
  return nil
end

local function findEndpoint(ctx, endpointId)
  local registry = ctx and ctx._modEndpointRegistry or nil
  if type(registry) == "table" and type(registry.findById) == "function" then
    return registry:findById(endpointId)
  end
  return nil
end

local function getLiveEndpointValue(ctx, endpoint)
  if type(endpoint) ~= "table" then
    return nil
  end

  local id = tostring(endpoint.id or "")
  if id == "" then
    return nil
  end

  if endpoint.direction == "target" then
    local runtime = ctx and ctx._rackModRuntime or nil
    local state = runtime and runtime.getTargetState and runtime:getTargetState(id, _G.getParam) or nil
    if state ~= nil then
      return state.effectiveValue
    end
    if type(_G.getParam) == "function" and id:match("^/") then
      return _G.getParam(id)
    end
    return nil
  end

  local sourceValue = nil
  local runtimes = { ctx and ctx._rackModRuntime or nil, ctx and ctx._modRuntime or nil }
  for i = 1, #runtimes do
    local runtime = runtimes[i]
    if runtime and type(runtime.sourceValues) == "table" and runtime.sourceValues[id] ~= nil then
      sourceValue = runtime.sourceValues[id]
      break
    end
  end
  if sourceValue ~= nil then
    return sourceValue
  end

  local paramPath = id:match("^param_out:(.+)$")
  if paramPath and type(_G.getParam) == "function" then
    return _G.getParam(paramPath)
  end
  return nil
end

local function collectRouteIdsForPort(ctx, portRef)
  local out = {}
  local connections = ctx and ctx._rackConnections or {}
  for i = 1, #connections do
    local conn = connections[i]
    if isNonAudioConnection(conn) and portTouchesConnection(portRef, conn) then
      out[#out + 1] = tostring(conn.id or "")
    end
  end
  table.sort(out)
  return out
end

local function findConnectionById(ctx, routeId)
  local connections = ctx and ctx._rackConnections or {}
  for i = 1, #connections do
    local conn = connections[i]
    if tostring(conn and conn.id or "") == tostring(routeId or "") then
      return conn, i
    end
  end
  return nil, nil
end

local function findCompiledRouteEntry(ctx, routeId)
  local router = ctx and ctx._rackControlRouter or nil
  if type(router) ~= "table" then
    return nil, nil
  end
  for i = 1, #(router.activeRoutes or {}) do
    local entry = router.activeRoutes[i]
    if tostring(entry and entry.route and entry.route.id or "") == tostring(routeId or "") then
      return entry, true
    end
  end
  for i = 1, #(router.rejectedRoutes or {}) do
    local entry = router.rejectedRoutes[i]
    if tostring(entry and entry.route and entry.route.id or "") == tostring(routeId or "") then
      return entry, false
    end
  end
  return nil, nil
end

local function getTargetStateForRoute(ctx, routeEntry)
  if type(routeEntry) ~= "table" then
    return nil
  end
  local targetId = nil
  if type(routeEntry.compiled) == "table" and routeEntry.compiled.targetHandle ~= nil then
    targetId = routeEntry.compiled.targetHandle
  elseif type(routeEntry.route) == "table" then
    targetId = routeEntry.route.target
  end
  if targetId == nil then
    return nil
  end

  local runtimes = { ctx and ctx._rackModRuntime or nil, ctx and ctx._modRuntime or nil }
  for i = 1, #runtimes do
    local runtime = runtimes[i]
    if runtime and runtime.getTargetState then
      local state = runtime:getTargetState(targetId, _G.getParam)
      if state ~= nil then
        return state
      end
    end
  end
  return nil
end

local function defaultApplyModesForTarget(target)
  local signalKind = tostring(target and target.signalKind or "")
  if signalKind == "stepped" or signalKind == "gate" then
    return { "replace" }
  end
  return { "add", "replace" }
end

local function buildRouteSummary(ctx, routeId)
  local connection = findConnectionById(ctx, routeId)
  local entry, isActive = findCompiledRouteEntry(ctx, routeId)
  local route = type(entry) == "table" and entry.route or nil
  local compiled = type(entry) == "table" and entry.compiled or nil
  local source = type(entry) == "table" and entry.source or nil
  local target = type(entry) == "table" and entry.target or nil
  local amount = nil
  local explicitApplyMode = nil
  if type(connection) == "table" and type(connection.meta) == "table" then
    amount = tonumber(connection.meta.modAmount)
    if connection.meta.applyMode ~= nil then
      explicitApplyMode = tostring(connection.meta.applyMode)
    elseif connection.meta.mode ~= nil then
      explicitApplyMode = tostring(connection.meta.mode)
    end
  end
  if amount == nil and type(route) == "table" then
    amount = tonumber(route.amount)
  end
  if explicitApplyMode == nil and type(route) == "table" and route.mode ~= nil then
    explicitApplyMode = tostring(route.mode)
  end
  amount = amount or 1.0

  local allowedApplyModes = copyTable(compiled and compiled.allowedApplyModes or defaultApplyModesForTarget(target))
  local applyMode = tostring(compiled and compiled.applyKind or explicitApplyMode or "add")
  local sourceLabel = tostring(source and source.displayName or route and route.source or "Source")
  local targetLabel = tostring(target and target.displayName or route and route.target or "Target")

  return {
    routeId = tostring(routeId or ""),
    ok = isActive == true,
    connection = copyTable(connection),
    route = copyTable(route),
    compiled = copyTable(compiled),
    source = copyTable(source),
    target = copyTable(target),
    targetState = copyTable(getTargetStateForRoute(ctx, entry)),
    sourceLabel = sourceLabel,
    targetLabel = targetLabel,
    title = sourceLabel .. " -> " .. targetLabel,
    amount = amount,
    applyMode = applyMode,
    explicitApplyMode = explicitApplyMode,
    allowedApplyModes = allowedApplyModes,
    errors = copyTable(entry and entry.errors or {}),
  }
end

local function buildPortSummary(ctx, portRef)
  local spec, port = getPortSpec(ctx, portRef)
  local endpointId = resolveEndpointId(ctx, portRef)
  local endpoint = endpointId and findEndpoint(ctx, endpointId) or nil
  local routeIds = collectRouteIdsForPort(ctx, portRef)
  local liveValue = getLiveEndpointValue(ctx, endpoint)

  return {
    portRef = copyPortRef(portRef),
    spec = copyTable(spec),
    port = copyTable(port),
    endpointId = endpointId,
    endpoint = copyTable(endpoint),
    routeIds = routeIds,
    liveValue = liveValue,
    title = tostring((port and port.label) or (portRef and portRef.label) or (portRef and portRef.portId) or "Port"),
    moduleName = tostring(spec and spec.name or portRef and portRef.moduleId or "module"),
  }
end

local function setNodeTransparent(node)
  if not node then
    return
  end
  node:setStyle({
    bg = 0x00000000,
    border = 0x00000000,
    borderWidth = 0,
    radius = 0,
    opacity = 1.0,
  })
end

local function setWidgetValueSilently(widget, value)
  if not widget or not widget.setValue then
    return
  end
  local oldOnChange = widget._onChange
  widget._onChange = nil
  widget:setValue(value)
  widget._onChange = oldOnChange
end

local function setSelectedSilently(widget, index)
  if not widget or not widget.setSelected then
    return
  end
  local oldOnSelect = widget._onSelect
  widget._onSelect = nil
  widget:setSelected(index)
  widget._onSelect = oldOnSelect
end

local function ensureUiNodes(ctx, deps)
  local rackContainer, bounds = getContainerBounds(ctx, deps)
  if not (rackContainer and rackContainer.node and bounds) then
    return nil
  end

  local ui = ctx._rackModPopoverUi
  if ui and ui.parent ~= rackContainer.node then
    ui = nil
    ctx._rackModPopoverUi = nil
  end

  if ui == nil then
    local hitHost = rackContainer.node:addChild("modWireHitOverlay")
    hitHost:setWidgetType("RackModWireHitOverlay")
    setNodeTransparent(hitHost)
    hitHost:setInterceptsMouse(false, true)
    hitHost:setZOrder(220)

    local popover = rackContainer.node:addChild("modPopoverOverlay")
    popover:setWidgetType("RackModPopoverOverlay")
    setNodeTransparent(popover)
    popover:setVisible(false)
    popover:setInterceptsMouse(true, true)
    popover:setZOrder(260)

    local amountSlider = SliderWidget.new(popover, "modAmountSlider", {
      min = -1.0,
      max = 1.0,
      step = 0.01,
      value = 0.0,
      label = "Polarity",
      compact = true,
      bidirectional = true,
      showValue = true,
      colour = 0xff60a5fa,
      bg = 0xff10182b,
    })
    amountSlider.node:setVisible(false)
    amountSlider.node:setInterceptsMouse(true, false)

    local applyModeSelector = SegmentedWidget.new(popover, "modApplyModeSelector", {
      segments = { "Add", "Replace" },
      selected = 1,
      bg = 0xff10182b,
      selectedBg = 0xff60a5fa,
      textColour = 0xffcbd5e1,
      selectedTextColour = 0xffffffff,
    })
    applyModeSelector.node:setVisible(false)
    applyModeSelector.node:setInterceptsMouse(true, false)

    ui = {
      parent = rackContainer.node,
      hitHost = hitHost,
      popover = popover,
      amountSlider = amountSlider,
      applyModeSelector = applyModeSelector,
      hitRouteIds = {},
    }
    ctx._rackModPopoverUi = ui
  end

  ui.hitHost:setBounds(0, 0, round(bounds.w), round(bounds.h))
  ui.popover:setBounds(0, 0, round(bounds.w), round(bounds.h))
  return ui
end

local function refreshWireVisuals(ctx)
  local wireLayer = type(_G.__midiSynthRackWireLayer) == "table" and _G.__midiSynthRackWireLayer or nil
  if wireLayer and wireLayer.refreshWires then
    wireLayer.refreshWires(ctx)
  end
end

local function closePopover(ctx)
  ctx._rackModPopoverState = nil
  ctx._rackSelectedRouteId = nil
  local ui = ctx._rackModPopoverUi
  if ui and ui.popover then
    ui.popover:setVisible(false)
    ui.popover:clearDisplayList()
  end
  if ui and ui.amountSlider and ui.amountSlider.node then
    ui.amountSlider.node:setVisible(false)
  end
  refreshWireVisuals(ctx)
end

local function setSelectedRoute(ctx, routeId)
  ctx._rackSelectedRouteId = routeId ~= nil and tostring(routeId) or nil
  refreshWireVisuals(ctx)
end

local function openPortPopover(ctx, portRef, anchor, options)
  options = options or {}
  local summary = buildPortSummary(ctx, portRef)
  if options.forceList ~= true and #summary.routeIds == 1 then
    return M.openRoute(ctx, summary.routeIds[1], {
      anchor = anchor,
      parentPortRef = portRef,
      parentAnchor = anchor,
      parentRouteIds = summary.routeIds,
    })
  end

  ctx._rackModPopoverState = {
    kind = "port",
    anchor = copyTable(anchor or {}),
    summary = summary,
    parentPortRef = copyPortRef(portRef),
    parentAnchor = copyTable(anchor or {}),
    drag = nil,
    layout = nil,
  }
  setSelectedRoute(ctx, nil)
  M.refresh(ctx)
  return true
end

local function deleteRouteById(ctx, routeId)
  local routeKey = tostring(routeId or "")
  if routeKey == "" then
    return false
  end
  local nextConnections = {}
  local removed = false
  local connections = ctx and ctx._rackConnections or {}
  for i = 1, #connections do
    local conn = connections[i]
    if tostring(conn and conn.id or "") == routeKey then
      removed = true
    else
      nextConnections[#nextConnections + 1] = conn
    end
  end
  if removed then
    ctx._rackConnections = nextConnections
    _G.__midiSynthRackConnections = ctx._rackConnections
    if ctx and type(ctx._onRackConnectionsChanged) == "function" then
      ctx._onRackConnectionsChanged(ctx, "route-delete")
    end
  end
  return removed
end

local function setRouteAmount(ctx, routeId, amount)
  local connection = findConnectionById(ctx, routeId)
  if type(connection) ~= "table" then
    return false
  end

  local nextAmount = clamp(amount, -1.0, 1.0)
  connection.meta = type(connection.meta) == "table" and connection.meta or {}
  connection.meta.modAmount = nextAmount

  local synced = false
  if ctx and ctx._rackControlRouter and ctx._rackControlRouter.updateRouteAmount then
    synced = ctx._rackControlRouter:updateRouteAmount(routeId, nextAmount) or synced
  end
  if ctx and ctx._rackModRuntime and ctx._rackModRuntime.updateRouteAmount then
    synced = ctx._rackModRuntime:updateRouteAmount(routeId, nextAmount) or synced
  end

  if synced ~= true and ctx and type(ctx._onRackConnectionsChanged) == "function" then
    ctx._onRackConnectionsChanged(ctx, "route-amount")
  end
  return true
end

local function setRouteApplyMode(ctx, routeId, applyMode)
  local connection = findConnectionById(ctx, routeId)
  if type(connection) ~= "table" then
    return false
  end

  local nextMode = tostring(applyMode or "")
  if nextMode == "" then
    return false
  end

  connection.meta = type(connection.meta) == "table" and connection.meta or {}
  connection.meta.applyMode = nextMode

  if ctx and type(ctx._onRackConnectionsChanged) == "function" then
    ctx._onRackConnectionsChanged(ctx, "route-mode")
  end
  return true
end

local function buildAnchor(x, y)
  return {
    x = round(x or 0),
    y = round(y or 0),
  }
end

function M.openPort(ctx, portRef, anchor, options)
  if type(portRef) ~= "table" then
    return false
  end
  return openPortPopover(ctx, copyPortRef(portRef), copyTable(anchor or {}), options)
end

function M.openPortForWidget(ctx, portRef, widget, deps, options)
  local bounds = getWidgetBoundsInContainer(ctx, widget, deps)
  local anchor = bounds and buildAnchor(bounds.x + bounds.w + 10, bounds.y + math.floor(bounds.h * 0.5)) or { x = 220, y = 160 }
  return openPortPopover(ctx, copyPortRef(portRef), anchor, options)
end

function M.openRoute(ctx, routeId, options)
  options = options or {}
  local routeKey = tostring(routeId or "")
  if routeKey == "" then
    return false
  end
  local summary = buildRouteSummary(ctx, routeKey)
  ctx._rackModPopoverState = {
    kind = "route",
    anchor = copyTable(options.anchor or {}),
    summary = summary,
    parentPortRef = copyPortRef(options.parentPortRef),
    parentAnchor = copyTable(options.parentAnchor or options.anchor or {}),
    parentRouteIds = copyTable(options.parentRouteIds or {}),
    drag = nil,
    layout = nil,
  }
  setSelectedRoute(ctx, routeKey)
  M.refresh(ctx)
  return true
end

local function addDisplay(commands, entry)
  commands[#commands + 1] = entry
end

local function addField(commands, label, value, x, y, w)
  addDisplay(commands, {
    cmd = "drawText",
    x = x,
    y = y,
    w = 90,
    h = 18,
    color = 0xff94a3b8,
    text = tostring(label or ""),
    fontSize = 11.0,
    align = "left",
    valign = "middle",
  })
  addDisplay(commands, {
    cmd = "drawText",
    x = x + 92,
    y = y,
    w = math.max(0, w - 92),
    h = 18,
    color = 0xffe2e8f0,
    text = tostring(value or "--"),
    fontSize = 11.0,
    align = "left",
    valign = "middle",
  })
end

local function routeTargetAccent(ctx, summary)
  if type(summary) ~= "table" then
    return 0xff60a5fa
  end
  local owner = tostring(summary.target and summary.target.owner or summary.source and summary.source.owner or "")
  local specs = ctx and ctx._rackModuleSpecs or nil
  local spec = type(specs) == "table" and specs[owner] or nil
  if type(spec) == "table" and spec.accentColor ~= nil then
    return tonumber(spec.accentColor) or 0xff60a5fa
  end
  return 0xff60a5fa
end

local function portAccent(summary)
  if type(summary) == "table" and type(summary.spec) == "table" and summary.spec.accentColor ~= nil then
    return tonumber(summary.spec.accentColor) or 0xff64748b
  end
  return 0xff64748b
end

local function buildPopoverDisplay(ctx, deps, ui)
  local state = ctx._rackModPopoverState
  if type(state) ~= "table" then
    return {}
  end

  local _, containerBounds = getContainerBounds(ctx, deps)
  if not containerBounds then
    return {}
  end

  local layout = {
    routeRows = {},
    back = nil,
    delete = nil,
    sliderTrack = nil,
    applyModeLabel = nil,
    applyModeDropdown = nil,
    sliderKnob = nil,
    dragHandle = nil,
  }

  local panelW = state.kind == "route" and 364 or 324
  local routeCount = 0
  if state.kind == "port" and type(state.summary) == "table" then
    routeCount = #(state.summary.routeIds or {})
  end
  local panelH = state.kind == "route" and 334 or (170 + routeCount * 28)
  panelH = math.max(160, math.min(panelH, containerBounds.h - 20))

  local anchorX = tonumber(state.anchor and state.anchor.x) or 240
  local anchorY = tonumber(state.anchor and state.anchor.y) or 120
  local panelX = clamp(anchorX, 10, math.max(10, containerBounds.w - panelW - 10))
  local panelY = clamp(anchorY - 18, 10, math.max(10, containerBounds.h - panelH - 10))

  layout.frame = { x = round(panelX), y = round(panelY), w = round(panelW), h = round(panelH) }
  layout.panel = { x = 0, y = 0, w = round(panelW), h = round(panelH) }
  layout.close = { x = panelW - 28, y = 14, w = 16, h = 16 }
  layout.dragHandle = { x = 0, y = 0, w = panelW - 34, h = 46 }

  local accent = state.kind == "route" and routeTargetAccent(ctx, state.summary) or portAccent(state.summary)
  local commands = {}
  addDisplay(commands, {
    cmd = "fillRoundedRect",
    x = 4,
    y = 6,
    w = panelW,
    h = panelH,
    radius = 10,
    color = 0x3c000000,
  })
  addDisplay(commands, {
    cmd = "fillRoundedRect",
    x = 0,
    y = 0,
    w = panelW,
    h = panelH,
    radius = 0,
    color = 0xff121a2f,
  })
  addDisplay(commands, {
    cmd = "drawRoundedRect",
    x = 0,
    y = 0,
    w = panelW,
    h = panelH,
    radius = 0,
    thickness = 1,
    color = 0xff1f2b4d,
  })
  addDisplay(commands, {
    cmd = "fillRoundedRect",
    x = 0,
    y = 0,
    w = panelW,
    h = 12,
    radius = 0,
    color = accent,
  })
  addDisplay(commands, {
    cmd = "drawText",
    x = 10,
    y = 16,
    w = panelW - 48,
    h = 16,
    color = 0xffffffff,
    text = state.kind == "route" and tostring(state.summary and state.summary.title or "Route") or tostring(state.summary and state.summary.title or "Port"),
    fontSize = 12.0,
    align = "left",
    valign = "middle",
  })
  addDisplay(commands, {
    cmd = "drawText",
    x = 10,
    y = 30,
    w = panelW - 48,
    h = 13,
    color = accent,
    text = state.kind == "route"
      and tostring((state.summary and state.summary.source and state.summary.source.id) or "route")
      or tostring((state.summary and state.summary.moduleName) or "endpoint"),
    fontSize = 9.5,
    align = "left",
    valign = "middle",
  })
  addDisplay(commands, {
    cmd = "drawText",
    x = layout.close.x,
    y = layout.close.y,
    w = layout.close.w,
    h = layout.close.h,
    color = 0xffe2e8f0,
    text = "X",
    fontSize = 11.0,
    align = "center",
    valign = "middle",
  })

  local innerX = 12
  local innerW = panelW - 24
  local y = 52

  if state.kind == "port" then
    local summary = state.summary or {}
    local endpoint = summary.endpoint
    addField(commands, "Port", string.format("%s %s", tostring(summary.portRef and summary.portRef.direction or ""), tostring(summary.portRef and summary.portRef.portType or "")), innerX, y, innerW)
    y = y + 18
    addField(commands, "Label", tostring((summary.port and summary.port.label) or (summary.portRef and summary.portRef.label) or "--"), innerX, y, innerW)
    y = y + 18
    if endpoint then
      addField(commands, "Signal", endpoint.signalKind or "--", innerX, y, innerW)
      y = y + 18
      addField(commands, "Domain", endpoint.domain or "--", innerX, y, innerW)
      y = y + 18
      addField(commands, "Scope", endpoint.scope or "--", innerX, y, innerW)
      y = y + 18
      addField(commands, "Current", formatNumber(summary.liveValue), innerX, y, innerW)
      y = y + 18
    else
      addField(commands, "Signal", tostring(summary.portRef and summary.portRef.portType or "--"), innerX, y, innerW)
      y = y + 18
    end

    addDisplay(commands, {
      cmd = "drawText",
      x = innerX,
      y = y + 6,
      w = innerW,
      h = 14,
      color = 0xffffffff,
      text = (#(summary.routeIds or {}) > 0) and "Routes" or "Routes: none",
      fontSize = 11.0,
      align = "left",
      valign = "middle",
    })
    y = y + 24

    for i = 1, #(summary.routeIds or {}) do
      local routeInfo = buildRouteSummary(ctx, summary.routeIds[i])
      local row = {
        x = innerX,
        y = y,
        w = innerW,
        h = 24,
        routeId = routeInfo.routeId,
      }
      layout.routeRows[#layout.routeRows + 1] = row
      addDisplay(commands, {
        cmd = "fillRoundedRect",
        x = row.x,
        y = row.y,
        w = row.w,
        h = row.h,
        radius = 0,
        color = 0xff10182b,
      })
      addDisplay(commands, {
        cmd = "drawRoundedRect",
        x = row.x,
        y = row.y,
        w = row.w,
        h = row.h,
        radius = 0,
        thickness = 1,
        color = 0xff1f2b4d,
      })
      addDisplay(commands, {
        cmd = "drawText",
        x = row.x + 8,
        y = row.y,
        w = row.w - 64,
        h = row.h,
        color = 0xffe2e8f0,
        text = routeInfo.title,
        fontSize = 10.0,
        align = "left",
        valign = "middle",
      })
      addDisplay(commands, {
        cmd = "drawText",
        x = row.x + row.w - 50,
        y = row.y,
        w = 42,
        h = row.h,
        color = accent,
        text = string.format("%+.2f", tonumber(routeInfo.amount) or 0),
        fontSize = 10.0,
        align = "right",
        valign = "middle",
      })
      y = y + 28
    end
  else
    local summary = state.summary or {}
    if state.parentPortRef ~= nil and #(state.parentRouteIds or {}) > 1 then
      layout.back = { x = innerX, y = y, w = 70, h = 20 }
      addDisplay(commands, {
        cmd = "fillRoundedRect",
        x = layout.back.x,
        y = layout.back.y,
        w = layout.back.w,
        h = layout.back.h,
        radius = 0,
        color = 0xff10182b,
      })
      addDisplay(commands, {
        cmd = "drawRoundedRect",
        x = layout.back.x,
        y = layout.back.y,
        w = layout.back.w,
        h = layout.back.h,
        radius = 0,
        thickness = 1,
        color = 0xff1f2b4d,
      })
      addDisplay(commands, {
        cmd = "drawText",
        x = layout.back.x,
        y = layout.back.y,
        w = layout.back.w,
        h = layout.back.h,
        color = 0xffe2e8f0,
        text = "← Routes",
        fontSize = 10.0,
        align = "center",
        valign = "middle",
      })
      y = y + 26
    end

    addField(commands, "Source", summary.sourceLabel or "--", innerX, y, innerW)
    y = y + 18
    addField(commands, "Target", summary.targetLabel or "--", innerX, y, innerW)
    y = y + 18
    addField(commands, "Scope", summary.compiled and summary.compiled.evalScope or "--", innerX, y, innerW)
    y = y + 18
    addField(commands, "Convert", summary.compiled and summary.compiled.coercionKind or "--", innerX, y, innerW)
    y = y + 22

    layout.applyModeLabel = { x = innerX, y = y, w = 90, h = 18 }
    layout.applyModeDropdown = { x = innerX + 92, y = y - 1, w = innerW - 92, h = 20 }
    addDisplay(commands, {
      cmd = "drawText",
      x = layout.applyModeLabel.x,
      y = layout.applyModeLabel.y,
      w = layout.applyModeLabel.w,
      h = layout.applyModeLabel.h,
      color = 0xff94a3b8,
      text = "Apply",
      fontSize = 11.0,
      align = "left",
      valign = "middle",
    })
    y = y + 28

    local amount = clamp(summary.amount or 0, -1.0, 1.0)
    layout.sliderTrack = { x = innerX, y = y, w = innerW, h = 18 }
    y = y + 26

    addField(commands, "Base", summary.targetState and formatNumber(summary.targetState.baseValue) or "--", innerX, y, innerW)
    y = y + 18
    addField(commands, "Mod", summary.targetState and formatNumber(summary.targetState.modulationValue) or "--", innerX, y, innerW)
    y = y + 18
    addField(commands, "Effective", summary.targetState and formatNumber(summary.targetState.effectiveValue) or "--", innerX, y, innerW)

    layout.delete = { x = panelW - 96, y = panelH - 28, w = 84, h = 18 }
    addDisplay(commands, {
      cmd = "fillRoundedRect",
      x = layout.delete.x,
      y = layout.delete.y,
      w = layout.delete.w,
      h = layout.delete.h,
      radius = 0,
      color = 0xff2a1220,
    })
    addDisplay(commands, {
      cmd = "drawRoundedRect",
      x = layout.delete.x,
      y = layout.delete.y,
      w = layout.delete.w,
      h = layout.delete.h,
      radius = 0,
      thickness = 1,
      color = 0xfffb7185,
    })
    addDisplay(commands, {
      cmd = "drawText",
      x = layout.delete.x,
      y = layout.delete.y,
      w = layout.delete.w,
      h = layout.delete.h,
      color = 0xffffdce3,
      text = "Delete",
      fontSize = 10.0,
      align = "center",
      valign = "middle",
    })
  end

  state.layout = layout
  return commands
end

local function pointInRect(x, y, rect)
  return type(rect) == "table"
    and x >= rect.x and x <= (rect.x + rect.w)
    and y >= rect.y and y <= (rect.y + rect.h)
end

local function updateSliderFromLocalX(ctx, localX)
  local state = ctx._rackModPopoverState
  if not (state and state.kind == "route" and state.layout and state.layout.sliderTrack) then
    return false
  end
  local track = state.layout.sliderTrack
  local t = clamp(((tonumber(localX) or 0) - track.x) / math.max(1, track.w), 0.0, 1.0)
  local amount = t * 2.0 - 1.0
  if setRouteAmount(ctx, state.summary and state.summary.routeId, amount) then
    state.summary = buildRouteSummary(ctx, state.summary and state.summary.routeId)
    M.refresh(ctx)
    return true
  end
  return false
end

local function handlePopoverMouseDown(ctx, mx, my)
  local state = ctx._rackModPopoverState
  if type(state) ~= "table" or type(state.layout) ~= "table" then
    return
  end

  local x = round(mx)
  local y = round(my)
  local layout = state.layout

  if pointInRect(x, y, layout.close) then
    closePopover(ctx)
    return
  end

  if pointInRect(x, y, layout.dragHandle)
    and not pointInRect(x, y, layout.back)
    and not pointInRect(x, y, layout.delete) then
    state.drag = {
      kind = "panel",
      startAnchorX = tonumber(state.anchor and state.anchor.x) or 0,
      startAnchorY = tonumber(state.anchor and state.anchor.y) or 0,
    }
    return
  end

  if state.kind == "port" then
    for i = 1, #layout.routeRows do
      local row = layout.routeRows[i]
      if pointInRect(x, y, row) then
        M.openRoute(ctx, row.routeId, {
          anchor = state.anchor,
          parentPortRef = state.parentPortRef,
          parentAnchor = state.parentAnchor,
          parentRouteIds = state.summary and state.summary.routeIds or nil,
        })
        return
      end
    end
    return
  end

  if pointInRect(x, y, layout.back) then
    openPortPopover(ctx, state.parentPortRef, state.parentAnchor, { forceList = true })
    return
  end

  if pointInRect(x, y, layout.delete) then
    local deleted = deleteRouteById(ctx, state.summary and state.summary.routeId)
    if deleted then
      if state.parentPortRef ~= nil then
        openPortPopover(ctx, state.parentPortRef, state.parentAnchor, { forceList = true })
      else
        closePopover(ctx)
      end
    end
    return
  end

end

local function handlePopoverMouseDrag(ctx, mx, my, dx, dy)
  local state = ctx._rackModPopoverState
  if not (state and type(state.drag) == "table") then
    return
  end
  if state.drag.kind == "panel" then
    local startX = tonumber(state.drag.startAnchorX) or tonumber(state.anchor and state.anchor.x) or 0
    local startY = tonumber(state.drag.startAnchorY) or tonumber(state.anchor and state.anchor.y) or 0
    state.anchor = {
      x = startX + (tonumber(dx) or 0),
      y = startY + (tonumber(dy) or 0),
    }
    M.refresh(ctx)
  end
end

local function handlePopoverMouseUp(ctx)
  local state = ctx._rackModPopoverState
  if state then
    state.drag = nil
  end
end

local function rebuildWireHitNodes(ctx, deps, ui)
  if not (ui and ui.hitHost) then
    return
  end

  ui.hitHost:clearChildren()
  ui.hitRouteIds = {}

  if not (ctx and ctx._rackState and (ctx._rackState.viewMode or "perf") == "patch") then
    return
  end

  local blockedRects = {}
  for _, entry in pairs(getPortRegistry(ctx)) do
    if type(entry) == "table" and tostring(entry.portType or "") == "param" and entry.widget ~= nil then
      local bounds = getWidgetBoundsInContainer(ctx, entry.widget, deps)
      if bounds then
        blockedRects[#blockedRects + 1] = bounds
      end
    end
  end

  local connections = ctx._rackConnections or {}
  for i = 1, #connections do
    local conn = connections[i]
    if isNonAudioConnection(conn) then
      local fromEntry = findPortEntry(ctx, conn.from and conn.from.moduleId, conn.from and conn.from.portId, "output")
      local toEntry = findPortEntry(ctx, conn.to and conn.to.moduleId, conn.to and conn.to.portId, "input")
      local fromBounds = fromEntry and getWidgetBoundsInContainer(ctx, fromEntry.widget, deps) or nil
      local toBounds = toEntry and getWidgetBoundsInContainer(ctx, toEntry.widget, deps) or nil
      if fromBounds and toBounds then
        local x1 = fromBounds.x + math.floor(fromBounds.w * 0.5)
        local y1 = fromBounds.y + math.floor(fromBounds.h * 0.5)
        local x2 = toBounds.x + math.floor(toBounds.w * 0.5)
        local y2 = toBounds.y + math.floor(toBounds.h * 0.5)
        local bezier = computeWireBezier(x1, y1, x2, y2)
        local routeId = tostring(conn.id or "")
        local samples = { 0.16, 0.24, 0.32, 0.40, 0.50, 0.60, 0.68, 0.76, 0.84 }
        for sampleIndex = 1, #samples do
          local point = cubicPoint(bezier.x1, bezier.y1, bezier.cx1, bezier.cy1, bezier.cx2, bezier.cy2, bezier.x2, bezier.y2, samples[sampleIndex])
          if not pointIntersectsAnyRect(point.x, point.y, blockedRects, 4) then
            local hit = ui.hitHost:addChild(string.format("route_hit_%s_%d", routeId, sampleIndex))
            hit:setWidgetType("RackModRouteHit")
            setNodeTransparent(hit)
            hit:setBounds(round(point.x) - 8, round(point.y) - 8, 16, 16)
            hit:setInterceptsMouse(true, true)
            hit:setOnMouseDown(function(mx, my, shift, ctrl, alt, right)
              if right ~= true then
                return
              end
              M.openRoute(ctx, routeId, {
                anchor = buildAnchor(point.x + 12, point.y + 8),
              })
            end)
            ui.hitRouteIds[#ui.hitRouteIds + 1] = routeId
          end
        end
      end
    end
  end
end

function M.refresh(ctx, deps)
  deps = deps or (ctx and ctx._rackModPopoverDeps) or {}
  if ctx then
    ctx._rackModPopoverDeps = deps
  end

  local ui = ensureUiNodes(ctx, deps)
  if not ui then
    return
  end

  rebuildWireHitNodes(ctx, deps, ui)

  if type(ctx and ctx._rackModPopoverState) ~= "table" then
    ui.popover:setVisible(false)
    ui.popover:clearDisplayList()
    if ui.amountSlider and ui.amountSlider.node then
      ui.amountSlider.node:setVisible(false)
    end
    if ui.applyModeSelector and ui.applyModeSelector.node then
      ui.applyModeSelector.node:setVisible(false)
    end
    return
  end

  local display = buildPopoverDisplay(ctx, deps, ui)
  local popState = ctx._rackModPopoverState
  local frame = popState and popState.layout and popState.layout.frame or { x = 0, y = 0, w = 1, h = 1 }
  ui.popover:setBounds(frame.x, frame.y, frame.w, frame.h)
  ui.popover:setVisible(true)
  ui.popover:setOnMouseDown(function(mx, my, shift, ctrl, alt, right)
    handlePopoverMouseDown(ctx, mx, my)
  end)
  ui.popover:setOnMouseDrag(function(mx, my, dx, dy)
    handlePopoverMouseDrag(ctx, mx, my, dx, dy)
  end)
  ui.popover:setOnMouseUp(function(mx, my)
    handlePopoverMouseUp(ctx)
  end)
  ui.popover:setDisplayList(display)

  if ui.amountSlider and ui.amountSlider.node then
    if popState.kind == "route" and popState.layout and popState.layout.sliderTrack then
      local sliderBounds = popState.layout.sliderTrack
      local summary = popState.summary or {}
      local accent = routeTargetAccent(ctx, summary)
      ui.amountSlider._colour = accent
      ui.amountSlider._bg = 0xff10182b
      ui.amountSlider:setLabel("Polarity")
      if ui.amountSlider._syncRetained then
        ui.amountSlider:_syncRetained()
      end
      ui.amountSlider.node:setBounds(sliderBounds.x, sliderBounds.y, sliderBounds.w, sliderBounds.h)
      setWidgetValueSilently(ui.amountSlider, clamp(summary.amount or 0, -1.0, 1.0))
      ui.amountSlider._onChange = function(v)
        if setRouteAmount(ctx, popState.summary and popState.summary.routeId, v) then
          popState.summary = buildRouteSummary(ctx, popState.summary and popState.summary.routeId)
          M.refresh(ctx)
        end
      end
      ui.amountSlider.node:setVisible(true)
    else
      ui.amountSlider.node:setVisible(false)
    end
  end

  if ui.applyModeSelector and ui.applyModeSelector.node then
    if popState.kind == "route" and popState.layout and popState.layout.applyModeDropdown then
      local summary = popState.summary or {}
      local accent = routeTargetAccent(ctx, summary)
      local bounds = popState.layout.applyModeDropdown
      local allowedModes = summary.allowedApplyModes or { "add", "replace" }
      local labels = {}
      local selectedIndex = 1
      local currentMode = tostring(summary.applyMode or "add")
      for i = 1, #allowedModes do
        local mode = tostring(allowedModes[i] or "")
        labels[i] = mode:gsub("^%l", string.upper)
        if mode == currentMode then
          selectedIndex = i
        end
      end
      ui.applyModeSelector._selectedBg = accent
      ui.applyModeSelector._bg = 0xff10182b
      ui.applyModeSelector._textColour = 0xffcbd5e1
      ui.applyModeSelector._selectedTextColour = 0xffffffff
      ui.applyModeSelector._segments = labels
      setSelectedSilently(ui.applyModeSelector, selectedIndex)
      if ui.applyModeSelector._syncRetained then
        ui.applyModeSelector:_syncRetained()
      end
      ui.applyModeSelector.node:setBounds(bounds.x, bounds.y, bounds.w, bounds.h)
      ui.applyModeSelector._onSelect = function(idx)
        local nextMode = tostring(allowedModes[idx] or "")
        if nextMode ~= "" and setRouteApplyMode(ctx, popState.summary and popState.summary.routeId, nextMode) then
          popState.summary = buildRouteSummary(ctx, popState.summary and popState.summary.routeId)
          M.refresh(ctx)
        end
      end
      ui.applyModeSelector.node:setVisible(true)
    else
      ui.applyModeSelector.node:setVisible(false)
    end
  end

  ui.popover:repaint()
end

function M.close(ctx)
  closePopover(ctx)
end

return M
