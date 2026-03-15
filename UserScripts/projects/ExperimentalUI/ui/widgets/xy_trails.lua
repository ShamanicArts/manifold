local BaseWidget = require("widgets.base")
local projectRoot = tostring((_G and _G.__experimentalProjectRoot) or "")
local visualPath = projectRoot .. "/ui/widgets/visual_utils.lua"
local visualChunk, visualLoadErr = loadfile(visualPath)
if not visualChunk then
  error("failed to load experimental visual utils: " .. tostring(visualLoadErr))
end
local Visual = visualChunk()

local XYTrails = BaseWidget:extend()

function XYTrails.new(parent, name, config)
  local self = setmetatable(BaseWidget.new(parent, name, config or {}), XYTrails)
  self._x = tonumber(config and config.x) or 0.5
  self._y = tonumber(config and config.y) or 0.5
  self._dragging = false
  self._trails = {}
  self._maxTrails = math.max(8, math.floor(tonumber(config and config.maxTrails) or 50))
  self._onChange = config and (config.on_change or config.onChange) or nil
  self._oscPath = "/experimental/xy"
  self._minValue = 0
  self._maxValue = 1
  self._deadZone = 0

  self:_storeEditorMeta("ExperimentalXYTrails", {
    on_change = self._onChange,
  }, {})

  self:exposeParams({
    { path = "oscPath", label = "OSC Path", type = "text", group = "OSC" },
    { path = "minValue", label = "Min Value", type = "number", min = -1000, max = 1000, step = 0.1, group = "OSC" },
    { path = "maxValue", label = "Max Value", type = "number", min = -1000, max = 1000, step = 0.1, group = "OSC" },
    { path = "deadZone", label = "Dead Zone", type = "number", min = 0, max = 0.5, step = 0.01, group = "OSC" },
  })

  self:refreshRetained()
  return self
end

function XYTrails:getValues()
  return self._x, self._y
end

function XYTrails:setValues(x, y)
  self._x = Visual.clamp(tonumber(x) or 0.5, 0, 1)
  self._y = Visual.clamp(tonumber(y) or 0.5, 0, 1)
  self:refreshRetained()
  if self.node and self.node.repaint then
    self.node:repaint()
  end
end

function XYTrails:onMouseDown(mx, my)
  self._dragging = true
  self:_updateFromMouse(mx, my)
end

function XYTrails:onMouseDrag(mx, my)
  if self._dragging then
    self:_updateFromMouse(mx, my)
  end
end

function XYTrails:onMouseUp()
  self._dragging = false
end

function XYTrails:_updateFromMouse(mx, my)
  local w = self.node:getWidth()
  local h = self.node:getHeight()
  self._x = Visual.clamp(((tonumber(mx) or 0) - 20) / math.max(1, w - 40), 0, 1)
  self._y = Visual.clamp(((tonumber(my) or 0) - 20) / math.max(1, h - 40), 0, 1)

  self._trails[#self._trails + 1] = { x = self._x, y = self._y, life = 1.0 }
  while #self._trails > self._maxTrails do
    table.remove(self._trails, 1)
  end

  self:refreshRetained(w, h)
  if self.node and self.node.repaint then
    self.node:repaint()
  end

  if self._onChange then
    self._onChange(self._x, self._y)
  end
end

function XYTrails:updateTrails(dt)
  local delta = tonumber(dt) or 0
  for i = #self._trails, 1, -1 do
    local trail = self._trails[i]
    trail.life = trail.life - delta * 2
    if trail.life <= 0 then
      table.remove(self._trails, i)
    end
  end
  self:refreshRetained()
end

function XYTrails:_buildDisplay(w, h)
  local display = {}
  local drawW = math.max(1, w - 40)
  local drawH = math.max(1, h - 40)

  display[#display + 1] = { cmd = "fillRoundedRect", x = 20, y = 20, w = drawW, h = drawH, radius = 8, color = 0x1a1f2e }

  for i = 1, 4 do
    local gx = 20 + (drawW / 5) * i
    local gy = 20 + (drawH / 5) * i
    display[#display + 1] = { cmd = "drawLine", x1 = gx, y1 = 20, x2 = gx, y2 = 20 + drawH, thickness = 1, color = 0x30354a }
    display[#display + 1] = { cmd = "drawLine", x1 = 20, y1 = gy, x2 = 20 + drawW, y2 = gy, thickness = 1, color = 0x30354a }
  end

  local cx = 20 + drawW * 0.5
  local cy = 20 + drawH * 0.5
  display[#display + 1] = { cmd = "drawLine", x1 = cx, y1 = 20, x2 = cx, y2 = 20 + drawH, thickness = 1, color = 0x50556a }
  display[#display + 1] = { cmd = "drawLine", x1 = 20, y1 = cy, x2 = 20 + drawW, y2 = cy, thickness = 1, color = 0x50556a }

  for i = 1, #self._trails do
    local trail = self._trails[i]
    local tx = 20 + trail.x * drawW
    local ty = 20 + trail.y * drawH
    local size = 4 + (1 - i / math.max(1, #self._trails)) * 8
    local alpha = math.floor((trail.life or 0) * 150)
    local hue = i / math.max(1, #self._trails)
    local r, g, b = Visual.hsvToRgb(hue, 0.9, 1.0)
    display[#display + 1] = {
      cmd = "fillRoundedRect",
      x = math.floor(tx - size / 2 + 0.5),
      y = math.floor(ty - size / 2 + 0.5),
      w = math.floor(size + 0.5),
      h = math.floor(size + 0.5),
      radius = size / 2,
      color = Visual.argb(alpha, r, g, b),
    }
  end

  local px = 20 + self._x * drawW
  local py = 20 + self._y * drawH
  for i = 3, 1, -1 do
    local glowSize = 8 + i * 4
    local alpha = 50 - i * 15
    display[#display + 1] = {
      cmd = "fillRoundedRect",
      x = math.floor(px - glowSize / 2 + 0.5),
      y = math.floor(py - glowSize / 2 + 0.5),
      w = math.floor(glowSize + 0.5),
      h = math.floor(glowSize + 0.5),
      radius = glowSize / 2,
      color = Visual.argb(alpha, 255, 68, 0),
    }
  end

  display[#display + 1] = { cmd = "fillRoundedRect", x = math.floor(px - 6 + 0.5), y = math.floor(py - 6 + 0.5), w = 12, h = 12, radius = 6, color = 0xffff8800 }
  display[#display + 1] = { cmd = "fillRoundedRect", x = math.floor(px - 3 + 0.5), y = math.floor(py - 3 + 0.5), w = 6, h = 6, radius = 3, color = 0xffffffff }
  display[#display + 1] = { cmd = "drawText", x = 20, y = h - 18, w = drawW, h = 16, color = 0xffffffff, text = string.format("X: %.2f  Y: %.2f", self._x, self._y), fontSize = 11.0, align = "center" }

  return display
end

function XYTrails:onDraw(w, h)
  Visual.renderDisplayList(self:_buildDisplay(w, h))
end

function XYTrails:_syncRetained(w, h)
  local bw, bh = Visual.boundsSize(self.node)
  w = math.max(1, math.floor(tonumber(w) or bw or 0))
  h = math.max(1, math.floor(tonumber(h) or bh or 0))
  Visual.setTransparentStyle(self.node)
  self.node:setDisplayList(self:_buildDisplay(w, h))
end

return XYTrails
