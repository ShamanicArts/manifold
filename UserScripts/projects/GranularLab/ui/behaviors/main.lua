local M = {}

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function readParam(path, fallback)
  if type(_G.getParam) == "function" then
    local ok, v = pcall(_G.getParam, path)
    if ok and v ~= nil then return v end
  end
  return fallback
end

local function writeParam(path, value)
  local n = tonumber(value)
  if not n then return false end
  if type(_G.setParam) == "function" then return _G.setParam(path, n) end
  if type(command) == "function" then command("SET", path, tostring(n)); return true end
  return false
end

local function bump(path)
  writeParam(path, (readParam(path, 0) + 1) % 1000000)
end

local function setLabel(widget, text)
  if widget and widget.setText then widget:setText(tostring(text or "")) end
end

local function syncWidgetFromParam(widget, path)
  if not widget or not path then return end
  if widget._dragging or widget._open or widget._granularSyncing then return end
  local v = readParam(path, nil)
  if v == nil then return end

  if type(widget.setSelected) == "function" then
    local selected = math.floor((tonumber(v) or 0) + 0.5) + 1
    local existing = type(widget.getSelected) == "function" and widget:getSelected() or nil
    if existing == nil or existing ~= selected then
      widget._granularSyncing = true; widget:setSelected(selected); widget._granularSyncing = false
    end
  elseif type(widget.setValue) == "function" then
    local existing = type(widget.getValue) == "function" and widget:getValue() or nil
    if type(widget.setOnLabel) == "function" then
      local b = (tonumber(v) or 0) > 0.5
      if existing == nil or existing ~= b then
        widget._granularSyncing = true; widget:setValue(b); widget._granularSyncing = false
      end
      return
    end
    if existing == nil or math.abs((tonumber(existing) or 0) - (tonumber(v) or 0)) > 0.0001 then
      widget._granularSyncing = true; widget:setValue(tonumber(v) or 0); widget._granularSyncing = false
    end
  end
end

local function bindParamWidget(widget)
  local path = widget and widget.config and widget.config.paramPath or nil
  if type(path) ~= "string" or path == "" then return end
  if type(widget.setSelected) == "function" then
    widget._onSelect = function(idx) if widget._granularSyncing then return end; writeParam(path, (tonumber(idx) or 1) - 1) end
    syncWidgetFromParam(widget, path)
  elseif type(widget.setOnLabel) == "function" then
    widget._onChange = function(v) if widget._granularSyncing then return end; writeParam(path, v and 1 or 0) end
    syncWidgetFromParam(widget, path)
  elseif type(widget.setValue) == "function" then
    widget._onChange = function(v) if widget._granularSyncing then return end; writeParam(path, v) end
    syncWidgetFromParam(widget, path)
  else
    widget._onClick = function() bump(path) end
  end
end

local VOICE_COUNT = 6
local SAMPLE_NODE_PATHS = {}
local GRANULATOR_NODE_PATHS = {}
for i = 1, VOICE_COUNT do
  SAMPLE_NODE_PATHS[i] = "/granular/voice/" .. i .. "/sample"
  GRANULATOR_NODE_PATHS[i] = "/granular/voice/" .. i .. "/granulator"
end
local DISPLAY_SAMPLE_PATH = SAMPLE_NODE_PATHS[1]
local CAPTURE_NODE_PATH = "/granular/source/capture"

local function refreshWaveform(ctx)
  local wf = ctx.widgets and ctx.widgets.waveform
  if not wf then return end

  local mode = readParam("/granular/mode", 1)
  local captureSeconds = readParam("/granular/capture_seconds", 12)
  if mode > 0.5 and wf.setSamplePath then
    wf:setSamplePath(DISPLAY_SAMPLE_PATH)
    if wf.setColour then wf:setColour(0xff4a5568) end
  elseif wf.setCapturePath then
    wf:setCapturePath(CAPTURE_NODE_PATH, 0, captureSeconds)
    if wf.setColour then wf:setColour(0xff4a5568) end
  end

  local loopStart = clamp(readParam("/sample/loop_start", 0), 0, 1)
  local loopEnd = clamp(readParam("/sample/loop_end", 1), loopStart + 0.001, 1)
  local playStart = clamp(readParam("/sample/play_start", loopStart), loopStart, loopEnd)
  local grainRel = clamp(readParam("/granular/position", 0), 0, 1)
  local grainAbs = clamp(loopStart + grainRel * (loopEnd - loopStart), 0, 1)

  if wf.setRegion then wf:setRegion(loopStart, loopEnd) end
  if wf.setPlayStart then wf:setPlayStart(playStart) end
  if wf.setCrossfade then wf:setCrossfade(clamp(readParam("/sample/crossfade", 0), 0, 0.5)) end

  local playingByVoice = {}
  for voice = 1, VOICE_COUNT do
    local playing = false
    if mode > 0.5 and type(isSampleRegionPlaybackPlaying) == "function" then
      local okPlaying, p = pcall(isSampleRegionPlaybackPlaying, SAMPLE_NODE_PATHS[voice])
      playing = okPlaying and p == true
    else
      playing = voice == 1
    end
    playingByVoice[voice] = playing
  end

  if wf.setVoiceGrains and type(getGranulatorGrainPositionsAtPath) == "function" then
    local groups = {}
    for voice = 1, VOICE_COUNT do
      groups[voice] = {}
      if playingByVoice[voice] then
        local ok, positions = pcall(getGranulatorGrainPositionsAtPath, GRANULATOR_NODE_PATHS[voice])
        if ok and type(positions) == "table" then
          for i = 1, #positions do
            groups[voice][i] = clamp(positions[i], 0, 1)
          end
        end
      end
    end
    wf:setVoiceGrains(groups)
  end

  if mode > 0.5 and type(getSampleRegionPlaybackLoopAwarePosition) == "function" then
    local positions = {}
    for i = 1, VOICE_COUNT do
      if playingByVoice and playingByVoice[i] then
        local ok, p = pcall(getSampleRegionPlaybackLoopAwarePosition, SAMPLE_NODE_PATHS[i])
        positions[i] = (ok and tonumber(p)) and clamp(p, 0, 1) or -1
      else
        positions[i] = -1
      end
    end
    if wf.setVoicePlayheads then wf:setVoicePlayheads(positions) end
    if wf.setPlayheadPos then wf:setPlayheadPos(positions[1] or grainAbs) end
    if wf.setGrainPosition then wf:setGrainPosition(positions[1] or grainAbs) end
  else
    if wf.setPlayheadPos then wf:setPlayheadPos(grainAbs) end
    if wf.setGrainPosition then wf:setGrainPosition(grainAbs) end
  end
end

local PRESETS = {
  cloud = {
    ["/granular/grain_size"]=140, ["/granular/density"]=14, ["/granular/position"]=0.25,
    ["/granular/pitch"]=0, ["/granular/spray"]=0.35, ["/granular/envelope"]=2,
    ["/granular/mix"]=1.0, ["/granular/voice_count"]=6, ["/sample/level"]=0,
    ["/filter/cutoff"]=6500, ["/reverb/size"]=0.78, ["/reverb/wet"]=0.48,
  },
  rain = {
    ["/granular/grain_size"]=22, ["/granular/density"]=75, ["/granular/position"]=0.1,
    ["/granular/pitch"]=-12, ["/granular/spray"]=0.75, ["/granular/envelope"]=1,
    ["/granular/mix"]=0.95, ["/granular/voice_count"]=4, ["/filter/cutoff"]=4200,
    ["/reverb/size"]=0.85, ["/reverb/wet"]=0.58,
  },
  texture = {
    ["/granular/grain_size"]=240, ["/granular/density"]=7, ["/granular/position"]=0.7,
    ["/granular/pitch"]=7, ["/granular/spray"]=0.85, ["/granular/envelope"]=3,
    ["/granular/mix"]=1.0, ["/granular/voice_count"]=6, ["/filter/cutoff"]=9000,
    ["/reverb/size"]=0.42, ["/reverb/wet"]=0.32,
  },
  stutter = {
    ["/granular/grain_size"]=45, ["/granular/density"]=45, ["/granular/position"]=0.0,
    ["/granular/pitch"]=0, ["/granular/spray"]=0.03, ["/granular/envelope"]=4,
    ["/granular/mix"]=1.0, ["/granular/voice_count"]=1, ["/filter/cutoff"]=12000,
    ["/reverb/size"]=0.18, ["/reverb/wet"]=0.08,
  },
  pad = {
    ["/granular/grain_size"]=320, ["/granular/density"]=5, ["/granular/position"]=0.5,
    ["/granular/pitch"]=-5, ["/granular/spray"]=0.42, ["/granular/envelope"]=2,
    ["/granular/mix"]=0.92, ["/granular/voice_count"]=6, ["/filter/cutoff"]=3000,
    ["/reverb/size"]=0.92, ["/reverb/wet"]=0.72,
  },
  riser = {
    ["/granular/grain_size"]=75, ["/granular/density"]=28, ["/granular/position"]=0.0,
    ["/granular/pitch"]=12, ["/granular/spray"]=0.28, ["/granular/envelope"]=0,
    ["/granular/mix"]=1.0, ["/granular/voice_count"]=3, ["/filter/cutoff"]=8000,
    ["/reverb/size"]=0.62, ["/reverb/wet"]=0.42,
  },
}

local function applyPreset(name)
  local p = PRESETS[name]
  if not p then return end
  for path, value in pairs(p) do writeParam(path, value) end
end

local function buildMidiOptions()
  local devices = Midi and Midi.inputDevices and Midi.inputDevices() or {}
  local opts = { "None (Disabled)" }
  for i = 1, #devices do opts[#opts + 1] = tostring(devices[i]) end
  return opts, devices
end

local function currentMidiLabel()
  if Midi and Midi.currentInputDeviceName then
    local n = Midi.currentInputDeviceName()
    if type(n) == "string" and n ~= "" then return n end
  end
  return nil
end

local function setMidiStatus(ctx, t)
  setLabel(ctx.widgets and ctx.widgets.midi_status, t)
end

local function refreshMidi(ctx)
  local opts, dev = buildMidiOptions()
  ctx._midiOptions = opts; ctx._midiDevices = dev
  local dd = ctx.widgets and ctx.widgets.midi_input_dropdown
  if dd and dd.setOptions then dd:setOptions(opts) end
  local active = currentMidiLabel()
  local sel = 1
  if active then for i = 1, #opts do if opts[i] == active then sel = i end end end
  if dd and dd.setSelected then dd:setSelected(sel) end
  setMidiStatus(ctx, active and ("Device: " .. active) or "Device: None (Disabled)")
end

local function openPreferredMidi(ctx)
  local dev = ctx._midiDevices or {}
  if not (Midi and Midi.openInput) or #dev == 0 then
    setMidiStatus(ctx, "Device: None Found")
    return
  end
  local chosen = 0
  for i = 1, #dev do
    if not tostring(dev[i]):lower():find("through", 1, true) then chosen = i - 1; break end
  end
  Midi.openInput(chosen)
  refreshMidi(ctx)
end

local function loadSamplePathIntoAllVoices(path)
  local loadedAny = false
  if type(loadSampleRegionFileAtPath) ~= "function" then return false end
  for i = 1, #SAMPLE_NODE_PATHS do
    local ok = loadSampleRegionFileAtPath(SAMPLE_NODE_PATHS[i], path)
    if ok and type(loadGranulatorFileAtPath) == "function" then
      loadGranulatorFileAtPath(GRANULATOR_NODE_PATHS[i], path)
    end
    loadedAny = loadedAny or ok
  end
  if loadedAny then
    if type(invalidateWaveformPeakCache) == "function" then invalidateWaveformPeakCache() end
    writeParam("/granular/mode", 1)
    writeParam("/granular/freeze", 1)
    writeParam("/granular/position", 0)
    writeParam("/sample/seek", 0)
  end
  return loadedAny
end

local function openSampleFile(ctx)
  if type(showFileChooser) ~= "function" then
    setLabel(ctx.widgets and ctx.widgets.sample_file, "File chooser unavailable")
    return
  end

  setLabel(ctx.widgets and ctx.widgets.sample_file, "Choosing sample…")
  showFileChooser("Load sample", "", "*.wav;*.aif;*.aiff;*.flac;*.mp3", function(path)
    if type(path) ~= "string" or path == "" then
      setLabel(ctx.widgets and ctx.widgets.sample_file, ctx._samplePath and ("Loaded: " .. ctx._sampleName) or "No sample loaded")
      return
    end

    if loadSamplePathIntoAllVoices(path) then
      ctx._samplePath = path
      ctx._sampleName = path:match("([^/]+)$") or path
      setLabel(ctx.widgets and ctx.widgets.sample_file, "Loaded: " .. ctx._sampleName)
      bump("/sample/play_trigger")
    else
      setLabel(ctx.widgets and ctx.widgets.sample_file, "Load failed: " .. tostring(path))
    end
    refreshWaveform(ctx)
  end)
end

local function captureLiveToSample(ctx)
  writeParam("/granular/mode", 0)
  writeParam("/granular/freeze", 0)
  setLabel(ctx.widgets and ctx.widgets.sample_file, "Capturing recent live buffer…")
  bump("/granular/capture_trigger")
  writeParam("/granular/mode", 1)
  writeParam("/granular/freeze", 1)
  writeParam("/sample/seek", 0)
  ctx._samplePath = nil
  ctx._sampleName = "Live capture"
  setLabel(ctx.widgets and ctx.widgets.sample_file, "Loaded: Live capture")
  if type(invalidateWaveformPeakCache) == "function" then invalidateWaveformPeakCache() end
  refreshWaveform(ctx)
end

function M.init(ctx)
  ctx._paramWidgets = {}
  for _, w in pairs(ctx.allWidgets or {}) do
    if type(w) == "table" and type(w.config) == "table" and type(w.config.paramPath) == "string" then
      ctx._paramWidgets[#ctx._paramWidgets + 1] = w
      bindParamWidget(w)
    end
  end

  local playBtn = ctx.widgets and ctx.widgets.sample_play
  if playBtn then playBtn._onClick = function() writeParam("/granular/mode", 1); writeParam("/sample/seek", 0); bump("/sample/play_trigger") end end
  local stopBtn = ctx.widgets and ctx.widgets.sample_stop
  if stopBtn then stopBtn._onClick = function() bump("/sample/stop_trigger") end end
  local loadBtn = ctx.widgets and ctx.widgets.sample_load
  if loadBtn then loadBtn._onClick = function() openSampleFile(ctx) end end
  local captureBtn = ctx.widgets and ctx.widgets.capture_to_sample
  if captureBtn then captureBtn._onClick = function() captureLiveToSample(ctx) end end

  local freezeBtn = ctx.widgets and ctx.widgets.freeze_btn
  if freezeBtn then
    freezeBtn._onClick = function()
      local cur = readParam("/granular/freeze", 1)
      writeParam("/granular/freeze", cur > 0.5 and 0 or 1)
    end
  end

  local liveToggle = ctx.widgets and ctx.widgets.mode_live
  local sampleToggle = ctx.widgets and ctx.widgets.mode_sample
  if liveToggle then
    liveToggle._onChange = function(v)
      if liveToggle._granularSyncing then return end
      writeParam("/granular/mode", v and 0 or 1)
      if v and sampleToggle and sampleToggle.setValue then sampleToggle._granularSyncing = true; sampleToggle:setValue(false); sampleToggle._granularSyncing = false end
    end
  end
  if sampleToggle then
    sampleToggle._onChange = function(v)
      if sampleToggle._granularSyncing then return end
      writeParam("/granular/mode", v and 1 or 0)
      if v and liveToggle and liveToggle.setValue then liveToggle._granularSyncing = true; liveToggle:setValue(false); liveToggle._granularSyncing = false end
    end
  end

  local wf = ctx.widgets and ctx.widgets.waveform
  if wf then
    if wf.node and wf.node.setInterceptsMouse then wf.node:setInterceptsMouse(true, false) end
    wf._onScrubSnap = function(pos)
      pos = clamp(pos, 0, 1)
      local loopStart = clamp(readParam("/sample/loop_start", 0), 0, 1)
      local loopEnd = clamp(readParam("/sample/loop_end", 1), loopStart + 0.001, 1)
      local rel = clamp((pos - loopStart) / (loopEnd - loopStart), 0, 1)
      writeParam("/granular/position", rel)
      writeParam("/sample/seek", pos)
    end
  end

  local pm = { preset_cloud = "cloud", preset_rain = "rain", preset_texture = "texture", preset_stutter = "stutter", preset_pad = "pad", preset_riser = "riser" }
  for id, name in pairs(pm) do
    local w = ctx.widgets and ctx.widgets[id]
    if w then w._onClick = function() applyPreset(name); refreshWaveform(ctx) end end
  end

  refreshMidi(ctx)
  local dd = ctx.widgets and ctx.widgets.midi_input_dropdown
  if dd then
    dd._onSelect = function(idx)
      local selected = math.max(1, math.floor(tonumber(idx) or 1))
      if selected == 1 then
        if Midi and Midi.closeInput then Midi.closeInput() end
        refreshMidi(ctx)
        return
      end
      if Midi and Midi.openInput then Midi.openInput(selected - 2) end
      refreshMidi(ctx)
    end
  end
  local rb = ctx.widgets and ctx.widgets.midi_refresh_btn
  if rb then rb._onClick = function() refreshMidi(ctx); if not currentMidiLabel() then openPreferredMidi(ctx) end end end
  if Audio == nil or (Audio.isPlugin and not Audio.isPlugin()) then
    if not currentMidiLabel() then openPreferredMidi(ctx) else refreshMidi(ctx) end
  end

  setLabel(ctx.widgets and ctx.widgets.sample_file, "No sample loaded")
  refreshWaveform(ctx)
end

function M.update(ctx)
  for _, w in ipairs(ctx._paramWidgets or {}) do
    local p = w.config and w.config.paramPath
    if p then syncWidgetFromParam(w, p) end
  end

  local mode = readParam("/granular/mode", 1)
  local freeze = readParam("/granular/freeze", 1)
  local liveToggle = ctx.widgets and ctx.widgets.mode_live
  local sampleToggle = ctx.widgets and ctx.widgets.mode_sample
  if liveToggle and liveToggle.setValue then liveToggle._granularSyncing = true; liveToggle:setValue(mode <= 0.5); liveToggle._granularSyncing = false end
  if sampleToggle and sampleToggle.setValue then sampleToggle._granularSyncing = true; sampleToggle:setValue(mode > 0.5); sampleToggle._granularSyncing = false end

  local freezeBtn = ctx.widgets and ctx.widgets.freeze_btn
  if freezeBtn then
    if freezeBtn.setBg then freezeBtn:setBg(freeze > 0.5 and 0xff00c896 or 0xff2a3540) end
    if freezeBtn.setLabel then freezeBtn:setLabel(freeze > 0.5 and "LIVE FROZEN" or "LIVE RECORD") end
  end

  local statusLabel = ctx.widgets and ctx.widgets.waveform_status
  if statusLabel and statusLabel.setText then
    if mode > 0.5 then
      local playing = false
      if type(isSampleRegionPlaybackPlaying) == "function" then
        local ok, p = pcall(isSampleRegionPlaybackPlaying, DISPLAY_SAMPLE_PATH)
        playing = ok and p == true
      end
      statusLabel:setText((playing and "Sample playback" or "Sample buffer") .. " — freeze only affects Live mode")
    else
      statusLabel:setText(freeze > 0.5 and "Live input — ring frozen" or "Live input — recording into grain ring")
    end
  end

  refreshWaveform(ctx)
end

return M
