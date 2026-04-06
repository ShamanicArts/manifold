local M = {}

local MODULES = {
  { id = "rack_oscillator", label = "Oscillator", panel = "oscillator_host", status = "Rack oscillator source, routed directly to output." },
  { id = "rack_sample", label = "Sample", panel = "sample_host", status = "Rack sample source. Set its Source control to Input to capture Input A." },
  { id = "filter", label = "Filter", panel = "filter_host", status = "Input A feeds the dynamic filter slot, then straight to output." },
  { id = "fx", label = "FX", panel = "fx_host", status = "Input A feeds the dynamic FX slot, then straight to output." },
  { id = "eq", label = "EQ", panel = "eq_host", status = "Input A feeds the dynamic EQ slot, then straight to output." },
  { id = "blend_simple", label = "Blend", panel = "blend_host", status = "Input A feeds the serial A input. Input B feeds the auxiliary B input." },
}

local HOST_PATHS = {
  moduleIndex = "/rack_host/module/index",
  inputAMode = "/rack_host/input_a/mode",
  inputAPitch = "/rack_host/input_a/pitch",
  inputALevel = "/rack_host/input_a/level",
  inputBMode = "/rack_host/input_b/mode",
  inputBPitch = "/rack_host/input_b/pitch",
  inputBLevel = "/rack_host/input_b/level",
}

local SYNC_INTERVAL = 0.1

local function clamp(value, lo, hi)
  local n = tonumber(value) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(value)
  return math.floor((tonumber(value) or 0) + 0.5)
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

local function writeParam(path, value)
  local numeric = tonumber(value) or 0
  if type(_G.setParam) == "function" then
    return _G.setParam(path, numeric)
  end
  if type(command) == "function" then
    command("SET", path, tostring(numeric))
    return true
  end
  return false
end

local function setVisible(widget, visible)
  if widget and widget.setVisible then
    widget:setVisible(visible == true)
  elseif widget and widget.node and widget.node.setVisible then
    widget.node:setVisible(visible == true)
  end
end

local function syncDropdown(widget, index)
  if widget and widget.setSelected and not widget._open then
    widget:setSelected(math.max(1, round(index)))
  end
end

local function syncSlider(widget, value)
  if widget and widget.setValue and not widget._dragging then
    widget:setValue(tonumber(value) or 0)
  end
end

local function syncText(widget, text)
  if widget and widget.setText then
    widget:setText(tostring(text or ""))
  end
end

local function selectedModule(ctx)
  local index = math.max(1, math.min(#MODULES, round(ctx.state.moduleIndex or 1)))
  return MODULES[index], index
end

local function updateVisibility(ctx)
  local widgets = ctx.widgets or {}
  local selected = selectedModule(ctx)
  local selectedId = selected and selected.id or ""
  for i = 1, #MODULES do
    local module = MODULES[i]
    setVisible(widgets[module.panel], module.id == selectedId)
  end
  setVisible(widgets.input_b_group, selectedId == "blend_simple")
  syncText(widgets.module_status, selected and selected.status or "")
  if selectedId == "rack_sample" then
    syncText(widgets.module_note, "Sample mode uses the same rack sample UI. Choose Input in the module itself to capture the utility Input A generator.")
  elseif selectedId == "rack_oscillator" then
    syncText(widgets.module_note, "Rack oscillator is a direct source module. Utility generators stay available but are not routed into the selected module.")
  elseif selectedId == "blend_simple" then
    syncText(widgets.module_note, "Blend runs with Input A on the serial side and Input B on the auxiliary side so you can audition mix, ring, FM, and sync quickly.")
  else
    syncText(widgets.module_note, "This wrapper reuses the existing Main rack module UIs and DSP slots so you can inspect module behavior without opening the full Main project.")
  end
end

local function syncFromParams(ctx)
  ctx.state = ctx.state or {}
  ctx.state.moduleIndex = clamp(readParam(HOST_PATHS.moduleIndex, ctx.state.moduleIndex or 1), 1, #MODULES)
  ctx.state.inputAMode = clamp(readParam(HOST_PATHS.inputAMode, ctx.state.inputAMode or 2), 1, 6)
  ctx.state.inputAPitch = clamp(readParam(HOST_PATHS.inputAPitch, ctx.state.inputAPitch or 60), 24, 84)
  ctx.state.inputALevel = clamp(readParam(HOST_PATHS.inputALevel, ctx.state.inputALevel or 0.65), 0, 1)
  ctx.state.inputBMode = clamp(readParam(HOST_PATHS.inputBMode, ctx.state.inputBMode or 3), 1, 6)
  ctx.state.inputBPitch = clamp(readParam(HOST_PATHS.inputBPitch, ctx.state.inputBPitch or 67), 24, 84)
  ctx.state.inputBLevel = clamp(readParam(HOST_PATHS.inputBLevel, ctx.state.inputBLevel or 0.5), 0, 1)

  local widgets = ctx.widgets or {}
  syncDropdown(widgets.module_selector, ctx.state.moduleIndex)
  syncDropdown(widgets.input_a_mode, ctx.state.inputAMode)
  syncSlider(widgets.input_a_pitch, ctx.state.inputAPitch)
  syncSlider(widgets.input_a_level, ctx.state.inputALevel)
  syncDropdown(widgets.input_b_mode, ctx.state.inputBMode)
  syncSlider(widgets.input_b_pitch, ctx.state.inputBPitch)
  syncSlider(widgets.input_b_level, ctx.state.inputBLevel)

  updateVisibility(ctx)
end

local function bindControls(ctx)
  local widgets = ctx.widgets or {}

  if widgets.module_selector then
    widgets.module_selector._onSelect = function(index)
      writeParam(HOST_PATHS.moduleIndex, clamp(index, 1, #MODULES))
      syncFromParams(ctx)
    end
  end

  if widgets.input_a_mode then
    widgets.input_a_mode._onSelect = function(index)
      writeParam(HOST_PATHS.inputAMode, clamp(index, 1, 6))
      syncFromParams(ctx)
    end
  end
  if widgets.input_a_pitch then
    widgets.input_a_pitch._onChange = function(value)
      writeParam(HOST_PATHS.inputAPitch, clamp(round(value), 24, 84))
    end
  end
  if widgets.input_a_level then
    widgets.input_a_level._onChange = function(value)
      writeParam(HOST_PATHS.inputALevel, clamp(value, 0, 1))
    end
  end

  if widgets.input_b_mode then
    widgets.input_b_mode._onSelect = function(index)
      writeParam(HOST_PATHS.inputBMode, clamp(index, 1, 6))
      syncFromParams(ctx)
    end
  end
  if widgets.input_b_pitch then
    widgets.input_b_pitch._onChange = function(value)
      writeParam(HOST_PATHS.inputBPitch, clamp(round(value), 24, 84))
    end
  end
  if widgets.input_b_level then
    widgets.input_b_level._onChange = function(value)
      writeParam(HOST_PATHS.inputBLevel, clamp(value, 0, 1))
    end
  end
end

function M.init(ctx)
  ctx.state = {}
  bindControls(ctx)
  syncFromParams(ctx)
end

function M.update(ctx)
  local now = type(getTime) == "function" and getTime() or 0
  if now == 0 or now - (ctx._lastSyncTime or 0) >= SYNC_INTERVAL then
    ctx._lastSyncTime = now
    syncFromParams(ctx)
  end
end

return M
