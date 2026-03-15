local BaseWidget = require("widgets.base")
local projectRoot = tostring((_G and _G.__experimentalProjectRoot) or "")
local visualPath = projectRoot .. "/ui/widgets/visual_utils.lua"
local visualChunk, visualLoadErr = loadfile(visualPath)
if not visualChunk then
  error("failed to load experimental visual utils: " .. tostring(visualLoadErr))
end
local Visual = visualChunk()

local VectorField = BaseWidget:extend()

local function noise(x, y, z)
  return math.sin(x * 12.9898 + y * 78.233 + z) * 43758.5453 % 1
end

function VectorField.new(parent, name, config)
  local self = setmetatable(BaseWidget.new(parent, name, config or {}), VectorField)
  self._renderState = {
    animTime = 0,
    noiseOffset = 0,
  }

  if self.node and self.node.setInterceptsMouse then
    self.node:setInterceptsMouse(false, false)
  end

  self:_storeEditorMeta("ExperimentalVectorField", {}, {})
  self:refreshRetained()
  return self
end

function VectorField:setRenderState(renderState)
  local state = renderState or {}
  self._renderState = {
    animTime = tonumber(state.animTime) or 0,
    noiseOffset = tonumber(state.noiseOffset) or 0,
  }
  self:refreshRetained()
  if self.node and self.node.repaint then
    self.node:repaint()
  end
end

function VectorField:_buildDisplay(w, h)
  local display = {
    { cmd = "fillRect", x = 0, y = 0, w = w, h = h, color = 0x051015 },
  }

  local time = (self._renderState.animTime or 0) + (self._renderState.noiseOffset or 0)
  local cols = 10
  local rows = 8
  local cellW = w / cols
  local cellH = h / rows

  for i = 0, cols - 1 do
    for j = 0, rows - 1 do
      local nx = i * 0.2 + time * 0.5
      local ny = j * 0.2 + time * 0.3
      local n = noise(nx, ny, time * 0.1)
      local angle = n * math.pi * 4
      local cx = i * cellW + cellW * 0.5
      local cy = j * cellH + cellH * 0.5
      local len = math.min(cellW, cellH) * 0.35
      local x2 = cx + math.cos(angle) * len
      local y2 = cy + math.sin(angle) * len
      local hue = (n + time * 0.05) % 1
      local r, g, b = Visual.hsvToRgb(hue, 0.8, 1.0)

      display[#display + 1] = {
        cmd = "drawLine",
        x1 = cx,
        y1 = cy,
        x2 = x2,
        y2 = y2,
        thickness = 2,
        color = Visual.argb(240, r, g, b),
      }
      display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = math.floor(cx - 1 + 0.5),
        y = math.floor(cy - 1 + 0.5),
        w = 3,
        h = 3,
        radius = 1.5,
        color = 0xffffffff,
      }
    end
  end

  return display
end

function VectorField:onDraw(w, h)
  Visual.renderDisplayList(self:_buildDisplay(w, h))
end

function VectorField:_syncRetained(w, h)
  local bw, bh = Visual.boundsSize(self.node)
  w = math.max(1, math.floor(tonumber(w) or bw or 0))
  h = math.max(1, math.floor(tonumber(h) or bh or 0))
  Visual.setTransparentStyle(self.node)
  self.node:setDisplayList(self:_buildDisplay(w, h))
end

return VectorField
