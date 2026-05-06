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

return M
