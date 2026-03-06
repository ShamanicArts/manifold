-- knob.lua
-- Rotary knob widget

local BaseWidget = require("widgets.base")
local Utils = require("widgets.utils")
local Schema = require("widgets.schema")

local Knob = BaseWidget:extend()

function Knob.new(parent, name, config)
    local self = setmetatable(BaseWidget.new(parent, name, config), Knob)

    self._min = config.min or 0
    self._max = config.max or 1
    self._step = config.step or 0
    self._value = Utils.clamp(config.value or self._min, self._min, self._max)
    self._defaultValue = config.defaultValue or self._value
    self._label = config.label or ""
    self._suffix = config.suffix or ""
    self._colour = Utils.colour(config.colour, 0xff22d3ee)
    self._bg = Utils.colour(config.bg, 0xff1e293b)
    self._onChange = config.on_change or config.onChange
    self._dragging = false
    self._dragStartY = 0
    self._dragStartValue = 0

    -- Arc angles: -135° to +135°
    self._startAngle = -135
    self._endAngle = 135

    self:_storeEditorMeta("Knob", {
        on_change = self._onChange
    }, Schema.buildEditorSchema("Knob", config))

    return self
end

function Knob:onMouseDown(mx, my)
    self._dragging = true
    self._dragStartY = my
    self._dragStartValue = self._value
end

function Knob:onMouseDrag(mx, my, dx, dy)
    if not self._dragging then return end
    local range = self._max - self._min
    local delta = (-dy / 150.0) * range  -- Vertical drag
    local newVal = Utils.clamp(Utils.snapToStep(self._dragStartValue + delta, self._step), self._min, self._max)
    
    if newVal ~= self._value then
        self._value = newVal
        if self._onChange then
            self._onChange(self._value)
        end
    end
end

function Knob:onMouseUp(mx, my)
    self._dragging = false
end

function Knob:onDoubleClick()
    if self._value ~= self._defaultValue then
        self._value = self._defaultValue
        if self._onChange then
            self._onChange(self._value)
        end
    end
end

local function drawCircleApprox(cx, cy, radius, colour, segments)
    segments = segments or 56
    gfx.setColour(colour)
    local px = cx + radius
    local py = cy
    for i = 1, segments do
        local t = (i / segments) * math.pi * 2.0
        local x = cx + math.cos(t) * radius
        local y = cy + math.sin(t) * radius
        gfx.drawLine(px, py, x, y)
        px, py = x, y
    end
end

local function drawArcApprox(cx, cy, radius, startAngle, endAngle, colour, segments)
    segments = segments or 56
    gfx.setColour(colour)
    local span = endAngle - startAngle
    local prevX = nil
    local prevY = nil
    for i = 0, segments do
        local angle = startAngle + (i / segments) * span
        local rad = math.rad(angle - 90)
        local x = cx + math.cos(rad) * radius
        local y = cy + math.sin(rad) * radius
        if prevX ~= nil then
            gfx.drawLine(prevX, prevY, x, y)
        end
        prevX, prevY = x, y
    end
end

function Knob:onDraw(w, h)
    local cx = w / 2
    local cy = h * 0.42
    local radius = math.min(w, h) * 0.32

    local t = (self._value - self._min) / math.max(0.001, self._max - self._min)
    local arcEnd = self._startAngle + t * (self._endAngle - self._startAngle)

    self:drawBackground(cx, cy, radius)
    self:drawArc(cx, cy, radius, arcEnd)
    self:drawPointer(cx, cy, radius * 0.78, arcEnd)
    self:drawValueText(w, h)
    self:drawLabelText(w, h)
end

function Knob:drawBackground(cx, cy, radius)
    local outer = radius * 1.02
    local inner = radius * 0.66
    drawCircleApprox(cx, cy, outer, Utils.darken(self._bg, 6), 64)
    drawCircleApprox(cx, cy, outer - 1.0, self._bg, 64)
    drawCircleApprox(cx, cy, inner, Utils.brighten(self._bg, 6), 56)
end

function Knob:drawArc(cx, cy, radius, endAngle)
    local trackColour = Utils.darken(self._bg, 18)
    local glowColour = (0x22 << 24) | (self._colour & 0x00ffffff)
    local outer = radius * 0.96
    local mid = radius * 0.91
    local inner = radius * 0.86

    drawArcApprox(cx, cy, outer, self._startAngle, self._endAngle, trackColour, 64)
    drawArcApprox(cx, cy, mid, self._startAngle, self._endAngle, trackColour, 64)
    drawArcApprox(cx, cy, inner, self._startAngle, self._endAngle, trackColour, 64)

    if endAngle > self._startAngle then
        drawArcApprox(cx, cy, outer + 1.0, self._startAngle, endAngle, glowColour, 64)
        drawArcApprox(cx, cy, outer, self._startAngle, endAngle, self._colour, 64)
        drawArcApprox(cx, cy, mid, self._startAngle, endAngle, self._colour, 64)
        drawArcApprox(cx, cy, inner, self._startAngle, endAngle, Utils.brighten(self._colour, 18), 64)
    end
end

function Knob:drawPointer(cx, cy, radius, angle)
    local rad = math.rad(angle - 90)
    local px = cx + math.cos(rad) * radius
    local py = cy + math.sin(rad) * radius
    local ix = cx + math.cos(rad) * (radius * 0.25)
    local iy = cy + math.sin(rad) * (radius * 0.25)
    gfx.setColour(0x55ffffff)
    gfx.drawLine(ix, iy, px, py)
    gfx.setColour(0xffe2e8f0)
    gfx.drawLine(ix + 0.5, iy + 0.5, px + 0.5, py + 0.5)
    gfx.fillRoundedRect(px - 2.5, py - 2.5, 5, 5, 2.5)
    gfx.setColour(Utils.brighten(self._bg, 14))
    gfx.fillRoundedRect(cx - 4, cy - 4, 8, 8, 4)
end

function Knob:drawValueText(w, h)
    local valText
    local v = tonumber(self._value) or 0
    if self._step >= 1 then
        valText = tostring(math.floor(v + 0.5)) .. self._suffix
    else
        valText = string.format("%.2f", v) .. self._suffix
    end
    gfx.setColour(0xffcbd5e1)
    gfx.setFont(11.0)
    gfx.drawText(valText, 0, math.floor(h * 0.72), w, math.floor(h * 0.14), Justify.centred)
end

function Knob:drawLabelText(w, h)
    gfx.setColour(0xff94a3b8)
    gfx.setFont(10.0)
    gfx.drawText(self._label, 0, math.floor(h * 0.86), w, math.floor(h * 0.14), Justify.centred)
end

function Knob:getValue()
    return self._value
end

function Knob:setValue(v)
    self._value = Utils.clamp(v, self._min, self._max)
end

return Knob
