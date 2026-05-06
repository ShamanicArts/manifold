local M = {}

local function readParam(path, fallback)
  if type(path) ~= "string" or path == "" then return fallback end
  if type(_G.getParam) == "function" then
    local ok, value = pcall(_G.getParam, path)
    if ok and value ~= nil then return value end
  end
  return fallback
end

local function writeParam(path, value)
  if type(path) ~= "string" or path == "" then return false end
  local numeric = tonumber(value)
  if numeric == nil then return false end
  if type(_G.setParam) == "function" then return _G.setParam(path, numeric) end
  if type(command) == "function" then command("SET", path, tostring(numeric)); return true end
  return false
end

local function syncWidgetFromParam(widget, path)
  if not widget or type(path) ~= "string" or path == "" then return end
  local current = readParam(path, nil)
  if current == nil then return end
  if widget._dragging == true or widget._open == true then return end

  if type(widget.setValue) == "function" then
    local existing = type(widget.getValue) == "function" and widget:getValue() or nil
    if type(widget.setOnLabel) == "function" then
      local nextBool = (tonumber(current) or 0) > 0.5
      if existing == nil or existing ~= nextBool then
        widget._bappSyncing = true
        widget:setValue(nextBool)
        widget._bappSyncing = false
      end
      return
    end
    if existing == nil or math.abs((tonumber(existing) or 0) - (tonumber(current) or 0)) > 0.0001 then
      widget._bappSyncing = true
      widget:setValue(tonumber(current) or 0)
      widget._bappSyncing = false
    end
    return
  end

  if type(widget.setSelected) == "function" then
    local selected = math.floor((tonumber(current) or 0) + 0.5) + 1
    local existing = type(widget.getSelected) == "function" and widget:getSelected() or nil
    if existing == nil or existing ~= selected then
      widget._bappSyncing = true
      widget:setSelected(selected)
      widget._bappSyncing = false
    end
  end
end

local function bindSliderWidget(widget)
  local path = widget and widget.config and widget.config.paramPath or nil
  if type(path) ~= "string" or path == "" then return end
  if type(widget.setValue) == "function" then
    widget._onChange = function(value)
      if widget._bappSyncing == true then return end
      writeParam(path, value)
    end
    syncWidgetFromParam(widget, path)
    return
  end
  if type(widget.setSelected) == "function" then
    widget._onSelect = function(idx)
      if widget._bappSyncing == true then return end
      writeParam(path, (tonumber(idx) or 1) - 1)
    end
    syncWidgetFromParam(widget, path)
  end
end

local function bindButtonWidget(widget)
  local path = widget and widget.config and widget.config.paramPath or nil
  if type(path) ~= "string" or path == "" then return end
  widget._onClick = function()
    local current = readParam(path, 0)
    local nextVal = (tonumber(current) or 0) + 1
    if nextVal > 999999 then nextVal = 1 end
    writeParam(path, nextVal)
  end
end

local function bindToggleWidget(widget)
  local path = widget and widget.config and widget.config.paramPath or nil
  if type(path) ~= "string" or path == "" then return end
  widget._onChange = function(value)
    if widget._bappSyncing == true then return end
    writeParam(path, value and 1 or 0)
  end
  syncWidgetFromParam(widget, path)
end

local PRESETS = {
  guitar  = { noiseColor = 0.2, attack = 2.0,  decay = 25.0, level = 0.9,  toneMode = 0, toneCutoff = 3500.0, toneReson = 0.3,  stringDecay = 3.0, stiffness = 0.15, filterCutoff = 4000.0, filterReson = 0.25, bodyFreq = 200.0,  bodyQ = 12.0, bodyGain = 0.8,  bodyMix = 0.35, gain = 0.75 },
  harp    = { noiseColor = 0.0, attack = 1.0,  decay = 50.0, level = 0.85, toneMode = 1, toneCutoff = 5000.0, toneReson = 0.4,  stringDecay = 5.0, stiffness = 0.05, filterCutoff = 6000.0, filterReson = 0.2,  bodyFreq = 350.0,  bodyQ = 18.0, bodyGain = 1.0,  bodyMix = 0.45, gain = 0.7 },
  kalimba = { noiseColor = 0.4, attack = 0.5,  decay = 15.0, level = 0.7,  toneMode = 1, toneCutoff = 2500.0, toneReson = 0.5,  stringDecay = 1.5, stiffness = 0.25, filterCutoff = 5000.0, filterReson = 0.15, bodyFreq = 1200.0, bodyQ = 25.0, bodyGain = 1.3,  bodyMix = 0.55, gain = 0.7 },
  bell    = { noiseColor = 0.0, attack = 0.1,  decay = 5.0,  level = 1.0,  toneMode = 2, toneCutoff = 6000.0, toneReson = 0.2,  stringDecay = 8.0, stiffness = 0.7,  filterCutoff = 8000.0, filterReson = 0.1,  bodyFreq = 2500.0, bodyQ = 40.0, bodyGain = 1.5,  bodyMix = 0.6,  gain = 0.65 },
  drum    = { noiseColor = 0.7, attack = 0.1,  decay = 2.0,  level = 1.0,  toneMode = 0, toneCutoff = 800.0,  toneReson = 0.5,  stringDecay = 0.3, stiffness = 0.0,  filterCutoff = 1200.0, filterReson = 0.5,  bodyFreq = 80.0,   bodyQ = 8.0,  bodyGain = 0.5,  bodyMix = 0.2,  gain = 0.85 },
}

local function applyPreset(name)
  local p = PRESETS[name]
  if not p then return end
  writeParam("/ks/noise/color",          p.noiseColor)
  writeParam("/ks/excitation/attack",    p.attack)
  writeParam("/ks/excitation/decay",     p.decay)
  writeParam("/ks/excitation/level",     p.level)
  writeParam("/ks/excitation/tone_mode", p.toneMode)
  writeParam("/ks/excitation/tone_cutoff", p.toneCutoff)
  writeParam("/ks/excitation/tone_reson",  p.toneReson)
  writeParam("/ks/string/decay",         p.stringDecay)
  writeParam("/ks/string/stiffness",     p.stiffness)
  writeParam("/ks/filter/cutoff",        p.filterCutoff)
  writeParam("/ks/filter/resonance",     p.filterReson)
  writeParam("/ks/body/freq",            p.bodyFreq)
  writeParam("/ks/body/q",               p.bodyQ)
  writeParam("/ks/body/gain",            p.bodyGain)
  writeParam("/ks/body/mix",             p.bodyMix)
  writeParam("/ks/master/gain",          p.gain)
end

local function buildMidiOptions()
  local devices = Midi and Midi.inputDevices and Midi.inputDevices() or {}
  local options = { "None (Disabled)" }
  for i = 1, #devices do options[#options + 1] = tostring(devices[i] or ("Device " .. tostring(i))) end
  return options, devices
end

local function currentMidiLabel()
  if Midi and Midi.currentInputDeviceName then
    local name = Midi.currentInputDeviceName()
    if type(name) == "string" and name ~= "" then return name end
  end
  return nil
end

local function findOptionIndex(options, label)
  if type(label) ~= "string" or label == "" then return 1 end
  for i = 1, #(options or {}) do if options[i] == label then return i end end
  return 1
end

local function setMidiStatus(ctx, text)
  local label = ctx.widgets and ctx.widgets.midi_status or nil
  if label and label.setText then label:setText(tostring(text or "")) end
end

local function refreshMidiDevices(ctx)
  local options, devices = buildMidiOptions()
  ctx._midiOptions = options
  ctx._midiDevices = devices
  local dropdown = ctx.widgets and ctx.widgets.midi_input_dropdown or nil
  if dropdown and dropdown.setOptions then dropdown:setOptions(options) end
  local activeLabel = currentMidiLabel()
  local selectedIdx = findOptionIndex(options, activeLabel)
  ctx._selectedMidiInputIdx = selectedIdx
  ctx._selectedMidiInputLabel = options[selectedIdx] or options[1]
  if dropdown and dropdown.setSelected then dropdown:setSelected(selectedIdx) end
  if activeLabel and activeLabel ~= "" then setMidiStatus(ctx, "Device: " .. activeLabel)
  else setMidiStatus(ctx, "Device: None (Disabled)") end
end

local function openPreferredMidiDevice(ctx)
  local devices = ctx._midiDevices or (Midi and Midi.inputDevices and Midi.inputDevices() or {})
  if not (Midi and Midi.openInput) or #devices == 0 then
    setMidiStatus(ctx, "Device: None Found")
    return false
  end
  local chosen = 0
  for i = 1, #devices do
    local name = tostring(devices[i] or "")
    if not name:lower():find("through", 1, true) then chosen = i - 1; break end
  end
  local ok = Midi.openInput(chosen)
  refreshMidiDevices(ctx)
  if ok then setMidiStatus(ctx, "Device: " .. tostring(currentMidiLabel() or devices[chosen + 1] or "Opened"))
  else setMidiStatus(ctx, "Device: Failed to Open") end
  return ok
end

local function bindMidiControls(ctx)
  local widgets = ctx.widgets or {}
  local dropdown = widgets.midi_input_dropdown
  local refreshBtn = widgets.midi_refresh_btn
  refreshMidiDevices(ctx)
  if dropdown and dropdown.setOptions then
    dropdown._onSelect = function(idx)
      local selected = math.max(1, math.floor(tonumber(idx) or 1))
      ctx._selectedMidiInputIdx = selected
      ctx._selectedMidiInputLabel = (ctx._midiOptions or {})[selected] or "None (Disabled)"
      if selected == 1 then
        if Midi and Midi.closeInput then Midi.closeInput() end
        refreshMidiDevices(ctx)
        setMidiStatus(ctx, "Device: None (Disabled)")
        return
      end
      local deviceIndex = selected - 2
      local ok = Midi and Midi.openInput and Midi.openInput(deviceIndex) or false
      refreshMidiDevices(ctx)
      if ok then setMidiStatus(ctx, "Device: " .. tostring(currentMidiLabel() or ctx._selectedMidiInputLabel or "Opened"))
      else setMidiStatus(ctx, "Device: Failed to Open") end
    end
  end
  if refreshBtn then
    refreshBtn._onClick = function()
      refreshMidiDevices(ctx)
      if currentMidiLabel() == nil then openPreferredMidiDevice(ctx) end
    end
  end
  if Audio == nil or (Audio.isPlugin and not Audio.isPlugin()) then
    if currentMidiLabel() == nil or currentMidiLabel() == "" then openPreferredMidiDevice(ctx)
    else refreshMidiDevices(ctx) end
  else refreshMidiDevices(ctx) end
end

function M.init(ctx)
  ctx._paramWidgets = {}
  for id, widget in pairs(ctx.allWidgets or {}) do
    if type(widget) == "table" and type(widget.config) == "table" and type(widget.config.paramPath) == "string" then
      ctx._paramWidgets[id] = widget
      if type(widget.setOnLabel) == "function" then
        bindToggleWidget(widget)
      elseif type(widget.reset) == "function" then
        bindSliderWidget(widget)
      elseif type(widget.setLabel) == "function" and type(widget.setValue) ~= "function" then
        bindButtonWidget(widget)
      else
        bindSliderWidget(widget)
      end
    end
  end

  -- Preset buttons
  local presetMap = {
    preset_guitar = "guitar", preset_harp = "harp",
    preset_kalimba = "kalimba", preset_bell = "bell", preset_drum = "drum",
  }
  for id, presetName in pairs(presetMap) do
    local widget = ctx.widgets and ctx.widgets[id] or nil
    if widget then
      widget._onClick = function()
        applyPreset(presetName)
      end
    end
  end

  bindMidiControls(ctx)
end

function M.update(ctx)
  for _, widget in pairs(ctx._paramWidgets or {}) do
    local path = widget and widget.config and widget.config.paramPath or nil
    if path then syncWidgetFromParam(widget, path) end
  end
end

return M
