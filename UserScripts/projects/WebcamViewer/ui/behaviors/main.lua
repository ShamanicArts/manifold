local M = {}

local NUM_LAYERS = 4
local NUM_PARAM_SLIDERS = 9
local NUM_SOURCE_PARAM_SLIDERS = 4

local STACK_CONFIG = {
  a = { suffix = "", label = "A" },
  b = { suffix = "B", label = "B" },
}

local STACK_ORDER = { "a", "b" }

local SOURCE_WIDGET_BASES = {
  "sourceTitle",
  "sourceSelect",
  "sourceDescription",
  "deviceSelect",
  "modeSelect",
  "refreshBtn",
  "openBtn",
  "closeBtn",
  "frameInfo",
  "sourceParam1",
  "sourceParam2",
  "sourceParam3",
  "sourceParam4",
}

local FX_WIDGET_BASES = {
  "fxTitle",
  "layerTabs",
  "layerEnabledBtn",
  "clearLayerBtn",
  "effectSelect",
  "layerDescription",
  "fxParam1",
  "fxParam2",
  "fxParam3",
  "fxParam4",
  "fxParam5",
  "fxParam6",
  "fxParam7",
  "fxParam8",
  "fxParam9",
}

local WEBCAM_SOURCE = {
  kind = "webcam",
  id = "webcam",
  name = "Webcam",
  category = "capture",
  description = "Live V4L2 capture source.",
  params = {},
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
  if widget and widget.setText then
    widget:setText(text or "")
  end
end

local function setSelected(widget, index)
  if widget and widget.setSelected then
    widget:setSelected(index or 1)
  end
end

local function setOptions(widget, options)
  if widget and widget.setOptions then
    widget:setOptions(options or {})
  end
end

local function setVisible(widget, visible)
  if widget and widget.setVisible then
    widget:setVisible(visible == true)
  elseif widget and widget.node and widget.node.setVisible then
    widget.node:setVisible(visible == true)
  end
end

local function setBounds(widget, x, y, w, h)
  local rx = round(x)
  local ry = round(y)
  local rw = round(w)
  local rh = round(h)
  if widget and widget.setBounds then
    widget:setBounds(rx, ry, rw, rh)
  elseif widget and widget.node and widget.node.setBounds then
    widget.node:setBounds(rx, ry, rw, rh)
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

local function stackWidget(ctx, stackKey, base)
  local cfg = STACK_CONFIG[stackKey]
  if not cfg then return nil end
  return ctx.widgets[base .. cfg.suffix]
end

local function stackState(ctx, stackKey)
  return ctx._stacks and ctx._stacks[stackKey] or nil
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

local function defaultSourceState()
  return {
    kind = "webcam",
    id = "webcam",
    params = {},
  }
end

local function createStackState()
  local stack = {
    devices = {},
    modes = {},
    source = defaultSourceState(),
    layers = {},
    activeLayer = 1,
    activeParamSpecs = {},
    selectedDevice = nil,
    selectedMode = nil,
    editorMode = "source",
  }
  for i = 1, NUM_LAYERS do
    stack.layers[i] = defaultLayer(i)
  end
  return stack
end

local function defaultPersistedStack()
  local layers = {}
  for i = 1, NUM_LAYERS do
    layers[i] = {
      enabled = nil,
      effectId = nil,
      params = {},
    }
  end
  return {
    sourceKind = "webcam",
    sourceId = "webcam",
    sourceParams = {},
    devicePath = nil,
    width = nil,
    height = nil,
    fps = nil,
    pixelFormat = nil,
    activeLayer = nil,
    editorMode = "source",
    layers = layers,
  }
end

local function stackPrefix(stackKey)
  return stackKey .. "."
end

local function parsePersistedIntoStack(target, key, value)
  if key == "sourceKind" then target.sourceKind = value
  elseif key == "sourceId" then target.sourceId = value
  elseif key == "devicePath" then target.devicePath = value
  elseif key == "width" then target.width = tonumber(value)
  elseif key == "height" then target.height = tonumber(value)
  elseif key == "fps" then target.fps = tonumber(value)
  elseif key == "pixelFormat" then target.pixelFormat = value
  elseif key == "activeLayer" then target.activeLayer = tonumber(value)
  elseif key == "editorMode" then target.editorMode = value
  else
    local sourceParamId = key:match("^source%.param%.(.+)$")
    if sourceParamId then
      target.sourceParams[sourceParamId] = tonumber(value)
      return
    end

    local layerIdx, field = key:match("^layer%.(%d+)%.([%w_]+)$")
    if layerIdx and field then
      local L = target.layers[tonumber(layerIdx)]
      if L then
        if field == "enabled" then L.enabled = (value == "true")
        elseif field == "effectId" then L.effectId = value end
      end
      return
    end

    local li, effectId, paramId = key:match("^layer%.(%d+)%.param%.([^%.]+)%.(.+)$")
    if li and effectId and paramId then
      local L = target.layers[tonumber(li)]
      if L then
        L.params[effectId] = L.params[effectId] or {}
        L.params[effectId][paramId] = tonumber(value)
      end
    end
  end
end

local function loadPersistedState(ctx)
  ctx._persisted = {
    stacks = {
      a = defaultPersistedStack(),
      b = defaultPersistedStack(),
    }
  }

  local path = stateFilePath()
  local raw = (type(readTextFile) == "function") and readTextFile(path) or ""
  if raw == "" then
    return
  end

  for line in tostring(raw):gmatch("[^\r\n]+") do
    local key, value = line:match("^([^=]+)=(.*)$")
    if key and value then
      local prefixedStack, rest = key:match("^([ab])%.(.+)$")
      if prefixedStack and rest then
        parsePersistedIntoStack(ctx._persisted.stacks[prefixedStack], rest, value)
      else
        parsePersistedIntoStack(ctx._persisted.stacks.a, key, value)
      end
    end
  end
end

local function savePersistedState(ctx)
  local lines = {}
  for _, stackKey in ipairs(STACK_ORDER) do
    local stack = stackState(ctx, stackKey)
    local prefix = stackPrefix(stackKey)
    lines[#lines + 1] = prefix .. "sourceKind=" .. tostring(stack.source.kind or "webcam")
    lines[#lines + 1] = prefix .. "sourceId=" .. tostring(stack.source.id or "webcam")
    lines[#lines + 1] = prefix .. "editorMode=" .. tostring(stack.editorMode or "source")

    for paramId, value in pairs(stack.source.params or {}) do
      lines[#lines + 1] = string.format("%ssource.param.%s=%s", prefix, tostring(paramId), tostring(value))
    end

    local device = stack.devices[stack.selectedDevice]
    local mode = stack.modes[stack.selectedMode]
    if type(device) == "table" and type(mode) == "table" then
      lines[#lines + 1] = prefix .. "devicePath=" .. tostring(device.path or "")
      lines[#lines + 1] = prefix .. "width=" .. tostring(mode.width or 0)
      lines[#lines + 1] = prefix .. "height=" .. tostring(mode.height or 0)
      lines[#lines + 1] = prefix .. "fps=" .. tostring(mode.fps or 0)
      lines[#lines + 1] = prefix .. "pixelFormat=" .. tostring(mode.pixelFormat or "")
    end

    lines[#lines + 1] = prefix .. "activeLayer=" .. tostring(stack.activeLayer or 1)
    for i = 1, NUM_LAYERS do
      local L = stack.layers[i]
      lines[#lines + 1] = string.format("%slayer.%d.enabled=%s", prefix, i, tostring(L.enabled and true or false))
      lines[#lines + 1] = string.format("%slayer.%d.effectId=%s", prefix, i, tostring(L.effectId or "none"))
      for effectId, paramMap in pairs(L.params or {}) do
        if type(paramMap) == "table" then
          for paramId, v in pairs(paramMap) do
            lines[#lines + 1] = string.format("%slayer.%d.param.%s.%s=%s", prefix, i, tostring(effectId), tostring(paramId), tostring(v))
          end
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

local function ensureLayerEffectParams(ctx, stackKey, layer)
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

local function findSourceChoice(ctx, kind, id)
  for i = 1, #(ctx._sourceChoices or {}) do
    local choice = ctx._sourceChoices[i]
    if tostring(choice.kind) == tostring(kind) and tostring(choice.id) == tostring(id) then
      return choice, i
    end
  end
  return (ctx._sourceChoices and ctx._sourceChoices[1]) or WEBCAM_SOURCE, 1
end

local function ensureSourceParams(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack or stack.source.kind ~= "generator" then
    return {}
  end
  local choice = findSourceChoice(ctx, stack.source.kind, stack.source.id)
  stack.source.params = stack.source.params or {}
  for i = 1, #((choice and choice.params) or {}) do
    local param = choice.params[i]
    if stack.source.params[param.id] == nil then
      stack.source.params[param.id] = tonumber(param.default) or 0
    end
  end
  return stack.source.params
end

local function buildSourceDescriptor(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then
    return { type = "webcam" }
  end

  if stack.source.kind == "generator" then
    local params = ensureSourceParams(ctx, stackKey)
    local copy = {}
    for k, v in pairs(params) do copy[k] = v end
    return {
      type = "generator",
      sourceId = stack.source.id,
      params = copy,
    }
  end

  return {
    type = "webcam",
  }
end

local function buildLayerPayloadList(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  local list = {}
  if not stack then
    return list
  end

  for i = 1, NUM_LAYERS do
    local L = stack.layers[i]
    if L and L.enabled then
      local effect = findEffect(ctx, L.effectId)
      if type(effect) == "table" then
        local paramStore = ensureLayerEffectParams(ctx, stackKey, L)
        local paramsCopy = {}
        for k, v in pairs(paramStore) do paramsCopy[k] = v end
        list[#list + 1] = {
          enabled = true,
          effectId = effect.id,
          params = paramsCopy,
        }
      end
    end
  end
  return list
end

local function setViewportSurface(ctx, stackKey)
  local viewport = stackWidget(ctx, stackKey, "viewport")
  if not viewport or not viewport.node then
    return
  end

  if shaders and shaders.buildPipeline then
    local layers = buildLayerPayloadList(ctx, stackKey)
    local source = buildSourceDescriptor(ctx, stackKey)
    local ok, payload = pcall(shaders.buildPipeline, layers, "contain", source)
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

local function valueFormatter(spec)
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

local function configureSlider(slider, spec, value)
  if not slider then return end
  if type(spec) ~= "table" then
    setVisible(slider, false)
    return
  end

  slider._min = tonumber(spec.min) or 0
  slider._max = tonumber(spec.max) or 1
  slider._step = tonumber(spec.step) or 0.01
  slider._defaultValue = tonumber(spec.default) or slider._min
  if slider.setLabel then slider:setLabel(spec.name or spec.id or "Param") end
  if slider.setValueFormatter then slider:setValueFormatter(valueFormatter(spec)) end
  setVisible(slider, true)
  if slider.setValue then slider:setValue(tonumber(value) or slider._defaultValue) end
end

local function updateFrameInfo(ctx, stackKey)
  local widget = stackWidget(ctx, stackKey, "frameInfo")
  local stack = stackState(ctx, stackKey)
  if not widget or not stack then return end

  if stack.source.kind ~= "webcam" then
    setText(widget, "Frame: generator")
    return
  end

  local info = (capture and capture.getFrameInfo and capture.getFrameInfo()) or nil
  if type(info) == "table" and info.valid then
    setText(widget,
      string.format("Frame: %dx%d  seq=%d  device=%d",
        tonumber(info.width) or 0,
        tonumber(info.height) or 0,
        tonumber(info.sequence) or 0,
        tonumber(info.activeDeviceIndex) or -1))
  else
    setText(widget, "Frame: --")
  end
end

local function syncEditorMode(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end

  local sourceVisible = stack.editorMode == "source"
  local fxVisible = not sourceVisible
  local isWebcam = stack.source.kind == "webcam"
  local selectedSource = findSourceChoice(ctx, stack.source.kind, stack.source.id)

  local tabs = stackWidget(ctx, stackKey, "editorModeTabs")
  if tabs then
    setSelected(tabs, sourceVisible and 1 or 2)
  end

  setVisible(stackWidget(ctx, stackKey, "sourceTitle"), sourceVisible)
  setVisible(stackWidget(ctx, stackKey, "sourceSelect"), sourceVisible)
  setVisible(stackWidget(ctx, stackKey, "sourceDescription"), sourceVisible)
  setVisible(stackWidget(ctx, stackKey, "deviceSelect"), sourceVisible and isWebcam)
  setVisible(stackWidget(ctx, stackKey, "modeSelect"), sourceVisible and isWebcam)
  setVisible(stackWidget(ctx, stackKey, "refreshBtn"), sourceVisible and isWebcam)
  setVisible(stackWidget(ctx, stackKey, "openBtn"), sourceVisible and isWebcam)
  setVisible(stackWidget(ctx, stackKey, "closeBtn"), sourceVisible and isWebcam)
  setVisible(stackWidget(ctx, stackKey, "frameInfo"), sourceVisible and isWebcam)

  for i = 1, NUM_SOURCE_PARAM_SLIDERS do
    local slider = stackWidget(ctx, stackKey, "sourceParam" .. tostring(i))
    local spec = selectedSource and selectedSource.params and selectedSource.params[i] or nil
    setVisible(slider, sourceVisible and not isWebcam and type(spec) == "table")
  end

  setVisible(stackWidget(ctx, stackKey, "fxTitle"), fxVisible)
  setVisible(stackWidget(ctx, stackKey, "layerTabs"), fxVisible)
  setVisible(stackWidget(ctx, stackKey, "layerEnabledBtn"), fxVisible)
  setVisible(stackWidget(ctx, stackKey, "clearLayerBtn"), fxVisible)
  setVisible(stackWidget(ctx, stackKey, "effectSelect"), fxVisible)
  setVisible(stackWidget(ctx, stackKey, "layerDescription"), fxVisible)

  for i = 1, NUM_PARAM_SLIDERS do
    local slider = stackWidget(ctx, stackKey, "fxParam" .. tostring(i))
    local spec = stack.activeParamSpecs and stack.activeParamSpecs[i] or nil
    setVisible(slider, fxVisible and type(spec) == "table")
  end
end

local function syncLayerTabLabels(ctx, stackKey)
  local tabs = stackWidget(ctx, stackKey, "layerTabs")
  local stack = stackState(ctx, stackKey)
  if not tabs or not stack then return end

  local labels = {}
  for i = 1, NUM_LAYERS do
    local L = stack.layers[i]
    local marker = (L and L.enabled) and "•" or " "
    labels[i] = string.format("L%d %s", i, marker)
  end
  if tabs.setSegments then tabs:setSegments(labels) end
  if tabs.setOptions then tabs:setOptions(labels) end
  setSelected(tabs, stack.activeLayer or 1)
end

local function syncLayerControls(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end

  local layer = stack.layers[stack.activeLayer] or stack.layers[1]

  local labels = {}
  local effectIndex = 1
  for i = 1, #(ctx._effects or {}) do
    labels[i] = describeEffect(ctx._effects[i])
    if tostring(ctx._effects[i].id or "") == tostring(layer.effectId) then
      effectIndex = i
    end
  end
  if #labels == 0 then labels[1] = "Passthrough" end
  setOptions(stackWidget(ctx, stackKey, "effectSelect"), labels)
  setSelected(stackWidget(ctx, stackKey, "effectSelect"), effectIndex)

  local enabledBtn = stackWidget(ctx, stackKey, "layerEnabledBtn")
  if enabledBtn then
    if enabledBtn.setLabel then
      enabledBtn:setLabel(layer.enabled and "On" or "Off")
    elseif enabledBtn.setText then
      enabledBtn:setText(layer.enabled and "On" or "Off")
    end
  end

  local effect = findEffect(ctx, layer.effectId)
  local description
  if type(effect) == "table" then
    local category = tostring(effect.category or "utility")
    local detail = tostring(effect.description or "")
    description = string.format("[%s] %s", category, detail ~= "" and detail or describeEffect(effect))
  else
    description = "Select an effect for this layer"
  end
  setText(stackWidget(ctx, stackKey, "layerDescription"), description)

  local paramStore = ensureLayerEffectParams(ctx, stackKey, layer)
  stack.activeParamSpecs = {}
  for i = 1, NUM_PARAM_SLIDERS do
    local slider = stackWidget(ctx, stackKey, "fxParam" .. tostring(i))
    local spec = (type(effect) == "table" and effect.params and effect.params[i]) or nil
    stack.activeParamSpecs[i] = spec
    configureSlider(slider, spec, spec and paramStore[spec.id] or nil)
  end

  syncLayerTabLabels(ctx, stackKey)
  syncEditorMode(ctx, stackKey)
end

local function syncSourceControls(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end

  local labels = {}
  local selectedIndex = 1
  local selectedSource = nil
  for i = 1, #(ctx._sourceChoices or {}) do
    local choice = ctx._sourceChoices[i]
    labels[i] = tostring(choice.name or choice.id or "Source")
    if tostring(choice.kind) == tostring(stack.source.kind) and tostring(choice.id) == tostring(stack.source.id) then
      selectedIndex = i
      selectedSource = choice
    end
  end
  if not selectedSource then
    selectedSource = (ctx._sourceChoices and ctx._sourceChoices[1]) or WEBCAM_SOURCE
  end

  setOptions(stackWidget(ctx, stackKey, "sourceSelect"), labels)
  setSelected(stackWidget(ctx, stackKey, "sourceSelect"), selectedIndex)
  setText(stackWidget(ctx, stackKey, "sourceDescription"), tostring(selectedSource.description or ""))
  setText(stackWidget(ctx, stackKey, "viewportTitle"), string.format("%s Preview", tostring(selectedSource.name or "Source")))

  local sourceParams = ensureSourceParams(ctx, stackKey)
  for i = 1, NUM_SOURCE_PARAM_SLIDERS do
    local slider = stackWidget(ctx, stackKey, "sourceParam" .. tostring(i))
    local spec = (selectedSource.params and selectedSource.params[i]) or nil
    configureSlider(slider, spec, spec and sourceParams[spec.id] or nil)
  end

  updateFrameInfo(ctx, stackKey)
  syncEditorMode(ctx, stackKey)
end

local function rebuildLayerDefaults(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end
  for i = 1, NUM_LAYERS do
    local L = stack.layers[i]
    local effect = findEffect(ctx, L.effectId)
    if type(effect) ~= "table" then
      L.effectId = "none"
    end
    ensureLayerEffectParams(ctx, stackKey, L)
  end
end

local function applyPersistedState(ctx)
  for _, stackKey in ipairs(STACK_ORDER) do
    local stack = stackState(ctx, stackKey)
    local persisted = ctx._persisted.stacks[stackKey]
    stack.source.kind = tostring(persisted.sourceKind or "webcam")
    stack.source.id = tostring(persisted.sourceId or "webcam")
    stack.source.params = {}
    for paramId, value in pairs(persisted.sourceParams or {}) do
      stack.source.params[paramId] = value
    end
    stack.editorMode = (persisted.editorMode == "fx") and "fx" or "source"

    for i = 1, NUM_LAYERS do
      local L = stack.layers[i]
      local P = persisted.layers[i]
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

    stack.activeLayer = tonumber(persisted.activeLayer) or 1
    if stack.activeLayer < 1 or stack.activeLayer > NUM_LAYERS then
      stack.activeLayer = 1
    end
  end
end

local function refreshSourceRegistry(ctx)
  local generatorSources = (sources and sources.list and sources.list()) or {}
  ctx._sourceChoices = { WEBCAM_SOURCE }
  for i = 1, #generatorSources do
    local src = generatorSources[i]
    ctx._sourceChoices[#ctx._sourceChoices + 1] = {
      kind = "generator",
      id = src.id,
      name = src.name,
      category = src.category,
      description = src.description,
      params = src.params or {},
    }
  end

  for _, stackKey in ipairs(STACK_ORDER) do
    local stack = stackState(ctx, stackKey)
    local choice = findSourceChoice(ctx, stack.source.kind, stack.source.id)
    if not choice then
      stack.source = defaultSourceState()
    end
    ensureSourceParams(ctx, stackKey)
    syncSourceControls(ctx, stackKey)
  end
end

local function refreshEffects(ctx)
  ctx._effects = (shaders and shaders.listEffects and shaders.listEffects()) or {}
  if #ctx._effects == 0 then
    ctx._effects = {
      { id = "none", name = "Passthrough", category = "utility", description = "Dry source feed", params = {} }
    }
  end

  for _, stackKey in ipairs(STACK_ORDER) do
    rebuildLayerDefaults(ctx, stackKey)
    syncLayerControls(ctx, stackKey)
    setViewportSurface(ctx, stackKey)
  end
end

local function syncModeOptions(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end

  local labels = {}
  for i = 1, #(stack.modes or {}) do
    labels[i] = describeMode(stack.modes[i])
  end
  if #labels == 0 then labels[1] = "No modes found" end

  local selectedIndex = (#stack.modes > 0) and 1 or nil
  local persisted = ctx._persisted.stacks[stackKey]
  if persisted.width and persisted.height and persisted.fps and persisted.pixelFormat then
    for i = 1, #(stack.modes or {}) do
      local mode = stack.modes[i]
      if tonumber(mode.width) == tonumber(persisted.width)
        and tonumber(mode.height) == tonumber(persisted.height)
        and tonumber(mode.fps) == tonumber(persisted.fps)
        and tostring(mode.pixelFormat or "") == tostring(persisted.pixelFormat or "") then
        selectedIndex = i
        break
      end
    end
  end

  setOptions(stackWidget(ctx, stackKey, "modeSelect"), labels)
  setSelected(stackWidget(ctx, stackKey, "modeSelect"), selectedIndex or 1)
  stack.selectedMode = selectedIndex
end

local function refreshModes(ctx, stackKey, deviceListIndex)
  local stack = stackState(ctx, stackKey)
  if not stack then return end
  stack.selectedDevice = deviceListIndex
  stack.modes = {}

  local device = stack.devices[deviceListIndex]
  if type(device) ~= "table" then
    syncModeOptions(ctx, stackKey)
    return
  end

  if capture and capture.listModes then
    stack.modes = capture.listModes(tonumber(device.index) or -1) or {}
  end
  syncModeOptions(ctx, stackKey)
end

local function layerSummary(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return "Passthrough" end

  local names = {}
  for i = 1, NUM_LAYERS do
    local L = stack.layers[i]
    if L and L.enabled then
      local effect = findEffect(ctx, L.effectId)
      names[#names + 1] = string.format("L%d:%s", i, describeEffect(effect))
    end
  end
  if #names == 0 then return "Passthrough" end
  return table.concat(names, " -> ")
end

local function stackSummary(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  local cfg = STACK_CONFIG[stackKey]
  if not stack then return "" end

  if stack.source.kind == "generator" then
    local choice = findSourceChoice(ctx, stack.source.kind, stack.source.id)
    return string.format("%s:%s • FX:%s", cfg.label, tostring(choice.name or stack.source.id), layerSummary(ctx, stackKey))
  end

  local device = stack.devices[stack.selectedDevice]
  local mode = stack.modes[stack.selectedMode]
  if capture and capture.isOpen and capture.isOpen() then
    if type(device) == "table" and type(mode) == "table" then
      return string.format("%s:%s / %s • FX:%s", cfg.label, describeDevice(device), describeMode(mode), layerSummary(ctx, stackKey))
    end
    return string.format("%s:webcam active • FX:%s", cfg.label, layerSummary(ctx, stackKey))
  end

  return string.format("%s:webcam idle • FX:%s", cfg.label, layerSummary(ctx, stackKey))
end

local function syncGlobalStatus(ctx)
  setText(ctx.widgets.status, stackSummary(ctx, "a") .. "   |   " .. stackSummary(ctx, "b"))
  setText(ctx.widgets.compositeStatus, "Composite stack placeholder — A and B are now full editors with complete parameter visibility.")
end

local function openCurrentSelection(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return false end

  if stack.source.kind ~= "webcam" then
    setViewportSurface(ctx, stackKey)
    savePersistedState(ctx)
    syncGlobalStatus(ctx)
    return true
  end

  local device = stack.devices[stack.selectedDevice]
  local mode = stack.modes[stack.selectedMode]
  if type(device) ~= "table" or type(mode) ~= "table" then
    syncGlobalStatus(ctx)
    return false
  end

  local ok = false
  if capture and capture.open then
    ok = capture.open(tonumber(device.index) or 0,
                      tonumber(mode.width) or 640,
                      tonumber(mode.height) or 480,
                      tonumber(mode.fps) or 30)
  end

  if ok then
    setViewportSurface(ctx, "a")
    setViewportSurface(ctx, "b")
    savePersistedState(ctx)
    syncGlobalStatus(ctx)
    return true
  end

  syncGlobalStatus(ctx)
  return false
end

local function refreshDevices(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end

  local devices = {}
  if stack.source.kind == "webcam" and capture and capture.listDevices then
    devices = capture.listDevices() or {}
  end

  stack.devices = devices
  local labels = {}
  for i = 1, #devices do
    labels[i] = describeDevice(devices[i])
  end
  if #labels == 0 then labels[1] = "No devices found" end

  local selectedIndex = (#devices > 0) and 1 or nil
  local persisted = ctx._persisted.stacks[stackKey]
  if persisted.devicePath then
    for i = 1, #devices do
      if tostring(devices[i].path or "") == tostring(persisted.devicePath) then
        selectedIndex = i
        break
      end
    end
  end

  setOptions(stackWidget(ctx, stackKey, "deviceSelect"), labels)
  setSelected(stackWidget(ctx, stackKey, "deviceSelect"), selectedIndex or 1)

  if #devices == 0 then
    stack.selectedDevice = nil
    stack.modes = {}
    syncModeOptions(ctx, stackKey)
    updateFrameInfo(ctx, stackKey)
    syncGlobalStatus(ctx)
    return
  end

  refreshModes(ctx, stackKey, selectedIndex or 1)
  if #stack.modes > 0 and stack.source.kind == "webcam" then
    openCurrentSelection(ctx, stackKey)
  end
end

local function setSelectedSource(ctx, stackKey, selectedIndex)
  local stack = stackState(ctx, stackKey)
  if not stack then return end

  local choice = ctx._sourceChoices and ctx._sourceChoices[selectedIndex] or WEBCAM_SOURCE
  if not choice then return end

  if stack.source.kind == "webcam" and choice.kind ~= "webcam" and capture and capture.close then
    capture.close()
  end

  stack.source.kind = choice.kind
  stack.source.id = choice.id
  stack.source.params = stack.source.params or {}
  ensureSourceParams(ctx, stackKey)
  syncSourceControls(ctx, stackKey)
  refreshDevices(ctx, stackKey)
  openCurrentSelection(ctx, stackKey)
  savePersistedState(ctx)
end

local function setEditorMode(ctx, stackKey, editorIndex)
  local stack = stackState(ctx, stackKey)
  if not stack then return end
  stack.editorMode = (tonumber(editorIndex) == 2) and "fx" or "source"
  syncSourceControls(ctx, stackKey)
  syncLayerControls(ctx, stackKey)
  savePersistedState(ctx)
end

local function setActiveLayer(ctx, stackKey, index)
  local stack = stackState(ctx, stackKey)
  if not stack or type(index) ~= "number" then return end
  if index < 1 then index = 1 end
  if index > NUM_LAYERS then index = NUM_LAYERS end
  stack.activeLayer = index
  syncLayerControls(ctx, stackKey)
  savePersistedState(ctx)
end

local function setActiveLayerEffect(ctx, stackKey, effectIndex)
  local stack = stackState(ctx, stackKey)
  local effect = ctx._effects and ctx._effects[effectIndex] or nil
  if not stack or type(effect) ~= "table" then return end
  local layer = stack.layers[stack.activeLayer]
  if not layer then return end
  layer.effectId = effect.id
  ensureLayerEffectParams(ctx, stackKey, layer)
  syncLayerControls(ctx, stackKey)
  setViewportSurface(ctx, stackKey)
  savePersistedState(ctx)
  syncGlobalStatus(ctx)
end

local function toggleActiveLayerEnabled(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end
  local layer = stack.layers[stack.activeLayer]
  if not layer then return end
  layer.enabled = not layer.enabled
  syncLayerControls(ctx, stackKey)
  setViewportSurface(ctx, stackKey)
  savePersistedState(ctx)
  syncGlobalStatus(ctx)
end

local function clearActiveLayer(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end
  local index = stack.activeLayer or 1
  stack.layers[index] = defaultLayer(index)
  stack.layers[index].enabled = false
  ensureLayerEffectParams(ctx, stackKey, stack.layers[index])
  syncLayerControls(ctx, stackKey)
  setViewportSurface(ctx, stackKey)
  savePersistedState(ctx)
  syncGlobalStatus(ctx)
end

local function installParamCallbacks(ctx)
  for _, stackKey in ipairs(STACK_ORDER) do
    local stack = stackState(ctx, stackKey)

    for i = 1, NUM_PARAM_SLIDERS do
      local slider = stackWidget(ctx, stackKey, "fxParam" .. tostring(i))
      if slider then
        slider._onChange = function(value)
          local layer = stack.layers[stack.activeLayer]
          local spec = stack.activeParamSpecs and stack.activeParamSpecs[i] or nil
          if not layer or type(spec) ~= "table" then return end
          local store = ensureLayerEffectParams(ctx, stackKey, layer)
          store[spec.id] = value
          setViewportSurface(ctx, stackKey)
          savePersistedState(ctx)
          syncGlobalStatus(ctx)
        end
      end
    end

    for i = 1, NUM_SOURCE_PARAM_SLIDERS do
      local slider = stackWidget(ctx, stackKey, "sourceParam" .. tostring(i))
      if slider then
        slider._onChange = function(value)
          local choice = findSourceChoice(ctx, stack.source.kind, stack.source.id)
          local spec = choice and choice.params and choice.params[i] or nil
          if stack.source.kind ~= "generator" or type(spec) ~= "table" then return end
          stack.source.params[spec.id] = value
          setViewportSurface(ctx, stackKey)
          savePersistedState(ctx)
          syncGlobalStatus(ctx)
        end
      end
    end
  end
end

local function layoutStack(ctx, stackKey, y, h, width)
  local pad = 16
  local gap = 16
  local leftX = pad
  local fullW = width - pad * 2
  local editorW = clamp(math.floor(fullW * 0.42), 500, 560)
  local previewW = math.max(280, fullW - editorW - gap)
  local editorX = leftX + previewW + gap

  setBounds(stackWidget(ctx, stackKey, "viewportPanel"), leftX, y, previewW, h)
  setBounds(stackWidget(ctx, stackKey, "viewportTitle"), leftX + 14, y + 12, previewW - 28, 18)
  setBounds(stackWidget(ctx, stackKey, "viewportHint"), leftX + 14, y + 34, previewW - 28, 16)
  setBounds(stackWidget(ctx, stackKey, "viewport"), leftX + 12, y + 58, previewW - 24, math.max(80, h - 70))

  setBounds(stackWidget(ctx, stackKey, "editorPanel"), editorX, y, editorW, h)
  setBounds(stackWidget(ctx, stackKey, "editorTitle"), editorX + 16, y + 12, 200, 18)
  setBounds(stackWidget(ctx, stackKey, "editorModeTabs"), editorX + editorW - 236, y + 10, 220, 24)

  local x = editorX + 16
  local w = editorW - 32
  local sectionY = y + 48

  setBounds(stackWidget(ctx, stackKey, "sourceTitle"), x, sectionY, w, 18)
  setBounds(stackWidget(ctx, stackKey, "fxTitle"), x, sectionY, w, 18)

  local rowY = sectionY + 26
  setBounds(stackWidget(ctx, stackKey, "sourceSelect"), x, rowY, w, 24)
  rowY = rowY + 30
  setBounds(stackWidget(ctx, stackKey, "sourceDescription"), x, rowY, w, 30)
  rowY = rowY + 36
  setBounds(stackWidget(ctx, stackKey, "deviceSelect"), x, rowY, w, 24)
  setBounds(stackWidget(ctx, stackKey, "sourceParam1"), x, rowY, w, 26)
  rowY = rowY + 32
  setBounds(stackWidget(ctx, stackKey, "modeSelect"), x, rowY, w, 24)
  setBounds(stackWidget(ctx, stackKey, "sourceParam2"), x, rowY, w, 26)
  rowY = rowY + 32
  local buttonGap = 12
  local buttonW = math.floor((w - buttonGap * 2) / 3)
  setBounds(stackWidget(ctx, stackKey, "refreshBtn"), x, rowY, buttonW, 24)
  setBounds(stackWidget(ctx, stackKey, "openBtn"), x + buttonW + buttonGap, rowY, buttonW, 24)
  setBounds(stackWidget(ctx, stackKey, "closeBtn"), x + (buttonW + buttonGap) * 2, rowY, buttonW, 24)
  setBounds(stackWidget(ctx, stackKey, "sourceParam3"), x, rowY, w, 26)
  rowY = rowY + 32
  setBounds(stackWidget(ctx, stackKey, "frameInfo"), x, rowY, w, 16)
  setBounds(stackWidget(ctx, stackKey, "sourceParam4"), x, rowY, w, 26)

  local fxY = sectionY + 26
  local tabsW = math.max(180, w - 170)
  setBounds(stackWidget(ctx, stackKey, "layerTabs"), x, fxY, tabsW, 22)
  setBounds(stackWidget(ctx, stackKey, "layerEnabledBtn"), x + tabsW + 8, fxY, 72, 22)
  setBounds(stackWidget(ctx, stackKey, "clearLayerBtn"), x + tabsW + 88, fxY, 88, 22)
  fxY = fxY + 30
  setBounds(stackWidget(ctx, stackKey, "effectSelect"), x, fxY, w, 24)
  fxY = fxY + 30
  setBounds(stackWidget(ctx, stackKey, "layerDescription"), x, fxY, w, 26)
  fxY = fxY + 34

  local colGap = 10
  local sliderW = math.floor((w - colGap * 2) / 3)
  local sliderH = 26
  local rowGap = 6
  for i = 1, NUM_PARAM_SLIDERS do
    local slider = stackWidget(ctx, stackKey, "fxParam" .. tostring(i))
    local idx = i - 1
    local row = math.floor(idx / 3)
    local col = idx % 3
    local sx = x + col * (sliderW + colGap)
    local sy = fxY + row * (sliderH + rowGap)
    setBounds(slider, sx, sy, sliderW, sliderH)
  end
end

local function layoutUi(ctx, width, height)
  local pad = 16
  local headerH = 72
  local sectionGap = 16
  local contentY = pad + headerH + pad
  local availableH = math.max(360, height - contentY - pad)

  setBounds(ctx.widgets.header, pad, pad, width - pad * 2, headerH)
  setBounds(ctx.widgets.title, pad + 16, pad + 10, 360, 22)
  setBounds(ctx.widgets.rendererMode, pad + 16, pad + 38, 240, 16)
  setBounds(ctx.widgets.status, pad + 280, pad + 14, math.max(100, width - pad * 2 - 296), 18)

  local usableH = math.max(240, availableH - sectionGap * 2)
  local stackH = math.floor(usableH / 3)
  local compositeH = stackH
  local stackAH = stackH
  local stackBH = math.max(220, usableH - compositeH - stackAH)

  local compositeY = contentY
  local stackAY = compositeY + compositeH + sectionGap
  local stackBY = stackAY + stackAH + sectionGap

  setBounds(ctx.widgets.compositePanel, pad, compositeY, width - pad * 2, compositeH)
  setBounds(ctx.widgets.compositeTitle, pad + 16, compositeY + 12, width - pad * 2 - 32, 18)
  setBounds(ctx.widgets.compositeHint, pad + 16, compositeY + 34, width - pad * 2 - 32, 16)
  setBounds(ctx.widgets.compositeStatus, pad + 16, compositeY + 54, width - pad * 2 - 32, 16)
  setBounds(ctx.widgets.compositeViewport, pad + 12, compositeY + 78, width - pad * 2 - 24, math.max(80, compositeH - 90))

  layoutStack(ctx, "a", stackAY, stackAH, width)
  layoutStack(ctx, "b", stackBY, stackBH, width)
end

function M.init(ctx)
  ctx._effects = {}
  ctx._sourceChoices = { WEBCAM_SOURCE }
  ctx._stacks = {
    a = createStackState(),
    b = createStackState(),
  }

  loadPersistedState(ctx)
  applyPersistedState(ctx)

  syncRendererMode(ctx)
  refreshSourceRegistry(ctx)
  for _, stackKey in ipairs(STACK_ORDER) do
    refreshDevices(ctx, stackKey)
  end

  local ok, err = pcall(refreshEffects, ctx)
  if not ok then
    setText(ctx.widgets.status, "Effect init failed: " .. tostring(err))
  end

  installParamCallbacks(ctx)

  for _, stackKey in ipairs(STACK_ORDER) do
    local sourceSelect = stackWidget(ctx, stackKey, "sourceSelect")
    if sourceSelect then
      sourceSelect._onSelect = function(selectedIndex)
        setSelectedSource(ctx, stackKey, selectedIndex)
      end
    end

    local deviceSelect = stackWidget(ctx, stackKey, "deviceSelect")
    if deviceSelect then
      deviceSelect._onSelect = function(selectedIndex)
        refreshModes(ctx, stackKey, selectedIndex)
        local stack = stackState(ctx, stackKey)
        if #(stack.modes or {}) > 0 and stack.source.kind == "webcam" then
          openCurrentSelection(ctx, stackKey)
        else
          syncGlobalStatus(ctx)
        end
      end
    end

    local modeSelect = stackWidget(ctx, stackKey, "modeSelect")
    if modeSelect then
      modeSelect._onSelect = function(selectedIndex)
        local stack = stackState(ctx, stackKey)
        stack.selectedMode = selectedIndex
        openCurrentSelection(ctx, stackKey)
      end
    end

    local refreshBtn = stackWidget(ctx, stackKey, "refreshBtn")
    if refreshBtn then
      refreshBtn._onClick = function()
        refreshDevices(ctx, stackKey)
      end
    end

    local openBtn = stackWidget(ctx, stackKey, "openBtn")
    if openBtn then
      openBtn._onClick = function()
        openCurrentSelection(ctx, stackKey)
      end
    end

    local closeBtn = stackWidget(ctx, stackKey, "closeBtn")
    if closeBtn then
      closeBtn._onClick = function()
        if capture and capture.close then
          capture.close()
        end
        updateFrameInfo(ctx, "a")
        updateFrameInfo(ctx, "b")
        syncGlobalStatus(ctx)
      end
    end

    local editorTabs = stackWidget(ctx, stackKey, "editorModeTabs")
    if editorTabs then
      editorTabs._onSelect = function(selectedIndex)
        setEditorMode(ctx, stackKey, selectedIndex)
      end
    end

    local layerTabs = stackWidget(ctx, stackKey, "layerTabs")
    if layerTabs then
      layerTabs._onSelect = function(selectedIndex)
        setActiveLayer(ctx, stackKey, selectedIndex)
      end
    end

    local enabledBtn = stackWidget(ctx, stackKey, "layerEnabledBtn")
    if enabledBtn then
      enabledBtn._onClick = function()
        toggleActiveLayerEnabled(ctx, stackKey)
      end
    end

    local clearBtn = stackWidget(ctx, stackKey, "clearLayerBtn")
    if clearBtn then
      clearBtn._onClick = function()
        clearActiveLayer(ctx, stackKey)
      end
    end

    local effectSelect = stackWidget(ctx, stackKey, "effectSelect")
    if effectSelect then
      effectSelect._onSelect = function(selectedIndex)
        setActiveLayerEffect(ctx, stackKey, selectedIndex)
      end
    end
  end

  for _, stackKey in ipairs(STACK_ORDER) do
    syncEditorMode(ctx, stackKey)
    syncSourceControls(ctx, stackKey)
    syncLayerControls(ctx, stackKey)
    updateFrameInfo(ctx, stackKey)
  end
  syncGlobalStatus(ctx)
end

function M.resized(ctx, w, h)
  layoutUi(ctx, w, h)
  syncRendererMode(ctx)
  for _, stackKey in ipairs(STACK_ORDER) do
    syncEditorMode(ctx, stackKey)
    syncSourceControls(ctx, stackKey)
    syncLayerControls(ctx, stackKey)
    updateFrameInfo(ctx, stackKey)
  end
  syncGlobalStatus(ctx)
end

function M.update(ctx, _state)
  syncRendererMode(ctx)
  updateFrameInfo(ctx, "a")
  updateFrameInfo(ctx, "b")
  syncGlobalStatus(ctx)
end

function M.cleanup(_ctx)
  if capture and capture.close then
    capture.close()
  end
end

return M
