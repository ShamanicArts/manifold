local BaseWidget = require("widgets.base")
local projectRoot = tostring((_G and _G.__experimentalProjectRoot) or "")
local visualPath = projectRoot .. "/ui/widgets/visual_utils.lua"
local visualChunk, visualLoadErr = loadfile(visualPath)
if not visualChunk then
  error("failed to load experimental visual utils: " .. tostring(visualLoadErr))
end
local Visual = visualChunk()

local WaveformRing = BaseWidget:extend()

local function copyLayers(layers)
  local out = {}
  if type(layers) ~= "table" then
    return out
  end
  for i = 1, #layers do
    local layer = layers[i]
    if type(layer) == "table" then
      out[i] = {
        state = layer.state,
        speed = layer.speed,
        volume = layer.volume,
        reversed = layer.reversed,
      }
    end
  end
  return out
end

function WaveformRing.new(parent, name, config)
  local self = setmetatable(BaseWidget.new(parent, name, config or {}), WaveformRing)
  self._renderState = {
    animTime = 0,
    viewState = { layers = {} },
  }

  if self.node and self.node.setInterceptsMouse then
    self.node:setInterceptsMouse(false, false)
  end

  self:_storeEditorMeta("ExperimentalWaveformRing", {}, {})
  self:refreshRetained()
  return self
end

function WaveformRing:setRenderState(renderState)
  local state = renderState or {}
  local viewState = state.viewState or {}
  self._renderState = {
    animTime = tonumber(state.animTime) or 0,
    viewState = {
      layers = copyLayers(viewState.layers),
    },
  }
  self:refreshRetained()
  if self.node and self.node.repaint then
    self.node:repaint()
  end
end

function WaveformRing:_buildDisplay(w, h)
  local display = {}
  local cx = w * 0.5
  local cy = h * 0.5
  local radius = math.min(w, h) * 0.4
  local animTime = self._renderState.animTime or 0
  local layers = (self._renderState.viewState or {}).layers or {}
  local points = 60

  display[#display + 1] = {
    cmd = "fillRoundedRect",
    x = math.floor(cx - radius + 0.5),
    y = math.floor(cy - radius + 0.5),
    w = math.floor(radius * 2 + 0.5),
    h = math.floor(radius * 2 + 0.5),
    radius = radius,
    color = 0x051015,
  }

  for i = 0, points - 1 do
    local angle1 = (i / points) * math.pi * 2
    local angle2 = ((i + 1) / points) * math.pi * 2
    local audioSample = 0

    for j = 1, #layers do
      local layer = layers[j]
      if layer and layer.state == "playing" then
        audioSample = audioSample + math.sin(animTime * 5 + angle1 * 3) * 0.4
      end
    end

    if audioSample == 0 then
      audioSample = math.sin(angle1 * 6 + animTime * 3) * 0.2
    end

    local ringRadius = radius * (0.8 + audioSample * 0.3)
    local x1 = cx + math.cos(angle1) * ringRadius
    local y1 = cy + math.sin(angle1) * ringRadius
    local x2 = cx + math.cos(angle2) * ringRadius
    local y2 = cy + math.sin(angle2) * ringRadius
    local hue = (i / points + animTime * 0.1) % 1
    local r, g, b = Visual.hsvToRgb(hue, 0.9, 1.0)

    display[#display + 1] = {
      cmd = "drawLine",
      x1 = x1,
      y1 = y1,
      x2 = x2,
      y2 = y2,
      thickness = 3,
      color = Visual.argb(220, r, g, b),
    }
  end

  display[#display + 1] = {
    cmd = "fillRoundedRect",
    x = math.floor(cx - 4 + 0.5),
    y = math.floor(cy - 4 + 0.5),
    w = 8,
    h = 8,
    radius = 4,
    color = 0xffffffff,
  }

  return display
end

function WaveformRing:onDraw(w, h)
  Visual.renderDisplayList(self:_buildDisplay(w, h))
end

function WaveformRing:_syncRetained(w, h)
  local bw, bh = Visual.boundsSize(self.node)
  w = math.max(1, math.floor(tonumber(w) or bw or 0))
  h = math.max(1, math.floor(tonumber(h) or bh or 0))
  Visual.setTransparentStyle(self.node)
  self.node:setDisplayList(self:_buildDisplay(w, h))
end

return WaveformRing
