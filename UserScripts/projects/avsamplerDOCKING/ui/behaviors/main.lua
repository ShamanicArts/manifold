local M = {}

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
local function rackFxBasePath(slot) return "/midi/synth/rack/fx/" .. math.max(1, round(slot or 1)) end
local function rackFxTypePath(slot) return rackFxBasePath(slot) .. "/type" end
local function rackFxMixPath(slot) return rackFxBasePath(slot) .. "/mix" end
local function rackFxParamPath(slot, paramIndex) return rackFxBasePath(slot) .. "/p/" .. math.max(0, round(paramIndex or 0)) end
local function pathForSlice(i) return NS .. "/slice/" .. i .. "/start" end
local function triggerPathForSlice(i) return NS .. "/slice/" .. i .. "/trigger" end
local function velocityPathForSlice(i) return NS .. "/slice/" .. i .. "/velocity" end

local function buildMappingTargets()
  local targets = {
    { label = "Shader L1 P1", path = NS .. "/shader/layer/1/param/1", min = 0, max = 1, epsilon = 0.002 },
    { label = "FX1 Mix", path = rackFxMixPath(1), min = 0, max = 1, epsilon = 0.002 },
    { label = "Sampler Speed", path = NS .. "/speed", min = -2, max = 4, epsilon = 0.01 },
    { label = "Slice Select", path = NS .. "/selected_slice", min = 1, max = MAX, integer = true, epsilon = 0.0 },
  }

  for p = 2, 9 do
    targets[#targets + 1] = { label = "Shader L1 P" .. p, path = NS .. "/shader/layer/1/param/" .. p, min = 0, max = 1, epsilon = 0.002 }
  end
  for layer = 2, 8 do
    for p = 1, 9 do
      targets[#targets + 1] = { label = "Shader L" .. layer .. " P" .. p, path = NS .. "/shader/layer/" .. layer .. "/param/" .. p, min = 0, max = 1, epsilon = 0.002 }
    end
  end
  for p = 1, 5 do
    targets[#targets + 1] = { label = "FX1 Param " .. p, path = rackFxParamPath(1, p - 1), min = 0, max = 1, epsilon = 0.002 }
  end

  targets[#targets + 1] = { label = "Output", path = NS .. "/output", min = 0, max = 2, epsilon = 0.01 }
  targets[#targets + 1] = { label = "Root Note", path = NS .. "/root_note", min = 0, max = 127, integer = true, epsilon = 0.0 }
  targets[#targets + 1] = { label = "Voice Count", path = NS .. "/voice_count", min = 1, max = MAX, integer = true, epsilon = 0.0 }
  targets[#targets + 1] = { label = "Pitch Tracking", path = NS .. "/pitch_tracking", min = 0, max = 1, boolean = true, epsilon = 0.0 }
  targets[#targets + 1] = { label = "Play Start", path = NS .. "/play_start", min = 0, max = 1, epsilon = 0.002 }
  targets[#targets + 1] = { label = "Loop Start", path = NS .. "/loop_start", min = 0, max = 1, epsilon = 0.002 }
  targets[#targets + 1] = { label = "Loop End", path = NS .. "/loop_end", min = 0, max = 1, epsilon = 0.002 }
  targets[#targets + 1] = { label = "Crossfade", path = NS .. "/crossfade", min = 0, max = 0.5, epsilon = 0.001 }
  targets[#targets + 1] = { label = "Seg Gain", path = NS .. "/seg/gain", min = 0.25, max = 4, epsilon = 0.01 }
  targets[#targets + 1] = { label = "Seg Threshold", path = NS .. "/seg/threshold", min = 0, max = 1, epsilon = 0.002 }
  targets[#targets + 1] = { label = "Seg Feather", path = NS .. "/seg/feather", min = 0, max = 1, epsilon = 0.002 }
  targets[#targets + 1] = { label = "Seg Invert", path = NS .. "/seg/invert", min = 0, max = 1, boolean = true, epsilon = 0.0 }
  targets[#targets + 1] = { label = "Pose Confidence", path = NS .. "/pose/confidence", min = 0, max = 1, epsilon = 0.002 }
  return targets
end

local MAPPING_TARGETS = buildMappingTargets()
local MAPPING_TARGET_LABELS = {}
for i = 1, #MAPPING_TARGETS do MAPPING_TARGET_LABELS[i] = MAPPING_TARGETS[i].label end

local function mappingTargetSpec(index)
  local idx = math.max(1, math.min(#MAPPING_TARGETS, round(index or 1)))
  return MAPPING_TARGETS[idx], idx
end

local function defaultMapping(track)
  return {
    enabled = track <= 2,
    source = track == 1 and 29 or (track == 2 and 32 or 1),
    target = track == 1 and 1 or (track == 2 and 2 or 1),
    min = 0.0,
    max = 1.0,
    invert = false,
  }
end

local refreshWaveform
local updatePreviewSurface
local updateGridThumbnails
local resetPanelDocks
local syncShaderSourceParams
local layoutOutputRow

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
  local selected = 1
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
  setOptions(ctx.widgets.deviceSelect, labels)
  setSelectedSilently(ctx.widgets.deviceSelect, 1)
end

local function currentMidiLabel()
  if Midi and Midi.currentInputDeviceName then
    local n = Midi.currentInputDeviceName()
    if type(n) == "string" and n ~= "" then return n end
  end
  return nil
end

local function refreshMidi(ctx)
  local devices = (Midi and Midi.inputDevices and Midi.inputDevices()) or {}
  ctx._midiDevices = devices
  local opts = { "None (Disabled)" }
  for i = 1, #devices do opts[#opts + 1] = tostring(devices[i]) end
  setOptions(ctx.widgets.midiInput, opts)
  local active = currentMidiLabel()
  local selected = 1
  if active then
    for i = 1, #opts do
      if opts[i] == active then selected = i end
    end
  end
  setSelectedSilently(ctx.widgets.midiInput, selected)
  setText(ctx.widgets.midiStatus, string.format("MIDI: %s (%s)", active or "none", (Midi and Midi.isInputOpen and Midi.isInputOpen()) and "open" or "closed"))
end

local function openPreferredMidi(ctx)
  if not (Midi and Midi.openInput) then return end
  for i = 1, #(ctx._midiDevices or {}) do
    if not tostring(ctx._midiDevices[i]):lower():find("through", 1, true) then
      Midi.openInput(i - 1)
      refreshMidi(ctx)
      return
    end
  end
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
  if ctx.widgets.liveViewport and ctx.widgets.liveViewport.node then
    ctx.widgets.liveViewport.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "live" })
  end
  if ctx.widgets.segViewport and ctx.widgets.segViewport.node and ctx._segModelPath then
    ctx.widgets.segViewport.node:setCustomSurface("ml_composite", segPayload(ctx))
  end
  if ctx.widgets.poseViewport and ctx.widgets.poseViewport.node and ctx._segModelPath then
    ctx.widgets.poseViewport.node:setCustomSurface("ml_composite", segPayload(ctx))
  end
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

local function openWebcam(ctx)
  local idx = selectedDeviceIndex(ctx)
  local ok = false
  if capture and capture.open then ok = capture.open(idx, 640, 480, 30) end
  setText(ctx.widgets.webcamStatus, ok and ("Webcam: open device " .. idx .. " @640x480") or "Webcam: open failed")
  bindInputSurfaces(ctx)
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
  local okVideo = ctx.videoCap:copyRecentToSampler(ctx.video, samplesBack)
  ctx.video:seek(0)
  applyVideoWindow(ctx)
  ctx._lastCapturedSeconds = seconds
  ctx._lastVideoCommitOk = okVideo == true
  refreshWaveform(ctx)
  updatePreviewSurface(ctx)
  if secondsOverride ~= nil then
    writeParam(NS .. "/capture_seconds", previousCaptureSeconds)
    ctx._lastCaptureSecondsApplied = nil
  end
end

local function encodedMidi(ctx, note, velocity)
  ctx._midiCounter = ((ctx._midiCounter or 0) + 1) % 512
  return ctx._midiCounter * 16384 + round(clamp(note, 0, 127)) * 128 + round(clamp(velocity, 0, 127))
end

local function noteToSlice(note, root)
  for i = 1, #MAJOR_OFFSETS do
    if round(note) == round(root) + MAJOR_OFFSETS[i] then return i end
  end
  return nil
end

local function triggerNote(ctx, note, velocity)
  writeParam(NS .. "/midi_note", note)
  writeParam(NS .. "/midi_velocity", velocity)
  writeParam(NS .. "/midi_note_on_trigger", encodedMidi(ctx, note, velocity))
  ctx._lastMidi = string.format("NOTE ON %d vel %d", note, velocity)
end

local function releaseNote(ctx, note)
  writeParam(NS .. "/midi_note", note)
  writeParam(NS .. "/midi_note_off_trigger", encodedMidi(ctx, note, 0))
  ctx._lastMidi = string.format("NOTE OFF %d", note)
end

local function pollMidi(ctx)
  if not (Midi and Midi.pollInputEvent) then return end
  local consumed = 0
  while consumed < 64 do
    local e = Midi.pollInputEvent()
    if not e then break end
    consumed = consumed + 1
    local t = tonumber(e.type or 0) or 0
    local d1 = tonumber(e.data1 or 0) or 0
    local d2 = tonumber(e.data2 or 0) or 0
    if Midi.NOTE_ON and t == Midi.NOTE_ON and d2 > 0 then
      triggerNote(ctx, d1, d2)
    elseif (Midi.NOTE_OFF and t == Midi.NOTE_OFF) or (Midi.NOTE_ON and t == Midi.NOTE_ON and d2 <= 0) then
      releaseNote(ctx, d1)
    elseif Midi.CONTROL_CHANGE and t == Midi.CONTROL_CHANGE and d1 == 123 then
      bump(NS .. "/stop_trigger")
    end
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
  if not (ctx._posePipeline and capture and capture.isOpen and capture.isOpen()) then return false end
  if not shouldRunInterval(ctx, "pose", POSE_INTERVAL) then return false end
  local seq = tonumber(frameInfo and frameInfo.sequence)
  if seq ~= nil and ctx._lastPoseFrameSeq == seq then return false end
  local ok, result = pcall(ml.infer, ctx._posePipeline)
  if not ok or not result or type(result.data) ~= "table" or #result.data < 51 then return false end
  if seq ~= nil then ctx._lastPoseFrameSeq = seq end
  local inputW, inputH = ctx._posePipeline:inputWidth(), ctx._posePipeline:inputHeight()
  local kps = {}
  for i = 0, 16 do
    local y, x, c = tonumber(result.data[i * 3 + 1]) or 0, tonumber(result.data[i * 3 + 2]) or 0, tonumber(result.data[i * 3 + 3]) or 0
    if x > 1.5 then x = x / inputW end
    if y > 1.5 then y = y / inputH end
    kps[i + 1] = { x = clamp(x, 0, 1), y = clamp(y, 0, 1), conf = c }
  end

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
    local frame = frameInfo or (capture.getFrameInfo and capture.getFrameInfo()) or {}
    ctx._poseOverlay:setDisplayList(buildPoseDisplay(kps, ctx.poseConf, ctx.showSkeleton, ctx._poseOverlay:getWidth(), ctx._poseOverlay:getHeight(), frame.width or 640, frame.height or 480))
  end
  local visible = 0
  for _, kp in ipairs(kps) do if kp.conf > ctx.poseConf then visible = visible + 1 end end
  setText(ctx.widgets.poseStatus, string.format("Pose: %d/17 visible | nose %.2f %.2f | wrists spread %.2f", visible, nose and nose.x or 0, nose and nose.y or 0, spread))
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
  local target, targetIndex = mappingTargetSpec(mapping.target or 1)
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
  local active, firstSummary = 0, nil
  for t = 1, MAX_MAPPINGS do
    if ctx.mappings[t] and ctx.mappings[t].enabled then
      active = active + 1
      local summary = applyMappingTrack(ctx, t)
      if firstSummary == nil and summary ~= nil then firstSummary = summary end
    end
  end
  if active <= 0 then setText(ctx.widgets.mappingStatus, "Mapping: disabled"); return end
  if firstSummary then
    setText(ctx.widgets.mappingStatus, string.format("Mapping: %d active | T%d %s %.2f → %.3f", active, firstSummary.track, firstSummary.targetLabel, firstSummary.sourceValue, firstSummary.value))
  else
    setText(ctx.widgets.mappingStatus, string.format("Mapping: %d active", active))
  end
end

local function ensureShaderSourceNode(ctx)
  if ctx._shaderSourceNode and ctx._shaderSourceNode.node then return ctx._shaderSourceNode end
  local rootNode = ctx.root and ctx.root.node
  if not (rootNode and rootNode.createChild) then return nil end
  local node = rootNode:createChild("avsd_shader_source")
  if not node then return nil end
  local entry = { id = "__avsd_shader_source", node = node }
  if node.setNodeId then node:setNodeId(entry.id) end
  if node.setBounds then node:setBounds(0, 0, 64, 64) end
  if node.setVisible then node:setVisible(false) end
  ctx._shaderSourceNode = entry
  return entry
end

local function buildShaderSourceDescriptor(ctx)
  local choice = ctx.sources and ctx.sources[ctx.shader.sourceIndex]
  local entry = ensureShaderSourceNode(ctx)
  if entry and entry.node then
    if choice and choice.kind == "generator" and shaders and shaders.buildPipeline then
      local sourceParams = {}
      local specParams = choice.params or {}
      for pi = 1, #specParams do
        local pspec = specParams[pi]
        local normalized = ctx.shaderSourceParams and ctx.shaderSourceParams[pspec.id] or tonumber(pspec.default) or 0
        local pmin = tonumber(pspec.min) or 0
        local pmax = tonumber(pspec.max) or 1
        sourceParams[pspec.id] = pmin + normalized * (pmax - pmin)
      end
      local ok, payload = pcall(shaders.buildPipeline, {}, "cover", { type = "generator", sourceId = choice.id, params = sourceParams })
      if ok and payload then
        entry.node:setCustomSurface("gpu_shader", payload)
        return { type = "node", sourceId = entry.id }, choice
      end
    else
      entry.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "live" })
      return { type = "node", sourceId = entry.id }, choice
    end
  end

  local source = { type = "webcam" }
  if choice and choice.kind == "generator" then
    local sourceParams = {}
    local specParams = choice.params or {}
    for pi = 1, #specParams do
      local pspec = specParams[pi]
      local normalized = ctx.shaderSourceParams and ctx.shaderSourceParams[pspec.id] or tonumber(pspec.default) or 0
      local pmin = tonumber(pspec.min) or 0
      local pmax = tonumber(pspec.max) or 1
      sourceParams[pspec.id] = pmin + normalized * (pmax - pmin)
    end
    source = { type = "generator", sourceId = choice.id, params = sourceParams }
  end
  return source, choice
end

function updateShader(ctx)
  if not (ctx.widgets.outputViewport and ctx.widgets.outputViewport.node) then return end
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
    local ok, payload = pcall(shaders.buildPipeline, layers, "cover", source)
    if ok and payload then
      -- Build a signature to detect actual payload changes
      local sig = tostring(ctx.shader.sourceIndex) .. "|" .. tostring(#layers)
      for _, l in ipairs(layers) do
        sig = sig .. "|" .. tostring(l.effectId)
        for k, v in pairs(l.params or {}) do
          sig = sig .. "|" .. tostring(k) .. "=" .. tostring(math.floor((tonumber(v) or 0) * 10000 + 0.5))
        end
      end
      if sig ~= ctx._lastShaderSig then
        ctx.widgets.outputViewport.node:setCustomSurface("gpu_shader", payload)
        ctx._lastShaderSig = sig
        updateGridThumbnails(ctx)
      end
    end
  end
  setText(ctx.widgets.shaderStatus, string.format("Shader: %s %s", choice and choice.name or "Webcam", ctx.effects[(ctx.shader.layers[ctx.shader.activeLayer] or {}).effectIndex or 1] and ctx.effects[(ctx.shader.layers[ctx.shader.activeLayer] or {}).effectIndex or 1].name or "--"))
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
    setOptions(ctx.widgets["mapping" .. track .. "Target"], MAPPING_TARGET_LABELS)
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
  local L = ctx.shader.layers[ctx.shader.activeLayer]
  setSelectedSilently(ctx.widgets.shaderLayer, ctx.shader.activeLayer)
  setSelectedSilently(ctx.widgets.effectSelect, L.effectIndex or 1)
  if ctx.widgets.shaderEnabled and ctx.widgets.shaderEnabled.setValue then setValueSilently(ctx.widgets.shaderEnabled, L.enabled) end
  local effect = ctx.effects[L.effectIndex] or { params = {} }
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
      -- L.params[p] stores [0,1] normalized; convert to display range
      local normalized = L.params[p] or tonumber(spec.default) or 0
      local displayVal = clamp(pmin + normalized * (pmax - pmin), pmin, pmax)
      setValueSilently(sl, displayVal)
    else
      setVisible(sl, false)
    end
  end
end

local function samplePosition(path, fallback)
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
  local w, h = 608, 342
  if host and host.node then
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
      local x = (slot - 1) * cellW
      setBounds(ctx.widgets["cell" .. slot], x, y, cellW, cellH)
      setBounds(ctx.widgets["cellLabel" .. slot], x + 8, y + 8, math.max(1, cellW - 16), 18)
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
  if sourceIndex ~= ctx.shader.sourceIndex then ctx.shader.sourceIndex = sourceIndex; setSelectedSilently(ctx.widgets.sourceSelect, sourceIndex); changedShader = true; syncShaderSourceParams(ctx) end
  local activeLayer = math.max(1, math.min(8, round(readParam(NS .. "/shader/active_layer", ctx.shader.activeLayer))))
  if activeLayer ~= ctx.shader.activeLayer then ctx.shader.activeLayer = activeLayer; syncShaderEditor(ctx) end
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
    local m = ctx.mappings[t] or defaultMapping(t)
    ctx.mappings[t] = m
    m.enabled = readParam(NS .. "/mapping/" .. t .. "/enabled", m.enabled and 1 or 0) > 0.5
    m.source = math.max(1, math.min(#POSE_SOURCES, round(readParam(NS .. "/mapping/" .. t .. "/source", m.source or 1))))
    m.target = math.max(1, math.min(#MAPPING_TARGETS, round(readParam(NS .. "/mapping/" .. t .. "/target", m.target or 1))))
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

  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[1]), deck)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[2]), stage)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[3]), sources)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[4]), wave)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[5]), params)
end

local function buildStageLayout(ctx, dockId)
  local rightCol, leftCol = split{ node = dockId, dir = imguiDir_Right, ratio = 0.38 }
  local sources, params = split{ node = rightCol, dir = imguiDir_Down, ratio = 0.44 }
  local bottom, stage = split{ node = leftCol, dir = imguiDir_Down, ratio = 0.32 }
  local wave, deck = split{ node = bottom, dir = imguiDir_Down, ratio = 0.50 }

  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[1]), deck)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[2]), stage)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[3]), sources)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[4]), wave)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[5]), params)
end

local function buildInspectorLayout(ctx, dockId)
  local params, leftCol = split{ node = dockId, dir = imguiDir_Right, ratio = 0.38 }
  local sources, topLeft = split{ node = leftCol, dir = imguiDir_Down, ratio = 0.30 }
  local bottom, stage = split{ node = topLeft, dir = imguiDir_Down, ratio = 0.38 }
  local wave, deck = split{ node = bottom, dir = imguiDir_Down, ratio = 0.50 }

  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[1]), deck)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[2]), stage)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[3]), sources)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[4]), wave)
  imguiDockBuilderDockWindow(windowName(ctx, DOCK_WINDOWS[5]), params)
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

local function setLayoutPreset(ctx, preset)
  ctx._layoutPreset = tostring(preset or "deck")
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
  local choice = ctx.sources[ctx.shader.sourceIndex]
  local isGen = choice and choice.kind == "generator"
  ctx.shaderSourceParams = ctx.shaderSourceParams or {}
  local specParams = (isGen and choice.params) or {}
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
      if ctx.shaderSourceParams[pspec.id] == nil then
        local defaultNorm = (tonumber(pspec.default) or pmin - pmin) / math.max(0.001, pmax - pmin)
        ctx.shaderSourceParams[pspec.id] = clamp(defaultNorm, 0, 1)
      end
      local displayVal = pmin + ctx.shaderSourceParams[pspec.id] * (pmax - pmin)
      setValueSilently(sl, displayVal)
    elseif sl then
      setVisible(sl, false)
    end
  end
end

local function layoutShaderEmbed(ctx, w, h)
  setBounds(ctx.widgets.shaderEmbed, 0, 0, w, h)
  local pad, gap = 8, 4
  setBounds(ctx.widgets.sourceSelect, pad, 25, 92, 18)
  setBounds(ctx.widgets.shaderLayer, 106, 25, 48, 18)
  setBounds(ctx.widgets.shaderEnabled, 160, 25, 50, 18)
  setBounds(ctx.widgets.effectSelect, 216, 25, math.max(110, w - 224), 18)
  local srcRowY = 47
  local srcCount = 4
  local srcCols = 2
  local srcColW = math.max(80, math.floor((w - pad * 2 - gap * (srcCols - 1)) / srcCols))
  for pi = 1, srcCount do
    local col = (pi - 1) % srcCols
    local row = math.floor((pi - 1) / srcCols)
    setBounds(ctx.widgets["sourceParam" .. pi], pad + col * (srcColW + gap), srcRowY + row * 22, math.max(1, srcColW - gap), 17)
  end
  local shaderY = srcRowY + math.ceil(srcCount / srcCols) * 22 + 2
  local cols, colW = 3, math.max(92, math.floor((w - pad * 2) / 3))
  for p = 1, 9 do
    local col = (p - 1) % cols
    local row = math.floor((p - 1) / cols)
    setBounds(ctx.widgets["shaderParam" .. p], pad + col * colW, shaderY + row * 22, math.max(1, colW - 6), 18)
  end
  setBounds(ctx.widgets.shaderStatus, pad, math.max(shaderY + 66, h - 18), math.max(1, w - pad * 2), 14)
  syncShaderSourceParams(ctx)
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
  -- Viewports rendered as ImGui dock windows
  setBounds(ctx.widgets.outputViewport, 0, 0, 0, 0)
  setBounds(ctx.widgets.previewStage, 0, 0, 0, 0)
  -- Output row cells still position relative to outputViewport
  layoutOutputRow(ctx)
  updatePreviewSurface(ctx)
end

-- Grid Phase 2: 1-column clip grid showing current processing chain

local GRID_COLS = 4

local function syncClipModel(ctx)
  ctx.clips = ctx.clips or {}
  -- Column 1: current processing chain
  ctx.clips[1] = {}
  local choice = ctx.sources and ctx.sources[ctx.shader.sourceIndex]
  ctx.clips[1][1] = {
    kind = "source",
    sourceType = choice and choice.kind or "webcam",
    sourceIndex = ctx.shader.sourceIndex,
    name = (choice and choice.name) or "Webcam",
  }
  for i = 1, 8 do
    local L = ctx.shader.layers[i]
    local eff = L and ctx.effects and ctx.effects[L.effectIndex]
    local enabled = L and L.enabled and eff ~= nil
    ctx.clips[1][1 + i] = {
      kind = "fx",
      fxId = eff and eff.id or nil,
      fxName = eff and (eff.name or eff.id) or ("Slot " .. i),
      layerIndex = i,
      enabled = enabled,
      params = L and L.params or nil,
    }
  end
  -- Columns 2..GRID_COLS: empty placeholders
  for col = 2, GRID_COLS do
    ctx.clips[col] = {}
    ctx.clips[col][1] = {
      kind = "source",
      sourceType = "empty",
      name = "Add Source",
      empty = true,
    }
  end
  return GRID_COLS, 9  -- cols, rows per col
end

local function buildTapPipeline(ctx, col, tapIndex)
  if tapIndex <= 1 then return nil end
  local column = ctx.clips[col]
  if not column then return nil end
  local layers = {}
  for i = 2, tapIndex do
    local clip = column[i]
    if clip and clip.kind == "fx" and clip.enabled then
      local L = ctx.shader.layers[clip.layerIndex]
      local eff = L and ctx.effects and ctx.effects[L.effectIndex]
      if L and eff then
        local params = {}
        for p = 1, 9 do
          local spec = eff.params and eff.params[p]
          if spec then
            local normalized = L.params[p] or spec.default or 0
            local pmin = tonumber(spec.min) or 0
            local pmax = tonumber(spec.max) or 1
            params[spec.id] = pmin + normalized * (pmax - pmin)
          end
        end
        layers[#layers + 1] = { enabled = true, effectId = eff.id, params = params }
      end
    end
  end
  if #layers == 0 then return nil end
  local source = buildShaderSourceDescriptor(ctx)
  local ok, payload = pcall(shaders.buildPipeline, layers, "cover", source)
  if ok and payload then return payload end
  return nil
end

local CELL_SRC_TINT = 0xff0d2028
local CELL_FX_TINT = 0xff0d1420
local CELL_BORDER = 0xff1a1a22
local CELL_SEL_BD = 0xff22d3ee

local function ensureGridCells(ctx)
  local parentNode = ctx.widgets and ctx.widgets.deckEmbed and ctx.widgets.deckEmbed.node
  if not parentNode then return 0, 0 end
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
  return numCols, numRows
end

updateGridThumbnails = function(ctx)
  local cells = ctx._gridCells or {}
  local numCols, numRows = GRID_COLS, 9
  ctx._gridThumbSigs = ctx._gridThumbSigs or {}
  for col = 1, numCols do
    for row = 1, numRows do
      local key = tostring(col) .. "_" .. tostring(row)
      local cell = cells[key]
      if not cell then break end
      local clip = ctx.clips[col] and ctx.clips[col][row]
      local thumb = cell.thumb
      if clip and not clip.empty then
        -- Build signature for this cell
        local sig = tostring(col) .. "_" .. tostring(row)
        if row == 1 and clip.kind == "source" then
          sig = sig .. "|source|" .. tostring(ctx.shader.sourceIndex)
          if ctx._gridThumbSigs[key] ~= sig then
            ctx._gridThumbSigs[key] = sig
            local choice = ctx.sources and ctx.sources[ctx.shader.sourceIndex]
            if choice and choice.kind == "generator" then
              local sourceParams = {}
              local specParams = choice.params or {}
              local srcParams = ctx.shaderSourceParams or {}
              for pi = 1, #specParams do
                local pspec = specParams[pi]
                local normalized = srcParams[pspec.id] or tonumber(pspec.default) or 0
                local pmin = tonumber(pspec.min) or 0
                local pmax = tonumber(pspec.max) or 1
                sourceParams[pspec.id] = pmin + normalized * (pmax - pmin)
                sig = sig .. "|" .. tostring(pspec.id) .. "=" .. tostring(math.floor(sourceParams[pspec.id] * 1000 + 0.5))
              end
              local ok, payload = pcall(shaders.buildPipeline, {}, "cover", { type = "generator", sourceId = choice.id, params = sourceParams })
              if ok and payload then
                thumb:setCustomSurface("gpu_shader", payload)
              end
            else
              thumb:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "live" })
            end
          end
        elseif clip.kind == "fx" and clip.enabled then
          sig = sig .. "|fx|" .. tostring(clip.fxId or "") .. "|" .. tostring(clip.layerIndex)
          local L = ctx.shader.layers[clip.layerIndex]
          if L then
            for p = 1, 9 do
              sig = sig .. "|" .. tostring(math.floor((L.params[p] or 0) * 10000 + 0.5))
            end
          end
          if ctx._gridThumbSigs[key] ~= sig then
            ctx._gridThumbSigs[key] = sig
            local payload = buildTapPipeline(ctx, col, row)
            if payload then
              thumb:setCustomSurface("gpu_shader", payload)
            end
          end
        end
      end
    end
  end
end

local EMPTY_CELL_BG = 0xff080c18

local function layoutClipGrid(ctx, w, h)
  setBounds(ctx.widgets.deckEmbed, 0, 0, w, h)
  local pad, gap = 8, 4
  local availW = math.max(1, w - pad * 2)
  local availH = math.max(1, h - pad * 2)

  local numCols, numRows = ensureGridCells(ctx)
  if numCols < 1 or numRows < 1 then return end

  -- Bottom-up: source row at bottom, FX stacked above, columns side by side
  local cellW = math.max(40, math.floor((availW - gap * (numCols - 1)) / numCols))
  local cellH = math.max(24, math.floor((availH - gap * (numRows - 1)) / numRows))
  local thumbH = math.max(1, cellH - 16)
  local labelH = math.max(1, cellH - thumbH - 4)

  for col = 1, numCols do
    for row = 1, numRows do
      local key = tostring(col) .. "_" .. tostring(row)
      local cell = ctx._gridCells[key]
      if not cell then break end

      -- bottom-up: row 1 at physical bottom
      local displayRow = numRows - row + 1
      local cx = pad + (col - 1) * (cellW + gap)
      local cy = pad + (displayRow - 1) * (cellH + gap)

      cell.node:setBounds(cx, cy, cellW, cellH)

      local clip = ctx.clips[col] and ctx.clips[col][row]
      local isSource = (row == 1)
      local isEmpty = clip and clip.empty
      local isEnabled = (not isSource) and clip and clip.enabled

      local bg, borderClr
      if isEmpty then
        bg = 0xff080c18
        borderClr = 0xff0f1520
      elseif isSource then
        bg = CELL_SRC_TINT
        borderClr = 0xff22d3ee
      elseif isEnabled then
        bg = CELL_FX_TINT
        borderClr = CELL_BORDER
      else
        bg = EMPTY_CELL_BG
        borderClr = 0xff0f1520
      end

      cell.node:setDisplayList({
        { cmd = "fillRoundedRect", x = 0, y = 0, w = cellW, h = cellH, radius = 3, color = bg },
        { cmd = "drawRoundedRect", x = 0, y = 0, w = cellW, h = cellH, radius = 3, color = borderClr, thickness = 1 },
      })

      if isEmpty then
        -- Placeholder: show "+" icon in center
        cell.thumb:setBounds(0, 0, 0, 0)
        cell.label:setBounds(0, 0, cellW, cellH)
        cell.label:setDisplayList({
          { cmd = "drawText", text = "+", color = 0xff334155, fontSize = 16, align = "center", valign = "middle" },
        })
      elseif isSource or isEnabled then
        cell.thumb:setBounds(2, 2, math.max(1, cellW - 4), math.max(1, thumbH - 2))
        local labelText = clip and clip.name or ""
        cell.label:setBounds(4, math.max(1, thumbH + 2), math.max(1, cellW - 8), labelH)
        local labelClr = isSource and 0xff22d3ee or (isEnabled and 0xff94a3b8 or 0xff334155)
        cell.label:setDisplayList({
          { cmd = "fillRect", x = 0, y = 0, w = cellW + 8, h = labelH + 2, color = bg },
          { cmd = "drawText", text = labelText, color = labelClr, fontSize = 8 },
        })
      else
        -- Disabled FX slot: empty thumbnail, dim label
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
      setBounds(ctx.widgets.outputViewport, 0, 0, math.floor(av.x), math.floor(av.y))
      imguiRetainedPanel(ctx.widgets.outputViewport.node, math.floor(av.x), math.floor(av.y), true)
    end
  end
  imguiEnd()

  -- Preview dock window
  if imguiBegin("Preview###AVSD_preview", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      setBounds(ctx.widgets.previewStage, 0, 0, math.floor(av.x), math.floor(av.y))
      setBounds(ctx.widgets.previewStageTag, 5, 4, math.max(1, math.floor(av.x) - 10), 12)
      imguiRetainedPanel(ctx.widgets.previewStage.node, math.floor(av.x), math.floor(av.y), true)
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

local function renderEmbeddedPanel(ctx, widgetId, layoutFn, forcedHeight)
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
  imguiRetainedPanel(host.node, w, h, false)
end

local function renderParametersPanel(ctx)
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
  imguiSpacing()
  imguiSeparatorText("Shader")
  renderEmbeddedPanel(ctx, "shaderEmbed", layoutShaderEmbed, 248)
  imguiSpacing()
  imguiSeparatorText("Pose / Seg / Mapping")
  renderEmbeddedPanel(ctx, "mappingEmbed", layoutMappingEmbed, 252)
  imguiSpacing()
  imguiSeparatorText("FX Rack")
  local avail = imguiGetContentRegionAvail()
  renderEmbeddedPanel(ctx, "fxEmbed", layoutFxEmbed, math.max(220, math.floor(tonumber(avail.y) or 220)))
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
      renderEmbeddedPanel(ctx, "deckEmbed", layoutClipGrid)
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
  for i = 1, MAX_MAPPINGS do ctx.mappings[i] = defaultMapping(i) end
  ctx.fxSlot = 1
  ctx._layoutPreset = "deck"
  ctx._resizeMode = false
  ctx._dockTreeBuilt = false
  ctx._rebuildDockTree = false

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
  setDropdownOverlayRoot(ctx.widgets.sourceSelect, ctx.widgets.shaderEmbed)
  setDropdownOverlayRoot(ctx.widgets.shaderLayer, ctx.widgets.shaderEmbed)
  setDropdownOverlayRoot(ctx.widgets.effectSelect, ctx.widgets.shaderEmbed)
  setDropdownOverlayRoot(ctx.widgets.selectedSlice, ctx.widgets.sliceEmbed)
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
  updateShader(ctx)
  refreshDevices(ctx)
  refreshMidi(ctx)
  if Audio == nil or (Audio.isPlugin and not Audio.isPlugin()) then
    if not currentMidiLabel() then openPreferredMidi(ctx) end
  end
  loadModels(ctx)
  bindInputSurfaces(ctx)
  ensurePoseOverlay(ctx)
  layoutToolbar(ctx)
  syncParamsFromHost(ctx)

  ctx.widgets.refreshDevices._onClick = function() refreshDevices(ctx) end
  ctx.widgets.openWebcam._onClick = function() openWebcam(ctx) end
  ctx.widgets.closeWebcam._onClick = function() closeWebcam(ctx) end
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
  ctx.widgets.midiRefresh._onClick = function() refreshMidi(ctx); if not currentMidiLabel() then openPreferredMidi(ctx) end end
  ctx.widgets.midiInput._onSelect = function(idx)
    if idx <= 1 then
      if Midi and Midi.closeInput then Midi.closeInput() end
    else
      if Midi and Midi.openInput then Midi.openInput(idx - 2) end
    end
    refreshMidi(ctx)
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
    ctx.shader.sourceIndex = idx
    writeParam(NS .. "/shader/source", idx)
    syncShaderSourceParams(ctx)
    updateShader(ctx)
  end
  ctx.widgets.shaderLayer._onSelect = function(idx)
    ctx.shader.activeLayer = math.max(1, math.min(8, round(idx)))
    writeParam(NS .. "/shader/active_layer", ctx.shader.activeLayer)
    syncShaderEditor(ctx)
  end
  ctx.widgets.shaderEnabled._onChange = function(v)
    ctx.shader.layers[ctx.shader.activeLayer].enabled = v == true
    writeParam(NS .. "/shader/layer/" .. ctx.shader.activeLayer .. "/enabled", v and 1 or 0)
    updateShader(ctx)
  end
  ctx.widgets.effectSelect._onSelect = function(idx)
    local L = ctx.shader.layers[ctx.shader.activeLayer]
    L.effectIndex = idx
    writeParam(NS .. "/shader/layer/" .. ctx.shader.activeLayer .. "/effect", idx)
    syncShaderEditor(ctx)
    syncShaderSourceParams(ctx)
    updateShader(ctx)
  end
  for p = 1, 9 do
    ctx.widgets["shaderParam" .. p]._onChange = function(v)
      local L = ctx.shader.layers[ctx.shader.activeLayer]
      local effect = ctx.effects[L.effectIndex] or {}
      local spec = effect.params and effect.params[p]
      local pmin = tonumber(spec and spec.min) or 0
      local pmax = tonumber(spec and spec.max) or 1
      local normalized = (v - pmin) / math.max(0.001, pmax - pmin)
      L.params[p] = normalized
      writeParam(NS .. "/shader/layer/" .. ctx.shader.activeLayer .. "/param/" .. p, normalized)
      updateShader(ctx)
    end
  end
  for pi = 1, 4 do
    local sl = ctx.widgets["sourceParam" .. pi]
    if sl then
      sl._onChange = function(v)
        local choice = ctx.sources[ctx.shader.sourceIndex]
        local pspec = choice and choice.params and choice.params[pi] or nil
        if pspec then
          local pmin = tonumber(pspec.min) or 0
          local pmax = tonumber(pspec.max) or 1
          local normalized = (v - pmin) / math.max(0.001, pmax - pmin)
          ctx.shaderSourceParams = ctx.shaderSourceParams or {}
          ctx.shaderSourceParams[pspec.id] = normalized
        end
        updateShader(ctx)
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
      local _, targetIndex = mappingTargetSpec(idx)
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
  applyCaptureWindow(ctx)

  if shouldRunInterval(ctx, "paramSync", PARAM_SYNC_INTERVAL) then
    syncParamsFromHost(ctx)
  end

  pollMidi(ctx)

  local frame = (capture and capture.getFrameInfo and capture.getFrameInfo()) or { valid = false }
  local webcamOpen = (capture and capture.isOpen and capture.isOpen()) and true or false

  if ctx.videoCap and webcamOpen and shouldRunInterval(ctx, "segmentIngest", SEGMENT_INGEST_INTERVAL) then
    local seq = tonumber(frame.sequence)
    if seq == nil or ctx._lastSegmentFrameSeq ~= seq then
      local ok = false
      if ctx.videoCap.ingestSegmentedLatest and ctx._segPipeline then
        ok = ctx.videoCap:ingestSegmentedLatest(ctx._segPipeline, {
          gain = ctx.seg.gain,
          useSigmoid = ctx.seg.useSigmoid,
          threshold = ctx.seg.threshold,
          feather = ctx.seg.feather,
          invert = ctx.seg.invert,
          background = 0.0,
        })
      end
      if not ok then ctx.videoCap:ingestLatest() end
      if seq ~= nil then ctx._lastSegmentFrameSeq = seq end
    end
  end

  local poseUpdated = runPose(ctx, frame)
  if poseUpdated or shouldRunInterval(ctx, "mapping", POSE_INTERVAL) then
    applyMapping(ctx)
  end

  if shouldRunInterval(ctx, "playbackUi", PLAYBACK_UI_INTERVAL) then
    ctx._selectedSlice = math.max(1, math.min(MAX, round(readParam(NS .. "/selected_slice", ctx._selectedSlice or 1))))
    for i = 1, MAX do
      ctx._polyPlaying[i], ctx._polyPos[i] = samplePosition(POLY_PATHS[i], 0)
      ctx._slicePlaying[i], ctx._slicePos[i] = samplePosition(SLICE_PATHS[i], readParam(pathForSlice(i), (i - 1) / MAX))
    end
    layoutOutputRow(ctx)
    updatePreviewSurface(ctx)
    refreshWaveform(ctx)
  end

  if shouldRunInterval(ctx, "status", STATUS_INTERVAL) then
    setText(ctx.widgets.webcamStatus, string.format("Webcam: %s frame=%s %dx%d seq=%s", webcamOpen and "open" or "closed", frame.valid and "yes" or "no", frame.width or 0, frame.height or 0, tostring(frame.sequence or "--")))
    local clk = clockInfo()
    setText(ctx.widgets.clockStatus, string.format("Clock: sr=%.0f samples=%.0f tempo=%.1f", clk.sampleRate or 0, clk.playTimeSamples or 0, clk.tempo or 0))
    setText(ctx.widgets.rendererStatus, "Renderer: " .. ((type(getUIRendererMode) == "function" and getUIRendererMode()) or "canvas"))

    local capFrames = ctx.videoCap and ctx.videoCap:getFrameCount() or 0
    ctx._lockedW = ctx.videoCap and ctx.videoCap:getLockedWidth() or ctx._lockedW
    ctx._lockedH = ctx.videoCap and ctx.videoCap:getLockedHeight() or ctx._lockedH
    local capMB = (ctx.videoCap and ctx.videoCap:getEstimatedBytes() or 0) / (1024 * 1024)
    setText(ctx.widgets.captureStatus, string.format("Capture ring: %d segmented frames locked %dx%d %.1fMB", capFrames, ctx._lockedW or 0, ctx._lockedH or 0, capMB))
    local sampleFrames = ctx.video and ctx.video:getFrameCount() or 0
    setText(ctx.widgets.samplerStatus, string.format("Sampler: %d frames %.2fs last commit %s visible=%d", sampleFrames, ctx.video and ctx.video:getDurationSeconds() or 0, ctx._lastVideoCommitOk and "OK" or "--", #(ctx._visible or {})))
    setText(ctx.widgets.midiStatus, string.format("MIDI: %s last=%s", currentMidiLabel() or "none", tostring(ctx._lastMidi or "--")))
    setText(ctx.widgets.fxStatus, string.format("FX%d type=%d mix=%.2f", ctx.fxSlot, round(readParam(rackFxTypePath(ctx.fxSlot), 0)), readParam(rackFxMixPath(ctx.fxSlot), 0)))
  end
end

function M.cleanup(ctx)
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
end

return M
