local M = {}
local AVSD = {
  Mapping = require("behaviors.avsd.mapping"),
  Midi = require("behaviors.avsd.midi"),
  State = require("behaviors.avsd.state"),
}

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

local function buildPoseSources()
  local out = {}
  for _, name in ipairs(KEYPOINTS) do
    out[#out + 1] = { label = name .. ".x", keypoint = name, property = "x" }
    out[#out + 1] = { label = name .. ".y", keypoint = name, property = "y" }
    out[#out + 1] = { label = name .. ".confidence", keypoint = name, property = "confidence" }
  end
  out[#out + 1] = { label = "both_hands.spread", derived = "both_hands_spread" }
  out[#out + 1] = { label = "left_arm.reach", derived = "left_arm_reach" }
  out[#out + 1] = { label = "right_arm.reach", derived = "right_arm_reach" }
  return out
end

local POSE_SOURCES = buildPoseSources()
local SKELETON = { {1,2},{1,3},{2,4},{3,5},{6,8},{8,10},{7,9},{9,11},{6,7},{6,12},{7,13},{12,13},{12,14},{14,16},{13,15},{15,17} }

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
local function pathForSlice(i) return NS .. "/slice/" .. i .. "/start" end
local function triggerPathForSlice(i) return NS .. "/slice/" .. i .. "/trigger" end
local function velocityPathForSlice(i) return NS .. "/slice/" .. i .. "/velocity" end


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

local POLY_PATHS, SLICE_PATHS = {}, {}
for i = 1, MAX do
  POLY_PATHS[i] = NS .. "/poly/voice/" .. i .. "/sample"
  SLICE_PATHS[i] = NS .. "/slice/" .. i .. "/sample"
end

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

-- Profiling: globals to avoid consuming local variable slots (200 limit)
_G.__avsdProfileInit = function(ctx)
  ctx._profile = {}
  for _, k in ipairs{"updateShader","updateGridThumbnails","syncParamsFromHost","runPose","applyMapping","syncClipModel","ensureGridCells","pollMidi","bindInputSurfaces","colBuildCellPipeline","buildTapPipeline","applyCaptureWindow","segmentIngest","playbackUi","statusInterval","updateCompositorThumbnails","updateCompositorOutput"} do
    ctx._profile[k] = { total = 0, count = 0, max = 0, last = 0, avg = 0 }
  end
end

_G.__avsdProfileStart = function(ctx, key)
  if not ctx._profile then return end
  local t = ctx._profile[key]
  if not t then return end
  t._start = nowSeconds()
end

_G.__avsdProfileEnd = function(ctx, key)
  if not ctx._profile then return end
  local t = ctx._profile[key]
  if not t or not t._start then return end
  local elapsed = (nowSeconds() - t._start) * 1000000
  t.last = elapsed
  t.total = t.total + elapsed
  t.count = t.count + 1
  if elapsed > t.max then t.max = elapsed end
  t.avg = t.count == 1 and elapsed or (t.avg * 0.95 + elapsed * 0.05)
  t._start = nil
end

-- Alias to avoid repeated _G lookups
local profileStart = _G.__avsdProfileStart
local profileEnd = _G.__avsdProfileEnd

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

local function segPayload(ctx)
  return {
    version = 1,
    fitMode = "contain",
    modelPath = ctx._segModelPath or "",
    gain = ctx.seg.gain,
    useSigmoid = ctx.seg.useSigmoid,
    threshold = ctx.seg.threshold,
    feather = ctx.seg.feather,
    invert = ctx.seg.invert,
    background = 0.0,
  }
end

local function bindInputSurfaces(ctx)
  profileStart(ctx, "bindInputSurfaces")
  if ctx.widgets.liveViewport and ctx.widgets.liveViewport.node then
    ctx.widgets.liveViewport.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "live" })
  end

  local hasModel = ctx._segModelPath ~= nil

  -- Create ML source nodes as children of inputsEmbed so they render every
  -- frame inside the Sources retained panel. ml_composite surfaces only
  -- produce output when the node is actually drawn (unlike gpu_shader).
  local function ensureMLSourceNode(nodeId, mlType)
    if ctx["_mlSrcNode_" .. nodeId] then return ctx["_mlSrcNode_" .. nodeId] end
    local parent = ctx.widgets and ctx.widgets.inputsEmbed and ctx.widgets.inputsEmbed.node
    if not (parent and parent.createChild) then return nil end
    local node = parent:createChild(nodeId .. "_src")
    if node then
      node:setNodeId(nodeId)
      node:setBounds(0, 0, 4, 4)
      node:setVisible(true)
      node:setInterceptsMouse(false, false)
      ctx["_mlSrcNode_" .. nodeId] = node
    end
    return node
  end

  local segNode = ensureMLSourceNode("avsd_ml_seg")
  local poseNode = ensureMLSourceNode("avsd_ml_pose")

  if segNode and hasModel then
    segNode:setCustomSurface("ml_composite", segPayload(ctx))
  end
  if poseNode and hasModel then
    poseNode:setCustomSurface("ml_composite", segPayload(ctx))
  end

  if ctx.widgets.segViewport and ctx.widgets.segViewport.node and hasModel then
    ctx.widgets.segViewport.node:setCustomSurface("ml_composite", segPayload(ctx))
  end
  if ctx.widgets.poseViewport and ctx.widgets.poseViewport.node and hasModel then
    ctx.widgets.poseViewport.node:setCustomSurface("ml_composite", segPayload(ctx))
  end
  profileEnd(ctx, "bindInputSurfaces")
end

local function tryLoad(paths)
  if not (ml and ml.load) then return nil, nil end
  for _, p in ipairs(paths) do
    local ok, pipe = pcall(ml.load, p)
    if ok and pipe then return pipe, p end
  end
  return nil, nil
end

local function loadModels(ctx)
  local projectDir = projectRootDir()
  local scriptsProjects = parentDir(projectDir)
  ctx._segPipeline, ctx._segModelPath = tryLoad({
    join(projectDir, "selfie_segmentation.onnx"),
    join(scriptsProjects, "AVSampler/selfie_segmentation.onnx"),
    join(scriptsProjects, "AVSamplerLab/selfie_segmentation.onnx"),
    join(scriptsProjects, "MLLab/selfie_segmentation.onnx"),
    join(scriptsProjects, "WebcamViewer/selfie_segmentation.onnx"),
  })
  ctx._posePipeline, ctx._poseModelPath = tryLoad({
    join(projectDir, "movenet_singlepose_lightning.onnx"),
    join(scriptsProjects, "AVSampler/movenet_singlepose_lightning.onnx"),
    join(scriptsProjects, "AVSamplerLab/movenet_singlepose_lightning.onnx"),
    join(scriptsProjects, "MLLab/movenet_singlepose_lightning.onnx"),
  })
  if ctx._posePipeline and ctx._posePipeline.setNormalization then ctx._posePipeline:setNormalization(1.0, 0.0) end
  bindInputSurfaces(ctx)
  setText(ctx.widgets.poseStatus, string.format("Models: seg=%s pose=%s", ctx._segModelPath and "OK" or "missing", ctx._poseModelPath and "OK" or "missing"))
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
  bindInputSurfaces(ctx)
  updateOutputAspect(ctx)
end

local function closeWebcam(ctx)
  if capture and capture.close then capture.close() end
  setText(ctx.widgets.webcamStatus, "Webcam: closed")
end

local function applyCaptureWindow(ctx)
  if not ctx.videoCap then return end
  local seconds = clamp(readParam(NS .. "/capture_seconds", 4), 0.25, MAX_CAPTURE_SECONDS)
  if ctx._lastCaptureSecondsApplied ~= seconds then
    ctx.videoCap:setCaptureSeconds(seconds)
    ctx._lastCaptureSecondsApplied = seconds
  end
end

local function applyVideoWindow(ctx)
  if not ctx.video then return end
  ctx.video:setPlayStart(clamp(readParam(NS .. "/play_start", 0), 0, 1))
  ctx.video:setLoopStart(clamp(readParam(NS .. "/loop_start", 0), 0, 1))
  ctx.video:setLoopEnd(clamp(readParam(NS .. "/loop_end", 1), 0, 1))
  ctx.video:setCrossfade(clamp(readParam(NS .. "/crossfade", 0.03), 0, 0.5))
  ctx.video:setOneShot(readParam(NS .. "/one_shot", 0) > 0.5)
end

local function doRetroCapture(ctx, secondsOverride)
  if not (ctx.videoCap and ctx.video) then return end
  local previousCaptureSeconds = readParam(NS .. "/capture_seconds", 4)
  local seconds = clamp(secondsOverride or previousCaptureSeconds, 0.25, MAX_CAPTURE_SECONDS)
  if secondsOverride ~= nil then writeParam(NS .. "/capture_seconds", seconds) end
  applyCaptureWindow(ctx)
  local clk = clockInfo()
  local sr = tonumber(clk.sampleRate) or 44100
  local samplesBack = math.max(1, math.floor(seconds * sr))
  bump(NS .. "/capture_trigger")
  local seams = ctx._testSeams or nil
  local okVideo = false
  if type(seams) == "table" and (type(seams.capture) == "table" or type(seams.sampler) == "table") then
    seams.capture = type(seams.capture) == "table" and seams.capture or {}
    seams.sampler = type(seams.sampler) == "table" and seams.sampler or {}
    seams.sampler.frameCount = math.max(0, round(seams.sampler.frameCount or seams.capture.frameCount or 0))
    seams.sampler.durationSeconds = seconds
    seams.sampler.position = 0
    seams.sampler.playing = false
    seams.sampler.playStart = clamp(readParam(NS .. "/play_start", 0), 0, 1)
    seams.sampler.loopStart = clamp(readParam(NS .. "/loop_start", 0), 0, 1)
    seams.sampler.loopEnd = clamp(readParam(NS .. "/loop_end", 1), 0, 1)
    seams.sampler.crossfade = clamp(readParam(NS .. "/crossfade", 0.03), 0, 0.5)
    seams.sampler.oneShot = readParam(NS .. "/one_shot", 0) > 0.5
    seams.capture.captureSeconds = seconds
    okVideo = true
  else
    okVideo = ctx.videoCap:copyRecentToSampler(ctx.video, samplesBack)
    ctx.video:seek(0)
    applyVideoWindow(ctx)
  end
  ctx._lastCapturedSeconds = seconds
  ctx._lastVideoCommitOk = okVideo == true
  refreshWaveform(ctx)
  updatePreviewSurface(ctx)
  if secondsOverride ~= nil then
    writeParam(NS .. "/capture_seconds", previousCaptureSeconds)
    ctx._lastCaptureSecondsApplied = nil
  end
end

local function setCaptureButtonAppearance(ctx)
  local recording = ctx.captureMode == 1 and ctx.captureRecording == true
  setLabel(ctx.widgets.captureNow, recording and "STOP" or "Capture A/V")
  if ctx.widgets.captureNow and ctx.widgets.captureNow.setBg then
    ctx.widgets.captureNow:setBg(recording and 0xffdc2626 or 0xff22c55e)
  end
end

local function onCaptureButton(ctx)
  ctx.captureMode = round(readParam(NS .. "/capture_mode", ctx.captureMode or 0))
  if ctx.captureMode == 1 then
    if ctx.captureRecording then
      local clk = clockInfo()
      local sr = tonumber(clk.sampleRate) or 44100
      local elapsed = math.max(0.25, ((tonumber(clk.playTimeSamples) or 0) - (ctx.freeStartSamples or 0)) / sr)
      ctx.captureRecording = false
      doRetroCapture(ctx, elapsed)
      setCaptureButtonAppearance(ctx)
    else
      local clk = clockInfo()
      ctx.freeStartSamples = tonumber(clk.playTimeSamples) or 0
      ctx.captureRecording = true
      setCaptureButtonAppearance(ctx)
    end
  else
    doRetroCapture(ctx)
  end
end

local function letterbox(vpW, vpH, vidW, vidH)
  if vidW <= 0 or vidH <= 0 then return 0, 0, vpW, vpH end
  local va, pa = vidW / vidH, vpW / vpH
  if va > pa then local dh = vpW / va return 0, math.floor((vpH - dh) / 2), vpW, math.floor(dh) end
  local dw = vpH * va
  return math.floor((vpW - dw) / 2), 0, math.floor(dw), vpH
end

local function buildPoseDisplay(kps, conf, show, w, h, vidW, vidH)
  local d = {}
  if not kps then return d end
  local ox, oy, dw, dh = letterbox(w, h, vidW or 640, vidH or 480)
  local function mx(x) return math.floor(ox + clamp(x, 0, 1) * dw) end
  local function my(y) return math.floor(oy + clamp(y, 0, 1) * dh) end
  if show then
    for _, c in ipairs(SKELETON) do
      local a, b = kps[c[1]], kps[c[2]]
      if a and b and a.conf > conf and b.conf > conf then
        d[#d + 1] = { cmd = "drawLine", x1 = mx(a.x), y1 = my(a.y), x2 = mx(b.x), y2 = my(b.y), thickness = 2, color = 0xff00ffff }
      end
    end
  end
  for i, k in ipairs(kps) do
    if k.conf > conf then
      local x, y = mx(k.x), my(k.y)
      d[#d + 1] = { cmd = "fillRoundedRect", x = x - 3, y = y - 3, w = 6, h = 6, radius = 3, color = (i == 10 or i == 11) and 0xffff5c8a or 0xff22c55e }
    end
  end
  return d
end

local function ensurePoseOverlay(ctx)
  local vp = ctx.widgets.poseViewport
  if not (vp and vp.node) then return end
  if not ctx._poseOverlay and vp.node.addChild then
    local o = vp.node:addChild("avSamplerPoseOverlay")
    if o then
      o:setInterceptsMouse(false, false)
      o:setDisplayList({})
      ctx._poseOverlay = o
    end
  end
  if ctx._poseOverlay then
    local pw = ctx._poseVpW or math.max(1, math.floor(vp.node:getWidth() or 1))
    local ph = ctx._poseVpH or math.max(1, math.floor(vp.node:getHeight() or 1))
    ctx._poseOverlay:setBounds(0, 0, pw, ph)
  end
end

local function runPose(ctx, frameInfo)
  profileStart(ctx, "runPose")
  local seams = ctx._testSeams or nil
  local usingSeam = type(seams) == "table" and type(seams.poseKeypoints) == "table"
  if not usingSeam and not (ctx._posePipeline and capture and capture.isOpen and capture.isOpen()) then profileEnd(ctx, "runPose"); return false end
  if not shouldRunInterval(ctx, "pose", POSE_INTERVAL) then profileEnd(ctx, "runPose"); return false end
  local seq = tonumber((usingSeam and (seams.poseSequence or (frameInfo and frameInfo.sequence))) or (frameInfo and frameInfo.sequence))
  if seq ~= nil and ctx._lastPoseFrameSeq == seq then profileEnd(ctx, "runPose"); return false end
  local kps = {}
  if usingSeam then
    for i = 1, 17 do
      local src = seams.poseKeypoints[i] or {}
      kps[i] = { x = clamp(src.x or 0, 0, 1), y = clamp(src.y or 0, 0, 1), conf = tonumber(src.conf or 0) or 0 }
    end
  else
    local ok, result = pcall(ml.infer, ctx._posePipeline)
    if not ok or not result or type(result.data) ~= "table" or #result.data < 51 then profileEnd(ctx, "runPose"); return false end
    local inputW, inputH = ctx._posePipeline:inputWidth(), ctx._posePipeline:inputHeight()
    for i = 0, 16 do
      local y, x, c = tonumber(result.data[i * 3 + 1]) or 0, tonumber(result.data[i * 3 + 2]) or 0, tonumber(result.data[i * 3 + 3]) or 0
      if x > 1.5 then x = x / inputW end
      if y > 1.5 then y = y / inputH end
      kps[i + 1] = { x = clamp(x, 0, 1), y = clamp(y, 0, 1), conf = c }
    end
  end
  if seq ~= nil then ctx._lastPoseFrameSeq = seq end

  ctx.pose = { keypoints = kps, byName = {} }
  for i, name in ipairs(KEYPOINTS) do ctx.pose.byName[name] = kps[i] end
  local lw, rw, nose = ctx.pose.byName.left_wrist, ctx.pose.byName.right_wrist, ctx.pose.byName.nose
  local ls, rs = ctx.pose.byName.left_shoulder, ctx.pose.byName.right_shoulder
  local spread = (lw and rw) and math.sqrt((lw.x - rw.x)^2 + (lw.y - rw.y)^2) or 0
  local leftReach = (lw and ls) and math.sqrt((lw.x - ls.x)^2 + (lw.y - ls.y)^2) or 0
  local rightReach = (rw and rs) and math.sqrt((rw.x - rs.x)^2 + (rw.y - rs.y)^2) or 0
  ctx.pose.values = {}
  for _, name in ipairs(KEYPOINTS) do
    local kp = ctx.pose.byName[name]
    ctx.pose.values[NS .. "/pose/" .. name .. "/x"] = kp and kp.x or 0
    ctx.pose.values[NS .. "/pose/" .. name .. "/y"] = kp and kp.y or 0
    ctx.pose.values[NS .. "/pose/" .. name .. "/confidence"] = kp and kp.conf or 0
  end
  ctx.pose.values[NS .. "/pose/both_hands/spread"] = clamp(spread, 0, 1)
  ctx.pose.values[NS .. "/pose/left_arm/reach"] = clamp(leftReach, 0, 1)
  ctx.pose.values[NS .. "/pose/right_arm/reach"] = clamp(rightReach, 0, 1)

  if ctx._poseOverlay then
    ensurePoseOverlay(ctx)
    local frame = frameInfo or ((capture and capture.getFrameInfo and capture.getFrameInfo()) or {})
    ctx._poseOverlay:setDisplayList(buildPoseDisplay(kps, ctx.poseConf, ctx.showSkeleton, ctx._poseOverlay:getWidth(), ctx._poseOverlay:getHeight(), frame.width or 640, frame.height or 480))
  end
  local visible = 0
  for _, kp in ipairs(kps) do if kp.conf > ctx.poseConf then visible = visible + 1 end end
  setText(ctx.widgets.poseStatus, string.format("Pose: %d/17 visible | nose %.2f %.2f | wrists spread %.2f", visible, nose and nose.x or 0, nose and nose.y or 0, spread))
  profileEnd(ctx, "runPose")
  return true
end

local function poseSourceValue(ctx, track)
  local mapping = ctx.mappings[track]
  local idx = math.max(1, math.min(#POSE_SOURCES, round(mapping.source or 1)))
  local source = POSE_SOURCES[idx]
  local pose = ctx.pose and ctx.pose.byName or {}
  if source and source.keypoint then
    local kp = pose[source.keypoint]
    if not kp then return 0 end
    if source.property == "x" then return kp.x or 0 end
    if source.property == "y" then return kp.y or 0 end
    return kp.conf or 0
  end
  local values = ctx.pose and ctx.pose.values or {}
  if source and source.derived == "both_hands_spread" then return values[NS .. "/pose/both_hands/spread"] or 0 end
  if source and source.derived == "left_arm_reach" then return values[NS .. "/pose/left_arm/reach"] or 0 end
  if source and source.derived == "right_arm_reach" then return values[NS .. "/pose/right_arm/reach"] or 0 end
  return 0
end

local function applyMappingTrack(ctx, track)
  local mapping = ctx.mappings[track]
  if not mapping or not mapping.enabled then return nil end
  local sourceValue = clamp(poseSourceValue(ctx, track), 0, 1)
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

local function defaultMLSourceSpec(mlType)
  local params = { gain = 1.0, threshold = 0.5, feather = 0.15, background = 0.02, useSigmoid = true, invert = false }
  return { kind = "ml", mlType = mlType or "segmented", params = params }
end

materializeGeneratorParams = function(ctx, sourceId, normalizedParams)
  local choice = nil
  for _, s in ipairs(ctx.sources or {}) do
    if s.kind == "generator" and s.id == sourceId then
      choice = s
      break
    end
  end
  if not choice then return cloneTable(normalizedParams or {}) end
  local out = {}
  local specParams = choice.params or {}
  local values = normalizedParams or {}
  for _, pspec in ipairs(specParams) do
    local pmin = tonumber(pspec.min) or 0
    local pmax = tonumber(pspec.max) or 1
    local norm = values[pspec.id]
    if norm == nil then
      out[pspec.id] = tonumber(pspec.default) or pmin
    else
      out[pspec.id] = pmin + clamp(norm, 0, 1) * (pmax - pmin)
    end
  end
  return out
end

local function currentCol1SourceSpec(ctx)
  if ctx._col1SourceSpec and type(ctx._col1SourceSpec) == "table" then
    return ctx._col1SourceSpec
  end
  local choice = ctx.sources and ctx.sources[ctx.shader.sourceIndex]
  if choice and choice.kind == "generator" then
    local params = {}
    local specParams = choice.params or {}
    local stored = ctx.shaderSourceParams or {}
    for _, pspec in ipairs(specParams) do
      local norm = stored[pspec.id]
      if norm == nil then
        local pmin = tonumber(pspec.min) or 0
        local pmax = tonumber(pspec.max) or 1
        norm = ((tonumber(pspec.default) or pmin) - pmin) / math.max(0.001, pmax - pmin)
      end
      params[pspec.id] = clamp(norm, 0, 1)
    end
    ctx._col1SourceSpec = { kind = "generator", sourceIndex = ctx.shader.sourceIndex, sourceId = choice.id, params = params }
  else
    ctx._col1SourceSpec = { kind = "webcam", sourceIndex = 1 }
  end
  return ctx._col1SourceSpec
end

sourceSpecForColumn = function(ctx, col)
  if tonumber(col) == 1 then return currentCol1SourceSpec(ctx) end
  local cd = ctx._colData and ctx._colData[col]
  return cd and cd.source or nil
end

setSourceSpecForColumn = function(ctx, col, spec)
  col = tonumber(col) or 1
  ctx.sourceSelectionCol = col
  if col == 1 then
    ctx._col1SourceSpec = cloneTable(spec)
    if spec.kind == "generator" then
      local idx = 1
      for i, s in ipairs(ctx.sources or {}) do
        if s.kind == "generator" and s.id == spec.sourceId then idx = i break end
      end
      ctx.shader.sourceIndex = idx
      writeParam(NS .. "/shader/source", idx)
      ctx.shaderSourceParams = cloneTable(spec.params or {})
    else
      ctx.shader.sourceIndex = 1
      if spec.kind == "webcam" then
        writeParam(NS .. "/shader/source", 1)
      end
    end
    setSelectedSilently(ctx.widgets.sourceSelect, math.max(1, ctx.shader.sourceIndex or 1))
    syncShaderSourceParams(ctx)
    updateOutputAspect(ctx)
    updateShader(ctx)
    return
  end
  ctx._colData = ctx._colData or {}
  ctx._colData[col] = ctx._colData[col] or AVSD.State.colInit(col)
  ctx._colData[col].source = cloneTable(spec)
  syncShaderSourceParams(ctx)
  updateGridThumbnails(ctx)
end

local function ensureAuxSourceNode(ctx, key, nodeId)
  ctx._auxSourceNodes = ctx._auxSourceNodes or {}
  local existing = ctx._auxSourceNodes[key]
  local cw, ch = canonicalAspectSize(ctx)
  if existing and existing.node then
    if existing.node.setBounds then existing.node:setBounds(0, 0, cw, ch) end
    return existing
  end
  local rootNode = ctx.root and ctx.root.node
  if not (rootNode and rootNode.createChild) then return nil end
  local node = rootNode:createChild(nodeId)
  if not node then return nil end
  local entry = { id = nodeId, node = node }
  node:setNodeId(nodeId)
  node:setBounds(0, 0, cw, ch)
  node:setVisible(false)
  ctx._auxSourceNodes[key] = entry
  return entry
end

local function buildPoseSourcePayload(ctx, baseSourceId, spec)
  ctx._poseSourceFragment = ctx._poseSourceFragment or (function()
    local lines = {}
    lines[#lines + 1] = "#version 150"
    lines[#lines + 1] = "in vec2 vUv;"
    lines[#lines + 1] = "out vec4 fragColor;"
    lines[#lines + 1] = "uniform sampler2D uInputTex;"
    lines[#lines + 1] = "uniform float uPoseConf;"
    for i = 0, 16 do lines[#lines + 1] = string.format("uniform vec3 uKp%d;", i) end
    lines[#lines + 1] = [[
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.00001), 0.0, 1.0);
  return length(pa - ba * h);
}
float lineMask(vec2 p, vec2 a, vec2 b, float r) {
  float d = segDist(p, a, b);
  return 1.0 - smoothstep(r, r * 1.8, d);
}
float pointMask(vec2 p, vec2 a, float r) {
  float d = length(p - a);
  return 1.0 - smoothstep(r, r * 1.8, d);
}
void addLine(inout vec3 rgb, vec3 a, vec3 b, vec3 col) {
  if (a.z < uPoseConf || b.z < uPoseConf) return;
  vec2 pa = vec2(a.x, 1.0 - a.y);
  vec2 pb = vec2(b.x, 1.0 - b.y);
  float m = lineMask(vUv, pa, pb, 0.008);
  rgb = mix(rgb, col, m);
}
void addPoint(inout vec3 rgb, vec3 k, vec3 col) {
  if (k.z < uPoseConf) return;
  vec2 p = vec2(k.x, 1.0 - k.y);
  float m = pointMask(vUv, p, 0.015);
  rgb = mix(rgb, col, m);
}
void main() {
  vec4 base = texture(uInputTex, vUv);
  vec3 rgb = base.rgb;
]]
    for _, pair in ipairs(SKELETON) do
      lines[#lines + 1] = string.format("  addLine(rgb, uKp%d, uKp%d, vec3(0.0, 1.0, 1.0));", pair[1] - 1, pair[2] - 1)
    end
    for i = 0, 16 do
      local col = (i == 9 or i == 10) and "vec3(1.0, 0.36, 0.54)" or "vec3(0.13, 0.78, 0.37)"
      lines[#lines + 1] = string.format("  addPoint(rgb, uKp%d, %s);", i, col)
    end
    lines[#lines + 1] = "  fragColor = vec4(rgb, 1.0);"
    lines[#lines + 1] = "}"
    return table.concat(lines, "\n")
  end)()

  local uniforms = { uPoseConf = ctx.poseConf or 0.3 }
  local byName = ctx.pose and ctx.pose.byName or {}
  for i, name in ipairs(KEYPOINTS) do
    local kp = byName[name] or { x = 0.0, y = 0.0, conf = 0.0 }
    uniforms["uKp" .. tostring(i - 1)] = { kp.x or 0.0, kp.y or 0.0, kp.conf or 0.0 }
  end

  return {
    version = 1,
    kind = "shaderQuad",
    shaderLanguage = "glsl",
    sourceType = "node_surface",
    sourceId = baseSourceId,
    fitMode = "contain",
    passes = {
      {
        vertexShader = [[#version 150
in vec2 aPos;
in vec2 aUv;
out vec2 vUv;
void main(){ vUv = aUv; gl_Position = vec4(aPos, 0.0, 1.0); }
]],
        fragmentShader = ctx._poseSourceFragment,
        inputTextureUniform = "uInputTex",
        uniforms = uniforms,
      }
    }
  }
end

applySourceSpecToHiddenNode = function(ctx, spec, key)
  local kind = spec and spec.kind or "webcam"
  if kind == "webcam" then
    local entry = ensureAuxSourceNode(ctx, key .. "_webcam", "__" .. key .. "_webcam")
    if entry and entry.node then
      entry.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "live" })
      return { type = "node", sourceId = entry.id }, nil
    end
    return { type = "webcam" }, nil
  end
  if kind == "generator" then
    local entry = ensureAuxSourceNode(ctx, key .. "_gen", "__" .. key .. "_gen")
    if entry and entry.node and shaders then
      local params = materializeGeneratorParams(ctx, spec.sourceId, spec.params or {})
      local ok, payload = pcall(shaders.buildPipeline, {}, "contain", { type = "generator", sourceId = spec.sourceId, params = params })
      if ok and payload then
        entry.node:setCustomSurface("gpu_shader", payload)
        return { type = "node", sourceId = entry.id }, nil
      end
    end
    return { type = "webcam" }, nil
  end
  if kind == "ml" then
    local opaque = ensureAuxSourceNode(ctx, key .. "_ml_base", "__" .. key .. "_ml_base")
    if opaque and opaque.node then
      local mlp = {
        version = 1,
        fitMode = "contain",
        modelPath = ctx._segModelPath or "",
        gain = tonumber((spec.params or {}).gain) or 1.0,
        useSigmoid = ((spec.params or {}).useSigmoid ~= false),
        threshold = tonumber((spec.params or {}).threshold) or 0.5,
        feather = tonumber((spec.params or {}).feather) or 0.15,
        invert = ((spec.params or {}).invert == true),
        background = math.max(0.001, tonumber((spec.params or {}).background) or 0.02),
      }
      opaque.node:setCustomSurface("ml_composite", mlp)
      if spec.mlType == "pose" then
        local overlay = ensureAuxSourceNode(ctx, key .. "_ml_pose", "__" .. key .. "_ml_pose")
        if overlay and overlay.node then
          overlay.node:setCustomSurface("gpu_shader", buildPoseSourcePayload(ctx, opaque.id, spec))
          return { type = "node", sourceId = overlay.id }, nil
        end
      end
      return { type = "node", sourceId = opaque.id }, nil
    end
    return { type = "webcam" }, nil
  end
  if kind == "columntap" then
    local sourceId = stackNodeIdForTap(spec.sourceCol or 1, spec.tapIndex)
    return { type = "node", sourceId = sourceId }, nil
  end
  return { type = "webcam" }, nil
end

local function ensureShaderSourceNode(ctx)
  local cw, ch = canonicalAspectSize(ctx)
  if ctx._shaderSourceNode and ctx._shaderSourceNode.node then
    if ctx._shaderSourceNode.node.setBounds then ctx._shaderSourceNode.node:setBounds(0, 0, cw, ch) end
    return ctx._shaderSourceNode
  end
  local rootNode = ctx.root and ctx.root.node
  if not (rootNode and rootNode.createChild) then return nil end
  local node = rootNode:createChild("avsd_shader_source")
  if not node then return nil end
  local entry = { id = "__avsd_shader_source", node = node }
  if node.setNodeId then node:setNodeId(entry.id) end
  if node.setBounds then node:setBounds(0, 0, cw, ch) end
  if node.setVisible then node:setVisible(false) end
  ctx._shaderSourceNode = entry
  return entry
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

local function refreshShaderLists(ctx)
  ctx.effects = (shaders and shaders.listEffects and shaders.listEffects()) or {}
  if #ctx.effects == 0 then ctx.effects = { { id = "none", name = "Passthrough", params = {} } } end
  ctx.sources = { { kind = "webcam", id = "webcam", name = "Webcam", params = {} } }
  local gens = (sources and sources.list and sources.list()) or {}
  for i = 1, #gens do
    local gen = gens[i]
    local genParams = gen.params or {}
    local newParams = {}
    for pi = 1, #genParams do
      local pspec = genParams[pi]
      if pspec then
        newParams[pi] = {
          id = pspec.id,
          name = pspec.name,
          unit = pspec.unit,
          min = pspec.min,
          max = pspec.max,
          default = pspec.default,
          step = pspec.step,
        }
      end
    end
    ctx.sources[#ctx.sources + 1] = { kind = "generator", id = gen.id, name = gen.name or gen.id, params = newParams }
  end
  local effectNames, sourceNames, poseNames = {}, {}, {}
  for i, source in ipairs(POSE_SOURCES) do poseNames[i] = source.label end
  for i, e in ipairs(ctx.effects) do effectNames[i] = tostring(e.name or e.id or "Effect") end
  for i, s in ipairs(ctx.sources) do sourceNames[i] = tostring(s.name or s.id or "Source") end
  setOptions(ctx.widgets.effectSelect, effectNames)
  setOptions(ctx.widgets.sourceSelect, sourceNames)
  for track = 1, MAX_MAPPINGS do
    setOptions(ctx.widgets["mapping" .. track .. "Source"], poseNames)
    setOptions(ctx.widgets["mapping" .. track .. "Target"], AVSD.Mapping.TARGET_LABELS)
  end
end

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

local function samplePosition(path, fallback)
  local seam = _G.__avsdCtx and _G.__avsdCtx._testSeams and _G.__avsdCtx._testSeams.playback
  if type(seam) == "table" then
    local override = seam[path]
    if type(override) == "table" then
      return override.playing == true, clamp(override.pos or fallback or 0, 0, 1)
    end
  end
  local playing = false
  if type(isSampleRegionPlaybackPlaying) == "function" then
    local ok, v = pcall(isSampleRegionPlaybackPlaying, path)
    playing = ok and v == true
  end
  local pos = fallback or 0
  if playing and type(getSampleRegionPlaybackLoopAwarePosition) == "function" then
    local ok, v = pcall(getSampleRegionPlaybackLoopAwarePosition, path)
    if ok and tonumber(v) then pos = clamp(v, 0, 1) end
  end
  return playing, pos
end

local function setCellSurface(ctx, slot, sourceIndex, pos, label)
  local cell = ctx.widgets["cell" .. slot]
  if cell and cell.node and cell.node.setCustomSurface and ctx.video then
    cell.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "sampler", samplerId = ctx.video:getId(), position = clamp(pos or 0, 0, 1) })
  end
  local lab = ctx.widgets["cellLabel" .. slot]
  setText(lab, label or "")
end

layoutOutputRow = function(ctx)
  local host = ctx.widgets.outputViewport
  local surface = ctx.widgets.outputSurface
  local x0, y0 = 0, 0
  local w, h = 608, 342
  if surface and surface.node and surface.node.getBounds then
    local sx, sy, sw, sh = surface.node:getBounds()
    x0 = tonumber(sx) or 0
    y0 = tonumber(sy) or 0
    w = tonumber(sw) or w
    h = tonumber(sh) or h
  elseif host and host.node then
    if host.node.getWidth then w = tonumber(host.node:getWidth()) or w end
    if host.node.getHeight then h = tonumber(host.node:getHeight()) or h end
  end
  local frame = (capture and capture.getFrameInfo and capture.getFrameInfo()) or {}
  local ar = (tonumber(frame.width) or ctx._lockedW or 640) / math.max(1, (tonumber(frame.height) or ctx._lockedH or 480))
  local visible = {}
  local mode = round(readParam(NS .. "/mode", 0))
  if mode == 0 then
    for i = 1, MAX do if ctx._polyPlaying[i] then visible[#visible + 1] = { kind = "V", index = i, pos = ctx._polyPos[i] or 0 } end end
  else
    for i = 1, MAX do if ctx._slicePlaying[i] then visible[#visible + 1] = { kind = "S", index = i, pos = ctx._slicePos[i] or 0 } end end
  end
  ctx._visible = visible
  if #visible == 0 then
    for slot = 1, MAX do
      setBounds(ctx.widgets["cell" .. slot], 0, 0, 0, 0)
      setBounds(ctx.widgets["cellLabel" .. slot], 0, 0, 0, 0)
      setText(ctx.widgets["cellLabel" .. slot], "")
    end
    return
  end
  local count = #visible
  local cellW = math.floor(w / count)
  local cellH = math.floor(math.min(h, cellW / math.max(0.01, ar)))
  local y = math.floor(h - cellH)
  for slot = 1, MAX do
    local item = visible[slot]
    if item then
      local x = x0 + (slot - 1) * cellW
      local yy = y0 + y
      setBounds(ctx.widgets["cell" .. slot], x, yy, cellW, cellH)
      setBounds(ctx.widgets["cellLabel" .. slot], x + 8, yy + 8, math.max(1, cellW - 16), 18)
      setCellSurface(ctx, slot, item.index, item.pos, string.format("%s%d %.3f", item.kind, item.index, item.pos or 0))
    else
      setBounds(ctx.widgets["cell" .. slot], 0, 0, 0, 0)
      setBounds(ctx.widgets["cellLabel" .. slot], 0, 0, 0, 0)
      setText(ctx.widgets["cellLabel" .. slot], "")
    end
  end
end

updatePreviewSurface = function(ctx)
  local preview = ctx.widgets.previewStage
  if not (preview and preview.node and preview.node.setCustomSurface and ctx.video) then return end
  local mode = round(readParam(NS .. "/mode", 0))
  local pos = 0
  if mode == 0 then
    for i = 1, MAX do
      if ctx._polyPlaying[i] then pos = ctx._polyPos[i] or 0 break end
    end
    if pos <= 0 then pos = clamp(readParam(NS .. "/play_start", 0), 0, 1) end
  else
    local sel = math.max(1, math.min(MAX, round(ctx._selectedSlice or 1)))
    pos = ctx._slicePos[sel] or clamp(readParam(pathForSlice(sel), (sel - 1) / MAX), 0, 0.999)
  end
  preview.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "sampler", samplerId = ctx.video:getId(), position = clamp(pos, 0, 1) })
end

refreshWaveform = function(ctx)
  local wf = ctx.widgets and ctx.widgets.waveform
  if not wf then return end
  local mode = round(readParam(NS .. "/mode", 0))
  if wf.setSamplePath then wf:setSamplePath(mode == 0 and POLY_PATHS[1] or SLICE_PATHS[1]) end

  local playheads = {}
  if mode == 0 then
    local loopStart = clamp(readParam(NS .. "/loop_start", 0), 0, 0.999)
    local loopEnd = clamp(readParam(NS .. "/loop_end", 1), loopStart + 0.001, 1)
    local playStart = clamp(readParam(NS .. "/play_start", loopStart), loopStart, loopEnd)
    for i = 1, MAX do playheads[i] = (ctx._polyPlaying[i] and ctx._polyPos[i]) or -1 end
    if wf.setVoicePlayheads then wf:setVoicePlayheads(playheads) end
    if wf.setVoiceGrains then wf:setVoiceGrains({}) end
    if wf.setGrainPositions then wf:setGrainPositions({ loopStart, playStart, loopEnd }) end
    if wf.setGrainPosition then wf:setGrainPosition(-1) end
    if wf.setRegion then wf:setRegion(loopStart, loopEnd) end
    if wf.setPlayStart then wf:setPlayStart(playStart) end
    if wf.setCrossfade then wf:setCrossfade(clamp(readParam(NS .. "/crossfade", 0.03), 0, 0.5)) end
    local first = -1
    for i = 1, MAX do if playheads[i] and playheads[i] >= 0 then first = playheads[i] break end end
    if wf.setPlayheadPos then wf:setPlayheadPos(first >= 0 and first or playStart) end
    setText(ctx.widgets.waveformStatus, string.format("Poly: play %.3f | loop %.3f→%.3f | active voice playheads follow SampleRegionPlaybackNode positions", playStart, loopStart, loopEnd))
    return
  end

  local starts = {}
  for i = 1, MAX do starts[i] = clamp(readParam(pathForSlice(i), (i - 1) / MAX), 0, 0.999) end
  if wf.setGrainPositions then wf:setGrainPositions(starts) end
  if wf.setVoiceGrains then
    local g = {}
    for i = 1, MAX do g[i] = { starts[i] } end
    wf:setVoiceGrains(g)
  end
  for i = 1, MAX do playheads[i] = (ctx._slicePlaying[i] and ctx._slicePos[i]) or -1 end
  if wf.setVoicePlayheads then wf:setVoicePlayheads(playheads) end
  local sel = math.max(1, math.min(MAX, round(ctx._selectedSlice or 1)))
  local start = starts[sel] or 0
  local finish = 1.0
  for i = 1, MAX do if (starts[i] or 0) > start + 0.002 and starts[i] < finish then finish = starts[i] end end
  if wf.setRegion then wf:setRegion(start, finish) end
  if wf.setPlayStart then wf:setPlayStart(start) end
  if wf.setGrainPosition then wf:setGrainPosition(start) end
  if wf.setCrossfade then wf:setCrossfade(0.002) end
  if wf.setPlayheadPos then wf:setPlayheadPos(playheads[sel] ~= -1 and playheads[sel] or start) end
  setText(ctx.widgets.waveformStatus, string.format("Slice: selected S%d %.3f→%.3f | drag nearest marker to edit actual slice start", sel, start, finish))
end

local function nearestSlice(pos)
  local best, dist = 1, 999
  for i = 1, MAX do
    local d = math.abs(readParam(pathForSlice(i), (i - 1) / MAX) - pos)
    if d < dist then best, dist = i, d end
  end
  return best
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
  if oldSeg[1] ~= ctx.seg.gain or oldSeg[2] ~= ctx.seg.threshold or oldSeg[3] ~= ctx.seg.feather or oldSeg[4] ~= ctx.seg.invert then bindInputSurfaces(ctx) end
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
    m.source = math.max(1, math.min(#POSE_SOURCES, round(readParam(NS .. "/mapping/" .. t .. "/source", m.source or 1))))
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

  bindInputSurfaces(ctx)
  profileEnd(ctx, "syncParamsFromHost")
end

local function viewportSize()
  if type(imguiGetMainViewport) == "function" then
    local vp = imguiGetMainViewport()
    if type(vp) == "table" then
      local w = toNum(vp.w or vp.width or vp.sizeX or vp.size_x) or 0
      local h = toNum(vp.h or vp.height or vp.sizeY or vp.size_y) or 0
      if w > 0 and h > 0 then return w, h end
    end
  end
  return 1280, 720
end

local function projectContentBounds(ctx)
  local totalW, totalH = viewportSize()
  if type(shell) == "table" and type(shell.getContentBounds) == "function" then
    local ok, x, y, w, h = pcall(function() return shell:getContentBounds(totalW, totalH) end)
    if ok and toNum(w) and toNum(h) and w > 0 and h > 0 then
      return toNum(x) or 0, toNum(y) or 0, toNum(w), toNum(h)
    end
  end
  if ctx and ctx.root and ctx.root.node and ctx.root.node.getBounds then
    local ok, x, y, w, h = pcall(ctx.root.node.getBounds, ctx.root.node)
    if ok and toNum(w) and toNum(h) and w > 0 and h > 0 then
      return toNum(x) or 0, toNum(y) or 0, toNum(w), toNum(h)
    end
  end
  return 0, 0, totalW, totalH
end

local function windowName(ctx, win)
  return win.title .. "###AVSD_" .. tostring(ctx._dockSuffix or "0") .. "_" .. win.key
end

local function split(t)
  local r = imguiDockBuilderSplitNode(t.node, t.dir, t.ratio)
  if imguiDockBuilderSetNodeFlags then
    imguiDockBuilderSetNodeFlags(r.atDir, imguiDockNodeFlags_HiddenTabBar)
    imguiDockBuilderSetNodeFlags(r.opposite, imguiDockNodeFlags_HiddenTabBar)
  end
  return r.atDir, r.opposite
end

local function buildDeckLayout(ctx, dockId)
  local params, leftCol = split{ node = dockId, dir = imguiDir_Right, ratio = 0.26 }
  local leftInner, center = split{ node = leftCol, dir = imguiDir_Left, ratio = 0.34 }
  local wave, deck = split{ node = center, dir = imguiDir_Down, ratio = 0.25 }
  local sources, stage = split{ node = leftInner, dir = imguiDir_Down, ratio = 0.64 }

  local grid, comp = split{ node = deck, dir = imguiDir_Down, ratio = 0.65 }
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[1]), grid)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[2]), stage)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[3]), sources)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[4]), wave)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[5]), params)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[6]), comp)
end

local function buildStageLayout(ctx, dockId)
  local rightCol, leftCol = split{ node = dockId, dir = imguiDir_Right, ratio = 0.38 }
  local sources, params = split{ node = rightCol, dir = imguiDir_Down, ratio = 0.44 }
  local bottom, stage = split{ node = leftCol, dir = imguiDir_Down, ratio = 0.32 }
  local wave, deck = split{ node = bottom, dir = imguiDir_Down, ratio = 0.50 }

  local grid, comp = split{ node = deck, dir = imguiDir_Down, ratio = 0.65 }
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[1]), grid)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[2]), stage)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[3]), sources)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[4]), wave)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[5]), params)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[6]), comp)
end

local function buildInspectorLayout(ctx, dockId)
  local params, leftCol = split{ node = dockId, dir = imguiDir_Right, ratio = 0.38 }
  local sources, topLeft = split{ node = leftCol, dir = imguiDir_Down, ratio = 0.30 }
  local bottom, stage = split{ node = topLeft, dir = imguiDir_Down, ratio = 0.38 }
  local wave, deck = split{ node = bottom, dir = imguiDir_Down, ratio = 0.50 }

  local grid, comp = split{ node = deck, dir = imguiDir_Down, ratio = 0.65 }
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[1]), grid)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[2]), stage)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[3]), sources)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[4]), wave)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[5]), params)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[6]), comp)
end

local function syncToolbarButtons(ctx)
  local active = tostring(ctx._layoutPreset or "deck")
  local colours = { layoutDeck = active == "deck", layoutStage = active == "stage", layoutInspector = active == "inspector" }
  for id, on in pairs(colours) do
    local w = ctx.widgets and ctx.widgets[id]
    if w and w.setBg then w:setBg(on and 0xff22d3ee or 0xff1e293b) end
  end
  if ctx.widgets.resizeMode and ctx.widgets.resizeMode.setValue then setValueSilently(ctx.widgets.resizeMode, ctx._resizeMode == true) end
  setVisible(ctx.widgets.resizeHelp, ctx._resizeMode == true)
end

local function defaultGridAlignment(preset)
  if preset == "stage" or preset == "inspector" then return "left-to-right" end
  return "bottom-up"
end

local function setLayoutPreset(ctx, preset)
  ctx._layoutPreset = tostring(preset or "deck")
  ctx.gridAlignment = defaultGridAlignment(ctx._layoutPreset)
  ctx._rebuildDockTree = true
  resetPanelDocks(ctx)
  syncToolbarButtons(ctx)
end

local function layoutToolbar(ctx)
  if ctx.widgets and ctx.widgets.toolbarPane and ctx.root and ctx.root.node and ctx.root.node.getBounds then
    local _, _, w = ctx.root.node:getBounds()
    setBounds(ctx.widgets.toolbarPane, 0, 0, math.max(1280, math.floor(tonumber(w) or 1280)), TOOLBAR_H)
  end
  syncToolbarButtons(ctx)
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
  local sel = ctx and ctx.selection or nil
  if not sel then return nil end
  return ctx.clips and ctx.clips[sel.col] and ctx.clips[sel.col][sel.row] or nil
end

local function selectionSummary(ctx)
  local clip = selectedGridClip(ctx)
  if not clip then return "Selected: --" end
  if clip.kind == "source" then
    return string.format("Selected: Source — %s", clip.name or clip.sourceType or "Source")
  end
  local state = clip.enabled and "enabled" or "disabled"
  return string.format("Selected: FX L%d — %s (%s)", clip.layerIndex or 0, clip.fxName or clip.fxId or "Effect", state)
end

local function selectGridCell(ctx, col, row)
  local clip = ctx.clips and ctx.clips[col] and ctx.clips[col][row] or nil
  if not clip then return end

  ctx.selectedView = "grid"

  if row <= 1 then
    ctx.sourceSelectionCol = col
    return
  end

  -- Output tap: just select, don't change shader state
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
      writeParam(NS .. "/shader/active_layer", nextLayer)
    end
    setSelectedSilently(ctx.widgets.shaderLayer, ctx.shader.activeLayer)
    syncShaderEditor(ctx)
    return
  end

  -- Columns 2+: sync the colData into the effect inspector UI
  local fxSlot = row - 1
  local f = cd and cd.fx[fxSlot]
  if f then
    setSelectedSilently(ctx.widgets.shaderLayer, fxSlot)
    setSelectedSilently(ctx.widgets.effectSelect, f.effectIndex)
    syncShaderEditor(ctx)
  end
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

local CELL_SRC_TINT = 0xff0d2028
local CELL_FX_TINT = 0xff0d1420
local CELL_BORDER = 0xff1a1a22
local CELL_SRC_SEL_BD = 0xff22d3ee
local CELL_FX_SEL_BD = 0xfff97316

local function ensureGridCells(ctx)
  profileStart(ctx, "ensureGridCells")
  local parentNode = ctx.widgets and ctx.widgets.deckEmbed and ctx.widgets.deckEmbed.node
  if not parentNode then profileEnd(ctx, "ensureGridCells"); return 0, 0 end
  local numCols, numRows = syncClipModel(ctx)
  ctx._gridCells = ctx._gridCells or {}

  -- Create or reuse cells for each (col, row)
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
            selectGridCell(ctx, clickCol, clickRow)
          end)
        end
        ctx._gridCells[key] = { node = cell, thumb = thumb, label = lbl, col = col, row = row }
      end
    end
  end
  -- Hide cells beyond the grid bounds
  for key, cell in pairs(ctx._gridCells) do
    if cell.col > numCols or cell.row > numRows then
      cell.node:setBounds(0, 0, 0, 0)
    end
  end
  profileEnd(ctx, "ensureGridCells")
  return numCols, numRows
end

updateGridThumbnails = function(ctx)
  profileStart(ctx, "updateGridThumbnails")
  local cells = ctx._gridCells or {}
  local numCols, numRows = syncClipModel(ctx)
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
          sig = sig .. "|" .. sourceSpecSignature(ctx, col)
          if ctx._gridThumbSigs[key] ~= sig then
            ctx._gridThumbSigs[key] = sig
            local payload = buildNodePassthroughPayload(stackNodeIdForRow(col, 1))
            if payload then
              thumb:setCustomSurface("gpu_shader", payload)
            else
              clearNodeSurface(thumb)
            end
          end
        elseif clip.kind == "fx" and clip.enabled then
          sig = stackTapSignature(ctx, col, row)
          if ctx._gridThumbSigs[key] ~= sig then
            ctx._gridThumbSigs[key] = sig
            local payload = buildNodePassthroughPayload(stackNodeIdForRow(col, row))
            if payload then
              thumb:setCustomSurface("gpu_shader", payload)
            else
              clearNodeSurface(thumb)
            end
          end
        elseif clip.kind == "output" then
          sig = stackTapSignature(ctx, col, 10) .. "|output"
          if ctx._gridThumbSigs[key] ~= sig then
            ctx._gridThumbSigs[key] = sig
            local payload = buildNodePassthroughPayload(stackNodeIdForRow(col, 10))
            if payload then
              thumb:setCustomSurface("gpu_shader", payload)
            else
              clearNodeSurface(thumb)
            end
          end
        else
          clearNodeSurface(thumb)
        end
      else
        clearNodeSurface(thumb)
      end
    end
  end
  profileEnd(ctx, "updateGridThumbnails")
end

local EMPTY_CELL_BG = 0xff080c18

local function layoutClipGrid(ctx, w, h)
  setBounds(ctx.widgets.deckEmbed, 0, 0, w, h)
  syncClipModel(ctx)
  local pad, gap = 8, 4
  local availW = math.max(1, w - pad * 2)
  local availH = math.max(1, h - pad * 2)
  local numCols, numRows = ensureGridCells(ctx)
  if numCols < 1 or numRows < 1 then return end
  updateGridThumbnails(ctx)

  local alignment = ctx.gridAlignment or "bottom-up"
  local cellW, cellH

  if alignment == "left-to-right" then
    -- Columns stack vertically, rows extend right
    cellH = math.max(24, math.floor((availH - gap * (numCols - 1)) / numCols))
    cellW = math.max(40, math.floor((availW - gap * (numRows - 1)) / numRows))
  else
    -- bottom-up, top-down: columns side by side, rows stack vertically
    cellW = math.max(40, math.floor((availW - gap * (numCols - 1)) / numCols))
    cellH = math.max(24, math.floor((availH - gap * (numRows - 1)) / numRows))
  end

  -- Left-to-right: overlay label on thumb (minimal padding).
  -- Bottom-up/top-down: label below thumb with 16px overhead.
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
        -- Rows extend right, columns stack vertically
        cx = pad + (row - 1) * (cellW + gap)
        cy = pad + (col - 1) * (cellH + gap)
      else -- top-down
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
        bg = 0xff080c18
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
        local contentAspectW, contentAspectH = canonicalAspectSize(ctx)
        if isOverlay then
          -- Overlay label on thumb: thumb is boxed to the canonical source aspect.
          local ix, iy, iw, ih = fitBox(math.max(1, cellW - 4), math.max(1, cellH - 4), contentAspectW, contentAspectH)
          cell.thumb:setBounds(2 + ix, 2 + iy, iw, ih)
          cell.label:setBounds(4, math.max(1, cellH - 13), math.max(1, cellW - 8), labelH)
          local labelText = isOutput and "OUT" or (clip and (clip.name or clip.fxName) or "")
          local labelClr = isSource and 0xff22d3ee or (isOutput and 0xffa78bfa or 0xff94a3b8)
          cell.label:setDisplayList({
            { cmd = "fillRect", x = 0, y = 0, w = cellW + 8, h = labelH + 2, color = 0xaa000000 },
            { cmd = "drawText", text = labelText, color = labelClr, fontSize = 8, align = isOutput and "right" or "left", valign = "middle" },
          })
        else
          local ix, iy, iw, ih = fitBox(math.max(1, cellW - 4), math.max(1, thumbH - 2), contentAspectW, contentAspectH)
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

resetPanelDocks = function(ctx)
  ctx._panelDocks = {}
end

local function panelSplit(t)
  local r = imguiDockBuilderSplitNode(t.node, t.dir, t.ratio)
  if imguiDockBuilderSetNodeFlags then
    imguiDockBuilderSetNodeFlags(r.atDir, imguiDockNodeFlags_HiddenTabBar)
    imguiDockBuilderSetNodeFlags(r.opposite, imguiDockNodeFlags_HiddenTabBar)
  end
  return r.atDir, r.opposite
end

local function renderSourcesPanel(ctx)
  local dockspaceId = imguiGetID("AVSD_sources_ds")

  if not ctx._panelDocks or not ctx._panelDocks.sources then
    ctx._panelDocks = ctx._panelDocks or {}
    local avail = imguiGetContentRegionAvail()
    local pw = math.max(1, math.floor(tonumber(avail.x) or 300))
    local ph = math.max(1, math.floor(tonumber(avail.y) or 200))

    imguiDockBuilderRemoveNode(dockspaceId)
    imguiDockBuilderAddNode(dockspaceId, imguiDockNodeFlags_DockSpace)
    imguiDockBuilderSetNodeSize(dockspaceId, pw, ph)

    local viewports, controls = panelSplit{ node = dockspaceId, dir = imguiDir_Down, ratio = 0.55 }
    local liveArea, rest = panelSplit{ node = viewports, dir = imguiDir_Left, ratio = 0.33 }
    local segArea, poseArea = panelSplit{ node = rest, dir = imguiDir_Left, ratio = 0.50 }

    imguiDockBuilderDockWindow("Live###AVSD_live", liveArea)
    imguiDockBuilderDockWindow("Segmented###AVSD_seg", segArea)
    imguiDockBuilderDockWindow("Pose###AVSD_pose", poseArea)
    imguiDockBuilderDockWindow("Controls###AVSD_src_ctrl", controls)

    imguiDockBuilderFinish(dockspaceId)
    ctx._panelDocks.sources = true
  end

  imguiDockSpace(dockspaceId, 0, 0, imguiDockNodeFlags_None)

  -- Live viewport dock window
  if imguiBegin("Live###AVSD_live", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      setBounds(ctx.widgets.liveViewport, 0, 0, math.floor(av.x), math.floor(av.y))
      imguiRetainedPanel(ctx.widgets.liveViewport.node, math.floor(av.x), math.floor(av.y), true)
    end
  end
  imguiEnd()

  -- Segmented viewport dock window
  if imguiBegin("Segmented###AVSD_seg", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      setBounds(ctx.widgets.segViewport, 0, 0, math.floor(av.x), math.floor(av.y))
      imguiRetainedPanel(ctx.widgets.segViewport.node, math.floor(av.x), math.floor(av.y), true)
    end
  end
  imguiEnd()

  -- Pose viewport dock window
  if imguiBegin("Pose###AVSD_pose", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      setBounds(ctx.widgets.poseViewport, 0, 0, math.floor(av.x), math.floor(av.y))
      ctx._poseVpW = math.floor(av.x)
      ctx._poseVpH = math.floor(av.y)
      ensurePoseOverlay(ctx)
      if ctx._poseOverlay then
        ctx._poseOverlay:setBounds(0, 0, ctx._poseVpW, ctx._poseVpH)
      end
      imguiRetainedPanel(ctx.widgets.poseViewport.node, math.floor(av.x), math.floor(av.y), true)
    end
  end
  imguiEnd()

  -- Controls dock window
  if imguiBegin("Controls###AVSD_src_ctrl", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      layoutInputsEmbed(ctx, math.floor(av.x), math.floor(av.y))
      imguiRetainedPanel(ctx.widgets.inputsEmbed.node, math.floor(av.x), math.floor(av.y), false)
    end
  end
  imguiEnd()
end

local function renderStagePanel(ctx)
  local dockspaceId = imguiGetID("AVSD_stage_ds")

  if not ctx._panelDocks or not ctx._panelDocks.stage then
    ctx._panelDocks = ctx._panelDocks or {}
    local avail = imguiGetContentRegionAvail()
    local pw = math.max(1, math.floor(tonumber(avail.x) or 500))
    local ph = math.max(1, math.floor(tonumber(avail.y) or 300))

    imguiDockBuilderRemoveNode(dockspaceId)
    imguiDockBuilderAddNode(dockspaceId, imguiDockNodeFlags_DockSpace)
    imguiDockBuilderSetNodeSize(dockspaceId, pw, ph)

    local outputArea, previewArea = panelSplit{ node = dockspaceId, dir = imguiDir_Right, ratio = 0.28 }

    imguiDockBuilderDockWindow("Output###AVSD_output", outputArea)
    imguiDockBuilderDockWindow("Preview###AVSD_preview", previewArea)

    imguiDockBuilderFinish(dockspaceId)
    ctx._panelDocks.stage = true
  end

  imguiDockSpace(dockspaceId, 0, 0, imguiDockNodeFlags_None)

  -- Output viewport dock window
  if imguiBegin("Output###AVSD_output", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      local rw, rh = math.floor(av.x), math.floor(av.y)
      setBounds(ctx.widgets.outputViewport, 0, 0, rw, rh)
      if ctx.widgets.outputSurface then
        local cw, ch = canonicalAspectSize(ctx)
        local ix, iy, iw, ih = fitBox(rw, rh, cw, ch)
        setBounds(ctx.widgets.outputSurface, ix, iy, iw, ih)
      end
      layoutOutputRow(ctx)
      imguiRetainedPanel(ctx.widgets.outputViewport.node, rw, rh, true)
    end
  end
  imguiEnd()

  -- Preview dock window
  if imguiBegin("Preview###AVSD_preview", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      local rw, rh = math.floor(av.x), math.floor(av.y)
      setBounds(ctx.widgets.previewStage, 0, 0, rw, rh)
      setBounds(ctx.widgets.previewStageTag, 5, 4, math.max(1, rw - 10), 12)
      imguiRetainedPanel(ctx.widgets.previewStage.node, rw, rh, true)
    end
  end
  imguiEnd()
end

local function renderWaveformPanel(ctx)
  local dockspaceId = imguiGetID("AVSD_waveform_ds")

  if not ctx._panelDocks or not ctx._panelDocks.waveform then
    ctx._panelDocks = ctx._panelDocks or {}
    local avail = imguiGetContentRegionAvail()
    local pw = math.max(1, math.floor(tonumber(avail.x) or 500))
    local ph = math.max(1, math.floor(tonumber(avail.y) or 120))

    imguiDockBuilderRemoveNode(dockspaceId)
    imguiDockBuilderAddNode(dockspaceId, imguiDockNodeFlags_DockSpace)
    imguiDockBuilderSetNodeSize(dockspaceId, pw, ph)

    imguiDockBuilderDockWindow("Waveform###AVSD_waveform", dockspaceId)

    imguiDockBuilderFinish(dockspaceId)
    ctx._panelDocks.waveform = true
  end

  imguiDockSpace(dockspaceId, 0, 0, imguiDockNodeFlags_None)

  -- Waveform viewport dock window
  if imguiBegin("Waveform###AVSD_waveform", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      setBounds(ctx.widgets.waveform, 0, 0, math.floor(av.x), math.floor(av.y))
      imguiRetainedPanel(ctx.widgets.waveform.node, math.floor(av.x), math.floor(av.y), true)
    end
  end
  imguiEnd()
  -- Waveform status renders as part of the waveform embed, not as its own dock
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
  local sourceCol = tonumber(ctx.sourceSelectionCol) or 1
  local sourceSelected = true
  local label
  if sourceCol > 1 then
    local cd = ctx._colData and ctx._colData[sourceCol]
    if cd and cd.source then
      label = "Stack " .. tostring(sourceCol) .. ": " .. colSourceLabel(ctx, sourceCol) .. " (grid)"
    else
      label = "Stack " .. tostring(sourceCol) .. ": (grid)"
    end
  else
    label = "Source (grid-selected)"
  end
  imguiTextColored(sourceSelected and 0xff22d3ee or 0xff94a3b8, label)

  -- Check if this column has no source assigned yet
  local cd = ctx._colData and ctx._colData[sourceCol]
  if not cd or not cd.source then
    imguiTextColored(0xff94a3b8, "No source — select one to assign")
    imguiSpacing()
  end

  -- Source picker button + nested popup (replaces flat dropdown)
  if imguiButton("Source: " .. colSourceLabel(ctx, sourceCol)) then
    imguiOpenPopup("##srcInspectorPicker")
  end
  imguiSameLine()
  imguiText("Stack " .. tostring(sourceCol))

  if imguiBeginPopup("##srcInspectorPicker") then
    local targetCol = sourceCol
    if imguiMenuItem("Webcam") then
      setSourceSpecForColumn(ctx, targetCol, { kind = "webcam", sourceIndex = 1 })
      imguiCloseCurrentPopup()
    end

    if imguiBeginMenu("Generators") then
      for i, g in ipairs(ctx.sources or {}) do
        if g.kind == "generator" then
          if imguiMenuItem(g.name or g.id) then
            local params = {}
            for _, pspec in ipairs(g.params or {}) do
              local pmin = tonumber(pspec.min) or 0
              local pmax = tonumber(pspec.max) or 1
              local defaultNorm = ((tonumber(pspec.default) or pmin) - pmin) / math.max(0.001, pmax - pmin)
              params[pspec.id] = clamp(defaultNorm, 0, 1)
            end
            setSourceSpecForColumn(ctx, targetCol, { kind = "generator", sourceIndex = i, sourceId = g.id, params = params })
            imguiCloseCurrentPopup()
          end
        end
      end
      imguiEndMenu()
    end

    if imguiBeginMenu("ML") then
      if imguiMenuItem("Segmented") then
        setSourceSpecForColumn(ctx, targetCol, defaultMLSourceSpec("segmented"))
        imguiCloseCurrentPopup()
      end
      if imguiMenuItem("Pose") then
        setSourceSpecForColumn(ctx, targetCol, defaultMLSourceSpec("pose"))
        imguiCloseCurrentPopup()
      end
      imguiEndMenu()
    end

    if imguiBeginMenu("From Column") then
      for colId, cd in pairs(ctx._colData or {}) do
        if cd and cd.source then
          -- Skip if it's the same column we're editing
          if targetCol ~= colId then
            local clabel = "Stack " .. tostring(colId) .. " (" .. colSourceLabel(ctx, colId) .. ")"
            if imguiMenuItem(clabel .. " / Raw (T0)") then
              setSourceSpecForColumn(ctx, targetCol, { kind = "columntap", sourceCol = colId, tapIndex = 0 })
              imguiCloseCurrentPopup()
            end
            for ti = 1, math.min(#cd.fx, 8) do
              if cd.fx[ti] and cd.fx[ti].enabled then
                local fxName = colFxLabel(ctx, colId, ti)
                if imguiMenuItem(clabel .. " / " .. fxName .. " (T" .. ti .. ")") then
                  setSourceSpecForColumn(ctx, targetCol, { kind = "columntap", sourceCol = colId, tapIndex = ti })
                  imguiCloseCurrentPopup()
                end
              end
            end
          end
        end
      end
      imguiEndMenu()
    end

    imguiEndPopup()
  end

  imguiSeparator()
  local avail = imguiGetContentRegionAvail()
  renderEmbeddedPanel(ctx, "sourceEmbed", layoutSourceEmbed, math.max(120, math.floor(tonumber(avail.y) or 120) - 18))
end

layoutCompoLayerControls = function(ctx, w, h)
  local embed = ctx.widgets.compoLayerEmbed
  if not embed then return end
  setBounds(embed, 0, 0, w, h)

  local selIdx = ctx.compositorSelection and ctx.compositorSelection.layerIndex
  local layer = selIdx and ctx.compositor and ctx.compositor.layers[selIdx]
  if not layer then
    for _, id in ipairs{"compoColumn","compoTap","compoBlend","compoOpacity","compoVisible"} do
      if ctx.widgets[id] then setVisible(ctx.widgets[id], false) end
    end
    return
  end

  local curCol = layer.sourceColumn or 1

  -- Column dropdown: setOptions when labels change, setSelected only when value changes
  ctx._compoColLabels = ctx._compoColLabels or {}
  local colLabels = {}
  if ctx._colData then
    for cid, _ in pairs(ctx._colData) do
      table.insert(colLabels, "Stack " .. cid .. " (" .. colSourceLabel(ctx, cid) .. ")")
    end
  end
  if #colLabels == 0 then table.insert(colLabels, "Stack 1") end
  if table.concat(ctx._compoColLabels) ~= table.concat(colLabels) then
    ctx._compoColLabels = colLabels
    ctx._compoColSelCache = nil
    setOptions(ctx.widgets.compoColumn, colLabels)
  end
  local curColIdx = 1
  for i, label in ipairs(colLabels) do
    if label:match("Stack " .. curCol) then curColIdx = i; break end
  end
  if ctx._compoColSelCache ~= curColIdx then
    ctx._compoColSelCache = curColIdx
    setSelectedSilently(ctx.widgets.compoColumn, curColIdx)
  end
  setBounds(ctx.widgets.compoColumn, 8, 25, 96, 18)
  ctx.widgets.compoColumn._onSelect = function(idx)
    local i = math.max(1, math.min(#colLabels, round(idx)))
    local cid = tonumber(colLabels[i]:match("Stack (%d+)")) or 1
    layer.sourceColumn = cid; ctx._compoThumbSigs = {}
  end
  setVisible(ctx.widgets.compoColumn, true)

  -- Tap dropdown: only setOptions when column changes, only setSelected when value changes
  ctx._compoLastTapCol = ctx._compoLastTapCol or {}
  local tapKey = "col" .. curCol
  local cd = ctx._colData and ctx._colData[curCol]
  local numFx = cd and #cd.fx or 8
  local tapLabels = { "Output", "Raw Source" }
  local tapVals = { nil, 0 }
  for ti = 1, numFx do
    table.insert(tapLabels, "FX " .. ti)
    table.insert(tapVals, ti)
  end
  if ctx._compoLastTapCol ~= tapKey then
    ctx._compoLastTapCol = tapKey
    ctx._compoTapLabels = tapLabels
    ctx._compoTapVals = tapVals
    ctx._compoTapSelCache = nil
    setOptions(ctx.widgets.compoTap, tapLabels)
  end
  local curTap = layer.tapIndex
  local curTapIdx = 1
  for i, v in ipairs(ctx._compoTapVals or tapVals) do if v == curTap then curTapIdx = i; break end end
  if ctx._compoTapSelCache ~= curTapIdx then
    ctx._compoTapSelCache = curTapIdx
    setSelectedSilently(ctx.widgets.compoTap, curTapIdx)
  end
  setBounds(ctx.widgets.compoTap, 110, 25, 80, 18)
  ctx.widgets.compoTap._onSelect = function(idx)
    local vi = math.max(1, math.min(#(ctx._compoTapVals or tapVals), round(idx)))
    layer.tapIndex = (ctx._compoTapVals or tapVals)[vi]; ctx._compoThumbSigs = {}
  end
  setVisible(ctx.widgets.compoTap, true)

  -- Blend mode dropdown: only setOptions once
  if not ctx._compoBlendInited then
    ctx._compoBlendInited = true
    ctx._compoBlendSelCache = nil
    setOptions(ctx.widgets.compoBlend, { "normal", "add", "screen", "multiply", "overlay", "difference" })
  end
  local blendModes = { "normal", "add", "screen", "multiply", "overlay", "difference" }
  local curMode = layer.blendMode or "normal"
  local curModeIdx = 1
  for i, bm in ipairs(blendModes) do if bm == curMode then curModeIdx = i; break end end
  if ctx._compoBlendSelCache ~= curModeIdx then
    ctx._compoBlendSelCache = curModeIdx
    setSelectedSilently(ctx.widgets.compoBlend, curModeIdx)
  end
  setBounds(ctx.widgets.compoBlend, 196, 25, 70, 18)
  ctx.widgets.compoBlend._onSelect = function(idx)
    layer.blendMode = blendModes[math.max(1, math.min(#blendModes, round(idx)))] or "normal"
  end
  setVisible(ctx.widgets.compoBlend, true)

  -- Opacity slider: only setValue when value changes
  local curOpacity = layer.opacity or 1.0
  if ctx._compoOpacityCache == nil or math.abs(ctx._compoOpacityCache - curOpacity) > 0.001 then
    ctx._compoOpacityCache = curOpacity
    setValueSilently(ctx.widgets.compoOpacity, curOpacity)
  end
  setBounds(ctx.widgets.compoOpacity, 8, 49, 100, 17)
  ctx.widgets.compoOpacity._onChange = function(v) layer.opacity = clamp(v, 0, 1) end
  setVisible(ctx.widgets.compoOpacity, true)

  -- Visibility toggle: only setValue when value changes
  local curVis = layer.visible == true
  if ctx._compoVisCache ~= curVis then
    ctx._compoVisCache = curVis
    setValueSilently(ctx.widgets.compoVisible, curVis)
  end
  setBounds(ctx.widgets.compoVisible, 114, 49, 50, 17)
  ctx.widgets.compoVisible._onChange = function(v)
    layer.visible = v == true; ctx._compoThumbSigs = {}
  end
  setVisible(ctx.widgets.compoVisible, true)
end

renderCompositorLayerControls = function(ctx)
  local selIdx = ctx.compositorSelection and ctx.compositorSelection.layerIndex
  if not selIdx then
    imguiTextColored(0xff94a3b8, "No layer selected")
    return
  end
  local layer = ctx.compositor and ctx.compositor.layers[selIdx]
  if not layer then
    imguiTextColored(0xff94a3b8, "No layer selected")
    return
  end
  imguiTextColored(0xfff97316, "Layer " .. selIdx)
  imguiSeparator()
  local avail = imguiGetContentRegionAvail()
  renderEmbeddedPanel(ctx, "compoLayerEmbed", layoutCompoLayerControls, 72)
end

local function renderEffectInspectorWindow(ctx)
  if ctx.selectedView == "compositor" then
    renderCompositorLayerControls(ctx)
    return
  end

  local sel = ctx.selection
  local effectSelected = sel and sel.row and sel.row > 1
  local label
  if sel and sel.col and sel.col > 1 and sel.row > 1 then
    local cd = ctx._colData and ctx._colData[sel.col]
    local fxName = cd and cd.fx[sel.row - 1] and colFxLabel(ctx, sel.col, sel.row - 1) or ""
    label = "Stack " .. tostring(sel.col) .. " FX" .. tostring(sel.row - 1) .. ": " .. fxName .. " (grid)"
  elseif effectSelected and sel and sel.col == 1 then
    label = "Effect (grid-selected)"
  else
    label = "Effect"
  end
  imguiTextColored(effectSelected and 0xff22d3ee or 0xff94a3b8, label)

  -- Check if the selected FX cell is empty
  local isEmptyFx = sel and sel.col and sel.row and sel.row > 1 and
    ctx.clips and ctx.clips[sel.col] and ctx.clips[sel.col][sel.row] and
    ctx.clips[sel.col][sel.row].emptyFx
  if isEmptyFx then
    imguiTextColored(0xff94a3b8, "Select an effect to assign")
    imguiSpacing()
  end

  imguiSeparator()
  local avail = imguiGetContentRegionAvail()
  renderEmbeddedPanel(ctx, "effectEmbed", layoutEffectEmbed, math.max(180, math.floor(tonumber(avail.y) or 180) - 18))
  imguiSpacing()
  imguiTextColored(0xff64748b, "Pins for selected effect/source will land here later.")
end

local function renderParamTransportWindow(ctx)
  imguiSeparatorText("Transport / MIDI")
  renderEmbeddedPanel(ctx, "transportEmbed", layoutTransportEmbed, 98)
  imguiSpacing()
  if round(readParam(NS .. "/mode", 0)) == 1 then
    imguiSeparatorText("Slice Mode")
    renderEmbeddedPanel(ctx, "sliceEmbed", layoutSliceEmbed, 104)
  else
    imguiSeparatorText("Poly Voice Areas")
    renderEmbeddedPanel(ctx, "polyEmbed", layoutPolyEmbed, 104)
  end
end

local function renderParamMappingWindow(ctx)
  imguiSeparatorText("Pose / Seg / Mapping")
  local avail = imguiGetContentRegionAvail()
  renderEmbeddedPanel(ctx, "mappingEmbed", layoutMappingEmbed, math.max(200, math.floor(tonumber(avail.y) or 200)))
end

local function renderParamFxWindow(ctx)
  imguiSeparatorText("FX Rack")
  local avail = imguiGetContentRegionAvail()
  renderEmbeddedPanel(ctx, "fxEmbed", layoutFxEmbed, math.max(220, math.floor(tonumber(avail.y) or 220)))
end

local function renderParametersPanel(ctx)
  local dockspaceId = imguiGetID("AVSD_params_ds")

  if not ctx._panelDocks or not ctx._panelDocks.params then
    ctx._panelDocks = ctx._panelDocks or {}
    local avail = imguiGetContentRegionAvail()
    local pw = math.max(1, math.floor(tonumber(avail.x) or 360))
    local ph = math.max(1, math.floor(tonumber(avail.y) or 300))

    imguiDockBuilderRemoveNode(dockspaceId)
    imguiDockBuilderAddNode(dockspaceId, imguiDockNodeFlags_DockSpace)
    imguiDockBuilderSetNodeSize(dockspaceId, pw, ph)

    -- One inspector column: Source + Effect share the top band, the rest stack
    -- below full-width. Splitting them into a separate side column was a dumb
    -- layout regression that made the lower sections too thin.
    local topBand, lowerStack = panelSplit{ node = dockspaceId, dir = imguiDir_Up, ratio = 0.24 }
    local sourceArea, effectArea = panelSplit{ node = topBand, dir = imguiDir_Right, ratio = 0.50 }
    local transportArea, lowerTail = panelSplit{ node = lowerStack, dir = imguiDir_Up, ratio = 0.22 }
    local mappingArea, fxArea = panelSplit{ node = lowerTail, dir = imguiDir_Up, ratio = 0.56 }

    imguiDockBuilderDockWindow("Source###AVSD_param_source", sourceArea)
    imguiDockBuilderDockWindow("Effect###AVSD_param_effect", effectArea)
    imguiDockBuilderDockWindow("Transport###AVSD_param_transport", transportArea)
    imguiDockBuilderDockWindow("Mapping###AVSD_param_mapping", mappingArea)
    imguiDockBuilderDockWindow("FX Rack###AVSD_param_fx", fxArea)

    imguiDockBuilderFinish(dockspaceId)
    ctx._panelDocks.params = true
  end

  imguiDockSpace(dockspaceId, 0, 0, imguiDockNodeFlags_None)

  if imguiBegin("Source###AVSD_param_source", imguiWindowFlags_NoTitleBar) then
    renderSourceInspectorWindow(ctx)
  end
  imguiEnd()

  if imguiBegin("Effect###AVSD_param_effect", imguiWindowFlags_NoTitleBar) then
    renderEffectInspectorWindow(ctx)
  end
  imguiEnd()

  if imguiBegin("Transport###AVSD_param_transport", imguiWindowFlags_NoTitleBar) then
    renderParamTransportWindow(ctx)
  end
  imguiEnd()

  if imguiBegin("Mapping###AVSD_param_mapping", imguiWindowFlags_NoTitleBar) then
    renderParamMappingWindow(ctx)
  end
  imguiEnd()

  if imguiBegin("FX Rack###AVSD_param_fx", imguiWindowFlags_NoTitleBar) then
    renderParamFxWindow(ctx)
  end
  imguiEnd()
end

local function renderGridToolbar(ctx, parentW)
  local toolbarH = 24
  imguiBeginChild("##gridToolbar", parentW, toolbarH, false, 0)

  -- Alignment switcher
  local alignments = {
    { "^BU", "bottom-up", "Bottom-Up" },
    { ">LR", "left-to-right", "Left-to-Right" },
    { "vTD", "top-down", "Top-Down" },
  }
  for _, a in ipairs(alignments) do
    local isActive = ctx.gridAlignment == a[2]
    if isActive then
      imguiTextColored(0xff22d3ee, a[1])
    else
      if imguiButton(a[1]) then ctx.gridAlignment = a[2] end
    end
    imguiSameLine()
  end

  -- Add Column button + popup
  if imguiButton("+Stack") then
    imguiOpenPopup("##srcPicker")
  end
  imguiSameLine()

  if imguiBeginPopup("##srcPicker") then
    if imguiMenuItem("Webcam") then
      AVSD.State.addColumn(ctx, { kind = "webcam" })
      imguiCloseCurrentPopup()
    end

    if imguiBeginMenu("Generators") then
      for _, g in ipairs(ctx.sources or {}) do
        if g.kind == "generator" then
          if imguiMenuItem(g.name or g.id) then
            -- Initialize generator params from defaults
            local params = {}
            for _, pspec in ipairs(g.params or {}) do
              local defaultNorm = (tonumber(pspec.default) or 0 - tonumber(pspec.min or 0)) / math.max(0.001, tonumber(pspec.max or 1) - tonumber(pspec.min or 0))
              params[pspec.id] = clamp(defaultNorm, 0, 1)
            end
            AVSD.State.addColumn(ctx, { kind = "generator", sourceId = g.id, params = params })
            imguiCloseCurrentPopup()
          end
        end
      end
      imguiEndMenu()
    end

    -- ML sources
    if imguiBeginMenu("ML") then
      if imguiMenuItem("Segmented") then
        AVSD.State.addColumn(ctx, { kind = "ml", mlType = "segmented" })
        imguiCloseCurrentPopup()
      end
      if imguiMenuItem("Pose") then
        AVSD.State.addColumn(ctx, { kind = "ml", mlType = "pose" })
        imguiCloseCurrentPopup()
      end
      imguiEndMenu()
    end

    -- Column tap sources: reuse another column's output
    local hasTappable = false
    for colId, cd in pairs(ctx._colData or {}) do
      if cd and cd.source then
        hasTappable = true
        break
      end
    end
    if hasTappable and imguiBeginMenu("From Column") then
      for colId, cd in pairs(ctx._colData or {}) do
        if cd and cd.source then
          local label = "Stack " .. tostring(colId) .. " (" .. colSourceLabel(ctx, colId) .. ")"
          -- Tap 0 (raw)
          if imguiMenuItem(label .. " / Raw (T0)") then
            AVSD.State.addColumn(ctx, { kind = "columntap", sourceCol = colId, tapIndex = 0 })
            imguiCloseCurrentPopup()
          end
          -- Taps 1..N
          for ti = 1, math.min(#cd.fx, 8) do
            if cd.fx[ti] and cd.fx[ti].enabled then
              local fxName = colFxLabel(ctx, colId, ti)
              if imguiMenuItem(label .. " / " .. fxName .. " (T" .. ti .. ")") then
                AVSD.State.addColumn(ctx, { kind = "columntap", sourceCol = colId, tapIndex = ti })
                imguiCloseCurrentPopup()
              end
            end
          end
        end
      end
      imguiEndMenu()
    end

    imguiEndPopup()
  end

  -- Delete source-selected column
  local sourceCol = tonumber(ctx.sourceSelectionCol) or 1
  local sel = ctx.selection
  if sourceCol > 1 then
    if imguiButton("Del") then
      AVSD.State.removeColumn(ctx, sourceCol)
    end
    imguiSameLine()
  end

  -- Add FX button + popup (when an FX/add cell is selected)
  if sel and sel.col then
    local cd = ctx._colData and ctx._colData[sel.col]
    local clip = ctx.clips and ctx.clips[sel.col] and ctx.clips[sel.col][sel.row]
    if cd and cd.source and clip then
      local isAddCell = clip.emptyFx == true
      local isFxCell = clip.kind == "fx"
      if isAddCell or isFxCell then
        if imguiButton("+FX") then
          imguiOpenPopup("##fxPicker")
        end
        imguiSameLine()

        if imguiBeginPopup("##fxPicker") then
          for i, eff in ipairs(ctx.effects or {}) do
            if imguiMenuItem(eff.name or eff.id or ("Effect " .. i)) then
              AVSD.State.colAddFx(ctx, sel.col, i, { NS = NS, writeParam = writeParam, updateShader = updateShader })
              imguiCloseCurrentPopup()
            end
          end
          imguiEndPopup()
        end

        if isFxCell and sel.row > 1 then
          if imguiButton("RmFX") then
            AVSD.State.colRemoveFx(ctx, sel.col, sel.row, { NS = NS, writeParam = writeParam, updateShader = updateShader })
          end
          imguiSameLine()
        end
      end
    end
  end

  imguiText("")
  imguiSameLine()  -- push column count to far right

  local colCount = 0
  if ctx._colData then
    for k, _ in pairs(ctx._colData) do colCount = colCount + 1 end
  end
  imguiText("  " .. tostring(colCount) .. " cols")
  imguiEndChild()
  return toolbarH
end

local function renderDeckPanel(ctx)
  local av = imguiGetContentRegionAvail()
  if av.x < 4 or av.y < 4 then return end
  local pw = math.floor(av.x)
  local ph = math.floor(av.y)

  local toolbarH = renderGridToolbar(ctx, pw)
  local gridH = math.max(1, ph - toolbarH)

  setBounds(ctx.widgets.deckEmbed, 0, 0, pw, gridH)
  layoutClipGrid(ctx, pw, gridH)
  imguiRetainedPanel(ctx.widgets.deckEmbed.node, pw, gridH, true)
end

ensureCompositorCells = function(ctx, parentNode)
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
  -- Hide cells beyond layer count
  for key, cell in pairs(ctx._compoCells) do
    if cell.index > numLayers then
      cell.node:setBounds(0, 0, 0, 0)
    end
  end
  return numLayers
end

compositorLayerCellPipeline = function(ctx, layer)
  if not layer or not layer.visible then return nil end
  local col = layer.sourceColumn or 1
  local cd = ctx._colData and ctx._colData[col]
  if not cd or not cd.source then return nil end
  local tapIndex = layer.tapIndex
  if tapIndex == nil then
    return colBuildCellPipeline(ctx, col, 10)  -- output tap = all FX
  elseif tapIndex == 0 then
    local descriptor, _ = colSourceDescriptor(ctx, col)
    if not descriptor then return nil end
    local ok, payload = pcall(shaders.buildPipeline, {}, "contain", descriptor)
    if ok then return payload end
    return nil
  else
    return colBuildCellPipeline(ctx, col, tapIndex + 1)
  end
end

updateCompositorThumbnails = function(ctx)
  profileStart(ctx, "updateCompositorThumbnails")
  if not ctx._compoCells then profileEnd(ctx, "updateCompositorThumbnails"); return end
  ctx._compoThumbSigs = ctx._compoThumbSigs or {}

  local graph = buildCompositorGraph(ctx)
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
          local payload = buildNodePassthroughPayload(accKey)
          if payload then
            cell.thumb:setCustomSurface("gpu_shader", payload)
          else
            clearNodeSurface(cell.thumb)
          end
        else
          clearNodeSurface(cell.thumb)
        end
      end
    end
  end
  profileEnd(ctx, "updateCompositorThumbnails")
end

updateCompositorOutput = function(ctx)
  profileStart(ctx, "updateCompositorOutput")
  local outNode = ctx.widgets and ((ctx.widgets.outputSurface and ctx.widgets.outputSurface.node) or (ctx.widgets.outputViewport and ctx.widgets.outputViewport.node))
  if not outNode then profileEnd(ctx, "updateCompositorOutput"); return end

  local graph = buildCompositorGraph(ctx)
  local finalKey = graph and graph.finalKey or nil
  if not finalKey then profileEnd(ctx, "updateCompositorOutput"); return end

  local payload = buildNodePassthroughPayload(finalKey)
  if payload then
    outNode:setCustomSurface("gpu_shader", payload)
    if ctx.widgets and ctx.widgets.outputViewport and ctx.widgets.outputViewport.node and outNode ~= ctx.widgets.outputViewport.node then
      clearNodeSurface(ctx.widgets.outputViewport.node)
    end
  else
    clearNodeSurface(outNode)
  end
  profileEnd(ctx, "updateCompositorOutput")
end

renderCompositorPanel = function(ctx)
  local av = imguiGetContentRegionAvail()
  if av.x < 4 or av.y < 4 then return end
  local pw = math.floor(av.x)
  local ph = math.floor(av.y)

  -- Create the compositor embed node on first render
  -- Use embedHost (hidden container) as parent so it's not double-rendered by root
  if not ctx._compositorEmbed then
    local parent = ctx.widgets and ctx.widgets.embedHost and ctx.widgets.embedHost.node
    if not parent then parent = ctx.root and ctx.root.node end
    if parent and parent.addChild then
      ctx._compositorEmbed = parent:addChild("__compositor_embed")
    end
  end

  local compo = ctx.compositor
  local pad, gap = 8, 4

  -- Toolbar
  local toolbarH = 22
  local curAlign = compo.orientation or "bottom-up"
  local alignments = { "bottom-up", "left-to-right", "top-down" }
  local alignLabels = { "^BU", ">LR", "vTD" }
  for ai, a in ipairs(alignments) do
    if a == curAlign then
      imguiText(" " .. alignLabels[ai] .. " ")
    elseif imguiButton(alignLabels[ai] .. "##compAlign" .. ai) then
      compo.orientation = a
    end
    if ai < #alignments then imguiSameLine() end
  end
  imguiSameLine()

  if imguiButton("+Layer") then
    local idx = #compo.layers + 1
    compo.layers[idx] = {
      sourceColumn = 1, tapIndex = nil,
      blendMode = "normal", opacity = 1.0, visible = true,
      name = "Layer " .. idx,
    }
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

  -- Layer cells
  local cellsH = math.max(1, ph - toolbarH - 8)
  local numLayers = ensureCompositorCells(ctx, ctx._compositorEmbed)
  if numLayers < 1 then return end

  local cellW, cellH
  if compo.orientation == "left-to-right" then
    cellH = math.max(28, cellsH)
    cellW = math.max(50, math.floor((pw - pad * 2 - gap * (numLayers - 1)) / numLayers))
  else
    cellW = math.max(60, pw - pad * 2)
    cellH = math.max(28, math.floor((cellsH - gap * (numLayers - 1)) / numLayers))
  end

  setBounds(ctx._compositorEmbed, pad, toolbarH, pw - pad * 2, cellsH)

  for i = 1, numLayers do
    local key = "compo_" .. i
    local cell = ctx._compoCells[key]
    if not cell then break end

    local cx, cy
    if compo.orientation == "bottom-up" then
      local displayIdx = numLayers - i + 1
      cx = 0; cy = (displayIdx - 1) * (cellH + gap)
    elseif compo.orientation == "left-to-right" then
      cx = (i - 1) * (cellW + gap); cy = 0
    else -- top-down
      cx = 0; cy = (i - 1) * (cellH + gap)
    end

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
      local cw, ch = canonicalAspectSize(ctx)
      local ix, iy, iw, ih = fitBox(math.max(1, cellW - 4), thumbH, cw, ch)
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

  updateCompositorThumbnails(ctx)
  imguiRetainedPanel(ctx._compositorEmbed, pw - pad * 2, cellsH, true)
end

local function renderPanel(ctx, win)
  if imguiBegin(windowName(ctx, win), imguiWindowFlags_NoCollapse) then
    if win.key == "sources" then
      renderSourcesPanel(ctx)
    elseif win.key == "params" then
      renderParametersPanel(ctx)
    elseif win.key == "stage" then
      renderStagePanel(ctx)
    elseif win.key == "deck" then
      renderDeckPanel(ctx)
    elseif win.key == "compositor" then
      renderCompositorPanel(ctx)
    elseif win.key == "waveform" then
      renderWaveformPanel(ctx)
    end
  end
  imguiEnd()
end

local function renderFrame(ctx)
  local x, y, w, h = projectContentBounds(ctx)
  if w < 64 or h < 64 then return end

  local toolbarH = TOOLBAR_H
  local hostFlags = bor(
    imguiWindowFlags_NoTitleBar,
    imguiWindowFlags_NoResize,
    imguiWindowFlags_NoMove,
    imguiWindowFlags_NoCollapse,
    imguiWindowFlags_NoSavedSettings,
    imguiWindowFlags_NoScrollbar
  )

  imguiSetNextWindowPos(x, y + toolbarH, imguiCond_Always)
  imguiSetNextWindowSize(w, math.max(1, h - toolbarH), imguiCond_Always)

  local hostName = "AVSampler Dockspace Host###AVSD_host_" .. tostring(ctx._dockSuffix or "0")
  local dockspaceId = imguiGetID("AVSamplerProjectDockspace_" .. tostring(ctx._dockSuffix or "0"))

  if imguiBegin(hostName, hostFlags) then
    imguiDockSpace(dockspaceId, 0, 0, imguiDockNodeFlags_None)
    if (ctx._rebuildDockTree or not ctx._dockTreeBuilt) and w > 200 and h > 160 then
      local preset = tostring(ctx._layoutPreset or "deck")
      imguiDockBuilderRemoveNode(dockspaceId)
      imguiDockBuilderAddNode(dockspaceId, imguiDockNodeFlags_DockSpace)
      imguiDockBuilderSetNodeSize(dockspaceId, w, math.max(1, h - toolbarH))
      if preset == "stage" then
        buildStageLayout(ctx, dockspaceId)
      elseif preset == "inspector" then
        buildInspectorLayout(ctx, dockspaceId)
      else
        buildDeckLayout(ctx, dockspaceId)
      end
      imguiDockBuilderFinish(dockspaceId)
      if imguiDockBuilderSetNodeFlags then imguiDockBuilderSetNodeFlags(dockspaceId, imguiDockNodeFlags_HiddenTabBar) end
      ctx._dockTreeBuilt = true
      ctx._rebuildDockTree = false
    end
  end
  imguiEnd()

  for _, win in ipairs(DOCK_WINDOWS) do renderPanel(ctx, win) end
  -- Embedded retained panels already render their own dropdown overlays once the
  -- dropdown is rooted at that panel. Doing an extra detached pass here just
  -- duplicates popovers and creates bogus hit targets.
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
  loadModels(ctx)
  __avsdProfileInit(ctx)
  bindInputSurfaces(ctx)
  ensurePoseOverlay(ctx)
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
  ctx.widgets.loadModels._onClick = function() loadModels(ctx) end
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

  ctx.widgets.segGain._onChange = function(v) ctx.seg.gain = clamp(v, 0.25, 4); writeParam(NS .. "/seg/gain", ctx.seg.gain); bindInputSurfaces(ctx) end
  ctx.widgets.segThreshold._onChange = function(v) ctx.seg.threshold = clamp(v, 0, 1); writeParam(NS .. "/seg/threshold", ctx.seg.threshold); bindInputSurfaces(ctx) end
  ctx.widgets.segFeather._onChange = function(v) ctx.seg.feather = clamp(v, 0, 1); writeParam(NS .. "/seg/feather", ctx.seg.feather); bindInputSurfaces(ctx) end
  ctx.widgets.segInvert._onChange = function(v) ctx.seg.invert = v == true; writeParam(NS .. "/seg/invert", ctx.seg.invert and 1 or 0); bindInputSurfaces(ctx) end
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
        sourceLabel = (POSE_SOURCES[mapping.source or 1] or {}).label,
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
      bindInputSurfaces(ctx)
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
  ensurePoseOverlay(ctx)
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

  AVSD.Midi.poll(ctx, { profileStart = profileStart, profileEnd = profileEnd })

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

  local poseUpdated = runPose(ctx, frame)
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
