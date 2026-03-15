-- meter.lua
-- Level meter widget

local BaseWidget = require("widgets.base")
local Utils = require("widgets.utils")
local Schema = require("widgets.schema")

local Meter = BaseWidget:extend()

function Meter.new(parent, name, config)
    local self = setmetatable(BaseWidget.new(parent, name, config), Meter)

    self._value = 0  -- 0 to 1
    self._peak = 0
    self._colour = Utils.colour(config.colour, 0xff22c55e)
    self._bg = Utils.colour(config.bg, 0xff1e293b)
    self._orientation = config.orientation or "vertical"  -- "vertical" or "horizontal"
    self._showPeak = config.showPeak ~= false
    self._decay = config.decay or 0.9

    self.node:setInterceptsMouse(false, false)

    self:_storeEditorMeta("Meter", {}, Schema.buildEditorSchema("Meter", config))
    self:_syncRetained()

    local shell = (type(_G) == "table") and _G.shell or nil
    if type(shell) == "table" and type(shell.registerAnimatedWidget) == "function" then
        shell:registerAnimatedWidget(self)
    end

    return self
end

function Meter:tickRetained(dt)
    local _ = dt
    if self._peak > self._value then
        self._peak = self._peak * self._decay
        if self._peak < self._value then
            self._peak = self._value
        end
        self:_syncRetained()
    end
end

function Meter:onDraw(w, h)
    self:tickRetained()

    if self._orientation == "vertical" then
        -- Background
        gfx.setColour(self._bg)
        gfx.fillRoundedRect(0, 0, w, h, 3)
        
        -- Level
        local fillH = h * self._value
        gfx.setColour(self._colour)
        gfx.fillRoundedRect(0, h - fillH, w, fillH, 3)
        
        -- Peak marker
        if self._showPeak and self._peak > 0.01 then
            local peakY = h * (1 - self._peak)
            gfx.setColour(0xffff0000)
            gfx.fillRect(0, peakY - 1, w, 2)
        end
    else
        -- Background
        gfx.setColour(self._bg)
        gfx.fillRoundedRect(0, 0, w, h, 3)
        
        -- Level
        local fillW = w * self._value
        gfx.setColour(self._colour)
        gfx.fillRoundedRect(0, 0, fillW, h, 3)
        
        -- Peak marker
        if self._showPeak and self._peak > 0.01 then
            local peakX = w * self._peak
            gfx.setColour(0xffff0000)
            gfx.fillRect(peakX - 1, 0, 2, h)
        end
    end
end

function Meter:_syncRetained(w, h)
    local _, _, bw, bh = self.node:getBounds()
    w = w or bw or 0
    h = h or bh or 0

    local display = {
        {
            cmd = "fillRoundedRect",
            x = 0,
            y = 0,
            w = w,
            h = h,
            radius = 3,
            color = self._bg,
        }
    }

    if self._orientation == "vertical" then
        local fillH = math.floor(h * self._value + 0.5)
        if fillH > 0 then
            display[#display + 1] = {
                cmd = "fillRoundedRect",
                x = 0,
                y = math.max(0, h - fillH),
                w = w,
                h = fillH,
                radius = 3,
                color = self._colour,
            }
        end
        if self._showPeak and self._peak > 0.01 then
            local peakY = math.floor(h * (1 - self._peak) + 0.5)
            display[#display + 1] = {
                cmd = "fillRect",
                x = 0,
                y = math.max(0, peakY - 1),
                w = w,
                h = 2,
                color = 0xffff0000,
            }
        end
    else
        local fillW = math.floor(w * self._value + 0.5)
        if fillW > 0 then
            display[#display + 1] = {
                cmd = "fillRoundedRect",
                x = 0,
                y = 0,
                w = fillW,
                h = h,
                radius = 3,
                color = self._colour,
            }
        end
        if self._showPeak and self._peak > 0.01 then
            local peakX = math.floor(w * self._peak + 0.5)
            display[#display + 1] = {
                cmd = "fillRect",
                x = math.max(0, peakX - 1),
                y = 0,
                w = 2,
                h = h,
                color = 0xffff0000,
            }
        end
    end

    self.node:setStyle({
        bg = 0x00000000,
        border = 0x00000000,
        borderWidth = 0,
        radius = 0,
        opacity = 1.0
    })
    self.node:setDisplayList(display)
end

function Meter:setValue(v)
    local nextValue = Utils.clamp(v, 0, 1)
    local nextPeak = self._peak
    if nextValue > nextPeak then
        nextPeak = nextValue
    end
    if self._value == nextValue and self._peak == nextPeak then
        return
    end
    self._value = nextValue
    self._peak = nextPeak
    self:_syncRetained()
    self.node:repaint()
end

function Meter:cleanup()
    local shell = (type(_G) == "table") and _G.shell or nil
    if type(shell) == "table" and type(shell.unregisterAnimatedWidget) == "function" then
        shell:unregisterAnimatedWidget(self)
    end
end

return Meter
