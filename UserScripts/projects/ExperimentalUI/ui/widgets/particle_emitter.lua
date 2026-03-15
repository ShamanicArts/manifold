local BaseWidget = require("widgets.base")
local projectRoot = tostring((_G and _G.__experimentalProjectRoot) or "")
local visualPath = projectRoot .. "/ui/widgets/visual_utils.lua"
local visualChunk, visualLoadErr = loadfile(visualPath)
if not visualChunk then
  error("failed to load experimental visual utils: " .. tostring(visualLoadErr))
end
local Visual = visualChunk()

local ParticleEmitter = BaseWidget:extend()

local function randomRange(minV, maxV)
  return (tonumber(minV) or 0) + math.random() * ((tonumber(maxV) or 0) - (tonumber(minV) or 0))
end

local function newChannel(maxParticles)
  return {
    particles = {},
    maxParticles = maxParticles or 200,
  }
end

local function emitParticle(channel, x, y, config)
  if #channel.particles >= channel.maxParticles then
    table.remove(channel.particles, 1)
  end

  local angle = randomRange(0, math.pi * 2)
  local speed = randomRange(config.minSpeed or 50, config.maxSpeed or 200)
  channel.particles[#channel.particles + 1] = {
    x = tonumber(x) or 0,
    y = tonumber(y) or 0,
    vx = math.cos(angle) * speed,
    vy = math.sin(angle) * speed,
    life = 1.0,
    decay = randomRange(config.minDecay or 0.5, config.maxDecay or 2.0),
    size = randomRange(config.minSize or 2, config.maxSize or 8),
    hue = tonumber(config.hue) or randomRange(0, 1),
    hueShift = tonumber(config.hueShift) or 0.1,
    gravity = tonumber(config.gravity) or 0,
    friction = tonumber(config.friction) or 0.98,
  }
end

local function updateChannel(channel, dt)
  for i = #channel.particles, 1, -1 do
    local p = channel.particles[i]
    p.vy = p.vy + p.gravity * dt
    p.vx = p.vx * p.friction
    p.vy = p.vy * p.friction
    p.x = p.x + p.vx * dt
    p.y = p.y + p.vy * dt
    p.life = p.life - p.decay * dt
    p.hue = (p.hue + p.hueShift * dt) % 1.0
    if p.life <= 0 then
      table.remove(channel.particles, i)
    end
  end
end

function ParticleEmitter.new(parent, name, config)
  local self = setmetatable(BaseWidget.new(parent, name, config or {}), ParticleEmitter)
  self._x = tonumber(config and config.x) or 0.5
  self._y = tonumber(config and config.y) or 0.5
  self._dragging = false
  self._primary = newChannel(150)
  self._secondary = newChannel(80)

  self._minSpeed = 80
  self._maxSpeed = 250
  self._minSize = 2
  self._maxSize = 10
  self._hue = 0.0
  self._hueShift = 0.3
  self._gravity = 50
  self._animTime = 0

  self:_storeEditorMeta("ExperimentalParticleEmitter", {}, {})
  self:exposeParams({
    { path = "minSpeed", label = "Min Speed", type = "number", min = 10, max = 500, step = 10, group = "Particles" },
    { path = "maxSpeed", label = "Max Speed", type = "number", min = 10, max = 1000, step = 10, group = "Particles" },
    { path = "minSize", label = "Min Size", type = "number", min = 1, max = 20, step = 1, group = "Particles" },
    { path = "maxSize", label = "Max Size", type = "number", min = 1, max = 50, step = 1, group = "Particles" },
    { path = "hue", label = "Hue", type = "number", min = 0, max = 1, step = 0.01, group = "Particles" },
    { path = "hueShift", label = "Hue Shift", type = "number", min = 0, max = 1, step = 0.01, group = "Particles" },
    { path = "gravity", label = "Gravity", type = "number", min = -200, max = 500, step = 10, group = "Particles" },
  })

  self:refreshRetained()
  return self
end

function ParticleEmitter:onMouseDown(mx, my)
  self._dragging = true
  self:_emitFromMouse(mx, my, false)
end

function ParticleEmitter:onMouseDrag(mx, my)
  if self._dragging then
    self:_emitFromMouse(mx, my, true)
  end
end

function ParticleEmitter:onMouseUp()
  self._dragging = false
end

function ParticleEmitter:_emitFromMouse(mx, my, animateHue)
  local w = self.node:getWidth()
  local h = self.node:getHeight()
  local margin = 20
  self._x = Visual.clamp(((tonumber(mx) or 0) - margin) / math.max(1, w - margin * 2), 0, 1)
  self._y = Visual.clamp(((tonumber(my) or 0) - margin) / math.max(1, h - margin * 2), 0, 1)

  local hue = tonumber(self._hue) or 0
  if animateHue then
    hue = (hue + ((self._animTime or 0) * 0.1 % 1.0)) % 1.0
  end

  emitParticle(self._primary, mx, my, {
    minSpeed = self._minSpeed,
    maxSpeed = self._maxSpeed,
    minSize = self._minSize,
    maxSize = self._maxSize,
    hue = hue,
    hueShift = self._hueShift,
    gravity = self._gravity,
  })

  self:refreshRetained()
  if self.node and self.node.repaint then
    self.node:repaint()
  end
end

function ParticleEmitter:update(dt)
  local delta = tonumber(dt) or 0
  updateChannel(self._primary, delta)
  updateChannel(self._secondary, delta)
  self:refreshRetained()
end

function ParticleEmitter:setAnimTime(t)
  self._animTime = tonumber(t) or 0
end

function ParticleEmitter:emitPrimary(x, y, config)
  emitParticle(self._primary, x, y, config or {})
  self:refreshRetained()
end

function ParticleEmitter:emitSecondary(x, y, config)
  emitParticle(self._secondary, x, y, config or {})
  self:refreshRetained()
end

function ParticleEmitter:_buildDisplay(w, h)
  local display = {
    { cmd = "fillRoundedRect", x = 0, y = 0, w = w, h = h, radius = 6, color = 0x101520 },
  }

  local function appendChannel(channel, alphaScale, sat, value)
    for i = 1, #(channel.particles or {}) do
      local p = channel.particles[i]
      local r, g, b = Visual.hsvToRgb(p.hue, sat, value)
      local alpha = math.floor((p.life or 0) * alphaScale)
      local size = (p.size or 0) * (p.life or 0)
      display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = math.floor((p.x or 0) - size / 2 + 0.5),
        y = math.floor((p.y or 0) - size / 2 + 0.5),
        w = math.max(1, math.floor(size + 0.5)),
        h = math.max(1, math.floor(size + 0.5)),
        radius = math.max(0.5, size / 2),
        color = Visual.argb(alpha, r, g, b),
      }
    end
  end

  appendChannel(self._secondary, 120, 0.5, 0.85)
  appendChannel(self._primary, 200, 0.8, 1.0)

  display[#display + 1] = { cmd = "drawText", x = 0, y = h - 20, w = w, h = 16, color = 0x6094a3b8, text = "Click & drag to emit particles", fontSize = 10.0, align = "center" }
  display[#display + 1] = { cmd = "drawText", x = 8, y = 8, w = 140, h = 14, color = 0xffffffff, text = "Particles: " .. tostring(#self._primary.particles + #self._secondary.particles), fontSize = 9.0, align = "left" }

  return display
end

function ParticleEmitter:onDraw(w, h)
  Visual.renderDisplayList(self:_buildDisplay(w, h))
end

function ParticleEmitter:_syncRetained(w, h)
  local bw, bh = Visual.boundsSize(self.node)
  w = math.max(1, math.floor(tonumber(w) or bw or 0))
  h = math.max(1, math.floor(tonumber(h) or bh or 0))
  Visual.setTransparentStyle(self.node)
  self.node:setDisplayList(self:_buildDisplay(w, h))
end

return ParticleEmitter
