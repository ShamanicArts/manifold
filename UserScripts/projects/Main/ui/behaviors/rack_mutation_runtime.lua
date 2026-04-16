-- Rack Mutation Runtime Module
-- Extracted from midisynth.lua
-- Handles rack graph mutations (spawn/delete) and graph resync/runtime refresh.

local M = {}

local deps = {}
local host = nil

local function voiceAmpPath(index)
  return string.format("/midi/synth/voice/%d/amp", index)
end

local function voiceGatePath(index)
  return string.format("/midi/synth/voice/%d/gate", index)
end

local function buildDeletionMinRows(nodes)
  local minRows = {}
  if type(nodes) ~= "table" then
    return minRows
  end
  for i = 1, #nodes do
    local node = nodes[i]
    if node then
      minRows[tostring(node.id or "")] = math.max(0, math.floor(tonumber(node.row) or 0))
    end
  end
  return minRows
end

function M.spawnPaletteNodeAt(ctx, paletteEntryId, targetRow, targetIndex, insertMode)
  if not (ctx and ctx._rackState) then
    return false
  end

  local entry = host._getPaletteEntry(paletteEntryId)
  if type(entry) ~= "table" then
    return false
  end

  local nodeId, tempNode, unregisterOnFailure = host._buildPaletteNodeFromEntry(ctx, entry)
  if not nodeId or not tempNode then
    return false
  end

  local previousNodes = deps.RackLayout.cloneRackModules(ctx._rackState.modules or {})
  local previousConnections = deps.MidiSynthRackSpecs.normalizeConnections(ctx._rackConnections or {}, previousNodes)
  local baseNodes = deps.RackLayout.cloneRackModules(previousNodes)
  baseNodes[#baseNodes + 1] = tempNode

  local workingNodes = deps.autoCollapseRowForInsertion(
    baseNodes,
    nodeId,
    math.max(0, math.floor(tonumber(targetRow) or 0)),
    math.max(1, tonumber(tempNode.w) or 1),
    ctx and ctx._rackModuleSpecs,
    deps.RACK_COLUMNS_PER_ROW
  )

  local minRows = buildDeletionMinRows(workingNodes)
  minRows[tostring(nodeId)] = math.max(0, math.floor(tonumber(targetRow) or 0))

  local targetCol = tonumber(targetIndex)
  local desiredRow = math.max(0, math.floor(tonumber(targetRow) or 0))
  local ok, nextNodes
  local canUseSparseSlot = targetCol ~= nil
    and targetCol >= 0
    and targetCol < deps.RACK_COLUMNS_PER_ROW
    and deps.RackLayout.isAreaFree(workingNodes, desiredRow, math.floor(targetCol), math.max(1, tonumber(tempNode.w) or 1), math.max(1, tonumber(tempNode.h) or 1), nodeId)

  if canUseSparseSlot then
    local maxRows = math.max(deps.getRackTotalRows(ctx), desiredRow + math.max(1, tonumber(tempNode.h) or 1) + 1, 8)
    ok, nextNodes = pcall(
      deps.RackLayout.moveModuleToSlot,
      workingNodes,
      nodeId,
      desiredRow,
      math.floor(targetCol),
      deps.RACK_COLUMNS_PER_ROW,
      maxRows
    )
  else
    ok, nextNodes = pcall(
      deps.RackLayout.moveModuleInFlowConstrained,
      workingNodes,
      nodeId,
      math.max(1, math.floor(tonumber(targetIndex) or (#workingNodes))),
      deps.RACK_COLUMNS_PER_ROW,
      0,
      minRows
    )
  end
  if not ok or type(nextNodes) ~= "table" then
    if unregisterOnFailure then
      deps.RackModuleFactory.unregisterDynamicModuleSpec(ctx, nodeId, {
        setPath = deps.setPath,
        voiceCount = deps.VOICE_COUNT,
      })
    end
    return false
  end

  ctx._rackState.modules = deps.RackLayout.cloneRackModules(nextNodes)
  ctx._rackState.utilityDock = deps.ensureUtilityDockState(ctx)
  local shouldInsertWire = (insertMode == true) or (tonumber(insertMode) or 0) > 0.5
  local nextConnections
  if shouldInsertWire then
    nextConnections = deps.MidiSynthRackSpecs.insertRackModuleAtVisualSlot(
      ctx._rackConnections or {},
      ctx._rackState.modules,
      nodeId,
      baseNodes
    )
  else
    nextConnections = deps.MidiSynthRackSpecs.normalizeConnections(ctx._rackConnections or {}, ctx._rackState.modules)
  end
  local topologyChanged = shouldInsertWire or (type(host._rackTopologyChanged) == "function" and host._rackTopologyChanged(previousConnections, previousNodes, nextConnections, ctx._rackState.modules) == true)
  ctx._rackConnections = nextConnections
  _G.__midiSynthRackState = ctx._rackState
  _G.__midiSynthRackConnections = ctx._rackConnections

  if topologyChanged then
    M.applyRackConnectionState(ctx, shouldInsertWire and "palette-spawn-insert" or "palette-spawn")
    deps.refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
  else
    deps.refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
    M._refreshRackPresentation(ctx)
  end
  ctx._lastEvent = string.format("Palette spawned: %s", tostring(nodeId))
  return true
end

function M.spawnPalettePlaceholderAt(ctx, targetRow, targetIndex)
  return M.spawnPaletteNodeAt(ctx, "placeholder", targetRow, targetIndex)
end

function M.deleteRackNode(ctx, nodeId)
  local targetNodeId = tostring(nodeId or "")
  if targetNodeId == "" or not (ctx and ctx._rackState) then
    return false
  end
  if not (deps.MidiSynthRackSpecs.isRackModuleDeletable and deps.MidiSynthRackSpecs.isRackModuleDeletable(targetNodeId)) then
    return false
  end

  local originalNodes = deps.RackLayout.cloneRackModules(ctx._rackState.modules or {})
  local previousConnections = deps.MidiSynthRackSpecs.normalizeConnections(ctx._rackConnections or {}, originalNodes)
  local currentNodes = deps.RackLayout.cloneRackModules(originalNodes)
  local removeIndex = deps.RackLayout.findRackModuleIndex(currentNodes, targetNodeId)
  if removeIndex == nil then
    return false
  end
  table.remove(currentNodes, removeIndex)

  local nextNodes = deps.RackLayout.getFlowModules(currentNodes)
  local nextConnections = ctx._rackConnections or {}
  if deps.MidiSynthRackSpecs.spliceRackModule then
    nextConnections = deps.MidiSynthRackSpecs.spliceRackModule(nextConnections, originalNodes, targetNodeId)
  end

  if deps.dragState and deps.dragState.moduleId == targetNodeId then
    deps.hideDragGhost(ctx)
    deps.resetDragState(ctx)
  end
  ctx._dragPreviewModules = nil

  if deps.RackWireLayer and deps.RackWireLayer.cancelWireDrag then
    deps.RackWireLayer.cancelWireDrag(ctx)
  end
  if deps.RackModPopover and deps.RackModPopover.close then
    deps.RackModPopover.close(ctx)
  end

  local shellMeta = deps.getRackShellMetaByNodeId(targetNodeId)
  deps.invalidatePatchbay(targetNodeId, ctx)
  if shellMeta and shellMeta.shellId then
    deps.cleanupPatchbayFromRuntime(shellMeta.shellId, ctx)
    local patchbayInstances = deps.PatchbayRuntime.getInstances()
    if type(patchbayInstances) == "table" then
      patchbayInstances[shellMeta.shellId] = nil
    end
    local portRegistry = ctx._patchbayPortRegistry or _G.__midiSynthPatchbayPortRegistry
    if type(portRegistry) == "table" then
      for key, entry in pairs(portRegistry) do
        if type(entry) == "table"
          and (tostring(entry.nodeId or "") == targetNodeId or tostring(entry.shellId or "") == tostring(shellMeta.shellId)) then
          portRegistry[key] = nil
        end
      end
      ctx._patchbayPortRegistry = portRegistry
      _G.__midiSynthPatchbayPortRegistry = portRegistry
    end
  end

  local dynamicSpecs = type(_G) == "table" and _G.__midiSynthDynamicModuleSpecs or nil
  local dynamicInfo = type(_G) == "table" and _G.__midiSynthDynamicModuleInfo or nil
  local isDynamicNode = (shellMeta and shellMeta.dynamic == true)
    or (type(dynamicSpecs) == "table" and dynamicSpecs[targetNodeId] ~= nil)
    or (type(dynamicInfo) == "table" and dynamicInfo[targetNodeId] ~= nil)
  if isDynamicNode then
    deps.RackModuleFactory.unregisterDynamicModuleSpec(ctx, targetNodeId, {
      setPath = deps.setPath,
      voiceCount = deps.VOICE_COUNT,
    })
  end

  local normalizedNextConnections = deps.MidiSynthRackSpecs.normalizeConnections(nextConnections, nextNodes)
  local topologyChanged = true
  if type(host._rackTopologyChanged) == "function" then
    topologyChanged = host._rackTopologyChanged(previousConnections, originalNodes, normalizedNextConnections, nextNodes)
  end

  ctx._rackState.modules = nextNodes
  ctx._rackState.utilityDock = deps.ensureUtilityDockState(ctx)
  ctx._rackConnections = normalizedNextConnections
  _G.__midiSynthRackState = ctx._rackState
  _G.__midiSynthRackConnections = ctx._rackConnections

  if topologyChanged then
    M.applyRackConnectionState(ctx, "rack-delete")
    deps.refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
  else
    deps.refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
    M._refreshRackPresentation(ctx)
  end

  ctx._lastEvent = string.format("Rack deleted: %s", targetNodeId)
  return true
end

function M._setupDeleteButtonHandlers(ctx)
  if type(deps.RACK_MODULE_SHELL_LAYOUT) ~= "table" then
    return
  end

  for nodeId, meta in pairs(deps.RACK_MODULE_SHELL_LAYOUT) do
    local button = deps.getScopedWidget(ctx, "." .. meta.shellId .. ".deleteButton")
    if button and button.node then
      button.node:setInterceptsMouse(true, true)
      local targetNodeId = nodeId
      button.node:setOnMouseDown(function()
        if deps.MidiSynthRackSpecs.isRackModuleDeletable and deps.MidiSynthRackSpecs.isRackModuleDeletable(targetNodeId) then
          M.deleteRackNode(ctx, targetNodeId)
        end
      end)
    end
  end
end

local function ensureRackControlRouting(ctx, reason)
  ctx._modEndpointRegistry = ctx._modEndpointRegistry or deps.ModEndpointRegistry.new()
  ctx._modRouteCompiler = ctx._modRouteCompiler or deps.ModRouteCompiler.new()
  ctx._rackControlRouter = ctx._rackControlRouter or deps.RackControlRouter.new()
  ctx._rackModRuntime = ctx._rackModRuntime or deps.ModRuntime.new()
  ctx._modEndpointRegistry:rebuild(ctx, { reason = "rack-control-router" })
  local snapshot = ctx._rackControlRouter:rebuild(ctx._rackConnections, ctx._modRouteCompiler, ctx._modEndpointRegistry, reason)
  if ctx._rackModRuntime and ctx._rackModRuntime.setRoutes then
    ctx._rackModRuntime:setRoutes(ctx._rackControlRouter.routes, ctx._modRouteCompiler, ctx._modEndpointRegistry)
  end
  return snapshot
end

local function syncPrimaryControlRoutes(ctx, reason)
  local previous = host._hasAnyOscillatorGateRoute(ctx)
  local previousLegacy = host._isLegacyOscillatorGateRouteConnected(ctx)
  local snapshot = ensureRackControlRouting(ctx, reason)
  local connected = host._hasAnyOscillatorGateRoute(ctx)
  local canonicalConnected = host._hasCanonicalOscillatorGateRoute(ctx)
  local legacyConnected = host._isLegacyOscillatorGateRouteConnected(ctx)

  ctx._controlRouteState = {
    adsrToOscillatorGateConnected = connected,
    adsrToCanonicalOscillatorGateConnected = canonicalConnected,
    adsrToLegacyOscillatorGateConnected = legacyConnected,
    lastReason = reason,
    router = snapshot,
  }

  if previousLegacy == true and legacyConnected == false and type(ctx) == "table" and type(ctx._voices) == "table" and #ctx._voices > 0 then
    for i = 1, deps.VOICE_COUNT do
      local voice = ctx._voices[i]
      if voice then
        voice.sentAmp = 0
      end
      deps.setPath(voiceAmpPath(i), 0)
      deps.setPath(voiceGatePath(i), 0)
    end
  end

  if previous == true and connected == false and type(ctx) == "table" and type(ctx._voices) == "table" and #ctx._voices > 0 then
    deps.panicVoices(ctx)
    ctx._lastEvent = "ADSR → source control disconnected"
  end

  return connected
end

function M._refreshRackPresentation(ctx)
  local viewMode = ctx and ctx._rackState and (ctx._rackState.viewMode or "perf") or "perf"
  if viewMode == "patch" then
    deps.syncPatchViewMode(ctx)
    if deps.RackWireLayer and deps.RackWireLayer.refreshWires then
      deps.RackWireLayer.refreshWires(ctx)
    end
  end

  if type(ctx and ctx._rackModPopoverState) == "table" or type(ctx and ctx._wireDrag) == "table" then
    deps.RackModPopover.refresh(ctx, {
      RackWireLayer = deps.RackWireLayer,
      getScopedWidget = deps.getScopedWidget,
      getWidgetBoundsInRoot = deps.getWidgetBoundsInRoot,
    })
  end
end

function M.applyRackConnectionState(ctx, reason)
  local rackNodes = ctx and ctx._rackState and ctx._rackState.modules or nil
  local normalizedConnections = deps.MidiSynthRackSpecs.normalizeConnections(ctx and ctx._rackConnections or nil, rackNodes)
  local topologySignature = host._rackTopologySignature(normalizedConnections, rackNodes)

  ctx._rackConnections = normalizedConnections
  _G.__midiSynthRackConnections = ctx._rackConnections

  if ctx._rackTopologySignature ~= topologySignature then
    syncPrimaryControlRoutes(ctx, reason)

    local edgeMask = deps.MidiSynthRackSpecs.audioRouteEdgeMask(ctx._rackConnections)
    ctx._rackAudioEdgeMask = edgeMask
    host._syncRackAudioStageParams(ctx)
    deps.syncAuxAudioRouteParams(ctx)
    deps.setPath(deps.PATHS.rackAudioEdgeMask, edgeMask)
    ctx._rackTopologySignature = topologySignature
  end

  M._refreshRackPresentation(ctx)

  return ctx._rackAudioEdgeMask or deps.MidiSynthRackSpecs.audioRouteEdgeMask(ctx._rackConnections)
end

function M.attach(midiSynth)
  host = midiSynth
  midiSynth.spawnPaletteNodeAt = M.spawnPaletteNodeAt
  midiSynth.spawnPalettePlaceholderAt = M.spawnPalettePlaceholderAt
  midiSynth.deleteRackNode = M.deleteRackNode
  midiSynth._setupDeleteButtonHandlers = M._setupDeleteButtonHandlers
  midiSynth._refreshRackPresentation = M._refreshRackPresentation
  midiSynth.applyRackConnectionState = M.applyRackConnectionState
end

function M.init(options)
  options = options or {}
  deps.RackLayout = options.RackLayout
  deps.MidiSynthRackSpecs = options.MidiSynthRackSpecs
  deps.RackModuleFactory = options.RackModuleFactory
  deps.ModEndpointRegistry = options.ModEndpointRegistry
  deps.ModRouteCompiler = options.ModRouteCompiler
  deps.RackControlRouter = options.RackControlRouter
  deps.ModRuntime = options.ModRuntime
  deps.PatchbayRuntime = options.PatchbayRuntime
  deps.RackWireLayer = options.RackWireLayer
  deps.RackModPopover = options.RackModPopover
  deps.setPath = options.setPath
  deps.readParam = options.readParam
  deps.PATHS = options.PATHS
  deps.VOICE_COUNT = options.VOICE_COUNT or 8
  deps.RACK_COLUMNS_PER_ROW = options.RACK_COLUMNS_PER_ROW or 8
  deps.RACK_MODULE_SHELL_LAYOUT = options.RACK_MODULE_SHELL_LAYOUT
  deps.getScopedWidget = options.getScopedWidget
  deps.getWidgetBoundsInRoot = options.getWidgetBoundsInRoot
  deps.autoCollapseRowForInsertion = options.autoCollapseRowForInsertion
  deps.getRackTotalRows = options.getRackTotalRows
  deps.ensureUtilityDockState = options.ensureUtilityDockState
  deps.hideDragGhost = options.hideDragGhost
  deps.resetDragState = options.resetDragState
  deps.dragState = options.dragState
  deps.getRackShellMetaByNodeId = options.getRackShellMetaByNodeId
  deps.invalidatePatchbay = options.invalidatePatchbay
  deps.cleanupPatchbayFromRuntime = options.cleanupPatchbayFromRuntime
  deps.syncAuxAudioRouteParams = options.syncAuxAudioRouteParams
  deps.syncPatchViewMode = options.syncPatchViewMode
  deps.refreshManagedLayoutState = options.refreshManagedLayoutState
  deps.panicVoices = options.panicVoices
end

return M
