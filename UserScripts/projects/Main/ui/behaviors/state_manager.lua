-- State Manager Module
-- Extracted from midisynth.lua
-- Handles runtime persistence, save/load/reset, and utility dock state.

local M = {}
local deps = {}
local host = nil

local EQ_FREQ_DEFAULTS = {60, 120, 250, 500, 1000, 2500, 6000, 12000}

local function projectRoot()
  if type(deps.projectRoot) == "function" then
    return deps.projectRoot() or ""
  end
  local path = getCurrentScriptPath and getCurrentScriptPath() or ""
  if path == "" then
    return ""
  end
  return path:gsub("/+$", ""):match("^(.*)/[^/]+$") or ""
end

function M.runtimeStatePath()
  local root = projectRoot()
  if root == "" then
    return ""
  end
  return root .. "/editor/runtime_state.lua"
end

function M.loadRuntimeState()
  local path = M.runtimeStatePath()
  if path == "" or type(deps.readTextFile) ~= "function" then
    return {}
  end
  local text = deps.readTextFile(path)
  if type(text) ~= "string" or text == "" then
    return {}
  end
  local chunk = load(text, "midi_runtime_state", "t", {})
  if not chunk then
    return {}
  end
  local ok, state = pcall(chunk)
  if not ok or type(state) ~= "table" then
    return {}
  end
  return state
end

function M.saveRuntimeState(state)
  local path = M.runtimeStatePath()
  if path == "" or type(deps.writeTextFile) ~= "function" then
    return false
  end

  local rackState = state.rackState or {
    viewMode = state.rackViewMode,
    densityMode = state.rackDensityMode,
    utilityDock = {
      visible = state.utilityDockVisible,
      mode = state.utilityDockMode,
      heightMode = state.utilityDockHeightMode,
    },
    nodes = state.rackNodes,
  }

  local function serializeNodes(nodes)
    if type(nodes) ~= "table" or #nodes == 0 then
      return "{}"
    end
    local parts = {"{"}
    for _, node in ipairs(nodes) do
      local nodeParts = {
        string.format("id=%q", tostring(node.id or "")),
        string.format("row=%d", tonumber(node.row) or 0),
        string.format("col=%d", tonumber(node.col) or 0),
        string.format("w=%d", tonumber(node.w) or 1),
        string.format("h=%d", tonumber(node.h) or 1),
      }
      if node.sizeKey then
        table.insert(nodeParts, string.format("sizeKey=%q", tostring(node.sizeKey)))
      end
      local meta = type(node.meta) == "table" and node.meta or nil
      if meta ~= nil then
        local metaParts = {}
        for _, key in ipairs({ "specId", "componentId", "paramBase" }) do
          if meta[key] ~= nil then
            metaParts[#metaParts + 1] = string.format("%s=%q", key, tostring(meta[key]))
          end
        end
        if meta.slotIndex ~= nil then
          metaParts[#metaParts + 1] = string.format("slotIndex=%d", math.max(1, math.floor(tonumber(meta.slotIndex) or 1)))
        end
        if meta.spawned ~= nil then
          metaParts[#metaParts + 1] = string.format("spawned=%s", meta.spawned and "true" or "false")
        end
        if #metaParts > 0 then
          table.insert(nodeParts, "meta={ " .. table.concat(metaParts, ", ") .. " }")
        end
      end
      table.insert(parts, "  { " .. table.concat(nodeParts, ", ") .. " },")
    end
    table.insert(parts, "}")
    return table.concat(parts, "\n")
  end

  local function serializeConnections(connections)
    if type(connections) ~= "table" or #connections == 0 then
      return "{}"
    end
    local parts = {"{"}
    for _, conn in ipairs(connections) do
      if tostring(conn.kind or "") == "audio" then
        local from = type(conn.from) == "table" and conn.from or {}
        local to = type(conn.to) == "table" and conn.to or {}
        local meta = type(conn.meta) == "table" and conn.meta or {}
        local metaParts = {}
        for _, key in ipairs({ "route", "source" }) do
          if meta[key] ~= nil then
            metaParts[#metaParts + 1] = string.format("%s=%q", key, tostring(meta[key]))
          end
        end
        if meta.visualOnly ~= nil then
          metaParts[#metaParts + 1] = string.format("visualOnly=%s", meta.visualOnly and "true" or "false")
        end
        if meta.pending ~= nil then
          metaParts[#metaParts + 1] = string.format("pending=%s", meta.pending and "true" or "false")
        end
        local metaText = (#metaParts > 0) and (", meta={ " .. table.concat(metaParts, ", ") .. " }") or ""
        parts[#parts + 1] = string.format(
          "  { id=%q, kind=%q, from={ moduleId=%q, portId=%q }, to={ moduleId=%q, portId=%q }%s },",
          tostring(conn.id or ""),
          tostring(conn.kind or "audio"),
          tostring(from.moduleId or ""),
          tostring(from.portId or ""),
          tostring(to.moduleId or ""),
          tostring(to.portId or ""),
          metaText
        )
      end
    end
    parts[#parts + 1] = "}"
    return table.concat(parts, "\n")
  end

  local lines = {
    "return {",
    string.format("  inputDevice = %q,", tostring(state.inputDevice or "")),
    string.format("  keyboardCollapsed = %s,", state.keyboardCollapsed and "true" or "false"),
    string.format("  keyboardKeyCount = %d,", tonumber(state.keyboardKeyCount) or 14),
    string.format("  utilityDockVisible = %s,", state.utilityDockVisible == false and "false" or "true"),
    string.format("  utilityDockMode = %q,", tostring(state.utilityDockMode or "full_keyboard")),
    string.format("  utilityDockHeightMode = %q,", tostring(state.utilityDockHeightMode or (state.keyboardCollapsed and "collapsed" or "full"))),
    string.format("  rackViewMode = %q,", tostring(rackState.viewMode or "perf")),
    string.format("  rackDensityMode = %q,", tostring(rackState.densityMode or "normal")),
    "  rackNodes = " .. serializeNodes(rackState.modules) .. ",",
    "  rackConnections = " .. serializeConnections(state.rackConnections) .. ",",
    string.format("  waveform = %d,", tonumber(state.waveform) or 1),
    string.format("  filterType = %d,", tonumber(state.filterType) or 0),
    string.format("  cutoff = %.2f,", tonumber(state.cutoff) or 3200),
    string.format("  resonance = %.3f,", tonumber(state.resonance) or 0.75),
    string.format("  drive = %.2f,", tonumber(state.drive) or 0.0),
    string.format("  driveShape = %d,", tonumber(state.driveShape) or 0),
    string.format("  driveBias = %.3f,", tonumber(state.driveBias) or 0.0),
    string.format("  output = %.3f,", tonumber(state.output) or 0.8),
    string.format("  attack = %.4f,", tonumber(state.attack) or 0.05),
    string.format("  decay = %.4f,", tonumber(state.decay) or 0.2),
    string.format("  sustain = %.3f,", tonumber(state.sustain) or 0.7),
    string.format("  release = %.4f,", tonumber(state.release) or 0.4),
    string.format("  fx1Type = %d,", tonumber(state.fx1Type) or 0),
    string.format("  fx1Mix = %.3f,", tonumber(state.fx1Mix) or 0.0),
    string.format("  fx2Type = %d,", tonumber(state.fx2Type) or 0),
    string.format("  fx2Mix = %.3f,", tonumber(state.fx2Mix) or 0.0),
    string.format("  oscMode = %d,", tonumber(state.oscMode) or 0),
    string.format("  sampleSource = %d,", tonumber(state.sampleSource) or 0),
    string.format("  sampleCaptureBars = %.4f,", tonumber(state.sampleCaptureBars) or 1.0),
    string.format("  samplePitchMapEnabled = %s,", state.samplePitchMapEnabled and "true" or "false"),
    string.format("  samplePitchMode = %d,", tonumber(state.samplePitchMode) or 0),
    string.format("  sampleRootNote = %.2f,", tonumber(state.sampleRootNote) or 60.0),
    string.format("  samplePlayStart = %.4f,", tonumber(state.samplePlayStart) or 0.0),
    string.format("  sampleLoopStart = %.4f,", tonumber(state.sampleLoopStart) or 0.0),
    string.format("  sampleLoopLen = %.4f,", tonumber(state.sampleLoopLen) or 1.0),
    string.format("  sampleRetrigger = %d,", tonumber(state.sampleRetrigger) or 1),
    string.format("  blendMode = %d,", tonumber(state.blendMode) or 0),
    string.format("  blendAmount = %.3f,", tonumber(state.blendAmount) or 0.5),
    string.format("  waveToSample = %.3f,", tonumber(state.waveToSample) or 0.5),
    string.format("  sampleToWave = %.3f,", tonumber(state.sampleToWave) or 0.0),
    string.format("  blendKeyTrack = %d,", tonumber(state.blendKeyTrack) or 2),
    string.format("  blendSamplePitch = %.2f,", tonumber(state.blendSamplePitch) or 0.0),
    string.format("  blendModAmount = %.3f,", tonumber(state.blendModAmount) or 0.5),
    string.format("  envFollow = %.3f,", tonumber(state.envFollow) or 1.0),
    string.format("  addFlavor = %d,", tonumber(state.addFlavor) or 0),
    string.format("  xorBehavior = %d,", tonumber(state.xorBehavior) or 0),
    string.format("  delayMix = %.3f,", tonumber(state.delayMix) or 0.0),
    string.format("  delayTime = %d,", tonumber(state.delayTime) or 220),
    string.format("  delayFeedback = %.3f,", tonumber(state.delayFeedback) or 0.24),
    string.format("  reverbWet = %.3f,", tonumber(state.reverbWet) or 0.0),
    string.format("  pulseWidth = %.2f,", tonumber(state.pulseWidth) or 0.5),
    string.format("  unison = %d,", tonumber(state.unison) or 1),
    string.format("  detune = %.1f,", tonumber(state.detune) or 0.0),
    string.format("  spread = %.2f,", tonumber(state.spread) or 0.0),
    string.format("  oscRenderMode = %d,", tonumber(state.oscRenderMode) or 0),
    string.format("  additivePartials = %d,", tonumber(state.additivePartials) or 8),
    string.format("  additiveTilt = %.3f,", tonumber(state.additiveTilt) or 0.0),
    string.format("  additiveDrift = %.3f,", tonumber(state.additiveDrift) or 0.0),
    "}",
  }

  return deps.writeTextFile(path, table.concat(lines, "\n"))
end

function M.ensureUtilityDockState(ctx)
  local existing = ctx._utilityDock or {}
  ctx._utilityDock = {
    visible = existing.visible ~= false,
    mode = type(existing.mode) == "string" and existing.mode ~= "" and existing.mode or "keyboard",
    heightMode = type(existing.heightMode) == "string" and existing.heightMode or "full",
    layoutMode = type(existing.layoutMode) == "string" and existing.layoutMode or "single",
    primary = type(existing.primary) == "table" and existing.primary or {kind="keyboard",variant="full"},
    secondary = type(existing.secondary) == "table" and existing.secondary or nil,
  }
  _G.__midiSynthUtilityDock = ctx._utilityDock
  return ctx._utilityDock
end

function M.getUtilityDockState(ctx)
  return M.ensureUtilityDockState(ctx)
end

function M.setUtilityDockMode(ctx, modeKey)
  local dock = M.ensureUtilityDockState(ctx)
  dock.visible = true
  dock.mode = "keyboard"
  dock.layoutMode = "split"
  dock.primary = dock.primary or { kind = "keyboard", variant = "full" }
  dock.primary.kind = "keyboard"
  dock.secondary = { kind = "utility", variant = "compact" }

  local normalizedMode = modeKey == "compact" and "compact_split" or modeKey
  if normalizedMode == "compact_collapsed" then
    dock.heightMode = "collapsed"
    dock.primary.variant = "compact"
    ctx._keyboardCollapsed = true
  elseif normalizedMode == "compact_split" then
    dock.heightMode = "compact"
    dock.primary.variant = "compact"
    ctx._keyboardCollapsed = false
  else
    dock.heightMode = "full"
    dock.primary.variant = "full"
    ctx._keyboardCollapsed = false
  end

  if ctx._rackState then
    ctx._rackState.utilityDock = dock
  end
  ctx._dockMode = normalizedMode
  if type(deps.syncKeyboardCollapseButton) == "function" then
    deps.syncKeyboardCollapseButton(ctx)
  end
  if deps.MidiParamRack and deps.MidiParamRack.invalidate then
    deps.MidiParamRack.invalidate(ctx)
  end
  if ctx._lastW and ctx._lastH and type(deps.refreshManagedLayoutState) == "function" then
    deps.refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
  end
end

function M.persistDockUiState(ctx)
  if type(deps.persistMidiInputSelection) == "function" then
    deps.persistMidiInputSelection(ctx._selectedMidiInputIdx and ctx._selectedMidiInputIdx > 1 and ctx._selectedMidiInputLabel or "")
  end
  local state = M.loadRuntimeState()
  local dock = M.ensureUtilityDockState(ctx)
  state.keyboardCollapsed = ctx._keyboardCollapsed == true
  state.utilityDockVisible = dock.visible ~= false
  state.utilityDockMode = dock.mode or "keyboard"
  state.utilityDockHeightMode = dock.heightMode or (ctx._keyboardCollapsed and "collapsed" or "full")
  M.saveRuntimeState(state)
end

function M.saveCurrentState(ctx)
  local dock = M.ensureUtilityDockState(ctx)
  local defaultRackState = deps.MidiSynthRackSpecs.defaultRackState()
  local rackState = ctx._rackState or {
    viewMode = defaultRackState.viewMode,
    densityMode = defaultRackState.densityMode,
    utilityDock = dock,
    modules = deps.RackLayout.cloneRackModules(defaultRackState.modules),
  }
  if #(rackState.modules or {}) == 0 then
    rackState.modules = deps.RackLayout.cloneRackModules(defaultRackState.modules)
  end
  rackState.utilityDock = {
    visible = dock.visible ~= false,
    mode = dock.mode or "keyboard",
    heightMode = dock.heightMode or (ctx._keyboardCollapsed and "collapsed" or (ctx._dockMode == "compact_split" and "compact" or "full")),
    layoutMode = "split",
    primary = { kind = "keyboard", variant = (ctx._dockMode == "full") and "full" or "compact" },
    secondary = { kind = "utility", variant = "compact" },
  }
  local state = {
    inputDevice = ctx._selectedMidiInputLabel or "",
    keyboardCollapsed = ctx._keyboardCollapsed == true,
    keyboardKeyCount = ctx._keyboardKeyCount or 14,
    utilityDockVisible = dock.visible ~= false,
    utilityDockMode = dock.mode or "full_keyboard",
    utilityDockHeightMode = dock.heightMode or (ctx._keyboardCollapsed and "collapsed" or (ctx._dockMode == "compact_split" and "compact" or "full")),
    rackViewMode = rackState.viewMode,
    rackDensityMode = rackState.densityMode,
    rackNodes = deps.RackLayout.cloneRackModules(rackState.modules),
    rackState = rackState,
    waveform = deps.round(deps.readParam(deps.PATHS.waveform, 1)),
    filterType = deps.round(deps.readParam(deps.PATHS.filterType, 0)),
    cutoff = deps.readParam(deps.PATHS.cutoff, 3200),
    resonance = deps.readParam(deps.PATHS.resonance, 0.75),
    drive = deps.readParam(deps.PATHS.drive, 0.0),
    driveShape = deps.round(deps.readParam(deps.PATHS.driveShape, 0)),
    driveBias = deps.readParam(deps.PATHS.driveBias, 0.0),
    output = deps.readParam(deps.PATHS.output, 0.8),
    attack = deps.readParam(deps.PATHS.attack, 0.05),
    decay = deps.readParam(deps.PATHS.decay, 0.2),
    sustain = deps.readParam(deps.PATHS.sustain, 0.7),
    release = deps.readParam(deps.PATHS.release, 0.4),
    fx1Type = deps.round(deps.readParam(deps.PATHS.fx1Type, 0)),
    fx1Mix = deps.readParam(deps.PATHS.fx1Mix, 0.0),
    fx2Type = deps.round(deps.readParam(deps.PATHS.fx2Type, 0)),
    fx2Mix = deps.readParam(deps.PATHS.fx2Mix, 0.0),
    oscMode = deps.round(deps.readParam(deps.PATHS.oscMode, 0)),
    sampleSource = deps.round(deps.readParam(deps.PATHS.sampleSource, 0)),
    sampleCaptureBars = deps.readParam(deps.PATHS.sampleCaptureBars, 1.0),
    samplePitchMapEnabled = (deps.readParam(deps.PATHS.samplePitchMapEnabled, 0.0) or 0.0) > 0.5,
    samplePitchMode = deps.round(deps.readParam(deps.PATHS.samplePitchMode, 0)),
    sampleRootNote = deps.readParam(deps.PATHS.sampleRootNote, 60.0),
    samplePlayStart = deps.readParam(deps.PATHS.samplePlayStart, 0.0),
    sampleLoopStart = deps.readParam(deps.PATHS.sampleLoopStart, 0.0),
    sampleLoopLen = deps.readParam(deps.PATHS.sampleLoopLen, 1.0),
    sampleRetrigger = deps.round(deps.readParam(deps.PATHS.sampleRetrigger, 1)),
    blendMode = deps.round(deps.readParam(deps.PATHS.blendMode, 0)),
    blendAmount = deps.readParam(deps.PATHS.blendAmount, 0.5),
    waveToSample = deps.readParam(deps.PATHS.waveToSample, 0.5),
    sampleToWave = deps.readParam(deps.PATHS.sampleToWave, 0.0),
    blendKeyTrack = deps.round(deps.readParam(deps.PATHS.blendKeyTrack, 2)),
    blendSamplePitch = deps.readParam(deps.PATHS.blendSamplePitch, 0.0),
    blendModAmount = deps.readParam(deps.PATHS.blendModAmount, 0.5),
    envFollow = deps.readParam(deps.PATHS.envFollow, 1.0),
    addFlavor = deps.round(deps.readParam(deps.PATHS.addFlavor, 0)),
    xorBehavior = deps.round(deps.readParam(deps.PATHS.xorBehavior, 0)),
    delayMix = deps.readParam(deps.PATHS.delayMix, 0.0),
    delayTime = deps.round(deps.readParam(deps.PATHS.delayTimeL, 220)),
    delayFeedback = deps.readParam(deps.PATHS.delayFeedback, 0.24),
    reverbWet = deps.readParam(deps.PATHS.reverbWet, 0.0),
    eqOutput = deps.readParam(deps.PATHS.eqOutput, 0.0),
    eqMix = deps.readParam(deps.PATHS.eqMix, 1.0),
    pulseWidth = deps.readParam(deps.PATHS.pulseWidth, 0.5),
    unison = deps.round(deps.readParam(deps.PATHS.unison, 1)),
    detune = deps.readParam(deps.PATHS.detune, 0.0),
    spread = deps.readParam(deps.PATHS.spread, 0.0),
    oscRenderMode = deps.round(deps.readParam(deps.PATHS.oscRenderMode, 0)),
    additivePartials = deps.round(deps.readParam(deps.PATHS.additivePartials, 8)),
    additiveTilt = deps.readParam(deps.PATHS.additiveTilt, 0.0),
    additiveDrift = deps.readParam(deps.PATHS.additiveDrift, 0.0),
  }
  for i = 1, 8 do
    state["eqBandEnabled" .. i] = deps.round(deps.readParam(deps.eq8BandEnabledPath(i), 0))
    state["eqBandType" .. i] = deps.round(deps.readParam(deps.eq8BandTypePath(i), i == 1 and 1 or (i == 8 and 2 or 0)))
    state["eqBandFreq" .. i] = deps.readParam(deps.eq8BandFreqPath(i), EQ_FREQ_DEFAULTS[i])
    state["eqBandGain" .. i] = deps.readParam(deps.eq8BandGainPath(i), 0.0)
    state["eqBandQ" .. i] = deps.readParam(deps.eq8BandQPath(i), (i == 1 or i == 8) and 0.8 or 1.0)
  end

  if M.saveRuntimeState(state) then
    ctx._lastEvent = "State saved"
  else
    ctx._lastEvent = "Save failed"
  end
end

local function cloneConnectionList(connections)
  local out = {}
  local source = type(connections) == "table" and connections or {}
  for i = 1, #source do
    local conn = source[i]
    if tostring(conn and conn.kind or "") == "audio" then
      out[#out + 1] = deps.RackLayout.makeRackConnection(conn)
    end
  end
  return out
end

function M.loadSavedState(ctx)
  local state = M.loadRuntimeState()
  if not state or not next(state) then
    deps.applyRackConnectionState(ctx, "load-default")
    ctx._lastEvent = "No saved state"
    return
  end

  local defaultRackState = deps.MidiSynthRackSpecs.defaultRackState()
  local restoredRackState = nil

  if state.rackState and type(state.rackState) == "table" then
    local rs = state.rackState
    if rs.modules and #rs.modules > 0 then
      restoredRackState = {
        viewMode = rs.viewMode or state.rackViewMode or defaultRackState.viewMode,
        densityMode = rs.densityMode or state.rackDensityMode or defaultRackState.densityMode,
        utilityDock = rs.utilityDock or {
          visible = state.utilityDockVisible,
          mode = state.utilityDockMode,
          heightMode = state.utilityDockHeightMode,
        },
        modules = deps.RackLayout.cloneRackModules(rs.modules),
      }
    end
  end

  if not restoredRackState then
    local rackNodes = state.rackNodes
    if rackNodes and #rackNodes > 0 then
      restoredRackState = {
        viewMode = state.rackViewMode or defaultRackState.viewMode,
        densityMode = state.rackDensityMode or defaultRackState.densityMode,
        utilityDock = {
          visible = state.utilityDockVisible,
          mode = state.utilityDockMode,
          heightMode = state.utilityDockHeightMode,
        },
        modules = deps.RackLayout.cloneRackModules(rackNodes),
      }
    end
  end

  if not restoredRackState then
    restoredRackState = {
      viewMode = state.rackViewMode or defaultRackState.viewMode,
      densityMode = state.rackDensityMode or defaultRackState.densityMode,
      utilityDock = {
        visible = state.utilityDockVisible,
        mode = state.utilityDockMode,
        heightMode = state.utilityDockHeightMode,
      },
      modules = deps.RackLayout.cloneRackModules(defaultRackState.modules),
    }
  end
  ctx._rackState = restoredRackState
  ctx._rackModuleSpecs = deps.MidiSynthRackSpecs.rackModuleSpecById()
  ctx._dynamicModuleSlots = deps.RackModuleFactory.ensureDynamicModuleSlots(ctx)
  if host and type(host._rebuildDynamicRackModuleState) == "function" then
    host._rebuildDynamicRackModuleState(ctx)
  end
  local restoredConnections = deps.MidiSynthRackSpecs.defaultConnections(restoredRackState.modules)
  ctx._rackConnections = deps.MidiSynthRackSpecs.normalizeConnections(restoredConnections, restoredRackState.modules)
  ctx._utilityDock = restoredRackState.utilityDock
  _G.__midiSynthRackState = ctx._rackState
  _G.__midiSynthRackModuleSpecs = ctx._rackModuleSpecs
  _G.__midiSynthRackConnections = ctx._rackConnections
  _G.__midiSynthUtilityDock = ctx._utilityDock

  local dock = M.ensureUtilityDockState(ctx)
  local hasExplicitDockState = false
  if state.utilityDockVisible ~= nil then
    dock.visible = state.utilityDockVisible == true
    hasExplicitDockState = true
  end
  if type(state.utilityDockMode) == "string" and state.utilityDockMode ~= "" then
    dock.mode = state.utilityDockMode
    hasExplicitDockState = true
  end
  if type(state.utilityDockHeightMode) == "string" and state.utilityDockHeightMode ~= "" then
    dock.heightMode = state.utilityDockHeightMode
    hasExplicitDockState = true
  elseif state.keyboardCollapsed ~= nil then
    dock.heightMode = state.keyboardCollapsed == true and "collapsed" or "full"
  end
  if type(deps.syncKeyboardCollapsedFromUtilityDock) == "function" then
    deps.syncKeyboardCollapsedFromUtilityDock(ctx)
  end

  if not ((ctx.widgets or {}).dockModeTabs or (ctx.widgets or {}).dockModeDots) then
    if dock.heightMode == "compact" then
      dock.heightMode = "full"
      if dock.primary and dock.primary.kind == "keyboard" then
        dock.primary.variant = "full"
      end
      ctx._utilityDock = {visible=true,mode="keyboard",heightMode="full",layoutMode="single",primary={kind="keyboard",variant="full"}}
      if ctx._rackState then
        ctx._rackState.utilityDock = ctx._utilityDock
      end
      _G.__midiSynthUtilityDock = ctx._utilityDock
      _G.__midiSynthRackState = ctx._rackState
    end
  end

  if state.keyboardCollapsed ~= nil and not hasExplicitDockState and type(deps.setKeyboardCollapsed) == "function" then
    deps.setKeyboardCollapsed(ctx, state.keyboardCollapsed == true)
  end
  if state.keyboardKeyCount then
    ctx._keyboardKeyCount = state.keyboardKeyCount
  end

  local setPath = deps.setPath
  local PATHS = deps.PATHS
  if state.waveform then setPath(PATHS.waveform, state.waveform) end
  if state.cutoff then setPath(PATHS.cutoff, state.cutoff) end
  if state.resonance then setPath(PATHS.resonance, state.resonance) end
  if state.drive then setPath(PATHS.drive, state.drive) end
  if state.output then setPath(PATHS.output, state.output) end
  if state.attack then setPath(PATHS.attack, state.attack) end
  if state.decay then setPath(PATHS.decay, state.decay) end
  if state.sustain then setPath(PATHS.sustain, state.sustain) end
  if state.release then setPath(PATHS.release, state.release) end
  if state.chorusMix then setPath(PATHS.chorusMix, state.chorusMix) end
  if state.delayMix then setPath(PATHS.delayMix, state.delayMix) end
  if state.delayTime then
    setPath(PATHS.delayTimeL, state.delayTime)
    setPath(PATHS.delayTimeR, state.delayTime * 1.5)
  end
  if state.delayFeedback then setPath(PATHS.delayFeedback, state.delayFeedback) end
  if state.reverbWet then setPath(PATHS.reverbWet, state.reverbWet) end
  if state.eqOutput ~= nil then setPath(PATHS.eqOutput, state.eqOutput) end
  if state.eqMix ~= nil then setPath(PATHS.eqMix, state.eqMix) end
  for i = 1, 8 do
    if state["eqBandEnabled" .. i] ~= nil then setPath(deps.eq8BandEnabledPath(i), state["eqBandEnabled" .. i]) end
    if state["eqBandType" .. i] ~= nil then setPath(deps.eq8BandTypePath(i), state["eqBandType" .. i]) end
    if state["eqBandFreq" .. i] ~= nil then setPath(deps.eq8BandFreqPath(i), state["eqBandFreq" .. i]) end
    if state["eqBandGain" .. i] ~= nil then setPath(deps.eq8BandGainPath(i), state["eqBandGain" .. i]) end
    if state["eqBandQ" .. i] ~= nil then setPath(deps.eq8BandQPath(i), state["eqBandQ" .. i]) end
  end
  if state.filterType then setPath(PATHS.filterType, state.filterType) end
  if state.fx1Type then setPath(PATHS.fx1Type, state.fx1Type) end
  if state.fx1Mix then setPath(PATHS.fx1Mix, state.fx1Mix) end
  if state.fx2Type then setPath(PATHS.fx2Type, state.fx2Type) end
  if state.fx2Mix then setPath(PATHS.fx2Mix, state.fx2Mix) end
  if state.oscMode ~= nil then setPath(PATHS.oscMode, state.oscMode) end
  if state.sampleSource ~= nil then setPath(PATHS.sampleSource, state.sampleSource) end
  if state.sampleCaptureBars ~= nil then setPath(PATHS.sampleCaptureBars, state.sampleCaptureBars) end
  if state.samplePitchMapEnabled ~= nil then setPath(PATHS.samplePitchMapEnabled, state.samplePitchMapEnabled and 1 or 0) end
  if state.samplePitchMode ~= nil then setPath(PATHS.samplePitchMode, state.samplePitchMode) end
  if state.sampleRootNote ~= nil then setPath(PATHS.sampleRootNote, state.sampleRootNote) end
  if state.samplePlayStart ~= nil then setPath(PATHS.samplePlayStart, state.samplePlayStart) end
  if state.sampleLoopStart ~= nil then setPath(PATHS.sampleLoopStart, state.sampleLoopStart) end
  if state.sampleLoopLen ~= nil then setPath(PATHS.sampleLoopLen, state.sampleLoopLen) end
  if state.sampleRetrigger ~= nil then setPath(PATHS.sampleRetrigger, state.sampleRetrigger) end
  if state.blendMode ~= nil then setPath(PATHS.blendMode, state.blendMode) end
  if state.blendAmount ~= nil then setPath(PATHS.blendAmount, state.blendAmount) end
  if state.waveToSample ~= nil then setPath(PATHS.waveToSample, state.waveToSample) end
  if state.sampleToWave ~= nil then setPath(PATHS.sampleToWave, state.sampleToWave) end
  if state.blendKeyTrack ~= nil then setPath(PATHS.blendKeyTrack, state.blendKeyTrack) end
  if state.blendSamplePitch ~= nil then setPath(PATHS.blendSamplePitch, state.blendSamplePitch) end
  if state.blendModAmount ~= nil then setPath(PATHS.blendModAmount, state.blendModAmount) end
  if state.envFollow ~= nil then setPath(PATHS.envFollow, state.envFollow) end
  if state.addFlavor ~= nil then setPath(PATHS.addFlavor, state.addFlavor) end
  if state.xorBehavior ~= nil then setPath(PATHS.xorBehavior, state.xorBehavior) end
  if state.pulseWidth ~= nil then setPath(PATHS.pulseWidth, state.pulseWidth) end
  if state.unison ~= nil then setPath(PATHS.unison, state.unison) end
  if state.detune ~= nil then setPath(PATHS.detune, state.detune) end
  if state.spread ~= nil then setPath(PATHS.spread, state.spread) end
  if state.oscRenderMode ~= nil then setPath(PATHS.oscRenderMode, state.oscRenderMode) end
  if state.additivePartials ~= nil then setPath(PATHS.additivePartials, state.additivePartials) end
  if state.additiveTilt ~= nil then setPath(PATHS.additiveTilt, state.additiveTilt) end
  if state.additiveDrift ~= nil then setPath(PATHS.additiveDrift, state.additiveDrift) end
  if state.driveShape ~= nil then setPath(PATHS.driveShape, state.driveShape) end
  if state.driveBias ~= nil then setPath(PATHS.driveBias, state.driveBias) end

  ctx._adsr.attack = state.attack or 0.05
  ctx._adsr.decay = state.decay or 0.2
  ctx._adsr.sustain = state.sustain or 0.7
  ctx._adsr.release = state.release or 0.4

  deps.applyRackConnectionState(ctx, "load-state")
  ctx._lastEvent = "State loaded"
end

function M.resetToDefaults(ctx)
  local setPath = deps.setPath
  local PATHS = deps.PATHS
  setPath(PATHS.waveform, 1)
  setPath(PATHS.filterType, 0)
  setPath(PATHS.cutoff, 3200)
  setPath(PATHS.resonance, 0.75)
  setPath(PATHS.drive, 0.0)
  setPath(PATHS.output, 0.8)
  setPath(PATHS.attack, 0.05)
  setPath(PATHS.decay, 0.2)
  setPath(PATHS.sustain, 0.7)
  setPath(PATHS.release, 0.4)
  setPath(PATHS.fx1Type, 0)
  setPath(PATHS.fx1Mix, 0.0)
  setPath(PATHS.fx2Type, 0)
  setPath(PATHS.fx2Mix, 0.0)
  setPath(PATHS.oscMode, 0)
  setPath(PATHS.sampleSource, 0)
  setPath(PATHS.sampleCaptureBars, 1.0)
  setPath(PATHS.samplePitchMapEnabled, 0.0)
  setPath(PATHS.samplePitchMode, 0.0)
  setPath(PATHS.sampleRootNote, 60.0)
  setPath(PATHS.samplePlayStart, 0.0)
  setPath(PATHS.sampleLoopStart, 0.0)
  setPath(PATHS.sampleLoopLen, 1.0)
  setPath(PATHS.sampleRetrigger, 1.0)
  setPath(PATHS.blendMode, 0)
  setPath(PATHS.blendAmount, 0.5)
  setPath(PATHS.waveToSample, 0.5)
  setPath(PATHS.sampleToWave, 0.0)
  setPath(PATHS.blendKeyTrack, 2.0)
  setPath(PATHS.blendSamplePitch, 0.0)
  setPath(PATHS.blendModAmount, 0.5)
  setPath(PATHS.envFollow, 1.0)
  setPath(PATHS.addFlavor, 0.0)
  setPath(PATHS.xorBehavior, 0.0)
  for i = 0, deps.MAX_FX_PARAMS - 1 do
    setPath(deps.fxParamPath(1, i + 1), 0.5)
    setPath(deps.fxParamPath(2, i + 1), 0.5)
  end
  setPath(PATHS.delayMix, 0.0)
  setPath(PATHS.delayTimeL, 220)
  setPath(PATHS.delayTimeR, 330)
  setPath(PATHS.delayFeedback, 0.24)
  setPath(PATHS.reverbWet, 0.0)
  setPath(PATHS.eqOutput, 0.0)
  setPath(PATHS.eqMix, 1.0)
  setPath(PATHS.pulseWidth, 0.5)
  setPath(PATHS.unison, 1)
  setPath(PATHS.detune, 0.0)
  setPath(PATHS.spread, 0.0)
  setPath(PATHS.oscRenderMode, 0)
  setPath(PATHS.additivePartials, 8)
  setPath(PATHS.additiveTilt, 0.0)
  setPath(PATHS.additiveDrift, 0.0)
  setPath(PATHS.driveShape, 0)
  setPath(PATHS.driveBias, 0.0)
  for i = 1, 8 do
    setPath(deps.eq8BandEnabledPath(i), 0)
    setPath(deps.eq8BandTypePath(i), i == 1 and 1 or (i == 8 and 2 or 0))
    setPath(deps.eq8BandFreqPath(i), EQ_FREQ_DEFAULTS[i])
    setPath(deps.eq8BandGainPath(i), 0.0)
    setPath(deps.eq8BandQPath(i), (i == 1 or i == 8) and 0.8 or 1.0)
  end

  ctx._adsr = { attack = 0.05, decay = 0.2, sustain = 0.7, release = 0.4 }
  ctx._keyboardOctave = 3
  ctx._rackConnections = deps.MidiSynthRackSpecs.defaultConnections(ctx._rackState and ctx._rackState.modules)
  deps.applyRackConnectionState(ctx, "reset")
  if type(deps.setKeyboardCollapsed) == "function" then
    deps.setKeyboardCollapsed(ctx, false)
  end
  ctx._lastEvent = "Reset to defaults"
end

function M.attach(midiSynth)
  host = midiSynth
  midiSynth.runtimeStatePath = M.runtimeStatePath
  midiSynth.loadRuntimeState = M.loadRuntimeState
  midiSynth.saveRuntimeState = M.saveRuntimeState
  midiSynth.ensureUtilityDockState = M.ensureUtilityDockState
  midiSynth.getUtilityDockState = M.getUtilityDockState
  midiSynth.setUtilityDockMode = M.setUtilityDockMode
  midiSynth.persistDockUiState = M.persistDockUiState
  midiSynth.saveCurrentState = M.saveCurrentState
  midiSynth.loadSavedState = M.loadSavedState
  midiSynth.resetToDefaults = M.resetToDefaults
end

function M.init(options)
  options = options or {}
  deps.projectRoot = options.projectRoot
  deps.readTextFile = options.readTextFile
  deps.writeTextFile = options.writeTextFile
  deps.setPath = options.setPath
  deps.readParam = options.readParam
  deps.round = options.round or function(v) return math.floor((tonumber(v) or 0) + 0.5) end
  deps.MidiSynthRackSpecs = options.MidiSynthRackSpecs or require("behaviors.rack_midisynth_specs")
  deps.RackLayout = options.RackLayout or require("behaviors.rack_layout")
  deps.RackModuleFactory = options.RackModuleFactory or require("ui.rack_module_factory")
  deps.PATHS = options.PATHS
  deps.MAX_FX_PARAMS = options.MAX_FX_PARAMS or 8
  deps.fxParamPath = options.fxParamPath
  deps.eq8BandEnabledPath = options.eq8BandEnabledPath
  deps.eq8BandTypePath = options.eq8BandTypePath
  deps.eq8BandFreqPath = options.eq8BandFreqPath
  deps.eq8BandGainPath = options.eq8BandGainPath
  deps.eq8BandQPath = options.eq8BandQPath
  deps.syncKeyboardCollapsedFromUtilityDock = options.syncKeyboardCollapsedFromUtilityDock
  deps.setKeyboardCollapsed = options.setKeyboardCollapsed
  deps.applyRackConnectionState = options.applyRackConnectionState
  deps.syncKeyboardCollapseButton = options.syncKeyboardCollapseButton
  deps.refreshManagedLayoutState = options.refreshManagedLayoutState
  deps.MidiParamRack = options.MidiParamRack
  deps.persistMidiInputSelection = options.persistMidiInputSelection
end

return M
