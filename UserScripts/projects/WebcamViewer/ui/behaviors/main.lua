local M = {}

local NUM_LAYERS = 4
local NUM_PARAM_SLIDERS = 9
local NUM_SOURCE_PARAM_SLIDERS = 4
local NUM_BLEND_PARAM_SLIDERS = 4

local ML_PARAM_SPECS = {
  { id = "gain", label = "Mask Gain", min = 0.25, max = 4.0, step = 0.05, default = 1.0, unit = "x" },
  { id = "threshold", label = "Threshold", min = 0.0, max = 1.0, step = 0.01, default = 0.50, unit = "" },
  { id = "feather", label = "Feather", min = 0.0, max = 1.0, step = 0.01, default = 0.15, unit = "" },
  { id = "background", label = "Background", min = 0.0, max = 1.0, step = 0.01, default = 0.10, unit = "" },
}

local ML_TOGGLE_SPECS = {
  { id = "useSigmoid", label = "Sigmoid", onLabel = "Sigmoid On", offLabel = "Sigmoid Off", default = true },
  { id = "invert", label = "Invert", onLabel = "Invert On", offLabel = "Invert Off", default = false },
}

local STACK_CONFIG = {
  a = { suffix = "", label = "A", viewportId = "viewport", tapPrefix = "tapA" },
  b = { suffix = "B", label = "B", viewportId = "viewportB", tapPrefix = "tapB" },
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

local function tapWidget(ctx, stackKey, layerIndex)
  local cfg = STACK_CONFIG[stackKey]
  if not cfg then return nil end
  return ctx.widgets[cfg.tapPrefix .. tostring(layerIndex)]
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

local function defaultCompositeState()
  return {
    bottomTarget = "a_stack",
    topTarget = "b_stack",
    blendOpId = "normal",
    opacity = 1.0,
    blendParams = {},
    activeParamSpecs = {},
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
    segmentation = {
      enabled = false,
      modelPath = nil,
      params = {
        gain = 1.0,
        threshold = 0.5,
        feather = 0.15,
        background = 0.10,
        useSigmoid = true,
        invert = false,
      },
    },
  }
  for i = 1, NUM_LAYERS do
    stack.layers[i] = defaultLayer(i)
  end
  return stack
end

local function defaultPersistedStack()
  local layers = {}
  for i = 1, NUM_LAYERS do
    layers[i] = { enabled = nil, effectId = nil, params = {} }
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
    segEnabled = nil,
    segParams = {},
  }
end

local function loadPersistedState(ctx)
  ctx._persisted = {
    stacks = {
      a = defaultPersistedStack(),
      b = defaultPersistedStack(),
    },
    composite = {
      bottomTarget = "a_stack",
      topTarget = "b_stack",
      blendOpId = "normal",
      opacity = 1.0,
      blendParams = {},
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
      local stackKey, rest = key:match("^([ab])%.(.+)$")
      if stackKey and rest then
        local target = ctx._persisted.stacks[stackKey]
        if rest == "sourceKind" then target.sourceKind = value
        elseif rest == "sourceId" then target.sourceId = value
        elseif rest == "devicePath" then target.devicePath = value
        elseif rest == "width" then target.width = tonumber(value)
        elseif rest == "height" then target.height = tonumber(value)
        elseif rest == "fps" then target.fps = tonumber(value)
        elseif rest == "pixelFormat" then target.pixelFormat = value
        elseif rest == "activeLayer" then target.activeLayer = tonumber(value)
        elseif rest == "editorMode" then target.editorMode = value
        elseif rest == "segEnabled" then target.segEnabled = (value == "true")
        else
          local sourceParamId = rest:match("^source%.param%.(.+)$")
          if sourceParamId then
            target.sourceParams[sourceParamId] = tonumber(value)
          else
            local segParamId = rest:match("^seg%.param%.(.+)$")
            if segParamId then
              target.segParams[segParamId] = tonumber(value)
            else
              local li, field = rest:match("^layer%.(%d+)%.([%w_]+)$")
              if li and field then
                local L = target.layers[tonumber(li)]
                if L then
                  if field == "enabled" then L.enabled = (value == "true")
                  elseif field == "effectId" then L.effectId = value end
                end
              else
                local lidx, effectId, paramId = rest:match("^layer%.(%d+)%.param%.([^%.]+)%.(.+)$")
                if lidx and effectId and paramId then
                  local L = target.layers[tonumber(lidx)]
                  if L then
                    L.params[effectId] = L.params[effectId] or {}
                    L.params[effectId][paramId] = tonumber(value)
                  end
                end
              end
            end
          end
        end
      elseif key:match("^composite%.") then
        local rest = key:sub(#("composite.") + 1)
        if rest == "bottomTarget" then ctx._persisted.composite.bottomTarget = value
        elseif rest == "topTarget" then ctx._persisted.composite.topTarget = value
        elseif rest == "blendOpId" then ctx._persisted.composite.blendOpId = value
        elseif rest == "opacity" then ctx._persisted.composite.opacity = tonumber(value)
        else
          local paramId = rest:match("^param%.(.+)$")
          if paramId then
            ctx._persisted.composite.blendParams[paramId] = tonumber(value)
          end
        end
      end
    end
  end
end

local function savePersistedState(ctx)
  local lines = {}
  for _, stackKey in ipairs(STACK_ORDER) do
    local stack = stackState(ctx, stackKey)
    local prefix = stackKey .. "."
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
          for paramId, value in pairs(paramMap) do
            lines[#lines + 1] = string.format("%slayer.%d.param.%s.%s=%s", prefix, i, tostring(effectId), tostring(paramId), tostring(value))
          end
        end
      end
    end
    lines[#lines + 1] = prefix .. "segEnabled=" .. tostring(stack.segmentation and stack.segmentation.enabled and true or false)
    for paramId, value in pairs((stack.segmentation and stack.segmentation.params) or {}) do
      lines[#lines + 1] = string.format("%sseg.param.%s=%s", prefix, tostring(paramId), tostring(value))
    end
  end

  lines[#lines + 1] = "composite.bottomTarget=" .. tostring(ctx._composite.bottomTarget or "a_stack")
  lines[#lines + 1] = "composite.topTarget=" .. tostring(ctx._composite.topTarget or "b_stack")
  lines[#lines + 1] = "composite.blendOpId=" .. tostring(ctx._composite.blendOpId or "normal")
  lines[#lines + 1] = "composite.opacity=" .. tostring(ctx._composite.opacity or 1.0)
  for paramId, value in pairs(ctx._composite.blendParams or {}) do
    lines[#lines + 1] = string.format("composite.param.%s=%s", tostring(paramId), tostring(value))
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

local function findBlendOp(ctx, blendOpId)
  for i = 1, #(ctx._blendOps or {}) do
    if tostring(ctx._blendOps[i].id or "") == tostring(blendOpId) then
      return ctx._blendOps[i], i
    end
  end
  return nil, nil
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

local function sanitizeParamMap(specList, params)
  local out = {}
  for i = 1, #(specList or {}) do
    local spec = specList[i]
    local value = params[spec.id]
    if value == nil then value = tonumber(spec.default) or 0 end
    out[spec.id] = clamp(value, tonumber(spec.min) or value, tonumber(spec.max) or value)
  end
  return out
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
    if persisted.editorMode == "fx" then stack.editorMode = "fx"
    elseif persisted.editorMode == "ml" then stack.editorMode = "ml"
    else stack.editorMode = "source" end
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
    if stack.activeLayer < 1 or stack.activeLayer > NUM_LAYERS then stack.activeLayer = 1 end
    if persisted.segEnabled ~= nil then stack.segmentation.enabled = persisted.segEnabled end
    for paramId, value in pairs(persisted.segParams or {}) do
      stack.segmentation.params[paramId] = value
    end
  end

  ctx._composite.bottomTarget = tostring(ctx._persisted.composite.bottomTarget or "a_stack")
  ctx._composite.topTarget = tostring(ctx._persisted.composite.topTarget or "b_stack")
  ctx._composite.blendOpId = tostring(ctx._persisted.composite.blendOpId or "normal")
  ctx._composite.opacity = clamp(ctx._persisted.composite.opacity or 1.0, 0.0, 1.0)
  ctx._composite.blendParams = {}
  for paramId, value in pairs(ctx._persisted.composite.blendParams or {}) do
    ctx._composite.blendParams[paramId] = value
  end
end

local function compositeTargets(ctx)
  return {
    { id = "a_stack", name = "A Stack", nodeId = "viewport" },
    { id = "a_l1", name = "A L1", nodeId = "tapA1" },
    { id = "a_l2", name = "A L2", nodeId = "tapA2" },
    { id = "a_l3", name = "A L3", nodeId = "tapA3" },
    { id = "a_l4", name = "A L4", nodeId = "tapA4" },
    { id = "b_stack", name = "B Stack", nodeId = "viewportB" },
    { id = "b_l1", name = "B L1", nodeId = "tapB1" },
    { id = "b_l2", name = "B L2", nodeId = "tapB2" },
    { id = "b_l3", name = "B L3", nodeId = "tapB3" },
    { id = "b_l4", name = "B L4", nodeId = "tapB4" },
  }
end

local function resolveCompositeTargetNodeId(ctx, targetId)
  for _, target in ipairs(ctx._compositeTargets or {}) do
    if target.id == targetId then
      return target.nodeId
    end
  end
  return ""
end

local function buildSourceDescriptor(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return { type = "webcam" } end
  if stack.source.kind == "generator" then
    local choice = findSourceChoice(ctx, stack.source.kind, stack.source.id)
    local params = sanitizeParamMap(choice.params or {}, ensureSourceParams(ctx, stackKey))
    return {
      type = "generator",
      sourceId = stack.source.id,
      params = params,
    }
  end
  return { type = "webcam" }
end

local function buildLayerPayloadList(ctx, stackKey, maxLayer)
  local stack = stackState(ctx, stackKey)
  local list = {}
  if not stack then return list end
  local lastLayer = maxLayer or NUM_LAYERS
  for i = 1, lastLayer do
    local L = stack.layers[i]
    if L and L.enabled then
      local effect = findEffect(ctx, L.effectId)
      if type(effect) == "table" then
        local paramStore = ensureLayerEffectParams(ctx, stackKey, L)
        list[#list + 1] = {
          enabled = true,
          effectId = effect.id,
          params = sanitizeParamMap(effect.params or {}, paramStore),
        }
      end
    end
  end
  return list
end

local function setNodeSurfaceWithPipeline(ctx, widget, stackKey, maxLayer)
  if not widget or not widget.node then return end
  local stack = stackState(ctx, stackKey)
  if maxLayer == NUM_LAYERS and stack and stack.segmentation and stack.segmentation.enabled and stack.source.kind == "webcam" then
    local seg = stack.segmentation
    local payload = {
      version = 1,
      fitMode = "contain",
      modelPath = seg.modelPath,
      gain = seg.params.gain,
      useSigmoid = seg.params.useSigmoid,
      threshold = seg.params.threshold,
      feather = seg.params.feather,
      invert = seg.params.invert,
      background = seg.params.background,
    }
    widget.node:setCustomSurface("ml_composite", payload)
    return
  end
  if shaders and shaders.buildPipeline then
    local layers = buildLayerPayloadList(ctx, stackKey, maxLayer)
    local source = buildSourceDescriptor(ctx, stackKey)
    local ok, payload = pcall(shaders.buildPipeline, layers, "contain", source)
    if ok and payload ~= nil then
      widget.node:setCustomSurface("gpu_shader", payload)
      return
    end
  end
  widget.node:setCustomSurface("video_input", { version = 1, fitMode = "contain" })
end

local function syncCompositeControls(ctx)
  local bottomLabels = {}
  local topLabels = {}
  local bottomSelected = 1
  local topSelected = 1
  for i, target in ipairs(ctx._compositeTargets or {}) do
    bottomLabels[i] = target.name
    topLabels[i] = target.name
    if target.id == ctx._composite.bottomTarget then bottomSelected = i end
    if target.id == ctx._composite.topTarget then topSelected = i end
  end
  setOptions(ctx.widgets.compositeBottomSelect, bottomLabels)
  setSelected(ctx.widgets.compositeBottomSelect, bottomSelected)
  setOptions(ctx.widgets.compositeTopSelect, topLabels)
  setSelected(ctx.widgets.compositeTopSelect, topSelected)

  local blendLabels = {}
  local blendSelected = 1
  local blendOp = nil
  for i, op in ipairs(ctx._blendOps or {}) do
    blendLabels[i] = describeEffect(op)
    if tostring(op.id or "") == tostring(ctx._composite.blendOpId) then
      blendSelected = i
      blendOp = op
    end
  end
  if not blendOp and #((ctx._blendOps) or {}) > 0 then
    blendOp = ctx._blendOps[1]
    ctx._composite.blendOpId = blendOp.id
  end
  setOptions(ctx.widgets.compositeBlendSelect, blendLabels)
  setSelected(ctx.widgets.compositeBlendSelect, blendSelected)
  setText(ctx.widgets.compositeBlendDescription, blendOp and tostring(blendOp.description or "") or "")

  if ctx.widgets.compositeOpacity and ctx.widgets.compositeOpacity.setValue then
    ctx.widgets.compositeOpacity:setValue(ctx._composite.opacity or 1.0)
  end

  local paramSpecs = {}
  for _, spec in ipairs((blendOp and blendOp.params) or {}) do
    if tostring(spec.id or "") ~= "opacity" then
      paramSpecs[#paramSpecs + 1] = spec
    end
  end
  ctx._composite.activeParamSpecs = paramSpecs
  local sanitized = sanitizeParamMap(paramSpecs, ctx._composite.blendParams or {})
  ctx._composite.blendParams = sanitized

  for i = 1, NUM_BLEND_PARAM_SLIDERS do
    local slider = ctx.widgets["compositeParam" .. tostring(i)]
    local spec = paramSpecs[i]
    if type(spec) == "table" then
      slider._min = tonumber(spec.min) or 0
      slider._max = tonumber(spec.max) or 1
      slider._step = tonumber(spec.step) or 0.01
      slider._defaultValue = tonumber(spec.default) or slider._min
      if slider.setLabel then slider:setLabel(spec.name or spec.id or ("Blend Param " .. tostring(i))) end
      if slider.setValueFormatter then
        slider:setValueFormatter(function(value)
          local unit = tostring(spec.unit or "")
          local num = tonumber(value) or 0
          return string.format("%.3f%s", num, unit)
        end)
      end
      setVisible(slider, true)
      if slider.setValue then slider:setValue(sanitized[spec.id] or slider._defaultValue) end
    else
      setVisible(slider, false)
    end
  end
end

local function setCompositeSurface(ctx)
  local viewport = ctx.widgets.compositeViewport
  if not viewport or not viewport.node then return end
  local payload = {
    version = 1,
    kind = "compositeQuad",
    fitMode = "contain",
    bottomNodeId = resolveCompositeTargetNodeId(ctx, ctx._composite.bottomTarget),
    topNodeId = resolveCompositeTargetNodeId(ctx, ctx._composite.topTarget),
    blendOpId = ctx._composite.blendOpId or "normal",
    opacity = ctx._composite.opacity or 1.0,
    blendParams = ctx._composite.blendParams or {},
  }
  viewport.node:setCustomSurface("gpu_composite", payload)
end

local function updateStackSurfaces(ctx, stackKey)
  setNodeSurfaceWithPipeline(ctx, stackWidget(ctx, stackKey, "viewport"), stackKey, NUM_LAYERS)
  for i = 1, NUM_LAYERS do
    setNodeSurfaceWithPipeline(ctx, tapWidget(ctx, stackKey, i), stackKey, i)
  end
  setCompositeSurface(ctx)
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

local function syncEditorMode(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end
  local sourceVisible = stack.editorMode == "source"
  local fxVisible = stack.editorMode == "fx"
  local mlVisible = stack.editorMode == "ml"
  local selectedSource = findSourceChoice(ctx, stack.source.kind, stack.source.id)
  local isWebcam = stack.source.kind == "webcam"

  local tabs = stackWidget(ctx, stackKey, "editorModeTabs")
  if tabs then
    if sourceVisible then setSelected(tabs, 1)
    elseif fxVisible then setSelected(tabs, 2)
    else setSelected(tabs, 3) end
  end

  setVisible(stackWidget(ctx, stackKey, "sourceTitle"), sourceVisible)
  setVisible(stackWidget(ctx, stackKey, "sourceSelect"), sourceVisible)
  setVisible(stackWidget(ctx, stackKey, "sourceDescription"), sourceVisible)
  setVisible(stackWidget(ctx, stackKey, "deviceSelect"), sourceVisible and isWebcam)
  setVisible(stackWidget(ctx, stackKey, "modeSelect"), sourceVisible and isWebcam)
  setVisible(stackWidget(ctx, stackKey, "refreshBtn"), sourceVisible and isWebcam)
  setVisible(stackWidget(ctx, stackKey, "openBtn"), sourceVisible and isWebcam)
  setVisible(stackWidget(ctx, stackKey, "closeBtn"), sourceVisible and isWebcam)
  setVisible(stackWidget(ctx, stackKey, "frameInfo"), sourceVisible)
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

  setVisible(stackWidget(ctx, stackKey, "mlTitle"), mlVisible)
  setVisible(stackWidget(ctx, stackKey, "mlEnabledToggle"), mlVisible)
  for i = 1, 4 do
    setVisible(stackWidget(ctx, stackKey, "mlParam" .. tostring(i)), mlVisible)
  end
  for i = 1, 2 do
    setVisible(stackWidget(ctx, stackKey, "mlToggle" .. tostring(i)), mlVisible)
  end
  setVisible(stackWidget(ctx, stackKey, "mlStatus"), mlVisible)
end

local function syncSourceControls(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end
  local labels = {}
  local selectedIndex = 1
  local selectedSource = nil
  for i, choice in ipairs(ctx._sourceChoices or {}) do
    labels[i] = tostring(choice.name or choice.id or "Source")
    if tostring(choice.kind) == tostring(stack.source.kind) and tostring(choice.id) == tostring(stack.source.id) then
      selectedIndex = i
      selectedSource = choice
    end
  end
  if not selectedSource then selectedSource = (ctx._sourceChoices and ctx._sourceChoices[1]) or WEBCAM_SOURCE end

  setOptions(stackWidget(ctx, stackKey, "sourceSelect"), labels)
  setSelected(stackWidget(ctx, stackKey, "sourceSelect"), selectedIndex)
  setText(stackWidget(ctx, stackKey, "sourceDescription"), tostring(selectedSource.description or ""))
  setText(stackWidget(ctx, stackKey, "viewportTitle"), string.format("%s Preview", tostring(selectedSource.name or "Source")))

  local sourceParams = ensureSourceParams(ctx, stackKey)
  for i = 1, NUM_SOURCE_PARAM_SLIDERS do
    local slider = stackWidget(ctx, stackKey, "sourceParam" .. tostring(i))
    local spec = selectedSource.params and selectedSource.params[i] or nil
    if type(spec) == "table" then
      slider._min = tonumber(spec.min) or 0
      slider._max = tonumber(spec.max) or 1
      slider._step = tonumber(spec.step) or 0.01
      slider._defaultValue = tonumber(spec.default) or slider._min
      if slider.setLabel then slider:setLabel(spec.name or spec.id or ("Source Param " .. tostring(i))) end
      if slider.setValueFormatter then
        slider:setValueFormatter(function(value)
          local unit = tostring(spec.unit or "")
          local num = tonumber(value) or 0
          return string.format("%.3f%s", num, unit)
        end)
      end
      if slider.setValue then slider:setValue(sourceParams[spec.id] or slider._defaultValue) end
    end
  end

  syncEditorMode(ctx, stackKey)
end

local function syncLayerControls(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end
  local layer = stack.layers[stack.activeLayer] or stack.layers[1]

  local labels = {}
  local effectIndex = 1
  for i, effect in ipairs(ctx._effects or {}) do
    labels[i] = describeEffect(effect)
    if tostring(effect.id or "") == tostring(layer.effectId) then effectIndex = i end
  end
  if #labels == 0 then labels[1] = "Passthrough" end
  setOptions(stackWidget(ctx, stackKey, "effectSelect"), labels)
  setSelected(stackWidget(ctx, stackKey, "effectSelect"), effectIndex)

  local enabledBtn = stackWidget(ctx, stackKey, "layerEnabledBtn")
  if enabledBtn then
    if enabledBtn.setLabel then enabledBtn:setLabel(layer.enabled and "On" or "Off")
    elseif enabledBtn.setText then enabledBtn:setText(layer.enabled and "On" or "Off") end
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
    if type(spec) == "table" then
      slider._min = tonumber(spec.min) or 0
      slider._max = tonumber(spec.max) or 1
      slider._step = tonumber(spec.step) or 0.01
      slider._defaultValue = tonumber(spec.default) or slider._min
      if slider.setLabel then slider:setLabel(spec.name or spec.id or ("Param " .. tostring(i))) end
      if slider.setValueFormatter then
        slider:setValueFormatter(function(value)
          local unit = tostring(spec.unit or "")
          local num = tonumber(value) or 0
          return string.format("%.3f%s", num, unit)
        end)
      end
      if slider.setValue then slider:setValue(paramStore[spec.id] or slider._defaultValue) end
    end
  end

  syncLayerTabLabels(ctx, stackKey)
  syncEditorMode(ctx, stackKey)
end

local function syncMlControls(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end
  local seg = stack.segmentation
  local toggle = stackWidget(ctx, stackKey, "mlEnabledToggle")
  if toggle and toggle.setValue then toggle:setValue(seg.enabled) end
  for i, spec in ipairs(ML_PARAM_SPECS) do
    local slider = stackWidget(ctx, stackKey, "mlParam" .. tostring(i))
    if slider then
      slider._min = spec.min
      slider._max = spec.max
      slider._step = spec.step
      slider._defaultValue = spec.default
      if slider.setLabel then slider:setLabel(spec.label) end
      if slider.setValueFormatter then
        slider:setValueFormatter(function(value)
          local num = tonumber(value) or 0
          if spec.id == "gain" then return string.format("%.2fx", num) end
          return string.format("%.2f%s", num, spec.unit or "")
        end)
      end
      if slider.setValue then slider:setValue(seg.params[spec.id]) end
    end
  end
  for i, spec in ipairs(ML_TOGGLE_SPECS) do
    local t = stackWidget(ctx, stackKey, "mlToggle" .. tostring(i))
    if t and t.setValue then
      if t.setOnLabel then t:setOnLabel(spec.onLabel) end
      if t.setOffLabel then t:setOffLabel(spec.offLabel) end
      t:setValue(seg.params[spec.id])
    end
  end
  local status = stackWidget(ctx, stackKey, "mlStatus")
  if status then
    local text
    if seg.enabled then
      text = string.format("ML: enabled — gain %.2fx  threshold %.2f  feather %.2f  bg %.2f  sigmoid %s  invert %s",
        seg.params.gain, seg.params.threshold, seg.params.feather, seg.params.background,
        tostring(seg.params.useSigmoid), tostring(seg.params.invert))
    else
      text = "ML: disabled"
    end
    setText(status, text)
  end
end

local function bindMlCallbacks(ctx)
  for _, stackKey in ipairs(STACK_ORDER) do
    local stack = stackState(ctx, stackKey)
    local toggle = stackWidget(ctx, stackKey, "mlEnabledToggle")
    if toggle then
      toggle._onChange = function(value)
        stack.segmentation.enabled = (value == true)
        updateStackSurfaces(ctx, stackKey)
        syncMlControls(ctx, stackKey)
        savePersistedState(ctx)
        syncGlobalStatus(ctx)
      end
    end
    for i, spec in ipairs(ML_PARAM_SPECS) do
      local slider = stackWidget(ctx, stackKey, "mlParam" .. tostring(i))
      if slider then
        slider._onChange = function(value)
          stack.segmentation.params[spec.id] = clamp(value, spec.min, spec.max)
          updateStackSurfaces(ctx, stackKey)
          syncMlControls(ctx, stackKey)
          savePersistedState(ctx)
        end
      end
    end
    for i, spec in ipairs(ML_TOGGLE_SPECS) do
      local t = stackWidget(ctx, stackKey, "mlToggle" .. tostring(i))
      if t then
        t._onChange = function(value)
          stack.segmentation.params[spec.id] = (value == true)
          updateStackSurfaces(ctx, stackKey)
          syncMlControls(ctx, stackKey)
          savePersistedState(ctx)
        end
      end
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
    if not choice then stack.source = defaultSourceState() end
    ensureSourceParams(ctx, stackKey)
    syncSourceControls(ctx, stackKey)
  end
end

local function refreshEffects(ctx)
  ctx._effects = (shaders and shaders.listEffects and shaders.listEffects()) or {}
  if #ctx._effects == 0 then
    ctx._effects = { { id = "none", name = "Passthrough", category = "utility", description = "Dry source feed", params = {} } }
  end
  for _, stackKey in ipairs(STACK_ORDER) do
    local stack = stackState(ctx, stackKey)
    for i = 1, NUM_LAYERS do
      local L = stack.layers[i]
      local effect = findEffect(ctx, L.effectId)
      if type(effect) ~= "table" then L.effectId = "none" end
      ensureLayerEffectParams(ctx, stackKey, L)
    end
    syncLayerControls(ctx, stackKey)
    updateStackSurfaces(ctx, stackKey)
  end
end

local function refreshBlendOps(ctx)
  ctx._blendOps = (shaders and shaders.listBlendOps and shaders.listBlendOps()) or {}
  if #ctx._blendOps == 0 then
    ctx._blendOps = { { id = "normal", name = "Normal", category = "blend", description = "Standard blend", params = {} } }
  end
  local found = findBlendOp(ctx, ctx._composite.blendOpId)
  if not found then
    ctx._composite.blendOpId = ctx._blendOps[1].id
  end
  syncCompositeControls(ctx)
  setCompositeSurface(ctx)
end

local function syncModeOptions(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end
  local labels = {}
  for i = 1, #(stack.modes or {}) do labels[i] = describeMode(stack.modes[i]) end
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

local function refreshDevices(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return end
  local devices = {}
  if stack.source.kind == "webcam" and capture and capture.listDevices then
    devices = capture.listDevices() or {}
  end
  stack.devices = devices
  local labels = {}
  for i = 1, #devices do labels[i] = describeDevice(devices[i]) end
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
    return
  end
  refreshModes(ctx, stackKey, selectedIndex or 1)
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
    setText(widget, string.format("Frame: %dx%d  seq=%d  device=%d", tonumber(info.width) or 0, tonumber(info.height) or 0, tonumber(info.sequence) or 0, tonumber(info.activeDeviceIndex) or -1))
  else
    setText(widget, "Frame: --")
  end
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
  local segMarker = (stack.segmentation and stack.segmentation.enabled) and " [SEG]" or ""
  if stack.source.kind == "generator" then
    local choice = findSourceChoice(ctx, stack.source.kind, stack.source.id)
    return string.format("%s:%s%s • FX:%s", cfg.label, tostring(choice.name or stack.source.id), segMarker, layerSummary(ctx, stackKey))
  end
  local device = stack.devices[stack.selectedDevice]
  local mode = stack.modes[stack.selectedMode]
  if capture and capture.isOpen and capture.isOpen() then
    if type(device) == "table" and type(mode) == "table" then
      return string.format("%s:%s / %s%s • FX:%s", cfg.label, describeDevice(device), describeMode(mode), segMarker, layerSummary(ctx, stackKey))
    end
    return string.format("%s:webcam active%s • FX:%s", cfg.label, segMarker, layerSummary(ctx, stackKey))
  end
  return string.format("%s:webcam idle%s • FX:%s", cfg.label, segMarker, layerSummary(ctx, stackKey))
end

local function syncGlobalStatus(ctx)
  setText(ctx.widgets.status, stackSummary(ctx, "a") .. "   |   " .. stackSummary(ctx, "b"))
  local blendOp = findBlendOp(ctx, ctx._composite.blendOpId)
  setText(ctx.widgets.compositeStatus, string.format("Main Out: %s over %s via %s", tostring(ctx._composite.topTarget or "top"), tostring(ctx._composite.bottomTarget or "bottom"), tostring((blendOp and blendOp.name) or ctx._composite.blendOpId or "normal")))
end

local function openCurrentSelection(ctx, stackKey)
  local stack = stackState(ctx, stackKey)
  if not stack then return false end
  if stack.source.kind ~= "webcam" then
    updateStackSurfaces(ctx, stackKey)
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
    updateStackSurfaces(ctx, "a")
    updateStackSurfaces(ctx, "b")
    savePersistedState(ctx)
    syncGlobalStatus(ctx)
    return true
  end
  syncGlobalStatus(ctx)
  return false
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
  local idx = tonumber(editorIndex) or 1
  if idx == 2 then stack.editorMode = "fx"
  elseif idx == 3 then stack.editorMode = "ml"
  else stack.editorMode = "source" end
  syncSourceControls(ctx, stackKey)
  syncLayerControls(ctx, stackKey)
  syncMlControls(ctx, stackKey)
  savePersistedState(ctx)
end

local function setActiveLayer(ctx, stackKey, index)
  local stack = stackState(ctx, stackKey)
  if not stack then return end
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
  updateStackSurfaces(ctx, stackKey)
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
  updateStackSurfaces(ctx, stackKey)
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
  updateStackSurfaces(ctx, stackKey)
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
          updateStackSurfaces(ctx, stackKey)
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
          updateStackSurfaces(ctx, stackKey)
          savePersistedState(ctx)
          syncGlobalStatus(ctx)
        end
      end
    end
  end

  if ctx.widgets.compositeOpacity then
    ctx.widgets.compositeOpacity._onChange = function(value)
      ctx._composite.opacity = clamp(value, 0.0, 1.0)
      setCompositeSurface(ctx)
      savePersistedState(ctx)
      syncGlobalStatus(ctx)
    end
  end

  for i = 1, NUM_BLEND_PARAM_SLIDERS do
    local slider = ctx.widgets["compositeParam" .. tostring(i)]
    if slider then
      slider._onChange = function(value)
        local spec = ctx._composite.activeParamSpecs and ctx._composite.activeParamSpecs[i] or nil
        if type(spec) ~= "table" then return end
        ctx._composite.blendParams[spec.id] = value
        setCompositeSurface(ctx)
        savePersistedState(ctx)
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

  local mlY = sectionY + 26
  setBounds(stackWidget(ctx, stackKey, "mlTitle"), x, mlY, w, 18)
  setBounds(stackWidget(ctx, stackKey, "mlEnabledToggle"), x + w - 170, mlY, 160, 24)
  mlY = mlY + 30
  local mlSliderW = math.floor((w - colGap * 2) / 3)
  local mlSliderH = 26
  for i = 1, 4 do
    local slider = stackWidget(ctx, stackKey, "mlParam" .. tostring(i))
    local col = (i - 1) % 3
    local row = math.floor((i - 1) / 3)
    local sx = x + col * (mlSliderW + colGap)
    local sy = mlY + row * (mlSliderH + rowGap)
    setBounds(slider, sx, sy, mlSliderW, mlSliderH)
  end
  mlY = mlY + 2 * (mlSliderH + rowGap) + 4
  setBounds(stackWidget(ctx, stackKey, "mlToggle1"), x, mlY, 148, 28)
  setBounds(stackWidget(ctx, stackKey, "mlToggle2"), x + 160, mlY, 148, 28)
  mlY = mlY + 34
  setBounds(stackWidget(ctx, stackKey, "mlStatus"), x, mlY, w, 16)
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

  local fullW = width - pad * 2
  local gap = 16
  local editorW = clamp(math.floor(fullW * 0.42), 500, 560)
  local previewPanelW = math.max(280, fullW - editorW - gap)
  local previewX = pad + 12
  local previewW = previewPanelW - 24
  local controlsX = pad + previewPanelW + gap + 16
  local controlsW = editorW - 32

  setBounds(ctx.widgets.compositeViewport, previewX, compositeY + 78, previewW, math.max(80, compositeH - 90))

  local cy = compositeY + 82
  setBounds(ctx.widgets.compositeBottomLabel, controlsX, cy, controlsW, 14)
  cy = cy + 16
  setBounds(ctx.widgets.compositeBottomSelect, controlsX, cy, controlsW, 24)
  cy = cy + 30
  setBounds(ctx.widgets.compositeTopLabel, controlsX, cy, controlsW, 14)
  cy = cy + 16
  setBounds(ctx.widgets.compositeTopSelect, controlsX, cy, controlsW, 24)
  cy = cy + 30
  setBounds(ctx.widgets.compositeBlendLabel, controlsX, cy, controlsW, 14)
  cy = cy + 16
  setBounds(ctx.widgets.compositeBlendSelect, controlsX, cy, controlsW, 24)
  cy = cy + 30
  setBounds(ctx.widgets.compositeOpacity, controlsX, cy, controlsW, 26)
  cy = cy + 32
  local halfW = math.floor((controlsW - 12) / 2)
  setBounds(ctx.widgets.compositeParam1, controlsX, cy, halfW, 26)
  setBounds(ctx.widgets.compositeParam2, controlsX + halfW + 12, cy, halfW, 26)
  cy = cy + 32
  setBounds(ctx.widgets.compositeParam3, controlsX, cy, halfW, 26)
  setBounds(ctx.widgets.compositeParam4, controlsX + halfW + 12, cy, halfW, 26)
  cy = cy + 30
  setBounds(ctx.widgets.compositeBlendDescription, controlsX, cy, controlsW, 18)

  layoutStack(ctx, "a", stackAY, stackAH, width)
  layoutStack(ctx, "b", stackBY, stackBH, width)
end

function M.init(ctx)
  ctx._stacks = { a = createStackState(), b = createStackState() }
  ctx._composite = defaultCompositeState()
  ctx._sourceChoices = { WEBCAM_SOURCE }
  ctx._effects = {}
  ctx._blendOps = {}
  ctx._compositeTargets = compositeTargets(ctx)

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
  refreshBlendOps(ctx)
  installParamCallbacks(ctx)
  bindMlCallbacks(ctx)

  local fp = (type(getCurrentScriptPath) == "function") and getCurrentScriptPath() or ""
  local dir = fp:match("^(.*)/[^/]+$")
  local modelPath = dir and (dir .. "/selfie_segmentation.onnx") or ""
  for _, stackKey in ipairs(STACK_ORDER) do
    stackState(ctx, stackKey).segmentation.modelPath = modelPath
    syncMlControls(ctx, stackKey)
  end
  if type(ml) == "table" and type(ml.load) == "function" then
    pcall(ml.load, modelPath)
  end

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
    if refreshBtn then refreshBtn._onClick = function() refreshDevices(ctx, stackKey) end end
    local openBtn = stackWidget(ctx, stackKey, "openBtn")
    if openBtn then openBtn._onClick = function() openCurrentSelection(ctx, stackKey) end end
    local closeBtn = stackWidget(ctx, stackKey, "closeBtn")
    if closeBtn then closeBtn._onClick = function()
      if capture and capture.close then capture.close() end
      updateFrameInfo(ctx, "a")
      updateFrameInfo(ctx, "b")
      syncGlobalStatus(ctx)
    end end
    local editorTabs = stackWidget(ctx, stackKey, "editorModeTabs")
    if editorTabs then editorTabs._onSelect = function(selectedIndex) setEditorMode(ctx, stackKey, selectedIndex) end end
    local layerTabs = stackWidget(ctx, stackKey, "layerTabs")
    if layerTabs then layerTabs._onSelect = function(selectedIndex) setActiveLayer(ctx, stackKey, selectedIndex) end end
    local enabledBtn = stackWidget(ctx, stackKey, "layerEnabledBtn")
    if enabledBtn then enabledBtn._onClick = function() toggleActiveLayerEnabled(ctx, stackKey) end end
    local clearBtn = stackWidget(ctx, stackKey, "clearLayerBtn")
    if clearBtn then clearBtn._onClick = function() clearActiveLayer(ctx, stackKey) end end
    local effectSelect = stackWidget(ctx, stackKey, "effectSelect")
    if effectSelect then effectSelect._onSelect = function(selectedIndex) setActiveLayerEffect(ctx, stackKey, selectedIndex) end end
  end

  if ctx.widgets.compositeBottomSelect then
    ctx.widgets.compositeBottomSelect._onSelect = function(selectedIndex)
      local target = ctx._compositeTargets[selectedIndex]
      if target then
        ctx._composite.bottomTarget = target.id
        setCompositeSurface(ctx)
        savePersistedState(ctx)
        syncGlobalStatus(ctx)
      end
    end
  end
  if ctx.widgets.compositeTopSelect then
    ctx.widgets.compositeTopSelect._onSelect = function(selectedIndex)
      local target = ctx._compositeTargets[selectedIndex]
      if target then
        ctx._composite.topTarget = target.id
        setCompositeSurface(ctx)
        savePersistedState(ctx)
        syncGlobalStatus(ctx)
      end
    end
  end
  if ctx.widgets.compositeBlendSelect then
    ctx.widgets.compositeBlendSelect._onSelect = function(selectedIndex)
      local op = ctx._blendOps[selectedIndex]
      if op then
        ctx._composite.blendOpId = op.id
        syncCompositeControls(ctx)
        setCompositeSurface(ctx)
        savePersistedState(ctx)
        syncGlobalStatus(ctx)
      end
    end
  end

  for _, stackKey in ipairs(STACK_ORDER) do
    syncSourceControls(ctx, stackKey)
    syncLayerControls(ctx, stackKey)
    updateFrameInfo(ctx, stackKey)
  end
  syncCompositeControls(ctx)
  setCompositeSurface(ctx)
  syncGlobalStatus(ctx)
end

function M.resized(ctx, w, h)
  layoutUi(ctx, w, h)
  syncRendererMode(ctx)
  for _, stackKey in ipairs(STACK_ORDER) do
    syncSourceControls(ctx, stackKey)
    syncLayerControls(ctx, stackKey)
    syncMlControls(ctx, stackKey)
    updateFrameInfo(ctx, stackKey)
  end
  syncCompositeControls(ctx)
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
