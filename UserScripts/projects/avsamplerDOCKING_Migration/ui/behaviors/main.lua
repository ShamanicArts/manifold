local M = {}
local AVSD = {
  Mapping = require("behaviors.avsd.mapping"),
  Midi = require("behaviors.avsd.midi"),
  State = require("behaviors.avsd.state"),
  Prof = require("behaviors.avsd.profiler"),
  ML = require("behaviors.avsd.ml"),
  Sampler = require("behaviors.avsd.sampler"),
  Sources = require("behaviors.avsd.sources"),
  Params = require("behaviors.avsd.params"),
  Grid = require("behaviors.avsd.grid"),
  Layout = require("behaviors.avsd.layout"),
  Compositor = require("behaviors.avsd.compositor"),
}
local GRID_DEPS = nil
local LAYOUT_DEPS = nil
local COMPO_DEPS = nil

local NS = "/avsampler"
local MAX = 8
local MAX_MAPPINGS = 8
local MAJOR_OFFSETS = { 0, 2, 4, 5, 7, 9, 11, 12 }
local MAX_CAPTURE_SECONDS = 6.0
local TOOLBAR_H = 28
local VIDEO_CAPTURE_ID = "av_sampler_segmented_capture"
local VIDEO_SAMPLER_ID = "av_sampler_clip"
local PARAM_SYNC_INTERVAL = 1.0 / 30.0
local SEGMENT_INGEST_INTERVAL = 1.0 / 15.0
local POSE_INTERVAL = 1.0 / 12.0
local PLAYBACK_UI_INTERVAL = 1.0 / 20.0
local STATUS_INTERVAL = 0.20
local DEFAULT_CAPTURE_W = 640
local DEFAULT_CAPTURE_H = 480
local ML_SOURCE_PARAM_SPECS = {
  { id = "gain", name = "Gain", min = 0.25, max = 4.0, default = 1.0, step = 0.05 },
  { id = "threshold", name = "Thresh", min = 0.0, max = 1.0, default = 0.5, step = 0.01 },
  { id = "feather", name = "Feather", min = 0.0, max = 1.0, default = 0.15, step = 0.01 },
  { id = "background", name = "BG", min = 0.001, max = 0.35, default = 0.02, step = 0.005 },
}
local KEYPOINTS = {
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle"
}

local DOCK_WINDOWS = {
  { key = "deck",    title = "Deck",                 accent = 0xff22d3ee },
  { key = "stage",   title = "Output / Stage",       accent = 0xfff97316 },
  { key = "sources", title = "Capture / Sources",    accent = 0xffa78bfa },
  { key = "waveform",title = "Waveform",             accent = 0xffaa88aa },
  { key = "params",  title = "Parameters / Inspector", accent = 0xff22c55e },
  { key = "compositor", title = "Compositor", accent = 0xfff97316 },
}

local function bor(...)
  local args = { ... }
  local out = 0
  for i = 1, #args do out = out | args[i] end
  return out
end

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(v) return math.floor((tonumber(v) or 0) + 0.5) end

local function fitBox(maxW, maxH, contentW, contentH)
  maxW = math.max(1, math.floor(tonumber(maxW) or 1))
  maxH = math.max(1, math.floor(tonumber(maxH) or 1))
  contentW = math.max(1, tonumber(contentW) or maxW)
  contentH = math.max(1, tonumber(contentH) or maxH)
  local aspect = contentW / math.max(1, contentH)
  local w = maxW
  local h = math.floor(w / math.max(0.001, aspect) + 0.5)
  if h > maxH then
    h = maxH
    w = math.floor(h * aspect + 0.5)
  end
  local x = math.floor((maxW - w) * 0.5)
  local y = math.floor((maxH - h) * 0.5)
  return x, y, math.max(1, w), math.max(1, h)
end
local function rackFxBasePath(slot) return "/midi/synth/rack/fx/" .. math.max(1, round(slot or 1)) end
local function rackFxTypePath(slot) return rackFxBasePath(slot) .. "/type" end
local function rackFxMixPath(slot) return rackFxBasePath(slot) .. "/mix" end
local function rackFxParamPath(slot, paramIndex) return rackFxBasePath(slot) .. "/p/" .. math.max(0, round(paramIndex or 0)) end

local refreshWaveform
local updatePreviewSurface
local ensureGridCells
local refreshGridCells
local updateGridThumbnails
local resetPanelDocks
local syncShaderSourceParams
local layoutOutputRow
local buildTapPipeline
local syncCol1FromShader
local addColumn
local removeColumn
local colAddFx
local colRemoveFx
local colSourceDescriptor
local colBuildCellPipeline
local colSourceLabel
local colFxLabel
local currentCol1SourceSpec
local sourceSpecForColumn
local setSourceSpecForColumn
local applySourceSpecToHiddenNode
local buildPoseSourcePayload
local pathForSlice = AVSD.Sampler.pathForSlice
local triggerPathForSlice = AVSD.Sampler.triggerPathForSlice
local velocityPathForSlice = AVSD.Sampler.velocityPathForSlice
local applyCaptureWindow = AVSD.Sampler.applyCaptureWindow
local applyVideoWindow = AVSD.Sampler.applyVideoWindow
local doRetroCapture = AVSD.Sampler.doRetroCapture
local setCaptureButtonAppearance = AVSD.Sampler.setCaptureButtonAppearance
local onCaptureButton = AVSD.Sampler.onCaptureButton
local samplePosition = AVSD.Sampler.samplePosition
local nearestSlice = AVSD.Sampler.nearestSlice
local POLY_PATHS = AVSD.Sampler.POLY_PATHS
local SLICE_PATHS = AVSD.Sampler.SLICE_PATHS
refreshWaveform = AVSD.Sampler.refreshWaveform
updatePreviewSurface = AVSD.Sampler.updatePreviewSurface
layoutOutputRow = AVSD.Sampler.layoutOutputRow

local function toNum(v)
  local t = type(v)
  if t == "number" then return v end
  if t == "string" then return tonumber(v) end
  return nil
end

local function setText(w, text) if w and w.setText then w:setText(tostring(text or "")) end end
local function setLabel(w, text) if w and w.setLabel then w:setLabel(tostring(text or "")) end end
local function setOptions(w, opts) if w and w.setOptions then w:setOptions(opts or {}) end end
local function setVisible(w, v) if w and w.setVisible then w:setVisible(v == true) elseif w and w.node and w.node.setVisible then w.node:setVisible(v == true) end end
local function setBounds(w, x, y, ww, hh)
  x, y, ww, hh = math.floor(x or 0), math.floor(y or 0), math.floor(ww or 0), math.floor(hh or 0)
  if w and w.setBounds then w:setBounds(x, y, ww, hh) elseif w and w.node and w.node.setBounds then w.node:setBounds(x, y, ww, hh) end
end
local function setValueSilently(w, value)
  if not (w and w.setValue) then return end
  local cb = w._onChange
  w._onChange = nil
  w:setValue(value)
  w._onChange = cb
end
local function setSelectedSilently(w, value)
  if not (w and w.setSelected) then return end
  local cb = w._onSelect
  w._onSelect = nil
  w:setSelected(value)
  w._onSelect = cb
end

local function readParam(path, fallback)
  if type(getParam) == "function" then
    local ok, v = pcall(getParam, path)
    if ok and v ~= nil then return v end
  end
  return fallback
end

local function writeParam(path, value)
  local n = type(value) == "boolean" and (value and 1 or 0) or (tonumber(value) or 0)
  if type(setParam) == "function" then return setParam(path, n) end
  return false
end

local function bump(path)
  writeParam(path, (readParam(path, 0) + 1) % 1000000)
end

local function writeParamIfChanged(ctx, cacheKey, path, value, epsilon)
  ctx._lastParamWrites = ctx._lastParamWrites or {}
  local numeric = tonumber(value) or 0
  local last = tonumber(ctx._lastParamWrites[cacheKey])
  local threshold = tonumber(epsilon) or 0.0005
  if last ~= nil and math.abs(last - numeric) <= threshold then
    return false
  end
  ctx._lastParamWrites[cacheKey] = numeric
  return writeParam(path, numeric)
end

local function nowSeconds()
  return (type(getTime) == "function" and tonumber(getTime())) or 0
end

local function shouldRunInterval(ctx, key, interval)
  ctx._timers = ctx._timers or {}
  local now = nowSeconds()
  if now <= 0 then return true end
  local last = tonumber(ctx._timers[key]) or -1e9
  if (now - last) >= (tonumber(interval) or 0) then
    ctx._timers[key] = now
    return true
  end
  return false
end

local profileStart = AVSD.Prof.start
local profileEnd = AVSD.Prof.finish

local function dirname(path)
  return (tostring(path or ""):gsub("/+$", ""):match("^(.*)/[^/]+$") or ".")
end

local function join(a, b)
  if tostring(a):sub(-1) == "/" then return tostring(a) .. tostring(b) end
  return tostring(a) .. "/" .. tostring(b)
end

local function parentDir(path)
  local p = tostring(path or ""):gsub("/+$", "")
  return (p:match("^(.*)/[^/]+$") or p) .. "/"
end

local function currentScriptDir()
  local p = (type(getCurrentScriptPath) == "function") and getCurrentScriptPath() or ""
  return (p:match("^(.*)/[^/]+$") or ".") .. "/"
end

local function projectRootDir()
  local dir = currentScriptDir()
  if dir:match("/ui/behaviors/$") then return parentDir(parentDir(dir)) end
  if dir:match("/ui/$") then return parentDir(dir) end
  return dir
end

local function clockInfo()
  local seam = _G.__avsdCtx and _G.__avsdCtx._testSeams and _G.__avsdCtx._testSeams.clock
  if type(seam) == "table" then return seam end
  if type(getAudioClockInfo) == "function" then
    local ok, info = pcall(getAudioClockInfo)
    if ok and type(info) == "table" then return info end
  end
  return { sampleRate = 44100, playTimeSamples = 0, tempo = 120 }
end

local function bindParamWidget(w)
  local path = w and w.config and w.config.paramPath or nil
  if type(path) ~= "string" or path == "" or not w.setValue then return end
  w._onChange = function(v)
    writeParam(path, v)
  end
end

local function relayoutManagedSubtree(widget, width, height)
  local runtime = widget and widget._structuredRuntime or nil
  local record = widget and widget._structuredRecord or nil
  if type(runtime) ~= "table" or type(runtime.notifyRecordHostedResized) ~= "function" or type(record) ~= "table" then
    return false
  end
  local ok = pcall(function()
    runtime:notifyRecordHostedResized(record, width, height)
  end)
  return ok == true
end

local function selectedDeviceIndex(ctx)
  local selected = ctx.deviceSelectIndex or 1
  local dd = ctx.widgets and ctx.widgets.deviceSelect
  if dd and dd.getSelected then selected = dd:getSelected() end
  local entry = ctx._devices and ctx._devices[math.max(1, round(selected))]
  return entry and tonumber(entry.index) or 0
end

local function refreshDevices(ctx)
  local devices = {}
  if capture and capture.listDevices then
    local ok, r = pcall(capture.listDevices)
    if ok and type(r) == "table" then devices = r end
  end
  ctx._devices = devices
  local labels = {}
  for i = 1, #devices do
    labels[i] = tostring(devices[i].label or devices[i].name or devices[i].path or ("Device " .. tostring(devices[i].index or i - 1)))
  end
  if #labels == 0 then labels[1] = "Device 0" end
  ctx._deviceLabels = labels
  ctx.deviceSelectIndex = 1
  setOptions(ctx.widgets.deviceSelect, labels)
  setSelectedSilently(ctx.widgets.deviceSelect, 1)
  setOptions(ctx.widgets.sourceDeviceSelect, labels)
  setSelectedSilently(ctx.widgets.sourceDeviceSelect, 1)
end

canonicalAspectSizeForSpec = function(ctx, spec, depth)
  depth = depth or 0
  if depth > 4 then
    return math.max(1, round(ctx.outputW or 1920)), math.max(1, round(ctx.outputH or 1080))
  end
  local kind = spec and spec.kind or "webcam"
  if kind == "webcam" or kind == "ml" then
    local frame = (capture and capture.getFrameInfo and capture.getFrameInfo()) or {}
    if frame.valid and tonumber(frame.width) and tonumber(frame.height) then
      return math.max(1, round(frame.width)), math.max(1, round(frame.height))
    end
    return math.max(1, round(ctx.outputW or 1920)), math.max(1, round(ctx.outputH or 1080))
  elseif kind == "columntap" then
    local sourceCol = tonumber(spec.sourceCol) or 1
    local nextSpec = sourceSpecForColumn and sourceSpecForColumn(ctx, sourceCol) or nil
    if nextSpec and nextSpec ~= spec then
      return canonicalAspectSizeForSpec(ctx, nextSpec, depth + 1)
    end
    return math.max(1, round(ctx.outputW or 1920)), math.max(1, round(ctx.outputH or 1080))
  end
  return math.max(1, round(ctx.outputW or 1920)), math.max(1, round(ctx.outputH or 1080))
end

canonicalAspectSize = function(ctx)
  local spec = (sourceSpecForColumn and sourceSpecForColumn(ctx, 1)) or currentCol1SourceSpec(ctx)
  return canonicalAspectSizeForSpec(ctx, spec, 0)
end

syncCanonicalSurfaceBounds = function(ctx)
  local w, h = canonicalAspectSize(ctx)
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

local function updateOutputAspect(ctx)
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
  local cw, ch = canonicalAspectSize(ctx)
  local fi = ctx.widgets.frameInfo
  if fi and fi.setText then
    fi:setText(string.format("Frame: %dx%d (%.2f:1)", cw, ch, cw / math.max(1, ch)))
  end
  syncCanonicalSurfaceBounds(ctx)
end

local function openWebcam(ctx)
  local idx = selectedDeviceIndex(ctx)
  -- Output aspect is just presentation. Tying camera capture to 1080p blew up
  -- the live uploads/shader passes for every viewport and thumbnail.
  local capW, capH = DEFAULT_CAPTURE_W, DEFAULT_CAPTURE_H
  local ok = false
  if capture and capture.open then ok = capture.open(idx, capW, capH, 30) end
  setText(ctx.widgets.webcamStatus, ok and ("Webcam: open device " .. idx .. " @" .. capW .. "x" .. capH) or "Webcam: open failed")
  AVSD.ML.bindInputSurfaces(ctx)
  updateOutputAspect(ctx)
end

local function closeWebcam(ctx)
  if capture and capture.close then capture.close() end
  setText(ctx.widgets.webcamStatus, "Webcam: closed")
end

local function letterbox(vpW, vpH, vidW, vidH)
  if vidW <= 0 or vidH <= 0 then return 0, 0, vpW, vpH end
  local va, pa = vidW / vidH, vpW / vpH
  if va > pa then local dh = vpW / va return 0, math.floor((vpH - dh) / 2), vpW, math.floor(dh) end
  local dw = vpH * va
  return math.floor((vpW - dw) / 2), 0, math.floor(dw), vpH
end

local function applyMappingTrack(ctx, track)
  local mapping = ctx.mappings[track]
  if not mapping or not mapping.enabled then return nil end
  local sourceValue = clamp(AVSD.ML.poseSourceValue(ctx, track), 0, 1)
  if not mapping.invert then sourceValue = 1.0 - sourceValue end
  local target, targetIndex = AVSD.Mapping.targetSpec(mapping.target or 1)
  local minNorm = clamp(mapping.min or 0, 0, 1)
  local maxNorm = clamp(mapping.max or 1, 0, 1)
  local normalizedTarget = minNorm + sourceValue * (maxNorm - minNorm)
  local value = target.min + normalizedTarget * (target.max - target.min)
  if target.boolean then
    value = normalizedTarget >= 0.5 and 1 or 0
  elseif target.integer then
    value = round(value)
  end
  writeParamIfChanged(ctx, "mapping." .. track .. "." .. target.path, target.path, value, target.epsilon or 0.002)
  return {
    track = track,
    sourceValue = sourceValue,
    value = value,
    targetIndex = targetIndex,
    targetLabel = target.label,
  }
end

local function applyMapping(ctx)
  profileStart(ctx, "applyMapping")
  local active, firstSummary = 0, nil
  for t = 1, MAX_MAPPINGS do
    if ctx.mappings[t] and ctx.mappings[t].enabled then
      active = active + 1
      local summary = applyMappingTrack(ctx, t)
      if firstSummary == nil and summary ~= nil then firstSummary = summary end
    end
  end
  if active <= 0 then profileEnd(ctx, "applyMapping"); setText(ctx.widgets.mappingStatus, "Mapping: disabled"); return end
  if firstSummary then
    setText(ctx.widgets.mappingStatus, string.format("Mapping: %d active | T%d %s %.2f → %.3f", active, firstSummary.track, firstSummary.targetLabel, firstSummary.sourceValue, firstSummary.value))
  else
    setText(ctx.widgets.mappingStatus, string.format("Mapping: %d active", active))
  end
  profileEnd(ctx, "applyMapping")
end

local function cloneTable(t)
  if type(t) ~= "table" then return t end
  local out = {}
  for k, v in pairs(t) do
    out[k] = type(v) == "table" and cloneTable(v) or v
  end
  return out
end

local defaultMLSourceSpec = AVSD.Sources.defaultMLSourceSpec
materializeGeneratorParams = AVSD.Sources.materializeGeneratorParams
currentCol1SourceSpec = AVSD.Sources.currentCol1SourceSpec
sourceSpecForColumn = AVSD.Sources.sourceSpecForColumn
setSourceSpecForColumn = function(ctx, col, spec)
  return AVSD.Sources.setSourceSpecForColumn(ctx, col, spec, {
    writeParam = writeParam,
    setSelectedSilently = setSelectedSilently,
    syncShaderSourceParams = syncShaderSourceParams,
    updateOutputAspect = updateOutputAspect,
    updateShader = updateShader,
    colInit = AVSD.State.colInit,
    updateGridThumbnails = updateGridThumbnails,
  })
end
buildPoseSourcePayload = AVSD.Sources.buildPoseSourcePayload
applySourceSpecToHiddenNode = function(ctx, spec, key)
  return AVSD.Sources.applySourceSpecToHiddenNode(ctx, spec, key, {
    canonicalAspectSize = canonicalAspectSize,
    stackNodeIdForTap = stackNodeIdForTap,
  })
end
local function buildShaderSourceDescriptor(ctx)
  local spec = currentCol1SourceSpec(ctx)
  local descriptor, choice = applySourceSpecToHiddenNode(ctx, spec, "col1_source")
  return descriptor, choice
end

function updateShader(ctx)
  profileStart(ctx, "updateShader")
  if not (ctx.widgets.outputViewport and ctx.widgets.outputViewport.node) then profileEnd(ctx, "updateShader"); return end
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
  local source, choice = buildShaderSourceDescriptor(ctx)
  if shaders and shaders.buildPipeline then
    local ok, payload = pcall(shaders.buildPipeline, layers, "contain", source)
    if ok and payload then
      -- Build a signature to detect actual payload changes
      local srcSpec = currentCol1SourceSpec(ctx) or { kind = "webcam" }
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
        updateGridThumbnails(ctx)
      end
    end
  end
  updateStackRenderNodes(ctx)
  local srcLabel = colSourceLabel(ctx, 1)
  setText(ctx.widgets.shaderStatus, string.format("Shader: %s %s", srcLabel or (choice and choice.name) or "Webcam", ctx.effects[(ctx.shader.layers[ctx.shader.activeLayer] or {}).effectIndex or 1] and ctx.effects[(ctx.shader.layers[ctx.shader.activeLayer] or {}).effectIndex or 1].name or "--"))
  profileEnd(ctx, "updateShader")
end

local refreshShaderLists = AVSD.Sources.refreshShaderLists

local function syncModePanels(ctx)
  local isSlice = round(readParam(NS .. "/mode", 0)) == 1
  setVisible(ctx.widgets.polyEmbed, not isSlice)
  setVisible(ctx.widgets.sliceEmbed, isSlice)
  setVisible(ctx.widgets.pitchTracking, not isSlice)
  setVisible(ctx.widgets.voiceCount, not isSlice)
  setVisible(ctx.widgets.playStart, not isSlice)
  setVisible(ctx.widgets.loopStart, not isSlice)
  setVisible(ctx.widgets.loopEnd, not isSlice)
  setVisible(ctx.widgets.crossfade, not isSlice)
  setVisible(ctx.widgets.oneShot, not isSlice)
  setVisible(ctx.widgets.selectedSlice, isSlice)
  setVisible(ctx.widgets.auditionSelected, isSlice)
  setVisible(ctx.widgets.sliceHelp, isSlice)
end

local function syncShaderEditor(ctx)
  local sel = ctx.selection
  local effect, params, enabled, currentEffectIndex
  local layerOrSlot = 1

  if sel and sel.col == 1 then
    -- Column 1: read from ctx.shader
    local L = ctx.shader.layers[ctx.shader.activeLayer]
    currentEffectIndex = L.effectIndex or 1
    effect = ctx.effects[currentEffectIndex] or { params = {} }
    params = L.params
    enabled = L.enabled
    layerOrSlot = ctx.shader.activeLayer
    setSelectedSilently(ctx.widgets.shaderLayer, ctx.shader.activeLayer)
  elseif sel and sel.col > 1 then
    local cd = ctx._colData and ctx._colData[sel.col]
    local fxSlot = sel.row - 1
    if cd and cd.fx[fxSlot] then
      local f = cd.fx[fxSlot]
      currentEffectIndex = f.effectIndex or 1
      effect = ctx.effects[currentEffectIndex] or { params = {} }
      params = f.params
      enabled = f.enabled
      layerOrSlot = fxSlot
      setSelectedSilently(ctx.widgets.shaderLayer, fxSlot)
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

  setSelectedSilently(ctx.widgets.effectSelect, math.max(1, math.min(#(ctx.effects or {}), round(currentEffectIndex or 1))))
  if ctx.widgets.shaderEnabled and ctx.widgets.shaderEnabled.setValue then setValueSilently(ctx.widgets.shaderEnabled, enabled == true) end

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
      setVisible(sl, true)
      local normalized = params[p] or tonumber(spec.default) or 0
      local displayVal = clamp(pmin + normalized * (pmax - pmin), pmin, pmax)
      setValueSilently(sl, displayVal)
    else
      setVisible(sl, false)
    end
  end
end

local function syncParamsFromHost(ctx)
  profileStart(ctx, "syncParamsFromHost")
  local changedShader = false
  local oldSeg = { ctx.seg.gain, ctx.seg.threshold, ctx.seg.feather, ctx.seg.invert }
  ctx.seg.gain = clamp(readParam(NS .. "/seg/gain", ctx.seg.gain), 0.25, 4)
  ctx.seg.threshold = clamp(readParam(NS .. "/seg/threshold", ctx.seg.threshold), 0, 1)
  ctx.seg.feather = clamp(readParam(NS .. "/seg/feather", ctx.seg.feather), 0, 1)
  ctx.seg.invert = readParam(NS .. "/seg/invert", ctx.seg.invert and 1 or 0) > 0.5
  ctx.poseConf = clamp(readParam(NS .. "/pose/confidence", ctx.poseConf), 0, 1)
  if oldSeg[1] ~= ctx.seg.gain or oldSeg[2] ~= ctx.seg.threshold or oldSeg[3] ~= ctx.seg.feather or oldSeg[4] ~= ctx.seg.invert then AVSD.ML.bindInputSurfaces(ctx) end
  setValueSilently(ctx.widgets.segGain, ctx.seg.gain)
  setValueSilently(ctx.widgets.segThreshold, ctx.seg.threshold)
  setValueSilently(ctx.widgets.segFeather, ctx.seg.feather)
  setValueSilently(ctx.widgets.poseConf, ctx.poseConf)
  setValueSilently(ctx.widgets.segInvert, ctx.seg.invert)

  local mode = round(readParam(NS .. "/mode", 0))
  ctx.captureMode = round(readParam(NS .. "/capture_mode", ctx.captureMode or 0))
  ctx._selectedSlice = math.max(1, math.min(MAX, round(readParam(NS .. "/selected_slice", ctx._selectedSlice or 1))))
  setValueSilently(ctx.widgets.mode, mode > 0.5)
  setValueSilently(ctx.widgets.captureMode, ctx.captureMode > 0.5)
  setValueSilently(ctx.widgets.captureSeconds, clamp(readParam(NS .. "/capture_seconds", 4), 0.25, MAX_CAPTURE_SECONDS))
  setValueSilently(ctx.widgets.speed, clamp(readParam(NS .. "/speed", 1), -2, 4))
  setValueSilently(ctx.widgets.output, clamp(readParam(NS .. "/output", 0.8), 0, 2))
  setValueSilently(ctx.widgets.rootNote, clamp(readParam(NS .. "/root_note", 60), 0, 127))
  setValueSilently(ctx.widgets.pitchTracking, readParam(NS .. "/pitch_tracking", 1) > 0.5)
  setValueSilently(ctx.widgets.voiceCount, clamp(readParam(NS .. "/voice_count", MAX), 1, MAX))
  setValueSilently(ctx.widgets.playStart, clamp(readParam(NS .. "/play_start", 0), 0, 1))
  setValueSilently(ctx.widgets.loopStart, clamp(readParam(NS .. "/loop_start", 0), 0, 1))
  setValueSilently(ctx.widgets.loopEnd, clamp(readParam(NS .. "/loop_end", 1), 0, 1))
  setValueSilently(ctx.widgets.crossfade, clamp(readParam(NS .. "/crossfade", 0.03), 0, 0.5))
  setValueSilently(ctx.widgets.oneShot, readParam(NS .. "/one_shot", 0) > 0.5)
  setSelectedSilently(ctx.widgets.selectedSlice, ctx._selectedSlice)
  syncModePanels(ctx)
  setCaptureButtonAppearance(ctx)

  local sourceIndex = math.max(1, math.min(#(ctx.sources or {}), round(readParam(NS .. "/shader/source", ctx.shader.sourceIndex))))
  if sourceIndex ~= ctx.shader.sourceIndex then
    ctx.shader.sourceIndex = sourceIndex
    setSelectedSilently(ctx.widgets.sourceSelect, sourceIndex)
    local col1spec = currentCol1SourceSpec(ctx)
    if not col1spec or col1spec.kind == "webcam" or col1spec.kind == "generator" then
      ctx._col1SourceSpec = nil
      currentCol1SourceSpec(ctx)
      changedShader = true
    end
    syncShaderSourceParams(ctx)
    if ctx.selection and ctx.selection.col == 1 and ctx.selection.row == 1 then
      ctx.selection = { col = 1, row = 1 }
    end
  end
  local activeLayer = math.max(1, math.min(8, round(readParam(NS .. "/shader/active_layer", ctx.shader.activeLayer))))
  if activeLayer ~= ctx.shader.activeLayer then
    ctx.shader.activeLayer = activeLayer
    syncShaderEditor(ctx)
    if ctx.selection and ctx.selection.col == 1 and ctx.selection.row > 1 then
      ctx.selection = { col = 1, row = 1 + activeLayer }
    end
  end
  for l = 1, 8 do
    local L = ctx.shader.layers[l]
    local en = readParam(NS .. "/shader/layer/" .. l .. "/enabled", L.enabled and 1 or 0) > 0.5
    local eff = math.max(1, math.min(#(ctx.effects or {}), round(readParam(NS .. "/shader/layer/" .. l .. "/effect", L.effectIndex))))
    if en ~= L.enabled or eff ~= L.effectIndex then L.enabled = en; L.effectIndex = eff; changedShader = true end
    for p = 1, 9 do
      local v = clamp(readParam(NS .. "/shader/layer/" .. l .. "/param/" .. p, L.params[p] or 0.5), 0, 1)
      if math.abs(v - (L.params[p] or 0)) > 0.0001 then L.params[p] = v; changedShader = true end
    end
  end
  if changedShader then updateShader(ctx); syncShaderEditor(ctx) end

  for t = 1, MAX_MAPPINGS do
    local m = ctx.mappings[t] or AVSD.Mapping.defaultMapping(t)
    ctx.mappings[t] = m
    m.enabled = readParam(NS .. "/mapping/" .. t .. "/enabled", m.enabled and 1 or 0) > 0.5
    m.source = math.max(1, math.min(#AVSD.ML.POSE_SOURCES, round(readParam(NS .. "/mapping/" .. t .. "/source", m.source or 1))))
    m.target = math.max(1, math.min(#AVSD.Mapping.TARGETS, round(readParam(NS .. "/mapping/" .. t .. "/target", m.target or 1))))
    m.min = clamp(readParam(NS .. "/mapping/" .. t .. "/min", m.min or 0), 0, 1)
    m.max = clamp(readParam(NS .. "/mapping/" .. t .. "/max", m.max or 1), 0, 1)
    m.invert = readParam(NS .. "/mapping/" .. t .. "/invert", m.invert and 1 or 0) > 0.5
    setValueSilently(ctx.widgets["mapping" .. t .. "Enable"], m.enabled)
    setSelectedSilently(ctx.widgets["mapping" .. t .. "Source"], m.source)
    setSelectedSilently(ctx.widgets["mapping" .. t .. "Target"], m.target)
    setValueSilently(ctx.widgets["mapping" .. t .. "Min"], m.min)
    setValueSilently(ctx.widgets["mapping" .. t .. "Max"], m.max)
    setValueSilently(ctx.widgets["mapping" .. t .. "Invert"], m.invert)
  end

  AVSD.ML.bindInputSurfaces(ctx)
  profileEnd(ctx, "syncParamsFromHost")
end

local viewportSize = function()
  return AVSD.Layout.viewportSize({ toNum = toNum })
end
local projectContentBounds = function(ctx)
  return AVSD.Layout.projectContentBounds(ctx, { toNum = toNum })
end
local windowName = AVSD.Layout.windowName
local split = AVSD.Layout.split
local buildDeckLayout = AVSD.Layout.buildDeckLayout
local buildStageLayout = AVSD.Layout.buildStageLayout
local buildInspectorLayout = AVSD.Layout.buildInspectorLayout
local syncToolbarButtons = function(ctx)
  return AVSD.Layout.syncToolbarButtons(ctx, { setValueSilently = setValueSilently, setVisible = setVisible })
end
local defaultGridAlignment = AVSD.Layout.defaultGridAlignment
local setLayoutPreset = function(ctx, preset)
  return AVSD.Layout.setLayoutPreset(ctx, preset, { setValueSilently = setValueSilently, setVisible = setVisible })
end
local layoutToolbar = function(ctx)
  return AVSD.Layout.layoutToolbar(ctx, { setBounds = setBounds, setValueSilently = setValueSilently, setVisible = setVisible })
end

local function layoutTransportEmbed(ctx, w, h)
  setBounds(ctx.widgets.transportEmbed, 0, 0, w, h)
  local pad, gap = 8, 6
  local sw = math.floor((w - pad * 2 - gap * 2) / 3)
  setBounds(ctx.widgets.speed, pad, 25, sw, 17)
  setBounds(ctx.widgets.output, pad + sw + gap, 25, sw, 17)
  setBounds(ctx.widgets.rootNote, pad + (sw + gap) * 2, 25, math.max(1, w - pad * 2 - (sw + gap) * 2), 17)
  setBounds(ctx.widgets.midiInput, pad, 50, math.max(80, w - pad * 2 - 54), 18)
  setBounds(ctx.widgets.midiRefresh, w - pad - 48, 50, 48, 18)
  setBounds(ctx.widgets.midiStatus, pad, math.max(73, h - 18), math.max(1, w - pad * 2), 13)
end

local function layoutPolyEmbed(ctx, w, h)
  setBounds(ctx.widgets.polyEmbed, 0, 0, w, h)
  local pad, gap = 8, 6
  local row1Y, row2Y, row3Y = 25, 50, 74
  local sw = math.max(48, math.floor((w - pad * 2 - gap * 2) / 3))
  setBounds(ctx.widgets.pitchTracking, pad, row1Y, math.max(56, sw - 8), 18)
  setBounds(ctx.widgets.voiceCount, pad + sw + gap, row1Y, sw, 17)
  setBounds(ctx.widgets.playStart, pad + (sw + gap) * 2, row1Y, math.max(72, w - pad - (pad + (sw + gap) * 2)), 17)
  local row2W = math.max(56, math.floor((w - pad * 2 - gap * 2) / 3))
  setBounds(ctx.widgets.loopStart, pad, row2Y, row2W, 17)
  setBounds(ctx.widgets.loopEnd, pad + row2W + gap, row2Y, row2W, 17)
  setBounds(ctx.widgets.crossfade, pad + (row2W + gap) * 2, row2Y, math.max(62, w - pad - (pad + (row2W + gap) * 2)), 17)
  setBounds(ctx.widgets.oneShot, pad, row3Y, 64, 18)
end

local function layoutSliceEmbed(ctx, w, h)
  setBounds(ctx.widgets.sliceEmbed, 0, 0, w, h)
  local pad = 8
  setBounds(ctx.widgets.selectedSlice, pad, 25, math.max(86, math.floor(w * 0.32)), 18)
  setBounds(ctx.widgets.auditionSelected, pad + math.max(92, math.floor(w * 0.34)), 25, 72, 18)
  setBounds(ctx.widgets.sliceHelp, pad, 50, math.max(1, w - pad * 2), math.max(42, h - 54))
end

syncShaderSourceParams = function(ctx)
  local sourceCol = tonumber(ctx.sourceSelectionCol) or 1
  local spec = sourceSpecForColumn(ctx, sourceCol) or { kind = "webcam" }
  local specParams = {}
  local values = {}

  if spec.kind == "generator" then
    for _, g in ipairs(ctx.sources or {}) do
      if g.kind == "generator" and g.id == spec.sourceId then
        specParams = g.params or {}
        break
      end
    end
    values = spec.params or {}
  elseif spec.kind == "ml" then
    specParams = ML_SOURCE_PARAM_SPECS
    values = spec.params or {}
  end

  for pi = 1, 4 do
    local sl = ctx.widgets["sourceParam" .. pi]
    local pspec = specParams[pi]
    if sl and pspec then
      local pmin = tonumber(pspec.min) or 0
      local pmax = tonumber(pspec.max) or 1
      if sl.setLabel then sl:setLabel(pspec.name or pspec.id or ("SrcP" .. pi)) end
      sl._min = pmin
      sl._max = pmax
      sl._step = tonumber(pspec.step) or 0.01
      setVisible(sl, true)
      local raw = values[pspec.id]
      local displayVal
      if spec.kind == "generator" then
        local norm = raw
        if norm == nil then
          norm = ((tonumber(pspec.default) or pmin) - pmin) / math.max(0.001, pmax - pmin)
        end
        displayVal = clamp(pmin + norm * (pmax - pmin), pmin, pmax)
      else
        if raw == nil then raw = tonumber(pspec.default) or pmin end
        displayVal = clamp(raw, pmin, pmax)
      end
      setValueSilently(sl, displayVal)
    elseif sl then
      setVisible(sl, false)
    end
  end
end

colSourceLabel = function(ctx, col)
  local cd = ctx._colData and ctx._colData[col]
  if not cd or not cd.source then return "Add Source" end
  local src = cd.source
  if src.kind == "mirrored" or src.kind == "webcam" then
    if src.kind == "webcam" then return "Webcam" end
    local spec = currentCol1SourceSpec(ctx)
    if spec and spec.kind == "generator" then
      return spec.sourceId or "Generator"
    elseif spec and spec.kind == "ml" then
      return spec.mlType == "pose" and "Pose" or "Segmented"
    end
    return "Webcam"
  end
  if src.kind == "generator" then
    for _, g in ipairs(ctx.sources or {}) do
      if g.kind == "generator" and g.id == src.sourceId then return g.name or g.id end
    end
    return src.sourceId or "Gen"
  end
  if src.kind == "columntap" then
    return "Stack " .. tostring(src.sourceCol) .. " T" .. tostring(src.tapIndex or 0)
  end
  if src.kind == "ml" then
    return src.mlType == "pose" and "Pose" or "Segmented"
  end
  return "Source"
end

colFxLabel = function(ctx, col, fxSlot)
  local cd = ctx._colData and ctx._colData[col]
  if not cd then return "Slot" end
  local f = cd.fx[fxSlot]
  if not f then return "+ Add FX" end
  local eff = ctx.effects and ctx.effects[f.effectIndex]
  return (eff and (eff.name or eff.id)) or ("Slot " .. fxSlot)
end

local function layoutSourceEmbed(ctx, w, h)
  setBounds(ctx.widgets.sourceEmbed, 0, 0, w, h)
  local pad, gap = 8, 4
  local topY = 25
  local sourceCol = tonumber(ctx.sourceSelectionCol) or 1
  local cd = ctx._colData and ctx._colData[sourceCol]
  local viewingCol2Plus = sourceCol > 1 and cd and cd.source

  if viewingCol2Plus then
    local src = cd.source
    local isParamSource = (src.kind == "generator" or src.kind == "ml")

    setVisible(ctx.widgets.sourceSelect, false)
    setVisible(ctx.widgets.aspectSelect, true)
    setBounds(ctx.widgets.aspectSelect, pad, topY, math.max(96, math.floor((w - pad * 2) * 0.42)), 18)

    local showWebcamControls = (src.kind == "webcam")
    setVisible(ctx.widgets.sourceDeviceSelect, showWebcamControls)
    setVisible(ctx.widgets.sourceRefreshDevices, showWebcamControls)
    setVisible(ctx.widgets.sourceOpenWebcam, showWebcamControls)
    setVisible(ctx.widgets.sourceCloseWebcam, showWebcamControls)

    local srcRowY = showWebcamControls and 69 or 47
    if showWebcamControls then
      local deviceW = math.max(110, w - pad * 2 - 40 - 44 - 48 - gap * 3)
      setBounds(ctx.widgets.sourceDeviceSelect, pad, 47, deviceW, 18)
      setBounds(ctx.widgets.sourceRefreshDevices, pad + deviceW + gap, 47, 40, 18)
      setBounds(ctx.widgets.sourceOpenWebcam, pad + deviceW + gap + 44, 47, 44, 18)
      setBounds(ctx.widgets.sourceCloseWebcam, pad + deviceW + gap + 44 + 48, 47, 48, 18)
    else
      setBounds(ctx.widgets.sourceDeviceSelect, 0, 0, 0, 0)
      setBounds(ctx.widgets.sourceRefreshDevices, 0, 0, 0, 0)
      setBounds(ctx.widgets.sourceOpenWebcam, 0, 0, 0, 0)
      setBounds(ctx.widgets.sourceCloseWebcam, 0, 0, 0, 0)
    end

    if isParamSource then
      local srcCols = 2
      local srcColW = math.max(80, math.floor((w - pad * 2 - gap * (srcCols - 1)) / srcCols))
      for pi = 1, 4 do
        local col = (pi - 1) % srcCols
        local row = math.floor((pi - 1) / srcCols)
        setBounds(ctx.widgets["sourceParam" .. pi], pad + col * (srcColW + gap), srcRowY + row * 22, math.max(1, srcColW - gap), 17)
      end
    else
      for pi = 1, 4 do setBounds(ctx.widgets["sourceParam" .. pi], 0, 0, 0, 0) end
    end

    setBounds(ctx.widgets.frameInfo, pad, math.max(srcRowY + 44, h - 18), math.max(1, w - pad * 2), 14)
    syncShaderSourceParams(ctx)
    return
  end

  -- Column 1 (or no col 2+ source selected)
  setVisible(ctx.widgets.sourceSelect, false)
  setVisible(ctx.widgets.aspectSelect, true)
  setBounds(ctx.widgets.aspectSelect, pad, topY, math.max(96, math.floor((w - pad * 2) * 0.42)), 18)

  local srcSpec = currentCol1SourceSpec(ctx)
  local isParamSource = srcSpec and (srcSpec.kind == "generator" or srcSpec.kind == "ml")
  local deviceY = 47
  if isParamSource then
    setVisible(ctx.widgets.sourceDeviceSelect, false)
    setVisible(ctx.widgets.sourceRefreshDevices, false)
    setVisible(ctx.widgets.sourceOpenWebcam, false)
    setVisible(ctx.widgets.sourceCloseWebcam, false)
    setBounds(ctx.widgets.sourceDeviceSelect, 0, 0, 0, 0)
    setBounds(ctx.widgets.sourceRefreshDevices, 0, 0, 0, 0)
    setBounds(ctx.widgets.sourceOpenWebcam, 0, 0, 0, 0)
    setBounds(ctx.widgets.sourceCloseWebcam, 0, 0, 0, 0)
  else
    setVisible(ctx.widgets.sourceDeviceSelect, true)
    setVisible(ctx.widgets.sourceRefreshDevices, true)
    setVisible(ctx.widgets.sourceOpenWebcam, true)
    setVisible(ctx.widgets.sourceCloseWebcam, true)
    local deviceW = math.max(110, w - pad * 2 - 40 - 44 - 48 - gap * 3)
    setBounds(ctx.widgets.sourceDeviceSelect, pad, deviceY, deviceW, 18)
    setBounds(ctx.widgets.sourceRefreshDevices, pad + deviceW + gap, deviceY, 40, 18)
    setBounds(ctx.widgets.sourceOpenWebcam, pad + deviceW + gap + 44, deviceY, 44, 18)
    setBounds(ctx.widgets.sourceCloseWebcam, pad + deviceW + gap + 44 + 48, deviceY, 48, 18)
  end

  local srcRowY = isParamSource and 47 or 69
  local srcCols = 2
  local srcColW = math.max(80, math.floor((w - pad * 2 - gap * (srcCols - 1)) / srcCols))
  for pi = 1, 4 do
    local col = (pi - 1) % srcCols
    local row = math.floor((pi - 1) / srcCols)
    setBounds(ctx.widgets["sourceParam" .. pi], pad + col * (srcColW + gap), srcRowY + row * 22, math.max(1, srcColW - gap), 17)
  end
  setBounds(ctx.widgets.frameInfo, pad, math.max(srcRowY + 44, h - 18), math.max(1, w - pad * 2), 14)
  syncShaderSourceParams(ctx)
end

local function layoutEffectEmbed(ctx, w, h)
  setBounds(ctx.widgets.effectEmbed, 0, 0, w, h)
  local pad, gap = 8, 4
  local topY = 25
  setBounds(ctx.widgets.shaderLayer, pad, topY, 48, 18)
  setBounds(ctx.widgets.shaderEnabled, pad + 52, topY, 52, 18)
  local effectX = pad + 108
  setBounds(ctx.widgets.effectSelect, effectX, topY, math.max(72, w - pad - effectX), 18)

  local shaderY = 49
  local cols, colW = 3, math.max(92, math.floor((w - pad * 2) / 3))
  for p = 1, 9 do
    local col = (p - 1) % cols
    local row = math.floor((p - 1) / cols)
    setBounds(ctx.widgets["shaderParam" .. p], pad + col * colW, shaderY + row * 22, math.max(1, colW - 6), 18)
  end
  setBounds(ctx.widgets.shaderStatus, pad, math.max(shaderY + 66, h - 18), math.max(1, w - pad * 2), 14)
end

local function layoutMappingEmbed(ctx, w, h)
  setBounds(ctx.widgets.mappingEmbed, 0, 0, w, h)
  local pad, gap = 8, 4
  setBounds(ctx.widgets.mappingHelp, pad, 23, math.max(1, w - pad * 2), 14)
  local enableW, labelW = 42, 18
  local minW, maxW, invertW = 50, 50, 48
  local remaining = math.max(120, w - pad * 2 - labelW - enableW - minW - maxW - invertW - gap * 6)
  local sourceW = math.max(96, math.floor(remaining * 0.46))
  local targetW = math.max(96, remaining - sourceW)
  local xLabel = pad
  local xEnable = xLabel + labelW + gap
  local xSource = xEnable + enableW + gap
  local xTarget = xSource + sourceW + gap
  local xMin = xTarget + targetW + gap
  local xMax = xMin + minW + gap
  local xInvert = xMax + maxW + gap
  for i = 1, MAX_MAPPINGS do
    local y = 41 + (i - 1) * 22
    setBounds(ctx.widgets["track" .. i .. "Label"], xLabel, y + 2, labelW, 14)
    setBounds(ctx.widgets["mapping" .. i .. "Enable"], xEnable, y, enableW, 17)
    setBounds(ctx.widgets["mapping" .. i .. "Source"], xSource, y, sourceW, 17)
    setBounds(ctx.widgets["mapping" .. i .. "Target"], xTarget, y, targetW, 17)
    setBounds(ctx.widgets["mapping" .. i .. "Min"], xMin, y, minW, 16)
    setBounds(ctx.widgets["mapping" .. i .. "Max"], xMax, y, maxW, 16)
    setBounds(ctx.widgets["mapping" .. i .. "Invert"], xInvert, y, math.max(40, w - pad - xInvert), 17)
  end
  setBounds(ctx.widgets.mappingStatus, pad, math.max(222, h - 18), math.max(1, w - pad * 2), 14)
end

local function setDropdownOverlayRoot(dropdown, rootWidget)
  if dropdown and dropdown.node and rootWidget and rootWidget.node then
    dropdown._rootNode = rootWidget.node
    dropdown._absX = nil
    dropdown._absY = nil
  end
end

local function fxComponentWidget(ctx, localId)
  local widgets = ctx and ctx.allWidgets or nil
  if type(widgets) ~= "table" then return nil end
  return widgets["root.embedHost.fxEmbed.fx1.fx1Component." .. tostring(localId or "")]
end

local function anchorFxComponentDropdowns(ctx)
  setDropdownOverlayRoot(fxComponentWidget(ctx, "type_dropdown"), ctx.widgets.fxEmbed)
  setDropdownOverlayRoot(fxComponentWidget(ctx, "xy_x_dropdown"), ctx.widgets.fxEmbed)
  setDropdownOverlayRoot(fxComponentWidget(ctx, "xy_y_dropdown"), ctx.widgets.fxEmbed)
end

local function layoutFxEmbed(ctx, w, h)
  setBounds(ctx.widgets.fxEmbed, 0, 0, w, h)
  local shellH = math.max(120, h - 44)
  setBounds(ctx.widgets.fx1, 0, 22, w, shellH)
  relayoutManagedSubtree(ctx.widgets.fx1, w, shellH)
  if ctx.widgets.fx1Component then
    relayoutManagedSubtree(ctx.widgets.fx1Component, w, math.max(1, shellH - 12))
  end
  anchorFxComponentDropdowns(ctx)
  setBounds(ctx.widgets.fxStatus, 10, math.max(26, h - 18), math.max(1, w - 20), 16)
end

local function layoutInputsEmbed(ctx, w, h)
  setBounds(ctx.widgets.inputsEmbed, 0, 0, w, h)
  local pad, gap = 6, 6
  local y = 8
  local statusH = 46
  local controlsH = 74
  local swMax = math.max(52, math.floor((w - pad * 2 - gap * 6) / 7))
  local cy = y + 4
  setBounds(ctx.widgets.segGain, pad, cy, swMax, 17)
  setBounds(ctx.widgets.segThreshold, pad + (swMax + gap), cy, swMax, 17)
  setBounds(ctx.widgets.segFeather, pad + (swMax + gap) * 2, cy, swMax, 17)
  setBounds(ctx.widgets.segInvert, pad + (swMax + gap) * 3, cy, swMax, 18)
  setBounds(ctx.widgets.poseConf, pad + (swMax + gap) * 4, cy, swMax, 17)
  setBounds(ctx.widgets.showSkeleton, pad + (swMax + gap) * 5, cy, swMax, 18)
  setBounds(ctx.widgets.loadModels, pad + (swMax + gap) * 6, cy, math.max(28, w - pad * 2 - (swMax + gap) * 6), 18)
  local titleY = cy + 22
  setBounds(ctx.widgets.rawTitle, 10, titleY, 90, 12)
  setBounds(ctx.widgets.segTitle, 146, titleY, 90, 12)
  setBounds(ctx.widgets.poseTitle, 282, titleY, 90, 12)
  local statusY = titleY + 15
  setBounds(ctx.widgets.poseStatus, pad, statusY, math.max(1, w - pad * 2), 13)
  setBounds(ctx.widgets.captureStatus, pad, statusY + 14, math.max(1, w - pad * 2), 13)
  setBounds(ctx.widgets.samplerStatus, pad, statusY + 28, math.max(1, w - pad * 2), 13)
  -- Viewports are rendered as ImGui dock windows
  setBounds(ctx.widgets.liveViewport, 0, 0, 0, 0)
  setBounds(ctx.widgets.segViewport, 0, 0, 0, 0)
  setBounds(ctx.widgets.poseViewport, 0, 0, 0, 0)
end

local function layoutWaveformEmbed(ctx, w, h)
  setBounds(ctx.widgets.waveformEmbed, 0, 0, w, h)
  setBounds(ctx.widgets.waveform, 0, 0, 0, 0)  -- rendered as ImGui dock window
  setBounds(ctx.widgets.waveformStatus, 8, 8, math.max(1, w - 16), 14)
end

local function layoutStageEmbed(ctx, w, h)
  setBounds(ctx.widgets.stageEmbed, 0, 0, w, h)
  setBounds(ctx.widgets.outputViewport, 0, 0, w, h)
  setBounds(ctx.widgets.previewStage, 0, 0, 0, 0)
  layoutOutputRow(ctx)
  updatePreviewSurface(ctx)
end

-- Grid Phase 3: selection bridge on top of the Phase 2 clip grid

local GRID_COLS = 4

local function selectedGridClip(ctx)
  return AVSD.Grid.selectedGridClip(ctx)
end

local function selectionSummary(ctx)
  return AVSD.Grid.selectionSummary(ctx)
end

local function selectGridCell(ctx, col, row)
  return AVSD.Grid.selectGridCell(ctx, col, row, {
    writeParam = writeParam,
    setSelectedSilently = setSelectedSilently,
    syncShaderEditor = syncShaderEditor,
  })
end

local ASPECT_OPTIONS = { "Native", "16:9", "4:3", "1:1" }

local function applySourceSelection(ctx, idx)
  idx = math.max(1, math.min(#(ctx.sources or {}), round(idx)))
  local choice = ctx.sources[idx]
  if not choice then return end
  local col = tonumber(ctx.sourceSelectionCol) or 1
  local spec
  if choice.kind == "webcam" then
    spec = { kind = "webcam", sourceIndex = idx }
  elseif choice.kind == "generator" then
    local params = {}
    for _, pspec in ipairs(choice.params or {}) do
      local pmin = tonumber(pspec.min) or 0
      local pmax = tonumber(pspec.max) or 1
      local defaultNorm = ((tonumber(pspec.default) or pmin) - pmin) / math.max(0.001, pmax - pmin)
      params[pspec.id] = clamp(defaultNorm, 0, 1)
    end
    spec = { kind = "generator", sourceIndex = idx, sourceId = choice.id, params = params }
  else
    return
  end
  setSourceSpecForColumn(ctx, col, spec)
  setSelectedSilently(ctx.widgets.sourceSelect, idx)
end

local function applyAspectModeSelection(ctx, idx)
  ctx.aspectMode = ASPECT_OPTIONS[math.max(1, math.min(#ASPECT_OPTIONS, round(idx)))] or "16:9"
  updateOutputAspect(ctx)
end

local function applyActiveLayerSelection(ctx, idx)
  ctx.shader.activeLayer = math.max(1, math.min(8, round(idx)))
  ctx.selection = { col = 1, row = 1 + ctx.shader.activeLayer }
  writeParam(NS .. "/shader/active_layer", ctx.shader.activeLayer)
  setSelectedSilently(ctx.widgets.shaderLayer, ctx.shader.activeLayer)
  syncShaderEditor(ctx)
end

local function applyShaderEnabledSelection(ctx, enabled)
  local v = enabled == true
  local sel = ctx.selection
  local cd = sel and ctx._colData and ctx._colData[sel.col]

  if sel and sel.col == 1 then
    ctx.shader.layers[ctx.shader.activeLayer].enabled = v
    writeParam(NS .. "/shader/layer/" .. ctx.shader.activeLayer .. "/enabled", v and 1 or 0)
    updateShader(ctx)
  elseif cd and sel and sel.row and sel.row > 1 then
    local fxSlot = sel.row - 1
    local f = cd.fx[fxSlot]
    if not f and v and fxSlot >= 1 and fxSlot <= 8 then
      local effectIndex = 1
      if ctx.widgets and ctx.widgets.effectSelect and ctx.widgets.effectSelect.getSelected then
        effectIndex = math.max(1, math.min(#(ctx.effects or {}), round(ctx.widgets.effectSelect:getSelected() or 1)))
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
      updateGridThumbnails(ctx)
    end
  end
  if ctx.widgets.shaderEnabled and ctx.widgets.shaderEnabled.setValue then setValueSilently(ctx.widgets.shaderEnabled, v) end
end

local function applyEffectSelection(ctx, idx)
  local sel = ctx.selection
  idx = math.max(1, math.min(#(ctx.effects or {}), round(idx)))
  local cd = sel and ctx._colData and ctx._colData[sel.col]

  if sel and sel.col == 1 then
    local L = ctx.shader.layers[ctx.shader.activeLayer]
    L.effectIndex = idx
    writeParam(NS .. "/shader/layer/" .. ctx.shader.activeLayer .. "/effect", idx)
    updateShader(ctx)
  elseif cd and sel.row > 1 then
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
      updateGridThumbnails(ctx)
    end
  end
  setSelectedSilently(ctx.widgets.effectSelect, idx)
  syncShaderEditor(ctx)
  syncShaderSourceParams(ctx)
end

local function applyShaderParamDisplay(ctx, p, displayValue)
  local sel = ctx.selection
  if not sel then return end
  local cd = ctx._colData and ctx._colData[sel.col]
  if not cd then return end

  if sel.col == 1 then
    -- Column 1: write to ctx.shader
    local L = ctx.shader.layers[ctx.shader.activeLayer]
    local effect = ctx.effects[L.effectIndex] or {}
    local spec = effect.params and effect.params[p]
    local pmin = tonumber(spec and spec.min) or 0
    local pmax = tonumber(spec and spec.max) or 1
    local normalized = (displayValue - pmin) / math.max(0.001, pmax - pmin)
    L.params[p] = clamp(normalized, 0, 1)
    writeParam(NS .. "/shader/layer/" .. ctx.shader.activeLayer .. "/param/" .. p, L.params[p])
    updateShader(ctx)
  else
    -- Columns 2+: write to colData
    local fxSlot = sel.row - 1
    local f = cd.fx[fxSlot]
    if not f then return end
    local effect = ctx.effects[f.effectIndex] or {}
    local spec = effect.params and effect.params[p]
    local pmin = tonumber(spec and spec.min) or 0
    local pmax = tonumber(spec and spec.max) or 1
    local normalized = (displayValue - pmin) / math.max(0.001, pmax - pmin)
    f.params[p] = clamp(normalized, 0, 1)
    updateGridThumbnails(ctx)
  end
end

local function applySourceParamDisplay(ctx, pi, displayValue)
  local sourceCol = tonumber(ctx.sourceSelectionCol) or 1
  local spec = sourceSpecForColumn(ctx, sourceCol)
  if not spec then return end

  if spec.kind == "generator" then
    local pspec = nil
    for _, g in ipairs(ctx.sources or {}) do
      if g.kind == "generator" and g.id == spec.sourceId then
        pspec = g.params and g.params[pi]
        break
      end
    end
    if not pspec then return end
    local pmin = tonumber(pspec.min) or 0
    local pmax = tonumber(pspec.max) or 1
    local normalized = (displayValue - pmin) / math.max(0.001, pmax - pmin)
    spec.params = spec.params or {}
    spec.params[pspec.id] = clamp(normalized, 0, 1)
  elseif spec.kind == "ml" then
    local pspec = ML_SOURCE_PARAM_SPECS[pi]
    if not pspec then return end
    spec.params = spec.params or {}
    spec.params[pspec.id] = clamp(displayValue, tonumber(pspec.min) or 0, tonumber(pspec.max) or 1)
  else
    return
  end

  setSourceSpecForColumn(ctx, sourceCol, spec)
  if sourceCol == 1 then
    updateShader(ctx)
  else
    updateGridThumbnails(ctx)
  end
end

-- Column data model for the clip grid lives in behaviors/avsd/state.lua.

colSourceDescriptor = function(ctx, col)
  local spec = sourceSpecForColumn(ctx, col)
  if not spec then return { type = "webcam" }, nil end
  if spec.kind == "columntap" then
    return colSourceDescriptor(ctx, spec.sourceCol)
  end
  return applySourceSpecToHiddenNode(ctx, spec, "col" .. tostring(col) .. "_source")
end

colBuildCellPipeline = function(ctx, col, row)
  profileStart(ctx, "colBuildCellPipeline")
  local cd = ctx._colData and ctx._colData[col]
  if not cd or not cd.source then profileEnd(ctx, "colBuildCellPipeline"); return nil end
  if row <= 1 then profileEnd(ctx, "colBuildCellPipeline"); return nil end  -- source cells don't need a pipeline

  local source, _ = colSourceDescriptor(ctx, col)
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
  if ok and payload then return payload end
  return nil
end

stackNodeIdForRow = function(stack, row)
  stack = tonumber(stack) or 1
  row = tonumber(row) or 1
  if row <= 1 then return "__stack_" .. tostring(stack) .. "_source" end
  if row >= 10 then return "__stack_" .. tostring(stack) .. "_output" end
  return "__stack_" .. tostring(stack) .. "_tap_" .. tostring(row - 1)
end

stackNodeIdForTap = function(stack, tapIndex)
  if tapIndex == nil then return stackNodeIdForRow(stack, 10) end
  local ti = tonumber(tapIndex) or 0
  if ti <= 0 then return stackNodeIdForRow(stack, 1) end
  if ti >= 8 then return stackNodeIdForRow(stack, 10) end
  return stackNodeIdForRow(stack, ti + 1)
end

appendSigKV = function(parts, key, value)
  parts[#parts + 1] = tostring(key) .. "=" .. tostring(value)
end

appendSortedParamSig = function(parts, params, prefix)
  if type(params) ~= "table" then return end
  local keys = {}
  for k in pairs(params) do keys[#keys + 1] = tostring(k) end
  table.sort(keys)
  for _, k in ipairs(keys) do
    local v = tonumber(params[k]) or 0
    appendSigKV(parts, (prefix or "p") .. k, math.floor(v * 10000 + 0.5))
  end
end

sourceSpecSignature = function(ctx, col)
  local spec = sourceSpecForColumn(ctx, col)
  if not spec then return "nosource" end
  local parts = { "src", tostring(spec.kind or "webcam") }
  appendSigKV(parts, "sourceIndex", spec.sourceIndex or "")
  appendSigKV(parts, "sourceId", spec.sourceId or "")
  appendSigKV(parts, "mlType", spec.mlType or "")
  appendSigKV(parts, "sourceCol", spec.sourceCol or "")
  appendSigKV(parts, "tapIndex", spec.tapIndex == nil and "output" or spec.tapIndex)
  appendSortedParamSig(parts, spec.params, "sp_")
  return table.concat(parts, "|")
end

stackTapSignature = function(ctx, col, row)
  local parts = { "stack", tostring(col), tostring(row), sourceSpecSignature(ctx, col) }
  local cd = ctx._colData and ctx._colData[col]
  if not cd then return table.concat(parts, "|") end
  local upto = math.max(0, math.min((tonumber(row) or 1) - 1, 8))
  for i = 1, upto do
    local f = cd.fx[i]
    if not f then
      appendSigKV(parts, "fx" .. i, "empty")
    else
      appendSigKV(parts, "fx" .. i .. "_effect", f.effectIndex or 0)
      appendSigKV(parts, "fx" .. i .. "_enabled", f.enabled and 1 or 0)
      for p = 1, 9 do
        appendSigKV(parts, "fx" .. i .. "_p" .. p, math.floor(((f.params and f.params[p]) or 0) * 10000 + 0.5))
      end
    end
  end
  return table.concat(parts, "|")
end

clearNodeSurface = function(node)
  if node and node.clearCustomRenderPayload then
    node:clearCustomRenderPayload()
  end
end

buildNodePassthroughPayload = function(sourceId)
  if not sourceId or sourceId == "" then return nil end
  local ok, payload = pcall(shaders.buildPipeline, {}, "contain", { type = "node", sourceId = sourceId })
  if ok and payload then return payload end
  return nil
end

compositorBlendParams = function(blendOpId)
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

ensureCompositorSurfaceNode = function(ctx, key)
  local rootNode = ctx.root and ctx.root.node
  if not (rootNode and rootNode.addChild) then return nil end
  ctx._compoOutNodes = ctx._compoOutNodes or {}
  local cw, ch = canonicalAspectSize(ctx)
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

ensureStackSurfaceNode = function(ctx, stack, row)
  local key = stackNodeIdForRow(stack, row)
  local rootNode = ctx.root and ctx.root.node
  if not (rootNode and rootNode.addChild) then return nil end
  ctx._stackSurfaceNodes = ctx._stackSurfaceNodes or {}
  local cw, ch = canonicalAspectSize(ctx)
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

updateStackRenderNodes = function(ctx)
  profileStart(ctx, "updateStackRenderNodes")
  syncCanonicalSurfaceBounds(ctx)
  local numStacks = syncClipModel(ctx)
  ctx._stackNodeSigs = ctx._stackNodeSigs or {}

  for stack = 1, numStacks do
    local srcClip = ctx.clips and ctx.clips[stack] and ctx.clips[stack][1]
    local hasSource = srcClip and not srcClip.empty and sourceSpecForColumn(ctx, stack)
    local sourceNode = ensureStackSurfaceNode(ctx, stack, 1)
    if sourceNode then
      local srcSig = hasSource and sourceSpecSignature(ctx, stack) or "empty"
      if ctx._stackNodeSigs[stackNodeIdForRow(stack, 1)] ~= srcSig then
        ctx._stackNodeSigs[stackNodeIdForRow(stack, 1)] = srcSig
        if hasSource then
          local descriptor = colSourceDescriptor(ctx, stack)
          local ok, payload = pcall(shaders.buildPipeline, {}, "contain", descriptor)
          if ok and payload then
            sourceNode:setCustomSurface("gpu_shader", payload)
          else
            clearNodeSurface(sourceNode)
          end
        else
          clearNodeSurface(sourceNode)
        end
      end
    end

    for row = 2, 10 do
      local node = ensureStackSurfaceNode(ctx, stack, row)
      local nodeKey = stackNodeIdForRow(stack, row)
      local clip = ctx.clips and ctx.clips[stack] and ctx.clips[stack][row]
      local active = hasSource and ((row == 10) or (clip and clip.kind == "fx" and clip.enabled))
      local sig = active and ((row == 10 and (stackTapSignature(ctx, stack, 10) .. "|output")) or stackTapSignature(ctx, stack, row)) or "empty"
      if node and ctx._stackNodeSigs[nodeKey] ~= sig then
        ctx._stackNodeSigs[nodeKey] = sig
        if active then
          local payload = colBuildCellPipeline(ctx, stack, row == 10 and 10 or row)
          if payload then
            node:setCustomSurface("gpu_shader", payload)
          else
            clearNodeSurface(node)
          end
        else
          clearNodeSurface(node)
        end
      end
    end
  end
  profileEnd(ctx, "updateStackRenderNodes")
end

buildCompositorGraph = function(ctx)
  local compo = ctx.compositor
  if not (compo and compo.layers) then return nil end
  updateStackRenderNodes(ctx)

  local visible = {}
  local accumulatedKeyByLayer = {}
  local prevKey = nil

  for i = 1, #compo.layers do
    local layer = compo.layers[i]
    if layer and layer.visible then
      local sourceStack = tonumber(layer.sourceColumn) or 1
      local sourceNodeId = stackNodeIdForTap(sourceStack, layer.tapIndex)
      local srcNode = ensureCompositorSurfaceNode(ctx, "_compoSrc_" .. tostring(i))
      if srcNode then
        local payload = buildNodePassthroughPayload(sourceNodeId)
        if payload then
          srcNode:setCustomSurface("gpu_shader", payload)
          local srcKey = "_compoSrc_" .. tostring(i)
          local accKey = srcKey
          if prevKey ~= nil then
            accKey = "_compoAcc_" .. tostring(i)
            local accNode = ensureCompositorSurfaceNode(ctx, accKey)
            if accNode then
              local blendId = layer.blendMode or "normal"
              accNode:setCustomSurface("gpu_composite", {
                version = 1, kind = "compositeQuad", fitMode = "contain",
                bottomNodeId = prevKey, topNodeId = srcKey,
                blendOpId = blendId,
                opacity = layer.opacity or 1.0,
                blendParams = compositorBlendParams(blendId),
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

syncClipModel = function(ctx)
  profileStart(ctx, "syncClipModel")
  ctx.clips = ctx.clips or {}
  ctx._colData = ctx._colData or {}
  AVSD.State.syncCol1FromShader(ctx, { cloneTable = cloneTable, currentCol1SourceSpec = currentCol1SourceSpec })

  -- Build ctx.clips from ctx._colData for ALL columns
  for colId, cd in pairs(ctx._colData) do
    ctx.clips[colId] = {}
    local src = cd.source
    if src then
      ctx.clips[colId][1] = {
        kind = "source",
        sourceType = src.kind == "mirrored" and (ctx.sources[ctx.shader.sourceIndex] or {}).kind or src.kind or "webcam",
        sourceIndex = src.sourceIndex,
        name = colSourceLabel(ctx, colId),
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

  -- Fill remaining columns up to maxCols with empty placeholders
  local colCount = 0
  for _ in pairs(ctx._colData or {}) do colCount = colCount + 1 end
  local maxCols = math.max(GRID_COLS, colCount + 2)
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
  profileEnd(ctx, "syncClipModel")
  return maxCols, 10
end

local function buildTapPipeline(ctx, col, tapIndex)
  if tapIndex <= 1 then return nil end
  return colBuildCellPipeline(ctx, col, tapIndex)
end

local function ensureGridCells(ctx)
  return AVSD.Grid.ensureGridCells(ctx, GRID_DEPS)
end

updateGridThumbnails = function(ctx)
  return AVSD.Grid.updateGridThumbnails(ctx, GRID_DEPS)
end

local function layoutClipGrid(ctx, w, h)
  return AVSD.Grid.layoutClipGrid(ctx, w, h, GRID_DEPS)
end

resetPanelDocks = function(ctx)
  return AVSD.Layout.resetPanelDocks(ctx)
end

local function panelSplit(t)
  return AVSD.Layout.panelSplit(t)
end

local function renderSourcesPanel(ctx)
  return AVSD.Layout.renderSourcesPanel(ctx, LAYOUT_DEPS)
end

local function renderStagePanel(ctx)
  return AVSD.Layout.renderStagePanel(ctx, LAYOUT_DEPS)
end

local function renderWaveformPanel(ctx)
  return AVSD.Layout.renderWaveformPanel(ctx, LAYOUT_DEPS)
end

local function layoutDeckEmbed(ctx, w, h)
  setBounds(ctx.widgets.deckEmbed, 0, 0, w, h)
  local x0, y0 = 8, 25
  local availW, availH = math.max(1, w - 16), math.max(1, h - 32)
  local gap = 4

  if w < 560 then
    for row = 1, 3 do
      setVisible(ctx.widgets["deckLayer" .. row], false)
      setVisible(ctx.widgets["deckLayer" .. row .. "A"], false)
      setVisible(ctx.widgets["deckLayer" .. row .. "B"], false)
      setVisible(ctx.widgets["deckBlend" .. row], false)
    end
    local cols = w < 320 and 2 or 4
    local rows = math.ceil(24 / cols)
    local cellW = math.max(24, math.floor((availW - gap * (cols - 1)) / cols))
    local cellH = math.max(24, math.floor((availH - gap * (rows - 1)) / rows))
    local n = 0
    for row = 1, 3 do
      for i = 1, 8 do
        n = n + 1
        local id = "deckCell" .. row .. "_" .. i
        local col = (n - 1) % cols
        local rr = math.floor((n - 1) / cols)
        local cx = x0 + col * (cellW + gap)
        local cy = y0 + rr * (cellH + gap)
        setBounds(ctx.widgets[id], cx, cy, cellW, cellH)
        setBounds(ctx.widgets[id .. "Thumb"], 2, 2, math.max(1, cellW - 4), math.max(1, cellH - 17))
        setBounds(ctx.widgets[id .. "Label"], 4, math.max(2, cellH - 14), math.max(1, cellW - 8), 12)
      end
    end
    return
  end

  for row = 1, 3 do
    setVisible(ctx.widgets["deckLayer" .. row], true)
    setVisible(ctx.widgets["deckLayer" .. row .. "A"], true)
    setVisible(ctx.widgets["deckLayer" .. row .. "B"], true)
    setVisible(ctx.widgets["deckBlend" .. row], true)
  end
  local rowH = math.max(34, math.floor((availH - 2) / 3))
  local headW = math.max(76, math.floor(availW * 0.07))
  local cellW = math.max(28, math.floor((availW - headW - gap * 8) / 8))
  for row = 1, 3 do
    local y = y0 + (row - 1) * rowH
    setBounds(ctx.widgets["deckLayer" .. row], x0, y + 3, 22, 12)
    setBounds(ctx.widgets["deckLayer" .. row .. "A"], x0 + 28, y, 20, 13)
    setBounds(ctx.widgets["deckLayer" .. row .. "B"], x0 + 50, y, 20, 13)
    setBounds(ctx.widgets["deckBlend" .. row], x0 + 28, y + 18, math.max(42, headW - 34), 11)
    setBounds(ctx.widgets["deckBlendFill" .. row], 0, 0, math.max(12, math.floor((headW - 34) * (0.38 + row * 0.12))), 11)
    for i = 1, 8 do
      local id = "deckCell" .. row .. "_" .. i
      local cx = x0 + headW + (i - 1) * (cellW + gap)
      local ch = math.max(24, rowH - 8)
      setBounds(ctx.widgets[id], cx, y, cellW, ch)
      setBounds(ctx.widgets[id .. "Thumb"], 2, 2, math.max(1, cellW - 4), math.max(1, ch - 17))
      setBounds(ctx.widgets[id .. "Label"], 4, math.max(2, ch - 14), math.max(1, cellW - 8), 12)
    end
  end
end

local function section(title, accent, lines)
  imguiTextColored(accent or 0xff94a3b8, title)
  imguiSeparator()
  for _, line in ipairs(lines or {}) do imguiText(line) end
  imguiSpacing()
end

local function renderEmbeddedPanel(ctx, widgetId, layoutFn, forcedHeight, fitToView)
  local host = ctx.widgets and ctx.widgets[widgetId]
  if not (host and host.node and type(imguiRetainedPanel) == "function") then
    imguiText("Retained panel host unavailable")
    return
  end
  local avail = imguiGetContentRegionAvail()
  local w = math.max(1, math.floor(tonumber(avail.x) or 0))
  local rawH = forcedHeight ~= nil and forcedHeight or (tonumber(avail.y) or 0)
  local h = math.max(1, math.floor(math.min(rawH, tonumber(avail.y) or rawH)))
  layoutFn(ctx, w, h)
  imguiRetainedPanel(host.node, w, h, fitToView == true)
end

local function renderSourceInspectorWindow(ctx)
  return AVSD.Params.renderSourceInspectorWindow(ctx, {
    colSourceLabel = colSourceLabel,
    colFxLabel = colFxLabel,
    setSourceSpecForColumn = setSourceSpecForColumn,
    defaultMLSourceSpec = defaultMLSourceSpec,
    renderEmbeddedPanel = renderEmbeddedPanel,
    layoutSourceEmbed = layoutSourceEmbed,
    clamp = clamp,
  })
end

layoutCompoLayerControls = function(ctx, w, h)
  return AVSD.Compositor.layoutCompoLayerControls(ctx, w, h, COMPO_DEPS)
end

renderCompositorLayerControls = function(ctx)
  return AVSD.Compositor.renderCompositorLayerControls(ctx, COMPO_DEPS)
end

local function renderEffectInspectorWindow(ctx)
  return AVSD.Params.renderEffectInspectorWindow(ctx, {
    colFxLabel = colFxLabel,
    renderEmbeddedPanel = renderEmbeddedPanel,
    layoutEffectEmbed = layoutEffectEmbed,
    renderCompositorLayerControls = renderCompositorLayerControls,
  })
end

local function renderParamTransportWindow(ctx)
  return AVSD.Params.renderParamTransportWindow(ctx, {
    renderEmbeddedPanel = renderEmbeddedPanel,
    layoutTransportEmbed = layoutTransportEmbed,
    layoutSliceEmbed = layoutSliceEmbed,
    layoutPolyEmbed = layoutPolyEmbed,
    round = round,
    readParam = readParam,
  })
end

local function renderParamMappingWindow(ctx)
  return AVSD.Params.renderParamMappingWindow(ctx, {
    renderEmbeddedPanel = renderEmbeddedPanel,
    layoutMappingEmbed = layoutMappingEmbed,
  })
end

local function renderParamFxWindow(ctx)
  return AVSD.Params.renderParamFxWindow(ctx, {
    renderEmbeddedPanel = renderEmbeddedPanel,
    layoutFxEmbed = layoutFxEmbed,
  })
end

local function renderParametersPanel(ctx)
  return AVSD.Params.renderParametersPanel(ctx, {
    panelSplit = panelSplit,
    renderEmbeddedPanel = renderEmbeddedPanel,
    layoutSourceEmbed = layoutSourceEmbed,
    layoutEffectEmbed = layoutEffectEmbed,
    layoutTransportEmbed = layoutTransportEmbed,
    layoutSliceEmbed = layoutSliceEmbed,
    layoutPolyEmbed = layoutPolyEmbed,
    layoutMappingEmbed = layoutMappingEmbed,
    layoutFxEmbed = layoutFxEmbed,
    colSourceLabel = colSourceLabel,
    colFxLabel = colFxLabel,
    setSourceSpecForColumn = setSourceSpecForColumn,
    defaultMLSourceSpec = defaultMLSourceSpec,
    renderCompositorLayerControls = renderCompositorLayerControls,
    clamp = clamp,
    round = round,
    readParam = readParam,
  })
end

local function renderGridToolbar(ctx, parentW)
  return AVSD.Grid.renderGridToolbar(ctx, parentW, GRID_DEPS)
end

local function renderDeckPanel(ctx)
  return AVSD.Grid.renderDeckPanel(ctx, GRID_DEPS)
end

ensureCompositorCells = function(ctx, parentNode)
  return AVSD.Compositor.ensureCompositorCells(ctx, parentNode)
end

compositorLayerCellPipeline = function(ctx, layer)
  return AVSD.Compositor.compositorLayerCellPipeline(ctx, layer, COMPO_DEPS)
end

updateCompositorThumbnails = function(ctx)
  return AVSD.Compositor.updateCompositorThumbnails(ctx, COMPO_DEPS)
end

updateCompositorOutput = function(ctx)
  return AVSD.Compositor.updateCompositorOutput(ctx, COMPO_DEPS)
end

renderCompositorPanel = function(ctx)
  return AVSD.Compositor.renderCompositorPanel(ctx, COMPO_DEPS)
end

local function renderPanel(ctx, win)
  return AVSD.Layout.renderPanel(ctx, win, LAYOUT_DEPS)
end

local function renderFrame(ctx)
  return AVSD.Layout.renderFrame(ctx, LAYOUT_DEPS)
end

function M.init(ctx)
  _G.__avsdCtx = ctx
  ctx.video = videoSampler and videoSampler.new and videoSampler.new({ id = VIDEO_SAMPLER_ID }) or nil
  ctx.videoCap = videoSampler and videoSampler.capture and videoSampler.capture({ id = VIDEO_CAPTURE_ID, maxSeconds = MAX_CAPTURE_SECONDS }) or nil
  ctx.seg = { gain = 1.0, useSigmoid = true, threshold = 0.5, feather = 0.15, invert = false }
  ctx.poseConf = 0.3
  ctx.showSkeleton = true
  ctx._polyPlaying, ctx._polyPos, ctx._slicePlaying, ctx._slicePos = {}, {}, {}, {}
  ctx._panelDocks = {}
  ctx._selectedSlice = math.max(1, math.min(MAX, round(readParam(NS .. "/selected_slice", 1))))
  ctx.shader = { sourceIndex = 1, activeLayer = 1, layers = {} }
  for i = 1, 8 do ctx.shader.layers[i] = { enabled = i == 1, effectIndex = 1, params = {0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5} } end
  ctx.captureMode = round(readParam(NS .. "/capture_mode", 0))
  ctx.captureRecording = false
  ctx.mappings = {}
  for i = 1, MAX_MAPPINGS do ctx.mappings[i] = AVSD.Mapping.defaultMapping(i) end
  ctx.fxSlot = 1
  ctx._layoutPreset = "deck"
  ctx.gridAlignment = "bottom-up"
  ctx.selection = { col = 1, row = 1 + ctx.shader.activeLayer }
  ctx.sourceSelectionCol = 1
  ctx._resizeMode = false
  ctx._dockTreeBuilt = false
  ctx._rebuildDockTree = false
  ctx.outputW = 1920
  ctx.outputH = 1080
  ctx.aspectMode = "16:9"
  ctx._colData = {}  -- column data model, populated by syncCol1FromShader on first grid render
  ctx.selectedView = "grid"  -- "grid" | "compositor"
  ctx.compositor = { orientation = "bottom-up", layers = {} }
  for i = 1, 4 do
    ctx.compositor.layers[i] = {
      sourceColumn = 1,
      tapIndex = nil,
      blendMode = "normal",
      opacity = i == 1 and 1.0 or 0.0,
      visible = i == 1,
      name = "Layer " .. i,
    }
  end
  ctx.compositorSelection = { layerIndex = 1 }
  AVSD.State.syncCol1FromShader(ctx, { cloneTable = cloneTable, currentCol1SourceSpec = currentCol1SourceSpec })
  GRID_DEPS = {
    writeParam = writeParam,
    setSelectedSilently = setSelectedSilently,
    syncShaderEditor = syncShaderEditor,
    profileStart = profileStart,
    profileEnd = profileEnd,
    syncClipModel = syncClipModel,
    sourceSpecSignature = sourceSpecSignature,
    buildNodePassthroughPayload = buildNodePassthroughPayload,
    stackNodeIdForRow = stackNodeIdForRow,
    stackTapSignature = stackTapSignature,
    clearNodeSurface = clearNodeSurface,
    canonicalAspectSize = canonicalAspectSize,
    fitBox = fitBox,
    clamp = clamp,
    setBounds = setBounds,
    colSourceLabel = colSourceLabel,
    colFxLabel = colFxLabel,
    addColumn = AVSD.State.addColumn,
    removeColumn = AVSD.State.removeColumn,
    colAddFx = function(innerCtx, col, fxIndex)
      return AVSD.State.colAddFx(innerCtx, col, fxIndex, { NS = NS, writeParam = writeParam, updateShader = updateShader })
    end,
    colRemoveFx = function(innerCtx, col, row)
      return AVSD.State.colRemoveFx(innerCtx, col, row, { NS = NS, writeParam = writeParam, updateShader = updateShader })
    end,
  }
  LAYOUT_DEPS = {
    toNum = toNum,
    setBounds = setBounds,
    setValueSilently = setValueSilently,
    setVisible = setVisible,
    layoutInputsEmbed = layoutInputsEmbed,
    canonicalAspectSize = canonicalAspectSize,
    fitBox = fitBox,
    layoutOutputRow = layoutOutputRow,
    renderParametersPanel = renderParametersPanel,
    renderDeckPanel = renderDeckPanel,
    renderCompositorPanel = renderCompositorPanel,
    windowName = windowName,
    bor = bor,
  }
  COMPO_DEPS = {
    setBounds = setBounds,
    setVisible = setVisible,
    setOptions = setOptions,
    setSelectedSilently = setSelectedSilently,
    setValueSilently = setValueSilently,
    clamp = clamp,
    round = round,
    colSourceLabel = colSourceLabel,
    renderEmbeddedPanel = renderEmbeddedPanel,
    canonicalAspectSize = canonicalAspectSize,
    fitBox = fitBox,
    profileStart = profileStart,
    profileEnd = profileEnd,
    buildCompositorGraph = buildCompositorGraph,
    buildNodePassthroughPayload = buildNodePassthroughPayload,
    clearNodeSurface = clearNodeSurface,
    colBuildCellPipeline = colBuildCellPipeline,
    colSourceDescriptor = colSourceDescriptor,
  }

  for _, w in pairs(ctx.allWidgets or {}) do
    if type(w) == "table" then
      if type(w.config) == "table" and type(w.config.paramPath) == "string" then bindParamWidget(w) end
    end
  end

  if ctx.widgets.embedHost then
    setVisible(ctx.widgets.embedHost, false)
    if ctx.widgets.embedHost.node and ctx.widgets.embedHost.node.setInterceptsMouse then
      ctx.widgets.embedHost.node:setInterceptsMouse(false, false)
    end
  end

  setDropdownOverlayRoot(ctx.widgets.deviceSelect, ctx.root)
  setDropdownOverlayRoot(ctx.widgets.midiInput, ctx.widgets.transportEmbed)
  setDropdownOverlayRoot(ctx.widgets.sourceSelect, ctx.widgets.sourceEmbed)
  setDropdownOverlayRoot(ctx.widgets.aspectSelect, ctx.widgets.sourceEmbed)
  setDropdownOverlayRoot(ctx.widgets.sourceDeviceSelect, ctx.widgets.sourceEmbed)
  setDropdownOverlayRoot(ctx.widgets.shaderLayer, ctx.widgets.effectEmbed)
  setDropdownOverlayRoot(ctx.widgets.effectSelect, ctx.widgets.effectEmbed)
  setDropdownOverlayRoot(ctx.widgets.selectedSlice, ctx.widgets.sliceEmbed)
  setDropdownOverlayRoot(ctx.widgets.compoColumn, ctx.widgets.compoLayerEmbed)
  setDropdownOverlayRoot(ctx.widgets.compoTap, ctx.widgets.compoLayerEmbed)
  setDropdownOverlayRoot(ctx.widgets.compoBlend, ctx.widgets.compoLayerEmbed)
  -- FX slot dropdowns live inside a nested component runtime, so they are not in
  -- ctx.widgets. If we don't grab the real instances from ctx.allWidgets, they
  -- keep their default global root and the popovers get parented to the hidden
  -- script root instead of fxEmbed.
  anchorFxComponentDropdowns(ctx)
  for i = 1, MAX_MAPPINGS do
    setDropdownOverlayRoot(ctx.widgets["mapping" .. i .. "Source"], ctx.widgets.mappingEmbed)
    setDropdownOverlayRoot(ctx.widgets["mapping" .. i .. "Target"], ctx.widgets.mappingEmbed)
  end

  refreshShaderLists(ctx)
  syncShaderEditor(ctx)
  syncShaderSourceParams(ctx)
  updateOutputAspect(ctx)
  if ctx.widgets.aspectSelect then
    local aspectIdx = 2
    if ctx.aspectMode == "Native" then aspectIdx = 1
    elseif ctx.aspectMode == "16:9" then aspectIdx = 2
    elseif ctx.aspectMode == "4:3" then aspectIdx = 3
    elseif ctx.aspectMode == "1:1" then aspectIdx = 4 end
    setSelectedSilently(ctx.widgets.aspectSelect, aspectIdx)
  end
  updateShader(ctx)
  refreshDevices(ctx)
  AVSD.Midi.refresh(ctx)
  if Audio == nil or (Audio.isPlugin and not Audio.isPlugin()) then
    if not AVSD.Midi.currentMidiLabel() then AVSD.Midi.openPreferred(ctx) end
  end
  AVSD.ML.loadModels(ctx)
  AVSD.Prof.init(ctx)
  AVSD.ML.bindInputSurfaces(ctx)
  AVSD.ML.ensurePoseOverlay(ctx)
  layoutToolbar(ctx)
  syncParamsFromHost(ctx)

  ctx.widgets.refreshDevices._onClick = function() refreshDevices(ctx) end
  if ctx.widgets.deviceSelect then
    ctx.widgets.deviceSelect._onSelect = function(idx)
      ctx.deviceSelectIndex = math.max(1, round(idx))
      setSelectedSilently(ctx.widgets.sourceDeviceSelect, ctx.deviceSelectIndex)
    end
  end
  if ctx.widgets.sourceDeviceSelect then
    ctx.widgets.sourceDeviceSelect._onSelect = function(idx)
      ctx.deviceSelectIndex = math.max(1, round(idx))
      setSelectedSilently(ctx.widgets.deviceSelect, ctx.deviceSelectIndex)
    end
  end
  ctx.widgets.openWebcam._onClick = function() openWebcam(ctx) end
  ctx.widgets.closeWebcam._onClick = function() closeWebcam(ctx) end
  if ctx.widgets.sourceRefreshDevices then ctx.widgets.sourceRefreshDevices._onClick = function() refreshDevices(ctx) end end
  if ctx.widgets.sourceOpenWebcam then ctx.widgets.sourceOpenWebcam._onClick = function() openWebcam(ctx) end end
  if ctx.widgets.sourceCloseWebcam then ctx.widgets.sourceCloseWebcam._onClick = function() closeWebcam(ctx) end end
  ctx.widgets.loadModels._onClick = function() AVSD.ML.loadModels(ctx) end
  ctx.widgets.captureNow._onClick = function() onCaptureButton(ctx) end
  ctx.widgets.play._onClick = function() bump(NS .. "/play_trigger") end
  ctx.widgets.stop._onClick = function() bump(NS .. "/stop_trigger") end
  ctx.widgets.clear._onClick = function()
    if ctx.video then ctx.video:clear() end
    if ctx.videoCap then ctx.videoCap:clear() end
    refreshWaveform(ctx)
    updatePreviewSurface(ctx)
    layoutOutputRow(ctx)
  end
  ctx.widgets.layoutDeck._onClick = function() setLayoutPreset(ctx, "deck") end
  ctx.widgets.layoutStage._onClick = function() setLayoutPreset(ctx, "stage") end
  ctx.widgets.layoutInspector._onClick = function() setLayoutPreset(ctx, "inspector") end
  ctx.widgets.resetLayout._onClick = function() ctx._rebuildDockTree = true; resetPanelDocks(ctx) end
  ctx.widgets.resizeMode._onChange = function(v) ctx._resizeMode = v == true; syncToolbarButtons(ctx) end
  ctx.widgets.midiRefresh._onClick = function() AVSD.Midi.refresh(ctx); if not AVSD.Midi.currentMidiLabel() then AVSD.Midi.openPreferred(ctx) end end
  ctx.widgets.midiInput._onSelect = function(idx)
    if idx <= 1 then
      if Midi and Midi.closeInput then Midi.closeInput() end
    else
      if Midi and Midi.openInput then Midi.openInput(idx - 2) end
    end
    AVSD.Midi.refresh(ctx)
  end
  ctx.widgets.selectedSlice._onSelect = function(idx)
    ctx._selectedSlice = math.max(1, math.min(MAX, round(idx)))
    writeParam(NS .. "/selected_slice", ctx._selectedSlice)
    refreshWaveform(ctx)
    updatePreviewSurface(ctx)
  end
  ctx.widgets.auditionSelected._onClick = function()
    writeParam(velocityPathForSlice(ctx._selectedSlice), 127)
    bump(triggerPathForSlice(ctx._selectedSlice))
  end

  ctx.widgets.segGain._onChange = function(v) ctx.seg.gain = clamp(v, 0.25, 4); writeParam(NS .. "/seg/gain", ctx.seg.gain); AVSD.ML.bindInputSurfaces(ctx) end
  ctx.widgets.segThreshold._onChange = function(v) ctx.seg.threshold = clamp(v, 0, 1); writeParam(NS .. "/seg/threshold", ctx.seg.threshold); AVSD.ML.bindInputSurfaces(ctx) end
  ctx.widgets.segFeather._onChange = function(v) ctx.seg.feather = clamp(v, 0, 1); writeParam(NS .. "/seg/feather", ctx.seg.feather); AVSD.ML.bindInputSurfaces(ctx) end
  ctx.widgets.segInvert._onChange = function(v) ctx.seg.invert = v == true; writeParam(NS .. "/seg/invert", ctx.seg.invert and 1 or 0); AVSD.ML.bindInputSurfaces(ctx) end
  ctx.widgets.poseConf._onChange = function(v) ctx.poseConf = clamp(v, 0, 1); writeParam(NS .. "/pose/confidence", ctx.poseConf) end
  ctx.widgets.showSkeleton._onChange = function(v) ctx.showSkeleton = v == true end
  ctx.widgets.mode._onChange = function(v)
    writeParam(NS .. "/mode", v and 1 or 0)
    syncModePanels(ctx)
    refreshWaveform(ctx)
    updatePreviewSurface(ctx)
    layoutOutputRow(ctx)
  end
  ctx.widgets.captureMode._onChange = function(v)
    ctx.captureMode = v and 1 or 0
    writeParam(NS .. "/capture_mode", ctx.captureMode)
    if ctx.captureMode ~= 1 then ctx.captureRecording = false end
    setCaptureButtonAppearance(ctx)
  end

  ctx.widgets.sourceSelect._onSelect = function(idx)
    applySourceSelection(ctx, idx)
  end
  ctx.widgets.aspectSelect._onSelect = function(idx)
    applyAspectModeSelection(ctx, idx)
  end
  ctx.widgets.shaderLayer._onSelect = function(idx)
    applyActiveLayerSelection(ctx, idx)
  end
  ctx.widgets.shaderEnabled._onChange = function(v)
    applyShaderEnabledSelection(ctx, v == true)
  end
  ctx.widgets.effectSelect._onSelect = function(idx)
    applyEffectSelection(ctx, idx)
  end
  for p = 1, 9 do
    ctx.widgets["shaderParam" .. p]._onChange = function(v)
      applyShaderParamDisplay(ctx, p, v)
    end
  end
  for pi = 1, 4 do
    local sl = ctx.widgets["sourceParam" .. pi]
    if sl then
      sl._onChange = function(v)
        applySourceParamDisplay(ctx, pi, v)
      end
    end
  end

  for t = 1, MAX_MAPPINGS do
    for _, id in ipairs({"mapping" .. t .. "Min", "mapping" .. t .. "Max"}) do
      ctx.widgets[id]._onChange = function(v)
        local track = tonumber(id:match("^mapping(%d+)")) or 1
        local key = id:match("Min$") and "min" or "max"
        ctx.mappings[track][key] = clamp(tonumber(v) or 0, 0, 1)
        writeParam(NS .. "/mapping/" .. track .. "/" .. key, ctx.mappings[track][key])
      end
    end
    ctx.widgets["mapping" .. t .. "Enable"]._onChange = function(v)
      ctx.mappings[t].enabled = v == true
      writeParam(NS .. "/mapping/" .. t .. "/enabled", ctx.mappings[t].enabled and 1 or 0)
    end
    ctx.widgets["mapping" .. t .. "Source"]._onSelect = function(idx)
      ctx.mappings[t].source = round(idx)
      writeParam(NS .. "/mapping/" .. t .. "/source", ctx.mappings[t].source)
    end
    ctx.widgets["mapping" .. t .. "Target"]._onSelect = function(idx)
      local _, targetIndex = AVSD.Mapping.targetSpec(idx)
      ctx.mappings[t].target = targetIndex
      writeParam(NS .. "/mapping/" .. t .. "/target", ctx.mappings[t].target)
    end
    ctx.widgets["mapping" .. t .. "Invert"]._onChange = function(v)
      ctx.mappings[t].invert = v == true
      writeParam(NS .. "/mapping/" .. t .. "/invert", ctx.mappings[t].invert and 1 or 0)
    end
  end

  local wf = ctx.widgets.waveform
  if wf then
    if wf.node and wf.node.setInterceptsMouse then wf.node:setInterceptsMouse(true, false) end
    wf._onScrubStart = function() ctx._scrubSlice = nil end
    wf._onScrubSnap = function(pos)
      local p = clamp(pos, 0, 0.999)
      if not ctx._scrubSlice then
        ctx._scrubSlice = nearestSlice(p)
        ctx._selectedSlice = ctx._scrubSlice
        writeParam(NS .. "/selected_slice", ctx._selectedSlice)
      end
      writeParam(pathForSlice(ctx._scrubSlice), p)
      refreshWaveform(ctx)
      updatePreviewSurface(ctx)
    end
    wf._onScrubEnd = function() ctx._scrubSlice = nil end
  end

  _G.__avsdExportContract = function(path)
    local function bool01(v)
      return v == true or tonumber(v) == 1
    end
    local function num(v)
      return tonumber(v) or 0
    end
    local function scalar(v)
      local tv = type(v)
      if tv == "boolean" or tv == "string" or tv == "number" then return v end
      return num(v)
    end
    local function copyNumArray(values)
      local out = {}
      for i = 1, #(values or {}) do out[i] = num(values[i]) end
      return out
    end
    local function copyStringArray(values)
      local out = {}
      for i = 1, #(values or {}) do out[i] = tostring(values[i] or "") end
      return out
    end
    local function copyKeySortedTable(t)
      if type(t) ~= "table" then return nil end
      local out, keys = {}, {}
      for k in pairs(t) do keys[#keys + 1] = tostring(k) end
      table.sort(keys)
      for i = 1, #keys do out[keys[i]] = scalar(t[keys[i]]) end
      return out
    end
    local function cleanSourceSpec(spec)
      if type(spec) ~= "table" then return nil end
      return {
        kind = spec.kind,
        sourceIndex = spec.sourceIndex,
        sourceId = spec.sourceId,
        mlType = spec.mlType,
        sourceCol = spec.sourceCol,
        tapIndex = spec.tapIndex,
        params = copyKeySortedTable(spec.params),
      }
    end
    local function esc(s)
      s = tostring(s or "")
      s = s:gsub("\\", "\\\\")
      s = s:gsub("\"", "\\\"")
      s = s:gsub("\n", "\\n")
      s = s:gsub("\r", "\\r")
      return s
    end
    local function isArray(t)
      if type(t) ~= "table" then return false end
      local n = #t
      for k in pairs(t) do
        if type(k) ~= "number" or k < 1 or k > n or k % 1 ~= 0 then return false end
      end
      return true
    end
    local function encode(v)
      local tv = type(v)
      if tv == "nil" then return "null" end
      if tv == "boolean" then return v and "true" or "false" end
      if tv == "number" then
        if v ~= v or v == math.huge or v == -math.huge then return "0" end
        return tostring(v)
      end
      if tv == "string" then return "\"" .. esc(v) .. "\"" end
      if tv ~= "table" then return "\"" .. esc(tostring(v)) .. "\"" end
      if isArray(v) then
        local out = {}
        for i = 1, #v do out[i] = encode(v[i]) end
        return "[" .. table.concat(out, ",") .. "]"
      end
      local keys, out = {}, {}
      for k in pairs(v) do keys[#keys + 1] = tostring(k) end
      table.sort(keys)
      for i = 1, #keys do
        local key = keys[i]
        out[i] = "\"" .. esc(key) .. "\":" .. encode(v[key])
      end
      return "{" .. table.concat(out, ",") .. "}"
    end
    local function frameInfo()
      local seams = ctx._testSeams or nil
      return (type(seams) == "table" and type(seams.frameInfo) == "table" and seams.frameInfo) or ((capture and capture.getFrameInfo and capture.getFrameInfo()) or { valid = false })
    end
    local function webcamOpen()
      local seams = ctx._testSeams or nil
      if type(seams) == "table" and seams.webcamOpen ~= nil then return seams.webcamOpen == true end
      return (capture and capture.isOpen and capture.isOpen()) and true or false
    end
    local function clock()
      local seams = ctx._testSeams or nil
      return (type(seams) == "table" and type(seams.clock) == "table" and seams.clock) or clockInfo()
    end
    local function samplerState()
      local seams = ctx._testSeams or nil
      if type(seams) == "table" and type(seams.sampler) == "table" then
        return {
          frameCount = round(seams.sampler.frameCount or 0),
          durationSeconds = num(seams.sampler.durationSeconds),
          estimatedBytes = num(seams.sampler.estimatedBytes),
          position = num(seams.sampler.position),
          playing = bool01(seams.sampler.playing),
          playStart = num(seams.sampler.playStart),
          loopStart = num(seams.sampler.loopStart),
          loopEnd = num(seams.sampler.loopEnd),
          crossfade = num(seams.sampler.crossfade),
          oneShot = bool01(seams.sampler.oneShot),
        }
      end
      return {
        frameCount = ctx.video and ctx.video.getFrameCount and ctx.video:getFrameCount() or 0,
        durationSeconds = ctx.video and ctx.video.getDurationSeconds and ctx.video:getDurationSeconds() or 0,
        estimatedBytes = ctx.video and ctx.video.getEstimatedBytes and ctx.video:getEstimatedBytes() or 0,
        position = ctx.video and ctx.video.getNormalizedPosition and ctx.video:getNormalizedPosition() or 0,
        playing = ctx.video and ctx.video.isPlaying and ctx.video:isPlaying() or false,
        playStart = ctx.video and ctx.video.getPlayStart and ctx.video:getPlayStart() or 0,
        loopStart = ctx.video and ctx.video.getLoopStart and ctx.video:getLoopStart() or 0,
        loopEnd = ctx.video and ctx.video.getLoopEnd and ctx.video:getLoopEnd() or 1,
        crossfade = ctx.video and ctx.video.getCrossfade and ctx.video:getCrossfade() or 0,
        oneShot = ctx.video and ctx.video.isOneShot and ctx.video:isOneShot() or false,
      }
    end
    local function captureState()
      local seams = ctx._testSeams or nil
      if type(seams) == "table" and type(seams.capture) == "table" then
        return {
          frameCount = round(seams.capture.frameCount or 0),
          lockedWidth = round(seams.capture.lockedWidth or 0),
          lockedHeight = round(seams.capture.lockedHeight or 0),
          estimatedBytes = num(seams.capture.estimatedBytes),
          captureSeconds = num(seams.capture.captureSeconds or readParam(NS .. "/capture_seconds", 4)),
          lastSequence = seams.capture.lastSequence,
        }
      end
      return {
        frameCount = ctx.videoCap and ctx.videoCap.getFrameCount and ctx.videoCap:getFrameCount() or 0,
        lockedWidth = ctx.videoCap and ctx.videoCap.getLockedWidth and ctx.videoCap:getLockedWidth() or 0,
        lockedHeight = ctx.videoCap and ctx.videoCap.getLockedHeight and ctx.videoCap:getLockedHeight() or 0,
        estimatedBytes = ctx.videoCap and ctx.videoCap.getEstimatedBytes and ctx.videoCap:getEstimatedBytes() or 0,
        captureSeconds = ctx.videoCap and ctx.videoCap.getCaptureSeconds and ctx.videoCap:getCaptureSeconds() or num(readParam(NS .. "/capture_seconds", 4)),
        lastSequence = nil,
      }
    end
    local function sourceParamState(col)
      local spec = type(sourceSpecForColumn) == "function" and sourceSpecForColumn(ctx, col) or nil
      local out = { spec = cleanSourceSpec(spec), params = {} }
      if type(spec) ~= "table" then return out end
      if spec.kind == "generator" then
        for _, g in ipairs(ctx.sources or {}) do
          if g.kind == "generator" and g.id == spec.sourceId then
            for i = 1, #(g.params or {}) do
              local pspec = g.params[i]
              local norm = spec.params and spec.params[pspec.id]
              local pmin = tonumber(pspec.min) or 0
              local pmax = tonumber(pspec.max) or 1
              local default = tonumber(pspec.default) or pmin
              if norm == nil then norm = (default - pmin) / math.max(0.001, pmax - pmin) end
              out.params[i] = {
                id = pspec.id,
                name = pspec.name,
                normalized = num(norm),
                value = pmin + clamp(norm, 0, 1) * (pmax - pmin),
              }
            end
            break
          end
        end
      elseif spec.kind == "ml" then
        for i = 1, #ML_SOURCE_PARAM_SPECS do
          local pspec = ML_SOURCE_PARAM_SPECS[i]
          out.params[i] = {
            id = pspec.id,
            name = pspec.name,
            value = spec.params and scalar(spec.params[pspec.id]) or scalar(pspec.default),
          }
        end
      end
      return out
    end
    local function waveformState()
      local mode = round(readParam(NS .. "/mode", 0))
      local starts = {}
      for i = 1, MAX do starts[i] = num(readParam(pathForSlice(i), (i - 1) / MAX)) end
      local polyPlayheads, slicePlayheads = {}, {}
      for i = 1, MAX do
        polyPlayheads[i] = (ctx._polyPlaying[i] and num(ctx._polyPos[i])) or -1
        slicePlayheads[i] = (ctx._slicePlaying[i] and num(ctx._slicePos[i])) or -1
      end
      local sel = math.max(1, math.min(MAX, round(ctx._selectedSlice or 1)))
      local start = starts[sel] or 0
      local finish = 1.0
      for i = 1, MAX do if (starts[i] or 0) > start + 0.002 and starts[i] < finish then finish = starts[i] end end
      return {
        mode = mode,
        selectedSlice = sel,
        sliceStarts = starts,
        polyPlayheads = polyPlayheads,
        slicePlayheads = slicePlayheads,
        playStart = num(readParam(NS .. "/play_start", 0)),
        loopStart = num(readParam(NS .. "/loop_start", 0)),
        loopEnd = num(readParam(NS .. "/loop_end", 1)),
        crossfade = num(readParam(NS .. "/crossfade", 0.03)),
        regionStart = mode == 0 and num(readParam(NS .. "/loop_start", 0)) or start,
        regionEnd = mode == 0 and num(readParam(NS .. "/loop_end", 1)) or finish,
      }
    end
    local function previewState()
      local mode = round(readParam(NS .. "/mode", 0))
      local pos = 0
      if mode == 0 then
        for i = 1, MAX do if ctx._polyPlaying[i] then pos = ctx._polyPos[i] or 0 break end end
        if pos <= 0 then pos = clamp(readParam(NS .. "/play_start", 0), 0, 1) end
      else
        local sel = math.max(1, math.min(MAX, round(ctx._selectedSlice or 1)))
        pos = ctx._slicePos[sel] or clamp(readParam(pathForSlice(sel), (sel - 1) / MAX), 0, 0.999)
      end
      return { mode = mode, position = num(pos) }
    end

    local frame = frameInfo()
    local clk = clock()
    local sampler = samplerState()
    local captureInfo = captureState()
    local graph = type(buildCompositorGraph) == "function" and buildCompositorGraph(ctx) or nil
    local contract = {
      projectPath = (type(getCurrentScriptPath) == "function" and getCurrentScriptPath()) or "",
      rendererMode = (type(getUIRendererMode) == "function" and getUIRendererMode()) or "unknown",
      layoutPreset = ctx._layoutPreset,
      gridAlignment = ctx.gridAlignment,
      selectedView = ctx.selectedView,
      selection = ctx.selection and { col = ctx.selection.col, row = ctx.selection.row } or nil,
      selectionSummary = type(selectionSummary) == "function" and selectionSummary(ctx) or nil,
      selectedGridClip = type(selectedGridClip) == "function" and selectedGridClip(ctx) or nil,
      sourceSelectionCol = ctx.sourceSelectionCol,
      selectedSlice = ctx._selectedSlice,
      aspectMode = ctx.aspectMode,
      output = { w = ctx.outputW, h = ctx.outputH },
      resizeMode = bool01(ctx._resizeMode),
      captureMode = ctx.captureMode,
      captureRecording = bool01(ctx.captureRecording),
      poseConf = num(ctx.poseConf),
      showSkeleton = bool01(ctx.showSkeleton),
      webcamOpen = webcamOpen(),
      frameInfo = {
        valid = bool01(frame.valid),
        width = round(frame.width or 0),
        height = round(frame.height or 0),
        sequence = frame.sequence,
      },
      clock = {
        sampleRate = num(clk.sampleRate),
        playTimeSamples = num(clk.playTimeSamples),
        tempo = num(clk.tempo),
      },
      seg = {
        gain = num(ctx.seg and ctx.seg.gain),
        threshold = num(ctx.seg and ctx.seg.threshold),
        feather = num(ctx.seg and ctx.seg.feather),
        invert = bool01(ctx.seg and ctx.seg.invert),
      },
      sampler = sampler,
      capture = captureInfo,
      waveform = waveformState(),
      preview = previewState(),
      visible = copyNumArray({}),
      midi = {
        currentLabel = AVSD.Midi.currentMidiLabel() or "none",
        lastMidi = tostring(ctx._lastMidi or "--"),
        devices = copyStringArray(ctx._midiDevices or {}),
        selectedInput = selectedDeviceIndex(ctx),
        isOpen = Midi and Midi.isInputOpen and Midi.isInputOpen() or false,
        note = round(readParam(NS .. "/midi_note", 0)),
        velocity = round(readParam(NS .. "/midi_velocity", 0)),
        noteOnTrigger = round(readParam(NS .. "/midi_note_on_trigger", 0)),
        noteOffTrigger = round(readParam(NS .. "/midi_note_off_trigger", 0)),
      },
      fx = {
        slot = ctx.fxSlot,
        type = round(readParam(rackFxTypePath(ctx.fxSlot), 0)),
        mix = num(readParam(rackFxMixPath(ctx.fxSlot), 0)),
        params = {},
      },
      hostParams = {
        mode = round(readParam(NS .. "/mode", 0)),
        speed = num(readParam(NS .. "/speed", 1)),
        output = num(readParam(NS .. "/output", 0.8)),
        rootNote = round(readParam(NS .. "/root_note", 60)),
        voiceCount = round(readParam(NS .. "/voice_count", 8)),
        pitchTracking = bool01(readParam(NS .. "/pitch_tracking", 1)),
        playStart = num(readParam(NS .. "/play_start", 0)),
        loopStart = num(readParam(NS .. "/loop_start", 0)),
        loopEnd = num(readParam(NS .. "/loop_end", 1)),
        crossfade = num(readParam(NS .. "/crossfade", 0.03)),
        oneShot = bool01(readParam(NS .. "/one_shot", 0)),
        captureSeconds = num(readParam(NS .. "/capture_seconds", 4)),
        shaderSource = round(readParam(NS .. "/shader/source", 1)),
        activeLayer = round(readParam(NS .. "/shader/active_layer", 1)),
      },
      slices = {},
      shader = {
        sourceIndex = ctx.shader and ctx.shader.sourceIndex or 1,
        activeLayer = ctx.shader and ctx.shader.activeLayer or 1,
        layers = {},
        sourceParams = copyKeySortedTable(ctx.shaderSourceParams or {}),
      },
      sourceInspector = sourceParamState(tonumber(ctx.sourceSelectionCol) or 1),
      mappings = {},
      pose = {
        values = copyKeySortedTable(ctx.pose and ctx.pose.values or {}),
        keypoints = {},
      },
      sources = {},
      effects = {},
      gridThumbSigs = copyKeySortedTable(ctx._gridThumbSigs or {}),
      columns = {},
      compositor = nil,
      compositorThumbSigs = copyKeySortedTable(ctx._compoThumbSigs or {}),
      profile = {},
      testSeams = nil,
    }

    for i = 1, MAX do contract.visible[i] = type(ctx._visible) == "table" and ctx._visible[i] or nil end
    for i = 1, 5 do contract.fx.params[i] = num(readParam(rackFxParamPath(ctx.fxSlot, i - 1), 0.5)) end
    for i = 1, MAX do
      contract.slices[i] = {
        start = num(readParam(pathForSlice(i), (i - 1) / MAX)),
        polyPlaying = bool01(ctx._polyPlaying[i]),
        polyPos = num(ctx._polyPos[i]),
        slicePlaying = bool01(ctx._slicePlaying[i]),
        slicePos = num(ctx._slicePos[i]),
      }
    end
    for i = 1, #(ctx.shader and ctx.shader.layers or {}) do
      local layer = ctx.shader.layers[i]
      contract.shader.layers[i] = {
        enabled = bool01(layer.enabled),
        effectIndex = layer.effectIndex,
        effectName = ((ctx.effects or {})[layer.effectIndex] or {}).name,
        params = copyNumArray(layer.params),
      }
    end
    for i = 1, #(ctx.mappings or {}) do
      local mapping = ctx.mappings[i]
      local target = AVSD.Mapping.targetSpec(mapping.target or 1)
      contract.mappings[i] = {
        enabled = bool01(mapping.enabled),
        source = mapping.source,
        sourceLabel = (AVSD.ML.POSE_SOURCES[mapping.source or 1] or {}).label,
        target = mapping.target,
        targetLabel = target and target.label or nil,
        min = num(mapping.min),
        max = num(mapping.max),
        invert = bool01(mapping.invert),
      }
    end
    for i = 1, #(ctx.pose and ctx.pose.keypoints or {}) do
      local kp = ctx.pose.keypoints[i] or {}
      contract.pose.keypoints[i] = { x = num(kp.x), y = num(kp.y), conf = num(kp.conf) }
    end
    for i = 1, #(ctx.sources or {}) do
      local source = ctx.sources[i] or {}
      contract.sources[i] = {
        id = source.id,
        name = source.name,
        kind = source.kind,
        params = copyStringArray((function()
          local out = {}
          for j = 1, #(source.params or {}) do out[j] = (source.params[j] or {}).id or tostring(j) end
          return out
        end)()),
      }
    end
    for i = 1, #(ctx.effects or {}) do
      local effect = ctx.effects[i] or {}
      contract.effects[i] = {
        id = effect.id,
        name = effect.name or effect.id or tostring(i),
        params = copyStringArray((function()
          local out = {}
          for j = 1, #(effect.params or {}) do out[j] = (effect.params[j] or {}).id or tostring(j) end
          return out
        end)()),
      }
    end
    for col = 1, #(ctx._colData or {}) do
      local data = ctx._colData[col] or {}
      local fxRows = {}
      for row = 1, #(data.fx or {}) do
        local fx = data.fx[row] or {}
        fxRows[row] = {
          effectIndex = fx.effectIndex,
          effectName = ((ctx.effects or {})[fx.effectIndex] or {}).name,
          enabled = bool01(fx.enabled),
          params = copyNumArray(fx.params),
        }
      end
      local tapSignatures = {}
      if type(stackTapSignature) == "function" then
        for row = 1, 1 + #fxRows do tapSignatures[row] = stackTapSignature(ctx, col, row) end
      end
      contract.columns[col] = {
        id = data.id,
        label = type(colSourceLabel) == "function" and colSourceLabel(ctx, col) or nil,
        source = cleanSourceSpec(type(sourceSpecForColumn) == "function" and sourceSpecForColumn(ctx, col) or data.sourceSpec),
        sourceParamState = sourceParamState(col),
        sourceSignature = type(sourceSpecSignature) == "function" and sourceSpecSignature(ctx, col) or nil,
        fx = fxRows,
        tapSignatures = tapSignatures,
      }
    end
    if ctx.compositor and ctx.compositor.layers then
      contract.compositor = {
        selection = ctx.compositorSelection and ctx.compositorSelection.layerIndex or nil,
        finalKey = graph and graph.finalKey or nil,
        accumulatedKeyByLayer = graph and copyNumArray({}) or {},
        layers = {},
      }
      if graph and type(graph.accumulatedKeyByLayer) == "table" then
        for i = 1, #graph.accumulatedKeyByLayer do contract.compositor.accumulatedKeyByLayer[i] = graph.accumulatedKeyByLayer[i] end
      end
      for i = 1, #ctx.compositor.layers do
        local layer = ctx.compositor.layers[i] or {}
        contract.compositor.layers[i] = {
          sourceColumn = layer.sourceColumn,
          tapIndex = layer.tapIndex,
          blendMode = layer.blendMode,
          opacity = num(layer.opacity),
          visible = bool01(layer.visible),
          name = layer.name,
          signature = type(compositorLayerCellPipeline) == "function" and compositorLayerCellPipeline(ctx, ctx.compositor.layers[i]) or nil,
        }
      end
    end
    if type(ctx._profile) == "table" then
      local keys = {}
      for k in pairs(ctx._profile) do keys[#keys + 1] = tostring(k) end
      table.sort(keys)
      for i = 1, #keys do
        local key = keys[i]
        local t = ctx._profile[key] or {}
        contract.profile[key] = {
          total = num(t.total),
          count = round(t.count or 0),
          max = num(t.max),
          last = num(t.last),
          avg = num(t.avg),
        }
      end
    end
    if type(ctx._testSeams) == "table" then
      contract.testSeams = {
        webcamOpen = ctx._testSeams.webcamOpen,
        frameInfo = copyKeySortedTable(ctx._testSeams.frameInfo),
        capture = copyKeySortedTable(ctx._testSeams.capture),
        sampler = copyKeySortedTable(ctx._testSeams.sampler),
        clock = copyKeySortedTable(ctx._testSeams.clock),
        poseSequence = ctx._testSeams.poseSequence,
        midiQueueDepth = type(ctx._testSeams.midiQueue) == "table" and #ctx._testSeams.midiQueue or 0,
        playbackKeys = (function()
          local keys = {}
          for k in pairs(ctx._testSeams.playback or {}) do keys[#keys + 1] = tostring(k) end
          table.sort(keys)
          return keys
        end)(),
      }
    end

    local json = encode(contract)
    if type(path) == "string" and path ~= "" and type(writeTextFile) == "function" then
      writeTextFile(path, json)
      return path
    end
    return json
  end

  _G.__avsdAction = function(action, a, b, c, d)
    local function num(v)
      return tonumber(v) or 0
    end
    local function bool01(v)
      return v == true or tonumber(v) == 1
    end
    local function resolveWidget(id)
      return (ctx.widgets and ctx.widgets[id]) or (ctx.allWidgets and ctx.allWidgets[id]) or nil
    end
    local function forceRefresh()
      syncParamsFromHost(ctx)
      AVSD.ML.bindInputSurfaces(ctx)
      applyVideoWindow(ctx)
      updateOutputAspect(ctx)
      refreshWaveform(ctx)
      updatePreviewSurface(ctx)
      layoutOutputRow(ctx)
      ensureGridCells(ctx)
      updateGridThumbnails(ctx)
      updateCompositorThumbnails(ctx)
      updateCompositorOutput(ctx)
      return true
    end
    action = tostring(action or "")
    if action == "force_refresh" then
      return forceRefresh()
    elseif action == "set_param" then
      writeParam(tostring(a or ""), type(b) == "boolean" and (b and 1 or 0) or num(b))
      return true
    elseif action == "widget_click" then
      local w = resolveWidget(tostring(a or ""))
      if w and w._onClick then w._onClick() end
      return true
    elseif action == "widget_change" then
      local w = resolveWidget(tostring(a or ""))
      if w and w._onChange then w._onChange(c ~= nil and c or b) end
      return true
    elseif action == "widget_select" then
      local w = resolveWidget(tostring(a or ""))
      if w and w._onSelect then w._onSelect(round(b)) end
      return true
    elseif action == "set_layout_preset" then
      if type(setLayoutPreset) == "function" then setLayoutPreset(ctx, tostring(a or "deck")) end
      return true
    elseif action == "set_selected_slice" then
      local w = resolveWidget("selectedSlice")
      if w and w._onSelect then w._onSelect(round(a)) end
      return ctx._selectedSlice or 1
    elseif action == "set_source_select" then
      local w = resolveWidget("sourceSelect")
      if w and w._onSelect then w._onSelect(round(a)) end
      return ctx.shader and ctx.shader.sourceIndex or 1
    elseif action == "set_aspect_select" then
      local w = resolveWidget("aspectSelect")
      if w and w._onSelect then w._onSelect(round(a)) end
      return ctx.aspectMode
    elseif action == "set_source_selection_col" then
      ctx.sourceSelectionCol = round(a)
      syncShaderSourceParams(ctx)
      return ctx.sourceSelectionCol
    elseif action == "set_source_param" then
      local w = resolveWidget("sourceParam" .. tostring(round(a)))
      if w and w._onChange then w._onChange(num(b)) end
      return true
    elseif action == "set_shader_layer" then
      local w = resolveWidget("shaderLayer")
      if w and w._onSelect then w._onSelect(round(a)) end
      return ctx.shader and ctx.shader.activeLayer or 1
    elseif action == "set_shader_enabled" then
      local w = resolveWidget("shaderEnabled")
      if w and w._onChange then w._onChange(bool01(a)) end
      return true
    elseif action == "set_effect_select" then
      local w = resolveWidget("effectSelect")
      if w and w._onSelect then w._onSelect(round(a)) end
      return true
    elseif action == "set_shader_param" then
      local widget = resolveWidget("shaderParam" .. tostring(round(a)))
      if widget and widget._onChange then widget._onChange(num(b)) end
      return true
    elseif action == "set_mapping_field" then
      local track = round(a)
      local field = tostring(b or "")
      if field == "enable" then
        local w = resolveWidget("mapping" .. track .. "Enable")
        if w and w._onChange then w._onChange(bool01(c)) end
      elseif field == "source" then
        local w = resolveWidget("mapping" .. track .. "Source")
        if w and w._onSelect then w._onSelect(round(c)) end
      elseif field == "target" then
        local w = resolveWidget("mapping" .. track .. "Target")
        if w and w._onSelect then w._onSelect(round(c)) end
      elseif field == "min" then
        local w = resolveWidget("mapping" .. track .. "Min")
        if w and w._onChange then w._onChange(num(c)) end
      elseif field == "max" then
        local w = resolveWidget("mapping" .. track .. "Max")
        if w and w._onChange then w._onChange(num(c)) end
      elseif field == "invert" then
        local w = resolveWidget("mapping" .. track .. "Invert")
        if w and w._onChange then w._onChange(bool01(c)) end
      end
      return true
    elseif action == "set_fx_slot" then
      local w = resolveWidget("fxSlot")
      if w and w._onSelect then w._onSelect(round(a)) end
      return ctx.fxSlot
    elseif action == "set_fx_type" then
      local w = resolveWidget("fxType")
      if w and w._onSelect then w._onSelect(round(a)) end
      return true
    elseif action == "set_fx_mix" then
      local w = resolveWidget("fxMix")
      if w and w._onChange then w._onChange(num(a)) end
      return true
    elseif action == "set_fx_param" then
      local w = resolveWidget("fxParam" .. tostring(round(a)))
      if w and w._onChange then w._onChange(num(b)) end
      return true
    elseif action == "add_column" then
      local kind = tostring(a or "ml")
      if kind == "ml" then
        AVSD.State.addColumn(ctx, { kind = "ml", mlType = tostring(b or "segmented"), params = { gain = 1.0, threshold = 0.5, feather = 0.15, background = 0.02, useSigmoid = true, invert = false } })
      elseif kind == "generator" then
        AVSD.State.addColumn(ctx, { kind = "generator", sourceIndex = round(b or 1), sourceId = (((ctx.sources or {})[round(b or 1)] or {}).id), params = {} })
      elseif kind == "columntap" then
        AVSD.State.addColumn(ctx, { kind = "columntap", sourceCol = round(b or 1), tapIndex = round(c or 0) })
      else
        AVSD.State.addColumn(ctx, { kind = "webcam", sourceIndex = 1 })
      end
      return #(ctx._colData or {})
    elseif action == "remove_column" then
      AVSD.State.removeColumn(ctx, round(a))
      return #(ctx._colData or {})
    elseif action == "col_add_fx" then
      AVSD.State.colAddFx(ctx, round(a), round(b), { NS = NS, writeParam = writeParam, updateShader = updateShader })
      return true
    elseif action == "col_remove_fx" then
      AVSD.State.colRemoveFx(ctx, round(a), round(b), { NS = NS, writeParam = writeParam, updateShader = updateShader })
      return true
    elseif action == "set_column_source_ml" then
      if type(setSourceSpecForColumn) == "function" then
        setSourceSpecForColumn(ctx, round(a), { kind = "ml", mlType = tostring(b or "segmented"), params = { gain = 1.0, threshold = 0.5, feather = 0.15, background = 0.02, useSigmoid = true, invert = false } })
      end
      return true
    elseif action == "set_column_source_generator" then
      if type(setSourceSpecForColumn) == "function" then
        local idx = round(b or 1)
        setSourceSpecForColumn(ctx, round(a), { kind = "generator", sourceIndex = idx, sourceId = (((ctx.sources or {})[idx] or {}).id), params = {} })
      end
      return true
    elseif action == "set_column_source_webcam" then
      if type(setSourceSpecForColumn) == "function" then setSourceSpecForColumn(ctx, round(a), { kind = "webcam", sourceIndex = 1 }) end
      return true
    elseif action == "set_column_source_columntap" then
      if type(setSourceSpecForColumn) == "function" then setSourceSpecForColumn(ctx, round(a), { kind = "columntap", sourceCol = round(b or 1), tapIndex = round(c or 0) }) end
      return true
    elseif action == "select_grid_cell" then
      if type(selectGridCell) == "function" then selectGridCell(ctx, round(a), round(b)) end
      return true
    elseif action == "set_compositor_layer" then
      local idx = round(a)
      local field = tostring(b or "")
      local layer = ctx.compositor and ctx.compositor.layers and ctx.compositor.layers[idx]
      if not layer then return false end
      if field == "sourceColumn" then layer.sourceColumn = round(c)
      elseif field == "tapIndex" then layer.tapIndex = (c == nil or c == false or tostring(c) == "nil") and nil or round(c)
      elseif field == "blendMode" then layer.blendMode = tostring(c or "normal")
      elseif field == "opacity" then layer.opacity = clamp(c, 0, 1)
      elseif field == "visible" then layer.visible = bool01(c)
      elseif field == "select" then ctx.compositorSelection = { layerIndex = idx } end
      updateCompositorThumbnails(ctx)
      updateCompositorOutput(ctx)
      return true
    elseif action == "seam_reset" then
      ctx._testSeams = { playback = {}, midiQueue = {} }
      ctx.pose = nil
      ctx._lastPoseFrameSeq = nil
      ctx._lastSegmentFrameSeq = nil
      return true
    elseif action == "seam_set_frame_info" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.frameInfo = { valid = bool01(a), sequence = round(b), width = round(c), height = round(d) }
      return true
    elseif action == "seam_set_webcam_open" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.webcamOpen = bool01(a)
      return true
    elseif action == "seam_set_clock" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.clock = { sampleRate = num(a), playTimeSamples = num(b), tempo = num(c) }
      return true
    elseif action == "seam_set_playback" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.playback = ctx._testSeams.playback or {}
      local kind = tostring(a or "poly")
      local index = round(b or 1)
      local key = kind == "slice" and SLICE_PATHS[index] or POLY_PATHS[index]
      if key then ctx._testSeams.playback[key] = { playing = bool01(c), pos = num(d) } end
      return true
    elseif action == "seam_clear_playback" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      local kind = tostring(a or "all")
      if kind == "all" then
        ctx._testSeams.playback = {}
      else
        local paths = kind == "slice" and SLICE_PATHS or POLY_PATHS
        for i = 1, #paths do ctx._testSeams.playback[paths[i]] = nil end
      end
      return true
    elseif action == "seam_queue_midi" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.midiQueue = ctx._testSeams.midiQueue or {}
      ctx._testSeams.midiQueue[#ctx._testSeams.midiQueue + 1] = { kind = tostring(a or "note_on"), data1 = round(b or 0), data2 = round(c or 0) }
      return #ctx._testSeams.midiQueue
    elseif action == "seam_set_pose_keypoint" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.poseKeypoints = ctx._testSeams.poseKeypoints or {}
      local idx = round(a or 1)
      ctx._testSeams.poseKeypoints[idx] = { x = num(b), y = num(c), conf = num(d) }
      ctx._testSeams.poseSequence = round((ctx._testSeams.poseSequence or 0) + 1)
      return true
    elseif action == "seam_set_pose_preset" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      local preset = tostring(a or "neutral")
      ctx._testSeams.poseKeypoints = {}
      for i = 1, 17 do ctx._testSeams.poseKeypoints[i] = { x = 0.5, y = 0.5, conf = 0.9 } end
      if preset == "hands_up" then
        ctx._testSeams.poseKeypoints[6] = { x = 0.42, y = 0.48, conf = 0.95 }
        ctx._testSeams.poseKeypoints[7] = { x = 0.58, y = 0.48, conf = 0.95 }
        ctx._testSeams.poseKeypoints[10] = { x = 0.35, y = 0.16, conf = 0.97 }
        ctx._testSeams.poseKeypoints[11] = { x = 0.65, y = 0.16, conf = 0.97 }
      elseif preset == "spread" then
        ctx._testSeams.poseKeypoints[6] = { x = 0.45, y = 0.45, conf = 0.95 }
        ctx._testSeams.poseKeypoints[7] = { x = 0.55, y = 0.45, conf = 0.95 }
        ctx._testSeams.poseKeypoints[10] = { x = 0.12, y = 0.42, conf = 0.98 }
        ctx._testSeams.poseKeypoints[11] = { x = 0.88, y = 0.42, conf = 0.98 }
      elseif preset == "left_reach" then
        ctx._testSeams.poseKeypoints[6] = { x = 0.45, y = 0.45, conf = 0.95 }
        ctx._testSeams.poseKeypoints[10] = { x = 0.08, y = 0.18, conf = 0.98 }
      end
      ctx._testSeams.poseSequence = round((ctx._testSeams.poseSequence or 0) + 1)
      return true
    elseif action == "seam_clear_pose" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.poseKeypoints = nil
      ctx._testSeams.poseSequence = round((ctx._testSeams.poseSequence or 0) + 1)
      ctx.pose = nil
      return true
    elseif action == "seam_set_capture_metrics" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.capture = {
        frameCount = round(a or 0),
        lockedWidth = round(b or 0),
        lockedHeight = round(c or 0),
        estimatedBytes = num(d),
        captureSeconds = num(readParam(NS .. "/capture_seconds", 4)),
      }
      return true
    elseif action == "seam_set_sampler_metrics" then
      ctx._testSeams = ctx._testSeams or { playback = {}, midiQueue = {} }
      ctx._testSeams.sampler = {
        frameCount = round(a or 0),
        durationSeconds = num(b),
        estimatedBytes = num(c),
        position = num(d),
      }
      return true
    elseif action == "seam_trigger_capture" then
      doRetroCapture(ctx, a ~= nil and num(a) or nil)
      return ctx._lastVideoCommitOk == true
    elseif action == "midi_note_on" then
      AVSD.Midi.triggerNote(ctx, round(a or 0), round(b or 0))
      return true
    elseif action == "midi_note_off" then
      AVSD.Midi.releaseNote(ctx, round(a or 0))
      return true
    end
    return false
  end

  _G.__avsdSetPreset = function(preset)
    local p = tostring(preset or "deck")
    if p ~= "stage" and p ~= "inspector" then p = "deck" end
    setLayoutPreset(ctx, p)
    return true
  end

  _G.__avsdDockInstanceCounter = (type(_G.__avsdDockInstanceCounter) == "number" and _G.__avsdDockInstanceCounter or 0) + 1
  local t = (type(getTime) == "function" and getTime()) or 0
  ctx._dockSuffix = tostring(math.floor(t * 1000000)) .. "_" .. tostring(_G.__avsdDockInstanceCounter)

  refreshWaveform(ctx)
  updatePreviewSurface(ctx)
  layoutOutputRow(ctx)

  if ctx.root and ctx.root.node and ctx.root.node.setOnImGuiFrame then
    ctx.root.node:setOnImGuiFrame(function() renderFrame(ctx) end)
  end

  -- Expose profiling data for IPC EVAL queries (globals, no locals consumed)
  _G.__avsdProfile = function()
    local out = {}
    local p = ctx._profile
    if not p then return "no profile data" end
    local keys = {"updateShader","updateGridThumbnails","syncParamsFromHost","runPose","applyMapping","syncClipModel","ensureGridCells","pollMidi","bindInputSurfaces","colBuildCellPipeline","buildTapPipeline","applyCaptureWindow","segmentIngest","playbackUi","statusInterval"}
    for _, k in ipairs(keys) do
      local t = p[k]
      if t and t.count > 0 then
        table.insert(out, string.format("%-24s last=%8.0fus avg=%8.0fus max=%8.0fus count=%d",
          k, t.last, t.avg, t.max, t.count))
      end
    end
    return table.concat(out, "\n")
  end

  -- Init grid
  ensureGridCells(ctx)
  updateGridThumbnails(ctx)
end

function M.resized(ctx)
  layoutToolbar(ctx)
  AVSD.ML.ensurePoseOverlay(ctx)
  refreshWaveform(ctx)
  updatePreviewSurface(ctx)
  layoutOutputRow(ctx)
end

function M.update(ctx)
  _G.__avsdCtx = ctx
  profileStart(ctx, "applyCaptureWindow")
  applyCaptureWindow(ctx)
  profileEnd(ctx, "applyCaptureWindow")

  if shouldRunInterval(ctx, "paramSync", PARAM_SYNC_INTERVAL) then
    syncParamsFromHost(ctx)
  end

  AVSD.Midi.poll(ctx, { profileStart = AVSD.Prof.start, profileEnd = AVSD.Prof.finish })

  local seams = ctx._testSeams or nil
  local frame = (type(seams) == "table" and type(seams.frameInfo) == "table" and seams.frameInfo) or ((capture and capture.getFrameInfo and capture.getFrameInfo()) or { valid = false })
  local webcamOpen = (capture and capture.isOpen and capture.isOpen()) and true or false
  if type(seams) == "table" and seams.webcamOpen ~= nil then webcamOpen = seams.webcamOpen == true end

  if ctx.videoCap and webcamOpen and shouldRunInterval(ctx, "segmentIngest", SEGMENT_INGEST_INTERVAL) then
    profileStart(ctx, "segmentIngest")
    local seq = tonumber(frame.sequence)
    if seq == nil or ctx._lastSegmentFrameSeq ~= seq then
      local ok = false
      if type(seams) == "table" and type(seams.capture) == "table" then
        seams.capture.frameCount = math.max(0, round(seams.capture.frameCount or 0)) + 1
        seams.capture.lockedWidth = round(frame.width or seams.capture.lockedWidth or 0)
        seams.capture.lockedHeight = round(frame.height or seams.capture.lockedHeight or 0)
        seams.capture.lastSequence = seq
        ok = true
      elseif ctx.videoCap.ingestSegmentedLatest and ctx._segPipeline then
        ok = ctx.videoCap:ingestSegmentedLatest(ctx._segPipeline, {
          gain = ctx.seg.gain,
          useSigmoid = ctx.seg.useSigmoid,
          threshold = ctx.seg.threshold,
          feather = ctx.seg.feather,
          invert = ctx.seg.invert,
          background = 0.0,
        })
      end
      if not ok and not (type(seams) == "table" and type(seams.capture) == "table") then ctx.videoCap:ingestLatest() end
      if seq ~= nil then ctx._lastSegmentFrameSeq = seq end
    end
    profileEnd(ctx, "segmentIngest")
  end

  local poseUpdated = AVSD.ML.runPose(ctx, frame)
  if poseUpdated or shouldRunInterval(ctx, "mapping", POSE_INTERVAL) then
    applyMapping(ctx)
  end

  if shouldRunInterval(ctx, "playbackUi", PLAYBACK_UI_INTERVAL) then
    profileStart(ctx, "playbackUi")
    ctx._selectedSlice = math.max(1, math.min(MAX, round(readParam(NS .. "/selected_slice", ctx._selectedSlice or 1))))
    for i = 1, MAX do
      ctx._polyPlaying[i], ctx._polyPos[i] = samplePosition(POLY_PATHS[i], 0)
      ctx._slicePlaying[i], ctx._slicePos[i] = samplePosition(SLICE_PATHS[i], readParam(pathForSlice(i), (i - 1) / MAX))
    end
    layoutOutputRow(ctx)
    updatePreviewSurface(ctx)
    refreshWaveform(ctx)
    profileEnd(ctx, "playbackUi")
  end

  if shouldRunInterval(ctx, "status", STATUS_INTERVAL) then
    profileStart(ctx, "statusInterval")
    setText(ctx.widgets.webcamStatus, string.format("Webcam: %s frame=%s %dx%d seq=%s", webcamOpen and "open" or "closed", frame.valid and "yes" or "no", frame.width or 0, frame.height or 0, tostring(frame.sequence or "--")))
    local clk = (type(seams) == "table" and type(seams.clock) == "table" and seams.clock) or clockInfo()
    setText(ctx.widgets.clockStatus, string.format("Clock: sr=%.0f samples=%.0f tempo=%.1f", clk.sampleRate or 0, clk.playTimeSamples or 0, clk.tempo or 0))
    setText(ctx.widgets.rendererStatus, "Renderer: " .. ((type(getUIRendererMode) == "function" and getUIRendererMode()) or "canvas"))

    local capFrames = (type(seams) == "table" and type(seams.capture) == "table" and round(seams.capture.frameCount or 0)) or (ctx.videoCap and ctx.videoCap:getFrameCount() or 0)
    ctx._lockedW = (type(seams) == "table" and type(seams.capture) == "table" and round(seams.capture.lockedWidth or ctx._lockedW or 0)) or (ctx.videoCap and ctx.videoCap:getLockedWidth() or ctx._lockedW)
    ctx._lockedH = (type(seams) == "table" and type(seams.capture) == "table" and round(seams.capture.lockedHeight or ctx._lockedH or 0)) or (ctx.videoCap and ctx.videoCap:getLockedHeight() or ctx._lockedH)
    local capMB = ((type(seams) == "table" and type(seams.capture) == "table" and tonumber(seams.capture.estimatedBytes or 0)) or (ctx.videoCap and ctx.videoCap:getEstimatedBytes() or 0)) / (1024 * 1024)
    setText(ctx.widgets.captureStatus, string.format("Capture ring: %d segmented frames locked %dx%d %.1fMB", capFrames, ctx._lockedW or 0, ctx._lockedH or 0, capMB))
    local sampleFrames = (type(seams) == "table" and type(seams.sampler) == "table" and round(seams.sampler.frameCount or 0)) or (ctx.video and ctx.video:getFrameCount() or 0)
    local sampleDuration = (type(seams) == "table" and type(seams.sampler) == "table" and tonumber(seams.sampler.durationSeconds or 0)) or (ctx.video and ctx.video:getDurationSeconds() or 0)
    setText(ctx.widgets.samplerStatus, string.format("Sampler: %d frames %.2fs last commit %s visible=%d", sampleFrames, sampleDuration, ctx._lastVideoCommitOk and "OK" or "--", #(ctx._visible or {})))
    setText(ctx.widgets.midiStatus, string.format("MIDI: %s last=%s", AVSD.Midi.currentMidiLabel() or "none", tostring(ctx._lastMidi or "--")))
    setText(ctx.widgets.fxStatus, string.format("FX%d type=%d mix=%.2f", ctx.fxSlot, round(readParam(rackFxTypePath(ctx.fxSlot), 0)), readParam(rackFxMixPath(ctx.fxSlot), 0)))
    profileEnd(ctx, "statusInterval")
  end

  -- Ensure compositor cell thumbs and output are driven by the same compositor graph.
  updateCompositorThumbnails(ctx)
  updateCompositorOutput(ctx)
end

function M.cleanup(ctx)
  if _G.__avsdCtx == ctx then _G.__avsdCtx = nil end
  if ctx then
    if ctx.video then pcall(function() ctx.video:clear() end) end
    if ctx.videoCap then pcall(function() ctx.videoCap:clear() end) end
  end
  if capture and capture.close then pcall(capture.close) end
  if videoSampler then
    if videoSampler.remove then pcall(videoSampler.remove, VIDEO_SAMPLER_ID) end
    if videoSampler.removeCapture then pcall(videoSampler.removeCapture, VIDEO_CAPTURE_ID) end
  end
  if _G.__avsdSetPreset then _G.__avsdSetPreset = nil end
  if _G.__avsdExportContract then _G.__avsdExportContract = nil end
  if _G.__avsdAction then _G.__avsdAction = nil end
end

return M
