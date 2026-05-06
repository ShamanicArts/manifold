local M = {}

local NS = "/avlab"
local MAX = 8
local MAX_MAPPINGS = 8
local MAX_CAPTURE_SECONDS = 6.0
local VIDEO_CAPTURE_ID = "avlab_segmented_capture"
local VIDEO_SAMPLER_ID = "avlab_clip"
local MAJOR_OFFSETS = { 0, 2, 4, 5, 7, 9, 11, 12 }
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
local FX_OPTIONS = {
  "Chorus", "Phaser", "WaveShaper", "Compressor", "StereoWidener", "Filter", "SVF Filter",
  "Reverb", "Stereo Delay", "Multitap", "Pitch Shift", "Granulator", "Ring Mod", "Formant",
  "EQ", "Limiter", "Transient", "Bitcrusher", "Shimmer", "Reverse Delay", "Stutter",
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
local CELL_COLOURS = { 0xffff5c8a, 0xff60a5fa, 0xff86efac, 0xffffcc66, 0xffc084fc, 0xff22d3ee, 0xfffb7185, 0xffa3e635 }

local POLY_PATHS, SLICE_PATHS = {}, {}
for i=1,MAX do
  POLY_PATHS[i] = NS .. "/poly/voice/" .. i .. "/sample"
  SLICE_PATHS[i] = NS .. "/slice/" .. i .. "/sample"
end

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(v) return math.floor((tonumber(v) or 0) + 0.5) end

local function setText(w, text) if w and w.setText then w:setText(tostring(text or "")) end end
local function setLabel(w, text) if w and w.setLabel then w:setLabel(tostring(text or "")) end end
local function setOptions(w, opts) if w and w.setOptions then w:setOptions(opts or {}) end end
local function setSelected(w, idx) if w and w.setSelected then w:setSelected(idx or 1) end end
local function setVisible(w, v) if w and w.setVisible then w:setVisible(v == true) elseif w and w.node and w.node.setVisible then w.node:setVisible(v == true) end end
local function setBounds(w, x, y, ww, hh)
  x, y, ww, hh = math.floor(x or 0), math.floor(y or 0), math.floor(ww or 0), math.floor(hh or 0)
  if w and w.setBounds then w:setBounds(x,y,ww,hh) elseif w and w.node and w.node.setBounds then w.node:setBounds(x,y,ww,hh) end
end
local function setValueSilently(w, value)
  if not (w and w.setValue) then return end
  local cb = w._onChange; w._onChange = nil; w:setValue(value); w._onChange = cb
end
local function setSelectedSilently(w, value)
  if not (w and w.setSelected) then return end
  local cb = w._onSelect; w._onSelect = nil; w:setSelected(value); w._onSelect = cb
end

local function readParam(path, fallback)
  if type(getParam) == "function" then local ok, v = pcall(getParam, path); if ok and v ~= nil then return v end end
  return fallback
end
local function writeParam(path, value)
  local n = type(value) == "boolean" and (value and 1 or 0) or (tonumber(value) or 0)
  if type(setParam) == "function" then return setParam(path, n) end
  return false
end
local function bump(path) writeParam(path, (readParam(path, 0) + 1) % 1000000) end
local function nowSeconds() return (type(getTime) == "function" and tonumber(getTime())) or 0 end
local function shouldRunInterval(ctx, key, interval)
  if type(ctx) ~= "table" then return true end
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
local function writeParamIfChanged(ctx, cacheKey, path, value, epsilon)
  if type(ctx) ~= "table" then return writeParam(path, value) end
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
local function pathForSlice(i) return NS .. "/slice/" .. i .. "/start" end
local function triggerPathForSlice(i) return NS .. "/slice/" .. i .. "/trigger" end
local function velocityPathForSlice(i) return NS .. "/slice/" .. i .. "/velocity" end
local function rackFxBasePath(slot) return "/midi/synth/rack/fx/" .. math.max(1, round(slot or 1)) end
local function rackFxTypePath(slot) return rackFxBasePath(slot) .. "/type" end
local function rackFxMixPath(slot) return rackFxBasePath(slot) .. "/mix" end
local function rackFxParamPath(slot, paramIndex) return rackFxBasePath(slot) .. "/p/" .. math.max(0, round(paramIndex or 0)) end

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

local function currentScriptDir()
  local p = (type(getCurrentScriptPath) == "function") and getCurrentScriptPath() or ""
  return (p:match("^(.*)/[^/]+$") or ".") .. "/"
end
local function join(a,b) if a:sub(-1) == "/" then return a .. b else return a .. "/" .. b end end
local function parentDir(path)
  local p = tostring(path or ""):gsub("/+$", "")
  return (p:match("^(.*)/[^/]+$") or p) .. "/"
end
local function projectRootDir()
  local dir = currentScriptDir()
  if dir:match("/ui/behaviors/$") then return parentDir(parentDir(dir)) end
  if dir:match("/ui/$") then return parentDir(dir) end
  return dir
end
local function statePath() return join(projectRootDir(), ".av_sampler_lab.state") end

local function clockInfo()
  if type(getAudioClockInfo) == "function" then local ok, info = pcall(getAudioClockInfo); if ok and type(info)=="table" then return info end end
  return { sampleRate = 44100, playTimeSamples = 0, tempo = 120 }
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
  if capture and capture.listDevices then local ok, r = pcall(capture.listDevices); if ok and type(r)=="table" then devices = r end end
  ctx._devices = devices
  local labels = {}
  for i=1,#devices do labels[i] = tostring(devices[i].label or devices[i].name or devices[i].path or ("Device " .. tostring(devices[i].index or i-1))) end
  if #labels == 0 then labels[1] = "Device 0" end
  setOptions(ctx.widgets.deviceSelect, labels); setSelectedSilently(ctx.widgets.deviceSelect, 1)
end

local function currentMidiLabel()
  if Midi and Midi.currentInputDeviceName then local n = Midi.currentInputDeviceName(); if type(n)=="string" and n~="" then return n end end
  return nil
end
local function refreshMidi(ctx)
  local devices = (Midi and Midi.inputDevices and Midi.inputDevices()) or {}
  ctx._midiDevices = devices
  local opts = { "None (Disabled)" }
  for i=1,#devices do opts[#opts+1] = tostring(devices[i]) end
  setOptions(ctx.widgets.midiInput, opts)
  local active = currentMidiLabel(); local selected = 1
  if active then for i=1,#opts do if opts[i] == active then selected = i end end end
  setSelectedSilently(ctx.widgets.midiInput, selected)
  setText(ctx.widgets.midiStatus, string.format("MIDI: %s (%s)", active or "none", (Midi and Midi.isInputOpen and Midi.isInputOpen()) and "open" or "closed"))
end
local function openPreferredMidi(ctx)
  if not (Midi and Midi.openInput) then return end
  for i=1,#(ctx._midiDevices or {}) do if not tostring(ctx._midiDevices[i]):lower():find("through", 1, true) then Midi.openInput(i - 1); refreshMidi(ctx); return end end
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
    ctx.widgets.liveViewport.node:setCustomSurface("video_input", { version=2, fitMode="contain", source="live" })
  end
  if ctx.widgets.segViewport and ctx.widgets.segViewport.node and ctx._segModelPath then
    ctx.widgets.segViewport.node:setCustomSurface("ml_composite", segPayload(ctx))
  end
  if ctx.widgets.poseViewport and ctx.widgets.poseViewport.node and ctx._segModelPath then
    ctx.widgets.poseViewport.node:setCustomSurface("ml_composite", segPayload(ctx))
  end
end

local function tryLoad(ctx, paths)
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
  ctx._segPipeline, ctx._segModelPath = tryLoad(ctx, {
    join(projectDir, "selfie_segmentation.onnx"),
    join(scriptsProjects, "MLLab/selfie_segmentation.onnx"),
    join(scriptsProjects, "WebcamViewer/selfie_segmentation.onnx"),
  })
  ctx._posePipeline, ctx._poseModelPath = tryLoad(ctx, {
    join(projectDir, "movenet_singlepose_lightning.onnx"),
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
  if ctx._lastCaptureSecondsApplied ~= seconds then ctx.videoCap:setCaptureSeconds(seconds); ctx._lastCaptureSecondsApplied = seconds end
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
  if secondsOverride ~= nil then
    -- The DSP audio capture copies based on /capture_seconds, so free mode must
    -- temporarily publish the actual press→release duration before triggering.
    -- Otherwise audio/waveform length stays the retrospective window. That was
    -- the broken bullshit.
    writeParam(NS .. "/capture_seconds", seconds)
  end
  applyCaptureWindow(ctx)
  local clk = clockInfo(); local sr = tonumber(clk.sampleRate) or 44100
  local samplesBack = math.max(1, math.floor(seconds * sr))
  bump(NS .. "/capture_trigger")
  local okVideo = ctx.videoCap:copyRecentToSampler(ctx.video, samplesBack)
  ctx.video:seek(0); applyVideoWindow(ctx)
  ctx._lastCaptureSamplesBack = samplesBack; ctx._lastCapturedSeconds = seconds; ctx._lastVideoCommitOk = okVideo == true
  if secondsOverride ~= nil then
    writeParam(NS .. "/capture_seconds", previousCaptureSeconds)
    ctx._lastCaptureSecondsApplied = nil
  end
  if type(invalidateWaveformPeakCache) == "function" then invalidateWaveformPeakCache() end
  refreshWaveform(ctx)
end

local function setCaptureButtonAppearance(ctx)
  local recording = ctx.captureMode == 1 and ctx.captureRecording == true
  setLabel(ctx.widgets.captureNow, recording and "STOP" or "Capture A/V")
  if ctx.widgets.captureNow and ctx.widgets.captureNow.setBg then ctx.widgets.captureNow:setBg(recording and 0xffdc2626 or 0xff22c55e) end
end

local function onCaptureButton(ctx)
  ctx.captureMode = round(readParam(NS .. "/capture_mode", ctx.captureMode or 0))
  if ctx.captureMode == 1 then
    if ctx.captureRecording then
      local clk = clockInfo(); local sr = tonumber(clk.sampleRate) or 44100
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

local function encodedMidi(ctx, note, velocity)
  ctx._midiCounter = ((ctx._midiCounter or 0) + 1) % 512
  return ctx._midiCounter * 16384 + round(clamp(note,0,127)) * 128 + round(clamp(velocity,0,127))
end
local function noteToSlice(note, root)
  for i=1,#MAJOR_OFFSETS do if round(note) == round(root) + MAJOR_OFFSETS[i] then return i end end
  return nil
end
local function triggerNote(ctx, note, velocity)
  writeParam(NS .. "/midi_note", note); writeParam(NS .. "/midi_velocity", velocity)
  writeParam(NS .. "/midi_note_on_trigger", encodedMidi(ctx, note, velocity))
  ctx._lastMidi = string.format("NOTE ON %d vel %d", note, velocity)
end
local function releaseNote(ctx, note)
  writeParam(NS .. "/midi_note", note); writeParam(NS .. "/midi_note_off_trigger", encodedMidi(ctx, note, 0))
  ctx._lastMidi = string.format("NOTE OFF %d", note)
end
local function pollMidi(ctx)
  if not (Midi and Midi.pollInputEvent) then return end
  local consumed = 0
  while consumed < 64 do
    local e = Midi.pollInputEvent(); if not e then break end
    consumed = consumed + 1
    local t, d1, d2 = tonumber(e.type or 0) or 0, tonumber(e.data1 or 0) or 0, tonumber(e.data2 or 0) or 0
    if Midi.NOTE_ON and t == Midi.NOTE_ON and d2 > 0 then triggerNote(ctx, d1, d2)
    elseif (Midi.NOTE_OFF and t == Midi.NOTE_OFF) or (Midi.NOTE_ON and t == Midi.NOTE_ON and d2 <= 0) then releaseNote(ctx, d1)
    elseif Midi.CONTROL_CHANGE and t == Midi.CONTROL_CHANGE and d1 == 123 then bump(NS .. "/stop_trigger") end
  end
end

local function setCellSurface(ctx, slot, sourceIndex, pos, label)
  local cell = ctx.widgets["cell" .. slot]
  if cell and cell.node and cell.node.setCustomSurface and ctx.video then
    cell.node:setCustomSurface("video_input", { version=2, fitMode="contain", source="sampler", samplerId=ctx.video:getId(), position=clamp(pos or 0,0,1) })
  end
  local colour = CELL_COLOURS[((sourceIndex or slot)-1) % #CELL_COLOURS + 1]
  if cell and cell.setStyle then cell:setStyle({ bg=0x00000000, border=0x00000000, borderWidth=0, radius=0 }) end
  local lab = ctx.widgets["cellLabel" .. slot]
  if lab and lab.setColour then lab:setColour(colour) end
  setText(lab, label or "")
end

local function layoutOutputRow(ctx)
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
    for i=1,MAX do if ctx._polyPlaying[i] then visible[#visible+1] = { kind="V", index=i, pos=ctx._polyPos[i] or 0 } end end
  else
    for i=1,MAX do if ctx._slicePlaying[i] then visible[#visible+1] = { kind="S", index=i, pos=ctx._slicePos[i] or 0 } end end
  end
  ctx._visible = visible
  if #visible == 0 then
    for slot=1,MAX do
      setBounds(ctx.widgets["cell" .. slot], 0, 0, 0, 0)
      setBounds(ctx.widgets["cellLabel" .. slot], 0, 0, 0, 0)
      setText(ctx.widgets["cellLabel" .. slot], "")
    end
    return
  end
  local count = #visible
  local gap, inset = 0, 0
  local cellW = math.floor((w - inset * 2 - gap * (count - 1)) / count)
  local cellH = math.floor(math.min(h - inset * 2, cellW / math.max(0.01, ar)))
  local y = math.floor(h - inset - cellH)
  for slot=1,MAX do
    local item = visible[slot]
    if item then
      local x = inset + (slot - 1) * (cellW + gap)
      setBounds(ctx.widgets["cell" .. slot], x, y, cellW, cellH)
      setBounds(ctx.widgets["cellLabel" .. slot], x + 8, y + 8, math.max(1, cellW - 16), 18)
      setCellSurface(ctx, slot, item.index, item.pos, string.format("%s%d %.3f", item.kind, item.index, item.pos or 0))
    else
      setBounds(ctx.widgets["cell" .. slot], 0, 0, 0, 0); setBounds(ctx.widgets["cellLabel" .. slot], 0, 0, 0, 0); setText(ctx.widgets["cellLabel" .. slot], "")
    end
  end
end

local function samplePosition(path, fallback)
  local playing = false
  if type(isSampleRegionPlaybackPlaying) == "function" then local ok, v = pcall(isSampleRegionPlaybackPlaying, path); playing = ok and v == true end
  local pos = fallback or 0
  if playing and type(getSampleRegionPlaybackLoopAwarePosition) == "function" then local ok, v = pcall(getSampleRegionPlaybackLoopAwarePosition, path); if ok and tonumber(v) then pos = clamp(v, 0, 1) end end
  return playing, pos
end

function refreshWaveform(ctx)
  local wf = ctx.widgets and ctx.widgets.waveform
  if not wf then return end
  local mode = round(readParam(NS .. "/mode", 0))
  if wf.setSamplePath then wf:setSamplePath(mode == 0 and POLY_PATHS[1] or SLICE_PATHS[1]) end

  local playheads = {}
  if mode == 0 then
    local loopStart = clamp(readParam(NS .. "/loop_start", 0), 0, 0.999)
    local loopEnd = clamp(readParam(NS .. "/loop_end", 1), loopStart + 0.001, 1)
    local playStart = clamp(readParam(NS .. "/play_start", loopStart), loopStart, loopEnd)
    for i=1,MAX do playheads[i] = (ctx._polyPlaying[i] and ctx._polyPos[i]) or -1 end
    if wf.setVoicePlayheads then wf:setVoicePlayheads(playheads) end
    if wf.setVoiceGrains then wf:setVoiceGrains({}) end
    if wf.setGrainPositions then wf:setGrainPositions({ loopStart, playStart, loopEnd }) end
    if wf.setGrainPosition then wf:setGrainPosition(-1) end
    if wf.setRegion then wf:setRegion(loopStart, loopEnd) end
    if wf.setPlayStart then wf:setPlayStart(playStart) end
    if wf.setCrossfade then wf:setCrossfade(clamp(readParam(NS .. "/crossfade", 0.03), 0, 0.5)) end
    local first = -1
    for i=1,MAX do if playheads[i] and playheads[i] >= 0 then first = playheads[i]; break end end
    if wf.setPlayheadPos then wf:setPlayheadPos(first >= 0 and first or playStart) end
    setText(ctx.widgets.waveformStatus, string.format("Poly: play %.3f | loop %.3f→%.3f | active voice playheads follow SampleRegionPlaybackNode positions", playStart, loopStart, loopEnd))
    return
  end

  local starts = {}
  for i=1,MAX do starts[i] = clamp(readParam(pathForSlice(i), (i-1)/MAX), 0, 0.999) end
  if wf.setGrainPositions then wf:setGrainPositions(starts) end
  if wf.setVoiceGrains then local g={}; for i=1,MAX do g[i] = { starts[i] } end; wf:setVoiceGrains(g) end
  for i=1,MAX do playheads[i] = (ctx._slicePlaying[i] and ctx._slicePos[i]) or -1 end
  if wf.setVoicePlayheads then wf:setVoicePlayheads(playheads) end
  local sel = ctx._selectedSlice or 1
  local start = starts[sel] or 0
  local finish = 1.0
  for i=1,MAX do if (starts[i] or 0) > start + 0.002 and starts[i] < finish then finish = starts[i] end end
  if wf.setRegion then wf:setRegion(start, finish) end
  if wf.setPlayStart then wf:setPlayStart(start) end
  if wf.setGrainPosition then wf:setGrainPosition(start) end
  if wf.setCrossfade then wf:setCrossfade(0.002) end
  if wf.setPlayheadPos then wf:setPlayheadPos(playheads[sel] ~= -1 and playheads[sel] or start) end
  setText(ctx.widgets.waveformStatus, string.format("Slice: selected S%d %.3f→%.3f | drag nearest marker to edit actual slice start", sel, start, finish))
end

local function nearestSlice(pos)
  local best, dist = 1, 999
  for i=1,MAX do local d = math.abs(readParam(pathForSlice(i), (i-1)/MAX) - pos); if d < dist then best, dist = i, d end end
  return best
end

local function registerPoseEndpoints(ctx)
  if not (osc and osc.registerEndpoint) then return end
  ctx._poseEndpointPaths = {}
  local function reg(path, desc)
    pcall(osc.registerEndpoint, path, { type="f", range={0,1}, access=3, description=desc or path })
    ctx._poseEndpointPaths[#ctx._poseEndpointPaths+1] = path
  end
  for _, name in ipairs(KEYPOINTS) do
    reg(NS .. "/pose/" .. name .. "/x", "Normalized " .. name .. " X")
    reg(NS .. "/pose/" .. name .. "/y", "Normalized " .. name .. " Y")
    reg(NS .. "/pose/" .. name .. "/confidence", "Pose confidence " .. name)
  end
  reg(NS .. "/pose/both_hands/spread", "Distance between wrists")
  reg(NS .. "/pose/left_arm/reach", "Distance left shoulder to left wrist")
  reg(NS .. "/pose/right_arm/reach", "Distance right shoulder to right wrist")
end

local function letterbox(vpW, vpH, vidW, vidH)
  if vidW <= 0 or vidH <= 0 then return 0,0,vpW,vpH end
  local va, pa = vidW / vidH, vpW / vpH
  if va > pa then local dh = vpW / va; return 0, math.floor((vpH-dh)/2), vpW, math.floor(dh) end
  local dw = vpH * va; return math.floor((vpW-dw)/2), 0, math.floor(dw), vpH
end
local function buildPoseDisplay(kps, conf, show, w, h, vidW, vidH)
  local d = {}; if not kps then return d end
  local ox, oy, dw, dh = letterbox(w,h,vidW or 640,vidH or 480)
  local function mx(x) return math.floor(ox + clamp(x,0,1) * dw) end
  local function my(y) return math.floor(oy + clamp(y,0,1) * dh) end
  if show then
    for _, c in ipairs(SKELETON) do local a,b = kps[c[1]], kps[c[2]]; if a and b and a.conf > conf and b.conf > conf then d[#d+1] = { cmd="drawLine", x1=mx(a.x), y1=my(a.y), x2=mx(b.x), y2=my(b.y), thickness=2, color=0xff00ffff } end end
  end
  for i,k in ipairs(kps) do if k.conf > conf then local x,y=mx(k.x),my(k.y); d[#d+1]={cmd="fillRoundedRect",x=x-3,y=y-3,w=6,h=6,radius=3,color=(i==10 or i==11) and 0xffff5c8a or 0xff22c55e} end end
  return d
end
local function ensurePoseOverlay(ctx)
  local vp = ctx.widgets.poseViewport
  if ctx._poseOverlay or not (vp and vp.node and vp.node.addChild) then return end
  local o = vp.node:addChild("avlabPoseOverlay")
  if o then o:setInterceptsMouse(false,false); o:setBounds(0,0,vp.node:getWidth(),vp.node:getHeight()); o:setDisplayList({}); ctx._poseOverlay = o end
end

local function publishPose(ctx, values)
  if not (osc and osc.send) then return end
  for path, value in pairs(values or {}) do pcall(osc.send, path, value) end
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
  for i=0,16 do
    local y, x, c = tonumber(result.data[i*3+1]) or 0, tonumber(result.data[i*3+2]) or 0, tonumber(result.data[i*3+3]) or 0
    if x > 1.5 then x = x / inputW end; if y > 1.5 then y = y / inputH end
    kps[i+1] = { x=clamp(x,0,1), y=clamp(y,0,1), conf=c }
  end
  ctx.pose = { keypoints = kps, byName = {} }
  for i,name in ipairs(KEYPOINTS) do ctx.pose.byName[name] = kps[i] end
  local lw, rw, nose = ctx.pose.byName.left_wrist, ctx.pose.byName.right_wrist, ctx.pose.byName.nose
  local ls, rs = ctx.pose.byName.left_shoulder, ctx.pose.byName.right_shoulder
  local spread = (lw and rw) and math.sqrt((lw.x-rw.x)^2 + (lw.y-rw.y)^2) or 0
  local leftReach = (lw and ls) and math.sqrt((lw.x-ls.x)^2 + (lw.y-ls.y)^2) or 0
  local rightReach = (rw and rs) and math.sqrt((rw.x-rs.x)^2 + (rw.y-rs.y)^2) or 0
  ctx.pose.values = {}
  for _, name in ipairs(KEYPOINTS) do
    local kp = ctx.pose.byName[name]
    ctx.pose.values[NS .. "/pose/" .. name .. "/x"] = kp and kp.x or 0
    ctx.pose.values[NS .. "/pose/" .. name .. "/y"] = kp and kp.y or 0
    ctx.pose.values[NS .. "/pose/" .. name .. "/confidence"] = kp and kp.conf or 0
  end
  ctx.pose.values[NS .. "/pose/both_hands/spread"] = clamp(spread,0,1)
  ctx.pose.values[NS .. "/pose/left_arm/reach"] = clamp(leftReach,0,1)
  ctx.pose.values[NS .. "/pose/right_arm/reach"] = clamp(rightReach,0,1)
  publishPose(ctx, ctx.pose.values)
  if ctx._poseOverlay then
    local frame = frameInfo or (capture.getFrameInfo and capture.getFrameInfo()) or {}
    ctx._poseOverlay:setBounds(0,0,ctx._poseOverlay:getWidth(),ctx._poseOverlay:getHeight())
    ctx._poseOverlay:setDisplayList(buildPoseDisplay(kps, ctx.poseConf, ctx.showSkeleton, ctx._poseOverlay:getWidth(), ctx._poseOverlay:getHeight(), frame.width or 640, frame.height or 480))
  end
  local visible = 0; for _,kp in ipairs(kps) do if kp.conf > ctx.poseConf then visible = visible + 1 end end
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
    normalizedTarget = normalizedTarget,
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
  local node = rootNode:createChild("avlab_shader_source")
  if not node then return nil end
  local entry = { id = "__avlab_shader_source", node = node }
  if node.setNodeId then node:setNodeId(entry.id) end
  if node.setBounds then node:setBounds(0, 0, 64, 64) end
  if node.setVisible then node:setVisible(false) end
  ctx._shaderSourceNode = entry
  return entry
end

local function buildShaderSourceDescriptor(ctx)
  local choice = ctx.sources[ctx.shader.sourceIndex]
  local entry = ensureShaderSourceNode(ctx)
  if entry and entry.node then
    if choice and choice.kind == "generator" and shaders and shaders.buildPipeline then
      local ok, payload = pcall(shaders.buildPipeline, {}, "cover", { type = "generator", sourceId = choice.id, params = choice.params or {} })
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
  if choice and choice.kind == "generator" then source = { type="generator", sourceId=choice.id, params=choice.params or {} } end
  return source, choice
end

function updateShader(ctx)
  if not (ctx.widgets.outputViewport and ctx.widgets.outputViewport.node) then return end
  local layers = {}
  for i=1,8 do
    local L = ctx.shader.layers[i]
    local effect = L and ctx.effects[L.effectIndex]
    if L and L.enabled and effect then
      local params = {}
      for p=1,9 do local spec = effect.params and effect.params[p]; if spec then params[spec.id] = L.params[p] or spec.default or 0 end end
      layers[#layers+1] = { enabled=true, effectId=effect.id, params=params }
    end
  end
  local source, choice = buildShaderSourceDescriptor(ctx)
  if shaders and shaders.buildPipeline then
    local ok, payload = pcall(shaders.buildPipeline, layers, "cover", source)
    if ok and payload then ctx.widgets.outputViewport.node:setCustomSurface("gpu_shader", payload) end
  end
  setText(ctx.widgets.shaderStatus, string.format("Shader: %s %s", choice and choice.name or "Webcam", ctx.effects[(ctx.shader.layers[ctx.shader.activeLayer] or {}).effectIndex or 1] and ctx.effects[(ctx.shader.layers[ctx.shader.activeLayer] or {}).effectIndex or 1].name or "--"))
end

local function refreshShaderLists(ctx)
  ctx.effects = (shaders and shaders.listEffects and shaders.listEffects()) or {}
  if #ctx.effects == 0 then ctx.effects = { { id="none", name="Passthrough", params={} } } end
  ctx.sources = { { kind="webcam", id="webcam", name="Webcam", params={} } }
  local gens = (sources and sources.list and sources.list()) or {}
  for i=1,#gens do ctx.sources[#ctx.sources+1] = { kind="generator", id=gens[i].id, name=gens[i].name or gens[i].id, params={} } end
  local effectNames, sourceNames = {}, {}
  local poseNames = {}
  for i, source in ipairs(POSE_SOURCES) do poseNames[i] = source.label end
  for i,e in ipairs(ctx.effects) do effectNames[i] = tostring(e.name or e.id or "Effect") end
  for i,s in ipairs(ctx.sources) do sourceNames[i] = tostring(s.name or s.id or "Source") end
  setOptions(ctx.widgets.effectSelect, effectNames)
  setOptions(ctx.widgets.sourceSelect, sourceNames)
  for track = 1, MAX_MAPPINGS do
    setOptions(ctx.widgets["mapping" .. track .. "Source"], poseNames)
    setOptions(ctx.widgets["mapping" .. track .. "Target"], MAPPING_TARGET_LABELS)
  end
end

local function syncModePanels(ctx)
  local isSlice = round(readParam(NS .. "/mode", 0)) == 1
  setVisible(ctx.widgets.polyPanel, not isSlice)
  setVisible(ctx.widgets.slicePanel, isSlice)
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
  local effect = ctx.effects[L.effectIndex] or { params={} }
  for p=1,9 do
    local sl = ctx.widgets["shaderParam" .. p]
    local spec = effect.params and effect.params[p]
    if spec then
      if sl.setLabel then sl:setLabel(spec.name or spec.id or ("P"..p)) end
      sl._min = tonumber(spec.min) or 0; sl._max = tonumber(spec.max) or 1; sl._step = tonumber(spec.step) or 0.01
      setVisible(sl, true); setValueSilently(sl, L.params[p] or spec.default or 0)
    else setVisible(sl, false) end
  end
end

local function bindParamWidget(w)
  local path = w and w.config and w.config.paramPath or nil
  if type(path) ~= "string" or path == "" or not w.setValue then return end
  w._onChange = function(v) writeParam(path, v); applyVideoWindow(w._ctx) end
end

local function syncParamsFromHost(ctx)
  local changedShader = false
  local oldSeg = { ctx.seg.gain, ctx.seg.threshold, ctx.seg.feather, ctx.seg.invert }
  ctx.seg.gain = clamp(readParam(NS.."/seg/gain", ctx.seg.gain), 0.25, 4)
  ctx.seg.threshold = clamp(readParam(NS.."/seg/threshold", ctx.seg.threshold), 0, 1)
  ctx.seg.feather = clamp(readParam(NS.."/seg/feather", ctx.seg.feather), 0, 1)
  ctx.seg.invert = readParam(NS.."/seg/invert", ctx.seg.invert and 1 or 0) > 0.5
  ctx.poseConf = clamp(readParam(NS.."/pose/confidence", ctx.poseConf), 0, 1)
  if oldSeg[1] ~= ctx.seg.gain or oldSeg[2] ~= ctx.seg.threshold or oldSeg[3] ~= ctx.seg.feather or oldSeg[4] ~= ctx.seg.invert then bindInputSurfaces(ctx) end
  setValueSilently(ctx.widgets.segGain, ctx.seg.gain); setValueSilently(ctx.widgets.segThreshold, ctx.seg.threshold); setValueSilently(ctx.widgets.segFeather, ctx.seg.feather); setValueSilently(ctx.widgets.poseConf, ctx.poseConf); setValueSilently(ctx.widgets.segInvert, ctx.seg.invert)

  local mode = round(readParam(NS.."/mode", 0)); setValueSilently(ctx.widgets.mode, mode > 0.5); syncModePanels(ctx)
  ctx.captureMode = round(readParam(NS.."/capture_mode", ctx.captureMode or 0)); setValueSilently(ctx.widgets.captureMode, ctx.captureMode > 0.5); setCaptureButtonAppearance(ctx)

  local sourceIndex = math.max(1, math.min(#(ctx.sources or {}), round(readParam(NS.."/shader/source", ctx.shader.sourceIndex))))
  if sourceIndex ~= ctx.shader.sourceIndex then ctx.shader.sourceIndex = sourceIndex; setSelectedSilently(ctx.widgets.sourceSelect, sourceIndex); changedShader = true end
  local activeLayer = math.max(1, math.min(8, round(readParam(NS.."/shader/active_layer", ctx.shader.activeLayer))))
  if activeLayer ~= ctx.shader.activeLayer then ctx.shader.activeLayer = activeLayer; syncShaderEditor(ctx) end
  for l=1,8 do
    local L = ctx.shader.layers[l]
    local en = readParam(NS.."/shader/layer/"..l.."/enabled", L.enabled and 1 or 0) > 0.5
    local eff = math.max(1, math.min(#(ctx.effects or {}), round(readParam(NS.."/shader/layer/"..l.."/effect", L.effectIndex))))
    if en ~= L.enabled or eff ~= L.effectIndex then L.enabled = en; L.effectIndex = eff; changedShader = true end
    for p=1,9 do
      local v = clamp(readParam(NS.."/shader/layer/"..l.."/param/"..p, L.params[p] or 0.5), 0, 1)
      if v ~= L.params[p] then L.params[p] = v; changedShader = true end
    end
  end
  if changedShader then updateShader(ctx); syncShaderEditor(ctx) end

  for t = 1, MAX_MAPPINGS do
    local m = ctx.mappings[t] or defaultMapping(t)
    ctx.mappings[t] = m
    m.enabled = readParam(NS.."/mapping/"..t.."/enabled", m.enabled and 1 or 0) > 0.5
    m.source = math.max(1, math.min(#POSE_SOURCES, round(readParam(NS.."/mapping/"..t.."/source", m.source or 1))))
    m.target = math.max(1, math.min(#MAPPING_TARGETS, round(readParam(NS.."/mapping/"..t.."/target", m.target or 1))))
    m.min = clamp(readParam(NS.."/mapping/"..t.."/min", m.min or 0), 0, 1)
    m.max = clamp(readParam(NS.."/mapping/"..t.."/max", m.max or 1), 0, 1)
    m.invert = readParam(NS.."/mapping/"..t.."/invert", m.invert and 1 or 0) > 0.5
    setValueSilently(ctx.widgets["mapping"..t.."Enable"], m.enabled)
    setSelectedSilently(ctx.widgets["mapping"..t.."Source"], m.source)
    setSelectedSilently(ctx.widgets["mapping"..t.."Target"], m.target)
    setValueSilently(ctx.widgets["mapping"..t.."Min"], m.min)
    setValueSilently(ctx.widgets["mapping"..t.."Max"], m.max)
    setValueSilently(ctx.widgets["mapping"..t.."Invert"], m.invert)
  end

  local s = ctx.fxSlot or 1
  if ctx.widgets.fxType then setSelectedSilently(ctx.widgets.fxType, round(readParam(rackFxTypePath(s),0))+1) end
  if ctx.widgets.fxMix then setValueSilently(ctx.widgets.fxMix, readParam(rackFxMixPath(s),0)) end
  for p=1,5 do if ctx.widgets["fxParam"..p] then setValueSilently(ctx.widgets["fxParam"..p], readParam(rackFxParamPath(s, p - 1),0.5)) end end
end

local function saveState(ctx)
  if type(writeTextFile) ~= "function" then return end
  local lines = {}
  lines[#lines+1] = "mode=" .. tostring(round(readParam(NS .. "/mode",0)))
  lines[#lines+1] = "source=" .. tostring(ctx.shader.sourceIndex or 1)
  lines[#lines+1] = "captureMode=" .. tostring(round(readParam(NS .. "/capture_mode",0)))
  for i=1,8 do local L=ctx.shader.layers[i]; lines[#lines+1]=string.format("shader.%d=%s,%s,%s,%s", i, tostring(L.enabled), tostring(L.effectIndex or 1), tostring(L.params[1] or 0), tostring(L.params[2] or 0)) end
  for i=1,MAX do lines[#lines+1] = string.format("slice.%d=%s", i, tostring(readParam(pathForSlice(i), (i-1)/MAX))) end
  for t = 1, MAX_MAPPINGS do
    local m = ctx.mappings[t]
    for k,v in pairs(m or {}) do lines[#lines+1] = "mapping"..t.."." .. tostring(k) .. "=" .. tostring(v) end
  end
  writeTextFile(statePath(), table.concat(lines, "\n") .. "\n")
end
local function loadState(ctx)
  if type(readTextFile) ~= "function" then return end
  local raw = readTextFile(statePath()) or ""
  for line in raw:gmatch("[^\r\n]+") do
    local k,v = line:match("^([^=]+)=(.*)$")
    if k and v then
      if k == "mode" then writeParam(NS .. "/mode", tonumber(v) or 0); setValueSilently(ctx.widgets.mode, (tonumber(v) or 0) > 0.5)
      elseif k == "captureMode" then writeParam(NS .. "/capture_mode", tonumber(v) or 0); setValueSilently(ctx.widgets.captureMode, (tonumber(v) or 0) > 0.5)
      elseif k == "source" then ctx.shader.sourceIndex = tonumber(v) or 1
      else
        local si = k:match("^slice%.(%d+)$"); if si then writeParam(pathForSlice(tonumber(si)), tonumber(v) or 0) end
        local li = k:match("^shader%.(%d+)$"); if li then local a,b,c,d = v:match("([^,]+),([^,]+),([^,]+),([^,]+)"); local L=ctx.shader.layers[tonumber(li)]; if L then L.enabled=(a=="true"); L.effectIndex=tonumber(b) or 1; L.params[1]=tonumber(c) or 0; L.params[2]=tonumber(d) or 0 end end
        local mt, mk = k:match("^mapping(%d)%.(.+)$")
        if mt then
          local track = tonumber(mt)
          if track and ctx.mappings[track] then
            if v=="true" then ctx.mappings[track][mk]=true elseif v=="false" then ctx.mappings[track][mk]=false else ctx.mappings[track][mk]=tonumber(v) or v end
          end
        end
      end
    end
  end
end

function M.init(ctx)
  ctx.video = videoSampler and videoSampler.new and videoSampler.new({ id = VIDEO_SAMPLER_ID }) or nil
  ctx.videoCap = videoSampler and videoSampler.capture and videoSampler.capture({ id = VIDEO_CAPTURE_ID, maxSeconds = MAX_CAPTURE_SECONDS }) or nil
  ctx.seg = { gain=1.0, useSigmoid=true, threshold=0.5, feather=0.15, invert=false }
  ctx.poseConf = 0.3; ctx.showSkeleton = true
  ctx._polyPlaying, ctx._polyPos, ctx._slicePlaying, ctx._slicePos = {}, {}, {}, {}
  ctx._selectedSlice = round(readParam(NS .. "/selected_slice", 1))
  ctx.shader = { sourceIndex = 1, activeLayer = 1, layers = {} }
  for i=1,8 do ctx.shader.layers[i] = { enabled = i == 1, effectIndex = 1, params = {0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5,0.5} } end
  ctx.captureMode = round(readParam(NS .. "/capture_mode", 0))
  ctx.captureRecording = false
  ctx.mappings = {}
  for i = 1, MAX_MAPPINGS do ctx.mappings[i] = defaultMapping(i) end
  ctx.fxSlot = 1

  for _,w in pairs(ctx.allWidgets or {}) do if type(w)=="table" then w._ctx = ctx; if type(w.config)=="table" and type(w.config.paramPath)=="string" then bindParamWidget(w) end end end

  refreshShaderLists(ctx); loadState(ctx); syncShaderEditor(ctx); updateShader(ctx); registerPoseEndpoints(ctx)
  refreshDevices(ctx); refreshMidi(ctx); if Audio == nil or (Audio.isPlugin and not Audio.isPlugin()) then if not currentMidiLabel() then openPreferredMidi(ctx) end end
  loadModels(ctx); ensurePoseOverlay(ctx)

  ctx.widgets.refreshDevices._onClick = function() refreshDevices(ctx) end
  ctx.widgets.openWebcam._onClick = function() openWebcam(ctx) end
  ctx.widgets.closeWebcam._onClick = function() closeWebcam(ctx) end
  ctx.widgets.loadModels._onClick = function() loadModels(ctx) end
  ctx.widgets.captureNow._onClick = function() onCaptureButton(ctx); saveState(ctx) end
  ctx.widgets.play._onClick = function()
    if round(readParam(NS .. "/mode", 0)) == 0 then
      writeParam(NS .. "/one_shot", 0)
      setValueSilently(ctx.widgets.oneShot, false)
    end
    bump(NS .. "/play_trigger")
  end
  ctx.widgets.stop._onClick = function() bump(NS .. "/stop_trigger") end
  ctx.widgets.clear._onClick = function() if ctx.video then ctx.video:clear() end; if ctx.videoCap then ctx.videoCap:clear() end end
  ctx.widgets.midiRefresh._onClick = function() refreshMidi(ctx); if not currentMidiLabel() then openPreferredMidi(ctx) end end
  ctx.widgets.midiInput._onSelect = function(idx) if idx <= 1 then if Midi and Midi.closeInput then Midi.closeInput() end else if Midi and Midi.openInput then Midi.openInput(idx-2) end end; refreshMidi(ctx) end
  ctx.widgets.selectedSlice._onSelect = function(idx) ctx._selectedSlice = math.max(1, math.min(MAX, round(idx))); writeParam(NS .. "/selected_slice", ctx._selectedSlice); refreshWaveform(ctx); saveState(ctx) end
  ctx.widgets.auditionSelected._onClick = function() writeParam(velocityPathForSlice(ctx._selectedSlice), 127); bump(triggerPathForSlice(ctx._selectedSlice)) end

  for _, id in ipairs({"segGain","segThreshold","segFeather","poseConf"}) do
    ctx.widgets[id]._onChange = function(v)
      if id=="segGain" then ctx.seg.gain=clamp(v,0.25,4); writeParam(NS.."/seg/gain", ctx.seg.gain)
      elseif id=="segThreshold" then ctx.seg.threshold=clamp(v,0,1); writeParam(NS.."/seg/threshold", ctx.seg.threshold)
      elseif id=="segFeather" then ctx.seg.feather=clamp(v,0,1); writeParam(NS.."/seg/feather", ctx.seg.feather)
      elseif id=="poseConf" then ctx.poseConf=clamp(v,0,1); writeParam(NS.."/pose/confidence", ctx.poseConf) end
      bindInputSurfaces(ctx); saveState(ctx)
    end
  end
  for t = 1, MAX_MAPPINGS do
    for _, id in ipairs({"mapping"..t.."Min", "mapping"..t.."Max"}) do
      ctx.widgets[id]._onChange = function(v)
        local track = tonumber(id:match("^mapping(%d+)")) or 1
        local key = id:match("Min$") and "min" or "max"
        ctx.mappings[track][key] = clamp(tonumber(v) or 0, 0, 1)
        writeParam(NS.."/mapping/"..track.."/"..key, ctx.mappings[track][key])
        saveState(ctx)
      end
    end
    ctx.widgets["mapping"..t.."Enable"]._onChange = function(v)
      ctx.mappings[t].enabled = v == true; writeParam(NS.."/mapping/"..t.."/enabled", ctx.mappings[t].enabled and 1 or 0); saveState(ctx)
    end
    ctx.widgets["mapping"..t.."Source"]._onSelect = function(idx)
      ctx.mappings[t].source = round(idx); writeParam(NS.."/mapping/"..t.."/source", ctx.mappings[t].source); saveState(ctx)
    end
    ctx.widgets["mapping"..t.."Target"]._onSelect = function(idx)
      local _, targetIndex = mappingTargetSpec(idx)
      ctx.mappings[t].target = targetIndex; writeParam(NS.."/mapping/"..t.."/target", ctx.mappings[t].target); saveState(ctx)
    end
    ctx.widgets["mapping"..t.."Invert"]._onChange = function(v)
      ctx.mappings[t].invert = v == true; writeParam(NS.."/mapping/"..t.."/invert", ctx.mappings[t].invert and 1 or 0); saveState(ctx)
    end
  end
  ctx.widgets.segInvert._onChange = function(v) ctx.seg.invert = v == true; writeParam(NS.."/seg/invert", ctx.seg.invert and 1 or 0); bindInputSurfaces(ctx) end
  ctx.widgets.showSkeleton._onChange = function(v) ctx.showSkeleton = v == true end
  ctx.widgets.mode._onChange = function(v) writeParam(NS .. "/mode", v and 1 or 0); syncModePanels(ctx); refreshWaveform(ctx); saveState(ctx) end
  ctx.widgets.captureMode._onChange = function(v) ctx.captureMode = v and 1 or 0; writeParam(NS .. "/capture_mode", ctx.captureMode); if ctx.captureMode ~= 1 then ctx.captureRecording = false end; setCaptureButtonAppearance(ctx); saveState(ctx) end

  ctx.widgets.sourceSelect._onSelect = function(idx) ctx.shader.sourceIndex = idx; writeParam(NS .. "/shader/source", idx); updateShader(ctx); saveState(ctx) end
  ctx.widgets.shaderLayer._onSelect = function(idx) ctx.shader.activeLayer = math.max(1, math.min(8, round(idx))); writeParam(NS .. "/shader/active_layer", ctx.shader.activeLayer); syncShaderEditor(ctx) end
  ctx.widgets.shaderEnabled._onChange = function(v) ctx.shader.layers[ctx.shader.activeLayer].enabled = v == true; writeParam(NS .. "/shader/layer/" .. ctx.shader.activeLayer .. "/enabled", v and 1 or 0); updateShader(ctx); saveState(ctx) end
  ctx.widgets.effectSelect._onSelect = function(idx) local L=ctx.shader.layers[ctx.shader.activeLayer]; L.effectIndex=idx; writeParam(NS .. "/shader/layer/" .. ctx.shader.activeLayer .. "/effect", idx); syncShaderEditor(ctx); updateShader(ctx); saveState(ctx) end
  for p=1,9 do ctx.widgets["shaderParam"..p]._onChange = function(v) ctx.shader.layers[ctx.shader.activeLayer].params[p] = v; writeParam(NS .. "/shader/layer/" .. ctx.shader.activeLayer .. "/param/" .. p, v); updateShader(ctx); saveState(ctx) end end

  if ctx.widgets.fxSlot then
    ctx.widgets.fxSlot._onSelect = function(idx)
      ctx.fxSlot = math.max(1, math.min(2, round(idx)))
      local s=ctx.fxSlot
      if ctx.widgets.fxMix then setValueSilently(ctx.widgets.fxMix, readParam(rackFxMixPath(s),0)) end
      for p=1,5 do if ctx.widgets["fxParam"..p] then setValueSilently(ctx.widgets["fxParam"..p], readParam(rackFxParamPath(s, p - 1),0.5)) end end
      if ctx.widgets.fxType then setSelectedSilently(ctx.widgets.fxType, round(readParam(rackFxTypePath(s),0))+1) end
    end
  end
  if ctx.widgets.fxType then ctx.widgets.fxType._onSelect = function(idx) writeParam(rackFxTypePath(ctx.fxSlot), math.max(0, round(idx)-1)); saveState(ctx) end end
  if ctx.widgets.fxMix then ctx.widgets.fxMix._onChange = function(v) writeParam(rackFxMixPath(ctx.fxSlot), v); saveState(ctx) end end
  for p=1,5 do if ctx.widgets["fxParam"..p] then ctx.widgets["fxParam"..p]._onChange = function(v) writeParam(rackFxParamPath(ctx.fxSlot, p - 1), v); saveState(ctx) end end end

  local wf = ctx.widgets.waveform
  if wf then
    if wf.node and wf.node.setInterceptsMouse then wf.node:setInterceptsMouse(true, false) end
    wf._onScrubStart = function() ctx._scrubSlice = nil end
    wf._onScrubSnap = function(pos) local p=clamp(pos,0,0.999); if not ctx._scrubSlice then ctx._scrubSlice=nearestSlice(p); ctx._selectedSlice=ctx._scrubSlice; setSelectedSilently(ctx.widgets.selectedSlice, ctx._selectedSlice); writeParam(NS.."/selected_slice", ctx._selectedSlice) end; writeParam(pathForSlice(ctx._scrubSlice), p); refreshWaveform(ctx); saveState(ctx) end
    wf._onScrubEnd = function() ctx._scrubSlice = nil end
  end
  applyCaptureWindow(ctx); bindInputSurfaces(ctx); syncModePanels(ctx); refreshWaveform(ctx)
end

function M.resized(ctx)
  ensurePoseOverlay(ctx); layoutOutputRow(ctx)
end

function M.update(ctx)
  applyCaptureWindow(ctx)

  if shouldRunInterval(ctx, "paramSync", PARAM_SYNC_INTERVAL) then
    syncParamsFromHost(ctx)
  end

  pollMidi(ctx)

  local frame = (capture and capture.getFrameInfo and capture.getFrameInfo()) or { valid=false }
  local webcamOpen = (capture and capture.isOpen and capture.isOpen()) and true or false

  if ctx.videoCap and webcamOpen and shouldRunInterval(ctx, "segmentIngest", SEGMENT_INGEST_INTERVAL) then
    local seq = tonumber(frame.sequence)
    if seq == nil or ctx._lastSegmentFrameSeq ~= seq then
      local ok = false
      if ctx.videoCap.ingestSegmentedLatest and ctx._segPipeline then
        ok = ctx.videoCap:ingestSegmentedLatest(ctx._segPipeline, {
          gain=ctx.seg.gain,
          useSigmoid=ctx.seg.useSigmoid,
          threshold=ctx.seg.threshold,
          feather=ctx.seg.feather,
          invert=ctx.seg.invert,
          background=0.0,
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
    for i=1,MAX do
      ctx._polyPlaying[i], ctx._polyPos[i] = samplePosition(POLY_PATHS[i], 0)
      ctx._slicePlaying[i], ctx._slicePos[i] = samplePosition(SLICE_PATHS[i], readParam(pathForSlice(i), (i-1)/MAX))
    end
    layoutOutputRow(ctx)
    refreshWaveform(ctx)
  end

  if shouldRunInterval(ctx, "status", STATUS_INTERVAL) then
    setText(ctx.widgets.webcamStatus, string.format("Webcam: %s frame=%s %dx%d seq=%s", webcamOpen and "open" or "closed", frame.valid and "yes" or "no", frame.width or 0, frame.height or 0, tostring(frame.sequence or "--")))
    local clk = clockInfo()
    setText(ctx.widgets.clockStatus, string.format("Clock: sr=%.0f samples=%.0f tempo=%.1f", clk.sampleRate or 0, clk.playTimeSamples or 0, clk.tempo or 0))
    setText(ctx.widgets.rendererStatus, "Renderer: " .. ((type(getUIRendererMode)=="function" and getUIRendererMode()) or "canvas"))

    local capFrames = ctx.videoCap and ctx.videoCap:getFrameCount() or 0
    ctx._lockedW = ctx.videoCap and ctx.videoCap:getLockedWidth() or ctx._lockedW
    ctx._lockedH = ctx.videoCap and ctx.videoCap:getLockedHeight() or ctx._lockedH
    local capMB = (ctx.videoCap and ctx.videoCap:getEstimatedBytes() or 0) / (1024*1024)
    setText(ctx.widgets.captureStatus, string.format("Capture ring: %d segmented frames locked %dx%d %.1fMB", capFrames, ctx._lockedW or 0, ctx._lockedH or 0, capMB))
    local sampleFrames = ctx.video and ctx.video:getFrameCount() or 0
    setText(ctx.widgets.samplerStatus, string.format("Sampler: %d frames %.2fs last commit %s visible=%d", sampleFrames, ctx.video and ctx.video:getDurationSeconds() or 0, ctx._lastVideoCommitOk and "OK" or "--", #(ctx._visible or {})))
    setText(ctx.widgets.midiStatus, string.format("MIDI: %s last=%s", currentMidiLabel() or "none", tostring(ctx._lastMidi or "--")))
    setText(ctx.widgets.fxStatus, string.format("FX%d type=%d mix=%.2f", ctx.fxSlot, round(readParam(rackFxTypePath(ctx.fxSlot),0)), readParam(rackFxMixPath(ctx.fxSlot),0)))
  end
end

function M.cleanup(ctx)
  if ctx then
    if ctx.video then pcall(function() ctx.video:clear() end) end
    if ctx.videoCap then pcall(function() ctx.videoCap:clear() end) end
    saveState(ctx)
  end
  if capture and capture.close then pcall(capture.close) end
  if videoSampler then if videoSampler.remove then pcall(videoSampler.remove, VIDEO_SAMPLER_ID) end; if videoSampler.removeCapture then pcall(videoSampler.removeCapture, VIDEO_CAPTURE_ID) end end
end

return M
