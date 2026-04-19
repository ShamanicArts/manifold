local M = {}

local NUM_LAYERS = 4
local NUM_PARAM_SLIDERS = 9

local function setText(widget, text)
  if widget and widget.setText then
    widget:setText(text or "")
  end
end

local function setSelected(widget, index)
  if not widget then return end
  if widget.setSelected then
    widget:setSelected(index or 1)
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

local function defaultLayer(index)
  return {
    enabled = index == 1,
    effectId = "none",
    params = {},
  }
end

local function loadPersistedState(ctx)
  ctx._persisted = {
    devicePath = nil,
    width = nil,
    height = nil,
    fps = nil,
    pixelFormat = nil,
    activeLayer = nil,
    layers = {},
  }
  for i = 1, NUM_LAYERS do
    ctx._persisted.layers[i] = {
      enabled = nil,
      effectId = nil,
      params = {},
    }
  end

  local path = stateFilePath()
  local raw = (type(readTextFile) == "function") and readTextFile(path) or ""
  if raw == "" then
    return
  end
  for line in tostring(raw):gmatch("[^\r\n]+") do
    local key, value = line:match("^([^=]+)=(.*)$")
    if key and value then
      if key == "devicePath" then ctx._persisted.devicePath = value
      elseif key == "width" then ctx._persisted.width = tonumber(value)
      elseif key == "height" then ctx._persisted.height = tonumber(value)
      elseif key == "fps" then ctx._persisted.fps = tonumber(value)
      elseif key == "pixelFormat" then ctx._persisted.pixelFormat = value
      elseif key == "activeLayer" then ctx._persisted.activeLayer = tonumber(value)
      else
        local layerIdx, field = key:match("^layer%.(%d+)%.([%w_]+)$")
        if layerIdx and field then
          local L = ctx._persisted.layers[tonumber(layerIdx)]
          if L then
            if field == "enabled" then L.enabled = (value == "true")
            elseif field == "effectId" then L.effectId = value
            end
          end
        else
          local li, effectId, paramId = key:match("^layer%.(%d+)%.param%.([^%.]+)%.(.+)$")
          if li and effectId and paramId then
            local L = ctx._persisted.layers[tonumber(li)]
            if L then
              L.params[effectId] = L.params[effectId] or {}
              L.params[effectId][paramId] = tonumber(value)
            end
          end
        end
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

  lines[#lines + 1] = "activeLayer=" .. tostring(ctx._activeLayer or 1)
  for i = 1, NUM_LAYERS do
    local L = ctx._layers[i]
    lines[#lines + 1] = string.format("layer.%d.enabled=%s", i, tostring(L.enabled and true or false))
    lines[#lines + 1] = string.format("layer.%d.effectId=%s", i, tostring(L.effectId or "none"))
    for effectId, paramMap in pairs(L.params) do
      if type(paramMap) == "table" then
        for paramId, value in pairs(paramMap) do
          lines[#lines + 1] = string.format("layer.%d.param.%s.%s=%s", i, tostring(effectId), tostring(paramId), tostring(value))
        end
      end
    end
  end

  if type(writeTextFile) == "function" then
    writeTextFile(stateFilePath(), table.concat(lines, "\n") .. "\n")
  end
end

local function findEffect(ctx, effectId)
  for i = 1, #(ctx._effects or {}) do
    if tostring(ctx._effects[i].id or "") == tostring(effectId) then
      return ctx._effects[i], i
    end
  end
  return nil, nil
end

local function ensureLayerEffectParams(ctx, layer)
  local effect = findEffect(ctx, layer.effectId)
  if type(effect) ~= "table" then
    return {}
  end
  layer.params = layer.params or {}
  local store = layer.params[effect.id]
  if type(store) ~= "table" then
    store = {}
    layer.params[effect.id] = store
  end
  for i = 1, #(effect.params or {}) do
    local spec = effect.params[i]
    if store[spec.id] == nil then
      store[spec.id] = tonumber(spec.default) or 0
    end
  end
  return store
end

local function buildLayerPayloadList(ctx)
  local list = {}
  for i = 1, NUM_LAYERS do
    local L = ctx._layers[i]
    if L and L.enabled then
      local effect = findEffect(ctx, L.effectId)
      if type(effect) == "table" then
        local paramStore = ensureLayerEffectParams(ctx, L)
        local paramsCopy = {}
        for k, v in pairs(paramStore) do paramsCopy[k] = v end
        list[#list + 1] = {
          effectId = effect.id,
          params = paramsCopy,
        }
      end
    end
  end
  return list
end

local function setViewportSurface(ctx)
  local viewport = ctx.widgets.viewport
  if not viewport or not viewport.node then
    return
  end

  if video and video.buildEffectSurface then
    local layers = buildLayerPayloadList(ctx)
    local ok, payload = pcall(video.buildEffectSurface, layers, "contain")
    if ok and payload ~= nil then
      viewport.node:setCustomSurface("gpu_shader", payload)
      return
    end
  end

  viewport.node:setCustomSurface("video_input", {
    version = 1,
    fitMode = "contain",
  })
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
    return string.format("%.3f%s", num, unit)
  end
end

local function configureParamSlider(slider, spec, value)
  if not slider then
    return
  end
  if type(spec) ~= "table" then
    if slider.setVisible then slider:setVisible(false) end
    return
  end

  slider._min = tonumber(spec.min) or 0
  slider._max = tonumber(spec.max) or 1
  slider._step = tonumber(spec.step) or 0.01
  slider._defaultValue = tonumber(spec.default) or slider._min
  if slider.setLabel then slider:setLabel(spec.name or spec.id or "Param") end
  if slider.setValueFormatter then slider:setValueFormatter(effectParamFormatter(spec)) end
  if slider.setVisible then slider:setVisible(true) end
  if slider.setValue then slider:setValue(tonumber(value) or slider._defaultValue) end
end

local function syncLayerTabLabels(ctx)
  local tabs = ctx.widgets.layerTabs
  if not tabs then return end
  local labels = {}
  for i = 1, NUM_LAYERS do
    local L = ctx._layers[i]
    local marker = (L and L.enabled) and "•" or " "
    labels[i] = string.format("L%d %s", i, marker)
  end
  if tabs.setSegments then tabs:setSegments(labels) end
  if tabs.setOptions then tabs:setOptions(labels) end
  setSelected(tabs, ctx._activeLayer or 1)
end

local function syncLayerControls(ctx)
  local layer = ctx._layers[ctx._activeLayer] or ctx._layers[1]

  -- effect dropdown
  local labels = {}
  local effectIndex = 1
  for i = 1, #(ctx._effects or {}) do
    labels[i] = describeEffect(ctx._effects[i])
    if tostring(ctx._effects[i].id or "") == tostring(layer.effectId) then
      effectIndex = i
    end
  end
  if #labels == 0 then labels[1] = "Passthrough" end
  if ctx.widgets.effectSelect and ctx.widgets.effectSelect.setOptions then
    ctx.widgets.effectSelect:setOptions(labels)
    setSelected(ctx.widgets.effectSelect, effectIndex)
  end

  -- enabled button
  if ctx.widgets.layerEnabledBtn then
    local btn = ctx.widgets.layerEnabledBtn
    if btn.setLabel then
      btn:setLabel(layer.enabled and "On" or "Off")
    elseif btn.setText then
      btn:setText(layer.enabled and "On" or "Off")
    end
  end

  -- description
  local effect = findEffect(ctx, layer.effectId)
  local description
  if type(effect) == "table" then
    local category = tostring(effect.category or "utility")
    local detail = tostring(effect.description or "")
    description = string.format("[%s] %s", category, detail ~= "" and detail or describeEffect(effect))
  else
    description = "Select an effect for this pass"
  end
  setText(ctx.widgets.layerDescription, description)

  -- params
  local paramStore = ensureLayerEffectParams(ctx, layer)
  ctx._activeParamSpecs = {}
  for i = 1, NUM_PARAM_SLIDERS do
    local slider = ctx.widgets["fxParam" .. tostring(i)]
    local spec = (type(effect) == "table" and effect.params and effect.params[i]) or nil
    ctx._activeParamSpecs[i] = spec
    configureParamSlider(slider, spec, spec and paramStore[spec.id] or nil)
  end

  syncLayerTabLabels(ctx)
end

local function rebuildLayerDefaults(ctx)
  for i = 1, NUM_LAYERS do
    local L = ctx._layers[i]
    local effect = findEffect(ctx, L.effectId)
    if type(effect) ~= "table" then
      L.effectId = "none"
    end
    ensureLayerEffectParams(ctx, L)
  end
end

local function applyPersistedLayers(ctx)
  for i = 1, NUM_LAYERS do
    local L = ctx._layers[i]
    local P = ctx._persisted and ctx._persisted.layers and ctx._persisted.layers[i] or nil
    if type(P) == "table" then
      if P.enabled ~= nil then L.enabled = P.enabled end
      if P.effectId ~= nil then L.effectId = P.effectId end
      if type(P.params) == "table" then
        for effectId, paramMap in pairs(P.params) do
          L.params[effectId] = L.params[effectId] or {}
          for paramId, v in pairs(paramMap) do
            L.params[effectId][paramId] = v
          end
        end
      end
    end
  end
  ctx._activeLayer = tonumber(ctx._persisted and ctx._persisted.activeLayer) or 1
  if ctx._activeLayer < 1 or ctx._activeLayer > NUM_LAYERS then
    ctx._activeLayer = 1
  end
end

local function refreshEffects(ctx)
  ctx._effects = (video and video.listEffects and video.listEffects()) or {}
  if #ctx._effects == 0 then
    ctx._effects = {
      { id = "none", name = "Passthrough", category = "utility", description = "Dry webcam feed", params = {} }
    }
  end

  rebuildLayerDefaults(ctx)
  syncLayerControls(ctx)
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

local function layerSummary(ctx)
  local names = {}
  for i = 1, NUM_LAYERS do
    local L = ctx._layers[i]
    if L and L.enabled then
      local effect = findEffect(ctx, L.effectId)
      names[#names + 1] = string.format("L%d:%s", i, describeEffect(effect))
    end
  end
  if #names == 0 then return "Passthrough" end
  return table.concat(names, " -> ")
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
    updateStatus(ctx, "Streaming " .. describeDevice(device) .. " / " .. describeMode(mode) .. "  •  FX: " .. layerSummary(ctx))
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

local function setActiveLayer(ctx, index)
  if type(index) ~= "number" then return end
  if index < 1 then index = 1 end
  if index > NUM_LAYERS then index = NUM_LAYERS end
  ctx._activeLayer = index
  syncLayerControls(ctx)
end

local function setActiveLayerEffect(ctx, effectIndex)
  local effect = ctx._effects and ctx._effects[effectIndex] or nil
  if type(effect) ~= "table" then return end
  local layer = ctx._layers[ctx._activeLayer]
  if not layer then return end
  layer.effectId = effect.id
  ensureLayerEffectParams(ctx, layer)
  syncLayerControls(ctx)
  setViewportSurface(ctx)
  savePersistedState(ctx)
end

local function toggleActiveLayerEnabled(ctx)
  local layer = ctx._layers[ctx._activeLayer]
  if not layer then return end
  layer.enabled = not layer.enabled
  syncLayerControls(ctx)
  setViewportSurface(ctx)
  savePersistedState(ctx)
end

local function clearActiveLayer(ctx)
  local index = ctx._activeLayer or 1
  ctx._layers[index] = defaultLayer(index)
  ctx._layers[index].enabled = false
  ensureLayerEffectParams(ctx, ctx._layers[index])
  syncLayerControls(ctx)
  setViewportSurface(ctx)
  savePersistedState(ctx)
end



local function installParamCallbacks(ctx)
  for i = 1, NUM_PARAM_SLIDERS do
    local slider = ctx.widgets["fxParam" .. tostring(i)]
    if slider then
      slider._onChange = function(value)
        local layer = ctx._layers[ctx._activeLayer]
        local spec = ctx._activeParamSpecs and ctx._activeParamSpecs[i] or nil
        if not layer or type(spec) ~= "table" then return end
        local store = ensureLayerEffectParams(ctx, layer)
        store[spec.id] = value
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
  ctx._layers = {}
  for i = 1, NUM_LAYERS do
    ctx._layers[i] = defaultLayer(i)
  end
  ctx._activeLayer = 1
  ctx._activeParamSpecs = {}
  ctx._selectedDevice = nil
  ctx._selectedMode = nil
  ctx._statusText = ""

  loadPersistedState(ctx)
  applyPersistedLayers(ctx)

  syncRendererMode(ctx)
  updateFrameInfo(ctx)
  refreshDevices(ctx)
  local ok, err = pcall(refreshEffects, ctx)
  if not ok then
    updateStatus(ctx, "Effect init failed: " .. tostring(err))
  end
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

  if ctx.widgets.layerTabs then
    ctx.widgets.layerTabs._onSelect = function(selectedIndex)
      setActiveLayer(ctx, selectedIndex)
    end
  end

  if ctx.widgets.layerEnabledBtn then
    ctx.widgets.layerEnabledBtn._onClick = function()
      toggleActiveLayerEnabled(ctx)
    end
  end

  if ctx.widgets.clearLayerBtn then
    ctx.widgets.clearLayerBtn._onClick = function()
      clearActiveLayer(ctx)
    end
  end

  if ctx.widgets.effectSelect then
    ctx.widgets.effectSelect._onSelect = function(selectedIndex)
      setActiveLayerEffect(ctx, selectedIndex)
    end
  end


end

function M.resized(ctx, _w, _h)
  syncRendererMode(ctx)
  updateFrameInfo(ctx)
  syncLayerControls(ctx)
end

function M.update(ctx, _state)
  syncRendererMode(ctx)
  updateFrameInfo(ctx)

  if video and video.isOpen and video.isOpen() then
    local devices = ctx._devices or {}
    local modes = ctx._modes or {}
    local device = devices[ctx._selectedDevice]
    local mode = modes[ctx._selectedMode]
    if type(device) == "table" and type(mode) == "table" then
      updateStatus(ctx, "Streaming " .. describeDevice(device) .. " / " .. describeMode(mode) .. "  •  FX: " .. layerSummary(ctx))
      return
    end
    updateStatus(ctx, "Streaming active video device  •  FX: " .. layerSummary(ctx))
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
