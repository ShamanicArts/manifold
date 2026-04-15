local RackLayout = require("behaviors.rack_layout")
local MidiSynthRackSpecs = require("behaviors.rack_midisynth_specs")
local RackWireLayer = require("behaviors.rack_wire_layer")
local KeyboardInput = require("behaviors.keyboard_input")
local VoiceManager = require("behaviors.voice_manager")
local FxDefs = require("fx_definitions")
local ScopedWidget = require("ui.scoped_widget")
local WidgetSync = require("ui.widget_sync")
local MidiDevices = require("ui.midi_devices")
local RackLayoutManager = require("ui.rack_layout_manager")
local InitBindings = require("ui.init_bindings")
local InitControls = require("ui.init_controls")
local PatchbayRuntime = require("ui.patchbay_runtime")
local RackModPopover = require("ui.rack_mod_popover")
local ParameterBinder = require("parameter_binder")
local ModEndpointRegistry = require("modulation.endpoint_registry")
local ModRouteCompiler = require("modulation.route_compiler")
local ModRuntime = require("modulation.runtime")
local RackControlRouter = require("modulation.rack_control_router")
local MidiParamRack = require("ui.midi_param_rack")
local RackModuleFactory = require("ui.rack_module_factory")
local RackLayoutEngine = require("behaviors.rack_layout_engine")
local StateManager = require("behaviors.state_manager")
local PatchbayBinding = require("behaviors.patchbay_binding")

local M = {}
require("behaviors.palette_browser").attach(M)
require("behaviors.voice_manager").attach(M)
local ModulationRouter = require("behaviors.modulation_router")
require("behaviors.modulation_router").attach(M)
require("behaviors.dynamic_module_binding").attach(M)
require("behaviors.rack_mutation_runtime").attach(M)
require("behaviors.rack_layout_engine").attach(M)
require("behaviors.state_manager").attach(M)
require("behaviors.patchbay_binding").attach(M)

local resolveGlobalPrefix = ScopedWidget.resolveGlobalPrefix
local endsWith = ScopedWidget.endsWith
local getScopedWidget = ScopedWidget.getScopedWidget
local getScopedBehavior = ScopedWidget.getScopedBehavior
local setWidgetValueSilently = ScopedWidget.setWidgetValueSilently

local VOICE_COUNT = 8
local WAVE_OPTIONS = { "Sine", "Saw", "Square", "Triangle", "Blend", "Noise", "Pulse", "SuperSaw" }
local OSC_MODE_OPTIONS = { "Classic", "Sample Loop", "Blend" }
local BLEND_MODE_OPTIONS = { "Mix", "Ring", "FM", "Sync", "Add", "Morph" }
local DRIVE_SHAPE_OPTIONS = { "Soft", "Hard", "Clip", "Fold" }
local SAMPLE_SOURCE_OPTIONS = { "Live", "Layer 1", "Layer 2", "Layer 3", "Layer 4" }
local WAVE_NAMES = {
  [0] = "Sine",
  [1] = "Saw",
  [2] = "Square",
  [3] = "Triangle",
  [4] = "Blend",
  [5] = "Noise",
  [6] = "Pulse",
  [7] = "SuperSaw",
}

local function sanitizeBlendMode(value)
  local mode = math.floor((tonumber(value) or 0) + 0.5)
  if mode < 0 or mode >= #BLEND_MODE_OPTIONS then
    return 0
  end
  return mode
end

local FILTER_OPTIONS = { "SVF Lowpass", "SVF Bandpass", "SVF Highpass", "SVF Notch" }
local AUX_AUDIO_SOURCE_CODES = ParameterBinder.AUX_AUDIO_SOURCE_CODES or {}

local PATHS = {
  waveform = "/midi/synth/waveform",
  filterType = "/midi/synth/filterType",
  cutoff = "/midi/synth/cutoff",
  resonance = "/midi/synth/resonance",
  drive = "/midi/synth/drive",
  driveShape = "/midi/synth/driveShape",
  driveBias = "/midi/synth/driveBias",
  fx1Type = "/midi/synth/fx1/type",
  fx1Mix = "/midi/synth/fx1/mix",
  fx2Type = "/midi/synth/fx2/type",
  fx2Mix = "/midi/synth/fx2/mix",
  delayTimeL = "/midi/synth/delay/timeL",
  delayTimeR = "/midi/synth/delay/timeR",
  delayFeedback = "/midi/synth/delay/feedback",
  delayMix = "/midi/synth/delay/mix",
  reverbWet = "/midi/synth/reverb/wet",
  eqOutput = "/midi/synth/eq8/output",
  eqMix = "/midi/synth/eq8/mix",
  output = "/midi/synth/output",
  attack = "/midi/synth/adsr/attack",
  decay = "/midi/synth/adsr/decay",
  sustain = "/midi/synth/adsr/sustain",
  release = "/midi/synth/adsr/release",
  -- New oscillator parameters
  pulseWidth = "/midi/synth/pulseWidth",
  unison = "/midi/synth/unison",
  detune = "/midi/synth/detune",
  spread = "/midi/synth/spread",
  oscRenderMode = "/midi/synth/osc/renderMode",
  additivePartials = "/midi/synth/osc/add/partials",
  additiveTilt = "/midi/synth/osc/add/tilt",
  additiveDrift = "/midi/synth/osc/add/drift",

  oscMode = "/midi/synth/osc/mode",
  sampleSource = "/midi/synth/sample/source",
  sampleCaptureTrigger = "/midi/synth/sample/captureTrigger",
  sampleCaptureBars = "/midi/synth/sample/captureBars",
  sampleCaptureMode = "/midi/synth/sample/captureMode",
  sampleCaptureWriteOffset = "/midi/synth/sample/captureWriteOffset",
  sampleCaptureStartOffset = "/midi/synth/sample/captureStartOffset",
  sampleCapturedLengthMs = "/midi/synth/sample/capturedLengthMs",
  sampleCaptureRecording = "/midi/synth/sample/captureRecording",
  samplePitchMapEnabled = "/midi/synth/sample/pitchMapEnabled",
  samplePitchMode = "/midi/synth/sample/pitchMode",
  samplePvocFFTOrder = "/midi/synth/sample/pvoc/fftOrder",
  samplePvocTimeStretch = "/midi/synth/sample/pvoc/timeStretch",
  sampleRootNote = "/midi/synth/sample/rootNote",
  sampleLoopStart = "/midi/synth/sample/loopStart",
  sampleLoopLen = "/midi/synth/sample/loopLen",
  samplePlayStart = "/midi/synth/sample/playStart",
  sampleCrossfade = "/midi/synth/sample/crossfade",
  sampleRetrigger = "/midi/synth/sample/retrigger",

  blendMode = "/midi/synth/blend/mode",
  blendAmount = "/midi/synth/blend/amount",
  waveToSample = "/midi/synth/blend/waveToSample",
  sampleToWave = "/midi/synth/blend/sampleToWave",
  blendKeyTrack = "/midi/synth/blend/keyTrack",
  blendSamplePitch = "/midi/synth/blend/samplePitch",
  blendModAmount = "/midi/synth/blend/modAmount",
  envFollow = "/midi/synth/blend/envFollow",
  addFlavor = "/midi/synth/blend/addFlavor",
  xorBehavior = "/midi/synth/blend/xorBehavior",
  morphCurve = "/midi/synth/blend/morphCurve",
  morphConvergence = "/midi/synth/blend/morphConvergence",
  morphPhase = "/midi/synth/blend/morphPhase",
  rackAudioEdgeMask = "/midi/synth/rack/audio/edgeMask",
  rackAudioStageCount = "/midi/synth/rack/stageCount",
  rackAudioOutputEnabled = "/midi/synth/rack/outputEnabled",
  rackAudioSourceCount = "/midi/synth/rack/sourceCount",
  rackRegistryRequestKind = "/midi/synth/rack/registry/requestKind",
  rackRegistryRequestIndex = "/midi/synth/rack/registry/requestIndex",
  rackRegistryRequestNonce = "/midi/synth/rack/registry/requestNonce",
  morphSpeed = "/midi/synth/blend/morphSpeed",
  morphContrast = "/midi/synth/blend/morphContrast",
  morphSmooth = "/midi/synth/blend/morphSmooth",
}

local function auxAudioSourceCodeForEndpoint(moduleId, portId)
  local id = tostring(moduleId or "")
  local pid = tostring(portId or "")
  if id == "oscillator" then
    return AUX_AUDIO_SOURCE_CODES.OSCILLATOR or 1
  end
  if id == "filter" then
    return AUX_AUDIO_SOURCE_CODES.FILTER or 2
  end
  if id == "fx1" then
    return AUX_AUDIO_SOURCE_CODES.FX1 or 3
  end
  if id == "fx2" then
    return AUX_AUDIO_SOURCE_CODES.FX2 or 4
  end
  if id == "eq" then
    return AUX_AUDIO_SOURCE_CODES.EQ or 5
  end

  local info = type(_G) == "table" and _G.__midiSynthDynamicModuleInfo or nil
  local entry = type(info) == "table" and info[id] or nil
  local slotIndex = math.max(1, math.floor(tonumber(type(entry) == "table" and entry.slotIndex or 0) or 1))
  local specId = tostring(type(entry) == "table" and entry.specId or "")

  if specId == "rack_oscillator" then
    return (AUX_AUDIO_SOURCE_CODES.DYNAMIC_OSC_BASE or 100) + slotIndex
  end
  if specId == "rack_sample" then
    return (AUX_AUDIO_SOURCE_CODES.DYNAMIC_SAMPLE_BASE or 200) + slotIndex
  end
  if specId == "blend_simple" then
    if pid == "b" then
      return AUX_AUDIO_SOURCE_CODES.NONE or 0
    end
    return (AUX_AUDIO_SOURCE_CODES.DYNAMIC_BLEND_SIMPLE_BASE or 300) + slotIndex
  end
  if specId == "filter" then
    return (AUX_AUDIO_SOURCE_CODES.DYNAMIC_FILTER_BASE or 400) + slotIndex
  end
  if specId == "fx" then
    return (AUX_AUDIO_SOURCE_CODES.DYNAMIC_FX_BASE or 500) + slotIndex
  end
  if specId == "eq" then
    return (AUX_AUDIO_SOURCE_CODES.DYNAMIC_EQ_BASE or 600) + slotIndex
  end

  return AUX_AUDIO_SOURCE_CODES.NONE or 0
end

local function syncAuxAudioRouteParams(ctx)
  return M.syncAuxAudioRouteParams(ctx)
end

local MAX_FX_PARAMS = 5
local BG_TICK_INTERVAL = 1.0 / 60.0
local BG_TICK_INTERVAL_WHILE_INTERACTING = 1.0 / 30.0
local VOICE_AMP_SEND_EPSILON = 0.0015
local VOICE_AMP_SEND_INTERVAL = 1.0 / 60.0
local OSC_REPAINT_INTERVAL = 1.0 / 60.0
local OSC_REPAINT_INTERVAL_MULTI_VOICE = 1.0 / 30.0
local OSC_REPAINT_INTERVAL_WHILE_INTERACTING = 1.0 / 20.0
local ENV_REPAINT_INTERVAL = 1.0 / 60.0
local ENV_REPAINT_INTERVAL_WHILE_INTERACTING = 1.0 / 30.0

_G.__midiSynthRackWireLayer = RackWireLayer

local activeBehaviorCtx = nil

local function fxParamPath(slot, paramIdx)
  return string.format("/midi/synth/fx%d/p/%d", slot, paramIdx - 1)
end

local function voiceFreqPath(index)
  return string.format("/midi/synth/voice/%d/freq", index)
end

local function voiceAmpPath(index)
  return string.format("/midi/synth/voice/%d/amp", index)
end

local function voiceGatePath(index)
  return string.format("/midi/synth/voice/%d/gate", index)
end

local function eq8BandEnabledPath(index)
  return string.format("/midi/synth/eq8/band/%d/enabled", index)
end

local function eq8BandTypePath(index)
  return string.format("/midi/synth/eq8/band/%d/type", index)
end

local function eq8BandFreqPath(index)
  return string.format("/midi/synth/eq8/band/%d/freq", index)
end

local function eq8BandGainPath(index)
  return string.format("/midi/synth/eq8/band/%d/gain", index)
end

local function eq8BandQPath(index)
  return string.format("/midi/synth/eq8/band/%d/q", index)
end



-- Widget sync functions now in WidgetSync module
local clamp = WidgetSync.clamp
local round = WidgetSync.round
local repaint = WidgetSync.repaint
local syncValue = WidgetSync.syncValue
local syncToggleValue = WidgetSync.syncToggleValue
local syncText = WidgetSync.syncText
local syncColour = WidgetSync.syncColour
local syncSelected = WidgetSync.syncSelected
local syncKnobLabel = WidgetSync.syncKnobLabel

local function getVoiceStackingLabels(activeTab, oscRenderMode, blendMode)
  if activeTab == 1 and oscRenderMode == 1 then
    return "Ensemble", "Width", "Stereo"
  end
  if activeTab == 3 and (blendMode == 4 or blendMode == 5) then
    return "Density", "Diverge", "Stereo"
  end
  return "Unison", "Detune", "Spread"
end

local function setWidgetInteractiveState(widget, enabled)
  if not widget then
    return
  end
  if widget.setEnabled then
    widget:setEnabled(enabled)
  end
  if widget.node and widget.node.setStyle then
    widget.node:setStyle({ opacity = enabled and 1.0 or 0.35 })
  end
  repaint(widget)
end

local function setPath(path, value, meta)
  local numericValue = tonumber(value) or 0
  local writeMeta = type(meta) == "table" and meta or {}
  local currentCtx = activeBehaviorCtx

  local writeSource = tostring(writeMeta.source or "")
  if currentCtx ~= nil and writeSource ~= "modulation_runtime" and writeSource ~= "legacy_keyboard_parity" and writeSource ~= "adsr_rackosc_parity" then
    if currentCtx._rackModRuntime and currentCtx._rackModRuntime.recordAuthoredValue then
      currentCtx._rackModRuntime:recordAuthoredValue(path, numericValue, writeMeta)
    end
    if currentCtx._modRuntime and currentCtx._modRuntime.recordAuthoredValue then
      currentCtx._modRuntime:recordAuthoredValue(path, numericValue, writeMeta)
    end
  end

  if type(setParam) == "function" then
    return setParam(path, numericValue)
  end
  if command then
    command("SET", path, tostring(numericValue))
    return true
  end
  return false
end

local function readParam(path, fallback)
  if type(_G.getParam) == "function" then
    local ok, value = pcall(_G.getParam, path)
    if ok and value ~= nil then
      return value
    end
  end
  return fallback
end

-- Voice utility functions (needed early by applyVoiceModulationTarget)
local function noteToFreq(note)
  return 440.0 * (2.0 ^ (((tonumber(note) or 69.0) - 69.0) / 12.0))
end

local function velocityToAmp(velocity)
  local v = tonumber(velocity) or 0
  return math.max(0, math.min(0.40, 0.03 + (v / 127.0) * 0.37))
end

-- Voice gate route detection (needed by voice_manager)
M._isLegacyOscillatorGateRouteConnected = function(ctx)
  local router = ctx and ctx._rackControlRouter or nil
  if not (router and router.getRoutesForTarget) then
    return false
  end

  local function hasDirectLegacyAdsrSource(targetId)
    local routes = router:getRoutesForTarget(targetId) or {}
    for i = 1, #routes do
      local route = routes[i]
      local sourceId = tostring(
        (route and route.source and route.source.id)
        or (route and route.route and route.route.source)
        or (route and route.compiled and route.compiled.sourceHandle)
        or ""
      )
      if sourceId == "adsr.voice" or sourceId == "adsr.env" or sourceId == "adsr.inv" then
        return true
      end
    end
    return false
  end

  return hasDirectLegacyAdsrSource("oscillator.gate") or hasDirectLegacyAdsrSource("oscillator.voice")
end

M._hasCanonicalOscillatorGateRoute = function(ctx)
  local router = ctx and ctx._rackControlRouter or nil
  if not (router and router.isTargetConnected) then
    return false
  end
  return not not (router:isTargetConnected("oscillator.gate") or router:isTargetConnected("oscillator.voice"))
end

M._hasAnyOscillatorGateRoute = function(ctx)
  local router = ctx and ctx._rackControlRouter or nil
  if not (router and router.isTargetConnected) then
    return false
  end
  if M._hasCanonicalOscillatorGateRoute(ctx) then
    return true
  end

  local info = type(_G) == "table" and _G.__midiSynthDynamicModuleInfo or nil
  if type(info) == "table" then
    for moduleId, entry in pairs(info) do
      if type(entry) == "table" and (tostring(entry.specId or "") == "rack_oscillator" or tostring(entry.specId or "") == "rack_sample") then
        if router:isTargetConnected(tostring(moduleId) .. ".gate") or router:isTargetConnected(tostring(moduleId) .. ".voice") then
          return true
        end
      end
    end
  end
  return false
end

M._dynamicRackOscAdsrGateSlots = function(ctx)
  local out = {}
  local router = ctx and ctx._rackControlRouter or nil
  local info = type(_G) == "table" and _G.__midiSynthDynamicModuleInfo or nil
  if not (router and router.getRoutesForTarget and type(info) == "table") then
    return out
  end

  for moduleId, entry in pairs(info) do
    if type(entry) == "table"
      and (tostring(entry.specId or "") == "rack_oscillator" or tostring(entry.specId or "") == "rack_sample")
      and tonumber(entry.slotIndex) ~= nil then
      local routes = router:getRoutesForTarget(tostring(moduleId) .. ".gate") or {}
      for i = 1, #routes do
        local route = routes[i]
        local sourceId = tostring(route and route.source and route.source.id or route and route.route and route.route.source or "")
        if sourceId == "adsr.env" then
          out[#out + 1] = {
            moduleId = tostring(moduleId),
            slotIndex = math.max(1, math.floor(tonumber(entry.slotIndex) or 1)),
            specId = tostring(entry.specId or ""),
          }
          break
        end
      end
    end
  end

  return out
end

local SAMPLE_LOOP_MIN_LEN = 0.05
local SAMPLE_LOOP_MAX_START = 0.95

local function getSampleLoopWindow()
  local start = clamp(readParam(PATHS.sampleLoopStart, 0.0), 0.0, SAMPLE_LOOP_MAX_START)
  local len = clamp(readParam(PATHS.sampleLoopLen, 1.0), SAMPLE_LOOP_MIN_LEN, 1.0)
  len = math.min(len, math.max(SAMPLE_LOOP_MIN_LEN, 1.0 - start))
  return start, len
end

local function setSampleLoopStartLinked(start)
  local currentStart, currentLen = getSampleLoopWindow()
  local loopEnd = clamp(currentStart + currentLen, SAMPLE_LOOP_MIN_LEN, 1.0)
  local nextStart = clamp(start, 0.0, math.min(SAMPLE_LOOP_MAX_START, loopEnd - SAMPLE_LOOP_MIN_LEN))
  local nextLen = clamp(loopEnd - nextStart, SAMPLE_LOOP_MIN_LEN, 1.0)
  setPath(PATHS.sampleLoopStart, nextStart)
  setPath(PATHS.sampleLoopLen, nextLen)
  return nextStart, nextLen
end

local function setSampleLoopLenLinked(len)
  local currentStart = clamp(readParam(PATHS.sampleLoopStart, 0.0), 0.0, SAMPLE_LOOP_MAX_START)
  local maxLen = math.max(SAMPLE_LOOP_MIN_LEN, 1.0 - currentStart)
  local nextLen = clamp(len, SAMPLE_LOOP_MIN_LEN, maxLen)
  setPath(PATHS.sampleLoopLen, nextLen)
  return currentStart, nextLen
end

local function syncLegacyBlendDirectionFromBlend(blendAmount)
  local blend = clamp(blendAmount, 0.0, 1.0)
  setPath(PATHS.waveToSample, blend)
  setPath(PATHS.sampleToWave, 1.0 - blend)
  return blend, 1.0 - blend
end

local function updateDropdownAnchors(ctx)
  local _ = ctx
  -- Dropdown popup placement is now handled in the widget itself.
  -- Keep this hook as a no-op so older call sites do not explode.
end



local function noteName(note)
  if not note then return "--" end
  local names = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }
  local name = names[(note % 12) + 1] or "?"
  local octave = math.floor(note / 12) - 1
  return name .. octave
end

local function formatMidiNoteValue(value)
  local midi = round(clamp(value or 0, 0, 127))
  return string.format("%s (%d)", noteName(midi), midi)
end

local function formatTime(seconds)
  if seconds >= 1 then
    return string.format("%.2fs", seconds)
  else
    return string.format("%dms", round(seconds * 1000))
  end
end

local function projectRoot()
  local path = getCurrentScriptPath and getCurrentScriptPath() or ""
  if path == "" then
    return ""
  end
  return path:gsub("/+$", ""):match("^(.*)/[^/]+$") or ""
end

local function loadRuntimeState()
  return M.loadRuntimeState()
end

local function saveRuntimeState(state)
  return M.saveRuntimeState(state)
end

_G.loadRuntimeState = loadRuntimeState
_G.saveRuntimeState = saveRuntimeState

-- MIDI device functions now in MidiDevices module
local isPluginMode = MidiDevices.isPluginMode
local buildMidiOptions = MidiDevices.buildMidiOptions
local findOptionIndex = MidiDevices.findOptionIndex
local getCurrentMidiInputLabel = MidiDevices.getCurrentMidiInputLabel
local persistMidiInputSelection = MidiDevices.persistMidiInputSelection
local applyMidiSelection = MidiDevices.applyMidiSelection
local refreshMidiDevices = MidiDevices.refreshMidiDevices
local maybeRefreshMidiDevices = MidiDevices.maybeRefreshMidiDevices

local refreshManagedLayoutState
local syncKeyboardDisplay
local syncPatchViewMode

local function getOctaveLabel(baseOctave, ctx)
  local keyCount = ctx and ctx._keyboardKeyCount or 14
  local whiteKeysPerOctave = 7
  local octaves = keyCount / whiteKeysPerOctave
  local startNote = "C" .. baseOctave
  local endOctave = baseOctave + math.floor(octaves)
  local endNoteIndex = ((keyCount - 1) % 7) + 1
  local noteNames = {"C", "D", "E", "F", "G", "A", "B"}
  local endNote = noteNames[endNoteIndex] .. endOctave
  return startNote .. "-" .. endNote
end

-- Rack pagination state management
local function ensureRackPaginationState(ctx)
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

local function getRackNodeRowById(ctx, nodeId)
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

local function getRackTotalRows(ctx)
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
  local normalized = MidiSynthRackSpecs.normalizeConnections(connections, nodes)
  local fallbackRow = getRackTotalRows(ctx)

  for i = 1, #normalized do
    local conn = normalized[i]
    local from = conn and conn.from or nil
    local to = conn and conn.to or nil
    if tostring(conn and conn.kind or "") == "audio"
      and type(from) == "table"
      and type(to) == "table"
      and tostring(to.moduleId or "") == tostring(MidiSynthRackSpecs.OUTPUT_NODE_ID)
      and tostring(to.portId or "") == tostring(MidiSynthRackSpecs.OUTPUT_PORT_ID) then
      local row = getRackNodeRowById(ctx, tostring(from.moduleId or ""))
      if row ~= nil then
        return row + 1
      end
    end
  end

  return fallbackRow
end

local function syncRackPaginationModel(ctx, viewportHeight)
  local p = ensureRackPaginationState(ctx)
  local totalRows = getRackTotalRows(ctx)
  local rackSlotH = tonumber(RackLayoutManager and RackLayoutManager.RACK_SLOT_H) or 220
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

local function updateRackPaginationDots(ctx)
  local p = ensureRackPaginationState(ctx)
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

local function setRackViewport(ctx, offset)
  local p = ensureRackPaginationState(ctx)
  local maxOffset = math.max(0, (tonumber(p.totalRows) or 1) - (tonumber(p.rowsPerPage) or 1))
  p.viewportOffset = math.max(0, math.min(maxOffset, math.floor(tonumber(offset) or 0)))
  _G.__midiSynthRackPagination = p
  if ctx and ctx._lastW and ctx._lastH then
    refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
  else
    updateRackPaginationDots(ctx)
  end
end

local function onRackDotClick(ctx, dotIndex)
  local p = ensureRackPaginationState(ctx)
  local targetRow = math.max(1, math.floor(tonumber(dotIndex) or 1))
  if p.showAll then
    updateRackPaginationDots(ctx)
    return
  end

  local firstVisible = tonumber((p.visibleRows or {})[1]) or 1
  local lastVisible = tonumber((p.visibleRows or {})[#(p.visibleRows or {})]) or firstVisible
  if targetRow >= firstVisible and targetRow <= lastVisible then
    updateRackPaginationDots(ctx)
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
  setRackViewport(ctx, targetOffset)
end

local RACK_MODULE_SHELL_LAYOUT

-- Same-row drag reorder state
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

local function resetDragState(ctx)
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

local function getRackShellMetaByNodeId(nodeId)
  return type(RACK_MODULE_SHELL_LAYOUT) == "table" and RACK_MODULE_SHELL_LAYOUT[nodeId] or nil
end

local function getRackNodeIdByShellId(shellId)
  if type(RACK_MODULE_SHELL_LAYOUT) ~= "table" then
    return nil, nil
  end
  for nodeId, meta in pairs(RACK_MODULE_SHELL_LAYOUT) do
    if type(meta) == "table" and meta.shellId == shellId then
      return nodeId, meta
    end
  end
  return nil, nil
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

local function getWidgetBoundsInRoot(ctx, widget)
  if not widget then
    return nil
  end

  local bounds = getWidgetBounds(widget)
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
    local parentBounds = getWidgetBounds(parentWidget)
    if parentBounds then
      bounds.x = bounds.x + (tonumber(parentBounds.x) or 0)
      bounds.y = bounds.y + (tonumber(parentBounds.y) or 0)
    end
    current = current.parent
  end

  return bounds
end

local function getShellWidget(ctx, nodeId)
  local meta = getRackShellMetaByNodeId(nodeId)
  if not meta then
    return nil
  end
  return getScopedWidget(ctx, "." .. meta.shellId)
end

local function setShellDragPlaceholder(ctx, nodeId, active)
  local shellWidget = getShellWidget(ctx, nodeId)
  if not shellWidget or type(shellWidget.setStyle) ~= "function" then
    return
  end
  shellWidget:setStyle({ opacity = active and 0.22 or 1.0 })
  if shellWidget.node and shellWidget.node.repaint then
    shellWidget.node:repaint()
  end
end

local function ensureDragGhost(ctx)
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

local function hideDragGhost(ctx)
  local ghost = ctx and ctx._dragGhostCanvas or nil
  if ghost then
    ghost:setVisible(false)
  end
end

local function updateDragGhost(ctx)
  local ghost, accent = ensureDragGhost(ctx)
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

local RACK_COLUMNS_PER_ROW = 5


local function getActiveRackNodes(ctx)
  return (ctx and (ctx._dragPreviewModules or (ctx._rackState and ctx._rackState.modules))) or {}
end

local function getActiveRackNodeById(ctx, nodeId)
  local nodes = getActiveRackNodes(ctx)
  for i = 1, #nodes do
    if nodes[i] and nodes[i].id == nodeId then
      return nodes[i]
    end
  end
  return nil
end

M._inferredDynamicSpecId = function(node)
  local meta = type(node) == "table" and type(node.meta) == "table" and node.meta or {}
  local metaSpecId = tostring(meta.specId or "")
  if metaSpecId ~= "" and RackModuleFactory.specConfig(metaSpecId) ~= nil then
    return metaSpecId
  end
  local nodeId = tostring(type(node) == "table" and node.id or "")
  local inferred = nodeId:match("^(.-)_inst_%d+$")
  if inferred ~= nil and RackModuleFactory.specConfig(inferred) ~= nil then
    return inferred
  end
  return nil
end

M._rebuildDynamicRackModuleState = function(ctx)
  if type(ctx) ~= "table" then
    return 0
  end

  ctx._rackModuleSpecs = MidiSynthRackSpecs.rackModuleSpecById()
  _G.__midiSynthDynamicModuleInfo = {}
  _G.__midiSynthDynamicModuleSpecs = {}

  local slots = RackModuleFactory.ensureDynamicModuleSlots(ctx)
  for _, bucket in pairs(slots or {}) do
    if type(bucket) == "table" then
      for slotIndex in pairs(bucket) do
        bucket[slotIndex] = nil
      end
    end
  end

  local nodes = ctx._rackState and ctx._rackState.modules or {}
  local restored = 0
  local maxSerial = 0

  for i = 1, #nodes do
    local node = nodes[i]
    local nodeId = tostring(node and node.id or "")
    local serial = tonumber(nodeId:match("_inst_(%d+)$"))
    if serial ~= nil and serial > maxSerial then
      maxSerial = serial
    end

    local specId = M._inferredDynamicSpecId(node)
    if specId ~= nil then
      node.meta = type(node.meta) == "table" and node.meta or {}
      local slotIndex = tonumber(node.meta.slotIndex)
      if slotIndex == nil then
        local paramBase = tostring(node.meta.paramBase or "")
        slotIndex = tonumber(paramBase:match("/(%d+)$"))
      end
      if slotIndex == nil then
        slotIndex = RackModuleFactory.nextAvailableSlot(ctx, specId)
      end
      slotIndex = math.max(1, math.floor(tonumber(slotIndex) or 1))

      M._requestDynamicModuleSlot(specId, slotIndex)

      local paramBase = RackModuleFactory.buildParamBase(specId, slotIndex)
      local spec = RackModuleFactory.registerDynamicModuleSpec(ctx, specId, nodeId, {
        slotIndex = slotIndex,
        paramBase = paramBase,
      })
      if type(spec) == "table" then
        RackModuleFactory.markSlotOccupied(ctx, specId, slotIndex, nodeId)
        node.meta.specId = specId
        node.meta.componentId = tostring(node.meta.componentId or (spec.meta and spec.meta.componentId) or "contentComponent")
        node.meta.spawned = true
        node.meta.slotIndex = slotIndex
        node.meta.paramBase = paramBase
        restored = restored + 1
      end
    end
  end

  ctx._dynamicNodeSerial = math.max(tonumber(ctx._dynamicNodeSerial) or 0, maxSerial)
  _G.__midiSynthRackModuleSpecs = ctx._rackModuleSpecs
  return restored
end

local function collectRackFlowSnapshot(ctx)
  local snapshot = {}
  local orderedNodes = RackLayout.getFlowModules(getActiveRackNodes(ctx))
  for i = 1, #orderedNodes do
    local node = orderedNodes[i]
    local meta = getRackShellMetaByNodeId(node.id)
    if meta then
      local shellWidget = getScopedWidget(ctx, "." .. meta.shellId)
      local bounds = getWidgetBoundsInRoot(ctx, shellWidget)
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
    local rowWidget = getScopedWidget(ctx, ".rackRow" .. tostring(row + 1))
    local visible = rowWidget and rowWidget.isVisible and rowWidget:isVisible()
    if visible ~= false then
      local rowBounds = getWidgetBoundsInRoot(ctx, rowWidget)
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

local function computeRackFlowTargetPlacement(ctx, snapshot, movingNodeId, centerX, centerY)
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

  local slotW = tonumber(RackLayoutManager and RackLayoutManager.RACK_SLOT_W) or 236
  local maxCols = math.max(1, tonumber(RACK_COLUMNS_PER_ROW) or 5)
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
  if RackLayout.isAreaFree(sourceNodes, selectedRow, targetCol, movingWidth, movingHeight, movingId ~= "" and movingId or nil) then
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

local function autoCollapseRowForInsertion(nodes, movingNodeId, targetRow, movingWidth, specsById, maxCols)
  local working = RackLayout.cloneRackModules(nodes)
  local target = math.max(0, tonumber(targetRow) or 0)
  local widthNeeded = math.max(1, tonumber(movingWidth) or 1)
  local limit = math.max(1, tonumber(maxCols) or RACK_COLUMNS_PER_ROW)
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

local function previewRackDragReorder(ctx, targetPlacement)
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

  local movingNode = getActiveRackNodeById({ _dragPreviewModules = nil, _rackState = { modules = dragState.baseModules } }, dragState.moduleId)
  local movingWidth = math.max(1, tonumber(movingNode and movingNode.w) or 1)
  local workingNodes = autoCollapseRowForInsertion(
    dragState.baseModules,
    dragState.moduleId,
    nextPlacement.row,
    movingWidth,
    ctx and ctx._rackModuleSpecs,
    RACK_COLUMNS_PER_ROW
  )

  local ok, nextNodes
  if tostring(nextPlacement.mode or "flow") == "slot" then
    local maxRows = math.max(getRackTotalRows(ctx), (tonumber(nextPlacement.row) or 0) + math.max(1, tonumber(movingNode and movingNode.h) or 1) + 1, 8)
    ok, nextNodes = pcall(RackLayout.moveModuleToSlot, workingNodes, dragState.moduleId, nextPlacement.row, nextPlacement.col, RACK_COLUMNS_PER_ROW, maxRows)
  else
    local minRows = {}
    for i = 1, #(workingNodes or {}) do
      local node = workingNodes[i]
      if node and node.id ~= dragState.moduleId then
        minRows[tostring(node.id or "")] = tonumber(node.row) or 0
      end
    end
    minRows[tostring(dragState.moduleId or "")] = tonumber(nextPlacement.row) or 0
    ok, nextNodes = pcall(RackLayout.moveModuleInFlowConstrained, workingNodes, dragState.moduleId, nextPlacement.index, RACK_COLUMNS_PER_ROW, 0, minRows)
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
  refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
  return true
end

local function finalizeRackDragReorder(ctx)
  if not dragState.active or not dragState.moduleId then
    return false
  end

  if dragState.sourceKind == "palette" and dragState.previewPlacement == nil then
    if dragState.unregisterOnCancel then
      RackModuleFactory.unregisterDynamicModuleSpec(ctx, dragState.moduleId, {
        setPath = setPath,
        voiceCount = VOICE_COUNT,
      })
    end
    ctx._dragPreviewModules = nil
    refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
    return false
  end

  local finalNodes = ctx._dragPreviewModules or dragState.baseModules
  if type(finalNodes) ~= "table" then
    return false
  end

  ctx._rackState.modules = RackLayout.cloneRackModules(finalNodes)
  ctx._rackState.utilityDock = M.ensureUtilityDockState(ctx)
  _G.__midiSynthRackState = ctx._rackState
  ctx._dragPreviewModules = nil

  local moved = false
  local beforeNode = dragState.baseModules and getActiveRackNodeById({ _dragPreviewModules = nil, _rackState = { modules = dragState.baseModules } }, dragState.moduleId) or nil
  local afterNode = getActiveRackNodeById({ _dragPreviewModules = nil, _rackState = { modules = finalNodes } }, dragState.moduleId) or nil
  if beforeNode and afterNode then
    moved = (tonumber(beforeNode.row) ~= tonumber(afterNode.row)) or (tonumber(beforeNode.col) ~= tonumber(afterNode.col))
  end

  local topologyChanged = dragState.insertMode and moved
  if topologyChanged then
    ctx._rackConnections = MidiSynthRackSpecs.insertRackModuleAtVisualSlot(
      ctx._rackConnections or {},
      ctx._rackState.modules,
      dragState.moduleId,
      dragState.baseModules
    )
    _G.__midiSynthRackConnections = ctx._rackConnections
    local finalNode = afterNode or getActiveRackNodeById(ctx, dragState.moduleId)
    ctx._lastEvent = string.format("Rack inserted: %s → row %d col %d", tostring(dragState.moduleId), tonumber(finalNode and finalNode.row) or -1, tonumber(finalNode and finalNode.col) or -1)
    M.applyRackConnectionState(ctx, "rack-shift-insert")
  else
    ctx._rackConnections = MidiSynthRackSpecs.normalizeConnections(ctx._rackConnections or {}, ctx._rackState.modules)
    _G.__midiSynthRackConnections = ctx._rackConnections
    if moved then
      local finalNode = afterNode or getActiveRackNodeById(ctx, dragState.moduleId)
      ctx._lastEvent = string.format("Rack moved: %s → row %d col %d", tostring(dragState.moduleId), tonumber(finalNode and finalNode.row) or -1, tonumber(finalNode and finalNode.col) or -1)
    end
  end
  refreshManagedLayoutState(ctx, ctx._lastW, ctx._lastH)
  if not topologyChanged and type(M._refreshRackPresentation) == "function" then
    M._refreshRackPresentation(ctx)
  end
  return moved
end

M._setupShellDragHandlers = function(ctx)
  if type(RACK_MODULE_SHELL_LAYOUT) ~= "table" then
    return
  end

  for _, meta in pairs(RACK_MODULE_SHELL_LAYOUT) do
    local shellId = meta.shellId
    local nodeId = getRackNodeIdByShellId(shellId)
    local accent = getScopedWidget(ctx, "." .. shellId .. ".accent")

    if accent and accent.node and nodeId then
      accent.node:setInterceptsMouse(true, true)

      local isDragging = false

      accent.node:setOnMouseDown(function(x, y, shift, ctrl, alt)
        local currentNode = getActiveRackNodeById(ctx, nodeId)
        local snapshot = collectRackFlowSnapshot(ctx)
        local shellWidget = getShellWidget(ctx, nodeId)
        local rootBounds = getWidgetBoundsInRoot(ctx, shellWidget)
        local startCenterX = rootBounds and ((rootBounds.x or 0) + ((rootBounds.w or 0) * 0.5)) or 0
        local startCenterY = rootBounds and ((rootBounds.y or 0) + ((rootBounds.h or 0) * 0.5)) or 0
        local startPlacement = computeRackFlowTargetPlacement(ctx, snapshot, nodeId, startCenterX, startCenterY)
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
        dragState.baseModules = RackLayout.cloneRackModules((ctx._rackState and ctx._rackState.modules) or {})
        dragState.insertMode = shift == true
        dragState.ghostStartX = rootBounds.x or 0
        dragState.ghostStartY = rootBounds.y or 0
        dragState.ghostX = rootBounds.x or 0
        dragState.ghostY = rootBounds.y or 0
        dragState.ghostW = rootBounds.w or 1
        dragState.ghostH = rootBounds.h or 1

        local ghost, ghostAccent = ensureDragGhost(ctx)
        local spec = ctx._rackModuleSpecs and ctx._rackModuleSpecs[nodeId] or nil
        local ghostAccentColor = (spec and spec.accentColor) or meta.accentColor or 0xff64748b
        if ghostAccent then
          ghostAccent:setStyle({ bg = ghostAccentColor, border = 0x00000000, borderWidth = 0, radius = 0, opacity = 1.0 })
        end
        setShellDragPlaceholder(ctx, nodeId, true)
        updateDragGhost(ctx)
      end)

      accent.node:setOnMouseDrag(function(x, y, dx, dy)
        if not isDragging then return end

        dragState.ghostX = (dragState.ghostStartX or 0) + (tonumber(dx) or 0)
        dragState.ghostY = (dragState.ghostStartY or 0) + (tonumber(dy) or 0)
        updateDragGhost(ctx)

        local snapshot = collectRackFlowSnapshot(ctx)
        dragState.rowSnapshot = snapshot
        local ghostCenterX = (dragState.ghostX or 0) + ((dragState.ghostW or 0) * 0.5)
        local ghostCenterY = (dragState.ghostY or 0) + ((dragState.ghostH or 0) * 0.5)
        local targetPlacement = computeRackFlowTargetPlacement(ctx, snapshot, nodeId, ghostCenterX, ghostCenterY) or dragState.startPlacement
        previewRackDragReorder(ctx, targetPlacement)
        setShellDragPlaceholder(ctx, nodeId, true)
      end)

      accent.node:setOnMouseUp(function(x, y)
        if not isDragging then return end
        isDragging = false
        finalizeRackDragReorder(ctx)
        setShellDragPlaceholder(ctx, nodeId, false)
        hideDragGhost(ctx)
        resetDragState(ctx)
      end)
    end
  end
end

local function utilityDockHasKeyboard(ctx)
  local dock = M.ensureUtilityDockState(ctx)
  local primary = dock.primary or {}
  local secondary = dock.secondary or nil
  return primary.kind == "keyboard" or (secondary and secondary.kind == "keyboard")
end

local function cleanupPatchbayFromRuntime(shellId, ctx)
  return M.cleanupPatchbayFromRuntime(shellId, ctx)
end

local function invalidatePatchbay(nodeId, ctx)
  return M.invalidatePatchbay(nodeId, ctx)
end

local function ensurePatchbayWidgets(ctx, shellId, nodeId, specId, currentPage)
  return M.ensurePatchbayWidgets(ctx, shellId, nodeId, specId, currentPage)
end

local function syncPatchbayValues(ctx)
  return M.syncPatchbayValues(ctx)
end

local function findRegisteredPatchbayPort(ctx, nodeId, portId, direction)
  return M.findRegisteredPatchbayPort(ctx, nodeId, portId, direction)
end

syncRackEdgeTerminals = function(ctx)
  return M.syncRackEdgeTerminals(ctx)
end

syncPatchViewMode = function(ctx)
  return M.syncPatchViewMode(ctx)
end

local function toggleRackNodeWidth(ctx, nodeId)
  return M.toggleRackNodeWidth(ctx, nodeId)
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

local function bindWirePortWidget(ctx, portWidget, entry)
  return M.bindWirePortWidget(ctx, portWidget, entry)
end

local function isUtilityDockVisible(ctx)
  local dock = M.ensureUtilityDockState(ctx)
  return dock.visible ~= false and dock.mode ~= "hidden"
end

local function syncKeyboardCollapsedFromUtilityDock(ctx)
  return KeyboardInput.syncKeyboardCollapsedFromUtilityDock(ctx)
end

local function syncUtilityDockFromKeyboardCollapsed(ctx)
  return KeyboardInput.syncUtilityDockFromKeyboardCollapsed(ctx)
end

local function utilityDockPresentationMode(ctx)
  return ctx._dockMode or "compact_collapsed"
end

local function syncDockModeDots(ctx)
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

local function syncKeyboardCollapseButton(ctx)
  return KeyboardInput.syncKeyboardCollapseButton(ctx)
end

local function computeKeyboardPanelHeight(ctx, totalH)
  return KeyboardInput.computeKeyboardPanelHeight(ctx, totalH)
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

  local nextW = math.max(1, round(width or currentW or 1))
  local nextH = math.max(1, round(height or currentH or 1))
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

local function setWidgetBounds(widget, x, y, w, h)
  if widget == nil then
    return false
  end

  local nextX = round(x or 0)
  local nextY = round(y or 0)
  local nextW = math.max(1, round(w or 1))
  local nextH = math.max(1, round(h or 1))
  local currentX = 0
  local currentY = 0
  local currentW = 0
  local currentH = 0

  local node = widget.node
  if node and node.getBounds then
    local bx, by, bw, bh = node:getBounds()
    currentX = round(bx or 0)
    currentY = round(by or 0)
    currentW = round(bw or 0)
    currentH = round(bh or 0)
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

-- Rack layout functions delegated to RackLayoutManager
local relayoutWidgetSubtree = RackLayoutManager.relayoutWidgetSubtree
local updateLayoutChild = RackLayoutManager.updateLayoutChild
local updateWidgetRectSpec = RackLayoutManager.updateWidgetRectSpec
local computeProjectedRowWidths = RackLayoutManager.computeProjectedRowWidths

local CANONICAL_RACK_HEIGHT = RackLayoutManager.CANONICAL_RACK_HEIGHT
local RACK_SLOT_W = RackLayoutManager.RACK_SLOT_W
local RACK_SLOT_H = RackLayoutManager.RACK_SLOT_H
local RACK_ROW_GAP = RackLayoutManager.RACK_ROW_GAP
local RACK_ROW_PADDING_X = RackLayoutManager.RACK_ROW_PADDING_X

RACK_MODULE_SHELL_LAYOUT = {
  adsr = { shellId = "adsrShell", badgeSuffix = ".adsrShell.sizeBadge", row = 0, accentColor = 0xfffda4af },
  oscillator = { shellId = "oscillatorShell", badgeSuffix = ".oscillatorShell.sizeBadge", row = 0, accentColor = 0xff7dd3fc },
  filter = { shellId = "filterShell", badgeSuffix = ".filterShell.sizeBadge", row = 0, accentColor = 0xffa78bfa },
  fx1 = { shellId = "fx1Shell", badgeSuffix = ".fx1Shell.sizeBadge", row = 1, accentColor = 0xff22d3ee },
  fx2 = { shellId = "fx2Shell", badgeSuffix = ".fx2Shell.sizeBadge", row = 1, accentColor = 0xff38bdf8 },
  eq = { shellId = "eqShell", badgeSuffix = ".eqShell.sizeBadge", row = 1, accentColor = 0xff34d399 },
  placeholder1 = { shellId = "placeholder1Shell", badgeSuffix = ".placeholder1Shell.sizeBadge", row = 2, accentColor = 0xff64748b },
  placeholder2 = { shellId = "placeholder2Shell", badgeSuffix = ".placeholder2Shell.sizeBadge", row = 2, accentColor = 0xff64748b },
  placeholder3 = { shellId = "placeholder3Shell", badgeSuffix = ".placeholder3Shell.sizeBadge", row = 2, accentColor = 0xff64748b },
}

local function computeProjectedRowWidths(nodes, rowBounds)
  return RackLayoutManager.computeProjectedRowWidths(nodes, rowBounds)
end

local function syncRackShellLayout(ctx)
  local defaultRackState = MidiSynthRackSpecs.defaultRackState()
  local rackState = ctx._rackState or {
    viewMode = defaultRackState.viewMode,
    densityMode = defaultRackState.densityMode,
    utilityDock = defaultRackState.utilityDock,
    modules = RackLayout.cloneRackModules(defaultRackState.modules),
  }
  if #(rackState.modules or {}) == 0 then
    rackState.modules = RackLayout.cloneRackModules(defaultRackState.modules)
  end
  ctx._rackState = rackState
  ctx._utilityDock = rackState.utilityDock or ctx._utilityDock

  local rowBoundsByRow = {}
  for row = 0, 7 do
    local rowWidget = getScopedWidget(ctx, ".rackRow" .. tostring(row + 1))
    if rowWidget then
      rowBoundsByRow[row] = getWidgetBounds(rowWidget)
    end
  end

  local layoutNodes = RackLayout.getFlowModules(ctx._dragPreviewModules or rackState.modules or {})
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

  local changed = false
  for row, bucket in pairs(rowBuckets) do
    local rowBounds = rowBoundsByRow[row]
    if rowBounds then
      local rowLeft = (tonumber(rowBounds.x) or 0) + RACK_ROW_PADDING_X
      local rowTop = tonumber(rowBounds.y) or 0
      for i = 1, #bucket do
        local node = bucket[i]
        local shellMeta = node and RACK_MODULE_SHELL_LAYOUT[node.id] or nil
        if shellMeta then
          local shellWidget = getScopedWidget(ctx, "." .. shellMeta.shellId)
          local width = math.max(1, tonumber(node.w) or 1) * RACK_SLOT_W
          local height = math.max(1, tonumber(node.h) or 1) * RACK_SLOT_H
          local x = rowLeft + (math.max(0, tonumber(node.col) or 0) * (RACK_SLOT_W + RACK_ROW_GAP))
          local y = rowTop
          local sizeText = type(node.sizeKey) == "string" and node.sizeKey ~= "" and node.sizeKey or string.format("%dx%d", math.max(1, tonumber(node.h) or 1), math.max(1, tonumber(node.w) or 1))
          if shellWidget then
            local componentBehavior = getScopedBehavior(ctx, "." .. tostring(shellMeta.shellId or "") .. "." .. tostring(shellMeta.componentId or ""))
            if componentBehavior and componentBehavior.ctx then
              componentBehavior.ctx.instanceProps = type(componentBehavior.ctx.instanceProps) == "table" and componentBehavior.ctx.instanceProps or {}
              componentBehavior.ctx.instanceProps.sizeKey = sizeText
            end
            changed = updateWidgetRectSpec(shellWidget, x, y, width, height) or changed
            changed = setWidgetBounds(shellWidget, x, y, width, height) or changed
            relayoutWidgetSubtree(shellWidget, width, height)
          end
          local badge = getScopedWidget(ctx, shellMeta.badgeSuffix)
          syncText(badge, sizeText)
        end
      end
    end
  end

  return changed
end

refreshManagedLayoutState = function(ctx, w, h)
  local widgets = ctx.widgets or {}
  M._setupUtilityPaletteBrowserHandlers(ctx)
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
  totalW = math.max(1, round(totalW or 0))
  totalH = math.max(1, round(totalH or 0))

  syncKeyboardCollapsedFromUtilityDock(ctx)
  syncKeyboardCollapseButton(ctx)

  local stackChanged = setWidgetBounds(mainStack, 0, 0, totalW, totalH)

  local dockVisible = isUtilityDockVisible(ctx)
  local dock = M.ensureUtilityDockState(ctx)
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
  local availableBelow = math.max(220, totalH - contentTop - bottomPad)
  local keyboardH = computeKeyboardPanelHeight(ctx, totalH)
  local contentH = math.max(CANONICAL_RACK_HEIGHT, availableBelow - keyboardH - gap)

  local p = syncRackPaginationModel(ctx, contentH)
  local visibleRowSet = {}
  for _, rowIndex in ipairs(p.visibleRows or {}) do
    visibleRowSet[tonumber(rowIndex)] = true
  end

  local missingRows = 0
  for rowIndex = 1, math.max(64, p.totalRows + 4) do
    local rowWidget = getScopedWidget(ctx, ".rackRow" .. tostring(rowIndex))
    if rowWidget then
      missingRows = 0
      local rowVisible = rowIndex <= p.totalRows and visibleRowSet[rowIndex] == true
      local slotIndex = p.showAll and rowIndex or (rowIndex - (tonumber(p.viewportOffset) or 0))
      local targetY = 25 + (math.max(0, slotIndex - 1) * RACK_SLOT_H)
      local bounds = getWidgetBounds(rowWidget)
      if bounds then
        updateWidgetRectSpec(rowWidget, bounds.x, targetY, bounds.w, bounds.h)
        setWidgetBounds(rowWidget, bounds.x, targetY, bounds.w, bounds.h)
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
  for i = 1, #activeLayoutNodes do
    local node = activeLayoutNodes[i]
    if node and node.id then
      activeNodesById[tostring(node.id)] = node
      if not RACK_MODULE_SHELL_LAYOUT[tostring(node.id)] then
        if M._ensureDynamicShellForNode(ctx, node.id) ~= nil then
          createdDynamicShell = true
        end
      end
    end
  end

  for nodeId, shellMeta in pairs(RACK_MODULE_SHELL_LAYOUT) do
    local node = activeNodesById[tostring(nodeId)]
    local shellWidget = getScopedWidget(ctx, "." .. shellMeta.shellId)
    local deleteButton = getScopedWidget(ctx, "." .. shellMeta.shellId .. ".deleteButton")
    local rowIndex = node and math.max(1, math.floor(tonumber(node.row) or 0) + 1) or nil
    local shellVisible = rowIndex ~= nil and visibleRowSet[rowIndex] == true

    setWidgetVisible(shellWidget, shellVisible)
    setWidgetVisible(deleteButton, shellVisible and MidiSynthRackSpecs.isRackModuleDeletable and MidiSynthRackSpecs.isRackModuleDeletable(nodeId))
  end

  updateRackPaginationDots(ctx)

  local rackChanged = syncRackShellLayout(ctx)
  local sizingChanged = false
  sizingChanged = updateLayoutChild(topRow, {
    order = 1,
    grow = 0,
    shrink = 0,
    basisH = 220,
    minH = 220,
    maxH = 220,
  }) or sizingChanged
  sizingChanged = updateLayoutChild(bottomRow, {
    order = 2,
    grow = 0,
    shrink = 0,
    basisH = 220,
    minH = 220,
    maxH = 220,
  }) or sizingChanged
  local keyboardBodyBasisH = isCollapsedMode and 0 or (isCompactMode and 54 or 150)
  local keyboardBodyMinH = isCollapsedMode and 0 or (isCompactMode and 46 or 110)
  sizingChanged = updateLayoutChild(utilitySplitArea, {
    order = 1,
    grow = 1,
    shrink = 1,
    basisH = isCollapsedMode and 110 or 120,
    minH = 110,
    maxH = nil,
  }) or sizingChanged
  sizingChanged = updateLayoutChild(utilityTopBar, {
    order = 1,
    grow = 0,
    shrink = 0,
    basisH = 20,
    minH = 20,
    maxH = 20,
  }) or sizingChanged
  sizingChanged = updateLayoutChild(utilityBrowserBody, {
    order = 2,
    grow = 1,
    shrink = 1,
    basisH = 136,
    minH = 96,
    maxH = nil,
  }) or sizingChanged
  local utilityNavW = 248
  local utilityDetailMinW = 164
  local paletteStripW = M._palettePreferredWidth(ctx)
  sizingChanged = updateLayoutChild(utilityNavRail, {
    basisW = utilityNavVisible and utilityNavW or 0,
    minW = utilityNavVisible and utilityNavW or 0,
    maxW = utilityNavVisible and utilityNavW or 0,
    shrink = 0,
  }) or sizingChanged
  sizingChanged = updateLayoutChild(paletteStrip, {
    basisW = paletteStripW,
    minW = paletteStripW,
    maxW = paletteStripW,
    grow = 0,
    shrink = 0,
  }) or sizingChanged
  sizingChanged = updateLayoutChild(utilityDetailPanel, {
    basisW = utilityDetailVisible and utilityDetailMinW or 0,
    minW = utilityDetailVisible and utilityDetailMinW or 0,
    maxW = nil,
    grow = utilityDetailVisible and 1 or 0,
    shrink = utilityDetailVisible and 1 or 0,
  }) or sizingChanged
  sizingChanged = updateLayoutChild(keyboardGrabHandle, {
    order = 2,
    grow = 0,
    shrink = 0,
    basisH = 8,
    minH = 8,
    maxH = 8,
  }) or sizingChanged
  sizingChanged = updateLayoutChild(midiParamRack, {
    order = 3,
    grow = 0,
    shrink = 0,
    basisH = 68,
    minH = 68,
    maxH = 68,
  }) or sizingChanged
  sizingChanged = updateLayoutChild(keyboardBody, {
    order = 4,
    grow = 0,
    shrink = 1,
    basisH = keyboardBodyBasisH,
    minH = keyboardBodyMinH,
    maxH = isCollapsedMode and 0 or keyboardBodyBasisH,
  }) or sizingChanged
  sizingChanged = updateLayoutChild(keyboardHeader, {
    order = 5,
    grow = 0,
    shrink = 0,
    basisH = 42,
    minH = 42,
    maxH = 42,
  }) or sizingChanged
  sizingChanged = updateLayoutChild(contentRows, {
    order = 1,
    basisH = contentH,
    minH = contentH,
    maxH = contentH,
  }) or sizingChanged

  -- Rack container height follows the visible viewport, not the full logical row count.
  local rackContainer = widgets.rackContainer or getScopedWidget(ctx, ".rackContainer")
  if rackContainer then
    local visibleRackH = 25 + (math.max(1, tonumber(p.rowsPerPage) or 1) * RACK_SLOT_H)
    sizingChanged = updateLayoutChild(rackContainer, {
      basisH = visibleRackH,
      minH = visibleRackH,
      maxH = visibleRackH,
    }) or sizingChanged
  end
  sizingChanged = updateLayoutChild(keyboardPanel, {
    order = 2,
    grow = 0,
    shrink = 0,
    basisH = keyboardH,
    minH = keyboardH,
    maxH = keyboardH,
  }) or sizingChanged

  local paletteChanged = M._syncPaletteCardState(ctx) or false
  local layoutChanged = stackChanged or bodyVisibilityChanged or sizingChanged or rackChanged or paletteChanged
  if layoutChanged then
    relayoutWidgetSubtree(mainStack, totalW, totalH)
    M._syncPaletteCardState(ctx)
  end

  if createdDynamicShell and ctx._rackState and (ctx._rackState.viewMode or "perf") == "patch" then
    syncPatchViewMode(ctx)
  end

  syncRackEdgeTerminals(ctx)
  if layoutChanged and RackWireLayer and RackWireLayer.refreshWires then
    local viewMode = ctx._rackState and ctx._rackState.viewMode or "perf"
    if viewMode == "patch" then
      RackWireLayer.refreshWires(ctx)
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
    local dotX = round(anchorRight + math.max(0, (rightPad - dotsW) * 0.5))
    local dotY = round(((tonumber(by) or 0) + (tonumber(bh) or 0)) - dotsH - 48)
    setWidgetBounds(dockModeDots, dotX, dotY, dotsW, dotsH)
  end

  syncDockModeDots(ctx)
  if bodyVisible then
    syncKeyboardDisplay(ctx)
  end
  MidiParamRack.sync(ctx, midiParamRack)

  -- Position patchViewToggle flush right within content_rows
  if widgets.patchViewToggle and contentRows and contentRows.node then
    local _, _, rowsW, _ = contentRows.node:getBounds()
    local btnW = 60
    local btnH = 24
    local btnX = math.max(0, round((tonumber(rowsW) or 1280) - btnW - 1))-- 1px for border
    setWidgetBounds(widgets.patchViewToggle, btnX, 0, btnW, btnH)
  end
end

local function setKeyboardCollapsed(ctx, collapsed)
  return KeyboardInput.setKeyboardCollapsed(ctx, collapsed)
end

local function generateKeyboardKeys(whiteKeyCount)
  whiteKeyCount = whiteKeyCount or 14
  local whiteKeys = {}
  local blackKeys = {}
  local blackPositions = {}
  
  local whitePattern = {0, 2, 4, 5, 7, 9, 11}  -- C, D, E, F, G, A, B
  local blackPattern = {1, 3, 6, 8, 10}  -- C#, D#, F#, G#, A#
  local blackPosPattern = {0.5, 1.5, 3.5, 4.5, 5.5}  -- position between white keys
  
  for i = 1, whiteKeyCount do
    local octave = math.floor((i - 1) / 7)
    local noteInOctave = ((i - 1) % 7) + 1
    whiteKeys[i] = octave * 12 + whitePattern[noteInOctave]
  end
  
  local blackIndex = 1
  for i = 1, whiteKeyCount - 1 do
    local octave = math.floor((i - 1) / 7)
    local noteInOctave = ((i - 1) % 7) + 1
    -- C#(1), D#(3) between C-D and D-E, then F#(6), G#(8), A#(10) between F-G, G-A, A-B
    if noteInOctave == 1 or noteInOctave == 2 or noteInOctave == 4 or noteInOctave == 5 or noteInOctave == 6 then
      local blackOffset = blackPattern[noteInOctave == 1 and 1 or noteInOctave == 2 and 2 or noteInOctave == 4 and 3 or noteInOctave == 5 and 4 or 5]
      blackKeys[blackIndex] = octave * 12 + blackOffset
      blackPositions[blackIndex] = i + blackPosPattern[noteInOctave == 1 and 1 or noteInOctave == 2 and 2 or noteInOctave == 4 and 3 or noteInOctave == 5 and 4 or 5]
      blackIndex = blackIndex + 1
    end
  end
  
  return whiteKeys, blackKeys, blackPositions
end

local function getKeyCountForCtx(ctx)
  return ctx._keyboardKeyCount or 14
end

local function isKeyboardNoteActive(ctx, note)
  local midiVoices = ctx._midiVoices or ctx._voices or {}
  local voiceCount = ctx._voiceCount or 8
  for j = 1, voiceCount do
    local voice = midiVoices[j]
    if voice and voice.active and voice.note == note and voice.gate > 0.5 then
      return true
    end
  end
  return false
end

local function buildKeyboardDisplayList(ctx, w, h)
  return KeyboardInput.buildKeyboardDisplayList(ctx, w, h)
end

syncKeyboardDisplay = function(ctx)
  return KeyboardInput.syncKeyboardDisplay(ctx)
end

local function handleKeyboardClick(ctx, x, y, isDown)
  return KeyboardInput.handleKeyboardClick(ctx, x, y, isDown)
end

local function isUiInteracting(ctx)
  local widgets = ctx.widgets or {}
  local all = ctx.allWidgets or {}
  local rootId = ctx._globalPrefix or "root"

  local function widgetBusy(widget)
    return widget and (widget._dragging or widget._open)
  end

  if widgetBusy(widgets.midiInputDropdown) then return true end

  local trackedSuffixes = {
    ".oscillatorComponent.waveform_dropdown",
    ".oscillatorComponent.mode_tabs.wave_tab.render_mode_tabs",
    ".oscillatorComponent.mode_tabs.wave_tab.drive_mode_dropdown",
    ".oscillatorComponent.mode_tabs.wave_tab.pulse_width_knob",
    ".oscillatorComponent.mode_tabs.sample_tab.sample_source_dropdown",
    ".oscillatorComponent.mode_tabs.sample_tab.sample_bars_box",
    ".oscillatorComponent.mode_tabs.sample_tab.sample_pitch_map_toggle",
    ".oscillatorComponent.mode_tabs.sample_tab.sample_root_box",
    ".oscillatorComponent.mode_tabs.wave_tab.drive_knob",
    ".oscillatorComponent.mode_tabs.wave_tab.drive_bias_knob",
    ".oscillatorComponent.mode_tabs.wave_tab.add_partials_knob",
    ".oscillatorComponent.mode_tabs.wave_tab.add_tilt_knob",
    ".oscillatorComponent.mode_tabs.wave_tab.add_drift_knob",
    ".oscillatorComponent.output_knob",
    ".oscillatorComponent.blend_amount_knob",
    ".filterComponent.filter_type_dropdown",
    ".filterComponent.cutoff_knob",
    ".filterComponent.resonance_knob",
    ".envelopeComponent.attack_knob",
    ".envelopeComponent.decay_knob",
    ".envelopeComponent.sustain_knob",
    ".envelopeComponent.release_knob",
    ".fx1Component.type_dropdown",
    ".fx1Component.xy_x_dropdown",
    ".fx1Component.xy_y_dropdown",
    ".fx1Component.mix_knob",
    ".fx1Component.param1",
    ".fx1Component.param2",
    ".fx1Component.param3",
    ".fx1Component.param4",
    ".fx1Component.param5",
    ".fx2Component.type_dropdown",
    ".fx2Component.xy_x_dropdown",
    ".fx2Component.xy_y_dropdown",
    ".fx2Component.mix_knob",
    ".fx2Component.param1",
    ".fx2Component.param2",
    ".fx2Component.param3",
    ".fx2Component.param4",
    ".fx2Component.param5",
  }

  for _, suffix in ipairs(trackedSuffixes) do
    if widgetBusy(getScopedWidget(ctx, suffix)) then
      return true
    end
  end

  local runtime = _G.__manifoldStructuredUiRuntime
  if runtime and type(runtime.behaviors) == "table" then
    for i = 1, #runtime.behaviors do
      local behavior = runtime.behaviors[i]
      local path = tostring(behavior and behavior.path or "")
      local behaviorCtx = behavior and behavior.ctx or nil
      if endsWith(path, "ui/behaviors/fx_slot.lua") and type(behaviorCtx) == "table" and behaviorCtx.dragging then
        return true
      end
    end
  end

  return false
end

-- Background tick: MIDI polling + envelope processing.
-- Stored as a global so the root behavior can call it every frame,
-- even when the MidiSynth tab is not active.
local function backgroundTick(ctx)
  activeBehaviorCtx = ctx
  local now = getTime and getTime() or 0
  local minInterval = isUiInteracting(ctx) and BG_TICK_INTERVAL_WHILE_INTERACTING or BG_TICK_INTERVAL
  if now - (ctx._lastBackgroundTickTime or 0) < minInterval then
    return
  end

  local dt = now - (ctx._lastUpdateTime or now)
  if dt < 0 then dt = 0 end
  if dt > 0.05 then dt = 0.05 end

  ctx._lastUpdateTime = now
  ctx._lastBackgroundTickTime = now

  -- Process MIDI input
  if Midi and Midi.pollInputEvent then
    while true do
      local event = Midi.pollInputEvent()
      if not event then break end

      if ctx._rackModRuntime and ctx._rackModRuntime.onMidiEvent then
        ctx._rackModRuntime:onMidiEvent(event)
      end
      if ctx._modRuntime and ctx._modRuntime.onMidiEvent then
        ctx._modRuntime:onMidiEvent(event)
      end

      if event.type == Midi.NOTE_ON and event.data2 > 0 then
        ctx._currentNote = event.data1
        local voiceIndex = VoiceManager.triggerVoice(ctx, event.data1, event.data2)
        if voiceIndex ~= nil then
          ctx._lastEvent = string.format("Note: %s vel %d", noteName(event.data1), event.data2)
        else
          ctx._lastEvent = string.format("Blocked: %s", tostring(ctx._triggerBlockedReason or "missing trigger path"))
        end
      elseif event.type == Midi.NOTE_OFF or (event.type == Midi.NOTE_ON and event.data2 == 0) then
        VoiceManager.releaseVoice(ctx, event.data1)
        if ctx._currentNote == event.data1 then
          ctx._currentNote = nil
        end
      elseif event.type == Midi.CONTROL_CHANGE then
        ctx._lastEvent = string.format("CC %d = %d", event.data1, event.data2)
        MidiParamRack.onMidiCC(ctx, event.data1, event.data2)
        MidiParamRack.invalidate(ctx)
      elseif Midi and event.type == Midi.PITCH_BEND then
        local bend = event.data1 | (event.data2 << 7)
        ctx._lastEvent = string.format("Pitch Bend %d", bend)
      elseif Midi and Midi.CHANNEL_PRESSURE and event.type == Midi.CHANNEL_PRESSURE then
        ctx._lastEvent = string.format("Pressure %d", event.data1)
      end
    end
  end

  if ctx._rackModRuntime and ctx._rackModRuntime.evaluateAndApply then
    ctx._rackModRuntime:evaluateAndApply(ctx, readParam, setPath)
  end
  require("transpose_runtime").updateDynamicModules(ctx, dt, readParam, VOICE_COUNT)
  require("velocity_mapper_runtime").updateDynamicModules(ctx, dt, readParam, VOICE_COUNT)
  require("scale_quantizer_runtime").updateDynamicModules(ctx, dt, readParam, VOICE_COUNT)
  require("note_filter_runtime").updateDynamicModules(ctx, dt, readParam, VOICE_COUNT)
  require("arp_runtime").updateDynamicModules(ctx, dt, readParam, VOICE_COUNT)
  if ctx._rackModRuntime and ctx._rackModRuntime.evaluateAndApply then
    ctx._rackModRuntime:evaluateAndApply(ctx, readParam, setPath)
  end

  -- Update ADSR envelopes after voice-chain transforms have landed.
  local attack = readParam(PATHS.attack, 0.05)
  local decay = readParam(PATHS.decay, 0.2)
  local sustain = readParam(PATHS.sustain, 0.7)
  local release = readParam(PATHS.release, 0.4)
  ctx._adsr.attack = attack
  ctx._adsr.decay = decay
  ctx._adsr.sustain = sustain
  ctx._adsr.release = release
  VoiceManager.updateEnvelopes(ctx, dt, now)
  require("adsr_runtime").updateDynamicModules(ctx, dt, readParam, clamp, VOICE_COUNT)
  if ctx._rackModRuntime and ctx._rackModRuntime.evaluateAndApply then
    ctx._rackModRuntime:evaluateAndApply(ctx, readParam, setPath)
  end
  if ctx._modRuntime and ctx._modRuntime.evaluateAndApply then
    ctx._modRuntime:evaluateAndApply(ctx, readParam, setPath)
  end
  require("attenuverter_bias_runtime").updateDynamicModules(ctx, dt, readParam)
  require("lfo_runtime").updateDynamicModules(ctx, dt, readParam)
  require("slew_runtime").updateDynamicModules(ctx, dt, readParam)
  require("sample_hold_runtime").updateDynamicModules(ctx, dt, readParam)
  require("compare_runtime").updateDynamicModules(ctx, dt, readParam)
  require("cv_mix_runtime").updateDynamicModules(ctx, dt, readParam)
  require("range_mapper_runtime").updateDynamicModules(ctx, dt, readParam)
  if ctx._pendingAuxAudioRouteSync == true then
    syncAuxAudioRouteParams(ctx)
  end
end

function M.init(ctx)
  activeBehaviorCtx = ctx
  local widgets = ctx.widgets or {}
  ctx._currentNote = nil
  ctx._lastEvent = "No MIDI yet"
  ctx._voiceStamp = 0
  ctx._voices = {}
  ctx._midiVoices = {}
  ctx._selectedMidiInputIdx = 1
  ctx._selectedMidiInputLabel = "None (Disabled)"
  ctx._adsr = { attack = 0.05, decay = 0.2, sustain = 0.7, release = 0.4 }
  ctx._keyboardOctave = 3
  ctx._rackState = MidiSynthRackSpecs.defaultRackState()
  ctx._utilityViewId = "palette"
  ctx._selectedPaletteEntryId = "adsr"
  ctx._paletteScrollOffset = 0
  ctx._utilityNavScrollOffset = 0
  ctx._paletteBrowseCollapsed = { voice = false, audio = false, fx = false, mod = false }
  ctx._paletteFilterTags = {}
  ctx._paletteFilterTagAll = true
  ctx._paletteSearchText = ""
  ctx._paletteSearchFocused = false
  ctx._rackModuleSpecs = MidiSynthRackSpecs.rackModuleSpecById()
  ctx._rackConnections = MidiSynthRackSpecs.defaultConnections(ctx._rackState.modules)
  invalidatePatchbay(nil, ctx)
  ctx._utilityDock = ctx._rackState.utilityDock or RackLayout.defaultUtilityDock()
  ctx._keyboardCollapsed = false
  KeyboardInput.init({
    triggerVoice = VoiceManager.triggerVoice,
    releaseVoice = VoiceManager.releaseVoice,
    ensureUtilityDockState = M.ensureUtilityDockState,
    refreshManagedLayoutState = refreshManagedLayoutState,
    noteName = noteName,
    repaint = repaint,
  })
  VoiceManager.init({
    setPath = setPath,
    readParam = readParam,
    ParameterBinder = ParameterBinder,
    adsr_runtime = require("adsr_runtime"),
    applyImplicitRackOscillatorKeyboardPitch = ModulationRouter.applyImplicitRackOscillatorKeyboardPitch,
  })
  ModulationRouter.init({
    setPath = setPath,
    readParam = readParam,
    ParameterBinder = ParameterBinder,
  })
  RackLayoutEngine.init({
    getScopedWidget = getScopedWidget,
    GhostWidget = GhostWidget,
    RackLayoutManager = RackLayoutManager,
    MidiSynthRackSpecs = MidiSynthRackSpecs,
    RackModuleFactory = RackModuleFactory,
    setPath = setPath,
    ParameterBinder = ParameterBinder,
    RackLayout = RackLayout,
    PatchbayRuntime = PatchbayRuntime,
    RackWireLayer = RackWireLayer,
    RackModPopover = RackModPopover,
  })
  StateManager.init({
    projectRoot = projectRoot,
    readTextFile = readTextFile,
    writeTextFile = writeTextFile,
    setPath = setPath,
    readParam = readParam,
    round = round,
    MidiSynthRackSpecs = MidiSynthRackSpecs,
    RackLayout = RackLayout,
    RackModuleFactory = RackModuleFactory,
    PATHS = PATHS,
    MAX_FX_PARAMS = MAX_FX_PARAMS,
    fxParamPath = fxParamPath,
    eq8BandEnabledPath = eq8BandEnabledPath,
    eq8BandTypePath = eq8BandTypePath,
    eq8BandFreqPath = eq8BandFreqPath,
    eq8BandGainPath = eq8BandGainPath,
    eq8BandQPath = eq8BandQPath,
    syncKeyboardCollapsedFromUtilityDock = syncKeyboardCollapsedFromUtilityDock,
    setKeyboardCollapsed = setKeyboardCollapsed,
    applyRackConnectionState = M.applyRackConnectionState,
    syncKeyboardCollapseButton = syncKeyboardCollapseButton,
    refreshManagedLayoutState = refreshManagedLayoutState,
    MidiParamRack = MidiParamRack,
    persistMidiInputSelection = persistMidiInputSelection,
  })
  PatchbayBinding.init({
    RackWireLayer = RackWireLayer,
    RackModPopover = RackModPopover,
    getScopedWidget = getScopedWidget,
    getWidgetBoundsInRoot = getWidgetBoundsInRoot,
    readParam = readParam,
    setPath = setPath,
    setWidgetValueSilently = setWidgetValueSilently,
    setSampleLoopStartLinked = setSampleLoopStartLinked,
    setSampleLoopLenLinked = setSampleLoopLenLinked,
    syncLegacyBlendDirectionFromBlend = syncLegacyBlendDirectionFromBlend,
    ModulationRouter = ModulationRouter,
    ParameterBinder = ParameterBinder,
    auxAudioSourceCodeForEndpoint = auxAudioSourceCodeForEndpoint,
    RACK_MODULE_SHELL_LAYOUT = RACK_MODULE_SHELL_LAYOUT,
    RackLayout = RackLayout,
    getRackTotalRows = getRackTotalRows,
    refreshManagedLayoutState = refreshManagedLayoutState,
    RACK_COLUMNS_PER_ROW = RACK_COLUMNS_PER_ROW,
    round = round,
  })
  require("behaviors.dynamic_module_binding").init({
    setPath = setPath,
    PATHS = PATHS,
    MidiSynthRackSpecs = MidiSynthRackSpecs,
    RACK_MODULE_SHELL_LAYOUT = RACK_MODULE_SHELL_LAYOUT,
    getScopedWidget = getScopedWidget,
    getScopedBehavior = getScopedBehavior,
    RackLayoutManager = RackLayoutManager,
    PatchbayRuntime = PatchbayRuntime,
  })
  require("behaviors.rack_mutation_runtime").init({
    RackLayout = RackLayout,
    MidiSynthRackSpecs = MidiSynthRackSpecs,
    RackModuleFactory = RackModuleFactory,
    ModEndpointRegistry = ModEndpointRegistry,
    ModRouteCompiler = ModRouteCompiler,
    RackControlRouter = RackControlRouter,
    ModRuntime = ModRuntime,
    PatchbayRuntime = PatchbayRuntime,
    RackWireLayer = RackWireLayer,
    RackModPopover = RackModPopover,
    setPath = setPath,
    readParam = readParam,
    PATHS = PATHS,
    VOICE_COUNT = VOICE_COUNT,
    RACK_COLUMNS_PER_ROW = RACK_COLUMNS_PER_ROW,
    RACK_MODULE_SHELL_LAYOUT = RACK_MODULE_SHELL_LAYOUT,
    getScopedWidget = getScopedWidget,
    getWidgetBoundsInRoot = getWidgetBoundsInRoot,
    autoCollapseRowForInsertion = autoCollapseRowForInsertion,
    getRackTotalRows = getRackTotalRows,
    ensureUtilityDockState = M.ensureUtilityDockState,
    hideDragGhost = hideDragGhost,
    resetDragState = resetDragState,
    dragState = dragState,
    getRackShellMetaByNodeId = getRackShellMetaByNodeId,
    invalidatePatchbay = invalidatePatchbay,
    cleanupPatchbayFromRuntime = cleanupPatchbayFromRuntime,
    syncAuxAudioRouteParams = syncAuxAudioRouteParams,
    syncPatchViewMode = syncPatchViewMode,
    refreshManagedLayoutState = refreshManagedLayoutState,
    panicVoices = VoiceManager.panicVoices,
  })
  require("behaviors.palette_browser").init({
    setPath = setPath,
    voiceCount = VOICE_COUNT,
    refreshManagedLayoutState = refreshManagedLayoutState,
    getScopedWidget = getScopedWidget,
    getWidgetBoundsInRoot = getWidgetBoundsInRoot,
    getWidgetBounds = getWidgetBounds,
    setWidgetBounds = setWidgetBounds,
    syncText = syncText,
    syncColour = syncColour,
    computeRackFlowTargetPlacement = computeRackFlowTargetPlacement,
    previewRackDragReorder = previewRackDragReorder,
    finalizeRackDragReorder = finalizeRackDragReorder,
    ensureDragGhost = ensureDragGhost,
    updateDragGhost = updateDragGhost,
    hideDragGhost = hideDragGhost,
    resetDragState = resetDragState,
    dragState = dragState,
    getRackShellMetaByNodeId = getRackShellMetaByNodeId,
    collectRackFlowSnapshot = collectRackFlowSnapshot,
    pointInsideRackFlowBands = M._pointInsideRackFlowBands,
    requestDynamicModuleSlot = M._requestDynamicModuleSlot,
  })
  syncKeyboardCollapsedFromUtilityDock(ctx)
  _G.__midiSynthRackState = ctx._rackState
  _G.__midiSynthRackModuleSpecs = ctx._rackModuleSpecs
  _G.__midiSynthRackConnections = ctx._rackConnections
  _G.__midiSynthUtilityDock = ctx._utilityDock
  _G.__midiSynthDynamicModuleInfo = {}
  ctx._dynamicModuleSlots = RackModuleFactory.ensureDynamicModuleSlots(ctx)
  M._rebuildDynamicRackModuleState(ctx)
  ctx._applyVoiceModulationTarget = ModulationRouter.applyVoiceModulationTarget
  ctx._resolveDynamicVoiceBundleSample = ModulationRouter.resolveDynamicVoiceBundleSample
  ctx._applyControlModulationTarget = ModulationRouter.applyControlModulationTarget
  ctx._resolveControlModulationSource = ModulationRouter.resolveControlModulationSource
  ctx._resolveVoiceModulationSource = function(innerCtx, sourceId, source, voiceCount)
    return ModulationRouter.resolveDynamicVoiceModulationSource(innerCtx, sourceId, source, voiceCount)
  end
  ctx._onRackConnectionsChanged = function(innerCtx, reason)
    M.applyRackConnectionState(innerCtx, reason)
  end
  M.applyRackConnectionState(ctx, "init")
  ctx._keyboardNote = nil
  ctx._keyboardDirty = true
  ctx._lastUpdateTime = getTime and getTime() or 0
  ctx._lastMidiDeviceScanTime = -1000
  ctx._lastKnownMidiDeviceCount = -1
  ctx._lastBackgroundTickTime = 0
  ctx._lastOscRepaintTime = 0
  ctx._lastEnvRepaintTime = 0
  ctx._midiParamRackDisplayDirty = true
  
  for i = 1, VOICE_COUNT do
    ctx._voices[i] = {
      active = false,
      note = nil,
      stamp = 0,
      gate = 0,
      targetAmp = 0,
      currentAmp = 0,
      sentAmp = 0,
      lastAmpPushTime = 0,
      freq = 220,
      envelopeStage = "idle",
      envelopeLevel = 0,
      envelopeTime = 0,
      envelopeStartLevel = 0,
      eoc = 0,
    }
    ctx._midiVoices[i] = {
      active = false,
      note = nil,
      stamp = 0,
      gate = 0,
      targetAmp = 0,
      currentAmp = 0,
      sentAmp = 0,
      lastAmpPushTime = 0,
      freq = 220,
      envelopeStage = "idle",
      envelopeLevel = 0,
      envelopeTime = 0,
      envelopeStartLevel = 0,
      eoc = 0,
    }
  end
  require("transpose_runtime").publishViewState(ctx)
  require("velocity_mapper_runtime").publishViewState(ctx)
  require("scale_quantizer_runtime").publishViewState(ctx)
  require("note_filter_runtime").publishViewState(ctx)
  require("arp_runtime").publishViewState(ctx)
  require("adsr_runtime").publishViewState(ctx)
  require("attenuverter_bias_runtime").publishViewState(ctx)
  require("lfo_runtime").publishViewState(ctx)
  require("slew_runtime").publishViewState(ctx)
  require("sample_hold_runtime").publishViewState(ctx)
  require("compare_runtime").publishViewState(ctx)
  require("cv_mix_runtime").publishViewState(ctx)
  require("range_mapper_runtime").publishViewState(ctx)
  
  if Midi and Midi.clearCallbacks then
    -- Don't clear callbacks here - we want MIDI to keep working globally
    -- Midi.clearCallbacks()
  end
  
  ctx._globalPrefix = resolveGlobalPrefix(ctx)
  InitBindings.bindComponents(ctx, {
    PATHS = PATHS,
    SAMPLE_SOURCE_OPTIONS = SAMPLE_SOURCE_OPTIONS,
    DRIVE_SHAPE_OPTIONS = DRIVE_SHAPE_OPTIONS,
    BLEND_MODE_OPTIONS = BLEND_MODE_OPTIONS,
    getScopedWidget = getScopedWidget,
    getScopedBehavior = getScopedBehavior,
    setPath = setPath,
    readParam = readParam,
    clamp = clamp,
    round = round,
    sanitizeBlendMode = sanitizeBlendMode,
    setWidgetInteractiveState = setWidgetInteractiveState,
    formatMidiNoteValue = formatMidiNoteValue,
    getTime = getTime,
  })

  InitControls.bindControls(ctx, {
    getScopedWidget = getScopedWidget,
    triggerVoice = triggerVoice,
    releaseVoice = releaseVoice,
    panicVoices = panicVoices,
    refreshMidiDevices = refreshMidiDevices,
    applyMidiSelection = applyMidiSelection,
    syncSelected = syncSelected,
    setKeyboardCollapsed = setKeyboardCollapsed,
    persistDockUiState = M.persistDockUiState,
    syncText = syncText,
    getOctaveLabel = getOctaveLabel,
    syncKeyboardDisplay = syncKeyboardDisplay,
    handleKeyboardClick = handleKeyboardClick,
    saveCurrentState = M.saveCurrentState,
    loadSavedState = M.loadSavedState,
    resetToDefaults = M.resetToDefaults,
    updateDropdownAnchors = updateDropdownAnchors,
    loadRuntimeState = M.loadRuntimeState,
    backgroundTick = backgroundTick,
    setPath = setPath,
    readParam = readParam,
    applyRackConnectionState = M.applyRackConnectionState,
    deleteRackNode = M.deleteRackNode,
    toggleRackNodeWidth = toggleRackNodeWidth,
    spawnPalettePlaceholderAt = M.spawnPalettePlaceholderAt,
    spawnPaletteNodeAt = M.spawnPaletteNodeAt,
    setUtilityDockMode = M.setUtilityDockMode,
    syncDockModeDots = syncDockModeDots,
    ensureUtilityDockState = M.ensureUtilityDockState,
    syncPatchViewMode = syncPatchViewMode,
    onRackDotClick = onRackDotClick,
    ensureRackPaginationState = ensureRackPaginationState,
    updateRackPaginationDots = updateRackPaginationDots,
    setRackViewport = setRackViewport,
    bindWirePortWidget = bindWirePortWidget,
    setupShellDragHandlers = M._setupShellDragHandlers,
    setupResizeToggleHandlers = M._setupResizeToggleHandlers,
    setupDeleteButtonHandlers = M._setupDeleteButtonHandlers,
    setupPaletteDragHandlers = M._setupPaletteDragHandlers,
    syncKeyboardCollapseButton = syncKeyboardCollapseButton,
    RackWireLayer = RackWireLayer,
    refreshManagedLayoutState = refreshManagedLayoutState,
  })
end

function M.resized(ctx, w, h)
  ctx._lastW = w
  ctx._lastH = h
  refreshManagedLayoutState(ctx, w, h)
  updateDropdownAnchors(ctx)
end
function M.update(ctx, rawState)
  activeBehaviorCtx = ctx
  local UpdateSync = require("ui.update_sync")
  UpdateSync.update(ctx, {
    BG_TICK_INTERVAL = BG_TICK_INTERVAL,
    OSC_REPAINT_INTERVAL = OSC_REPAINT_INTERVAL,
    OSC_REPAINT_INTERVAL_WHILE_INTERACTING = OSC_REPAINT_INTERVAL_WHILE_INTERACTING,
    OSC_REPAINT_INTERVAL_MULTI_VOICE = OSC_REPAINT_INTERVAL_MULTI_VOICE,
    ENV_REPAINT_INTERVAL = ENV_REPAINT_INTERVAL,
    ENV_REPAINT_INTERVAL_WHILE_INTERACTING = ENV_REPAINT_INTERVAL_WHILE_INTERACTING,
    MAX_FX_PARAMS = MAX_FX_PARAMS,
    VOICE_COUNT = VOICE_COUNT,
    FILTER_OPTIONS = FILTER_OPTIONS,
    FxDefs = FxDefs,
    PATHS = PATHS,
    getTime = getTime,
    backgroundTick = backgroundTick,
    isUiInteracting = isUiInteracting,
    maybeRefreshMidiDevices = maybeRefreshMidiDevices,
    syncPatchViewMode = syncPatchViewMode,
    RackWireLayer = RackWireLayer,
    readParam = readParam,
    setPath = setPath,
    sanitizeBlendMode = sanitizeBlendMode,
    getVoiceStackingLabels = getVoiceStackingLabels,
    setWidgetInteractiveState = setWidgetInteractiveState,
    setWidgetBounds = setWidgetBounds,
    isPluginMode = isPluginMode,
    activeVoiceCount = VoiceManager.activeVoiceCount,
    voiceSummary = VoiceManager.voiceSummary,
    noteName = noteName,
    formatTime = formatTime,
    syncKeyboardDisplay = syncKeyboardDisplay,
    syncMidiParamRack = function()
      MidiParamRack.sync(ctx, (ctx.widgets or {}).midiParamRack)
    end,
    cleanupPatchbayFromRuntime = cleanupPatchbayFromRuntime,
    patchbayInstances = PatchbayRuntime.getInstances(),
    ensurePatchbayWidgets = ensurePatchbayWidgets,
    syncPatchbayValues = syncPatchbayValues,
    clamp = clamp,
    setWidgetValueSilently = setWidgetValueSilently,
    getModTargetState = function(path)
      return ModulationRouter.getCombinedModTargetState(ctx, path)
    end,
  })
end

function M.cleanup(ctx)
  if activeBehaviorCtx == ctx then
    activeBehaviorCtx = nil
  end
  -- Clear exported hooks if they still point at this instance. Leaving stale
  -- ctx-capturing closures alive across project reloads is crash bait.
  if _G.__midiSynthBackgroundTick == ctx._backgroundTickHook then
    _G.__midiSynthBackgroundTick = nil
  end
  if _G.__midiSynthPanic == ctx._panicHook then
    _G.__midiSynthPanic = nil
  end
  if _G.__midiSynthTriggerNote == ctx._triggerNoteHook then
    _G.__midiSynthTriggerNote = nil
  end
  if _G.__midiSynthReleaseNote == ctx._releaseNoteHook then
    _G.__midiSynthReleaseNote = nil
  end
  if _G.__midiSynthSetAuthoredParam == ctx._setAuthoredParamHook then
    _G.__midiSynthSetAuthoredParam = nil
  end
  if _G.__midiSynthGetModTargetState == ctx._getModTargetStateHook then
    _G.__midiSynthGetModTargetState = nil
  end
  if _G.__midiSynthGetDockPresentationMode == ctx._getDockPresentationModeHook then
    _G.__midiSynthGetDockPresentationMode = nil
  end
  if _G.__midiSynthSetDockPresentationMode == ctx._setDockPresentationModeHook then
    _G.__midiSynthSetDockPresentationMode = nil
  end
  if _G.__midiSynthGetRackRouteDebug == ctx._getRackRouteDebugHook then
    _G.__midiSynthGetRackRouteDebug = nil
  end
  if _G.__midiSynthGetModEndpointRegistry == ctx._getModEndpointRegistryHook then
    _G.__midiSynthGetModEndpointRegistry = nil
  end
  if _G.__midiSynthCompileModRoute == ctx._compileModRouteHook then
    _G.__midiSynthCompileModRoute = nil
  end
  if _G.__midiSynthGetModRouteCompilerDebug == ctx._getModRouteCompilerDebugHook then
    _G.__midiSynthGetModRouteCompilerDebug = nil
  end
  if _G.__midiSynthSetGlobalModRoutes == ctx._setGlobalModRoutesHook then
    _G.__midiSynthSetGlobalModRoutes = nil
  end
  if _G.__midiSynthClearGlobalModRoutes == ctx._clearGlobalModRoutesHook then
    _G.__midiSynthClearGlobalModRoutes = nil
  end
  if _G.__midiSynthSetModSourceValue == ctx._setModSourceValueHook then
    _G.__midiSynthSetModSourceValue = nil
  end
  if _G.__midiSynthEvaluateModRuntime == ctx._evaluateModRuntimeHook then
    _G.__midiSynthEvaluateModRuntime = nil
  end
  if _G.__midiSynthGetModRuntimeDebug == ctx._getModRuntimeDebugHook then
    _G.__midiSynthGetModRuntimeDebug = nil
  end
  if _G.__midiSynthResyncRackConnections == ctx._resyncRackConnectionsHook then
    _G.__midiSynthResyncRackConnections = nil
  end
  if _G.__midiSynthDeleteRackNode == ctx._deleteRackNodeHook then
    _G.__midiSynthDeleteRackNode = nil
  end
  if _G.__midiSynthSpawnPalettePlaceholder == ctx._spawnPalettePlaceholderHook then
    _G.__midiSynthSpawnPalettePlaceholder = nil
  end
  if _G.__midiSynthSpawnPaletteNode == ctx._spawnPaletteNodeHook then
    _G.__midiSynthSpawnPaletteNode = nil
  end
  if _G.__midiSynthToggleRackNodeWidth == ctx._toggleRackNodeWidthHook then
    _G.__midiSynthToggleRackNodeWidth = nil
  end
  if _G.__midiSynthSetRackViewport == ctx._setRackViewportHook then
    _G.__midiSynthSetRackViewport = nil
  end

  if ctx._onMidiDeviceStateChanged ~= nil then
    ctx._onMidiDeviceStateChanged = nil
  end

  -- Note: Midi.clearCallbacks() is still not called here to keep MIDI alive.

  -- Clear patchbay/widget globals that can otherwise keep dead runtime nodes alive.
  invalidatePatchbay(nil, ctx)
  ctx._pendingPatchbayPages = nil
  ctx._patchbayPortRegistry = nil

  if _G.__midiSynthPatchbayPortRegistry == nil or _G.__midiSynthPatchbayPortRegistry == ctx._patchbayPortRegistry then
    _G.__midiSynthPatchbayPortRegistry = nil
  end
  if _G.__midiSynthRackPagination == ctx._rackPagination then
    _G.__midiSynthRackPagination = nil
  end
  if _G.__midiSynthRackWireLayer == RackWireLayer then
    _G.__midiSynthRackWireLayer = nil
  end
  if type(_G) == "table" then
    _G.__midiSynthDynamicModuleSpecs = nil
    _G.__midiSynthDynamicOscillatorAnalysis = nil
    _G.__midiSynthAdsrViewState = nil
    _G.__midiSynthArpViewState = nil
    _G.__midiSynthTransposeViewState = nil
    _G.__midiSynthVelocityMapperViewState = nil
    _G.__midiSynthScaleQuantizerViewState = nil
    _G.__midiSynthNoteFilterViewState = nil
    _G.__midiSynthAttenuverterBiasViewState = nil
    _G.__midiSynthLfoViewState = nil
    _G.__midiSynthSlewViewState = nil
    _G.__midiSynthSampleHoldViewState = nil
    _G.__midiSynthCompareViewState = nil
    _G.__midiSynthCvMixViewState = nil
    _G.__midiSynthRangeMapperViewState = nil
  end

  if _G.__midiSynthRackState == ctx._rackState then
    _G.__midiSynthRackState = nil
  end
  if _G.__midiSynthRackModuleSpecs == ctx._rackModuleSpecs then
    _G.__midiSynthRackModuleSpecs = nil
  end
  if _G.__midiSynthRackConnections == ctx._rackConnections then
    _G.__midiSynthRackConnections = nil
  end
  if _G.__midiSynthUtilityDock == ctx._utilityDock then
    _G.__midiSynthUtilityDock = nil
  end
  if type(_G) == "table" then
    _G.__midiSynthDynamicModuleInfo = nil
  end
  if _G.loadRuntimeState == loadRuntimeState then
    _G.loadRuntimeState = nil
  end
  if _G.saveRuntimeState == saveRuntimeState then
    _G.saveRuntimeState = nil
  end
end

return M
