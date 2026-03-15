-- knob.lua
-- Rotary knob widget

local BaseWidget = require("widgets.base")
local Utils = require("widgets.utils")
local Schema = require("widgets.schema")

local Knob = BaseWidget:extend()

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

local function pushLine(display, x1, y1, x2, y2, colour, thickness)
    display[#display + 1] = {
        cmd = "drawLine",
        x1 = x1,
        y1 = y1,
        x2 = x2,
        y2 = y2,
        thickness = thickness or 1.0,
        color = colour,
    }
end

local function pushCircle(display, cx, cy, radius, colour, segments, thickness)
    segments = segments or 56
    local px = cx + radius
    local py = cy
    for i = 1, segments do
        local t = (i / segments) * math.pi * 2.0
        local x = cx + math.cos(t) * radius
        local y = cy + math.sin(t) * radius
        pushLine(display, px, py, x, y, colour, thickness)
        px, py = x, y
    end
end

local function pushArc(display, cx, cy, radius, startAngle, endAngle, colour, segments, thickness)
    segments = segments or 56
    local span = endAngle - startAngle
    local prevX = nil
    local prevY = nil
    for i = 0, segments do
        local angle = startAngle + (i / segments) * span
        local rad = math.rad(angle - 90)
        local x = cx + math.cos(rad) * radius
        local y = cy + math.sin(rad) * radius
        if prevX ~= nil then
            pushLine(display, prevX, prevY, x, y, colour, thickness)
        end
        prevX, prevY = x, y
    end
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

    self._startAngle = -135
    self._endAngle = 135

    self:_storeEditorMeta("Knob", {
        on_change = self._onChange
    }, Schema.buildEditorSchema("Knob", config))

    self:_syncRetained()

    return self
end

function Knob:onMouseDown(mx, my)
    self._dragging = true
    self._dragStartY = my
    self._dragStartValue = self._value
    self:_syncRetained()
    self.node:repaint()
end

function Knob:onMouseDrag(mx, my, dx, dy)
    if not self._dragging then return end
    local range = self._max - self._min
    local delta = (-dy / 150.0) * range
    local newVal = Utils.clamp(Utils.snapToStep(self._dragStartValue + delta, self._step), self._min, self._max)
    updateValue(self, newVal)
end

function Knob:onMouseUp(mx, my)
    self._dragging = false
    self:_syncRetained()
    self.node:repaint()
end

function Knob:onDoubleClick()
    if self._value ~= self._defaultValue then
        updateValue(self, self._defaultValue)
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

local function getTextLayout(w, h)
    local compact = (w < 52) or (h < 52)
    if compact then
        local valueY = math.floor(h * 0.60)
        local labelY = math.floor(h * 0.78)
        return {
            compact = true,
            valueY = valueY,
            valueH = math.max(8, math.floor(h * 0.16)),
            valueFont = 8.0,
            labelY = labelY,
            labelH = math.max(8, h - labelY - 1),
            labelFont = 7.0,
        }
    end

    return {
        compact = false,
        valueY = math.floor(h * 0.72),
        valueH = math.max(8, math.floor(h * 0.14)),
        valueFont = 11.0,
        labelY = math.floor(h * 0.86),
        labelH = math.max(8, math.floor(h * 0.14)),
        labelFont = 10.0,
    }
end

function Knob:drawValueText(w, h)
    local valText
    local v = tonumber(self._value) or 0
    if self._step >= 1 then
        valText = tostring(math.floor(v + 0.5)) .. self._suffix
    elseif w < 52 or h < 52 then
        valText = string.format("%.1f", v) .. self._suffix
    else
        valText = string.format("%.2f", v) .. self._suffix
    end
    local layout = getTextLayout(w, h)
    gfx.setColour(0xffcbd5e1)
    gfx.setFont(layout.valueFont)
    gfx.drawText(valText, 0, layout.valueY, w, layout.valueH, Justify.centred)
end

function Knob:drawLabelText(w, h)
    local layout = getTextLayout(w, h)
    gfx.setColour(0xff94a3b8)
    gfx.setFont(layout.labelFont)
    gfx.drawText(self._label, 0, layout.labelY, w, layout.labelH, Justify.centred)
end

function Knob:_syncRetained(w, h)
    local bw, bh = boundsSize(self.node)
    w = w or bw
    h = h or bh

    local cx = w / 2
    local cy = h * 0.42
    local radius = math.min(w, h) * 0.32
    local t = (self._value - self._min) / math.max(0.001, self._max - self._min)
    local arcEnd = self._startAngle + t * (self._endAngle - self._startAngle)
    local trackColour = Utils.darken(self._bg, 18)
    local glowColour = (0x22 << 24) | (self._colour & 0x00ffffff)
    local outer = radius * 1.02
    local inner = radius * 0.66
    local arcOuter = radius * 0.96
    local arcMid = radius * 0.91
    local arcInner = radius * 0.86

    local display = {}

    pushCircle(display, cx, cy, outer, Utils.darken(self._bg, 6), 64, 1.0)
    pushCircle(display, cx, cy, outer - 1.0, self._bg, 64, 1.0)
    pushCircle(display, cx, cy, inner, Utils.brighten(self._bg, 6), 56, 1.0)

    pushArc(display, cx, cy, arcOuter, self._startAngle, self._endAngle, trackColour, 64, 1.0)
    pushArc(display, cx, cy, arcMid, self._startAngle, self._endAngle, trackColour, 64, 1.0)
    pushArc(display, cx, cy, arcInner, self._startAngle, self._endAngle, trackColour, 64, 1.0)

    if arcEnd > self._startAngle then
        pushArc(display, cx, cy, arcOuter + 1.0, self._startAngle, arcEnd, glowColour, 64, 1.0)
        pushArc(display, cx, cy, arcOuter, self._startAngle, arcEnd, self._colour, 64, 1.0)
        pushArc(display, cx, cy, arcMid, self._startAngle, arcEnd, self._colour, 64, 1.0)
        pushArc(display, cx, cy, arcInner, self._startAngle, arcEnd, Utils.brighten(self._colour, 18), 64, 1.0)
    end

    local pointerRadius = radius * 0.78
    local rad = math.rad(arcEnd - 90)
    local px = cx + math.cos(rad) * pointerRadius
    local py = cy + math.sin(rad) * pointerRadius
    local ix = cx + math.cos(rad) * (pointerRadius * 0.25)
    local iy = cy + math.sin(rad) * (pointerRadius * 0.25)
    pushLine(display, ix, iy, px, py, 0x55ffffff, 1.0)
    pushLine(display, ix + 0.5, iy + 0.5, px + 0.5, py + 0.5, 0xffe2e8f0, 1.0)

    display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = px - 2.5,
        y = py - 2.5,
        w = 5,
        h = 5,
        radius = 2.5,
        color = 0xffe2e8f0,
    }
    display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = cx - 4,
        y = cy - 4,
        w = 8,
        h = 8,
        radius = 4,
        color = Utils.brighten(self._bg, 14),
    }

    local v = tonumber(self._value) or 0
    local valText
    if self._step >= 1 then
        valText = tostring(math.floor(v + 0.5)) .. self._suffix
    elseif w < 52 or h < 52 then
        valText = string.format("%.1f", v) .. self._suffix
    else
        valText = string.format("%.2f", v) .. self._suffix
    end

    local layout = getTextLayout(w, h)

    display[#display + 1] = {
        cmd = "drawText",
        x = 0,
        y = layout.valueY,
        w = w,
        h = layout.valueH,
        color = 0xffcbd5e1,
        text = valText,
        fontSize = layout.valueFont,
        align = "center",
        valign = "middle",
    }
    display[#display + 1] = {
        cmd = "drawText",
        x = 0,
        y = layout.labelY,
        w = w,
        h = layout.labelH,
        color = 0xff94a3b8,
        text = self._label,
        fontSize = layout.labelFont,
        align = "center",
        valign = "middle",
    }

    setTransparentStyle(self.node)
    self.node:setDisplayList(display)
end

function Knob:getValue()
    return self._value
end

function Knob:setValue(v)
    local newValue = Utils.clamp(v, self._min, self._max)
    updateValue(self, newValue)
end

return Knob
