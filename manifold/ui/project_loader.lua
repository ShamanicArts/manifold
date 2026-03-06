local W = require("ui_widgets")

local M = {}

local SUPPORTED_WIDGETS = {
  Panel = W.Panel,
  Button = W.Button,
  Label = W.Label,
  Dropdown = W.Dropdown,
  Toggle = W.Toggle,
  NumberBox = W.NumberBox,
  Knob = W.Knob,
  WaveformView = W.WaveformView,
}

local FONT_STYLE_MAP = {
  plain = FontStyle.plain,
  bold = FontStyle.bold,
  italic = FontStyle.italic,
}

local function deepCopy(value)
  if type(value) ~= "table" then
    return value
  end
  local out = {}
  for k, v in pairs(value) do
    out[deepCopy(k)] = deepCopy(v)
  end
  return out
end

local function mergeInto(dst, src)
  if type(src) ~= "table" then
    return dst
  end
  for k, v in pairs(src) do
    dst[k] = v
  end
  return dst
end

local function normalizeFontStyle(config)
  if type(config.fontStyle) == "string" then
    config.fontStyle = FONT_STYLE_MAP[string.lower(config.fontStyle)] or FontStyle.plain
  end
end

local function flattenSpecConfig(spec, runtime, extraProps)
  local config = {}
  mergeInto(config, spec.style)
  mergeInto(config, spec.props)
  mergeInto(config, extraProps)
  normalizeFontStyle(config)

  if spec.type == "Dropdown" and config.rootNode == nil then
    config.rootNode = runtime.rootNode
  end

  return config
end

local function floorInt(v)
  return math.floor((tonumber(v) or 0) + 0.5)
end

local function getBounds(spec, fallback)
  return floorInt(spec.x or (fallback and fallback.x) or 0),
         floorInt(spec.y or (fallback and fallback.y) or 0),
         floorInt(spec.w or (fallback and fallback.w) or 0),
         floorInt(spec.h or (fallback and fallback.h) or 0)
end

local function validateValue(value, path, visited)
  local t = type(value)
  if t == "function" or t == "userdata" or t == "thread" then
    error("structured UI contains unsupported value at " .. path .. ": " .. t)
  end
  if t ~= "table" then
    return
  end

  if visited[value] then
    error("structured UI contains recursive table at " .. path)
  end
  visited[value] = true

  local mt = getmetatable(value)
  if mt ~= nil then
    error("structured UI table has metatable at " .. path)
  end

  for k, v in pairs(value) do
    if type(k) == "function" or type(k) == "userdata" or type(k) == "thread" then
      error("structured UI contains unsupported key type at " .. path)
    end
    validateValue(v, path .. "." .. tostring(k), visited)
  end
end

local function executeLuaFileReturningTable(absPath, label)
  local chunk, loadErr = loadfile(absPath)
  if not chunk then
    error((label or "lua table") .. " load failed: " .. tostring(loadErr))
  end

  local ok, result = pcall(chunk)
  if not ok then
    error((label or "lua table") .. " execution failed: " .. tostring(result))
  end
  if type(result) ~= "table" then
    error((label or "lua table") .. " must return a table")
  end

  return result
end

local function loadStructuredTable(absPath, label)
  local result = executeLuaFileReturningTable(absPath, label)
  validateValue(result, label or absPath, {})
  return result
end

local function loadBehaviorModule(absPath, label)
  return executeLuaFileReturningTable(absPath, label)
end

local function startsWith(text, prefix)
  return type(text) == "string" and text:sub(1, #prefix) == prefix
end

local function resolveAssetPath(runtime, ref)
  if type(ref) ~= "string" or ref == "" then
    error("missing asset ref")
  end

  if startsWith(ref, "/") then
    return ref
  end

  if startsWith(ref, "user:ui/") then
    return runtime.userScriptsRoot .. "/ui/" .. ref:sub(#"user:ui/" + 1)
  end
  if startsWith(ref, "user:dsp/") then
    return runtime.userScriptsRoot .. "/dsp/" .. ref:sub(#"user:dsp/" + 1)
  end
  if startsWith(ref, "system:ui/") then
    return runtime.systemUiRoot .. "/" .. ref:sub(#"system:ui/" + 1)
  end
  if startsWith(ref, "system:dsp/") then
    return runtime.systemDspRoot .. "/" .. ref:sub(#"system:dsp/" + 1)
  end

  return runtime.projectRoot .. "/" .. ref
end

local function buildBehaviorContext(runtime, opts)
  return {
    project = {
      root = runtime.projectRoot,
      manifest = runtime.manifestPath,
      uiRoot = runtime.uiRoot,
      userScriptsRoot = runtime.userScriptsRoot,
      systemUiRoot = runtime.systemUiRoot,
      systemDspRoot = runtime.systemDspRoot,
      displayName = runtime.displayName,
    },
    root = opts.rootWidget,
    widgets = opts.localWidgets,
    allWidgets = runtime.widgets,
    instanceId = opts.instanceId,
    instanceProps = opts.instanceProps or {},
    spec = opts.spec,
  }
end

local Runtime = {}
Runtime.__index = Runtime

function Runtime.new(opts)
  local self = setmetatable({}, Runtime)
  self.requestedPath = opts.requestedPath or ""
  self.projectRoot = opts.projectRoot or ""
  self.manifestPath = opts.manifestPath or ""
  self.uiRoot = opts.uiRoot or ""
  self.displayName = opts.displayName or "Project"
  self.userScriptsRoot = opts.userScriptsRoot or ""
  self.systemUiRoot = opts.systemUiRoot or ""
  self.systemDspRoot = opts.systemDspRoot or ""
  self.rootNode = nil
  self.rootWidget = nil
  self.sceneSpec = nil
  self.widgets = {}
  self.behaviors = {}
  return self
end

function Runtime:registerWidget(globalId, localWidgets, localId, widget)
  if type(globalId) == "string" and globalId ~= "" then
    self.widgets[globalId] = widget
  end
  if type(localWidgets) == "table" and type(localId) == "string" and localId ~= "" then
    localWidgets[localId] = widget
  end
end

function Runtime:instantiateSpec(parentNode, spec, opts)
  local widgetClass = SUPPORTED_WIDGETS[spec.type]
  if widgetClass == nil then
    error("unsupported structured widget type: " .. tostring(spec.type))
  end

  local localId = spec.id or opts.defaultName or spec.type
  local globalId = localId
  if type(opts.idPrefix) == "string" and opts.idPrefix ~= "" then
    globalId = opts.idPrefix .. "." .. localId
  end

  local config = flattenSpecConfig(spec, self, opts.extraProps)
  local widget = widgetClass.new(parentNode, localId, config)
  local x, y, w, h = getBounds(spec, opts.boundsOverride)
  if widget.setBounds then
    widget:setBounds(x, y, w, h)
  elseif widget.node and widget.node.setBounds then
    widget.node:setBounds(x, y, w, h)
  end

  self:registerWidget(globalId, opts.localWidgets, localId, widget)
  if opts.localWidgets and opts.localWidgets.root == nil and opts.isRoot then
    opts.localWidgets.root = widget
  end

  local childPrefix = globalId
  for _, child in ipairs(spec.children or {}) do
    self:instantiateSpec(widget.node, child, {
      idPrefix = childPrefix,
      localWidgets = opts.localWidgets,
      extraProps = nil,
      isRoot = false,
    })
  end

  for _, componentInstance in ipairs(spec.components or {}) do
    self:instantiateComponent(widget.node, componentInstance, childPrefix)
  end

  return widget, globalId
end

function Runtime:instantiateComponent(parentNode, instanceSpec, parentPrefix)
  local absRef = resolveAssetPath(self, instanceSpec.ref)
  local componentSpec = deepCopy(loadStructuredTable(absRef, "component:" .. absRef))

  componentSpec.id = instanceSpec.id or componentSpec.id or "component"
  componentSpec.props = mergeInto(componentSpec.props or {}, instanceSpec.props or {})
  componentSpec.x = instanceSpec.x or componentSpec.x or 0
  componentSpec.y = instanceSpec.y or componentSpec.y or 0
  componentSpec.w = instanceSpec.w or componentSpec.w or 0
  componentSpec.h = instanceSpec.h or componentSpec.h or 0

  local localWidgets = {}
  local rootWidget, componentGlobalId = self:instantiateSpec(parentNode, componentSpec, {
    idPrefix = parentPrefix,
    localWidgets = localWidgets,
    extraProps = nil,
    isRoot = true,
  })

  if type(instanceSpec.behavior) == "string" and instanceSpec.behavior ~= "" then
    local behaviorPath = resolveAssetPath(self, instanceSpec.behavior)
    local behaviorModule = loadBehaviorModule(behaviorPath, "behavior:" .. behaviorPath)
    local ctx = buildBehaviorContext(self, {
      rootWidget = rootWidget,
      localWidgets = localWidgets,
      instanceId = componentSpec.id,
      instanceProps = instanceSpec.props or {},
      spec = componentSpec,
    })
    self.behaviors[#self.behaviors + 1] = {
      module = behaviorModule,
      ctx = ctx,
      path = behaviorPath,
      id = componentGlobalId,
    }
  end

  return rootWidget, componentGlobalId
end

function Runtime:getLayoutInfo(fallbackW, fallbackH)
  local scene = self.sceneSpec or {}
  local shellLayout = scene.shellLayout or scene.viewport or {}
  local mode = shellLayout.mode or shellLayout.sizing or "fill"

  return {
    mode = mode,
    designW = shellLayout.designW or scene.w or fallbackW,
    designH = shellLayout.designH or scene.h or fallbackH,
    scaleMode = shellLayout.scaleMode or shellLayout.presentation,
    alignX = shellLayout.alignX,
    alignY = shellLayout.alignY,
  }
end

function Runtime:init(rootNode)
  self.rootNode = rootNode
  self.sceneSpec = deepCopy(loadStructuredTable(self.uiRoot, "scene:" .. self.uiRoot))
  self.widgets = {}
  self.behaviors = {}

  local localWidgets = {}
  self.rootWidget = self:instantiateSpec(rootNode, self.sceneSpec, {
    idPrefix = "",
    localWidgets = localWidgets,
    extraProps = nil,
    isRoot = true,
  })

  if type(self.sceneSpec.behavior) == "string" and self.sceneSpec.behavior ~= "" then
    local behaviorPath = resolveAssetPath(self, self.sceneSpec.behavior)
    local behaviorModule = loadBehaviorModule(behaviorPath, "behavior:" .. behaviorPath)
    table.insert(self.behaviors, 1, {
      module = behaviorModule,
      ctx = buildBehaviorContext(self, {
        rootWidget = self.rootWidget,
        localWidgets = localWidgets,
        instanceId = self.sceneSpec.id or "root",
        instanceProps = self.sceneSpec.props or {},
        spec = self.sceneSpec,
      }),
      path = behaviorPath,
      id = self.sceneSpec.id or "root",
    })
  end

  for _, entry in ipairs(self.behaviors) do
    if type(entry.module.init) == "function" then
      entry.module.init(entry.ctx)
    end
  end
end

function Runtime:resized(w, h)
  if self.rootWidget and self.rootWidget.setBounds then
    self.rootWidget:setBounds(0, 0, w, h)
  end

  for _, entry in ipairs(self.behaviors) do
    if type(entry.module.resized) == "function" then
      local bw = w
      local bh = h
      local rootWidget = entry.ctx and entry.ctx.root or nil
      if rootWidget and rootWidget.node then
        if rootWidget.node.getWidth then
          bw = rootWidget.node:getWidth()
        end
        if rootWidget.node.getHeight then
          bh = rootWidget.node:getHeight()
        end
      end
      entry.module.resized(entry.ctx, bw, bh)
    end
  end
end

function Runtime:update(state)
  for _, entry in ipairs(self.behaviors) do
    if type(entry.module.update) == "function" then
      entry.module.update(entry.ctx, state)
    end
  end
end

function Runtime:cleanup()
  for i = #self.behaviors, 1, -1 do
    local entry = self.behaviors[i]
    if type(entry.module.cleanup) == "function" then
      entry.module.cleanup(entry.ctx)
    end
  end
  self.behaviors = {}
  self.widgets = {}
end

function M.install(opts)
  local runtime = Runtime.new(opts or {})
  local usingShellPerformanceView = false

  function ui_init(root)
    if shell and type(shell.registerPerformanceView) == "function" then
      usingShellPerformanceView = true
      shell:registerPerformanceView({
        init = function(contentRoot)
          runtime:init(contentRoot)
        end,
        getLayoutInfo = function(fallbackW, fallbackH)
          return runtime:getLayoutInfo(fallbackW, fallbackH)
        end,
        resized = function(x, y, w, h)
          local _ = x
          _ = y
          runtime:resized(w, h)
        end,
        update = function(state)
          runtime:update(state)
        end,
      })
      return
    end

    runtime:init(root)
  end

  function ui_resized(w, h)
    if usingShellPerformanceView then
      return
    end
    runtime:resized(w, h)
  end

  function ui_update(state)
    if usingShellPerformanceView then
      return
    end
    runtime:update(state)
  end

  function ui_cleanup()
    runtime:cleanup()
  end

  return runtime
end

return M
