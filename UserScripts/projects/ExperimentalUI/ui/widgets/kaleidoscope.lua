local BaseWidget = require("widgets.base")
local projectRoot = tostring((_G and _G.__experimentalProjectRoot) or "")
local visualPath = projectRoot .. "/ui/widgets/visual_utils.lua"
local visualChunk, visualLoadErr = loadfile(visualPath)
if not visualChunk then
  error("failed to load experimental visual utils: " .. tostring(visualLoadErr))
end
local Visual = visualChunk()

local Kaleidoscope = BaseWidget:extend()

function Kaleidoscope.new(parent, name, config)
  local self = setmetatable(BaseWidget.new(parent, name, config or {}), Kaleidoscope)
  self._renderState = {
    animTime = 0,
    kaleidoscopeAngle = 0,
  }

  if self.node and self.node.setInterceptsMouse then
    self.node:setInterceptsMouse(false, false)
  end

  self:_storeEditorMeta("ExperimentalKaleidoscope", {}, {
    segments = tonumber(config and config.segments) or 8,
  })
  self._segments = math.max(4, math.floor(tonumber(config and config.segments) or 8))
  self:refreshRetained()
  return self
end

function Kaleidoscope:setRenderState(renderState)
  local state = renderState or {}
  self._renderState = {
    animTime = tonumber(state.animTime) or 0,
    kaleidoscopeAngle = tonumber(state.kaleidoscopeAngle) or 0,
  }
  self:refreshRetained()
  if self.node and self.node.repaint then
    self.node:repaint()
  end
end

function Kaleidoscope:_buildDisplay(w, h)
  local display = {
    { cmd = "fillRect", x = 0, y = 0, w = w, h = h, color = 0x050813 },
  }

  local cx = w * 0.5
  local cy = h * 0.5
  local radius = math.min(w, h) * 0.4
  local animTime = self._renderState.animTime or 0
  local angle = (self._renderState.kaleidoscopeAngle or 0) + animTime
  local segmentAngle = (math.pi * 2) / self._segments

  for i = 0, self._segments - 1 do
    local a1 = angle + i * segmentAngle
    local a2 = angle + (i + 1) * segmentAngle
    local hue = (animTime * 0.1 + i / self._segments) % 1.0
    local r, g, b = Visual.hsvToRgb(hue, 0.8, 1.0)
    local color = Visual.argb(255, r, g, b)
    local lastX = nil
    local lastY = nil

    for j = 0, 19 do
      local t = j / 19
      local segAngle = a1 + (a2 - a1) * t
      local wave = math.sin(segAngle * 3 + animTime * 2) * 0.3 + 0.7
      local rr = radius * wave * (0.5 + t * 0.5)
      local x = cx + math.cos(segAngle) * rr
      local y = cy + math.sin(segAngle) * rr

      if lastX ~= nil and lastY ~= nil then
        display[#display + 1] = {
          cmd = "drawLine",
          x1 = lastX,
          y1 = lastY,
          x2 = x,
          y2 = y,
          thickness = 2,
          color = color,
        }
      end

      if j == 0 or j == 19 or j % 6 == 0 then
        display[#display + 1] = {
          cmd = "fillRoundedRect",
          x = math.floor(x - 2 + 0.5),
          y = math.floor(y - 2 + 0.5),
          w = 4,
          h = 4,
          radius = 2,
          color = color,
        }
      end

      lastX = x
      lastY = y
    end
  end

  display[#display + 1] = {
    cmd = "fillRoundedRect",
    x = math.floor(cx - 3 + 0.5),
    y = math.floor(cy - 3 + 0.5),
    w = 6,
    h = 6,
    radius = 3,
    color = 0xffffffff,
  }

  return display
end

function Kaleidoscope:onDraw(w, h)
  Visual.renderDisplayList(self:_buildDisplay(w, h))
end

function Kaleidoscope:_syncRetained(w, h)
  local bw, bh = Visual.boundsSize(self.node)
  w = math.max(1, math.floor(tonumber(w) or bw or 0))
  h = math.max(1, math.floor(tonumber(h) or bh or 0))
  Visual.setTransparentStyle(self.node)
  self.node:setDisplayList(self:_buildDisplay(w, h))
end

return Kaleidoscope
