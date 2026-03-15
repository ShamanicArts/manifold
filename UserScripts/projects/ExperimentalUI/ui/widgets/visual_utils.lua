local M = {}

local function floorInt(v)
  return math.floor((tonumber(v) or 0) + 0.5)
end

function M.clamp(v, lo, hi)
  local n = tonumber(v) or 0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

function M.hsvToRgb(h, s, v)
  local r, g, b
  local i = math.floor((tonumber(h) or 0) * 6)
  local f = (tonumber(h) or 0) * 6 - i
  local p = v * (1 - s)
  local q = v * (1 - f * s)
  local t = v * (1 - (1 - f) * s)

  i = i % 6
  if i == 0 then r, g, b = v, t, p
  elseif i == 1 then r, g, b = q, v, p
  elseif i == 2 then r, g, b = p, v, t
  elseif i == 3 then r, g, b = p, q, v
  elseif i == 4 then r, g, b = t, p, v
  else r, g, b = v, p, q
  end

  return floorInt(r * 255), floorInt(g * 255), floorInt(b * 255)
end

function M.argb(a, r, g, b)
  local aa = floorInt(a) & 0xff
  local rr = floorInt(r) & 0xff
  local gg = floorInt(g) & 0xff
  local bb = floorInt(b) & 0xff
  return (aa << 24) | (rr << 16) | (gg << 8) | bb
end

function M.boundsSize(node)
  local _, _, w, h = node:getBounds()
  return tonumber(w) or 0, tonumber(h) or 0
end

function M.setTransparentStyle(node)
  if node and node.setStyle then
    node:setStyle({
      bg = 0x00000000,
      border = 0x00000000,
      borderWidth = 0,
      radius = 0,
      opacity = 1.0,
    })
  end
end

function M.justifyFor(align)
  local key = string.lower(tostring(align or "center"))
  if key == "left" then return Justify.centredLeft end
  if key == "right" then return Justify.centredRight end
  return Justify.centred
end

function M.renderDisplayList(display)
  for i = 1, #(display or {}) do
    local op = display[i]
    local cmd = op and op.cmd or nil
    if cmd == "fillRect" then
      gfx.setColour(op.color or 0xffffffff)
      gfx.fillRect(floorInt(op.x), floorInt(op.y), floorInt(op.w), floorInt(op.h))
    elseif cmd == "drawRect" then
      gfx.setColour(op.color or 0xffffffff)
      gfx.drawRect(floorInt(op.x), floorInt(op.y), floorInt(op.w), floorInt(op.h), tonumber(op.thickness) or 1)
    elseif cmd == "fillRoundedRect" then
      gfx.setColour(op.color or 0xffffffff)
      gfx.fillRoundedRect(floorInt(op.x), floorInt(op.y), floorInt(op.w), floorInt(op.h), tonumber(op.radius) or 0)
    elseif cmd == "drawRoundedRect" then
      gfx.setColour(op.color or 0xffffffff)
      gfx.drawRoundedRect(floorInt(op.x), floorInt(op.y), floorInt(op.w), floorInt(op.h), tonumber(op.radius) or 0, tonumber(op.thickness) or 1)
    elseif cmd == "drawLine" then
      gfx.setColour(op.color or 0xffffffff)
      gfx.drawLine(floorInt(op.x1), floorInt(op.y1), floorInt(op.x2), floorInt(op.y2), tonumber(op.thickness) or 1)
    elseif cmd == "drawText" then
      gfx.setColour(op.color or 0xffffffff)
      gfx.setFont(tonumber(op.fontSize) or 12.0)
      gfx.drawText(tostring(op.text or ""), floorInt(op.x), floorInt(op.y), floorInt(op.w), floorInt(op.h), M.justifyFor(op.align))
    end
  end
end

return M
