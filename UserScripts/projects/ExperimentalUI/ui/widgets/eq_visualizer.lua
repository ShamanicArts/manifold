local BaseWidget = require("widgets.base")
local projectRoot = tostring((_G and _G.__experimentalProjectRoot) or "")
local visualPath = projectRoot .. "/ui/widgets/visual_utils.lua"
local visualChunk, visualLoadErr = loadfile(visualPath)
if not visualChunk then
  error("failed to load experimental visual utils: " .. tostring(visualLoadErr))
end
local Visual = visualChunk()

local EQVisualizer = BaseWidget:extend()

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

function EQVisualizer.new(parent, name, config)
  local self = setmetatable(BaseWidget.new(parent, name, config or {}), EQVisualizer)
  self._bandCount = math.max(8, math.floor(tonumber(config and config.bandCount) or 32))
  self._bars = {}
  self._renderState = {
    dt = 0,
    animTime = 0,
    viewState = { spectrum = nil, layers = {} },
  }

  if self.node and self.node.setInterceptsMouse then
    self.node:setInterceptsMouse(false, false)
  end

  self:_storeEditorMeta("ExperimentalEqVisualizer", {}, {
    bandCount = self._bandCount,
  })
  self:refreshRetained()
  return self
end

function EQVisualizer:setRenderState(renderState)
  local state = renderState or {}
  local viewState = state.viewState or {}
  self._renderState = {
    dt = tonumber(state.dt) or 0,
    animTime = tonumber(state.animTime) or 0,
    viewState = {
      spectrum = type(viewState.spectrum) == "table" and viewState.spectrum or nil,
      layers = copyLayers(viewState.layers),
    },
  }

  self:_updateBars()
  self:refreshRetained()
  if self.node and self.node.repaint then
    self.node:repaint()
  end
end

function EQVisualizer:_updateBars()
  local dt = Visual.clamp(self._renderState.dt or 0, 0, 0.25)
  local animTime = self._renderState.animTime or 0
  local viewState = self._renderState.viewState or {}
  local spectrum = viewState.spectrum
  local layers = viewState.layers or {}

  for i = 1, self._bandCount do
    local bar = self._bars[i]
    if not bar then
      bar = { height = 0.08, velocity = 0 }
      self._bars[i] = bar
    end

    local target = nil
    if type(spectrum) == "table" then
      target = tonumber(spectrum[i])
    end

    if target ~= nil then
      target = Visual.clamp(target, 0, 1)
      if target > bar.height then
        bar.height = bar.height + (target - bar.height) * 0.3
      else
        bar.height = bar.height + (target - bar.height) * 0.1
      end
    else
      local timeFactor = animTime * 8 + i * 0.3
      target = math.abs(math.sin(timeFactor) * 0.5 + math.sin(timeFactor * 2.3) * 0.3 + math.sin(timeFactor * 0.7) * 0.2)
      for j = 1, #layers do
        if layers[j] and layers[j].state == "playing" then
          target = target + 0.3
          break
        end
      end
      target = Visual.clamp(target, 0.05, 0.95)
      local force = (target - bar.height) * 15
      bar.velocity = (bar.velocity + force * dt) * 0.6
      bar.height = Visual.clamp(bar.height + bar.velocity * dt, 0, 1)
    end
  end
end

function EQVisualizer:_buildDisplay(w, h)
  local display = {
    { cmd = "fillRect", x = 0, y = 0, w = w, h = h, color = 0x051015 },
  }

  local gap = 1
  local barW = math.max(1, math.floor((w - (self._bandCount - 1) * gap) / self._bandCount))
  local maxBarH = math.max(1, h - 5)

  for i = 1, self._bandCount do
    local bar = self._bars[i] or { height = 0 }
    local height = math.floor((bar.height or 0) * maxBarH)
    if height < 2 then
      height = 2
    end
    local x = (i - 1) * (barW + gap)
    local y = maxBarH - height
    local hue = 0.66 - ((bar.height or 0) * 0.66)
    local r, g, b = Visual.hsvToRgb(hue, 0.8, 1.0)
    display[#display + 1] = {
      cmd = "fillRect",
      x = x,
      y = y,
      w = barW,
      h = height,
      color = Visual.argb(240, r, g, b),
    }
  end

  return display
end

function EQVisualizer:onDraw(w, h)
  Visual.renderDisplayList(self:_buildDisplay(w, h))
end

function EQVisualizer:_syncRetained(w, h)
  local bw, bh = Visual.boundsSize(self.node)
  w = math.max(1, math.floor(tonumber(w) or bw or 0))
  h = math.max(1, math.floor(tonumber(h) or bh or 0))
  Visual.setTransparentStyle(self.node)
  self.node:setDisplayList(self:_buildDisplay(w, h))
end

return EQVisualizer
