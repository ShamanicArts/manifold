local M = {}

function M.clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

function M.round(v)
  return math.floor((tonumber(v) or 0) + 0.5)
end

function M.setText(w, text)
  if w and w.setText then w:setText(tostring(text or "")) end
end

function M.setOptions(w, opts)
  if w and w.setOptions then w:setOptions(opts or {}) end
end

function M.setSelectedSilently(w, value)
  if not (w and w.setSelected) then return end
  local cb = w._onSelect
  w._onSelect = nil
  w:setSelected(value)
  w._onSelect = cb
end

function M.readParam(path, fallback)
  if type(getParam) == "function" then
    local ok, v = pcall(getParam, path)
    if ok and v ~= nil then return v end
  end
  return fallback
end

function M.writeParam(path, value)
  local n = type(value) == "boolean" and (value and 1 or 0) or (tonumber(value) or 0)
  if type(setParam) == "function" then return setParam(path, n) end
  return false
end

function M.bump(path)
  M.writeParam(path, (M.readParam(path, 0) + 1) % 1000000)
end

function M.nowSeconds()
  return (type(getTime) == "function" and tonumber(getTime())) or 0
end

function M.writeParamIfChanged(ctx, cacheKey, path, value, epsilon)
  ctx._lastParamWrites = ctx._lastParamWrites or {}
  local numeric = tonumber(value) or 0
  local last = tonumber(ctx._lastParamWrites[cacheKey])
  local threshold = tonumber(epsilon) or 0.0005
  if last ~= nil and math.abs(last - numeric) <= threshold then
    return false
  end
  ctx._lastParamWrites[cacheKey] = numeric
  return M.writeParam(path, numeric)
end

function M.setBounds(w, x, y, ww, hh)
  x, y, ww, hh = math.floor(x or 0), math.floor(y or 0), math.floor(ww or 0), math.floor(hh or 0)
  if w and w.setBounds then w:setBounds(x, y, ww, hh)
  elseif w and w.node and w.node.setBounds then w.node:setBounds(x, y, ww, hh) end
end

function M.setLabel(w, text)
  if w and w.setLabel then w:setLabel(tostring(text or "")) end
end

function M.setValueSilently(w, value)
  if not (w and w.setValue) then return end
  local cb = w._onChange
  w._onChange = nil
  w:setValue(value)
  w._onChange = cb
end

function M.setVisible(w, v)
  if w and w.setVisible then w:setVisible(v == true)
  elseif w and w.node and w.node.setVisible then w.node:setVisible(v == true) end
end

function M.toNum(v)
  local t = type(v)
  if t == "number" then return v end
  if t == "string" then return tonumber(v) end
  return nil
end

function M.bor(...)
  local args = { ... }
  local out = 0
  for i = 1, #args do out = out | args[i] end
  return out
end

function M.fitBox(maxW, maxH, contentW, contentH)
  maxW = math.max(1, math.floor(tonumber(maxW) or 1))
  maxH = math.max(1, math.floor(tonumber(maxH) or 1))
  contentW = math.max(1, tonumber(contentW) or maxW)
  contentH = math.max(1, tonumber(contentH) or maxH)
  local aspect = contentW / math.max(1, contentH)
  local w = maxW
  local h = math.floor(w / math.max(0.001, aspect) + 0.5)
  if h > maxH then
    h = maxH
    w = math.floor(h * aspect + 0.5)
  end
  local x = math.floor((maxW - w) * 0.5)
  local y = math.floor((maxH - h) * 0.5)
  return x, y, math.max(1, w), math.max(1, h)
end

function M.nowSeconds()
  return (type(getTime) == "function" and tonumber(getTime())) or 0
end

function M.shouldRunInterval(ctx, key, interval)
  ctx._timers = ctx._timers or {}
  local now = M.nowSeconds()
  if now <= 0 then return true end
  local last = tonumber(ctx._timers[key]) or -1e9
  if (now - last) >= (tonumber(interval) or 0) then
    ctx._timers[key] = now
    return true
  end
  return false
end

function M.dirname(path)
  return (tostring(path or ""):gsub("/+$", ""):match("^(.*)/[^/]+$") or ".")
end

function M.join(a, b)
  if tostring(a):sub(-1) == "/" then return tostring(a) .. tostring(b) end
  return tostring(a) .. "/" .. tostring(b)
end

function M.parentDir(path)
  local p = tostring(path or ""):gsub("/+$", "")
  return (p:match("^(.*)/[^/]+$") or p) .. "/"
end

function M.projectRootDir()
  local dir = M.currentScriptDir()
  if dir:match("/ui/behaviors/$") then return M.parentDir(M.parentDir(dir)) end
  if dir:match("/ui/$") then return M.parentDir(dir) end
  return dir
end

function M.currentScriptDir()
  local p = (type(getCurrentScriptPath) == "function") and getCurrentScriptPath() or ""
  return (p:match("^(.*)/[^/]+$") or ".") .. "/"
end

function M.clockInfo()
  local seam = _G.__avsdCtx and _G.__avsdCtx._testSeams and _G.__avsdCtx._testSeams.clock
  if type(seam) == "table" then return seam end
  if type(getAudioClockInfo) == "function" then
    local ok, info = pcall(getAudioClockInfo)
    if ok and type(info) == "table" then return info end
  end
  return { sampleRate = 44100, playTimeSamples = 0, tempo = 120 }
end

function M.cloneTable(t)
  if type(t) ~= "table" then return t end
  local out = {}
  for k, v in pairs(t) do
    out[k] = type(v) == "table" and M.cloneTable(v) or v
  end
  return out
end

function M.letterbox(vpW, vpH, vidW, vidH)
  vpW = math.max(1, vpW or 1)
  vpH = math.max(1, vpH or 1)
  vidW = math.max(1, vidW or 1)
  vidH = math.max(1, vidH or 1)
  local aspect = vidW / vidH
  local outW = vpW
  local outH = math.floor(outW / aspect + 0.5)
  if outH > vpH then
    outH = vpH
    outW = math.floor(outH * aspect + 0.5)
  end
  return math.floor((vpW - outW) * 0.5), math.floor((vpH - outH) * 0.5), outW, outH
end

function M.selectedDeviceIndex(ctx)
  local selected = ctx.deviceSelectIndex or 1
  local dd = ctx.widgets and ctx.widgets.deviceSelect
  if dd and dd.getSelected then selected = dd:getSelected() end
  local entry = ctx._devices and ctx._devices[math.max(1, M.round(selected))]
  return entry and tonumber(entry.index) or 0
end

-- Alias for backward compat
local round = M.round

return M
