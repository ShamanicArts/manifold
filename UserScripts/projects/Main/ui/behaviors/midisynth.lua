local M = {}

-- Find this behavior's global ID prefix from the runtime behaviors list.
-- In the standalone MidiSynth this is always "root", but when embedded as a
-- component inside Main tabs it becomes something like
-- "root.tabs.midisynth_tab.midisynth_view".
local function resolveGlobalPrefix(ctx)
  local runtime = _G.__manifoldStructuredUiRuntime
  if runtime and runtime.behaviors then
    for _, b in ipairs(runtime.behaviors) do
      if b.ctx == ctx then
        return b.id or "root"
      end
    end
  end
  return "root"
end

local VOICE_COUNT = 8
local WAVE_OPTIONS = { "Sine", "Saw", "Square", "Triangle", "Blend", "Noise", "Pulse", "SuperSaw" }
local OSC_MODE_OPTIONS = { "Classic", "Sample Loop", "Blend" }
local BLEND_MODE_OPTIONS = { "Mix", "Ring", "FM", "Sync", "XOR" }
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

local FILTER_OPTIONS = { "SVF Lowpass", "SVF Bandpass", "SVF Highpass", "SVF Notch" }
local FX_OPTIONS = {
  "Chorus",
  "Phaser",
  "WaveShaper",
  "Compressor",
  "StereoWidener",
  "Filter",
  "SVF Filter",
  "Reverb",
  "Stereo Delay",
  "Multitap",
  "Pitch Shift",
  "Granulator",
  "Ring Mod",
  "Formant",
  "EQ",
  "Limiter",
  "Transient",
}
local FX_PARAM_LABELS = {
  [0] = { "Rate", "Depth" },
  [1] = { "Rate", "Depth" },
  [2] = { "Drive", "Curve" },
  [3] = { "Thresh", "Ratio" },
  [4] = { "Width", "MonoLow" },
  [5] = { "Cutoff", "Reso" },
  [6] = { "Cutoff", "Reso" },
  [7] = { "Room", "Damp" },
  [8] = { "Time", "FBack" },
  [9] = { "Taps", "FBack" },
  [10] = { "Pitch", "Window" },
  [11] = { "Grain", "Dense" },
  [12] = { "Freq", "Depth" },
  [13] = { "Vowel", "Shift" },
  [14] = { "Low", "High" },
  [15] = { "Thresh", "Drive" },
  [16] = { "Attack", "Sustain" },
}

local PATHS = {
  waveform = "/midi/synth/waveform",
  filterType = "/midi/synth/filterType",
  cutoff = "/midi/synth/cutoff",
  resonance = "/midi/synth/resonance",
  drive = "/midi/synth/drive",
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

  oscMode = "/midi/synth/osc/mode",
  sampleSource = "/midi/synth/sample/source",
  sampleCaptureTrigger = "/midi/synth/sample/captureTrigger",
  sampleCaptureBars = "/midi/synth/sample/captureBars",
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
}

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

-- Lightweight XY pad refresh (no layout rebuild)
local function refreshFxPad(fxCtx)
  if not fxCtx then return end
  local pad = fxCtx.widgets and fxCtx.widgets.xy_pad
  if not pad or not pad.node then return end
  local w = pad.node:getWidth()
  local h = pad.node:getHeight()
  if w <= 0 or h <= 0 then return end
  -- Delegate to behavior's refreshPad if available, else just repaint
  if fxCtx._refreshPad then
    fxCtx._refreshPad()
  else
    pad.node:repaint()
  end
end

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

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(v)
  return math.floor((tonumber(v) or 0) + 0.5)
end

local function repaint(widget)
  if widget and widget.node and widget.node.repaint then
    widget.node:repaint()
  end
end

local function syncValue(widget, value, epsilon)
  if not (widget and widget.setValue and value ~= nil) then
    return
  end
  -- Never fight direct manipulation (knob drag, slider drag, etc.).
  if widget._dragging then
    return
  end
  local current = widget.getValue and widget:getValue() or nil
  local threshold = epsilon or 0.0001
  if current == nil or math.abs((tonumber(current) or 0) - (tonumber(value) or 0)) > threshold then
    widget:setValue(value)
    repaint(widget)
  end
end

local function syncToggleValue(widget, value)
  if not (widget and widget.setValue and value ~= nil) then
    return
  end
  local current = widget.getValue and widget:getValue() or nil
  local nextValue = value == true
  if current ~= nextValue then
    widget:setValue(nextValue)
    repaint(widget)
  end
end

local function syncText(widget, text)
  if not (widget and widget.setText and text ~= nil) then
    return
  end
  local current = widget.getText and widget:getText() or nil
  if current ~= text then
    widget:setText(text)
    repaint(widget)
  end
end

local function syncColour(widget, colour)
  if not (widget and widget.setColour and colour ~= nil) then
    return
  end
  widget:setColour(colour)
  repaint(widget)
end

local function syncSelected(widget, idx)
  if not (widget and widget.setSelected and idx ~= nil) then
    return
  end
  -- Don't mutate selection while a dropdown popup is open.
  if widget._open then
    return
  end
  local current = widget.getSelected and widget:getSelected() or nil
  if current ~= idx then
    widget:setSelected(idx)
    repaint(widget)
  end
end

local function syncKnobLabel(widget, label)
  if not (widget and widget.setLabel and label ~= nil) then
    return
  end
  local current = widget.getLabel and widget:getLabel() or nil
  if current ~= label then
    widget:setLabel(label)
    repaint(widget)
  end
end

local function setPath(path, value)
  if type(setParam) == "function" then
    return setParam(path, tonumber(value) or 0)
  end
  if command then
    command("SET", path, tostring(value))
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

local function noteToFreq(note)
  return 440.0 * (2.0 ^ ((note - 69) / 12.0))
end

local function anchorDropdown(dropdown, name)
  if not dropdown or not dropdown.setAbsolutePos or not dropdown.node then return end
  local ax, ay = 0, 0
  local node = dropdown.node
  local depth = 0
  while node and depth < 20 do
    local bx, by, _, _ = node:getBounds()
    ax = ax + (bx or 0)
    ay = ay + (by or 0)
    local ok, parent = pcall(function() return node:getParent() end)
    if ok and parent and parent ~= node then
      node = parent
    else
      break
    end
    depth = depth + 1
  end
  if name and name:match("oscillator") then
    print("anchorDropdown " .. name .. ": ax=" .. ax .. " ay=" .. ay)
  end
  dropdown:setAbsolutePos(ax, ay)
end

local function updateDropdownAnchors(ctx)
  -- Midi Synth: manually calculate dropdown absolute positions
  -- anchorDropdown doesn't work with nested TabHost layouts because getBounds() returns original positions
  local all = ctx.allWidgets or {}
  local rootId = ctx._globalPrefix or "root"
  
  -- Layout constants (must match resizeLayout)
  local pad = 16
  local gap = 12
  local captureH = 100
  local captureY = pad
  local row1Y = captureY + captureH + gap
  local cardCount = 5
  
  -- Need actual width/height - use stored values or defaults
  local w = ctx._lastW or 1259
  local h = ctx._lastH or 1308
  local totalCardW = w - pad * 2 - gap * (cardCount - 1)
  local cardW = math.floor(totalCardW / cardCount)
  local availableBelow = math.max(200, h - row1Y - pad)
  local keyboardHeaderH = 48
  local keyboardExpandedH = math.max(154, availableBelow - math.max(180, math.floor(availableBelow * 0.45)) - gap)
  local keyboardH = ctx._keyboardCollapsed and keyboardHeaderH or keyboardExpandedH
  local cardH = math.max(180, availableBelow - keyboardH - gap)
  local topStackH = math.floor((cardH - gap) / 2)
  local bottomStackH = cardH - gap - topStackH
  local doubleW = cardW * 2 + gap
  local envX = pad + doubleW + gap
  local fxX = envX + cardW + gap
  local row2Y = row1Y + cardH + gap
  
  local function setAbs(path, x, y)
    local drop = all[rootId .. path]
    if drop and drop.setAbsolutePos then drop:setAbsolutePos(x, y) end
  end
  
  -- midiInputDropdown now lives in the keyboard header
  local midiDropW = 260
  local midiDropX = w - pad - midiDropW - 184
  setAbs(".midiInputDropdown", midiDropX, row2Y + 26)
  
  -- New layout positions
  -- Row 1: ADSR (w1) | Oscillator (w2) | Filter (w2)
  -- Row 2: FX1 (w2) | FX2 (w2) | EQ (w1)
  local adsrX = pad
  local oscX = pad + cardW + gap
  local filterX = pad + cardW + gap + doubleW + gap
  local fx1X = pad
  local fx2X = pad + doubleW + gap
  local eqX = pad + doubleW + gap + doubleW + gap
  local row2Y = row1Y + topStackH + gap

  -- Oscillator component internal layout (50/50 split, pad=10, gap=6)
  local oscPad = 10
  local oscGap = 6
  local oscRightX = oscX + math.floor(doubleW / 2) + oscGap
  local tabBarH = 24
  -- Wave tab
  setAbs(".oscillatorComponent.mode_tabs.wave_tab.waveform_dropdown", oscRightX + 10, row1Y + oscPad + tabBarH + 10)

  -- Also need to read waveform to sync with DSP
  local waveform = round(readParam(PATHS.waveform, 1))
  if oscCtx then oscCtx.waveformType = waveform end
  -- Sample tab
  setAbs(".oscillatorComponent.mode_tabs.sample_tab.sample_source_dropdown", oscRightX + 10, row1Y + oscPad + tabBarH + 8)
  -- NOTE: range_view_dropdown disabled - only global view supported
  -- setAbs(".oscillatorComponent.mode_tabs.sample_tab.range_view_dropdown", oscRightX + 120, row1Y + oscPad + tabBarH + 34)

  -- Filter component
  setAbs(".filterComponent.filter_type_dropdown", filterX + 10, row1Y + oscPad + 16)

  -- FX components have internal 50/50 split, dropdowns are on the right side
  local fxPad = 10
  local fxGap = 6
  local fxSplit = math.floor(doubleW / 2)
  local fx1RightX = fx1X + fxSplit + fxGap
  setAbs(".fx1Component.type_dropdown", fx1RightX + fxPad, row2Y + fxPad + 16)
  setAbs(".fx1Component.xy_x_dropdown", fx1RightX + fxPad, row2Y + fxPad + 100)
  setAbs(".fx1Component.xy_y_dropdown", fx1RightX + fxPad + 94, row2Y + fxPad + 100)
  setAbs(".fx1Component.knob1_dropdown", fx1RightX + fxPad, row2Y + fxPad + 124)
  setAbs(".fx1Component.knob2_dropdown", fx1RightX + fxPad + 94, row2Y + fxPad + 124)

  local fx2RightX = fx2X + fxSplit + fxGap
  setAbs(".fx2Component.type_dropdown", fx2RightX + fxPad, row2Y + fxPad + 16)
  setAbs(".fx2Component.xy_x_dropdown", fx2RightX + fxPad, row2Y + fxPad + 100)
  setAbs(".fx2Component.xy_y_dropdown", fx2RightX + fxPad + 94, row2Y + fxPad + 100)
  setAbs(".fx2Component.knob1_dropdown", fx2RightX + fxPad, row2Y + fxPad + 124)
  setAbs(".fx2Component.knob2_dropdown", fx2RightX + fxPad + 94, row2Y + fxPad + 124)
end



local function freqToNote(freq)
  if freq <= 0 then return 0 end
  return math.floor(69 + 12 * math.log(freq / 440.0) / math.log(2) + 0.5)
end

local function noteName(note)
  if not note then return "--" end
  local names = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" }
  local name = names[(note % 12) + 1] or "?"
  local octave = math.floor(note / 12) - 1
  return name .. octave
end

local function velocityToAmp(velocity)
  return clamp(0.02 + ((tonumber(velocity) or 0) / 127.0) * 0.23, 0.0, 0.25)
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

local function runtimeStatePath()
  local root = projectRoot()
  if root == "" then
    return ""
  end
  return root .. "/editor/runtime_state.lua"
end

loadRuntimeState = function()
  local path = runtimeStatePath()
  if path == "" or type(readTextFile) ~= "function" then
    return {}
  end
  local text = readTextFile(path)
  if type(text) ~= "string" or text == "" then
    return {}
  end
  local chunk, err = load(text, "midi_runtime_state", "t", {})
  if not chunk then
    return {}
  end
  local ok, state = pcall(chunk)
  if not ok or type(state) ~= "table" then
    return {}
  end
  return state
end

saveRuntimeState = function(state)
  local path = runtimeStatePath()
  if path == "" or type(writeTextFile) ~= "function" then
    return false
  end
  
  local lines = {
    "return {",
    string.format("  inputDevice = %q,", tostring(state.inputDevice or "")),
    string.format("  keyboardCollapsed = %s,", state.keyboardCollapsed and "true" or "false"),
    string.format("  waveform = %d,", tonumber(state.waveform) or 1),
    string.format("  filterType = %d,", tonumber(state.filterType) or 0),
    string.format("  cutoff = %.2f,", tonumber(state.cutoff) or 3200),
    string.format("  resonance = %.3f,", tonumber(state.resonance) or 0.75),
    string.format("  drive = %.2f,", tonumber(state.drive) or 1.8),
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
    string.format("  sampleRootNote = %.2f,", tonumber(state.sampleRootNote) or 60.0),
    string.format("  samplePlayStart = %.4f,", tonumber(state.samplePlayStart) or 0.0),
    string.format("  sampleLoopStart = %.4f,", tonumber(state.sampleLoopStart) or 0.0),
    string.format("  sampleLoopLen = %.4f,", tonumber(state.sampleLoopLen) or 1.0),
    string.format("  sampleRetrigger = %d,", tonumber(state.sampleRetrigger) or 1),
    string.format("  blendMode = %d,", tonumber(state.blendMode) or 0),
    string.format("  blendAmount = %.3f,", tonumber(state.blendAmount) or 0.5),
    string.format("  waveToSample = %.3f,", tonumber(state.waveToSample) or 0.5),
    string.format("  sampleToWave = %.3f,", tonumber(state.sampleToWave) or 0.0),
    string.format("  blendKeyTrack = %d,", tonumber(state.blendKeyTrack) or 1),
    string.format("  blendSamplePitch = %.2f,", tonumber(state.blendSamplePitch) or 0.0),
    string.format("  blendModAmount = %.3f,", tonumber(state.blendModAmount) or 0.5),
    string.format("  delayMix = %.3f,", tonumber(state.delayMix) or 0.0),
    string.format("  delayTime = %d,", tonumber(state.delayTime) or 220),
    string.format("  delayFeedback = %.3f,", tonumber(state.delayFeedback) or 0.24),
    string.format("  reverbWet = %.3f,", tonumber(state.reverbWet) or 0.0),
    string.format("  pulseWidth = %.2f,", tonumber(state.pulseWidth) or 0.5),
    string.format("  unison = %d,", tonumber(state.unison) or 1),
    string.format("  detune = %.1f,", tonumber(state.detune) or 0.0),
    string.format("  spread = %.2f,", tonumber(state.spread) or 0.0),
    "}",
  }
  
  return writeTextFile(path, table.concat(lines, "\n"))
end

local function isPluginMode()
  if Audio and Audio.isPlugin then
    return Audio.isPlugin()
  end
  return false
end

local function buildMidiOptions(ctx)
  local devices = Midi and Midi.inputDevices and Midi.inputDevices() or {}
  ctx._midiDevices = devices
  local noneLabel = isPluginMode() and "Use Host MIDI" or "None (Disabled)"
  local options = { noneLabel }
  for _, name in ipairs(devices) do
    options[#options + 1] = name
  end
  return options
end

local function findOptionIndex(options, label)
  if type(label) ~= "string" or label == "" then
    return nil
  end
  for i, option in ipairs(options or {}) do
    if option == label then
      return i
    end
  end
  return nil
end

local function getCurrentMidiInputLabel(ctx)
  if Midi and Midi.currentInputDeviceName then
    local name = Midi.currentInputDeviceName()
    if type(name) == "string" and name ~= "" then
      return name
    end
  end

  if Midi and Midi.currentInputDeviceIndex and Midi.isInputOpen and Midi.isInputOpen() then
    local deviceIndex = tonumber(Midi.currentInputDeviceIndex()) or -1
    if deviceIndex >= 0 then
      local devices = ctx and ctx._midiDevices or (Midi.inputDevices and Midi.inputDevices() or {})
      return devices[deviceIndex + 1]
    end
  end

  return nil
end

local function persistMidiInputSelection(label)
  local state = loadRuntimeState()
  state.inputDevice = tostring(label or "")
  saveRuntimeState(state)
end

local function applyMidiSelection(ctx, idx, persist)
  local widgets = ctx.widgets or {}
  local options = ctx._midiOptions or {}
  local label = options[idx] or options[1] or "None (Disabled)"
  
  ctx._selectedMidiInputIdx = idx
  ctx._selectedMidiInputLabel = label
  
  if idx == 1 then
    if Midi and Midi.closeInput then
      Midi.closeInput()
    end
    ctx._lastEvent = isPluginMode() and "Using host MIDI" or "MIDI input disabled"
    syncText(widgets.deviceValue, "Input: " .. label)
    if persist then
      persistMidiInputSelection("")
    end
    return true
  end
  
  local deviceIndex = idx - 2
  local success = Midi and Midi.openInput and Midi.openInput(deviceIndex) or false
  if success then
    local activeLabel = getCurrentMidiInputLabel(ctx) or label
    local activeIdx = findOptionIndex(options, activeLabel) or idx
    ctx._selectedMidiInputIdx = activeIdx
    ctx._selectedMidiInputLabel = activeLabel
    ctx._lastEvent = "Opened: " .. activeLabel
    syncSelected(widgets.midiInputDropdown, activeIdx)
    syncText(widgets.deviceValue, "Input: " .. activeLabel)
    if persist then
      persistMidiInputSelection(activeLabel)
    end
    return true
  end
  
  ctx._lastEvent = "Failed: " .. label
  return false
end

local function refreshMidiDevices(ctx, restoreSelection)
  local widgets = ctx.widgets or {}
  local options = buildMidiOptions(ctx)
  ctx._midiOptions = options
  ctx._lastKnownMidiDeviceCount = math.max(0, #options - 1)
  
  if widgets.midiInputDropdown then
    widgets.midiInputDropdown:setOptions(options)
    repaint(widgets.midiInputDropdown)
  end

  local activeLabel = getCurrentMidiInputLabel(ctx)
  local activeIdx = findOptionIndex(options, activeLabel)
  local idx = activeIdx or 1

  local saved = restoreSelection and loadRuntimeState() or nil
  if not activeIdx and saved and saved.inputDevice then
    local savedIdx = findOptionIndex(options, saved.inputDevice)
    if savedIdx then
      idx = savedIdx
    end
  elseif not activeIdx and ctx._selectedMidiInputLabel then
    local currentIdx = findOptionIndex(options, ctx._selectedMidiInputLabel)
    if currentIdx then
      idx = currentIdx
    end
  end
  
  syncSelected(widgets.midiInputDropdown, idx)
  ctx._selectedMidiInputIdx = idx
  ctx._selectedMidiInputLabel = options[idx] or options[1]
  
  if not activeIdx and restoreSelection and idx > 1 then
    applyMidiSelection(ctx, idx, false)
  else
    if activeLabel then
      ctx._selectedMidiInputLabel = activeLabel
      ctx._selectedMidiInputIdx = activeIdx or idx
    end
    syncText(widgets.deviceValue, "Input: " .. (ctx._selectedMidiInputLabel or options[1] or "None"))
  end
end

local function maybeRefreshMidiDevices(ctx, now)
  if not (Midi and Midi.inputDevices) then
    return
  end
  if (now - (ctx._lastMidiDeviceScanTime or 0)) < 1.0 then
    return
  end
  ctx._lastMidiDeviceScanTime = now

  local devices = Midi.inputDevices() or {}
  local deviceCount = #devices
  local activeLabel = getCurrentMidiInputLabel(ctx)
  local selectedLabel = ctx._selectedMidiInputLabel or ""
  local options = ctx._midiOptions or {}
  local dropdownOpen = ctx.widgets and ctx.widgets.midiInputDropdown and ctx.widgets.midiInputDropdown._open

  local shouldRefresh = false
  if deviceCount ~= (ctx._lastKnownMidiDeviceCount or -1) then
    shouldRefresh = true
  elseif deviceCount > 0 and #options <= 1 then
    shouldRefresh = true
  elseif activeLabel and activeLabel ~= selectedLabel then
    shouldRefresh = true
  elseif deviceCount > 0 and (selectedLabel == "" or selectedLabel == "None (Disabled)" or selectedLabel == "Use Host MIDI") then
    local saved = loadRuntimeState()
    if saved and type(saved.inputDevice) == "string" and saved.inputDevice ~= "" then
      shouldRefresh = true
    end
  end

  ctx._lastKnownMidiDeviceCount = deviceCount
  if shouldRefresh and not dropdownOpen then
    refreshMidiDevices(ctx, true)
  end
end

-- ADSR envelope calculation
local function calculateEnvelope(ctx, voiceIndex, dt)
  local voice = ctx._voices[voiceIndex]
  if not voice then return 0 end
  
  local adsr = ctx._adsr
  local gate = voice.gate
  local level = voice.envelopeLevel or 0
  local stage = voice.envelopeStage or "idle"
  
  if gate > 0.5 then
    if stage == "idle" or stage == "release" then
      stage = "attack"
      voice.envelopeStartLevel = level
    end
    
    if stage == "attack" then
      local attackTime = math.max(0.001, adsr.attack)
      local progress = (voice.envelopeTime or 0) / attackTime
      if progress >= 1 then
        level = 1
        stage = "decay"
        voice.envelopeTime = 0
        voice.envelopeStartLevel = 1
      else
        level = voice.envelopeStartLevel + (1 - voice.envelopeStartLevel) * progress
      end
    elseif stage == "decay" then
      local decayTime = math.max(0.001, adsr.decay)
      local progress = (voice.envelopeTime or 0) / decayTime
      local sustainLevel = adsr.sustain
      if progress >= 1 then
        level = sustainLevel
        stage = "sustain"
      else
        level = 1 - (1 - sustainLevel) * progress
      end
    elseif stage == "sustain" then
      level = adsr.sustain
    end
  else
    if stage ~= "release" and stage ~= "idle" then
      stage = "release"
      voice.envelopeTime = 0
      voice.envelopeStartLevel = level
    end
    
    if stage == "release" then
      local releaseTime = math.max(0.001, adsr.release)
      local progress = (voice.envelopeTime or 0) / releaseTime
      if progress >= 1 then
        level = 0
        stage = "idle"
      else
        level = voice.envelopeStartLevel * (1 - progress)
      end
    end
  end
  
  voice.envelopeStage = stage
  voice.envelopeLevel = level
  voice.envelopeTime = (voice.envelopeTime or 0) + dt
  
  return level * voice.targetAmp
end

local function updateEnvelopes(ctx, dt, now)
  for i = 1, VOICE_COUNT do
    local voice = ctx._voices[i]
    if voice then
      local amp = calculateEnvelope(ctx, i, dt)
      voice.currentAmp = amp

      local sentAmp = voice.sentAmp or 0
      local elapsed = now - (voice.lastAmpPushTime or 0)
      local changedEnough = math.abs(amp - sentAmp) >= VOICE_AMP_SEND_EPSILON
      local atRestEdge = (amp <= VOICE_AMP_SEND_EPSILON and sentAmp > VOICE_AMP_SEND_EPSILON)

      if changedEnough and (elapsed >= VOICE_AMP_SEND_INTERVAL or atRestEdge) then
        voice.sentAmp = amp
        voice.lastAmpPushTime = now
        setPath(voiceAmpPath(i), amp)
      end
    end
  end
end

local function chooseVoice(ctx, note, velocity)
  -- First, try to find an inactive voice
  for i = 1, VOICE_COUNT do
    local voice = ctx._voices[i]
    if not voice.active or voice.envelopeStage == "idle" then
      return i
    end
  end
  
  -- All voices active - use smart stealing
  local adsr = ctx._adsr
  
  -- Option 1: Steal voice in release stage with lowest level
  local bestReleaseIndex = nil
  local bestReleaseLevel = 999
  for i = 1, VOICE_COUNT do
    local voice = ctx._voices[i]
    if voice.envelopeStage == "release" then
      if voice.envelopeLevel < bestReleaseLevel then
        bestReleaseLevel = voice.envelopeLevel
        bestReleaseIndex = i
      end
    end
  end
  if bestReleaseIndex then
    return bestReleaseIndex
  end
  
  -- Option 2: Steal oldest voice (highest stamp)
  local oldestIndex = 1
  local oldestStamp = ctx._voices[1].stamp or 0
  for i = 2, VOICE_COUNT do
    local stamp = ctx._voices[i].stamp or 0
    if stamp < oldestStamp then
      oldestStamp = stamp
      oldestIndex = i
    end
  end
  return oldestIndex
end

local function triggerVoice(ctx, note, velocity)
  local index = chooseVoice(ctx, note, velocity)
  local voice = ctx._voices[index]
  
  ctx._voiceStamp = (ctx._voiceStamp or 0) + 1
  
  voice.active = true
  voice.note = note
  voice.stamp = ctx._voiceStamp
  voice.targetAmp = velocityToAmp(velocity)
  voice.currentAmp = 0  -- ADSR starts at 0
  voice.gate = 1
  voice.envelopeStage = "attack"
  voice.envelopeTime = 0
  voice.envelopeStartLevel = 0
  voice.envelopeLevel = 0
  voice.currentAmp = 0
  voice.sentAmp = -1 -- force immediate first amp push on next envelope tick
  voice.lastAmpPushTime = 0
  voice.freq = noteToFreq(note)
  
  setPath(voiceFreqPath(index), voice.freq)
  setPath(voiceGatePath(index), 1)
  ctx._keyboardDirty = true
  
  return index
end

local function releaseVoice(ctx, note)
  for i = 1, VOICE_COUNT do
    local voice = ctx._voices[i]
    if voice.active and voice.note == note then
      voice.gate = 0
      voice.envelopeStage = "release"
      voice.envelopeTime = 0
      voice.envelopeStartLevel = voice.envelopeLevel or voice.targetAmp
      voice.lastAmpPushTime = 0
      setPath(voiceGatePath(i), 0)
      ctx._keyboardDirty = true
    end
  end
end

local function panicVoices(ctx)
  for i = 1, VOICE_COUNT do
    local voice = ctx._voices[i]
    voice.active = false
    voice.note = nil
    voice.stamp = 0
    voice.gate = 0
    voice.targetAmp = 0
    voice.currentAmp = 0
    voice.sentAmp = 0
    voice.lastAmpPushTime = 0
    voice.envelopeStage = "idle"
    voice.envelopeLevel = 0
    voice.freq = 220
    setPath(voiceAmpPath(i), 0)
    setPath(voiceGatePath(i), 0)
  end
  ctx._keyboardDirty = true
end

local function activeVoiceCount(ctx)
  local count = 0
  for i = 1, VOICE_COUNT do
    local voice = ctx._voices[i]
    if voice.active and voice.envelopeStage ~= "idle" then
      count = count + 1
    end
  end
  return count
end

local function voiceSummary(ctx)
  local notes = {}
  for i = 1, VOICE_COUNT do
    local voice = ctx._voices[i]
    if voice.active and voice.note and voice.envelopeStage ~= "idle" then
      notes[#notes + 1] = noteName(voice.note)
    end
  end
  if #notes == 0 then
    return "Voices: idle"
  end
  return "Voices: " .. table.concat(notes, "  ")
end

local resizeLayout

local function getOctaveLabel(baseOctave)
  local startNote = "C" .. baseOctave
  local endNote = "C" .. (baseOctave + 2)
  return startNote .. "-" .. endNote
end

local function syncKeyboardCollapseButton(ctx)
  local widgets = ctx.widgets or {}
  if widgets.keyboardCollapse and widgets.keyboardCollapse.setLabel then
    widgets.keyboardCollapse:setLabel(ctx._keyboardCollapsed and "▶" or "▼")
    repaint(widgets.keyboardCollapse)
  end
end

local function setKeyboardCollapsed(ctx, collapsed)
  ctx._keyboardCollapsed = collapsed == true
  syncKeyboardCollapseButton(ctx)
  if ctx._lastW and ctx._lastH then
    resizeLayout(ctx, ctx._lastW, ctx._lastH)
  end
end

local function saveCurrentState(ctx)
  local state = {
    inputDevice = ctx._selectedMidiInputLabel or "",
    keyboardCollapsed = ctx._keyboardCollapsed == true,
    waveform = round(readParam(PATHS.waveform, 1)),
    filterType = round(readParam(PATHS.filterType, 0)),
    cutoff = readParam(PATHS.cutoff, 3200),
    resonance = readParam(PATHS.resonance, 0.75),
    drive = readParam(PATHS.drive, 1.8),
    output = readParam(PATHS.output, 0.8),
    attack = readParam(PATHS.attack, 0.05),
    decay = readParam(PATHS.decay, 0.2),
    sustain = readParam(PATHS.sustain, 0.7),
    release = readParam(PATHS.release, 0.4),
    fx1Type = round(readParam(PATHS.fx1Type, 0)),
    fx1Mix = readParam(PATHS.fx1Mix, 0.0),
    fx2Type = round(readParam(PATHS.fx2Type, 0)),
    fx2Mix = readParam(PATHS.fx2Mix, 0.0),
    oscMode = round(readParam(PATHS.oscMode, 0)),
    sampleSource = round(readParam(PATHS.sampleSource, 0)),
    sampleCaptureBars = readParam(PATHS.sampleCaptureBars, 1.0),
    sampleRootNote = readParam(PATHS.sampleRootNote, 60.0),
    samplePlayStart = readParam(PATHS.samplePlayStart, 0.0),
    sampleLoopStart = readParam(PATHS.sampleLoopStart, 0.0),
    sampleLoopLen = readParam(PATHS.sampleLoopLen, 1.0),
    sampleRetrigger = round(readParam(PATHS.sampleRetrigger, 1)),
    blendMode = round(readParam(PATHS.blendMode, 0)),
    blendAmount = readParam(PATHS.blendAmount, 0.5),
    waveToSample = readParam(PATHS.waveToSample, 0.5),
    sampleToWave = readParam(PATHS.sampleToWave, 0.0),
    blendKeyTrack = round(readParam(PATHS.blendKeyTrack, 1)),
    blendSamplePitch = readParam(PATHS.blendSamplePitch, 0.0),
    blendModAmount = readParam(PATHS.blendModAmount, 0.5),
    delayMix = readParam(PATHS.delayMix, 0.0),
    delayTime = round(readParam(PATHS.delayTimeL, 220)),
    delayFeedback = readParam(PATHS.delayFeedback, 0.24),
    reverbWet = readParam(PATHS.reverbWet, 0.0),
    eqOutput = readParam(PATHS.eqOutput, 0.0),
    eqMix = readParam(PATHS.eqMix, 1.0),
    -- New oscillator parameters
    pulseWidth = readParam(PATHS.pulseWidth, 0.5),
    unison = round(readParam(PATHS.unison, 1)),
    detune = readParam(PATHS.detune, 0.0),
    spread = readParam(PATHS.spread, 0.0),
  }
  for i = 1, 8 do
    state["eqBandEnabled" .. i] = round(readParam(eq8BandEnabledPath(i), 0))
    state["eqBandType" .. i] = round(readParam(eq8BandTypePath(i), i == 1 and 1 or (i == 8 and 2 or 0)))
    state["eqBandFreq" .. i] = readParam(eq8BandFreqPath(i), ({60, 120, 250, 500, 1000, 2500, 6000, 12000})[i])
    state["eqBandGain" .. i] = readParam(eq8BandGainPath(i), 0.0)
    state["eqBandQ" .. i] = readParam(eq8BandQPath(i), (i == 1 or i == 8) and 0.8 or 1.0)
  end
  
  if saveRuntimeState(state) then
    ctx._lastEvent = "State saved"
  else
    ctx._lastEvent = "Save failed"
  end
end

local function loadSavedState(ctx)
  local state = loadRuntimeState()
  if not state or not next(state) then
    ctx._lastEvent = "No saved state"
    return
  end

  if state.keyboardCollapsed ~= nil then
    setKeyboardCollapsed(ctx, state.keyboardCollapsed == true)
  end

  -- Apply all saved parameters
  if state.waveform then
    setPath(PATHS.waveform, state.waveform)
  end
  if state.cutoff then
    setPath(PATHS.cutoff, state.cutoff)
  end
  if state.resonance then
    setPath(PATHS.resonance, state.resonance)
  end
  if state.drive then
    setPath(PATHS.drive, state.drive)
  end
  if state.output then
    setPath(PATHS.output, state.output)
  end
  if state.attack then
    setPath(PATHS.attack, state.attack)
  end
  if state.decay then
    setPath(PATHS.decay, state.decay)
  end
  if state.sustain then
    setPath(PATHS.sustain, state.sustain)
  end
  if state.release then
    setPath(PATHS.release, state.release)
  end
  if state.chorusMix then
    setPath(PATHS.chorusMix, state.chorusMix)
  end
  if state.delayMix then
    setPath(PATHS.delayMix, state.delayMix)
  end
  if state.delayTime then
    setPath(PATHS.delayTimeL, state.delayTime)
    setPath(PATHS.delayTimeR, state.delayTime * 1.5)
  end
  if state.delayFeedback then
    setPath(PATHS.delayFeedback, state.delayFeedback)
  end
  if state.reverbWet then
    setPath(PATHS.reverbWet, state.reverbWet)
  end
  if state.eqOutput ~= nil then
    setPath(PATHS.eqOutput, state.eqOutput)
  end
  if state.eqMix ~= nil then
    setPath(PATHS.eqMix, state.eqMix)
  end
  for i = 1, 8 do
    if state["eqBandEnabled" .. i] ~= nil then setPath(eq8BandEnabledPath(i), state["eqBandEnabled" .. i]) end
    if state["eqBandType" .. i] ~= nil then setPath(eq8BandTypePath(i), state["eqBandType" .. i]) end
    if state["eqBandFreq" .. i] ~= nil then setPath(eq8BandFreqPath(i), state["eqBandFreq" .. i]) end
    if state["eqBandGain" .. i] ~= nil then setPath(eq8BandGainPath(i), state["eqBandGain" .. i]) end
    if state["eqBandQ" .. i] ~= nil then setPath(eq8BandQPath(i), state["eqBandQ" .. i]) end
  end
  if state.filterType then
    setPath(PATHS.filterType, state.filterType)
  end
  if state.fx1Type then setPath(PATHS.fx1Type, state.fx1Type) end
  if state.fx1Mix then setPath(PATHS.fx1Mix, state.fx1Mix) end
  if state.fx2Type then setPath(PATHS.fx2Type, state.fx2Type) end
  if state.fx2Mix then setPath(PATHS.fx2Mix, state.fx2Mix) end
  if state.oscMode ~= nil then setPath(PATHS.oscMode, state.oscMode) end
  if state.sampleSource ~= nil then setPath(PATHS.sampleSource, state.sampleSource) end
  if state.sampleCaptureBars ~= nil then setPath(PATHS.sampleCaptureBars, state.sampleCaptureBars) end
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
  -- New oscillator parameters
  if state.pulseWidth ~= nil then setPath(PATHS.pulseWidth, state.pulseWidth) end
  if state.unison ~= nil then setPath(PATHS.unison, state.unison) end
  if state.detune ~= nil then setPath(PATHS.detune, state.detune) end
  if state.spread ~= nil then setPath(PATHS.spread, state.spread) end

  -- Update ADSR cache
  ctx._adsr.attack = state.attack or 0.05
  ctx._adsr.decay = state.decay or 0.2
  ctx._adsr.sustain = state.sustain or 0.7
  ctx._adsr.release = state.release or 0.4
  
  ctx._lastEvent = "State loaded"
end

local function resetToDefaults(ctx)
  setPath(PATHS.waveform, 1)
  setPath(PATHS.filterType, 0)
  setPath(PATHS.cutoff, 3200)
  setPath(PATHS.resonance, 0.75)
  setPath(PATHS.drive, 1.8)
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
  setPath(PATHS.sampleRootNote, 60.0)
  setPath(PATHS.samplePlayStart, 0.0)
  setPath(PATHS.sampleLoopStart, 0.0)
  setPath(PATHS.sampleLoopLen, 1.0)
  setPath(PATHS.sampleRetrigger, 1.0)
  setPath(PATHS.blendMode, 0)
  setPath(PATHS.blendAmount, 0.5)
  setPath(PATHS.waveToSample, 0.5)
  setPath(PATHS.sampleToWave, 0.0)
  setPath(PATHS.blendKeyTrack, 1.0)
  setPath(PATHS.blendSamplePitch, 0.0)
  setPath(PATHS.blendModAmount, 0.5)
  for i = 0, MAX_FX_PARAMS - 1 do
    setPath(fxParamPath(1, i + 1), 0.5)
    setPath(fxParamPath(2, i + 1), 0.5)
  end
  setPath(PATHS.delayMix, 0.0)
  setPath(PATHS.delayTimeL, 220)
  setPath(PATHS.delayTimeR, 330)
  setPath(PATHS.delayFeedback, 0.24)
  setPath(PATHS.reverbWet, 0.0)
  setPath(PATHS.eqOutput, 0.0)
  setPath(PATHS.eqMix, 1.0)
  -- New oscillator parameters
  setPath(PATHS.pulseWidth, 0.5)
  setPath(PATHS.unison, 1)
  setPath(PATHS.detune, 0.0)
  setPath(PATHS.spread, 0.0)
  for i = 1, 8 do
    setPath(eq8BandEnabledPath(i), 0)
    setPath(eq8BandTypePath(i), i == 1 and 1 or (i == 8 and 2 or 0))
    setPath(eq8BandFreqPath(i), ({60, 120, 250, 500, 1000, 2500, 6000, 12000})[i])
    setPath(eq8BandGainPath(i), 0.0)
    setPath(eq8BandQPath(i), (i == 1 or i == 8) and 0.8 or 1.0)
  end
  
  ctx._adsr = { attack = 0.05, decay = 0.2, sustain = 0.7, release = 0.4 }
  ctx._keyboardOctave = 3
  setKeyboardCollapsed(ctx, false)
  ctx._lastEvent = "Reset to defaults"
end

local KEYBOARD_WHITE_KEYS = { 0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23 }
local KEYBOARD_BLACK_KEYS = { 1, 3, 6, 8, 10, 13, 15, 18, 20, 22 }
local KEYBOARD_BLACK_KEY_POSITIONS = { 1, 2, 4, 5, 6, 8, 9, 11, 12, 13 }

local function isKeyboardNoteActive(ctx, note)
  for j = 1, VOICE_COUNT do
    local voice = ctx._voices[j]
    if voice and voice.active and voice.note == note and voice.gate > 0.5 then
      return true
    end
  end
  return false
end

local function buildKeyboardDisplayList(ctx, w, h)
  local display = {}
  if w <= 0 or h <= 0 then
    return display
  end

  local whiteKeyWidth = w / 14
  local blackKeyWidth = whiteKeyWidth * 0.6
  local baseNote = ctx._keyboardOctave * 12

  for i, offset in ipairs(KEYBOARD_WHITE_KEYS) do
    local note = baseNote + offset
    local x = (i - 1) * whiteKeyWidth
    local isActive = isKeyboardNoteActive(ctx, note)
    local keyX = math.floor(x + 2)
    local keyY = 2
    local keyW = math.max(1, math.floor(whiteKeyWidth - 4))
    local keyH = math.max(1, math.floor(h - 4))

    display[#display + 1] = {
      cmd = "fillRoundedRect",
      x = keyX,
      y = keyY,
      w = keyW,
      h = keyH,
      radius = 4,
      color = isActive and 0xff4ade80 or 0xfff1f5f9,
    }
    display[#display + 1] = {
      cmd = "drawRoundedRect",
      x = keyX,
      y = keyY,
      w = keyW,
      h = keyH,
      radius = 4,
      thickness = 1,
      color = 0xff64748b,
    }
  end

  for i, offset in ipairs(KEYBOARD_BLACK_KEYS) do
    local note = baseNote + offset
    local pos = KEYBOARD_BLACK_KEY_POSITIONS[i]
    local x = pos * whiteKeyWidth - blackKeyWidth / 2
    local isActive = isKeyboardNoteActive(ctx, note)
    local keyX = math.floor(x)
    local keyY = 2
    local keyW = math.max(1, math.floor(blackKeyWidth))
    local keyH = math.max(1, math.floor(h * 0.6))

    display[#display + 1] = {
      cmd = "fillRoundedRect",
      x = keyX,
      y = keyY,
      w = keyW,
      h = keyH,
      radius = 3,
      color = isActive and 0xff22d3ee or 0xff1e293b,
    }
    display[#display + 1] = {
      cmd = "drawRoundedRect",
      x = keyX,
      y = keyY,
      w = keyW,
      h = keyH,
      radius = 3,
      thickness = 1,
      color = 0xff0f172a,
    }
  end

  return display
end

local function syncKeyboardDisplay(ctx)
  local widgets = ctx.widgets or {}
  local canvas = widgets.keyboardCanvas
  if not (canvas and canvas.node and canvas.node.setDisplayList) then
    return
  end

  local w = canvas.node:getWidth()
  local h = canvas.node:getHeight()
  canvas.node:setDisplayList(buildKeyboardDisplayList(ctx, w, h))
  repaint(canvas)
end

local function handleKeyboardClick(ctx, x, y, isDown)
  local widgets = ctx.widgets or {}
  local canvas = widgets.keyboardCanvas
  if not canvas or not canvas.node then return end
  
  local w = canvas.node:getWidth()
  local h = canvas.node:getHeight()
  local whiteKeyWidth = w / 14
  local baseNote = ctx._keyboardOctave * 12
  
  local blackKeyWidth = whiteKeyWidth * 0.6
  local blackKeyHeight = h * 0.6
  local hitNote = nil

  -- Check black keys first (they're on top)
  if y <= blackKeyHeight then
    for i, offset in ipairs(KEYBOARD_BLACK_KEYS) do
      local pos = KEYBOARD_BLACK_KEY_POSITIONS[i]
      local kx = pos * whiteKeyWidth - blackKeyWidth / 2
      if x >= kx and x <= kx + blackKeyWidth then
        hitNote = baseNote + offset
        break
      end
    end
  end

  -- Fall through to white keys if no black key hit
  if not hitNote then
    local keyIndex = math.floor(x / whiteKeyWidth) + 1
    if keyIndex >= 1 and keyIndex <= #KEYBOARD_WHITE_KEYS then
      hitNote = baseNote + KEYBOARD_WHITE_KEYS[keyIndex]
    end
  end

  if hitNote then
    if isDown then
      triggerVoice(ctx, hitNote, 100)
      ctx._keyboardNote = hitNote
      ctx._currentNote = hitNote
      ctx._lastEvent = string.format("Note: %s vel 100", noteName(hitNote))
    else
      releaseVoice(ctx, hitNote)
      if ctx._keyboardNote == hitNote then
        ctx._keyboardNote = nil
      end
      if ctx._currentNote == hitNote then
        ctx._currentNote = nil
      end
    end
  end
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
    ".oscillatorComponent.mode_tabs.sample_tab.sample_source_dropdown",
    ".oscillatorComponent.mode_tabs.sample_tab.sample_bars_box",
    ".oscillatorComponent.mode_tabs.sample_tab.sample_root_box",
    ".oscillatorComponent.mode_tabs.sample_tab.sample_start_box",
    ".oscillatorComponent.mode_tabs.sample_tab.sample_len_box",
    ".oscillatorComponent.mode_tabs.wave_tab.drive_knob",
    ".oscillatorComponent.output_knob",
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
    ".fx1Component.knob1_dropdown",
    ".fx1Component.knob2_dropdown",
    ".fx1Component.knob1",
    ".fx1Component.knob2",
    ".fx1Component.mix_knob",
    ".fx2Component.type_dropdown",
    ".fx2Component.xy_x_dropdown",
    ".fx2Component.xy_y_dropdown",
    ".fx2Component.knob1_dropdown",
    ".fx2Component.knob2_dropdown",
    ".fx2Component.knob1",
    ".fx2Component.knob2",
    ".fx2Component.mix_knob",
  }

  for _, suffix in ipairs(trackedSuffixes) do
    if widgetBusy(all[rootId .. suffix]) then
      return true
    end
  end

  if (ctx._fx1Ctx and ctx._fx1Ctx.dragging) or (ctx._fx2Ctx and ctx._fx2Ctx.dragging) then
    return true
  end

  return false
end

-- Background tick: MIDI polling + envelope processing.
-- Stored as a global so the root behavior can call it every frame,
-- even when the MidiSynth tab is not active.
local function backgroundTick(ctx)
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

      if event.type == Midi.NOTE_ON and event.data2 > 0 then
        ctx._currentNote = event.data1
        triggerVoice(ctx, event.data1, event.data2)
        ctx._lastEvent = string.format("Note: %s vel %d", noteName(event.data1), event.data2)
      elseif event.type == Midi.NOTE_OFF or (event.type == Midi.NOTE_ON and event.data2 == 0) then
        releaseVoice(ctx, event.data1)
        if ctx._currentNote == event.data1 then
          ctx._currentNote = nil
        end
      elseif event.type == Midi.CONTROL_CHANGE then
        ctx._lastEvent = string.format("CC %d = %d", event.data1, event.data2)
      end
    end
  end

  -- Update ADSR envelopes (drives voice amplitude via setParam)
  local attack = readParam(PATHS.attack, 0.05)
  local decay = readParam(PATHS.decay, 0.2)
  local sustain = readParam(PATHS.sustain, 0.7)
  local release = readParam(PATHS.release, 0.4)
  ctx._adsr.attack = attack
  ctx._adsr.decay = decay
  ctx._adsr.sustain = sustain
  ctx._adsr.release = release
  updateEnvelopes(ctx, dt, now)
end

function M.init(ctx)
  local widgets = ctx.widgets or {}
  ctx._currentNote = nil
  ctx._lastEvent = "No MIDI yet"
  ctx._voiceStamp = 0
  ctx._voices = {}
  ctx._selectedMidiInputIdx = 1
  ctx._selectedMidiInputLabel = "None (Disabled)"
  ctx._adsr = { attack = 0.05, decay = 0.2, sustain = 0.7, release = 0.4 }
  ctx._keyboardOctave = 3
  ctx._keyboardCollapsed = false
  ctx._keyboardNote = nil
  ctx._keyboardDirty = true
  ctx._lastUpdateTime = getTime and getTime() or 0
  ctx._lastMidiDeviceScanTime = -1000
  ctx._lastKnownMidiDeviceCount = -1
  ctx._lastBackgroundTickTime = 0
  ctx._lastOscRepaintTime = 0
  ctx._lastEnvRepaintTime = 0
  
  -- Port specifications for signal routing visualization
  -- Loaded from component UI files
  ctx._portSpecs = {
    envelopeComponent = { outputs = {{ id = "cv_out", type = "cv", y = 0.5 }} },
    oscillatorComponent = { 
      inputs = {{ id = "cv_in", type = "cv", y = 0.35 }},
      outputs = {{ id = "audio_out", type = "audio", y = 0.65 }}
    },
    filterComponent = {
      inputs = {{ id = "audio_in", type = "audio", y = 0.5 }},
      outputs = {{ id = "audio_out", type = "audio", y = 0.5 }}
    },
    fx1Component = {
      inputs = {{ id = "audio_in", type = "audio", y = 0.5 }},
      outputs = {{ id = "audio_out", type = "audio", y = 0.5 }}
    },
    fx2Component = {
      inputs = {{ id = "audio_in", type = "audio", y = 0.5 }},
      outputs = {{ id = "audio_out", type = "audio", y = 0.5 }}
    },
    eqComponent = {
      inputs = {{ id = "audio_in", type = "audio", y = 0.5 }}
    },
  }
  
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
    }
  end
  
  if Midi and Midi.clearCallbacks then
    -- Don't clear callbacks here - we want MIDI to keep working globally
    -- Midi.clearCallbacks()
  end
  
  -- Wire up component behaviors via allWidgets + runtime.behaviors
  local all = ctx.allWidgets or {}
  ctx._globalPrefix = resolveGlobalPrefix(ctx)
  local rootId = ctx._globalPrefix
  local runtime = _G.__manifoldStructuredUiRuntime
  local function findBehavior(id)
    if runtime and runtime.behaviors then
      for _, b in ipairs(runtime.behaviors) do
        if b.id == id then return b end
      end
    end
    return nil
  end

  -- Oscillator component → DSP
  local oscBehavior = findBehavior(rootId .. ".oscillatorComponent")
  local oscCtx = oscBehavior and oscBehavior.ctx or nil
  local oscModule = oscBehavior and oscBehavior.module or nil
  ctx._oscCtx = oscCtx
  ctx._oscModule = oscModule

  local oscWfDrop = all[rootId .. ".oscillatorComponent.mode_tabs.wave_tab.waveform_dropdown"]
  local oscSampleSourceDrop = all[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_source_dropdown"]
  local oscSampleCaptureBtn = all[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_capture_button"]
  local oscSampleBarsBox = all[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_bars_box"]
  local oscSampleRootBox = all[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_root_box"]
  local oscSampleStartBox = all[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_start_box"]
  local oscSampleLenBox = all[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_len_box"]
  local oscSampleXfadeBox = all[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_xfade_box"]
  -- NOTE: range_view_dropdown disabled - only global view supported
  -- local oscRangeViewDrop = all[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.range_view_dropdown"]

  -- Wire up range bar callbacks to DSP (after NumberBoxes are defined)
  if oscCtx then
    oscCtx._onRangeChange = function(which, value)
      if which == "start" then
        setPath(PATHS.sampleLoopStart, clamp(value, 0.0, 0.95))
        if oscSampleStartBox and oscSampleStartBox.setValue then
          oscSampleStartBox:setValue(math.floor(value * 100))
        end
      elseif which == "len" then
        setPath(PATHS.sampleLoopLen, clamp(value, 0.05, 1.0))
        if oscSampleLenBox and oscSampleLenBox.setValue then
          oscSampleLenBox:setValue(math.floor(value * 100))
        end
      end
    end
    oscCtx._onPlayStartChange = function(value)
      setPath(PATHS.samplePlayStart, clamp(value, 0.0, 0.99))
    end
    -- NOTE: _onVoiceRangeChange disabled - only global view supported
    -- oscCtx._onVoiceRangeChange = function(voiceIdx, which, value) ... end
  end

  local oscDrive = all[rootId .. ".oscillatorComponent.mode_tabs.wave_tab.drive_knob"]
  local oscOutput = all[rootId .. ".oscillatorComponent.output_knob"]
  -- New oscillator parameter knobs
  local oscPulseWidth = all[rootId .. ".oscillatorComponent.mode_tabs.wave_tab.pulse_width_knob"]
  local oscUnison = all[rootId .. ".oscillatorComponent.mode_tabs.wave_tab.unison_knob"]
  local oscDetune = all[rootId .. ".oscillatorComponent.mode_tabs.wave_tab.detune_knob"]
  local oscSpread = all[rootId .. ".oscillatorComponent.mode_tabs.wave_tab.spread_knob"]
  local oscBlendModeDrop = all[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.blend_mode_dropdown"]
  local oscBlendKeyTrack = all[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.blend_key_track_toggle"]
  local oscBlendAmount = all[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.blend_amount_knob"]
  local oscWaveToSample = all[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.wave_to_sample_knob"]
  local oscSampleToWave = all[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.sample_to_wave_knob"]
  local oscBlendSamplePitch = all[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.blend_sample_pitch_knob"]
  local oscBlendModAmount = all[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.blend_mod_amount_knob"]

  local function refreshOscGraph()
    if oscCtx and oscModule then oscModule.resized(oscCtx) end
  end

  if oscSampleSourceDrop and oscSampleSourceDrop.setOptions then
    oscSampleSourceDrop:setOptions(SAMPLE_SOURCE_OPTIONS)
  end
  if oscBlendModeDrop and oscBlendModeDrop.setOptions then
    oscBlendModeDrop:setOptions(BLEND_MODE_OPTIONS)
  end

  if oscWfDrop then oscWfDrop._onSelect = function(idx)
    setPath(PATHS.waveform, idx - 1)
    if oscCtx then
      oscCtx.waveformType = idx - 1
      refreshOscGraph()
      -- Update knob layout (show/hide Width knob for Pulse)
      if oscModule and oscModule.updateKnobLayout then
        oscModule.updateKnobLayout(oscCtx)
      end
    end
  end end
  if oscSampleSourceDrop then oscSampleSourceDrop._onSelect = function(idx)
    setPath(PATHS.sampleSource, idx - 1)
  end end
  if oscSampleCaptureBtn then oscSampleCaptureBtn._onClick = function()
    print("Capture button clicked!")
    setPath(PATHS.sampleCaptureTrigger, 1)
    ctx._lastEvent = "Sample captured"
    if oscCtx then oscCtx._cachedPeaks = nil end
  end end
  if oscSampleBarsBox then oscSampleBarsBox._onChange = function(v)
    setPath(PATHS.sampleCaptureBars, v)
  end end
  if oscSampleRootBox then oscSampleRootBox._onChange = function(v)
    setPath(PATHS.sampleRootNote, round(v))
  end end
  if oscSampleStartBox then oscSampleStartBox._onChange = function(v)
    -- NOTE: Only global view supported
    setPath(PATHS.sampleLoopStart, clamp(v / 100.0, 0.0, 0.95))
  end end
  if oscSampleLenBox then oscSampleLenBox._onChange = function(v)
    -- NOTE: Only global view supported
    setPath(PATHS.sampleLoopLen, clamp(v / 100.0, 0.05, 1.0))
  end end
  if oscSampleXfadeBox then oscSampleXfadeBox._onChange = function(v)
    setPath(PATHS.sampleCrossfade, clamp(v / 100.0, 0.0, 0.5))
    if oscCtx then oscCtx.sampleCrossfade = clamp(v / 100.0, 0.0, 0.5); refreshOscGraph() end
  end end

  -- NOTE: Range view dropdown disabled - only global view supported
  --[[
  if oscRangeViewDrop then oscRangeViewDrop._onSelect = function(idx)
    ...
  end end
  --]]

  if oscDrive then oscDrive._onChange = function(v)
    setPath(PATHS.drive, v)
    if oscCtx then oscCtx.driveAmount = v; refreshOscGraph() end
  end end
  if oscOutput then oscOutput._onChange = function(v)
    setPath(PATHS.output, v)
    if oscCtx then oscCtx.outputLevel = v; refreshOscGraph() end
  end end
  -- New oscillator parameter handlers
  if oscPulseWidth then oscPulseWidth._onChange = function(v)
    setPath(PATHS.pulseWidth, v)
  end end
  if oscUnison then oscUnison._onChange = function(v)
    setPath(PATHS.unison, v)
  end end
  if oscDetune then oscDetune._onChange = function(v)
    setPath(PATHS.detune, v)
  end end
  if oscSpread then oscSpread._onChange = function(v)
    setPath(PATHS.spread, v)
  end end
  if oscBlendModeDrop then oscBlendModeDrop._onSelect = function(idx)
    setPath(PATHS.blendMode, idx - 1)
    if oscCtx then oscCtx.blendMode = idx - 1; refreshOscGraph() end
  end end
  if oscBlendKeyTrack then oscBlendKeyTrack._onChange = function(v)
    setPath(PATHS.blendKeyTrack, v and 1 or 0)
    if oscCtx then oscCtx.blendKeyTrack = (v == true); refreshOscGraph() end
  end end
  if oscBlendAmount then oscBlendAmount._onChange = function(v)
    setPath(PATHS.blendAmount, v)
    if oscCtx then oscCtx.blendAmount = v; refreshOscGraph() end
  end end
  if oscWaveToSample then oscWaveToSample._onChange = function(v)
    setPath(PATHS.waveToSample, v)
    if oscCtx then oscCtx.waveToSample = v; refreshOscGraph() end
  end end
  if oscSampleToWave then oscSampleToWave._onChange = function(v)
    setPath(PATHS.sampleToWave, v)
    if oscCtx then oscCtx.sampleToWave = v; refreshOscGraph() end
  end end
  if oscBlendSamplePitch then oscBlendSamplePitch._onChange = function(v)
    setPath(PATHS.blendSamplePitch, v)
    if oscCtx then oscCtx.blendSamplePitch = v; refreshOscGraph() end
  end end
  if oscBlendModAmount then oscBlendModAmount._onChange = function(v)
    setPath(PATHS.blendModAmount, v)
    if oscCtx then oscCtx.blendModAmount = v; refreshOscGraph() end
  end end

  -- Filter component → DSP
  local filterBehavior = findBehavior(rootId .. ".filterComponent")
  local filterCtx = filterBehavior and filterBehavior.ctx or nil
  local filterModule = filterBehavior and filterBehavior.module or nil
  ctx._filterCtx = filterCtx
  ctx._filterModule = filterModule

  local filterTypeDrop = all[rootId .. ".filterComponent.filter_type_dropdown"]
  local filterCutoff = all[rootId .. ".filterComponent.cutoff_knob"]
  local filterReso = all[rootId .. ".filterComponent.resonance_knob"]

  local function refreshFilterGraph()
    if filterCtx and filterModule then filterModule.resized(filterCtx) end
  end

  if filterTypeDrop then filterTypeDrop._onSelect = function(idx)
    setPath(PATHS.filterType, idx - 1)
    if filterCtx then filterCtx.filterType = idx - 1; refreshFilterGraph() end
  end end
  if filterCutoff then filterCutoff._onChange = function(v)
    setPath(PATHS.cutoff, v)
    if filterCtx then filterCtx.cutoffHz = v; refreshFilterGraph() end
  end end
  if filterReso then filterReso._onChange = function(v)
    setPath(PATHS.resonance, v)
    if filterCtx then filterCtx.resonance = v; refreshFilterGraph() end
  end end

  -- Envelope ADSR component → DSP + graph refresh
  local envBehavior = findBehavior(rootId .. ".envelopeComponent")
  local envCtx = envBehavior and envBehavior.ctx or nil
  local envModule = envBehavior and envBehavior.module or nil
  ctx._envCtx = envCtx
  ctx._envModule = envModule

  local envAttack = all[rootId .. ".envelopeComponent.attack_knob"]
  local envDecay = all[rootId .. ".envelopeComponent.decay_knob"]
  local envSustain = all[rootId .. ".envelopeComponent.sustain_knob"]
  local envRelease = all[rootId .. ".envelopeComponent.release_knob"]
  if envAttack then envAttack._onChange = function(v)
    local s = v / 1000.0; setPath(PATHS.attack, s)
    if envCtx then envCtx.values.attack = s; envModule.resized(envCtx) end
  end end
  if envDecay then envDecay._onChange = function(v)
    local s = v / 1000.0; setPath(PATHS.decay, s)
    if envCtx then envCtx.values.decay = s; envModule.resized(envCtx) end
  end end
  if envSustain then envSustain._onChange = function(v)
    local s = v / 100.0; setPath(PATHS.sustain, s)
    if envCtx then envCtx.values.sustain = s; envModule.resized(envCtx) end
  end end
  if envRelease then envRelease._onChange = function(v)
    local s = v / 1000.0; setPath(PATHS.release, s)
    if envCtx then envCtx.values.release = s; envModule.resized(envCtx) end
  end end
  
  -- Filter dropdown
  if widgets.filterTypeDropdown then
    widgets.filterTypeDropdown._onSelect = function(idx)
      setPath(PATHS.filterType, idx - 1)
    end
  end

  -- Wire up FX components → DSP with individually addressable params
  local function wireFxComponent(slotNum, prefix)
    local behavior = findBehavior(prefix)
    local fxCtx = behavior and behavior.ctx or nil
    local fxModule = behavior and behavior.module or nil
    ctx["_fx" .. slotNum .. "Ctx"] = fxCtx
    ctx["_fx" .. slotNum .. "Module"] = fxModule

    local typeDrop = all[prefix .. ".type_dropdown"]
    local mixKnob = all[prefix .. ".mix_knob"]
    local knob1 = all[prefix .. ".knob1"]
    local knob2 = all[prefix .. ".knob2"]
    local typePath = slotNum == 1 and PATHS.fx1Type or PATHS.fx2Type
    local mixPath = slotNum == 1 and PATHS.fx1Mix or PATHS.fx2Mix

    if typeDrop then typeDrop._onSelect = function(idx)
      setPath(typePath, idx - 1)
      if fxCtx then
        fxCtx.fxType = idx - 1
        if fxModule and fxModule.onTypeChanged then fxModule.onTypeChanged(fxCtx) end
      end
    end end

    if mixKnob then mixKnob._onChange = function(v) setPath(mixPath, v) end end

    -- Knobs write to their assigned DSP param path
    if knob1 then knob1._onChange = function(v)
      if fxCtx then setPath(fxParamPath(slotNum, fxCtx.knob1Idx or 1), v) end
    end end
    if knob2 then knob2._onChange = function(v)
      if fxCtx then setPath(fxParamPath(slotNum, fxCtx.knob2Idx or 2), v) end
    end end

    -- XY pad drag writes to assigned DSP param paths (called from component behavior)
    if fxCtx then
      fxCtx._onXYChanged = function(xVal, yVal)
        setPath(fxParamPath(slotNum, fxCtx.xyXIdx or 1), xVal)
        setPath(fxParamPath(slotNum, fxCtx.xyYIdx or 2), yVal)
      end
    end
  end

  wireFxComponent(1, rootId .. ".fx1Component")
  wireFxComponent(2, rootId .. ".fx2Component")

  -- Performance buttons
  if widgets.testNote then
    widgets.testNote._onPress = function()
      triggerVoice(ctx, 60, 100)
      ctx._lastEvent = "Test: C4"
    end
    widgets.testNote._onRelease = function()
      releaseVoice(ctx, 60)
    end
  end
  
  if widgets.panic then
    widgets.panic._onClick = function()
      panicVoices(ctx)
      ctx._lastEvent = "Panic: all off"
    end
  end
  
  -- MIDI controls
  if widgets.refreshMidi then
    widgets.refreshMidi._onClick = function()
      refreshMidiDevices(ctx, false)
      ctx._lastEvent = "MIDI refreshed"
    end
  end
  
  if widgets.midiInputDropdown then
    widgets.midiInputDropdown._onSelect = function(idx)
      applyMidiSelection(ctx, idx, true)
      syncSelected(widgets.midiInputDropdown, ctx._selectedMidiInputIdx or idx)
    end
  end

  if widgets.keyboardCollapse then
    widgets.keyboardCollapse._onClick = function()
      setKeyboardCollapsed(ctx, not ctx._keyboardCollapsed)
      persistMidiInputSelection(ctx._selectedMidiInputIdx and ctx._selectedMidiInputIdx > 1 and ctx._selectedMidiInputLabel or "")
      local state = loadRuntimeState()
      state.keyboardCollapsed = ctx._keyboardCollapsed == true
      saveRuntimeState(state)
    end
  end
  
  -- Octave buttons
  if widgets.octaveDown then
    widgets.octaveDown._onClick = function()
      ctx._keyboardOctave = math.max(0, ctx._keyboardOctave - 1)
      syncText(widgets.octaveLabel, getOctaveLabel(ctx._keyboardOctave))
      syncKeyboardDisplay(ctx)
    end
  end
  
  if widgets.octaveUp then
    widgets.octaveUp._onClick = function()
      ctx._keyboardOctave = math.min(6, ctx._keyboardOctave + 1)
      syncText(widgets.octaveLabel, getOctaveLabel(ctx._keyboardOctave))
      syncKeyboardDisplay(ctx)
    end
  end
  
  -- Keyboard canvas - retained display list + input callbacks
  if widgets.keyboardCanvas and widgets.keyboardCanvas.node then
    local canvas = widgets.keyboardCanvas
    canvas.node:setInterceptsMouse(true, false)
    canvas.node:setOnMouseDown(function(x, y)
      handleKeyboardClick(ctx, x, y, true)
      syncKeyboardDisplay(ctx)
    end)
    canvas.node:setOnMouseUp(function(x, y)
      handleKeyboardClick(ctx, x, y, false)
      syncKeyboardDisplay(ctx)
    end)
    syncKeyboardDisplay(ctx)
  end
  
  -- State buttons
  if widgets.savePreset then
    widgets.savePreset._onClick = function()
      saveCurrentState(ctx)
    end
  end
  
  if widgets.loadPreset then
    widgets.loadPreset._onClick = function()
      loadSavedState(ctx)
    end
  end
  
  if widgets.resetPreset then
    widgets.resetPreset._onClick = function()
      resetToDefaults(ctx)
    end
  end
  
  syncKeyboardCollapseButton(ctx)
  updateDropdownAnchors(ctx)
  refreshMidiDevices(ctx, true)
  loadSavedState(ctx)

  -- Expose background tick so root behavior can drive MIDI + envelopes
  -- even when the MidiSynth tab is hidden.
  _G.__midiSynthBackgroundTick = function()
    backgroundTick(ctx)
  end

  -- Expose panic hook so overlays/system views can force note release
  -- on project transitions to avoid stuck-note edge cases.
  _G.__midiSynthPanic = function()
    panicVoices(ctx)
  end
end

local function setBounds(widget, x, y, w, h)
  if widget and widget.setBounds then
    widget:setBounds(round(x), round(y), math.max(1, round(w)), math.max(1, round(h)))
  elseif widget and widget.node and widget.node.setBounds then
    widget.node:setBounds(round(x), round(y), math.max(1, round(w)), math.max(1, round(h)))
  end
end

resizeLayout = function(ctx, w, h)
  local widgets = ctx.widgets or {}
  local all = ctx.allWidgets or {}
  local rootId = ctx._globalPrefix or "root"
  local pad = 16
  local gap = 12
  local hideX = -10000

  setBounds(ctx.root, 0, 0, w, h)

  -- Top header is gone. Everything lives in the keyboard header now.
  setBounds(widgets.header, hideX, hideX, 1, 1)

  -- Capture plane (shared looper waveform display)
  local captureH = 100
  local captureY = pad
  setBounds(all[rootId .. ".capture_plane"], pad, captureY, w - pad * 2, captureH)

  -- Main content geometry
  local row1Y = captureY + captureH + gap
  local cardCount = 5
  local totalCardW = w - pad * 2 - gap * (cardCount - 1)
  local cardW = math.floor(totalCardW / cardCount)
  local availableBelow = math.max(220, h - row1Y - pad)
  local keyboardHeaderH = 48   -- Collapsed height (streamlined single row)
  local keyboardExpandedH = math.max(154, availableBelow - math.max(180, math.floor(availableBelow * 0.45)) - gap)
  local keyboardH = ctx._keyboardCollapsed and keyboardHeaderH or keyboardExpandedH
  local cardH = math.max(180, availableBelow - keyboardH - gap)
  local topStackH = math.floor((cardH - gap) / 2)
  local bottomStackH = cardH - gap - topStackH

  -- Row 1: OSC (2) | ADSR (1) | FILTER (2)
  -- Row 2: FX1 (2) | FX2 (2) | EQ (1)
  local doubleW = cardW * 2 + gap
  local row2Y = row1Y + topStackH + gap

  setBounds(all[rootId .. ".envelopeComponent"], pad, row1Y, cardW, topStackH)
  setBounds(all[rootId .. ".oscillatorComponent"], pad + cardW + gap, row1Y, doubleW, topStackH)
  setBounds(all[rootId .. ".filterComponent"], pad + cardW + gap + doubleW + gap, row1Y, doubleW, topStackH)

  setBounds(all[rootId .. ".fx1Component"], pad, row2Y, doubleW, bottomStackH)
  setBounds(all[rootId .. ".fx2Component"], pad + doubleW + gap, row2Y, doubleW, bottomStackH)
  setBounds(all[rootId .. ".eqComponent"], pad + doubleW + gap + doubleW + gap, row2Y, cardW, bottomStackH)

  -- Keep old detail widgets out of layout; summaries now live in keyboard header.
  setBounds(widgets.perfPanel, hideX, hideX, 1, 1)
  setBounds(widgets.perfTitle, hideX, hideX, 1, 1)
  setBounds(widgets.currentNote, hideX, hideX, 1, 1)
  setBounds(widgets.voiceStatus, hideX, hideX, 1, 1)
  setBounds(widgets.midiEvent, hideX, hideX, 1, 1)
  setBounds(widgets.freqValue, hideX, hideX, 1, 1)
  setBounds(widgets.ampValue, hideX, hideX, 1, 1)
  setBounds(widgets.filterValue, hideX, hideX, 1, 1)
  setBounds(widgets.adsrValue, hideX, hideX, 1, 1)
  setBounds(widgets.fxValue, hideX, hideX, 1, 1)
  setBounds(widgets.deviceValue, hideX, hideX, 1, 1)
  setBounds(widgets.voicesLabel, hideX, hideX, 1, 1)
  setBounds(widgets.voicesValue, hideX, hideX, 1, 1)
  setBounds(widgets.midiState, hideX, hideX, 1, 1)

  -- === KEYBOARD PANEL: anchored at BOTTOM, expands UP ===
  local keyboardHeaderH = 48  -- Single streamlined control row
  local keyboardCanvasH = ctx._keyboardCollapsed and 0 or math.max(80, keyboardH - keyboardHeaderH)
  local panelW = w - pad * 2
  local keyboardPanelY = h - pad - keyboardH  -- Bottom of screen
  -- Header at BOTTOM of panel, canvas expands UP from it
  local headerY = keyboardPanelY + keyboardH - keyboardHeaderH

  setBounds(widgets.keyboardPanel, pad, keyboardPanelY, panelW, keyboardH)

  -- Hide removed clutter
  setBounds(widgets.keyboardTitle, hideX, hideX, 1, 1)
  setBounds(widgets.title, hideX, hideX, 1, 1)
  setBounds(widgets.subtitle, hideX, hideX, 1, 1)
  setBounds(widgets.testNote, hideX, hideX, 1, 1)
  setBounds(widgets.savePreset, hideX, hideX, 1, 1)
  setBounds(widgets.loadPreset, hideX, hideX, 1, 1)
  setBounds(widgets.resetPreset, hideX, hideX, 1, 1)
  setBounds(widgets.keyboardStatusSecondary, hideX, hideX, 1, 1)

  -- === SINGLE CONTROL ROW ===
  local ctrlY = headerY + 10
  local ctrlH = 28

  -- Left: octave controls
  setBounds(widgets.octaveDown, pad + 16, ctrlY, 56, ctrlH)
  setBounds(widgets.octaveUp, pad + 78, ctrlY, 56, ctrlH)
  setBounds(widgets.octaveLabel, pad + 142, ctrlY + 6, 72, 16)

  -- Center: status + voice notes
  local statusX = pad + 230
  local statusW = 200
  setBounds(widgets.keyboardStatusPrimary, statusX, ctrlY + 6, statusW, 16)

  -- Voice note labels (color-coded, positioned after status text)
  local voiceNoteX = statusX + statusW + 16
  local voiceNoteW = 36
  for i = 1, 8 do
    setBounds(widgets["voiceNote" .. i], voiceNoteX + (i - 1) * (voiceNoteW + 4), ctrlY + 4, voiceNoteW, 18)
  end

  -- Right: MIDI controls + collapse
  local midiX = pad + panelW - 400
  setBounds(widgets.midiInputLabel, midiX, ctrlY - 12, 80, 12)
  setBounds(widgets.midiInputDropdown, midiX, ctrlY, 180, ctrlH)
  setBounds(widgets.refreshMidi, midiX + 188, ctrlY, 64, ctrlH)
  setBounds(widgets.panic, midiX + 260, ctrlY, 64, ctrlH)
  setBounds(widgets.keyboardCollapse, pad + panelW - 40, ctrlY, 28, ctrlH)

  -- Canvas ABOVE header when expanded
  if ctx._keyboardCollapsed then
    setBounds(widgets.keyboardCanvas, hideX, hideX, 1, 1)
  else
    setBounds(widgets.keyboardCanvas, pad + 16, keyboardPanelY + 8, panelW - 32, keyboardCanvasH - 16)
  end

end

function M.resized(ctx, w, h)
  ctx._lastW = w
  ctx._lastH = h
  resizeLayout(ctx, w, h)
  updateDropdownAnchors(ctx)
  syncKeyboardDisplay(ctx)
end
function M.update(ctx, rawState)
  -- backgroundTick is driven by root behavior at ~60Hz.
  -- Only call here if root hasn't ticked recently (tab was just activated).
  local now = getTime and getTime() or 0
  if now - (ctx._lastUpdateTime or 0) > BG_TICK_INTERVAL then
    backgroundTick(ctx)
  end
  
  -- (debug removed)

  local widgets = ctx.widgets or {}
  local all = ctx.allWidgets or {}
  local rootId = ctx._globalPrefix or "root"
  local uiInteracting = isUiInteracting(ctx)

  -- Compute dt for UI animation
  local dt = now - (ctx._lastUiUpdateTime or now)
  ctx._lastUiUpdateTime = now

  maybeRefreshMidiDevices(ctx, now)

  -- Read parameters
  local waveform = round(readParam(PATHS.waveform, 1))
  local filterType = round(readParam(PATHS.filterType, 0))
  local cutoff = readParam(PATHS.cutoff, 3200)
  local resonance = readParam(PATHS.resonance, 0.75)
  local drive = readParam(PATHS.drive, 1.8)
  local fx1Type = round(readParam(PATHS.fx1Type, 0))
  local fx1Mix = readParam(PATHS.fx1Mix, 0.0)
  local fx2Type = round(readParam(PATHS.fx2Type, 0))
  local fx2Mix = readParam(PATHS.fx2Mix, 0.0)
  local delayTime = readParam(PATHS.delayTimeL, 220)
  local delayFeedback = readParam(PATHS.delayFeedback, 0.24)
  local delayMix = readParam(PATHS.delayMix, 0.0)
  local reverbWet = readParam(PATHS.reverbWet, 0.0)
  local output = readParam(PATHS.output, 0.8)
  local attack = readParam(PATHS.attack, 0.05)
  local decay = readParam(PATHS.decay, 0.2)
  local sustain = readParam(PATHS.sustain, 0.7)
  local release = readParam(PATHS.release, 0.4)

  local oscMode = round(readParam(PATHS.oscMode, 0))
  local sampleSource = round(readParam(PATHS.sampleSource, 0))
  local sampleCaptureBars = readParam(PATHS.sampleCaptureBars, 1.0)
  local sampleRootNote = readParam(PATHS.sampleRootNote, 60.0)
  local sampleLoopStartPct = readParam(PATHS.sampleLoopStart, 0.0) * 100.0
  local sampleLoopLenPct = readParam(PATHS.sampleLoopLen, 1.0) * 100.0
  local sampleRetrigger = readParam(PATHS.sampleRetrigger, 1.0) > 0.5
  local blendMode = round(readParam(PATHS.blendMode, 0))
  local blendAmount = readParam(PATHS.blendAmount, 0.5)
  local waveToSample = readParam(PATHS.waveToSample, 0.5)
  local sampleToWave = readParam(PATHS.sampleToWave, 0.0)
  local blendKeyTrack = readParam(PATHS.blendKeyTrack, 1.0) > 0.5
  local blendSamplePitch = readParam(PATHS.blendSamplePitch, 0.0)
  local blendModAmount = readParam(PATHS.blendModAmount, 0.5)
  
  ctx._adsr.attack = attack
  ctx._adsr.decay = decay
  ctx._adsr.sustain = sustain
  ctx._adsr.release = release
  
  -- Find dominant voice for display
  local maxAmp = 0
  local dominantFreq = 220
  for i = 1, VOICE_COUNT do
    local voice = ctx._voices[i]
    if voice.currentAmp > maxAmp then
      maxAmp = voice.currentAmp
      dominantFreq = voice.freq or dominantFreq
    end
  end
  
  -- Sync oscillator component
  local oscAll = ctx.allWidgets or {}
  syncSelected(oscAll[rootId .. ".oscillatorComponent.mode_tabs.wave_tab.waveform_dropdown"], waveform + 1)
  syncSelected(oscAll[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.blend_mode_dropdown"], blendMode + 1)
  syncSelected(oscAll[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_source_dropdown"], sampleSource + 1)
  
  -- Sync TabHost to match DSP oscMode (e.g., after returning from settings)
  local tabHost = oscAll[rootId .. ".oscillatorComponent.mode_tabs"]
  if tabHost and tabHost.setActiveIndex then
    local expectedTab = 1
    if oscMode == 1 then
      expectedTab = 2
    elseif oscMode == 2 then
      expectedTab = 3
    end
    local currentTab = tabHost.getActiveIndex and tabHost:getActiveIndex() or 1
    if currentTab ~= expectedTab then
      tabHost:setActiveIndex(expectedTab)
    end
  end
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_bars_box"], sampleCaptureBars)
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_root_box"], sampleRootNote)
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_start_box"], sampleLoopStartPct)
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_len_box"], sampleLoopLenPct)
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.sample_tab.sample_xfade_box"], math.floor((readParam(PATHS.sampleCrossfade, 0.1) or 0.1) * 100))

  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.wave_tab.drive_knob"], drive)
  syncValue(oscAll[rootId .. ".oscillatorComponent.output_knob"], output)
  -- New oscillator parameters
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.wave_tab.pulse_width_knob"], readParam(PATHS.pulseWidth, 0.5))
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.wave_tab.unison_knob"], readParam(PATHS.unison, 1))
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.wave_tab.detune_knob"], readParam(PATHS.detune, 0))
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.wave_tab.spread_knob"], readParam(PATHS.spread, 0))
  syncToggleValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.blend_key_track_toggle"], blendKeyTrack)
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.blend_amount_knob"], blendAmount)
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.wave_to_sample_knob"], waveToSample)
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.sample_to_wave_knob"], sampleToWave)
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.blend_sample_pitch_knob"], blendSamplePitch)
  syncValue(oscAll[rootId .. ".oscillatorComponent.mode_tabs.blend_tab.blend_mod_amount_knob"], blendModAmount)

  -- Sync oscillator graph state + voice playthrough
  local oscCtx = ctx._oscCtx
  if oscCtx then
    oscCtx.waveformType = waveform
    oscCtx.driveAmount = drive
    oscCtx.outputLevel = output
    -- Update knob layout based on initial waveform
    local oscModule = ctx._oscModule
    if oscModule and oscModule.updateKnobLayout then
      oscModule.updateKnobLayout(oscCtx)
    end
    -- Don't sync oscMode here - oscillator behavior owns it via TabHost
    oscCtx.oscMode = oscMode
    oscCtx.sampleLoopStart = sampleLoopStartPct / 100.0
    oscCtx.sampleLoopLen = sampleLoopLenPct / 100.0
    oscCtx.samplePlayStart = (readParam(PATHS.samplePlayStart, 0.0) or 0.0)
    oscCtx.sampleCrossfade = (readParam(PATHS.sampleCrossfade, 0.1) or 0.1)
    oscCtx.blendMode = blendMode
    oscCtx.blendAmount = blendAmount
    oscCtx.waveToSample = waveToSample
    oscCtx.sampleToWave = sampleToWave
    oscCtx.blendKeyTrack = blendKeyTrack
    oscCtx.blendSamplePitch = blendSamplePitch
    oscCtx.blendModAmount = blendModAmount

    -- Push active voice data for animated waveform display (reuse tables to
    -- avoid per-frame GC churn while voices are active).
    local activeVoices = oscCtx.activeVoices or {}
    local activeCount = 0
    for i = 1, VOICE_COUNT do
      local voice = ctx._voices[i]
      if voice and voice.currentAmp > 0.001 then
        activeCount = activeCount + 1
        local item = activeVoices[activeCount] or {}
        item.voiceIndex = i  -- Preserve voice index for consistent coloring
        item.freq = voice.freq or 220
        item.amp = voice.currentAmp
        item.samplePos = voice.samplePos or 0  -- Sample playback position for sample mode
        activeVoices[activeCount] = item
      end
    end
    for i = activeCount + 1, #activeVoices do
      activeVoices[i] = nil
    end
    oscCtx.activeVoices = activeVoices

    -- Hint drawing quality to oscillator renderer.
    if uiInteracting then
      oscCtx.maxPoints = 72
    elseif activeCount >= 3 then
      oscCtx.maxPoints = 96
    elseif activeCount >= 2 then
      oscCtx.maxPoints = 120
    else
      oscCtx.maxPoints = 180
    end

    -- Advance animation time
    oscCtx.animTime = (oscCtx.animTime or 0) + dt

    local oscRepaintInterval = OSC_REPAINT_INTERVAL
    if uiInteracting then
      oscRepaintInterval = OSC_REPAINT_INTERVAL_WHILE_INTERACTING
    elseif activeCount >= 2 then
      oscRepaintInterval = OSC_REPAINT_INTERVAL_MULTI_VOICE
    end

    if ctx._oscModule and ctx._oscModule.repaint and now - (ctx._lastOscRepaintTime or 0) >= oscRepaintInterval then
      ctx._lastOscRepaintTime = now
      ctx._oscModule.repaint(oscCtx)
    end
  end

  -- Sync filter component
  syncSelected(oscAll[rootId .. ".filterComponent.filter_type_dropdown"], filterType + 1)
  syncValue(oscAll[rootId .. ".filterComponent.cutoff_knob"], cutoff)
  syncValue(oscAll[rootId .. ".filterComponent.resonance_knob"], resonance)

  -- Sync filter graph state
  local filterCtx = ctx._filterCtx
  if filterCtx then
    filterCtx.filterType = filterType
    filterCtx.cutoffHz = cutoff
    filterCtx.resonance = resonance
    if ctx._filterModule and ctx._filterModule.repaint then ctx._filterModule.repaint(filterCtx) end
  end

  -- Sync FX components: read individual DSP params, sync controls (lightweight per-frame)
  local function syncFxSlot(slotNum, prefix, fxType, fxMix)
    local fxCtx = ctx["_fx" .. slotNum .. "Ctx"]
    if not fxCtx then return end

    local typeDrop = all[prefix .. ".type_dropdown"]
    local xyXDrop = all[prefix .. ".xy_x_dropdown"]
    local xyYDrop = all[prefix .. ".xy_y_dropdown"]
    local k1Drop = all[prefix .. ".knob1_dropdown"]
    local k2Drop = all[prefix .. ".knob2_dropdown"]
    local mixKnob = all[prefix .. ".mix_knob"]
    local k1 = all[prefix .. ".knob1"]
    local k2 = all[prefix .. ".knob2"]

    local anyDropdownOpen = (typeDrop and typeDrop._open)
      or (xyXDrop and xyXDrop._open)
      or (xyYDrop and xyYDrop._open)
      or (k1Drop and k1Drop._open)
      or (k2Drop and k2Drop._open)

    -- Keep controls live during gestures; only skip the specific widget that is
    -- actively open/dragging so we don't fight user input.
    syncSelected(typeDrop, fxType + 1)
    if not (mixKnob and mixKnob._dragging) then
      syncValue(mixKnob, fxMix)
    end

    -- Only re-sync dropdown models/labels if fxType changed and no dropdown is open.
    if fxCtx.fxType ~= fxType and not anyDropdownOpen then
      fxCtx.fxType = fxType
      local fxModule = ctx["_fx" .. slotNum .. "Module"]
      if fxModule and fxModule.onTypeChanged then fxModule.onTypeChanged(fxCtx) end
    end

    -- Read individual param values from DSP
    local pvals = {}
    for pi = 1, MAX_FX_PARAMS do
      pvals[pi] = readParam(fxParamPath(slotNum, pi), 0.5)
    end

    if not fxCtx.dragging then
      local newX = pvals[fxCtx.xyXIdx or 1] or 0.5
      local newY = pvals[fxCtx.xyYIdx or 2] or 0.5
      if newX ~= fxCtx.xyX or newY ~= fxCtx.xyY then
        fxCtx.xyX = newX
        fxCtx.xyY = newY
        refreshFxPad(fxCtx)
      end
    end

    -- Sync knobs to their assigned params
    if k1 then syncValue(k1, pvals[fxCtx.knob1Idx or 1] or 0.5) end
    if k2 then syncValue(k2, pvals[fxCtx.knob2Idx or 2] or 0.5) end
  end

  syncFxSlot(1, rootId .. ".fx1Component", fx1Type, fx1Mix)
  syncFxSlot(2, rootId .. ".fx2Component", fx2Type, fx2Mix)

  
  -- Sync envelope graph: push ADSR values + voice positions each frame
  local envCtx = ctx._envCtx
  if envCtx then
    envCtx.values.attack = attack
    envCtx.values.decay = decay
    envCtx.values.sustain = sustain
    envCtx.values.release = release

    -- Build voice position data for the graph (reuse tables to reduce GC).
    local voicePositions = envCtx.voicePositions or {}
    local vpCount = 0
    for i = 1, VOICE_COUNT do
      local voice = ctx._voices[i]
      if voice and voice.envelopeStage and voice.envelopeStage ~= "idle" then
        vpCount = vpCount + 1
        local item = voicePositions[vpCount] or {}
        item.stage = voice.envelopeStage
        item.level = voice.envelopeLevel or 0
        item.time = voice.envelopeTime or 0
        voicePositions[vpCount] = item
      end
    end
    for i = vpCount + 1, #voicePositions do
      voicePositions[i] = nil
    end
    envCtx.voicePositions = voicePositions

    local envRepaintInterval = uiInteracting and ENV_REPAINT_INTERVAL_WHILE_INTERACTING or ENV_REPAINT_INTERVAL
    if ctx._envModule and ctx._envModule.repaint and now - (ctx._lastEnvRepaintTime or 0) >= envRepaintInterval then
      ctx._lastEnvRepaintTime = now
      ctx._envModule.repaint(envCtx)
    end
  end
  
  -- Sync main ADSR status label
  syncText(widgets.adsrValue, string.format("ADSR: A %s / D %s / S %.0f%% / R %s",
    formatTime(attack), formatTime(decay), sustain * 100, formatTime(release)))
  
  -- (MIDI polling + envelope updates now run in backgroundTick)
  
  -- Update status
  local activeCount = activeVoiceCount(ctx)
  local midiStatusText = isPluginMode() and "host" or "waiting"
  local midiStatusColour = 0xfff59e0b
  if activeCount > 0 then
    midiStatusText = "active"
    midiStatusColour = 0xff4ade80
  elseif ctx._selectedMidiInputIdx and ctx._selectedMidiInputIdx > 1 then
    midiStatusText = "armed"
    midiStatusColour = 0xff38bdf8
  end

  if widgets.midiState then
    syncText(widgets.midiState, midiStatusText)
    syncColour(widgets.midiState, midiStatusColour)
  end
  
  syncText(widgets.voicesValue, "8 voice poly")
  syncText(widgets.currentNote, "Note: " .. (ctx._currentNote and noteName(ctx._currentNote) or "--"))
  syncText(widgets.voiceStatus, voiceSummary(ctx))
  syncText(widgets.midiEvent, ctx._lastEvent)
  syncText(widgets.freqValue, string.format("Freq: %.2f Hz", dominantFreq))
  syncText(widgets.ampValue, string.format("Amp: %.3f", maxAmp))
  local filterName = FILTER_OPTIONS[filterType + 1] or "SVF"
  syncText(widgets.filterValue, string.format("Filter: %s / %d Hz / Res %.2f", filterName, round(cutoff), resonance))
  syncText(widgets.adsrValue, string.format("ADSR: A %s / D %s / S %.0f%% / R %s",
    formatTime(attack), formatTime(decay), sustain * 100, formatTime(release)))
  local fx1Name = FX_OPTIONS[fx1Type + 1] or "None"
  local fx2Name = FX_OPTIONS[fx2Type + 1] or "None"
  syncText(widgets.fxValue, string.format("FX1: %s / FX2: %s / Dly %.0f%% / Verb %.0f%%",
    fx1Name, fx2Name, delayMix * 100, reverbWet * 100))
  syncText(widgets.deviceValue, "Input: " .. (ctx._selectedMidiInputLabel or "None"))

  if widgets.keyboardStatusPrimary then
    syncText(widgets.keyboardStatusPrimary,
      string.format("MIDI %s · Input: %s",
        midiStatusText,
        ctx._selectedMidiInputLabel or "None"))
    syncColour(widgets.keyboardStatusPrimary, midiStatusColour)
  end

  -- Update voice note labels (color-coded per voice)
  for i = 1, 8 do
    local voiceLabel = widgets["voiceNote" .. i]
    if voiceLabel then
      local voice = ctx._voices[i]
      if voice and voice.active and voice.note and voice.envelopeStage ~= "idle" then
        syncText(voiceLabel, noteName(voice.note))
      else
        syncText(voiceLabel, "--")
      end
    end
  end

  if widgets.keyboardStatusSecondary then
    syncText(widgets.keyboardStatusSecondary,
      string.format("%s · %s", voiceSummary(ctx), ctx._lastEvent or "No MIDI yet"))
  end

  if ctx._keyboardDirty then
    syncKeyboardDisplay(ctx)
    ctx._keyboardDirty = false
  end
  
  -- Update signal routing visualization

end

function M.cleanup(ctx)
  -- Don't clear __midiSynthBackgroundTick / __midiSynthPanic - we want MIDI
  -- processing + panic hook available across project/overlay transitions.
  -- Only clear callbacks if we're actually shutting down (not just switching tabs)
  -- Note: Midi.clearCallbacks() is not called here to keep MIDI alive
end

return M
