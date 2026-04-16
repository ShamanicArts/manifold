-- Patchbay Binding Module
-- Extracts patchbay-related functions from midisynth.lua

local M = {}

local PatchbayRuntime = require("ui.patchbay_runtime")

local RackWireLayer
local RackModPopover
local getScopedWidget
local getWidgetBoundsInRoot
local readParam
local setPath
local setWidgetValueSilently
local setSampleLoopStartLinked
local setSampleLoopLenLinked
local syncLegacyBlendDirectionFromBlend
local syncRackEdgeTerminals_impl
local syncPatchViewMode_impl
local ModulationRouter
local ParameterBinder
local auxAudioSourceCodeForEndpoint

local RACK_MODULE_SHELL_LAYOUT
local RackLayout
local getRackTotalRows
local refreshManagedLayoutState
local RACK_COLUMNS_PER_ROW

function M.init(deps)
  RackWireLayer = deps.RackWireLayer
  RackModPopover = deps.RackModPopover
  getScopedWidget = deps.getScopedWidget
  getWidgetBoundsInRoot = deps.getWidgetBoundsInRoot
  readParam = deps.readParam
  setPath = deps.setPath
  setWidgetValueSilently = deps.setWidgetValueSilently
  setSampleLoopStartLinked = deps.setSampleLoopStartLinked
  setSampleLoopLenLinked = deps.setSampleLoopLenLinked
  syncLegacyBlendDirectionFromBlend = deps.syncLegacyBlendDirectionFromBlend
  ModulationRouter = deps.ModulationRouter
  ParameterBinder = deps.ParameterBinder
  auxAudioSourceCodeForEndpoint = deps.auxAudioSourceCodeForEndpoint
  
  RACK_MODULE_SHELL_LAYOUT = deps.RACK_MODULE_SHELL_LAYOUT
  RackLayout = deps.RackLayout
  getRackTotalRows = deps.getRackTotalRows
  refreshManagedLayoutState = deps.refreshManagedLayoutState
  RACK_COLUMNS_PER_ROW = deps.RACK_COLUMNS_PER_ROW
  round = deps.round
  
  -- Cache the global implementations for later reference
  syncRackEdgeTerminals_impl = function(ctx)
    return PatchbayRuntime.syncRackEdgeTerminals(ctx, {
      getScopedWidget = getScopedWidget,
      getWidgetBoundsInRoot = getWidgetBoundsInRoot,
      findRegisteredPatchbayPort = M.findRegisteredPatchbayPort,
      round = round,
    })
  end
  
  syncPatchViewMode_impl = function(ctx)
    local result = PatchbayRuntime.syncPatchViewMode(ctx, {
      RackWireLayer = RackWireLayer,
      RackModPopover = RackModPopover,
      getScopedWidget = getScopedWidget,
      getWidgetBoundsInRoot = getWidgetBoundsInRoot,
      findRegisteredPatchbayPort = M.findRegisteredPatchbayPort,
      round = round,
      readParam = readParam,
      setPath = setPath,
      setWidgetValueSilently = setWidgetValueSilently,
      PATHS = ParameterBinder.PATHS,
      setSampleLoopStartLinked = setSampleLoopStartLinked,
      setSampleLoopLenLinked = setSampleLoopLenLinked,
      syncLegacyBlendDirectionFromBlend = syncLegacyBlendDirectionFromBlend,
    })
    RackModPopover.refresh(ctx, {
      RackWireLayer = RackWireLayer,
      getScopedWidget = getScopedWidget,
      getWidgetBoundsInRoot = getWidgetBoundsInRoot,
    })
    return result
  end
end

function M.attach(midiSynth)
  midiSynth.cleanupPatchbayFromRuntime = M.cleanupPatchbayFromRuntime
  midiSynth.invalidatePatchbay = M.invalidatePatchbay
  midiSynth.ensurePatchbayWidgets = M.ensurePatchbayWidgets
  midiSynth.syncPatchbayValues = M.syncPatchbayValues
  midiSynth.findRegisteredPatchbayPort = M.findRegisteredPatchbayPort
  midiSynth.syncRackEdgeTerminals = M.syncRackEdgeTerminals
  midiSynth.syncPatchViewMode = M.syncPatchViewMode
  midiSynth.toggleRackNodeWidth = M.toggleRackNodeWidth
  midiSynth._setupResizeToggleHandlers = M._setupResizeToggleHandlers
  midiSynth.bindWirePortWidget = M.bindWirePortWidget
  midiSynth.syncAuxAudioRouteParams = M.syncAuxAudioRouteParams
end

function M.cleanupPatchbayFromRuntime(shellId, ctx)
  return PatchbayRuntime.cleanupFromRuntime(shellId, ctx, {
    RackWireLayer = RackWireLayer,
  })
end

function M.invalidatePatchbay(nodeId, ctx)
  return PatchbayRuntime.invalidate(nodeId, ctx, {
    RACK_MODULE_SHELL_LAYOUT = RACK_MODULE_SHELL_LAYOUT,
    RackWireLayer = RackWireLayer,
  })
end

function M.ensurePatchbayWidgets(ctx, shellId, nodeId, specId, currentPage)
  return PatchbayRuntime.ensureWidgets(ctx, shellId, nodeId, specId, currentPage, {
    RackWireLayer = RackWireLayer,
    readParam = readParam,
    setPath = setPath,
    setWidgetValueSilently = setWidgetValueSilently,
    PATHS = ParameterBinder.PATHS,
    setSampleLoopStartLinked = setSampleLoopStartLinked,
    setSampleLoopLenLinked = setSampleLoopLenLinked,
    syncLegacyBlendDirectionFromBlend = syncLegacyBlendDirectionFromBlend,
  })
end

function M.syncPatchbayValues(ctx)
  return PatchbayRuntime.syncValues(ctx, {
    readParam = readParam,
    setWidgetValueSilently = setWidgetValueSilently,
    getModTargetState = function(path)
      return ModulationRouter.getCombinedModTargetState(ctx, path)
    end,
  })
end

function M.findRegisteredPatchbayPort(ctx, nodeId, portId, direction)
  return PatchbayRuntime.findRegisteredPort(ctx, nodeId, portId, direction)
end

function M.syncRackEdgeTerminals(ctx)
  if syncRackEdgeTerminals_impl then
    return syncRackEdgeTerminals_impl(ctx)
  end
  return PatchbayRuntime.syncRackEdgeTerminals(ctx, {
    getScopedWidget = getScopedWidget,
    getWidgetBoundsInRoot = getWidgetBoundsInRoot,
    findRegisteredPatchbayPort = M.findRegisteredPatchbayPort,
    round = round,
  })
end

function M.syncPatchViewMode(ctx)
  if syncPatchViewMode_impl then
    return syncPatchViewMode_impl(ctx)
  end
  local result = PatchbayRuntime.syncPatchViewMode(ctx, {
    RackWireLayer = RackWireLayer,
    RackModPopover = RackModPopover,
    getScopedWidget = getScopedWidget,
    getWidgetBoundsInRoot = getWidgetBoundsInRoot,
    findRegisteredPatchbayPort = M.findRegisteredPatchbayPort,
    round = round,
    readParam = readParam,
    setPath = setPath,
    setWidgetValueSilently = setWidgetValueSilently,
    PATHS = ParameterBinder.PATHS,
    setSampleLoopStartLinked = setSampleLoopStartLinked,
    setSampleLoopLenLinked = setSampleLoopLenLinked,
    syncLegacyBlendDirectionFromBlend = syncLegacyBlendDirectionFromBlend,
  })
  RackModPopover.refresh(ctx, {
    RackWireLayer = RackWireLayer,
    getScopedWidget = getScopedWidget,
    getWidgetBoundsInRoot = getWidgetBoundsInRoot,
  })
  return result
end

function M.toggleRackNodeWidth(ctx, nodeId)
  return PatchbayRuntime.toggleNodeWidth(ctx, nodeId, {
    RACK_MODULE_SHELL_LAYOUT = RACK_MODULE_SHELL_LAYOUT,
    getScopedWidget = getScopedWidget,
    invalidatePatchbay = M.invalidatePatchbay,
    refreshManagedLayoutState = refreshManagedLayoutState,
    syncPatchViewMode = M.syncPatchViewMode,
    RackLayout = RackLayout,
    getRackTotalRows = getRackTotalRows,
    columnsPerRow = RACK_COLUMNS_PER_ROW,
  })
end

function M._setupResizeToggleHandlers(ctx)
  return PatchbayRuntime.setupResizeToggleHandlers(ctx, {
    RACK_MODULE_SHELL_LAYOUT = RACK_MODULE_SHELL_LAYOUT,
    getScopedWidget = getScopedWidget,
    invalidatePatchbay = M.invalidatePatchbay,
    refreshManagedLayoutState = refreshManagedLayoutState,
    syncPatchViewMode = M.syncPatchViewMode,
    RackLayout = RackLayout,
    getRackTotalRows = getRackTotalRows,
    columnsPerRow = RACK_COLUMNS_PER_ROW,
  })
end

function M.bindWirePortWidget(ctx, portWidget, entry)
  return PatchbayRuntime.bindWirePortWidget(ctx, portWidget, entry, {
    RackWireLayer = RackWireLayer,
    RackModPopover = RackModPopover,
    getScopedWidget = getScopedWidget,
    getWidgetBoundsInRoot = getWidgetBoundsInRoot,
  })
end

function M.syncAuxAudioRouteParams(ctx)
  local writer = nil
  if type(setPath) == "function" then
    writer = function(path, value)
      return setPath(path, tonumber(value) or 0)
    end
  elseif type(command) == "function" then
    writer = function(path, value)
      command("SET", path, tostring(tonumber(value) or 0))
      return true
    end
  end
  if type(writer) ~= "function" then
    return false
  end

  local modules = ctx and ctx._rackState and ctx._rackState.modules or {}
  local moduleById = {}
  local dynamicInfo = type(_G) == "table" and _G.__midiSynthDynamicModuleInfo or nil
  local registeredSpecs = type(_G) == "table" and _G.__midiSynthDynamicModuleSpecs or nil
  for i = 1, #(modules or {}) do
    local module = modules[i]
    if type(module) == "table" and module.id ~= nil then
      moduleById[tostring(module.id)] = module
    end
  end

  local function resolveModuleRuntimeMeta(moduleId)
    local id = tostring(moduleId or "")
    local module = moduleById[id]
    local moduleMeta = type(module) == "table" and type(module.meta) == "table" and module.meta or nil
    local spec = type(registeredSpecs) == "table" and registeredSpecs[id] or nil
    local specMeta = type(spec) == "table" and type(spec.meta) == "table" and spec.meta or nil
    local entry = type(dynamicInfo) == "table" and dynamicInfo[id] or nil

    local specId = tostring(
      (type(entry) == "table" and entry.specId)
      or (type(specMeta) == "table" and specMeta.specId)
      or (type(moduleMeta) == "table" and moduleMeta.specId)
      or id
    )
    local slotIndex = tonumber(
      (type(entry) == "table" and entry.slotIndex)
      or (type(specMeta) == "table" and specMeta.slotIndex)
      or (type(moduleMeta) == "table" and moduleMeta.slotIndex)
    )

    return specId, slotIndex
  end

  local blendBSourceBySlot = {}
  local sampleInputSourceBySlot = {}
  local connections = ctx and ctx._rackConnections or {}

  for i = 1, #(connections or {}) do
    local conn = connections[i]
    if tostring(conn and conn.kind or "") == "audio" then
      local from = type(conn.from) == "table" and conn.from or nil
      local to = type(conn.to) == "table" and conn.to or nil
      if from and to then
        local toModuleId = tostring(to.moduleId or "")
        local specId, slotIndex = resolveModuleRuntimeMeta(toModuleId)
        if specId == "blend_simple" and tostring(to.portId or "") == "b" and slotIndex ~= nil then
          blendBSourceBySlot[slotIndex] = auxAudioSourceCodeForEndpoint(from.moduleId, from.portId)
        elseif specId == "rack_sample" and tostring(to.portId or "") == "in" and slotIndex ~= nil then
          sampleInputSourceBySlot[slotIndex] = auxAudioSourceCodeForEndpoint(from.moduleId, from.portId)
        end
      end
    end
  end

  local dynamicSlots = ctx and ctx._dynamicModuleSlots or {}
  local pending = false
  local blendSlots = dynamicSlots and dynamicSlots.blend_simple or {}
  for slotIndex, _ in pairs(blendSlots or {}) do
    local ok = writer(ParameterBinder.dynamicBlendSimpleBSourcePath(slotIndex), blendBSourceBySlot[slotIndex] or 0)
    if ok == false then
      pending = true
    end
  end

  local sampleSlots = dynamicSlots and dynamicSlots.rack_sample or {}
  for slotIndex, _ in pairs(sampleSlots or {}) do
    local ok = writer(ParameterBinder.dynamicSampleInputSourcePath(slotIndex), sampleInputSourceBySlot[slotIndex] or 0)
    if ok == false then
      pending = true
    end
  end

  if ctx then
    ctx._pendingAuxAudioRouteSync = pending == true
  end
  return true
end

return M