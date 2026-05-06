local M = {}

local SAMPLE_PATH = "/video_sampler_lab/sample"
local CAPTURE_SECONDS_PATH = "/video_sampler_lab/capture_seconds"
local CAPTURE_TRIGGER_PATH = "/video_sampler_lab/capture_trigger"
local PLAY_TRIGGER_PATH = "/video_sampler_lab/play_trigger"
local STOP_TRIGGER_PATH = "/video_sampler_lab/stop_trigger"
local MIDI_NOTE_PATH = "/video_sampler_lab/midi_note"
local MIDI_VELOCITY_PATH = "/video_sampler_lab/midi_velocity"
local MIDI_NOTE_ON_TRIGGER_PATH = "/video_sampler_lab/midi_note_on_trigger"
local MIDI_NOTE_OFF_TRIGGER_PATH = "/video_sampler_lab/midi_note_off_trigger"
local VIDEO_CAPTURE_ID = "video_sampler_lab_capture"
local VIDEO_SAMPLER_ID = "video_sampler_lab_clip"
local MAX_CAPTURE_SECONDS = 6.0

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

local function setValueSilently(widget, value)
  if not (widget and widget.setValue) then return end
  local onChange = widget._onChange
  widget._onChange = nil
  widget:setValue(value)
  widget._onChange = onChange
end

local function setSelected(widget, index)
  if widget and widget.setSelected then widget:setSelected(index or 1) end
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
  if type(value) == "boolean" then
    n = value and 1 or 0
  else
    n = tonumber(value) or 0
  end
  if type(setParam) == "function" then
    return setParam(path, n)
  end
  return false
end

local function bump(path)
  writeParam(path, (readParam(path, 0) + 1) % 1000000)
end

local function encodedMidiTrigger(ctx, note, velocity)
  ctx._midiTriggerCounter = ((ctx._midiTriggerCounter or 0) + 1) % 512
  local safeNote = round(clamp(note, 0, 127))
  local safeVelocity = round(clamp(velocity, 0, 127))
  return ctx._midiTriggerCounter * 16384 + safeNote * 128 + safeVelocity
end

local function clockInfo()
  if type(getAudioClockInfo) == "function" then
    local ok, info = pcall(getAudioClockInfo)
    if ok and type(info) == "table" then return info end
  end
  return { sampleRate = 44100, playTimeSamples = 0, tempo = 120, samplesPerBar = 88200 }
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
  setSelected(ctx.widgets and ctx.widgets.deviceSelect, 1)
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
  if active then
    for i = 1, #options do
      if options[i] == active then selected = i end
    end
  end
  setSelected(ctx.widgets and ctx.widgets.midiInput, selected)
  local openState = (Midi and Midi.isInputOpen and Midi.isInputOpen()) and "open" or "closed"
  setText(ctx.widgets and ctx.widgets.midiStatus, active and ("MIDI: " .. active .. " (" .. openState .. ") — mono NOTE ON triggers sample") or ("MIDI: none selected (" .. openState .. ")"))
end

local function openPreferredMidi(ctx)
  local devices = ctx._midiDevices or {}
  if not (Midi and Midi.openInput) or #devices == 0 then
    refreshMidi(ctx)
    return
  end
  local chosen = 1
  for i = 1, #devices do
    if not tostring(devices[i]):lower():find("through", 1, true) then chosen = i; break end
  end
  Midi.openInput(chosen - 1)
  refreshMidi(ctx)
end

local function bindLiveSurface(ctx)
  local vp = ctx.widgets and ctx.widgets.liveViewport
  if vp and vp.node and vp.node.setCustomSurface then
    vp.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "live" })
  end
end

local function bindSamplerSurface(ctx, position)
  local vp = ctx.widgets and ctx.widgets.sampleViewport
  if not (vp and vp.node and vp.node.setCustomSurface and ctx.video) then return end
  vp.node:setCustomSurface("video_input", {
    version = 2,
    fitMode = "contain",
    source = "sampler",
    samplerId = ctx.video:getId(),
    position = clamp(position or 0, 0, 1),
  })
end

local function applyCaptureWindow(ctx)
  if not ctx.videoCap then return end
  local seconds = clamp(readParam(CAPTURE_SECONDS_PATH, 4.0), 0.25, MAX_CAPTURE_SECONDS)
  if ctx._lastAppliedCaptureSeconds ~= seconds then
    ctx.videoCap:setCaptureSeconds(seconds)
    ctx._lastAppliedCaptureSeconds = seconds
  end
end

local function applyVideoWindow(ctx)
  if not ctx.video then return end
  ctx.video:setPlayStart(clamp(readParam("/video_sampler_lab/play_start", 0), 0, 1))
  ctx.video:setLoopStart(clamp(readParam("/video_sampler_lab/loop_start", 0), 0, 1))
  ctx.video:setLoopEnd(clamp(readParam("/video_sampler_lab/loop_end", 1), 0, 1))
  ctx.video:setCrossfade(clamp(readParam("/video_sampler_lab/crossfade", 0.03), 0, 0.5))
  ctx.video:setOneShot((readParam("/video_sampler_lab/one_shot", 0) or 0) > 0.5)
end

local function openWebcam(ctx)
  local idx = selectedDeviceIndex(ctx)
  local ok = false
  if capture and capture.open then
    ok = capture.open(idx, 640, 480, 30)
  end
  ctx._webcamOpenRequested = true
  setText(ctx.widgets and ctx.widgets.webcamStatus, ok and ("Webcam: open device " .. tostring(idx) .. " @ 640x480") or "Webcam: open failed")
  bindLiveSurface(ctx)
end

local function closeWebcam(ctx)
  if capture and capture.close then capture.close() end
  setText(ctx.widgets and ctx.widgets.webcamStatus, "Webcam: closed")
end

local function triggerPlayback(ctx)
  ctx._midiActiveNote = nil
  bump(PLAY_TRIGGER_PATH)
  if ctx.video then ctx.video:trigger() end
end

local function triggerMidiNote(ctx, note, velocity)
  note = round(clamp(note, 0, 127))
  velocity = round(clamp(velocity, 1, 127))
  ctx._midiActiveNote = note
  ctx._lastMidiEvent = string.format("NOTE ON %d vel %d", note, velocity)
  writeParam(MIDI_NOTE_PATH, note)
  writeParam(MIDI_VELOCITY_PATH, velocity)
  writeParam(MIDI_NOTE_ON_TRIGGER_PATH, encodedMidiTrigger(ctx, note, velocity))
  if ctx.video then ctx.video:trigger() end
end

local function releaseMidiNote(ctx, note)
  note = round(clamp(note, 0, 127))
  ctx._lastMidiEvent = string.format("NOTE OFF %d", note)
  writeParam(MIDI_NOTE_PATH, note)
  writeParam(MIDI_NOTE_OFF_TRIGGER_PATH, encodedMidiTrigger(ctx, note, 0))
  if ctx._midiActiveNote == note then ctx._midiActiveNote = nil end
end

local function stopPlayback(ctx)
  ctx._midiActiveNote = nil
  bump(STOP_TRIGGER_PATH)
  if ctx.video then ctx.video:stop() end
  ctx._manualPosition = 0
  setValueSilently(ctx.widgets and ctx.widgets.manualPosition, 0)
  bindSamplerSurface(ctx, 0)
end

local function makeRecordingPath(baseDir)
  local base = tostring(baseDir or "")
  if base == "" then base = "/tmp" end
  if base:sub(-1) == "/" then base = base:sub(1, -2) end
  local nowMs = math.floor((getTime and getTime() or 0) * 1000)
  local stamp = tostring(nowMs)
  return base .. "/vsl_rec_" .. stamp
end

local function sampleViewportBounds(ctx)
  local vp = ctx.widgets and ctx.widgets.sampleViewport
  if not (vp and vp.node and vp.node.getBounds) then
    return 0, 0, 600, 338
  end
  local x, y, w, h = vp.node:getBounds()
  return math.floor(tonumber(x) or 0),
         math.floor(tonumber(y) or 0),
         math.floor(tonumber(w) or 600),
         math.floor(tonumber(h) or 338)
end

local function startRecordingAt(ctx, baseDir)
  if ctx._destroyed or ctx._recording then return end
  local path = makeRecordingPath(baseDir)
  if debugRecording and debugRecording.startNode then
    local response = debugRecording.startNode(path, "sampleViewport", true)
    ctx._lastRecordResponse = response
  elseif debugRecording and debugRecording.startViewport then
    local x, y, w, h = sampleViewportBounds(ctx)
    local response = debugRecording.startViewport(path, x, y, w, h, true)
    ctx._lastRecordResponse = response
  else
    command("RECORD", "START", "tga", path)
  end
  ctx._recording = true
  ctx._recordPath = path
  ctx._recordChooserPending = false
  setLabel(ctx.widgets and ctx.widgets.recordBtn, "Stop Rec")
  setText(ctx.widgets and ctx.widgets.recordStatus, "Recording sampler viewport: " .. path)
end

local function toggleRecording(ctx)
  if type(command) ~= "function" then
    setText(ctx.widgets and ctx.widgets.recordStatus, "Recording: command() unavailable")
    return
  end
  if ctx._recording then
    if debugRecording and debugRecording.stop then
      ctx._lastRecordStopResponse = debugRecording.stop()
    else
      command("RECORD", "STOP")
    end
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
    showDirectoryChooser("Choose VideoSamplerLab recording folder", "/tmp", function(path)
      ctx._recordChooserPending = false
      if ctx._destroyed then return end
      if type(path) ~= "string" or path == "" then
        setText(ctx.widgets and ctx.widgets.recordStatus, "Recording: cancelled")
        return
      end
      startRecordingAt(ctx, path)
    end)
  else
    startRecordingAt(ctx, "/tmp")
  end
end

local function setCaptureButtonAppearance(ctx)
  local btn = ctx.widgets and ctx.widgets.captureNow
  if not btn then return end
  local recording = (ctx.captureMode == 1) and (ctx.captureRecording == true)
  setLabel(btn, recording and "STOP" or "Cap")
  if btn.setBg then btn:setBg(recording and 0xffdc2626 or 0xff22c55e) end
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
  applyVideoWindow(ctx)
  ctx._lastCaptureSamplesBack = samplesBack
  ctx._lastCaptureSeconds = seconds
  ctx._lastVideoCommitOk = okVideo == true
  ctx._manualPosition = 0
  setValueSilently(ctx.widgets and ctx.widgets.manualPosition, 0)
  bindSamplerSurface(ctx, 0)
end

local function onCaptureButtonPress(ctx)
  if ctx.captureMode == 1 then
    if ctx.captureRecording then
      -- Free mode stop: compute elapsed time, set capture_seconds, then do retro capture
      local clk = clockInfo()
      local sr = tonumber(clk.sampleRate) or 44100
      local nowSamples = tonumber(clk.playTimeSamples) or 0
      local elapsedSeconds = math.max(0.25, (nowSamples - ctx.freeStartSamples) / sr)
      ctx.captureRecording = false
      -- Temporarily set capture_seconds to the free-mode duration so retro path uses it
      writeParam(CAPTURE_SECONDS_PATH, elapsedSeconds)
      doRetroCapture(ctx)
      -- Restore previous capture_seconds so the slider doesn't jump
      writeParam(CAPTURE_SECONDS_PATH, ctx._prevCaptureSeconds or 4.0)
      setCaptureButtonAppearance(ctx)
    else
      -- Free mode start: remember start time and previous slider value
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

local function pollMidi(ctx)
  if not (Midi and Midi.pollInputEvent) then return end
  local consumed = 0
  while consumed < 64 do
    local event = Midi.pollInputEvent()
    if event == nil then break end
    consumed = consumed + 1
    local eventType = tonumber(event.type or 0) or 0
    local data1 = tonumber(event.data1 or 0) or 0
    local data2 = tonumber(event.data2 or 0) or 0

    if Midi.NOTE_ON and eventType == Midi.NOTE_ON and data2 > 0 then
      triggerMidiNote(ctx, data1, data2)
    elseif (Midi.NOTE_OFF and eventType == Midi.NOTE_OFF) or (Midi.NOTE_ON and eventType == Midi.NOTE_ON and data2 <= 0) then
      releaseMidiNote(ctx, data1)
    elseif Midi.CONTROL_CHANGE and eventType == Midi.CONTROL_CHANGE and data1 == 123 then
      ctx._lastMidiEvent = "CC123 all notes off"
      stopPlayback(ctx)
    else
      ctx._lastMidiEvent = string.format("MIDI type=%s d1=%s d2=%s", tostring(eventType), tostring(data1), tostring(data2))
    end
  end
end

local function bindParamWidget(widget)
  local path = widget and widget.config and widget.config.paramPath or nil
  if type(path) ~= "string" or path == "" then return end

  if widget.setValue then
    widget._onChange = function(value)
      writeParam(path, value)
      applyVideoWindow(widget._ctx)
    end
  end
end

function M.init(ctx)
  ctx.video = videoSampler and videoSampler.new and videoSampler.new({ id = VIDEO_SAMPLER_ID }) or nil
  ctx.videoCap = videoSampler and videoSampler.capture and videoSampler.capture({ id = VIDEO_CAPTURE_ID, maxSeconds = MAX_CAPTURE_SECONDS }) or nil
  ctx._manualPosition = 0
  ctx._lastVideoCommitOk = false
  ctx.captureMode = round(readParam("/video_sampler_lab/capture_mode", 0))
  ctx.captureRecording = false
  ctx._recording = false
  ctx._recordPath = nil

  for _, w in pairs(ctx.allWidgets or {}) do
    if type(w) == "table" then
      w._ctx = ctx
      if type(w.config) == "table" and type(w.config.paramPath) == "string" then
        bindParamWidget(w)
      end
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
  local playBtn = ctx.widgets and ctx.widgets.play
  if playBtn then playBtn._onClick = function() triggerPlayback(ctx) end end
  local stopBtn = ctx.widgets and ctx.widgets.stop
  if stopBtn then stopBtn._onClick = function() stopPlayback(ctx) end end
  local clearBtn = ctx.widgets and ctx.widgets.clear
  if clearBtn then
    clearBtn._onClick = function()
      if ctx.video then ctx.video:clear() end
      if ctx.videoCap then ctx.videoCap:clear() end
      ctx._lastVideoCommitOk = false
      setText(ctx.widgets and ctx.widgets.sampleOverlay, "cleared")
    end
  end
  local recordBtn = ctx.widgets and ctx.widgets.recordBtn
  if recordBtn then recordBtn._onClick = function() toggleRecording(ctx) end end
  local captureModeToggle = ctx.widgets and ctx.widgets.captureMode
  if captureModeToggle then
    captureModeToggle._onChange = function(value)
      ctx.captureMode = value and 1 or 0
      writeParam("/video_sampler_lab/capture_mode", ctx.captureMode)
      if ctx.captureMode ~= 1 then
        ctx.captureRecording = false
        setCaptureButtonAppearance(ctx)
      end
    end
  end

  local manual = ctx.widgets and ctx.widgets.manualPosition
  if manual then
    manual._onChange = function(value)
      ctx._manualPosition = clamp(value, 0, 1)
      writeParam("/video_sampler_lab/seek", ctx._manualPosition)
      if ctx.video then ctx.video:seek(ctx._manualPosition) end
      bindSamplerSurface(ctx, ctx._manualPosition)
    end
  end

  local midiRefresh = ctx.widgets and ctx.widgets.midiRefresh
  if midiRefresh then midiRefresh._onClick = function() refreshMidi(ctx); if not currentMidiLabel() then openPreferredMidi(ctx) end end end
  local midiInput = ctx.widgets and ctx.widgets.midiInput
  if midiInput then
    midiInput._onSelect = function(idx)
      local selected = math.max(1, round(idx))
      if selected == 1 then
        if Midi and Midi.closeInput then Midi.closeInput() end
        refreshMidi(ctx)
        return
      end
      if Midi and Midi.openInput then Midi.openInput(selected - 2) end
      refreshMidi(ctx)
    end
  end

  refreshDevices(ctx)
  refreshMidi(ctx)
  if Audio == nil or (Audio.isPlugin and not Audio.isPlugin()) then
    if not currentMidiLabel() then openPreferredMidi(ctx) end
  end
  applyCaptureWindow(ctx)
  bindLiveSurface(ctx)
  bindSamplerSurface(ctx, 0)
  setText(ctx.widgets and ctx.widgets.captureStatus, ctx.videoCap and "Capture ring ready" or "No videoSampler.capture binding")
  setText(ctx.widgets and ctx.widgets.samplerStatus, ctx.video and ("Sampler id: " .. ctx.video:getId()) or "No videoSampler.new binding")
end

function M.update(ctx)
  applyCaptureWindow(ctx)
  if ctx.videoCap then
    ctx.videoCap:ingestLatest()
  end

  pollMidi(ctx)

  local frame = (capture and capture.getFrameInfo) and capture.getFrameInfo() or { valid = false }
  local open = (capture and capture.isOpen) and capture.isOpen() or false
  setText(ctx.widgets and ctx.widgets.webcamStatus,
    string.format("Webcam: %s  frame=%s  %dx%d  seq=%s",
      open and "open" or "closed",
      frame.valid and "yes" or "no",
      tonumber(frame.width) or 0,
      tonumber(frame.height) or 0,
      tostring(frame.sequence or "--")))

  local pos = ctx._manualPosition or 0
  local playing = false
  if type(isSampleRegionPlaybackPlaying) == "function" then
    local ok, value = pcall(isSampleRegionPlaybackPlaying, SAMPLE_PATH)
    playing = ok and value == true
  end
  if playing and type(getSampleRegionPlaybackLoopAwarePosition) == "function" then
    local ok, value = pcall(getSampleRegionPlaybackLoopAwarePosition, SAMPLE_PATH)
    if ok and tonumber(value) then pos = clamp(value, 0, 1) end
  elseif ctx.video then
    pos = ctx.video:getPosition()
  end

  bindSamplerSurface(ctx, pos)
  if ctx.widgets and ctx.widgets.manualPosition and not (ctx.widgets.manualPosition._dragging) then
    setValueSilently(ctx.widgets.manualPosition, pos)
  end

  local clk = clockInfo()
  setText(ctx.widgets and ctx.widgets.clockStatus,
    string.format("Clock: sr=%.1f playSamples=%.0f tempo=%.2f spb=%.0f",
      tonumber(clk.sampleRate) or 0,
      tonumber(clk.playTimeSamples) or 0,
      tonumber(clk.tempo) or 0,
      tonumber(clk.samplesPerBar) or 0))

  local capCount = ctx.videoCap and ctx.videoCap:getFrameCount() or 0
  local lockedW = ctx.videoCap and ctx.videoCap:getLockedWidth() or 0
  local lockedH = ctx.videoCap and ctx.videoCap:getLockedHeight() or 0
  local capMB = (ctx.videoCap and ctx.videoCap:getEstimatedBytes() or 0) / (1024 * 1024)
  local capLimitMB = (ctx.videoCap and ctx.videoCap:getMaxRetainedBytes() or 0) / (1024 * 1024)
  setText(ctx.widgets and ctx.widgets.captureStatus,
    string.format("Capture ring: %d frames, locked %dx%d, %.1f/%.0f MB %s", capCount, lockedW, lockedH, capMB, capLimitMB,
      (ctx.captureMode == 1 and ctx.captureRecording) and "[RECORDING]" or ""))

  local sampleFrames = ctx.video and ctx.video:getFrameCount() or 0
  local duration = ctx.video and ctx.video:getDurationSeconds() or 0
  local sampleMB = (ctx.video and ctx.video:getEstimatedBytes() or 0) / (1024 * 1024)
  setText(ctx.widgets and ctx.widgets.samplerStatus,
    string.format("Sampler: %d frames, %.3fs, %.1f MB, last commit %s", sampleFrames, duration, sampleMB, ctx._lastVideoCommitOk and "OK" or "--"))

  setText(ctx.widgets and ctx.widgets.audioStatus,
    string.format("Audio: %s  capture %.2fs / samplesBack %s", playing and "playing" or "stopped", tonumber(ctx._lastCaptureSeconds) or readParam(CAPTURE_SECONDS_PATH, 4), tostring(ctx._lastCaptureSamplesBack or "--")))

  local midiName = currentMidiLabel()
  local midiOpen = (Midi and Midi.isInputOpen and Midi.isInputOpen()) and "open" or "closed"
  setText(ctx.widgets and ctx.widgets.midiStatus,
    string.format("MIDI: %s (%s) active=%s last=%s",
      midiName or "none",
      midiOpen,
      tostring(ctx._midiActiveNote or "--"),
      tostring(ctx._lastMidiEvent or "--")))

  setText(ctx.widgets and ctx.widgets.positionStatus,
    string.format("Position: %.4f (%s)", pos, playing and "audio loop-aware" or "manual/fallback"))

  local recLabel = ctx._recording and "Stop Rec" or "Record"
  setLabel(ctx.widgets and ctx.widgets.recordBtn, recLabel)

  if ctx._recording then
    setText(ctx.widgets and ctx.widgets.sampleOverlay, "")
  else
    setText(ctx.widgets and ctx.widgets.sampleOverlay,
      sampleFrames > 0 and string.format("sampler %s frameCount=%d pos=%.3f", ctx.video:getId(), sampleFrames, pos)
        or "waiting for committed frames")
  end
end

function M.cleanup(ctx)
  if ctx then
    ctx._destroyed = true
    if ctx._recording and type(command) == "function" then
      pcall(command, "RECORD", "STOP")
      ctx._recording = false
    end
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
