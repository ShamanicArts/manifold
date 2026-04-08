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

local function setLabelText(widget, text)
  if widget and widget.setText then
    widget:setText(text)
  elseif widget and widget.setLabel then
    widget:setLabel(text)
  end
end

local function formatMicros(value)
  local n = math.floor((tonumber(value) or 0) + 0.5)
  return tostring(n) .. " us"
end

local function formatPercent(value)
  local n = math.floor((tonumber(value) or 0) + 0.5)
  return tostring(n) .. "%"
end

local function formatMB(value)
  local n = tonumber(value) or 0
  if n >= 100 then
    return tostring(math.floor(n + 0.5)) .. " MB"
  end
  return string.format("%.1f MB", n)
end

local function formatShortMB(value)
  local n = tonumber(value) or 0
  if n >= 10 then
    return tostring(math.floor(n + 0.5)) .. "M"
  end
  return string.format("%.1fM", n)
end

local function syncState(ctx)
  local widgets = ctx.widgets or {}

  setLabelText(widgets.perf_frame_value, formatMicros(safeGetParam('/plugin/ui/perf/frameCurrentUs', 0)))
  setLabelText(widgets.perf_avg_value, formatMicros(safeGetParam('/plugin/ui/perf/frameAvgUs', 0)))
  setLabelText(widgets.perf_cpu_value, formatPercent(safeGetParam('/plugin/ui/perf/cpuPercent', 0)))
  setLabelText(widgets.perf_pss_value, formatMB(safeGetParam('/plugin/ui/perf/pssMB', 0)))
  setLabelText(widgets.perf_priv_value, formatMB(safeGetParam('/plugin/ui/perf/privateDirtyMB', 0)))
  setLabelText(widgets.perf_lua_value, formatShortMB(safeGetParam('/plugin/ui/perf/luaHeapMB', 0)))
  setLabelText(widgets.perf_heap_value, formatMB(safeGetParam('/plugin/ui/perf/glibcHeapMB', 0)))
end

function M.init(ctx)
  ctx._lastSyncTime = 0
  syncState(ctx)
end

function M.resized(ctx)
  syncState(ctx)
end

function M.update(ctx)
  local now = type(getTime) == 'function' and getTime() or 0
  if now == 0 or now - (ctx._lastSyncTime or 0) >= SYNC_INTERVAL then
    ctx._lastSyncTime = now
    syncState(ctx)
  end
end

return M
