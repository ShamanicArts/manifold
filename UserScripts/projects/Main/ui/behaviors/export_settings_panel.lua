local M = {}

local SYNC_INTERVAL = 0.15

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

local function qset(widget, x, y, w, h)
  if widget and widget.node and widget.node.setBounds then
    widget.node:setBounds(
      math.floor(tonumber(x) or 0),
      math.floor(tonumber(y) or 0),
      math.floor(math.max(1, tonumber(w) or 1)),
      math.floor(math.max(1, tonumber(h) or 1))
    )
  end
end

local function setLabelText(widget, text)
  if widget and widget.setText then
    widget:setText(text)
  elseif widget and widget.setLabel then
    widget:setLabel(text)
  end
end

local function formatPort(value)
  local n = math.floor((tonumber(value) or 0) + 0.5)
  if n <= 0 then
    return "-"
  end
  return tostring(n)
end

local function layout(ctx)
  local root = ctx.root and ctx.root.node or nil
  if not root then
    return
  end

  local w = math.floor(tonumber(root:getWidth()) or 0)
  local h = math.floor(tonumber(root:getHeight()) or 0)
  if w <= 0 or h <= 0 then
    return
  end

  local widgets = ctx.widgets or {}
  local compact = w <= 260 or h <= 170
  local pad = compact and 8 or 16
  local titleH = compact and 16 or 24
  local closeSize = compact and 18 or 24
  local sectionGap = compact and 8 or 16
  local rowGap = compact and 6 or 10
  local rowH = compact and 20 or 24
  local labelH = compact and 16 or 20
  local valueIndent = compact and 72 or 64
  local toggleW = compact and 56 or 60

  qset(widgets.settings_title, pad, pad, math.max(48, w - pad * 2 - closeSize - 6), titleH)
  qset(widgets.close_button, math.max(pad, w - pad - closeSize), pad, closeSize, closeSize)

  local sectionY = pad + titleH + sectionGap
  qset(widgets.osc_section_title, pad, sectionY, math.max(80, w - pad * 2), compact and 14 or 16)

  local controlsY = sectionY + (compact and 20 or 26)
  if compact then
    qset(widgets.osc_label, pad, controlsY + 2, 44, labelH)
    qset(widgets.osc_enabled_toggle, math.max(pad + 48, w - pad - toggleW), controlsY, toggleW, rowH)

    local queryY = controlsY + rowH + rowGap
    qset(widgets.query_label, pad, queryY + 2, 44, labelH)
    qset(widgets.osc_query_toggle, math.max(pad + 48, w - pad - toggleW), queryY, toggleW, rowH)

    local portY = queryY + rowH + rowGap + 2
    qset(widgets.osc_port_label, pad, portY, 68, 16)
    qset(widgets.osc_port_value, pad + valueIndent, portY, math.max(40, w - pad * 2 - valueIndent), 16)

    local queryPortY = portY + 18
    qset(widgets.query_port_label, pad, queryPortY, 68, 16)
    qset(widgets.query_port_value, pad + valueIndent, queryPortY, math.max(40, w - pad * 2 - valueIndent), 16)
    return
  end

  qset(widgets.osc_label, pad, controlsY + 2, 60, labelH)
  qset(widgets.osc_enabled_toggle, pad + 54, controlsY, toggleW, rowH)
  qset(widgets.query_label, pad + 134, controlsY + 2, 60, labelH)
  qset(widgets.osc_query_toggle, pad + 194, controlsY, toggleW, rowH)

  local portY = controlsY + rowH + rowGap
  qset(widgets.osc_port_label, pad, portY, 60, 16)
  qset(widgets.osc_port_value, pad + 64, portY, 60, 16)
  qset(widgets.query_port_label, pad + 134, portY, 70, 16)
  qset(widgets.query_port_value, pad + 209, portY, 60, 16)
end

local function syncState(ctx)
  local widgets = ctx.widgets or {}
  local oscEnabled = safeGetParam('/plugin/ui/oscEnabled', 1) > 0.5
  local queryEnabled = safeGetParam('/plugin/ui/oscQueryEnabled', 1) > 0.5

  if queryEnabled and not oscEnabled then
    safeSetParam('/plugin/ui/oscEnabled', 1)
    oscEnabled = true
  end

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

  setLabelText(widgets.osc_port_value, formatPort(safeGetParam('/plugin/ui/oscInputPort', 0)))
  setLabelText(widgets.query_port_value, formatPort(safeGetParam('/plugin/ui/oscQueryPort', 0)))
end

local function bindControls(ctx)
  local widgets = ctx.widgets or {}
  if widgets.close_button then
    widgets.close_button._onClick = function()
      safeSetParam('/plugin/ui/settingsVisible', 0)
    end
  end

  if widgets.osc_enabled_toggle then
    widgets.osc_enabled_toggle._onChange = function(value)
      safeSetParam('/plugin/ui/oscEnabled', value and 1 or 0)
      if not value then
        safeSetParam('/plugin/ui/oscQueryEnabled', 0)
      end
      syncState(ctx)
      layout(ctx)
    end
  end

  if widgets.osc_query_toggle then
    widgets.osc_query_toggle._onChange = function(value)
      if value then
        safeSetParam('/plugin/ui/oscEnabled', 1)
      end
      safeSetParam('/plugin/ui/oscQueryEnabled', value and 1 or 0)
      syncState(ctx)
      layout(ctx)
    end
  end
end

function M.init(ctx)
  ctx._lastSyncTime = 0
  bindControls(ctx)
  layout(ctx)
  syncState(ctx)
end

function M.resized(ctx)
  layout(ctx)
  syncState(ctx)
end

function M.update(ctx)
  local now = type(getTime) == 'function' and getTime() or 0
  if now == 0 or now - (ctx._lastSyncTime or 0) >= SYNC_INTERVAL then
    ctx._lastSyncTime = now
    layout(ctx)
    syncState(ctx)
  end
end

return M
