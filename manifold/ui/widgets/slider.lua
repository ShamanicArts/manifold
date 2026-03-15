-- slider.lua
-- Horizontal and vertical slider widgets

local BaseWidget = require("widgets.base")
local Utils = require("widgets.utils")
local Schema = require("widgets.schema")

local function boundsSize(node)
    local _, _, w, h = node:getBounds()
    return w or 0, h or 0
end

local function setTransparentStyle(node)
    node:setStyle({
        bg = 0x00000000,
        border = 0x00000000,
        borderWidth = 0,
        radius = 0,
        opacity = 1.0,
    })
end

local function updateValue(self, newValue)
    if newValue == self._value then
        return
    end
    self._value = newValue
    self:_syncRetained()
    self.node:repaint()
    if self._onChange then
        self._onChange(self._value)
    end
end

local function buildHorizontalDisplayList(self, w, h)
    local trackY = h * 0.5 - 3
    local trackH = 6
    local trackR = 3
    local trackX = 8
    local trackW = math.max(1, w - 16)
    local t = (self._value - self._min) / math.max(0.001, self._max - self._min)
    local thumbX = trackX + t * trackW - 6
    local thumbColour = self._colour
    if self._dragging then
        thumbColour = Utils.brighten(thumbColour, 30)
    elseif self:isHovered() then
        thumbColour = Utils.brighten(thumbColour, 15)
    end

    local display = {
        {
            cmd = "fillRoundedRect",
            x = trackX,
            y = trackY,
            w = trackW,
            h = trackH,
            radius = trackR,
            color = self._bg,
        },
        {
            cmd = "fillRoundedRect",
            x = trackX,
            y = trackY,
            w = math.max(0, math.floor(trackW * t + 0.5)),
            h = trackH,
            radius = trackR,
            color = self._colour,
        },
        {
            cmd = "fillRoundedRect",
            x = thumbX,
            y = (h - 20) / 2,
            w = 12,
            h = 20,
            radius = 4,
            color = thumbColour,
        },
    }

    if self._showValue then
        local v = tonumber(self._value) or 0
        local valText
        if self._step >= 1 then
            valText = self._label .. ": " .. tostring(math.floor(v + 0.5)) .. self._suffix
        else
            valText = self._label .. ": " .. string.format("%.2f", v) .. self._suffix
        end
        display[#display + 1] = {
            cmd = "drawText",
            x = 8,
            y = 2,
            w = math.max(0, w - 16),
            h = 20,
            color = 0xffe2e8f0,
            text = valText,
            fontSize = 11.0,
            align = "center",
            valign = "middle",
        }
    end

    return display
end

local function buildVerticalDisplayList(self, w, h)
    local trackX = 2
    local trackW = math.max(1, w - 4)
    local trackY = 4
    local trackH = math.max(1, h - 8)
    local trackR = trackW / 2
    local t = (self._value - self._min) / math.max(0.001, self._max - self._min)

    local thumbH = math.max(30, trackH * 0.3)
    local thumbW = trackW
    local maxThumbY = trackY + trackH - thumbH
    local thumbY = trackY + maxThumbY * (1 - t)

    local thumbColour = self._colour
    if self._dragging then
        thumbColour = Utils.brighten(thumbColour, 30)
    elseif self:isHovered() then
        thumbColour = Utils.brighten(thumbColour, 15)
    end

    return {
        {
            cmd = "fillRoundedRect",
            x = trackX,
            y = trackY,
            w = trackW,
            h = trackH,
            radius = trackR,
            color = self._bg,
        },
        {
            cmd = "fillRoundedRect",
            x = trackX,
            y = thumbY,
            w = thumbW,
            h = thumbH,
            radius = trackR,
            color = thumbColour,
        }
    }
end

-- ============================================================================
-- Slider (Horizontal)
-- ============================================================================

local Slider = BaseWidget:extend()

function Slider.new(parent, name, config)
    local self = setmetatable(BaseWidget.new(parent, name, config), Slider)

    self._min = config.min or 0
    self._max = config.max or 1
    self._step = config.step or 0
    self._value = Utils.clamp(config.value or self._min, self._min, self._max)
    self._defaultValue = config.defaultValue or self._value
    self._label = config.label or ""
    self._suffix = config.suffix or ""
    self._colour = Utils.colour(config.colour, 0xff38bdf8)
    self._bg = Utils.colour(config.bg, 0xff1e293b)
    self._onChange = config.on_change or config.onChange
    self._showValue = config.showValue ~= false
    self._dragging = false
    self._dragStartX = 0
    self._dragStartValue = 0

    self.node:setInterceptsMouse(true, false)

    self:_storeEditorMeta("Slider", {
        on_change = self._onChange
    }, Schema.buildEditorSchema("Slider", config))

    self:_syncRetained()

    return self
end

function Slider:onMouseDown(mx, my)
    self._dragging = true
    self._dragStartX = mx
    self._dragStartValue = self._value
    self:valueFromMouse(mx)
    self:_syncRetained()
    self.node:repaint()
end

function Slider:onMouseDrag(mx, my, dx, dy)
    if not self._dragging then return end
    self:valueFromMouse(mx)
end

function Slider:onMouseUp(mx, my)
    self._dragging = false
    self:_syncRetained()
    self.node:repaint()
end

function Slider:onDoubleClick()
    if self._value ~= self._defaultValue then
        updateValue(self, self._defaultValue)
    end
end

function Slider:valueFromMouse(mx)
    local w = select(1, boundsSize(self.node))
    local trackW = math.max(1, w - 16)
    local t = Utils.clamp((mx - 8) / trackW, 0, 1)
    local newVal = self._min + t * (self._max - self._min)
    newVal = Utils.snapToStep(newVal, self._step)
    newVal = Utils.clamp(newVal, self._min, self._max)
    updateValue(self, newVal)
end

function Slider:onDraw(w, h)
    local trackY = h * 0.5 - 3
    local trackH = 6
    local trackR = 3

    self:drawTrack(8, trackY, w - 16, trackH, trackR)

    local t = (self._value - self._min) / math.max(0.001, self._max - self._min)
    local thumbX = 8 + t * (w - 16) - 6
    self:drawThumb(thumbX, (h - 20) / 2, 12, 20)

    if self._showValue then
        local valText
        local v = tonumber(self._value) or 0
        if self._step >= 1 then
            local iv = math.floor(v + 0.5)
            valText = self._label .. ": " .. tostring(iv) .. self._suffix
        else
            valText = self._label .. ": " .. string.format("%.2f", v) .. self._suffix
        end
        gfx.setColour(0xffe2e8f0)
        gfx.setFont(11.0)
        gfx.drawText(valText, 8, 2, w - 16, 20, Justify.centred)
    end
end

function Slider:drawTrack(x, y, w, h, r)
    gfx.setColour(self._bg)
    gfx.fillRoundedRect(x, y, w, h, r)

    local t = (self._value - self._min) / math.max(0.001, self._max - self._min)
    gfx.setColour(self._colour)
    gfx.fillRoundedRect(x, y, w * t, h, r)
end

function Slider:drawThumb(x, y, w, h)
    local col = self._colour
    if self._dragging then
        col = Utils.brighten(col, 30)
    elseif self:isHovered() then
        col = Utils.brighten(col, 15)
    end
    gfx.setColour(col)
    gfx.fillRoundedRect(x, y, w, h, 4)
end

function Slider:_syncRetained(w, h)
    local bw, bh = boundsSize(self.node)
    w = w or bw
    h = h or bh
    setTransparentStyle(self.node)
    self.node:setDisplayList(buildHorizontalDisplayList(self, w, h))
end

function Slider:getValue()
    return self._value
end

function Slider:setValue(v)
    local newValue = Utils.clamp(v, self._min, self._max)
    updateValue(self, newValue)
end

function Slider:reset()
    self:setValue(self._defaultValue)
end

-- ============================================================================
-- VSlider (Vertical) - extends Slider
-- ============================================================================

local VSlider = Slider:extend()

function VSlider.new(parent, name, config)
    local self = setmetatable(Slider.new(parent, name, config), VSlider)
    self:_storeEditorMeta("VSlider", {
        on_change = self._onChange
    }, Schema.buildEditorSchema("VSlider", config))
    self:_syncRetained()
    return self
end

function VSlider:onMouseDown(mx, my)
    self._dragging = true
    self:valueFromMouse(mx, my)
    self:_syncRetained()
    self.node:repaint()
end

function VSlider:onMouseDrag(mx, my, dx, dy)
    if not self._dragging then return end
    self:valueFromMouse(mx, my)
end

function VSlider:valueFromMouse(mx, my)
    if my == nil then
        return
    end
    local _, _, _, h = self.node:getBounds()
    local trackH = math.max(1, h - 16)
    local t = 1 - Utils.clamp((my - 8) / trackH, 0, 1)
    local newVal = self._min + t * (self._max - self._min)
    newVal = Utils.snapToStep(newVal, self._step)
    newVal = Utils.clamp(newVal, self._min, self._max)
    updateValue(self, newVal)
end

function VSlider:onDraw(w, h)
    local trackX = 2
    local trackW = w - 4
    local trackY = 4
    local trackH = h - 8
    local trackR = trackW / 2

    gfx.setColour(self._bg)
    gfx.fillRoundedRect(trackX, trackY, trackW, trackH, trackR)

    local t = (self._value - self._min) / math.max(0.001, self._max - self._min)
    local thumbH = math.max(30, trackH * 0.3)
    local thumbW = trackW
    local maxThumbY = trackY + trackH - thumbH
    local thumbY = trackY + maxThumbY * (1 - t)

    local col = self._colour
    if self._dragging then
        col = Utils.brighten(col, 30)
    elseif self:isHovered() then
        col = Utils.brighten(col, 15)
    end
    gfx.setColour(col)
    gfx.fillRoundedRect(trackX, thumbY, thumbW, thumbH, trackR)
end

function VSlider:_syncRetained(w, h)
    local bw, bh = boundsSize(self.node)
    w = w or bw
    h = h or bh
    setTransparentStyle(self.node)
    self.node:setDisplayList(buildVerticalDisplayList(self, w, h))
end

return {
    Slider = Slider,
    VSlider = VSlider
}
