local M = {}

local NS = "/video_slice_rack_lab"
local MAX_SLICES = 8
local SAMPLE_PATHS = {}
for i = 1, MAX_SLICES do SAMPLE_PATHS[i] = NS .. "/slice/" .. tostring(i) .. "/sample" end

local CAPTURE_SECONDS_PATH = NS .. "/capture_seconds"
local CAPTURE_TRIGGER_PATH = NS .. "/capture_trigger"
local STOP_TRIGGER_PATH = NS .. "/stop_trigger"
local ROOT_NOTE_PATH = NS .. "/root_note"
local SELECTED_SLICE_PATH = NS .. "/selected_slice"
local VIDEO_CAPTURE_ID = "video_slice_rack_lab_capture"
local VIDEO_SAMPLER_ID = "video_slice_rack_lab_clip"
local MAX_CAPTURE_SECONDS = 6.0
local MAJOR_OFFSETS = { 0, 2, 4, 5, 7, 9, 11, 12 }
local SLICE_COLOURS = {
  0xffff5c8a,
  0xff60a5fa,
  0xff86efac,
  0xffffcc66,
  0xffc084fc,
  0xff22d3ee,
  0xfffb7185,
  0xffa3e635,
}

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(v)
  return math.floor((tonumber(v) or 0) + 0.5)
end

local function setText(widget, text)
  if widget and widget.setText then widget:setText(tostring(text or "")) end
end

local function setLabel(widget, text)
  if widget and widget.setLabel then widget:setLabel(tostring(text or "")) end
end

local function setBounds(widget, x, y, w, h)
  x, y, w, h = math.floor(x or 0), math.floor(y or 0), math.floor(w or 0), math.floor(h or 0)
  if widget and widget.setBounds then
    widget:setBounds(x, y, w, h)
  elseif widget and widget.node and widget.node.setBounds then
    widget.node:setBounds(x, y, w, h)
  end
end

local function setValueSilently(widget, value)
  if not (widget and widget.setValue) then return end
  local onChange = widget._onChange
  widget._onChange = nil
  widget:setValue(value)
  widget._onChange = onChange
end

local function setSelectedSilently(widget, index)
  if not (widget and widget.setSelected) then return end
  local onSelect = widget._onSelect
  widget._onSelect = nil
  widget:setSelected(index or 1)
  widget._onSelect = onSelect
end

local function setOptions(widget, options)
  if widget and widget.setOptions then widget:setOptions(options or {}) end
end

local function readParam(path, fallback)
  if type(getParam) == "function" then
    local ok, value = pcall(getParam, path)
    if ok and value ~= nil then return value end
  end
  return fallback
end

local function writeParam(path, value)
  local n
  if type(value) == "boolean" then n = value and 1 or 0 else n = tonumber(value) or 0 end
  if type(setParam) == "function" then return setParam(path, n) end
  return false
end

local function bump(path)
  writeParam(path, (readParam(path, 0) + 1) % 1000000)
end

local function clockInfo()
  if type(getAudioClockInfo) == "function" then
    local ok, info = pcall(getAudioClockInfo)
    if ok and type(info) == "table" then return info end
  end
  return { sampleRate = 44100, playTimeSamples = 0, tempo = 120, samplesPerBar = 88200 }
end

local function sliceStartPath(index)
  return NS .. "/slice/" .. tostring(index) .. "/start"
end

local function sliceTriggerPath(index)
  return NS .. "/slice/" .. tostring(index) .. "/trigger"
end

local function sliceVelocityPath(index)
  return NS .. "/slice/" .. tostring(index) .. "/velocity"
end

local function getSliceStart(index)
  return clamp(readParam(sliceStartPath(index), (index - 1) / MAX_SLICES), 0, 0.999)
end

local function getSliceStarts()
  local starts = {}
  for i = 1, MAX_SLICES do starts[i] = getSliceStart(i) end
  return starts
end

local function selectedSlice(ctx)
  local n = (ctx and ctx._selectedSlice) or readParam(SELECTED_SLICE_PATH, 1)
  return math.max(1, math.min(MAX_SLICES, round(n)))
end

local function setSelectedSlice(ctx, index)
  index = math.max(1, math.min(MAX_SLICES, round(index)))
  ctx._selectedSlice = index
  writeParam(SELECTED_SLICE_PATH, index)
  setSelectedSilently(ctx.widgets and ctx.widgets.selectedSlice, index)
end

local function noteForSlice(rootNote, sliceIndex)
  return round(rootNote) + (MAJOR_OFFSETS[sliceIndex] or 0)
end

local function noteToSlice(note, rootNote)
  local n = round(note)
  local root = round(rootNote)
  for i = 1, #MAJOR_OFFSETS do
    if n == root + MAJOR_OFFSETS[i] then return i end
  end
  return nil
end

local function sliceEndFor(index, starts)
  starts = starts or getSliceStarts()
  local start = clamp(starts[index] or 0, 0, 0.999)
  local best = 1.0
  for i = 1, MAX_SLICES do
    local other = clamp(starts[i] or 0, 0, 1)
    if other > start + 0.002 and other < best then best = other end
  end
  return clamp(best, start + 0.002, 1.0)
end

local function nearestSliceTo(pos, starts)
  starts = starts or getSliceStarts()
  local best, bestDist = 1, math.huge
  for i = 1, MAX_SLICES do
    local d = math.abs((starts[i] or 0) - pos)
    if d < bestDist then best, bestDist = i, d end
  end
  return best
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
    local ok, result = pcall(capture.listDevices)
    if ok and type(result) == "table" then devices = result end
  end
  ctx._devices = devices
  local labels = {}
  for i = 1, #devices do
    labels[i] = tostring(devices[i].label or devices[i].name or devices[i].path or ("Device " .. tostring(devices[i].index or i - 1)))
  end
  if #labels == 0 then labels[1] = "Device 0" end
  setOptions(ctx.widgets and ctx.widgets.deviceSelect, labels)
  setSelectedSilently(ctx.widgets and ctx.widgets.deviceSelect, 1)
end

local function currentMidiLabel()
  if Midi and Midi.currentInputDeviceName then
    local name = Midi.currentInputDeviceName()
    if type(name) == "string" and name ~= "" then return name end
  end
  return nil
end

local function refreshMidi(ctx)
  local devices = (Midi and Midi.inputDevices and Midi.inputDevices()) or {}
  ctx._midiDevices = devices
  local options = { "None (Disabled)" }
  for i = 1, #devices do options[#options + 1] = tostring(devices[i]) end
  setOptions(ctx.widgets and ctx.widgets.midiInput, options)

  local active = currentMidiLabel()
  local selected = 1
  if active then for i = 1, #options do if options[i] == active then selected = i end end end
  setSelectedSilently(ctx.widgets and ctx.widgets.midiInput, selected)
  local openState = (Midi and Midi.isInputOpen and Midi.isInputOpen()) and "open" or "closed"
  setText(ctx.widgets and ctx.widgets.midiStatus, active and ("MIDI: " .. active .. " (" .. openState .. ") — major-scale notes trigger slices") or ("MIDI: none selected (" .. openState .. ")"))
end

local function openPreferredMidi(ctx)
  local devices = ctx._midiDevices or {}
  if not (Midi and Midi.openInput) or #devices == 0 then refreshMidi(ctx); return end
  local chosen = 1
  for i = 1, #devices do if not tostring(devices[i]):lower():find("through", 1, true) then chosen = i; break end end
  Midi.openInput(chosen - 1)
  refreshMidi(ctx)
end

local function bindLiveSurface(ctx)
  local vp = ctx.widgets and ctx.widgets.liveViewport
  if vp and vp.node and vp.node.setCustomSurface then
    vp.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "live" })
  end
end

local function sliceColour(index)
  return SLICE_COLOURS[((index - 1) % #SLICE_COLOURS) + 1] or 0xffffffff
end

local function bindSliceSurface(ctx, sliceIndex, position)
  local vp = ctx.widgets and ctx.widgets["sliceViewport" .. tostring(sliceIndex)]
  if not (vp and vp.node and vp.node.setCustomSurface and ctx.video) then return end
  vp.node:setCustomSurface("video_input", {
    version = 2,
    fitMode = "contain",
    source = "sampler",
    samplerId = ctx.video:getId(),
    position = clamp(position or 0, 0, 1),
  })
end

local function applySliceCellColour(ctx, sliceIndex, selected)
  local colour = sliceColour(sliceIndex)
  local vp = ctx.widgets and ctx.widgets["sliceViewport" .. tostring(sliceIndex)]
  if vp and vp.setStyle then
    vp:setStyle({ border = colour, borderWidth = selected and 3 or 1, radius = 5 })
  end
  local label = ctx.widgets and ctx.widgets["sliceOverlay" .. tostring(sliceIndex)]
  if label and label.setColour then label:setColour(colour) end
end

local function hideSliceCell(ctx, sliceIndex)
  setBounds(ctx.widgets and ctx.widgets["sliceViewport" .. tostring(sliceIndex)], 0, 0, 0, 0)
  setBounds(ctx.widgets and ctx.widgets["sliceOverlay" .. tostring(sliceIndex)], 0, 0, 0, 0)
  setText(ctx.widgets and ctx.widgets["sliceOverlay" .. tostring(sliceIndex)], "")
end

local function gridForCount(count)
  if count <= 1 then return 1, 1 end
  if count == 2 then return 2, 1 end
  if count == 3 then return 3, 1 end
  if count <= 4 then return 2, 2 end
  if count <= 6 then return 3, 2 end
  return 4, 2
end

local function collectVisibleSlices(ctx)
  local out = {}
  for i = 1, MAX_SLICES do
    if ctx._slicePlaying and ctx._slicePlaying[i] then out[#out + 1] = i end
  end
  if #out == 0 then out[1] = selectedSlice(ctx) end
  return out
end

local function layoutSliceGrid(ctx)
  local host = ctx.widgets and ctx.widgets.sampleViewport
  local w, h = 600, 276
  if host and host.node then
    if host.node.getWidth then w = tonumber(host.node:getWidth()) or w end
    if host.node.getHeight then h = tonumber(host.node:getHeight()) or h end
  end

  local visible = collectVisibleSlices(ctx)
  ctx._visibleSlices = visible
  local cols, rows = gridForCount(#visible)
  local inset, gap = 6, 6
  local cellW = math.floor((w - inset * 2 - gap * (cols - 1)) / cols)
  local cellH = math.floor((h - inset * 2 - gap * (rows - 1)) / rows)

  local used = {}
  for slot = 1, #visible do
    local sliceIndex = visible[slot]
    used[sliceIndex] = true
    local col = (slot - 1) % cols
    local row = math.floor((slot - 1) / cols)
    local x = inset + col * (cellW + gap)
    local y = inset + row * (cellH + gap)
    setBounds(ctx.widgets and ctx.widgets["sliceViewport" .. tostring(sliceIndex)], x, y, cellW, cellH)
    setBounds(ctx.widgets and ctx.widgets["sliceOverlay" .. tostring(sliceIndex)], x + 8, y + 8, math.max(0, cellW - 16), 18)
    applySliceCellColour(ctx, sliceIndex, sliceIndex == selectedSlice(ctx))
  end

  for i = 1, MAX_SLICES do
    if not used[i] then hideSliceCell(ctx, i) end
  end
end

local function applyCaptureWindow(ctx)
  if not ctx.videoCap then return end
  local seconds = clamp(readParam(CAPTURE_SECONDS_PATH, 4.0), 0.25, MAX_CAPTURE_SECONDS)
  if ctx._lastAppliedCaptureSeconds ~= seconds then
    ctx.videoCap:setCaptureSeconds(seconds)
    ctx._lastAppliedCaptureSeconds = seconds
  end
end

local function openWebcam(ctx)
  local idx = selectedDeviceIndex(ctx)
  local ok = false
  if capture and capture.open then ok = capture.open(idx, 640, 480, 30) end
  setText(ctx.widgets and ctx.widgets.webcamStatus, ok and ("Webcam: open device " .. tostring(idx) .. " @ 640x480") or "Webcam: open failed")
  bindLiveSurface(ctx)
end

local function closeWebcam(ctx)
  if capture and capture.close then capture.close() end
  setText(ctx.widgets and ctx.widgets.webcamStatus, "Webcam: closed")
end

local function refreshWaveform(ctx)
  local wf = ctx.widgets and ctx.widgets.waveform
  if not wf then return end
  if wf.setSamplePath then wf:setSamplePath(SAMPLE_PATHS[1]) end

  local starts = getSliceStarts()
  local sel = selectedSlice(ctx)
  local start = starts[sel] or 0
  local finish = sliceEndFor(sel, starts)
  if wf.setRegion then wf:setRegion(start, finish) end
  if wf.setPlayStart then wf:setPlayStart(start) end
  if wf.setGrainPosition then wf:setGrainPosition(start) end
  if wf.setGrainPositions then wf:setGrainPositions(starts) end
  if wf.setVoiceGrains then
    local markerGroups = {}
    for i = 1, MAX_SLICES do markerGroups[i] = { starts[i] or 0 } end
    wf:setVoiceGrains(markerGroups)
  end
  if wf.setCrossfade then wf:setCrossfade(clamp(readParam(NS .. "/crossfade", 0.002), 0, 0.05)) end

  local playheads = {}
  for i = 1, MAX_SLICES do
    playheads[i] = (ctx._slicePlaying and ctx._slicePlaying[i]) and (ctx._slicePositions[i] or -1) or -1
  end
  if wf.setVoicePlayheads then wf:setVoicePlayheads(playheads) end
  if wf.setPlayheadPos then wf:setPlayheadPos((ctx._slicePositions and ctx._slicePositions[sel]) or start) end

  setText(ctx.widgets and ctx.widgets.waveformStatus,
    string.format("Selected Slice %d: %.3f → %.3f. Click/drag waveform moves nearest marker; root-major notes trigger slices 1..8.", sel, start, finish))
end

local function triggerSlice(ctx, sliceIndex, velocity, note)
  sliceIndex = math.max(1, math.min(MAX_SLICES, round(sliceIndex)))
  velocity = round(clamp(velocity or 127, 1, 127))
  setSelectedSlice(ctx, sliceIndex)
  writeParam(NS .. "/midi_note", note or noteForSlice(readParam(ROOT_NOTE_PATH, 60), sliceIndex))
  writeParam(NS .. "/midi_velocity", velocity)
  writeParam(sliceVelocityPath(sliceIndex), velocity)
  bump(sliceTriggerPath(sliceIndex))
  ctx._lastSliceEvent = string.format("Slice %d vel %d%s", sliceIndex, velocity, note and (" note " .. tostring(note)) or "")
  if ctx.video then ctx.video:seek(getSliceStart(sliceIndex)); ctx.video:trigger() end
  refreshWaveform(ctx)
end

local function stopAll(ctx)
  bump(STOP_TRIGGER_PATH)
  if ctx.video then ctx.video:stop() end
  ctx._lastSliceEvent = "Stop all"
end

local function doRetroCapture(ctx)
  if not (ctx.videoCap and ctx.video) then return end
  local seconds = clamp(readParam(CAPTURE_SECONDS_PATH, 4.0), 0.25, MAX_CAPTURE_SECONDS)
  applyCaptureWindow(ctx)
  local clk = clockInfo()
  local sr = tonumber(clk.sampleRate) or 44100
  local samplesBack = math.max(1, math.floor(seconds * sr))
  bump(CAPTURE_TRIGGER_PATH)
  local okVideo = ctx.videoCap:copyRecentToSampler(ctx.video, samplesBack)
  ctx.video:seek(0)
  ctx._lastCaptureSamplesBack = samplesBack
  ctx._lastCaptureSeconds = seconds
  ctx._lastVideoCommitOk = okVideo == true
  if type(invalidateWaveformPeakCache) == "function" then invalidateWaveformPeakCache() end
  for i = 1, MAX_SLICES do bindSliceSurface(ctx, i, getSliceStart(i)) end
  refreshWaveform(ctx)
end

local function setCaptureButtonAppearance(ctx)
  local btn = ctx.widgets and ctx.widgets.captureNow
  if not btn then return end
  local recording = (ctx.captureMode == 1) and (ctx.captureRecording == true)
  setLabel(btn, recording and "STOP" or "Capture A/V")
  if btn.setBg then btn:setBg(recording and 0xffdc2626 or 0xff22c55e) end
end

local function onCaptureButtonPress(ctx)
  if ctx.captureMode == 1 then
    if ctx.captureRecording then
      local clk = clockInfo()
      local sr = tonumber(clk.sampleRate) or 44100
      local nowSamples = tonumber(clk.playTimeSamples) or 0
      local elapsedSeconds = math.max(0.25, (nowSamples - ctx.freeStartSamples) / sr)
      ctx.captureRecording = false
      writeParam(CAPTURE_SECONDS_PATH, elapsedSeconds)
      doRetroCapture(ctx)
      writeParam(CAPTURE_SECONDS_PATH, ctx._prevCaptureSeconds or 4.0)
      setCaptureButtonAppearance(ctx)
    else
      local clk = clockInfo()
      ctx.freeStartSamples = tonumber(clk.playTimeSamples) or 0
      ctx._prevCaptureSeconds = readParam(CAPTURE_SECONDS_PATH, 4.0)
      ctx.captureRecording = true
      setCaptureButtonAppearance(ctx)
    end
  else
    doRetroCapture(ctx)
  end
end

local function clearRack(ctx)
  if ctx.video then ctx.video:clear() end
  if ctx.videoCap then ctx.videoCap:clear() end
  ctx._lastVideoCommitOk = false
  for i = 1, MAX_SLICES do bindSliceSurface(ctx, i, getSliceStart(i)) end
  refreshWaveform(ctx)
end

local function makeRecordingPath(baseDir)
  local base = tostring(baseDir or "")
  if base == "" then base = "/tmp" end
  if base:sub(-1) == "/" then base = base:sub(1, -2) end
  local nowMs = math.floor((getTime and getTime() or 0) * 1000)
  return base .. "/vsrl_rec_" .. tostring(nowMs)
end

local function sampleViewportBounds(ctx)
  local vp = ctx.widgets and ctx.widgets.sampleViewport
  if not (vp and vp.node and vp.node.getBounds) then return 0, 0, 600, 276 end
  local x, y, w, h = vp.node:getBounds()
  return math.floor(tonumber(x) or 0), math.floor(tonumber(y) or 0), math.floor(tonumber(w) or 600), math.floor(tonumber(h) or 276)
end

local function startRecordingAt(ctx, baseDir)
  if ctx._destroyed or ctx._recording then return end
  local path = makeRecordingPath(baseDir)
  if debugRecording and debugRecording.startNode then
    ctx._lastRecordResponse = debugRecording.startNode(path, "sampleViewport", true)
  elseif debugRecording and debugRecording.startViewport then
    local x, y, w, h = sampleViewportBounds(ctx)
    ctx._lastRecordResponse = debugRecording.startViewport(path, x, y, w, h, true)
  else
    command("RECORD", "START", "tga", path)
  end
  ctx._recording = true
  ctx._recordPath = path
  ctx._recordChooserPending = false
  setLabel(ctx.widgets and ctx.widgets.recordBtn, "Stop Rec")
  setText(ctx.widgets and ctx.widgets.recordStatus, "Recording dynamic slice viewport: " .. path)
end

local function toggleRecording(ctx)
  if type(command) ~= "function" then setText(ctx.widgets and ctx.widgets.recordStatus, "Recording: command() unavailable"); return end
  if ctx._recording then
    if debugRecording and debugRecording.stop then ctx._lastRecordStopResponse = debugRecording.stop() else command("RECORD", "STOP") end
    ctx._recording = false
    ctx._recordChooserPending = false
    setLabel(ctx.widgets and ctx.widgets.recordBtn, "Record")
    setText(ctx.widgets and ctx.widgets.recordStatus, "Recording saved + mux queued: " .. tostring(ctx._recordPath or ""))
    return
  end
  if ctx._recordChooserPending then return end
  ctx._recordChooserPending = true
  setText(ctx.widgets and ctx.widgets.recordStatus, "Choose recording folder…")
  if type(showDirectoryChooser) == "function" then
    showDirectoryChooser("Choose VideoSliceRackLab recording folder", "/tmp", function(path)
      ctx._recordChooserPending = false
      if ctx._destroyed then return end
      if type(path) ~= "string" or path == "" then setText(ctx.widgets and ctx.widgets.recordStatus, "Recording: cancelled"); return end
      startRecordingAt(ctx, path)
    end)
  else
    startRecordingAt(ctx, "/tmp")
  end
end

local function pollMidi(ctx)
  if not (Midi and Midi.pollInputEvent) then return end
  local root = round(clamp(readParam(ROOT_NOTE_PATH, 60), 0, 127))
  local consumed = 0
  while consumed < 64 do
    local event = Midi.pollInputEvent()
    if event == nil then break end
    consumed = consumed + 1
    local eventType = tonumber(event.type or 0) or 0
    local note = tonumber(event.data1 or 0) or 0
    local vel = tonumber(event.data2 or 0) or 0
    if Midi.NOTE_ON and eventType == Midi.NOTE_ON and vel > 0 then
      local sliceIndex = noteToSlice(note, root)
      if sliceIndex ~= nil then
        triggerSlice(ctx, sliceIndex, vel, note)
      else
        ctx._lastSliceEvent = string.format("ignored note %d", note)
      end
    elseif Midi.CONTROL_CHANGE and eventType == Midi.CONTROL_CHANGE and note == 123 then
      stopAll(ctx)
    end
  end
end

local function bindParamWidget(widget)
  local path = widget and widget.config and widget.config.paramPath or nil
  if type(path) ~= "string" or path == "" then return end
  if widget.setValue then
    widget._onChange = function(value)
      writeParam(path, value)
      refreshWaveform(widget._ctx)
    end
  end
end

function M.init(ctx)
  ctx.video = videoSampler and videoSampler.new and videoSampler.new({ id = VIDEO_SAMPLER_ID }) or nil
  ctx.videoCap = videoSampler and videoSampler.capture and videoSampler.capture({ id = VIDEO_CAPTURE_ID, maxSeconds = MAX_CAPTURE_SECONDS }) or nil
  ctx._selectedSlice = round(readParam(SELECTED_SLICE_PATH, 1))
  ctx.captureMode = round(readParam(NS .. "/capture_mode", 0))
  ctx.captureRecording = false
  ctx._recording = false
  ctx._recordPath = nil
  ctx._slicePlaying = {}
  ctx._slicePositions = {}
  ctx._scrubSlice = nil

  for _, w in pairs(ctx.allWidgets or {}) do
    if type(w) == "table" then
      w._ctx = ctx
      if type(w.config) == "table" and type(w.config.paramPath) == "string" then bindParamWidget(w) end
    end
  end

  local refresh = ctx.widgets and ctx.widgets.refreshDevices
  if refresh then refresh._onClick = function() refreshDevices(ctx) end end
  local open = ctx.widgets and ctx.widgets.openWebcam
  if open then open._onClick = function() openWebcam(ctx) end end
  local close = ctx.widgets and ctx.widgets.closeWebcam
  if close then close._onClick = function() closeWebcam(ctx) end end
  local capBtn = ctx.widgets and ctx.widgets.captureNow
  if capBtn then capBtn._onClick = function() onCaptureButtonPress(ctx) end end
  local stopBtn = ctx.widgets and ctx.widgets.stop
  if stopBtn then stopBtn._onClick = function() stopAll(ctx) end end
  local clearBtn = ctx.widgets and ctx.widgets.clear
  if clearBtn then clearBtn._onClick = function() clearRack(ctx) end end
  local recordBtn = ctx.widgets and ctx.widgets.recordBtn
  if recordBtn then recordBtn._onClick = function() toggleRecording(ctx) end end
  local captureModeToggle = ctx.widgets and ctx.widgets.captureMode
  if captureModeToggle then
    captureModeToggle._onChange = function(value)
      ctx.captureMode = value and 1 or 0
      writeParam(NS .. "/capture_mode", ctx.captureMode)
      if ctx.captureMode ~= 1 then ctx.captureRecording = false; setCaptureButtonAppearance(ctx) end
    end
  end

  local selected = ctx.widgets and ctx.widgets.selectedSlice
  if selected then
    selected._onSelect = function(idx)
      setSelectedSlice(ctx, idx)
      refreshWaveform(ctx)
    end
    setSelectedSilently(selected, selectedSlice(ctx))
  end

  local audition = ctx.widgets and ctx.widgets.auditionSelected
  if audition then audition._onClick = function() triggerSlice(ctx, selectedSlice(ctx), 127) end end

  local wf = ctx.widgets and ctx.widgets.waveform
  if wf then
    if wf.node and wf.node.setInterceptsMouse then wf.node:setInterceptsMouse(true, false) end
    wf._onScrubStart = function()
      ctx._scrubSlice = nil
    end
    wf._onScrubSnap = function(pos)
      local p = clamp(pos, 0, 0.999)
      if not ctx._scrubSlice then
        ctx._scrubSlice = nearestSliceTo(p, getSliceStarts())
        setSelectedSlice(ctx, ctx._scrubSlice)
      end
      writeParam(sliceStartPath(ctx._scrubSlice), p)
      refreshWaveform(ctx)
    end
    wf._onScrubEnd = function()
      ctx._scrubSlice = nil
    end
  end

  local midiRefresh = ctx.widgets and ctx.widgets.midiRefresh
  if midiRefresh then midiRefresh._onClick = function() refreshMidi(ctx); if not currentMidiLabel() then openPreferredMidi(ctx) end end end
  local midiInput = ctx.widgets and ctx.widgets.midiInput
  if midiInput then
    midiInput._onSelect = function(idx)
      local selectedIndex = math.max(1, round(idx))
      if selectedIndex == 1 then if Midi and Midi.closeInput then Midi.closeInput() end; refreshMidi(ctx); return end
      if Midi and Midi.openInput then Midi.openInput(selectedIndex - 2) end
      refreshMidi(ctx)
    end
  end

  refreshDevices(ctx)
  refreshMidi(ctx)
  if Audio == nil or (Audio.isPlugin and not Audio.isPlugin()) then if not currentMidiLabel() then openPreferredMidi(ctx) end end
  applyCaptureWindow(ctx)
  bindLiveSurface(ctx)
  for i = 1, MAX_SLICES do bindSliceSurface(ctx, i, getSliceStart(i)) end
  layoutSliceGrid(ctx)
  refreshWaveform(ctx)
end

function M.resized(ctx)
  layoutSliceGrid(ctx)
end

function M.update(ctx)
  applyCaptureWindow(ctx)
  if ctx.videoCap then ctx.videoCap:ingestLatest() end
  -- MIDI is consumed in DSP process() so the UI can't steal note events before
  -- the audio graph sees them. The UI infers active slices from sample playback.

  local frame = (capture and capture.getFrameInfo) and capture.getFrameInfo() or { valid = false }
  local open = (capture and capture.isOpen) and capture.isOpen() or false
  setText(ctx.widgets and ctx.widgets.webcamStatus,
    string.format("Webcam: %s  frame=%s  %dx%d  seq=%s", open and "open" or "closed", frame.valid and "yes" or "no", tonumber(frame.width) or 0, tonumber(frame.height) or 0, tostring(frame.sequence or "--")))

  local anyPlaying = false
  for i = 1, MAX_SLICES do
    local playing = false
    if type(isSampleRegionPlaybackPlaying) == "function" then
      local ok, value = pcall(isSampleRegionPlaybackPlaying, SAMPLE_PATHS[i])
      playing = ok and value == true
    end
    ctx._slicePlaying[i] = playing
    if playing then anyPlaying = true end

    local pos = getSliceStart(i)
    if playing and type(getSampleRegionPlaybackLoopAwarePosition) == "function" then
      local ok, value = pcall(getSampleRegionPlaybackLoopAwarePosition, SAMPLE_PATHS[i])
      if ok and tonumber(value) then pos = clamp(value, 0, 1) end
    end
    ctx._slicePositions[i] = pos
    bindSliceSurface(ctx, i, pos)
  end

  layoutSliceGrid(ctx)
  refreshWaveform(ctx)

  local visible = ctx._visibleSlices or {}
  for i = 1, MAX_SLICES do
    local isVisible = false
    for _, v in ipairs(visible) do if v == i then isVisible = true end end
    if isVisible then
      local note = noteForSlice(readParam(ROOT_NOTE_PATH, 60), i)
      applySliceCellColour(ctx, i, i == selectedSlice(ctx))
      setText(ctx.widgets and ctx.widgets["sliceOverlay" .. tostring(i)],
        string.format("S%d  note %d  %.3f %s", i, note, ctx._slicePositions[i] or 0, ctx._slicePlaying[i] and "▶" or "preview"))
    end
  end

  local clk = clockInfo()
  setText(ctx.widgets and ctx.widgets.clockStatus,
    string.format("Clock: sr=%.1f playSamples=%.0f tempo=%.2f", tonumber(clk.sampleRate) or 0, tonumber(clk.playTimeSamples) or 0, tonumber(clk.tempo) or 0))

  local activeNames = {}
  for i = 1, MAX_SLICES do if ctx._slicePlaying[i] then activeNames[#activeNames + 1] = "S" .. tostring(i) end end
  local midiName = currentMidiLabel()
  local midiOpen = (Midi and Midi.isInputOpen and Midi.isInputOpen()) and "open" or "closed"
  setText(ctx.widgets and ctx.widgets.midiStatus,
    string.format("MIDI: %s (%s) root=%d major=%s active=%s",
      midiName or "none",
      midiOpen,
      round(readParam(ROOT_NOTE_PATH, 60)),
      "0,2,4,5,7,9,11,12",
      (#activeNames > 0 and table.concat(activeNames, ",") or "--")))

  local capCount = ctx.videoCap and ctx.videoCap:getFrameCount() or 0
  local sampleFrames = ctx.video and ctx.video:getFrameCount() or 0
  local duration = ctx.video and ctx.video:getDurationSeconds() or 0
  setText(ctx.widgets and ctx.widgets.status,
    string.format("Status: %s | visible %d | capture %d frames | sampler %d frames %.2fs | last %s | sel S%d",
      anyPlaying and "playing" or "idle",
      #visible,
      capCount,
      sampleFrames,
      duration,
      tostring(ctx._lastSliceEvent or "--"),
      selectedSlice(ctx)))

  if ctx._recording then setLabel(ctx.widgets and ctx.widgets.recordBtn, "Stop Rec") else setLabel(ctx.widgets and ctx.widgets.recordBtn, "Record") end
end

function M.cleanup(ctx)
  if ctx then
    ctx._destroyed = true
    if ctx._recording and type(command) == "function" then pcall(command, "RECORD", "STOP"); ctx._recording = false end
    if ctx.video then pcall(function() ctx.video:clear() end) end
    if ctx.videoCap then pcall(function() ctx.videoCap:clear() end) end
  end
  if capture and capture.close then pcall(capture.close) end
  if videoSampler then
    if videoSampler.remove then pcall(videoSampler.remove, VIDEO_SAMPLER_ID) end
    if videoSampler.removeCapture then pcall(videoSampler.removeCapture, VIDEO_CAPTURE_ID) end
  end
end

return M
