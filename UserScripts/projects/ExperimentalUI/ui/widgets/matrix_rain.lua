local BaseWidget = require("widgets.base")
local projectRoot = tostring((_G and _G.__experimentalProjectRoot) or "")
local visualPath = projectRoot .. "/ui/widgets/visual_utils.lua"
local visualChunk, visualLoadErr = loadfile(visualPath)
if not visualChunk then
  error("failed to load experimental visual utils: " .. tostring(visualLoadErr))
end
local Visual = visualChunk()

local MatrixRain = BaseWidget:extend()

function MatrixRain.new(parent, name, config)
  local self = setmetatable(BaseWidget.new(parent, name, config or {}), MatrixRain)
  self._cols = math.max(5, math.floor(tonumber(config and config.cols) or 40))
  if self.node and self.node.setInterceptsMouse then
    self.node:setInterceptsMouse(false, false)
  end
  self._charSize = math.max(6, math.floor(tonumber(config and config.charSize) or 14))
  self._speed = tonumber(config and config.speed) or 1.0
  self._spawnRate = tonumber(config and config.spawnRate) or 0.05
  self._color = tonumber(config and config.color) or 0xff00ff00
  self._drops = {}
  self._chars = tostring(config and config.charset or "0123456789ABCDEF")

  self:_storeEditorMeta("ExperimentalMatrixRain", {}, {})
  self:exposeParams({
    { path = "cols", label = "Columns", type = "number", min = 5, max = 100, step = 1, group = "Layout" },
    { path = "charSize", label = "Char Size", type = "number", min = 6, max = 32, step = 1, group = "Style" },
    { path = "speed", label = "Speed", type = "number", min = 0.1, max = 5.0, step = 0.1, group = "Animation" },
    { path = "spawnRate", label = "Spawn Rate", type = "number", min = 0.01, max = 0.5, step = 0.01, group = "Animation" },
    { path = "color", label = "Color", type = "color", group = "Style" },
  })

  self:refreshRetained()
  return self
end

function MatrixRain:update(dt)
  local scaledDt = (tonumber(dt) or 0) * self._speed

  for i = 1, self._cols do
    if math.random() < self._spawnRate and not self._drops[i] then
      local drop = {
        y = -self._charSize,
        speed = math.random(50, 150),
        length = math.random(5, 15),
        chars = {},
      }
      for j = 1, drop.length do
        local index = math.random(1, #self._chars)
        drop.chars[j] = self._chars:sub(index, index)
      end
      self._drops[i] = drop
    end
  end

  local h = self.node:getHeight()
  for i, drop in pairs(self._drops) do
    drop.y = drop.y + drop.speed * scaledDt
    for j = 1, drop.length do
      if math.random() < 0.1 then
        local index = math.random(1, #self._chars)
        drop.chars[j] = self._chars:sub(index, index)
      end
    end
    if drop.y > h + 50 then
      self._drops[i] = nil
    end
  end

  self:refreshRetained()
end

function MatrixRain:_buildDisplay(w, h)
  local display = {}
  local colWidth = w / math.max(1, self._cols)
  local baseColor = self._color or 0xff00ff00
  local baseR = (baseColor >> 16) & 0xff
  local baseG = (baseColor >> 8) & 0xff
  local baseB = baseColor & 0xff

  for i, drop in pairs(self._drops) do
    local colX = (i - 1) * colWidth + colWidth * 0.5
    for j = 1, drop.length do
      local charY = drop.y - (j - 1) * self._charSize
      if charY > -self._charSize and charY < h then
        local brightness = 1 - (j - 1) / drop.length
        local alpha = math.floor(brightness * 255)
        local r = math.floor(baseR * brightness)
        local g = math.floor(baseG * brightness)
        local b = math.floor(baseB * brightness)
        display[#display + 1] = {
          cmd = "drawText",
          x = math.floor(colX - self._charSize * 0.5 + 0.5),
          y = math.floor(charY + 0.5),
          w = self._charSize,
          h = self._charSize,
          color = Visual.argb(alpha, r, g, b),
          text = tostring(drop.chars[j] or " "),
          fontSize = self._charSize,
          align = "center",
        }
      end
    end
  end

  return display
end

function MatrixRain:onDraw(w, h)
  Visual.renderDisplayList(self:_buildDisplay(w, h))
end

function MatrixRain:_syncRetained(w, h)
  local bw, bh = Visual.boundsSize(self.node)
  w = math.max(1, math.floor(tonumber(w) or bw or 0))
  h = math.max(1, math.floor(tonumber(h) or bh or 0))
  Visual.setTransparentStyle(self.node)
  self.node:setDisplayList(self:_buildDisplay(w, h))
end

return MatrixRain
