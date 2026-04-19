local M = {}

local MAX_EFFECT_PARAMS = 4

local function setText(widget, text)
  if widget and widget.setText then
    widget:setText(text or "")
  end
end

local function dirname(path)
  return (tostring(path or ""):gsub("/+$", ""):match("^(.*)/[^/]+$") or ".")
end

local function joinPath(a, b)
  local left = tostring(a or "")
  local right = tostring(b or "")
  if left == "" then return right end
  if right == "" then return left end
  if left:sub(-1) == "/" then
    return left .. right:gsub("^/+", "")
  end
  return left .. "/" .. right:gsub("^/+", "")
end

local function currentRendererMode()
  if type(getUIRendererMode) == "function" then
    return tostring(getUIRendererMode() or "canvas")
  end
  return "canvas"
end

local function syncRendererMode(ctx)
  setText(ctx.widgets.rendererMode, "Renderer: " .. currentRendererMode())
end

local function updateFrameInfo(ctx)
  local info = (video and video.getFrameInfo and video.getFrameInfo()) or nil
  if type(info) == "table" and info.valid then
    setText(ctx.widgets.frameInfo,
      string.format("Frame: %dx%d  seq=%d  device=%d",
        tonumber(info.width) or 0,
        tonumber(info.height) or 0,
        tonumber(info.sequence) or 0,
        tonumber(info.activeDeviceIndex) or -1))
  else
    setText(ctx.widgets.frameInfo, "Frame: --")
  end
end

local function describeDevice(device)
  if type(device) ~= "table" then
    return "<unknown>"
  end
  return tostring(device.label or device.name or device.path or ("Device " .. tostring(device.index or "?")))
end

local function describeMode(mode)
  if type(mode) ~= "table" then
    return "<unknown mode>"
  end
  return tostring(mode.label or ((mode.width or 0) .. "x" .. (mode.height or 0) .. " @ " .. (mode.fps or 0) .. " fps"))
end

local function describeEffect(effect)
  if type(effect) ~= "table" then
    return "Passthrough"
  end
  return tostring(effect.name or effect.id or "Passthrough")
end

local function updateStatus(ctx, text)
  ctx._statusText = text or ""
  setText(ctx.widgets.status, ctx._statusText)
end

local function stateFilePath()
  local scriptPath = (type(getCurrentScriptPath) == "function") and getCurrentScriptPath() or ""
  return joinPath(dirname(scriptPath), ".webcam_viewer.state")
end

local function loadPersistedState(ctx)
  ctx._persisted = {
    devicePath = nil,
    width = nil,
    height = nil,
    fps = nil,
    pixelFormat = nil,
    effectId = nil,
    effectParams = {},
  }
  local path = stateFilePath()
  local raw = (type(readTextFile) == "function") and readTextFile(path) or ""
  if raw == "" then
    return
  end
  for line in tostring(raw):gmatch("[^\r\n]+") do
    local key, value = line:match("^([^=]+)=(.*)$")
    if key and value then
      if key == "devicePath" then ctx._persisted.devicePath = value end
      if key == "width" then ctx._persisted.width = tonumber(value) end
      if key == "height" then ctx._persisted.height = tonumber(value) end
      if key == "fps" then ctx._persisted.fps = tonumber(value) end
      if key == "pixelFormat" then ctx._persisted.pixelFormat = value end
      if key == "effectId" then ctx._persisted.effectId = value end
      local paramKey = key:match("^effectParam%.(.+)$")
      if paramKey then
        ctx._persisted.effectParams[paramKey] = tonumber(value)
      end
    end
  end
end

local function savePersistedState(ctx)
  local lines = {}
  local devices = ctx._devices or {}
  local modes = ctx._modes or {}
  local device = devices[ctx._selectedDevice]
  local mode = modes[ctx._selectedMode]
  if type(device) == "table" and type(mode) == "table" then
    lines[#lines + 1] = "devicePath=" .. tostring(device.path or "")
    lines[#lines + 1] = "width=" .. tostring(mode.width or 0)
    lines[#lines + 1] = "height=" .. tostring(mode.height or 0)
    lines[#lines + 1] = "fps=" .. tostring(mode.fps or 0)
    lines[#lines + 1] = "pixelFormat=" .. tostring(mode.pixelFormat or "")
  end

  local effect = ctx._effects and ctx._effects[ctx._selectedEffect] or nil
  if type(effect) == "table" then
    lines[#lines + 1] = "effectId=" .. tostring(effect.id or "none")
    local effectState = ctx._effectStates and ctx._effectStates[effect.id] or {}
    if type(effectState) == "table" then
      for key, value in pairs(effectState) do
        lines[#lines + 1] = "effectParam." .. tostring(key) .. "=" .. tostring(value)
      end
    end
  end

  if type(writeTextFile) == "function" then
    writeTextFile(stateFilePath(), table.concat(lines, "\n") .. "\n")
  end
end

local function ensureEffectState(ctx, effect)
  if type(effect) ~= "table" then
    return {}
  end
  ctx._effectStates = ctx._effectStates or {}
  local state = ctx._effectStates[effect.id]
  if type(state) ~= "table" then
    state = {}
    ctx._effectStates[effect.id] = state
  end

  local persistedId = ctx._persisted and ctx._persisted.effectId or nil
  local persistedParams = (ctx._persisted and ctx._persisted.effectParams) or {}
  for i = 1, #(effect.params or {}) do
    local spec = effect.params[i]
    if state[spec.id] == nil then
      if persistedId == effect.id and persistedParams[spec.id] ~= nil then
        state[spec.id] = tonumber(persistedParams[spec.id]) or tonumber(spec.default) or 0
      else
        state[spec.id] = tonumber(spec.default) or 0
      end
    end
  end
  return state
end

local function syncEffectDescription(ctx)
  local effect = ctx._effects and ctx._effects[ctx._selectedEffect] or nil
  local description = "Shader effect applied to the live webcam feed"
  if type(effect) == "table" then
    local category = tostring(effect.category or "utility")
    local detail = tostring(effect.description or "")
    description = string.format("[%s] %s", category, detail ~= "" and detail or describeEffect(effect))
  end
  setText(ctx.widgets.fxDescription, description)
end

local function effectPayload(ctx)
  local effect = ctx._effects and ctx._effects[ctx._selectedEffect] or nil
  if type(effect) ~= "table" then
    return nil
  end
  local effectState = ensureEffectState(ctx, effect)
  if video and video.buildEffectSurface then
    return video.buildEffectSurface(effect.id, effectState, "contain")
  end
  return nil
end

local function setViewportSurface(ctx)
  local viewport = ctx.widgets.viewport
  if not viewport or not viewport.node then
    return
  end

  local payload = effectPayload(ctx)
  if payload ~= nil then
    viewport.node:setCustomSurface("gpu_shader", payload)
  else
    viewport.node:setCustomSurface("video_input", {
      version = 1,
      fitMode = "contain",
    })
  end
end

local function effectParamFormatter(spec)
  return function(value)
    if not spec then
      return tostring(value)
    end
    local unit = tostring(spec.unit or "")
    local num = tonumber(value) or 0
    if math.abs((tonumber(spec.step) or 0) - 1.0) < 0.0001 then
      return string.format("%.0f%s", num, unit)
    end
    if math.abs(num) >= 10 then
      return string.format("%.1f%s", num, unit)
    end
    return string.format("%.2f%s", num, unit)
  end
end

local function configureParamSlider(slider, spec, value)
  if not slider then
    return
  end
  if type(spec) ~= "table" then
    slider:setVisible(false)
    return
  end

  slider._min = tonumber(spec.min) or 0
  slider._max = tonumber(spec.max) or 1
  slider._step = tonumber(spec.step) or 0.01
  slider._defaultValue = tonumber(spec.default) or slider._min
  slider:setLabel(spec.name or spec.id or "Param")
  slider:setValueFormatter(effectParamFormatter(spec))
  slider:setVisible(true)
  slider:setValue(tonumber(value) or slider._defaultValue)
end

local function syncEffectControls(ctx)
  local labels = {}
  for i = 1, #(ctx._effects or {}) do
    labels[i] = describeEffect(ctx._effects[i])
  end
  if #labels == 0 then
    labels[1] = "Passthrough"
  end

  if ctx.widgets.effectSelect and ctx.widgets.effectSelect.setOptions then
    ctx.widgets.effectSelect:setOptions(labels)
    ctx.widgets.effectSelect:setSelected(ctx._selectedEffect or 1)
  end

  local effect = ctx._effects and ctx._effects[ctx._selectedEffect] or nil
  local effectState = ensureEffectState(ctx, effect)
  ctx._activeParamSpecs = {}

  for i = 1, MAX_EFFECT_PARAMS do
    local slider = ctx.widgets["fxParam" .. tostring(i)]
    local spec = type(effect) == "table" and effect.params and effect.params[i] or nil
    ctx._activeParamSpecs[i] = spec
    configureParamSlider(slider, spec, spec and effectState[spec.id] or nil)
  end

  syncEffectDescription(ctx)
end

local function refreshEffects(ctx)
  ctx._effects = (video and video.listEffects and video.listEffects()) or {}
  if #ctx._effects == 0 then
    ctx._effects = {
      { id = "none", name = "Passthrough", category = "utility", description = "Dry webcam feed", params = {} }
    }
  end

  local selectedIndex = 1
  local persistedId = ctx._persisted and ctx._persisted.effectId or nil
  if persistedId then
    for i = 1, #ctx._effects do
      if tostring(ctx._effects[i].id or "") == tostring(persistedId) then
        selectedIndex = i
        break
      end
    end
  end

  ctx._selectedEffect = selectedIndex
  for i = 1, #ctx._effects do
    ensureEffectState(ctx, ctx._effects[i])
  end
  syncEffectControls(ctx)
  setViewportSurface(ctx)
end

local function syncModeOptions(ctx)
  local labels = {}
  for i = 1, #(ctx._modes or {}) do
    labels[i] = describeMode(ctx._modes[i])
  end
  if #labels == 0 then
    labels[1] = "No modes found"
  end

  local selectedIndex = (#ctx._modes > 0) and 1 or nil
  local persisted = ctx._persisted or {}
  if persisted.width and persisted.height and persisted.fps and persisted.pixelFormat then
    for i = 1, #(ctx._modes or {}) do
      local mode = ctx._modes[i]
      if tonumber(mode.width) == tonumber(persisted.width)
        and tonumber(mode.height) == tonumber(persisted.height)
        and tonumber(mode.fps) == tonumber(persisted.fps)
        and tostring(mode.pixelFormat or "") == tostring(persisted.pixelFormat or "") then
        selectedIndex = i
        break
      end
    end
  end

  if ctx.widgets.modeSelect and ctx.widgets.modeSelect.setOptions then
    ctx.widgets.modeSelect:setOptions(labels)
    ctx.widgets.modeSelect:setSelected(selectedIndex or 1)
  end
  ctx._selectedMode = selectedIndex
end

local function refreshModes(ctx, deviceListIndex)
  ctx._selectedDevice = deviceListIndex
  ctx._modes = {}

  local devices = ctx._devices or {}
  local device = devices[deviceListIndex]
  if type(device) ~= "table" then
    syncModeOptions(ctx)
    updateStatus(ctx, "No capture device selected")
    return
  end

  if video and video.listModes then
    ctx._modes = video.listModes(tonumber(device.index) or -1) or {}
  end

  syncModeOptions(ctx)
  if #ctx._modes == 0 then
    updateStatus(ctx, "No capture modes reported for " .. describeDevice(device))
  else
    local selected = ctx._modes[ctx._selectedMode or 1]
    updateStatus(ctx, "Ready: " .. describeDevice(device) .. " / " .. describeMode(selected))
  end
end

local function openCurrentSelection(ctx)
  local devices = ctx._devices or {}
  local modes = ctx._modes or {}
  local device = devices[ctx._selectedDevice]
  local mode = modes[ctx._selectedMode]

  if type(device) ~= "table" then
    updateStatus(ctx, "No capture device selected")
    return false
  end
  if type(mode) ~= "table" then
    updateStatus(ctx, "No capture mode selected")
    return false
  end

  local ok = false
  if video and video.open then
    ok = video.open(tonumber(device.index) or 0,
                    tonumber(mode.width) or 640,
                    tonumber(mode.height) or 480,
                    tonumber(mode.fps) or 30)
  end

  if ok then
    setViewportSurface(ctx)
    savePersistedState(ctx)
    local effect = ctx._effects and ctx._effects[ctx._selectedEffect] or nil
    updateStatus(ctx, "Streaming " .. describeDevice(device) .. " / " .. describeMode(mode) .. "  •  FX: " .. describeEffect(effect))
    return true
  end

  local err = (video and video.getLastError and video.getLastError()) or "failed to open video device"
  updateStatus(ctx, "Open failed: " .. tostring(err))
  return false
end

local function refreshDevices(ctx)
  local devices = {}
  if video and video.listDevices then
    devices = video.listDevices() or {}
  end

  ctx._devices = devices
  local labels = {}
  for i = 1, #devices do
    labels[i] = describeDevice(devices[i])
  end
  if #labels == 0 then
    labels[1] = "No devices found"
  end

  local selectedIndex = (#devices > 0) and 1 or nil
  local persisted = ctx._persisted or {}
  if persisted.devicePath then
    for i = 1, #devices do
      if tostring(devices[i].path or "") == tostring(persisted.devicePath) then
        selectedIndex = i
        break
      end
    end
  end

  if ctx.widgets.deviceSelect and ctx.widgets.deviceSelect.setOptions then
    ctx.widgets.deviceSelect:setOptions(labels)
    ctx.widgets.deviceSelect:setSelected(selectedIndex or 1)
  end

  if #devices == 0 then
    ctx._selectedDevice = nil
    ctx._modes = {}
    syncModeOptions(ctx)
    updateStatus(ctx, "No V4L2 capture devices found under /dev/video*")
    return
  end

  refreshModes(ctx, selectedIndex or 1)
  if #ctx._modes > 0 then
    openCurrentSelection(ctx)
  end
end

local function onEffectChanged(ctx, selectedIndex)
  ctx._selectedEffect = selectedIndex
  syncEffectControls(ctx)
  setViewportSurface(ctx)
  savePersistedState(ctx)

  local devices = ctx._devices or {}
  local modes = ctx._modes or {}
  local device = devices[ctx._selectedDevice]
  local mode = modes[ctx._selectedMode]
  if type(device) == "table" and type(mode) == "table" and video and video.isOpen and video.isOpen() then
    updateStatus(ctx, "Streaming " .. describeDevice(device) .. " / " .. describeMode(mode) .. "  •  FX: " .. describeEffect(ctx._effects[selectedIndex]))
  end
end

local function installParamCallbacks(ctx)
  for i = 1, MAX_EFFECT_PARAMS do
    local slider = ctx.widgets["fxParam" .. tostring(i)]
    if slider then
      slider._onChange = function(value)
        local effect = ctx._effects and ctx._effects[ctx._selectedEffect] or nil
        local spec = ctx._activeParamSpecs and ctx._activeParamSpecs[i] or nil
        if type(effect) ~= "table" or type(spec) ~= "table" then
          return
        end
        local effectState = ensureEffectState(ctx, effect)
        effectState[spec.id] = value
        setViewportSurface(ctx)
        savePersistedState(ctx)
      end
    end
  end
end

function M.init(ctx)
  ctx._devices = {}
  ctx._modes = {}
  ctx._effects = {}
  ctx._effectStates = {}
  ctx._activeParamSpecs = {}
  ctx._selectedDevice = nil
  ctx._selectedMode = nil
  ctx._selectedEffect = 1
  ctx._statusText = ""
  loadPersistedState(ctx)

  syncRendererMode(ctx)
  updateFrameInfo(ctx)
  refreshEffects(ctx)
  refreshDevices(ctx)
  installParamCallbacks(ctx)

  if ctx.widgets.refreshBtn then
    ctx.widgets.refreshBtn._onClick = function()
      refreshDevices(ctx)
    end
  end

  if ctx.widgets.openBtn then
    ctx.widgets.openBtn._onClick = function()
      openCurrentSelection(ctx)
    end
  end

  if ctx.widgets.closeBtn then
    ctx.widgets.closeBtn._onClick = function()
      if video and video.close then
        video.close()
      end
      updateStatus(ctx, "Video device closed")
      updateFrameInfo(ctx)
    end
  end

  if ctx.widgets.deviceSelect then
    ctx.widgets.deviceSelect._onSelect = function(selectedIndex)
      refreshModes(ctx, selectedIndex)
      if #(ctx._modes or {}) > 0 then
        openCurrentSelection(ctx)
      end
    end
  end

  if ctx.widgets.modeSelect then
    ctx.widgets.modeSelect._onSelect = function(selectedIndex)
      ctx._selectedMode = selectedIndex
      openCurrentSelection(ctx)
    end
  end

  if ctx.widgets.effectSelect then
    ctx.widgets.effectSelect._onSelect = function(selectedIndex)
      onEffectChanged(ctx, selectedIndex)
    end
  end
end

function M.resized(ctx, _w, _h)
  syncRendererMode(ctx)
  updateFrameInfo(ctx)
  syncEffectControls(ctx)
end

function M.update(ctx, _state)
  syncRendererMode(ctx)
  updateFrameInfo(ctx)
  syncEffectDescription(ctx)

  if video and video.isOpen and video.isOpen() then
    local devices = ctx._devices or {}
    local modes = ctx._modes or {}
    local device = devices[ctx._selectedDevice]
    local mode = modes[ctx._selectedMode]
    local effect = ctx._effects and ctx._effects[ctx._selectedEffect] or nil
    if type(device) == "table" and type(mode) == "table" then
      updateStatus(ctx, "Streaming " .. describeDevice(device) .. " / " .. describeMode(mode) .. "  •  FX: " .. describeEffect(effect))
      return
    end
    updateStatus(ctx, "Streaming active video device  •  FX: " .. describeEffect(effect))
    return
  end

  local err = (video and video.getLastError and video.getLastError()) or ""
  if err ~= "" then
    updateStatus(ctx, "Idle - " .. tostring(err))
  elseif ctx._statusText ~= "" then
    setText(ctx.widgets.status, ctx._statusText)
  end
end

function M.cleanup(_ctx)
  if video and video.close then
    video.close()
  end
end

return M
