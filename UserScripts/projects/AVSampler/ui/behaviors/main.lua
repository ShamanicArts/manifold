local M = {}

local NS = "/avsampler"
local MAX = 8
local MAX_MAPPINGS = 8
local MAX_CAPTURE_SECONDS = 6.0
local VIDEO_CAPTURE_ID = "av_sampler_segmented_capture"
local VIDEO_SAMPLER_ID = "av_sampler_clip"
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
local function statePath() return join(projectRootDir(), ".av_sampler.state") end

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
    join(scriptsProjects, "AVSamplerLab/selfie_segmentation.onnx"),
    join(scriptsProjects, "MLLab/selfie_segmentation.onnx"),
    join(scriptsProjects, "WebcamViewer/selfie_segmentation.onnx"),
  })
  ctx._posePipeline, ctx._poseModelPath = tryLoad(ctx, {
    join(projectDir, "movenet_singlepose_lightning.onnx"),
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
  if not (vp and vp.node) then return end
  if not ctx._poseOverlay and vp.node.addChild then
    local o = vp.node:addChild("avSamplerPoseOverlay")
    if o then o:setInterceptsMouse(false,false); o:setDisplayList({}); ctx._poseOverlay = o end
  end
  if ctx._poseOverlay and vp.node.getWidth and vp.node.getHeight then
    ctx._poseOverlay:setBounds(0, 0, math.max(1, math.floor(vp.node:getWidth() or 1)), math.max(1, math.floor(vp.node:getHeight() or 1)))
  end
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
    ensurePoseOverlay(ctx)
    local frame = frameInfo or (capture.getFrameInfo and capture.getFrameInfo()) or {}
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
  -- Pose Y is screen-space top→bottom; normal mapping flips it so upward motion increases value.
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
  local node = rootNode:createChild("avs_shader_source")
  if not node then return nil end
  local entry = { id = "__avs_shader_source", node = node }
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
  lines[#lines+1] = "layoutPreset=" .. tostring(ctx._layoutPreset or "deck")
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
      elseif k == "layoutPreset" then ctx._layoutPreset = tostring(v or "deck")
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

local RESIZABLE_PANES = { "deckPane", "outputPane", "previewPane", "inputsPane", "waveformPane", "allParamsPane", "transportPane", "polyPanel", "slicePanel", "shaderPanel", "mappingPanel", "fx1" }

local function rootSize(ctx)
  local w, h = 1280, 720
  if ctx and ctx.root and ctx.root.node and ctx.root.node.getBounds then
    local _, _, bw, bh = ctx.root.node:getBounds()
    w = math.max(320, math.floor(tonumber(bw) or w))
    h = math.max(240, math.floor(tonumber(bh) or h))
  end
  return w, h
end

local function rect(x, y, w, h)
  return { x = math.floor(x or 0), y = math.floor(y or 0), w = math.max(1, math.floor(w or 1)), h = math.max(1, math.floor(h or 1)) }
end

local function layoutPresetRects(ctx, preset, w, h)
  local m, top = 1, 24
  local cw, ch = math.max(1, w - m * 2), math.max(1, h - top - m)
  local p = tostring(preset or "deck")
  local r = { toolbarPane = rect(0, 0, w, 22) }

  if p == "stage" then
    local rightW = math.min(560, math.max(420, math.floor(cw * 0.30)))
    local compW = math.max(220, math.floor(cw * 0.18))
    local leftW = math.max(420, cw - rightW - compW - m * 2)
    local x1, x2, x3 = m, m + leftW + m, m + leftW + m + compW + m
    local lowerH = math.max(180, math.floor(ch * 0.22))
    local waveH = math.max(96, math.floor(ch * 0.12))
    local outputH = math.max(260, ch - lowerH - waveH - m * 2)
    local previewW = math.floor(leftW * 0.34)
    r.outputPane = rect(x1, top, leftW, outputH)
    r.waveformPane = rect(x1, top + outputH + m, leftW, waveH)
    r.previewPane = rect(x1, top + outputH + waveH + m * 2, previewW, lowerH)
    r.inputsPane = rect(x1 + previewW + m, top + outputH + waveH + m * 2, leftW - previewW - m, lowerH)
    r.deckPane = rect(x2, top, compW, ch)
    r.transportPane = rect(x3, top, rightW, 104)
    r.polyPanel = rect(x3, top + 105, rightW, 116)
    r.slicePanel = r.polyPanel
    r.shaderPanel = rect(x3, top + 222, rightW, math.max(190, math.floor(ch * 0.24)))
    r.mappingPanel = rect(x3, r.shaderPanel.y + r.shaderPanel.h + m, rightW, math.max(220, h - (r.shaderPanel.y + r.shaderPanel.h) - 228))
    r.fx1 = rect(x3, h - 226, math.min(472, rightW), 220)
    r.fxStatus = rect(x3 + 10, h - 26, math.max(1, rightW - 20), 18)
  elseif p == "inspector" then
    local topH = math.max(300, math.floor(ch * 0.38))
    local bottomY = top + topH + m
    local rightW = math.min(980, math.max(620, math.floor(cw * 0.45)))
    local leftW = cw - rightW - m
    local x1, x2 = m, m + leftW + m
    local rawStripW = math.max(230, math.floor(leftW * 0.23))
    local previewW = math.max(360, math.floor(leftW * 0.47))
    r.inputsPane = rect(x1, top, rawStripW, topH)
    r.previewPane = rect(x1 + rawStripW + m, top, previewW, topH)
    r.outputPane = rect(x2, top, rightW, topH)
    r.allParamsPane = rect(x1, bottomY, leftW, h - bottomY - m)
    local paramX, paramY = x1 + 8, bottomY + 26
    local paramW = leftW - 16
    r.transportPane = rect(paramX, paramY, paramW, 82)
    r.polyPanel = rect(paramX, paramY + 86, paramW, 96)
    r.slicePanel = r.polyPanel
    r.shaderPanel = rect(paramX, paramY + 186, paramW, math.max(165, math.floor((h - paramY - 186 - 250) * 0.55)))
    r.mappingPanel = rect(paramX, r.shaderPanel.y + r.shaderPanel.h + 4, paramW, math.max(220, h - (r.shaderPanel.y + r.shaderPanel.h) - 12))
    r.waveformPane = rect(x2, bottomY, rightW, math.max(118, math.floor((h - bottomY - m) * 0.18)))
    r.deckPane = rect(x2, r.waveformPane.y + r.waveformPane.h + m, rightW, h - (r.waveformPane.y + r.waveformPane.h) - m)
    r.fx1 = rect(-2000, -2000, 1, 1)
    r.fxStatus = rect(-2000, -2000, 1, 1)
  else
    local deckH = math.max(210, math.min(340, math.floor(ch * 0.25)))
    local y = top + deckH + m
    local rightW = math.min(500, math.max(472, math.floor(cw * 0.22)))
    local midW = math.min(620, math.max(420, math.floor(cw * 0.30)))
    local leftW = math.max(520, cw - rightW - midW - m * 2)
    local x1, x2, x3 = m, m + leftW + m, m + leftW + m + midW + m
    local waveH = math.max(110, math.floor(ch * 0.12))
    local inputH = math.max(180, math.floor(ch * 0.18))
    local stageH = math.max(260, h - y - inputH - waveH - m * 3)
    local outW = math.max(320, math.floor(leftW * 0.58))
    r.deckPane = rect(m, top, cw, deckH)
    r.outputPane = rect(x1, y, outW, stageH)
    r.previewPane = rect(x1 + outW + m, y, leftW - outW - m, stageH)
    r.inputsPane = rect(x1, y + stageH + m, leftW, inputH)
    r.waveformPane = rect(x1, y + stageH + inputH + m * 2, leftW, waveH)
    r.shaderPanel = rect(x2, y, midW, math.max(210, math.floor((h - y - m) * 0.24)))
    r.mappingPanel = rect(x2, r.shaderPanel.y + r.shaderPanel.h + m, midW, h - (r.shaderPanel.y + r.shaderPanel.h) - m)
    r.transportPane = rect(x3, y, rightW, 104)
    r.polyPanel = rect(x3, y + 105, rightW, 116)
    r.slicePanel = r.polyPanel
    r.fx1 = rect(x3, y + 222, math.min(472, rightW), 220)
    r.fxStatus = rect(x3 + 10, y + 446, rightW - 20, 18)
  end
  return r
end

local function setWidgetRect(ctx, id, r)
  local w = ctx and ctx.widgets and ctx.widgets[id]
  if not (w and r) then return end
  setBounds(w, r.x, r.y, r.w, r.h)
end

local function setWidgetVisibility(ctx, id, visible)
  local w = ctx and ctx.widgets and ctx.widgets[id]
  setVisible(w, visible == true)
end

local function syncLayoutButtons(ctx)
  local active = tostring(ctx._layoutPreset or "deck")
  local colours = { layoutDeck = active == "deck", layoutStage = active == "stage", layoutInspector = active == "inspector" }
  for id, on in pairs(colours) do
    local w = ctx.widgets and ctx.widgets[id]
    if w and w.setBg then w:setBg(on and 0xff22d3ee or 0xff1e293b) end
  end
  if ctx.widgets.resizeMode and ctx.widgets.resizeMode.setValue then setValueSilently(ctx.widgets.resizeMode, ctx._resizeMode == true) end
  setWidgetVisibility(ctx, "resizeHelp", ctx._resizeMode == true)
end

local function paneRect(ctx, paneId)
  local widget = ctx and ctx.widgets and ctx.widgets[paneId]
  if widget and widget.node and widget.node.getBounds then
    local x, y, w, h = widget.node:getBounds()
    return rect(x, y, w, h)
  end
  return rect(0, 0, 1, 1)
end

local function setLocal(ctx, id, x, y, w, h)
  local widget = ctx and ctx.widgets and ctx.widgets[id]
  if widget then setBounds(widget, x, y, w, h) end
end

local function setLocalVisible(ctx, id, visible)
  setWidgetVisibility(ctx, id, visible == true)
end

local function layoutPaneChrome(ctx, paneId, r)
  setLocal(ctx, paneId .. "Delete", 0, 0, 22, 18)
  setLocal(ctx, paneId .. "Drag", 22, 0, math.max(1, r.w - 44), 18)
  setLocal(ctx, paneId .. "Title", 7, 1, math.max(1, r.w - 58), 16)
  setLocal(ctx, paneId .. "Resize", math.max(0, r.w - 22), 0, 22, 18)
end

local function layoutDeckContents(ctx, r)
  layoutPaneChrome(ctx, "deckPane", r)
  local x0, y0, w, h = 8, 26, math.max(1, r.w - 16), math.max(1, r.h - 32)
  local gap = 4
  local preset = tostring(ctx._layoutPreset or "deck")

  if preset ~= "deck" then
    for row = 1, 3 do
      setLocalVisible(ctx, "deckLayer" .. row, false)
      setLocalVisible(ctx, "deckLayer" .. row .. "A", false)
      setLocalVisible(ctx, "deckLayer" .. row .. "B", false)
      setLocalVisible(ctx, "deckBlend" .. row, false)
    end
    local cols = r.w < 280 and 2 or 4
    local rows = math.ceil(24 / cols)
    local cellW = math.max(24, math.floor((w - gap * (cols - 1)) / cols))
    local cellH = math.max(24, math.floor((h - gap * (rows - 1)) / rows))
    local n = 0
    for row = 1, 3 do
      for i = 1, 8 do
        n = n + 1
        local id = "deckCell" .. row .. "_" .. i
        local col = (n - 1) % cols
        local rr = math.floor((n - 1) / cols)
        local cx = x0 + col * (cellW + gap)
        local cy = y0 + rr * (cellH + gap)
        setLocal(ctx, id, cx, cy, cellW, cellH)
        setLocal(ctx, id .. "Thumb", 2, 2, math.max(1, cellW - 4), math.max(1, cellH - 17))
        setLocal(ctx, id .. "Label", 4, math.max(2, cellH - 14), math.max(1, cellW - 8), 12)
      end
    end
    setText(ctx.widgets.deckPaneTitle, preset == "stage" and "Composition Column" or "Clip Matrix")
    return
  end

  setText(ctx.widgets.deckPaneTitle, "Deck / Layers")
  for row = 1, 3 do
    setLocalVisible(ctx, "deckLayer" .. row, true)
    setLocalVisible(ctx, "deckLayer" .. row .. "A", true)
    setLocalVisible(ctx, "deckLayer" .. row .. "B", true)
    setLocalVisible(ctx, "deckBlend" .. row, true)
  end
  local rowH = math.max(34, math.floor((h - 2) / 3))
  local headW = math.max(76, math.floor(w * 0.07))
  local cellW = math.max(28, math.floor((w - headW - gap * 8) / 8))
  for row = 1, 3 do
    local y = y0 + (row - 1) * rowH
    setLocal(ctx, "deckLayer" .. row, x0, y + 3, 22, 12)
    setLocal(ctx, "deckLayer" .. row .. "A", x0 + 28, y, 20, 13)
    setLocal(ctx, "deckLayer" .. row .. "B", x0 + 50, y, 20, 13)
    setLocal(ctx, "deckBlend" .. row, x0 + 28, y + 18, math.max(42, headW - 34), 11)
    setLocal(ctx, "deckBlendFill" .. row, 0, 0, math.max(12, math.floor((headW - 34) * (0.38 + row * 0.12))), 11)
    for i = 1, 8 do
      local id = "deckCell" .. row .. "_" .. i
      local cx = x0 + headW + (i - 1) * (cellW + gap)
      local ch = math.max(24, rowH - 8)
      setLocal(ctx, id, cx, y, cellW, ch)
      setLocal(ctx, id .. "Thumb", 2, 2, math.max(1, cellW - 4), math.max(1, ch - 17))
      setLocal(ctx, id .. "Label", 4, math.max(2, ch - 14), math.max(1, cellW - 8), 12)
    end
  end
end

local function layoutOutputContents(ctx, paneId, viewportId, r)
  layoutPaneChrome(ctx, paneId, r)
  setLocal(ctx, viewportId, 6, 24, math.max(1, r.w - 12), math.max(1, r.h - 30))
end

local function layoutPreviewContents(ctx, r)
  layoutPaneChrome(ctx, "previewPane", r)
  setLocal(ctx, "previewStage", 6, 24, math.max(1, r.w - 12), math.max(1, r.h - 30))
  setLocal(ctx, "previewStageTag", 5, 4, math.max(1, r.w - 22), 12)
end

local function layoutInputsContents(ctx, r)
  layoutPaneChrome(ctx, "inputsPane", r)
  local pad, y = 6, 24
  local preset = tostring(ctx._layoutPreset or "deck")
  local compact = r.h < 210
  setLocalVisible(ctx, "rawTitle", false); setLocalVisible(ctx, "segTitle", false); setLocalVisible(ctx, "poseTitle", false)
  setLocalVisible(ctx, "poseStatus", not compact and preset ~= "inspector")
  setLocalVisible(ctx, "captureStatus", not compact and preset ~= "inspector")
  setLocalVisible(ctx, "samplerStatus", not compact and preset ~= "inspector")
  local gap = 6

  if preset == "inspector" then
    local controlsH = 24
    local viewH = math.max(42, math.floor((r.h - y - controlsH - gap * 4) / 3))
    setLocal(ctx, "liveViewport", pad, y, math.max(1, r.w - pad * 2), viewH)
    setLocal(ctx, "segViewport", pad, y + viewH + gap, math.max(1, r.w - pad * 2), viewH)
    setLocal(ctx, "poseViewport", pad, y + (viewH + gap) * 2, math.max(1, r.w - pad * 2), viewH)
    local cy = y + (viewH + gap) * 3 + 2
    local sw = math.max(32, math.floor((r.w - pad * 2 - gap * 3) / 4))
    setLocal(ctx, "segGain", pad, cy, sw, 17)
    setLocal(ctx, "segThreshold", pad + (sw + gap), cy, sw, 17)
    setLocal(ctx, "segFeather", pad + (sw + gap) * 2, cy, sw, 17)
    setLocal(ctx, "poseConf", pad + (sw + gap) * 3, cy, math.max(1, r.w - pad * 2 - (sw + gap) * 3), 17)
    setLocal(ctx, "segInvert", -2000, -2000, 1, 1)
    setLocal(ctx, "showSkeleton", -2000, -2000, 1, 1)
    setLocal(ctx, "loadModels", -2000, -2000, 1, 1)
    ensurePoseOverlay(ctx)
    return
  end

  local statusH = compact and 0 or 46
  local controlsH = compact and 24 or 42
  local viewH = math.max(36, r.h - y - controlsH - statusH - 8)
  local cellW = math.max(30, math.floor((r.w - pad * 2 - gap * 2) / 3))
  setLocal(ctx, "liveViewport", pad, y, cellW, viewH)
  setLocal(ctx, "segViewport", pad + cellW + gap, y, cellW, viewH)
  setLocal(ctx, "poseViewport", pad + (cellW + gap) * 2, y, math.max(1, r.w - pad * 2 - (cellW + gap) * 2), viewH)
  local cy = y + viewH + 6
  local sw = math.max(52, math.floor((r.w - pad * 2 - gap * 6) / 7))
  setLocal(ctx, "segGain", pad, cy, sw, 17)
  setLocal(ctx, "segThreshold", pad + (sw + gap), cy, sw, 17)
  setLocal(ctx, "segFeather", pad + (sw + gap) * 2, cy, sw, 17)
  setLocal(ctx, "segInvert", pad + (sw + gap) * 3, cy, sw, 18)
  setLocal(ctx, "poseConf", pad + (sw + gap) * 4, cy, sw, 17)
  setLocal(ctx, "showSkeleton", pad + (sw + gap) * 5, cy, sw, 18)
  setLocal(ctx, "loadModels", pad + (sw + gap) * 6, cy, math.max(28, r.w - pad * 2 - (sw + gap) * 6), 18)
  if not compact then
    setLocal(ctx, "poseStatus", pad, cy + 23, r.w - pad * 2, 13)
    setLocal(ctx, "captureStatus", pad, cy + 37, r.w - pad * 2, 13)
    setLocal(ctx, "samplerStatus", pad, cy + 51, r.w - pad * 2, 13)
  end
  ensurePoseOverlay(ctx)
end

local function layoutWaveformContents(ctx, r)
  layoutPaneChrome(ctx, "waveformPane", r)
  setLocal(ctx, "waveform", 6, 26, math.max(1, r.w - 12), math.max(34, r.h - 48))
  setLocal(ctx, "waveformStatus", 8, math.max(26, r.h - 18), math.max(1, r.w - 16), 14)
end

local function layoutShaderContents(ctx, r)
  layoutPaneChrome(ctx, "shaderPanel", r)
  local pad, y, gap = 8, 25, 6
  local ddW = math.max(72, math.floor((r.w - pad * 2 - gap * 3) / 4))
  setLocal(ctx, "sourceSelect", pad, y, ddW, 18)
  setLocal(ctx, "shaderLayer", pad + ddW + gap, y, 48, 18)
  setLocal(ctx, "shaderEnabled", pad + ddW + gap + 54, y, 50, 18)
  setLocal(ctx, "effectSelect", pad + ddW + gap + 110, y, math.max(70, r.w - (pad + ddW + gap + 110) - pad), 18)
  local cols = r.w > 520 and 4 or (r.w > 360 and 3 or 2)
  local colW = math.floor((r.w - pad * 2 - gap * (cols - 1)) / cols)
  for i = 1, 9 do
    local cx = pad + ((i - 1) % cols) * (colW + gap)
    local cy = 52 + math.floor((i - 1) / cols) * 23
    setLocal(ctx, "shaderParam" .. i, cx, cy, colW, 18)
  end
  setLocal(ctx, "shaderStatus", pad, math.max(70, r.h - 18), math.max(1, r.w - pad * 2), 14)
end

local function layoutMappingContents(ctx, r)
  layoutPaneChrome(ctx, "mappingPanel", r)
  setLocal(ctx, "mappingHelp", 8, 23, math.max(1, r.w - 16), 14)
  local pad, y0, rowH = 8, 42, math.max(19, math.floor((r.h - 72) / MAX_MAPPINGS))
  local available = math.max(260, r.w - pad * 2)
  local enableW, minW, maxW, invW = 46, 54, 54, 54
  local sourceW = math.max(82, math.floor(available * 0.25))
  local targetW = math.max(82, available - 22 - enableW - sourceW - minW - maxW - invW - 18)
  for i = 1, MAX_MAPPINGS do
    local y = y0 + (i - 1) * rowH
    setLocal(ctx, "track" .. i .. "Label", pad, y + 2, 18, 14)
    setLocal(ctx, "mapping" .. i .. "Enable", pad + 20, y, enableW, 17)
    setLocal(ctx, "mapping" .. i .. "Source", pad + 20 + enableW + 4, y, sourceW, 17)
    setLocal(ctx, "mapping" .. i .. "Target", pad + 20 + enableW + sourceW + 8, y, targetW, 17)
    setLocal(ctx, "mapping" .. i .. "Min", r.w - pad - invW - maxW - minW - 8, y, minW, 16)
    setLocal(ctx, "mapping" .. i .. "Max", r.w - pad - invW - maxW - 4, y, maxW, 16)
    setLocal(ctx, "mapping" .. i .. "Invert", r.w - pad - invW, y, invW, 17)
  end
  setLocal(ctx, "mappingStatus", pad, math.max(42, r.h - 18), math.max(1, r.w - pad * 2), 14)
end

local function layoutTransportContents(ctx, r)
  layoutPaneChrome(ctx, "transportPane", r)
  local pad, gap = 8, 6
  local sw = math.floor((r.w - pad * 2 - gap * 2) / 3)
  setLocal(ctx, "speed", pad, 25, sw, 17)
  setLocal(ctx, "output", pad + sw + gap, 25, sw, 17)
  setLocal(ctx, "rootNote", pad + (sw + gap) * 2, 25, math.max(1, r.w - pad * 2 - (sw + gap) * 2), 17)
  setLocal(ctx, "midiInput", pad, 50, math.max(80, r.w - pad * 2 - 54), 18)
  setLocal(ctx, "midiRefresh", r.w - pad - 48, 50, 48, 18)
  setLocal(ctx, "midiStatus", pad, 73, math.max(1, r.w - pad * 2), 13)
end

local function layoutPolyContents(ctx, r)
  layoutPaneChrome(ctx, "polyPanel", r); layoutPaneChrome(ctx, "slicePanel", r)
  local pad, gap = 8, 6
  local sw = math.floor((r.w - pad * 2 - gap * 2) / 3)
  setLocal(ctx, "pitchTracking", pad, 25, sw, 18)
  setLocal(ctx, "voiceCount", pad + sw + gap, 25, sw, 17)
  setLocal(ctx, "playStart", pad + (sw + gap) * 2, 25, math.max(1, r.w - pad * 2 - (sw + gap) * 2), 17)
  setLocal(ctx, "loopStart", pad, 50, sw, 17)
  setLocal(ctx, "loopEnd", pad + sw + gap, 50, sw, 17)
  setLocal(ctx, "crossfade", pad + (sw + gap) * 2, 50, math.max(1, r.w - pad * 2 - (sw + gap) * 2), 17)
  setLocal(ctx, "oneShot", pad, 74, sw, 18)
  setLocal(ctx, "selectedSlice", pad, 25, math.max(86, sw), 18)
  setLocal(ctx, "auditionSelected", pad + math.max(86, sw) + gap, 25, 76, 18)
  setLocal(ctx, "sliceHelp", pad, 50, math.max(1, r.w - pad * 2), 42)
end

local function layoutFxContents(ctx, r)
  setLocal(ctx, "fx1", r.x, r.y, r.w, r.h)
  layoutPaneChrome(ctx, "fx1", r)
end

local function layoutPaneContents(ctx, rects)
  local preset = tostring(ctx._layoutPreset or "deck")
  local r = {}
  for id, base in pairs(rects or {}) do r[id] = (ctx._customPaneRects and ctx._customPaneRects[id]) or base end
  if r.allParamsPane then layoutPaneChrome(ctx, "allParamsPane", r.allParamsPane) end
  if r.deckPane then layoutDeckContents(ctx, r.deckPane) end
  if r.outputPane then layoutOutputContents(ctx, "outputPane", "outputViewport", r.outputPane) end
  if r.previewPane then layoutPreviewContents(ctx, r.previewPane) end
  if r.inputsPane then layoutInputsContents(ctx, r.inputsPane) end
  if r.waveformPane then layoutWaveformContents(ctx, r.waveformPane) end
  if r.shaderPanel then layoutShaderContents(ctx, r.shaderPanel) end
  if r.mappingPanel then layoutMappingContents(ctx, r.mappingPanel) end
  if r.transportPane then layoutTransportContents(ctx, r.transportPane) end
  if r.polyPanel then layoutPolyContents(ctx, r.polyPanel) end
  if r.fx1 then layoutFxContents(ctx, r.fx1) end
  setWidgetVisibility(ctx, "previewPane", true)
  setWidgetVisibility(ctx, "deckPane", true)
  setWidgetVisibility(ctx, "inputsPane", true)
  setWidgetVisibility(ctx, "shaderPanel", true)
  setWidgetVisibility(ctx, "mappingPanel", true)
  setWidgetVisibility(ctx, "waveformPane", true)
  setWidgetVisibility(ctx, "transportPane", true)
  setWidgetVisibility(ctx, "allParamsPane", preset == "inspector")
  setWidgetVisibility(ctx, "fx1", preset ~= "inspector")
  setWidgetVisibility(ctx, "fxStatus", preset ~= "inspector")
end

local function applyAppLayout(ctx)
  local w, h = rootSize(ctx)
  local rects = layoutPresetRects(ctx, ctx._layoutPreset or "deck", w, h)
  ctx._paneRects = ctx._paneRects or {}
  for id, r in pairs(rects) do
    local custom = ctx._customPaneRects and ctx._customPaneRects[id]
    setWidgetRect(ctx, id, custom or r)
  end
  layoutPaneContents(ctx, rects)
  for _, id in ipairs(RESIZABLE_PANES) do
    setWidgetVisibility(ctx, id .. "Resize", ctx._resizeMode == true)
  end
  syncLayoutButtons(ctx)
end

local function setLayoutPreset(ctx, preset)
  ctx._layoutPreset = tostring(preset or "deck")
  ctx._customPaneRects = nil
  applyAppLayout(ctx)
  refreshWaveform(ctx)
  layoutOutputRow(ctx)
  saveState(ctx)
end

local function clampPaneRect(ctx, r)
  local w, h = rootSize(ctx)
  local m = 6
  r.w = math.max(96, math.min(math.floor(r.w or 1), w - m * 2))
  r.h = math.max(48, math.min(math.floor(r.h or 1), h - m * 2))
  r.x = math.max(m, math.min(math.floor(r.x or m), w - r.w - m))
  r.y = math.max(58, math.min(math.floor(r.y or 58), h - r.h - m))
  return r
end

local function paneBounds(ctx, paneId)
  local w = ctx and ctx.widgets and ctx.widgets[paneId]
  if w and w.node and w.node.getBounds then
    local x, y, ww, hh = w.node:getBounds()
    return rect(x, y, ww, hh)
  end
  local all = layoutPresetRects(ctx, ctx._layoutPreset or "deck", rootSize(ctx))
  return all[paneId] or rect(0,0,100,100)
end

local function installPaneResizeHandlers(ctx)
  ctx._resizeMode = ctx._resizeMode == true
  for _, paneId in ipairs(RESIZABLE_PANES) do
    local drag = ctx.widgets and ctx.widgets[paneId .. "Drag"]
    local resize = ctx.widgets and ctx.widgets[paneId .. "Resize"]
    if drag and drag.node and drag.node.setOnMouseDown then
      local startRect = nil
      drag.node:setInterceptsMouse(true, true)
      drag.node:setOnMouseDown(function()
        if not ctx._resizeMode then return end
        startRect = paneBounds(ctx, paneId)
      end)
      drag.node:setOnMouseDrag(function(_, _, dx, dy)
        if not ctx._resizeMode or not startRect then return end
        ctx._customPaneRects = ctx._customPaneRects or {}
        local nextRect = clampPaneRect(ctx, rect(startRect.x + (tonumber(dx) or 0), startRect.y + (tonumber(dy) or 0), startRect.w, startRect.h))
        ctx._customPaneRects[paneId] = nextRect
        applyAppLayout(ctx)
        layoutOutputRow(ctx)
      end)
      drag.node:setOnMouseUp(function() startRect = nil end)
    end
    if resize and resize.node and resize.node.setOnMouseDown then
      local startRect = nil
      resize.node:setInterceptsMouse(true, true)
      resize.node:setOnMouseDown(function()
        if not ctx._resizeMode then return end
        startRect = paneBounds(ctx, paneId)
      end)
      resize.node:setOnMouseDrag(function(_, _, dx, dy)
        if not ctx._resizeMode or not startRect then return end
        ctx._customPaneRects = ctx._customPaneRects or {}
        local nextRect = clampPaneRect(ctx, rect(startRect.x, startRect.y, startRect.w + (tonumber(dx) or 0), startRect.h + (tonumber(dy) or 0)))
        ctx._customPaneRects[paneId] = nextRect
        applyAppLayout(ctx)
        layoutOutputRow(ctx)
      end)
      resize.node:setOnMouseUp(function() startRect = nil end)
    end
  end
end

function M.init(ctx)
  _G.__avsdCtx = ctx
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
  ctx._layoutPreset = ctx._layoutPreset or "deck"
  ctx._resizeMode = false

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
  ctx.widgets.layoutDeck._onClick = function() setLayoutPreset(ctx, "deck") end
  ctx.widgets.layoutStage._onClick = function() setLayoutPreset(ctx, "stage") end
  ctx.widgets.layoutInspector._onClick = function() setLayoutPreset(ctx, "inspector") end
  ctx.widgets.resetLayout._onClick = function() ctx._customPaneRects = nil; applyAppLayout(ctx); saveState(ctx) end
  ctx.widgets.resizeMode._onChange = function(v) ctx._resizeMode = v == true; applyAppLayout(ctx) end
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

  _G.__avsdExportContract = function(path)
    local function bool01(v)
      return v == true or tonumber(v) == 1
    end
    local function num(v)
      return tonumber(v) or 0
    end
    local function copyNumArray(values)
      local out = {}
      for i = 1, #(values or {}) do out[i] = num(values[i]) end
      return out
    end
    local function cleanSourceSpec(spec)
      if type(spec) ~= "table" then return nil end
      local params = nil
      if type(spec.params) == "table" then
        params = {}
        local keys = {}
        for k in pairs(spec.params) do keys[#keys + 1] = tostring(k) end
        table.sort(keys)
        for i = 1, #keys do
          local key = keys[i]
          params[key] = num(spec.params[key])
        end
      end
      return {
        kind = spec.kind,
        sourceIndex = spec.sourceIndex,
        sourceId = spec.sourceId,
        mlType = spec.mlType,
        params = params,
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

    local contract = {
      projectPath = (type(getCurrentScriptPath) == "function" and getCurrentScriptPath()) or "",
      rendererMode = (type(getUIRendererMode) == "function" and getUIRendererMode()) or "unknown",
      layoutPreset = ctx._layoutPreset,
      selectedSlice = ctx._selectedSlice,
      captureMode = ctx.captureMode,
      captureRecording = bool01(ctx.captureRecording),
      poseConf = num(ctx.poseConf),
      showSkeleton = bool01(ctx.showSkeleton),
      seg = {
        gain = num(ctx.seg and ctx.seg.gain),
        threshold = num(ctx.seg and ctx.seg.threshold),
        feather = num(ctx.seg and ctx.seg.feather),
        invert = bool01(ctx.seg and ctx.seg.invert),
      },
      sampler = {
        frameCount = ctx.video and ctx.video.getFrameCount and ctx.video:getFrameCount() or 0,
        durationSeconds = ctx.video and ctx.video.getDurationSeconds and ctx.video:getDurationSeconds() or 0,
      },
      capture = {
        frameCount = ctx.videoCap and ctx.videoCap.getFrameCount and ctx.videoCap:getFrameCount() or 0,
        lockedWidth = ctx.videoCap and ctx.videoCap.getLockedWidth and ctx.videoCap:getLockedWidth() or 0,
        lockedHeight = ctx.videoCap and ctx.videoCap.getLockedHeight and ctx.videoCap:getLockedHeight() or 0,
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
        shaderSource = round(readParam(NS .. "/shader/source", 1)),
      },
      slices = {},
      shader = {
        sourceIndex = ctx.shader and ctx.shader.sourceIndex or 1,
        activeLayer = ctx.shader and ctx.shader.activeLayer or 1,
        layers = {},
      },
      mappings = {},
      sources = {},
      effects = {},
      columns = {},
      compositor = nil,
    }

    for i = 1, MAX do
      contract.slices[i] = { start = num(readParam(pathForSlice(i), (i - 1) / MAX)) }
    end
    for i = 1, #(ctx.shader and ctx.shader.layers or {}) do
      local layer = ctx.shader.layers[i]
      contract.shader.layers[i] = {
        enabled = bool01(layer.enabled),
        effectIndex = layer.effectIndex,
        params = copyNumArray(layer.params),
      }
    end
    for i = 1, #(ctx.mappings or {}) do
      local mapping = ctx.mappings[i]
      contract.mappings[i] = {
        enabled = bool01(mapping.enabled),
        source = mapping.source,
        target = mapping.target,
        min = num(mapping.min),
        max = num(mapping.max),
        invert = bool01(mapping.invert),
      }
    end
    for i = 1, #(ctx.sources or {}) do
      local source = ctx.sources[i] or {}
      contract.sources[i] = {
        id = source.id,
        name = source.name,
        kind = source.kind,
      }
    end
    for i = 1, #(ctx.effects or {}) do
      local effect = ctx.effects[i] or {}
      contract.effects[i] = effect.name or effect.id or tostring(i)
    end
    if type(ctx._colData) == "table" then
      for col = 1, #ctx._colData do
        local data = ctx._colData[col] or {}
        local fxRows = {}
        for row = 1, #(data.fx or {}) do
          local fx = data.fx[row] or {}
          fxRows[row] = {
            effectIndex = fx.effectIndex,
            enabled = bool01(fx.enabled),
            params = copyNumArray(fx.params),
          }
        end
        contract.columns[col] = {
          id = data.id,
          source = cleanSourceSpec(type(sourceSpecForColumn) == "function" and sourceSpecForColumn(ctx, col) or data.sourceSpec),
        }
      end
    end

    local json = encode(contract)
    if type(path) == "string" and path ~= "" and type(writeTextFile) == "function" then
      writeTextFile(path, json)
      return path
    end
    return json
  end

  _G.__avsdAction = function(action, a, b, c, d)
    local function bool01(v)
      return v == true or tonumber(v) == 1
    end
    local function num(v)
      return tonumber(v) or 0
    end
    action = tostring(action or "")
    if action == "set_layout_preset" then
      if type(setLayoutPreset) == "function" then setLayoutPreset(ctx, tostring(a or "deck")) end
      return true
    elseif action == "set_selected_slice" then
      if ctx.widgets.selectedSlice and ctx.widgets.selectedSlice._onSelect then ctx.widgets.selectedSlice._onSelect(round(a)) end
      return ctx._selectedSlice or 1
    elseif action == "set_source_select" then
      if ctx.widgets.sourceSelect and ctx.widgets.sourceSelect._onSelect then ctx.widgets.sourceSelect._onSelect(round(a)) end
      return ctx.shader and ctx.shader.sourceIndex or 1
    elseif action == "set_shader_layer" then
      if ctx.widgets.shaderLayer and ctx.widgets.shaderLayer._onSelect then ctx.widgets.shaderLayer._onSelect(round(a)) end
      return ctx.shader and ctx.shader.activeLayer or 1
    elseif action == "set_shader_enabled" then
      if ctx.widgets.shaderEnabled and ctx.widgets.shaderEnabled._onChange then ctx.widgets.shaderEnabled._onChange(bool01(a)) end
      return true
    elseif action == "set_effect_select" then
      if ctx.widgets.effectSelect and ctx.widgets.effectSelect._onSelect then ctx.widgets.effectSelect._onSelect(round(a)) end
      return true
    elseif action == "set_shader_param" then
      local widget = ctx.widgets["shaderParam" .. tostring(round(a))]
      if widget and widget._onChange then widget._onChange(num(b)) end
      return true
    elseif action == "set_mapping_field" then
      local track = round(a)
      local field = tostring(b or "")
      if field == "enable" and ctx.widgets["mapping" .. track .. "Enable"] and ctx.widgets["mapping" .. track .. "Enable"]._onChange then
        ctx.widgets["mapping" .. track .. "Enable"]._onChange(bool01(c))
      elseif field == "source" and ctx.widgets["mapping" .. track .. "Source"] and ctx.widgets["mapping" .. track .. "Source"]._onSelect then
        ctx.widgets["mapping" .. track .. "Source"]._onSelect(round(c))
      elseif field == "target" and ctx.widgets["mapping" .. track .. "Target"] and ctx.widgets["mapping" .. track .. "Target"]._onSelect then
        ctx.widgets["mapping" .. track .. "Target"]._onSelect(round(c))
      elseif field == "min" and ctx.widgets["mapping" .. track .. "Min"] and ctx.widgets["mapping" .. track .. "Min"]._onChange then
        ctx.widgets["mapping" .. track .. "Min"]._onChange(num(c))
      elseif field == "max" and ctx.widgets["mapping" .. track .. "Max"] and ctx.widgets["mapping" .. track .. "Max"]._onChange then
        ctx.widgets["mapping" .. track .. "Max"]._onChange(num(c))
      elseif field == "invert" and ctx.widgets["mapping" .. track .. "Invert"] and ctx.widgets["mapping" .. track .. "Invert"]._onChange then
        ctx.widgets["mapping" .. track .. "Invert"]._onChange(bool01(c))
      end
      return true
    end
    return false
  end

  installPaneResizeHandlers(ctx)
  applyCaptureWindow(ctx); bindInputSurfaces(ctx); syncModePanels(ctx); applyAppLayout(ctx); refreshWaveform(ctx)
end

function M.resized(ctx)
  applyAppLayout(ctx); ensurePoseOverlay(ctx); layoutOutputRow(ctx)
end

function M.update(ctx)
  _G.__avsdCtx = ctx
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
  if _G.__avsdCtx == ctx then _G.__avsdCtx = nil end
  if ctx then
    if ctx.video then pcall(function() ctx.video:clear() end) end
    if ctx.videoCap then pcall(function() ctx.videoCap:clear() end) end
    saveState(ctx)
  end
  if capture and capture.close then pcall(capture.close) end
  if videoSampler then if videoSampler.remove then pcall(videoSampler.remove, VIDEO_SAMPLER_ID) end; if videoSampler.removeCapture then pcall(videoSampler.removeCapture, VIDEO_CAPTURE_ID) end end
  if _G.__avsdExportContract then _G.__avsdExportContract = nil end
  if _G.__avsdAction then _G.__avsdAction = nil end
end

return M
