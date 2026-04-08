local Layout = require("ui.canonical_layout")

local M = {}

local HEADER_H = 12
local MODE_COMPACT = 0
local MODE_SPLIT = 1
local SYNC_INTERVAL = 0.15

local MODES = {
  [MODE_COMPACT] = {
    id = MODE_COMPACT,
    name = "compact",
    contentW = 236,
    contentH = 208,
    label = "1x1",
  },
  [MODE_SPLIT] = {
    id = MODE_SPLIT,
    name = "split",
    contentW = 472,
    contentH = 208,
    label = "1x2",
  },
}

local function clampMode(value)
  local n = math.floor((tonumber(value) or MODE_SPLIT) + 0.5)
  if n ~= MODE_COMPACT then
    return MODE_SPLIT
  end
  return MODE_COMPACT
end

local function safeGetParam(path, fallback)
  if type(getParam) == "function" then
    local ok, value = pcall(getParam, path)
    if ok and value ~= nil then
      return value
    end
  end
  return fallback
end

local function safeSetParam(path, value)
  if type(setParam) == "function" then
    pcall(setParam, path, tonumber(value) or 0)
  elseif type(command) == "function" then
    pcall(command, "SET", path, tostring(tonumber(value) or 0))
  end
end

local function currentMode(ctx)
  local modeIndex = clampMode(safeGetParam("/plugin/ui/viewMode", MODE_SPLIT))
  ctx._modeIndex = modeIndex
  return MODES[modeIndex]
end

local function formatPort(value)
  local n = math.floor((tonumber(value) or 0) + 0.5)
  if n <= 0 then
    return "-"
  end
  return tostring(n)
end

local function getFilterComponentWidget(ctx)
  if type(ctx) ~= "table" then
    return nil
  end
  if ctx._filterComponentWidget ~= nil then
    return ctx._filterComponentWidget
  end

  local widgets = ctx.widgets or {}
  if widgets.filter_component ~= nil then
    ctx._filterComponentWidget = widgets.filter_component
    return ctx._filterComponentWidget
  end

  local root = ctx.root
  local record = root and root._structuredRecord or nil
  local globalId = type(record) == "table" and tostring(record.globalId or "") or ""
  local runtime = type(_G) == "table" and rawget(_G, "__manifoldStructuredUiRuntime") or nil
  local runtimeWidgets = type(runtime) == "table" and runtime.widgets or nil
  if globalId ~= "" and type(runtimeWidgets) == "table" then
    ctx._filterComponentWidget = runtimeWidgets[globalId .. ".filter_component"]
    return ctx._filterComponentWidget
  end

  return nil
end

local function applyModeVisuals(ctx)
  local widgets = ctx.widgets or {}
  local mode = currentMode(ctx)
  local settingsOpen = ctx.settingsOpen == true

  if widgets.view_mode_toggle then
    if widgets.view_mode_toggle.setLabel then
      widgets.view_mode_toggle:setLabel(mode.label)
    end
    if widgets.view_mode_toggle.setBg then
      widgets.view_mode_toggle:setBg(mode.id == MODE_SPLIT and 0xff7c3aed or 0xff334155)
    end
    if widgets.view_mode_toggle.setTextColour then
      widgets.view_mode_toggle:setTextColour(0xffffffff)
    end
  end

  if widgets.settings_button then
    if widgets.settings_button.setLabel then
      widgets.settings_button:setLabel("S")
    end
    if widgets.settings_button.setBg then
      widgets.settings_button:setBg(settingsOpen and 0xff475569 or 0x20ffffff)
    end
    if widgets.settings_button.setTextColour then
      widgets.settings_button:setTextColour(0xffffffff)
    end
  end
end

local function layout(ctx)
  local root = ctx.root
  local widgets = ctx.widgets or {}
  if not (root and root.node) then
    return
  end

  local rootW = root.node:getWidth()
  local rootH = root.node:getHeight()
  if not rootW or rootW <= 0 or not rootH or rootH <= 0 then
    return
  end

  local mode = currentMode(ctx)
  local queue = {}

  Layout.setBoundsQueued(queue, widgets.header_bg, 0, 0, rootW, HEADER_H)
  Layout.setBoundsQueued(queue, widgets.header_accent, 0, 0, 18, HEADER_H)
  Layout.setBoundsQueued(queue, widgets.title, 24, 0, math.max(80, rootW - 96), HEADER_H)
  Layout.setBoundsQueued(queue, widgets.view_mode_toggle, math.max(0, rootW - 64), 0, 40, HEADER_H)
  Layout.setBoundsQueued(queue, widgets.settings_button, math.max(0, rootW - 24), 0, 24, HEADER_H)
  Layout.setBoundsQueued(queue, widgets.content_bg, 0, HEADER_H, rootW, math.max(1, rootH - HEADER_H))

  local settingsW = 172
  local settingsH = 84
  local settingsX = math.max(8, rootW - settingsW - 8)
  local settingsY = HEADER_H + 6
  Layout.setBoundsQueued(queue, widgets.settings_panel, settingsX, settingsY, settingsW, settingsH)
  Layout.setVisibleQueued(queue, widgets.settings_panel, ctx.settingsOpen == true)

  local contentW = math.max(1, rootW)
  local contentH = math.max(1, rootH - HEADER_H)
  local scale = math.min(contentW / mode.contentW, contentH / mode.contentH)
  if not scale or scale <= 0 then
    scale = 1
  end

  local moduleW = math.max(1, math.floor(mode.contentW * scale + 0.5))
  local moduleH = math.max(1, math.floor(mode.contentH * scale + 0.5))
  local moduleX = math.floor((contentW - moduleW) * 0.5 + 0.5)
  local moduleY = HEADER_H + math.floor((contentH - moduleH) * 0.5 + 0.5)

  local filterComponent = getFilterComponentWidget(ctx)
  if filterComponent and filterComponent.node then
    local componentNode = filterComponent.node
    if componentNode.setUserData then
      componentNode:setUserData("_pluginViewMode", mode.name)
    end
    if componentNode.setBounds then
      componentNode:setBounds(moduleX, moduleY, moduleW, moduleH)
    elseif filterComponent.setBounds then
      filterComponent:setBounds(moduleX, moduleY, moduleW, moduleH)
    end
    if componentNode.markRenderDirty then
      pcall(function() componentNode:markRenderDirty() end)
    end
    if componentNode.repaint then
      pcall(function() componentNode:repaint() end)
    end
  end

  Layout.flushWidgetRefreshes(queue)
  applyModeVisuals(ctx)

  if widgets.settings_panel and widgets.settings_panel.node and widgets.settings_panel.node.toFront then
    pcall(function()
      widgets.settings_panel.node:toFront()
    end)
  end
end

local function syncSettingsState(ctx)
  local widgets = ctx.widgets or {}
  local oscEnabled = safeGetParam("/plugin/ui/oscEnabled", 0) > 0.5
  local queryEnabled = safeGetParam("/plugin/ui/oscQueryEnabled", 0) > 0.5
  local oscPort = safeGetParam("/plugin/ui/oscInputPort", 0)
  local queryPort = safeGetParam("/plugin/ui/oscQueryPort", 0)

  if widgets.osc_enabled_toggle and widgets.osc_enabled_toggle.setValue then
    widgets.osc_enabled_toggle:setValue(oscEnabled)
  end
  if widgets.osc_query_toggle then
    if widgets.osc_query_toggle.setEnabled then
      widgets.osc_query_toggle:setEnabled(oscEnabled)
    end
    if widgets.osc_query_toggle.setValue then
      widgets.osc_query_toggle:setValue(oscEnabled and queryEnabled)
    end
  end
  if widgets.osc_port_value and widgets.osc_port_value.setText then
    widgets.osc_port_value:setText(formatPort(oscPort))
  end
  if widgets.query_port_value and widgets.query_port_value.setText then
    widgets.query_port_value:setText(formatPort(queryPort))
  end

  applyModeVisuals(ctx)
end

local function bindControls(ctx)
  local widgets = ctx.widgets or {}

  if widgets.view_mode_toggle and widgets.view_mode_toggle.node and widgets.view_mode_toggle.node.setOnClick then
    widgets.view_mode_toggle.node:setOnClick(function()
      local nextMode = currentMode(ctx).id == MODE_SPLIT and MODE_COMPACT or MODE_SPLIT
      safeSetParam("/plugin/ui/viewMode", nextMode)
      layout(ctx)
      syncSettingsState(ctx)
    end)
  end

  if widgets.settings_button and widgets.settings_button.node and widgets.settings_button.node.setOnClick then
    widgets.settings_button.node:setOnClick(function()
      ctx.settingsOpen = not (ctx.settingsOpen == true)
      layout(ctx)
      syncSettingsState(ctx)
    end)
  end

  if widgets.osc_enabled_toggle then
    widgets.osc_enabled_toggle._onChange = function(value)
      safeSetParam("/plugin/ui/oscEnabled", value and 1 or 0)
      if not value then
        safeSetParam("/plugin/ui/oscQueryEnabled", 0)
      end
      syncSettingsState(ctx)
    end
  end

  if widgets.osc_query_toggle then
    widgets.osc_query_toggle._onChange = function(value)
      if value then
        safeSetParam("/plugin/ui/oscEnabled", 1)
      end
      safeSetParam("/plugin/ui/oscQueryEnabled", value and 1 or 0)
      syncSettingsState(ctx)
    end
  end
end

function M.init(ctx)
  ctx.settingsOpen = false
  ctx._lastSyncTime = 0
  bindControls(ctx)
  syncSettingsState(ctx)
  layout(ctx)
end

function M.resized(ctx)
  layout(ctx)
  syncSettingsState(ctx)
end

function M.update(ctx)
  local now = type(getTime) == "function" and getTime() or 0
  if now == 0 or now - (ctx._lastSyncTime or 0) >= SYNC_INTERVAL then
    ctx._lastSyncTime = now
    syncSettingsState(ctx)
    layout(ctx)
  end
end

return M
