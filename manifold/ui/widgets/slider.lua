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
    if self._runtimeNodeOnly or not self.node or not self.node.setOnDraw then
        self:_syncRetained()
    end
    self.node:repaint()
    if self._onChange then
        self._onChange(self._value)
    end
end

local function colourBlend(a, b, t)
    t = Utils.clamp(t or 0, 0, 1)
    local aa = (a >> 24) & 0xff
    local ar = (a >> 16) & 0xff
    local ag = (a >> 8) & 0xff
    local ab = a & 0xff
    local ba = (b >> 24) & 0xff
    local br = (b >> 16) & 0xff
    local bg = (b >> 8) & 0xff
    local bb = b & 0xff
    local oa = math.floor(aa + (ba - aa) * t + 0.5)
    local orr = math.floor(ar + (br - ar) * t + 0.5)
    local og = math.floor(ag + (bg - ag) * t + 0.5)
    local ob = math.floor(ab + (bb - ab) * t + 0.5)
    return (oa << 24) | (orr << 16) | (og << 8) | ob
end

local function normalizedValue(self, value)
    local range = math.max(0.001, self._max - self._min)
    return Utils.clamp(((tonumber(value) or self._min) - self._min) / range, 0, 1)
end

local function modulationToneColour(self)
    return colourBlend(self._colour, 0xffffffff, 0.35)
end

local function modulationState(self)
    local baseValue = tonumber(self._value)
    if baseValue == nil then
        baseValue = self._min
    end
    if self._modOverlayEnabled ~= true then
        return false, baseValue, baseValue, normalizedValue(self, baseValue), normalizedValue(self, baseValue)
    end
    local effectiveValue = tonumber(self._modEffectiveValue)
    if effectiveValue == nil then
        return false, baseValue, baseValue, normalizedValue(self, baseValue), normalizedValue(self, baseValue)
    end
    effectiveValue = Utils.clamp(effectiveValue, self._min, self._max)
    local active = math.abs(effectiveValue - baseValue) > 0.0001
    return active, baseValue, effectiveValue, normalizedValue(self, baseValue), normalizedValue(self, effectiveValue)
end

local function formatValueText(self, value)
    if type(self._valueFormatter) == "function" then
        local ok, formatted = pcall(self._valueFormatter, value, self)
        if ok and formatted ~= nil then
            return tostring(formatted)
        end
    end

    local v = tonumber(value) or 0
    if self._options and #self._options > 0 then
        local idx = math.floor(v + 0.5) + 1
        return self._options[idx] or tostring(math.floor(v + 0.5))
    elseif self._step >= 1 then
        return tostring(math.floor(v + 0.5)) .. self._suffix
    elseif math.abs(v) >= 1000 then
        return string.format("%.0f", v) .. self._suffix
    elseif math.abs(v) >= 100 then
        return string.format("%.1f", v) .. self._suffix
    else
        return string.format("%.2f", v) .. self._suffix
    end
end

local function buildCompactDisplayList(self, w, h)
    -- Compact filled-rectangle slider: bg rect, effective shadow, base fill, text scrim.
    local activeMod, _, _, baseT, effectiveT = modulationState(self)
    local fillColour = self._colour
    if self._dragging then
        fillColour = Utils.brighten(fillColour, 20)
    elseif self:isHovered() then
        fillColour = Utils.brighten(fillColour, 10)
    end
    local shadowColour = modulationToneColour(self)

    local fontSize = math.min(10, math.max(7, h - 4))
    local scrimColour = self:isHovered() and 0x50000000 or 0x44000000
    local textShadow = 0xb0000000
    local labelColour = 0xfff8fafc
    local valueColour = 0xffe2e8f0

    local display = {
        {
            cmd = "fillRoundedRect",
            x = 0, y = 0,
            w = w, h = h,
            radius = 2,
            color = self._bg,
        },
    }

    local miniPad = activeMod and math.max(3, math.floor(h * 0.3 + 0.5)) or 0
    local miniH = activeMod and math.max(2, h - (miniPad * 2)) or h
    local miniY = math.floor((h - miniH) * 0.5 + 0.5)
    local baseFillInsetY = 0
    local baseFillH = h

    if self._bidirectional then
        local midpoint = (self._min + self._max) * 0.5
        local midT = Utils.clamp((midpoint - self._min) / math.max(0.001, self._max - self._min), 0, 1)
        local centerX = math.floor(w * midT + 0.5)
        local baseValueX = math.floor(w * baseT + 0.5)
        local effectiveValueX = math.floor(w * effectiveT + 0.5)

        if activeMod then
            local shadowX = math.min(centerX, effectiveValueX)
            local shadowW = math.abs(effectiveValueX - centerX)
            if shadowW > 0 then
                display[#display + 1] = {
                    cmd = "fillRoundedRect",
                    x = shadowX, y = 0,
                    w = shadowW, h = h,
                    radius = 2,
                    color = shadowColour,
                }
            end
        end

        local baseFillX = math.min(centerX, baseValueX)
        local baseFillW = math.abs(baseValueX - centerX)
        if baseFillW > 0 then
            display[#display + 1] = {
                cmd = "fillRoundedRect",
                x = baseFillX, y = baseFillInsetY,
                w = baseFillW, h = baseFillH,
                radius = 2,
                color = fillColour,
            }
        end

        display[#display + 1] = {
            cmd = "fillRect",
            x = math.max(0, centerX - 1), y = 2,
            w = 2, h = math.max(1, h - 4),
            color = 0x70e2e8f0,
        }
        if activeMod then
            display[#display + 1] = {
                cmd = "fillRect",
                x = math.max(0, baseValueX - 1), y = 1,
                w = 2, h = math.max(1, h - 2),
                color = Utils.brighten(fillColour, 24),
            }
        end
    else
        local baseFillW = math.max(0, math.floor(w * baseT + 0.5))
        local effectiveFillW = math.max(0, math.floor(w * effectiveT + 0.5))

        display[#display + 1] = {
            cmd = "fillRoundedRect",
            x = 0, y = 0,
            w = baseFillW, h = h,
            radius = 2,
            color = fillColour,
        }

        if activeMod then
            local modX = math.min(baseFillW, effectiveFillW)
            local modW = math.max(2, math.abs(effectiveFillW - baseFillW))
            display[#display + 1] = {
                cmd = "fillRoundedRect",
                x = modX, y = 0,
                w = modW, h = h,
                radius = 2,
                color = shadowColour,
            }
        end
    end

    display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = 0, y = 0,
        w = w, h = h,
        radius = 2,
        color = scrimColour,
    }

    if self._label and self._label ~= "" then
        display[#display + 1] = {
            cmd = "drawText",
            x = 4, y = 1,
            w = math.max(1, w - 6), h = h,
            color = textShadow,
            text = self._label,
            fontSize = fontSize,
            align = "left",
            valign = "middle",
        }
        display[#display + 1] = {
            cmd = "drawText",
            x = 3, y = 0,
            w = math.max(1, w - 6), h = h,
            color = labelColour,
            text = self._label,
            fontSize = fontSize,
            align = "left",
            valign = "middle",
        }
    end

    if self._showValue then
        local valText = formatValueText(self, self._value)
        display[#display + 1] = {
            cmd = "drawText",
            x = 4, y = 1,
            w = math.max(1, w - 6), h = h,
            color = textShadow,
            text = valText,
            fontSize = fontSize,
            align = "right",
            valign = "middle",
        }
        display[#display + 1] = {
            cmd = "drawText",
            x = 3, y = 0,
            w = math.max(1, w - 6), h = h,
            color = valueColour,
            text = valText,
            fontSize = fontSize,
            align = "right",
            valign = "middle",
        }
    end

    return display
end

local function buildHorizontalDisplayList(self, w, h)
    local activeMod, _, _, baseT, effectiveT = modulationState(self)
    local trackY = h * 0.5 - 3
    local trackH = 6
    local trackR = 3
    local trackX = 8
    local trackW = math.max(1, w - 16)
    local baseThumbX = trackX + baseT * trackW - 6
    local effectiveThumbX = trackX + effectiveT * trackW - 4
    local thumbColour = self._colour
    if self._dragging then
        thumbColour = Utils.brighten(thumbColour, 30)
    elseif self:isHovered() then
        thumbColour = Utils.brighten(thumbColour, 15)
    end
    local shadowColour = modulationToneColour(self)

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
    }

    if activeMod then
        display[#display + 1] = {
            cmd = "fillRoundedRect",
            x = trackX,
            y = trackY,
            w = math.max(0, math.floor(trackW * effectiveT + 0.5)),
            h = trackH,
            radius = trackR,
            color = shadowColour,
        }
        display[#display + 1] = {
            cmd = "fillRoundedRect",
            x = effectiveThumbX,
            y = (h - 14) / 2,
            w = 8,
            h = 14,
            radius = 3,
            color = shadowColour,
        }
    end

    display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = trackX,
        y = trackY + (activeMod and 1 or 0),
        w = math.max(0, math.floor(trackW * baseT + 0.5)),
        h = activeMod and math.max(2, trackH - 2) or trackH,
        radius = trackR,
        color = self._colour,
    }
    display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = baseThumbX,
        y = (h - 20) / 2,
        w = 12,
        h = 20,
        radius = 4,
        color = thumbColour,
    }

    if self._showValue then
        local valText = self._label .. ": " .. formatValueText(self, self._value)
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
    local activeMod, _, _, baseT, effectiveT = modulationState(self)
    local trackX = 2
    local trackW = math.max(1, w - 4)
    local trackY = 4
    local trackH = math.max(1, h - 8)
    local trackR = trackW / 2

    local thumbH = math.max(30, trackH * 0.3)
    local thumbW = trackW
    local maxThumbY = trackY + trackH - thumbH
    local baseThumbY = trackY + maxThumbY * (1 - baseT)
    local effectiveThumbY = trackY + maxThumbY * (1 - effectiveT)

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
    }

    if activeMod then
        display[#display + 1] = {
            cmd = "fillRoundedRect",
            x = trackX + 1,
            y = effectiveThumbY,
            w = math.max(1, thumbW - 2),
            h = thumbH,
            radius = trackR,
            color = modulationToneColour(self),
        }
    end

    display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = trackX,
        y = baseThumbY,
        w = thumbW,
        h = thumbH,
        radius = trackR,
        color = thumbColour,
    }
    return display
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
    self._compact = config.compact == true
    self._bidirectional = config.bidirectional == true
    self._options = config.options  -- enum labels: {"Sine", "Saw", ...} for integer params
    self._valueFormatter = config.valueFormatter or config.formatValue
    self._dragging = false
    self._dragStartX = 0
    self._dragStartValue = 0
    self._modOverlayEnabled = false
    self._modEffectiveValue = nil

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
    if self._compact then
        -- Compact mode: full width is the track
        local t = Utils.clamp(mx / math.max(1, w), 0, 1)
        local newVal = self._min + t * (self._max - self._min)
        newVal = Utils.snapToStep(newVal, self._step)
        newVal = Utils.clamp(newVal, self._min, self._max)
        updateValue(self, newVal)
    else
        local trackW = math.max(1, w - 16)
        local t = Utils.clamp((mx - 8) / trackW, 0, 1)
        local newVal = self._min + t * (self._max - self._min)
        newVal = Utils.snapToStep(newVal, self._step)
        newVal = Utils.clamp(newVal, self._min, self._max)
        updateValue(self, newVal)
    end
end

function Slider:onDraw(w, h)
    local activeMod, _, _, baseT, effectiveT = modulationState(self)

    if self._compact then
        local baseFillW = math.max(0, math.floor(w * baseT + 0.5))
        local effectiveFillW = math.max(0, math.floor(w * effectiveT + 0.5))
        local fillCol = self._colour
        if self._dragging then fillCol = Utils.brighten(fillCol, 20)
        elseif self:isHovered() then fillCol = Utils.brighten(fillCol, 10) end

        gfx.setColour(self._bg)
        gfx.fillRoundedRect(0, 0, w, h, 2)

        gfx.setColour(fillCol)
        gfx.fillRoundedRect(0, 0, baseFillW, h, 2)

        if activeMod then
            local modX = math.min(baseFillW, effectiveFillW)
            local modW = math.max(2, math.abs(effectiveFillW - baseFillW))
            local modColour = modulationToneColour(self)

            gfx.setColour(modColour)
            gfx.fillRoundedRect(modX, 0, modW, h, 2)
        end

        local fontSize = math.min(10, math.max(7, h - 4))
        if self._label and self._label ~= "" then
            gfx.setColour(0xffe2e8f0)
            gfx.setFont(fontSize)
            gfx.drawText(self._label, 3, 0, w - 6, h, Justify.left)
        end
        if self._showValue then
            local valText = formatValueText(self, self._value)
            gfx.setColour(0xffcbd5e1)
            gfx.setFont(fontSize)
            gfx.drawText(valText, 3, 0, w - 6, h, Justify.right)
        end
        return
    end

    local trackY = h * 0.5 - 3
    local trackH = 6
    local trackR = 3

    self:drawTrack(8, trackY, w - 16, trackH, trackR)

    if activeMod then
        local effectiveThumbX = 8 + effectiveT * (w - 16) - 4
        gfx.setColour(modulationToneColour(self))
        gfx.fillRoundedRect(effectiveThumbX, (h - 14) / 2, 8, 14, 3)
    end

    local thumbX = 8 + baseT * (w - 16) - 6
    self:drawThumb(thumbX, (h - 20) / 2, 12, 20)

    if self._showValue then
        local valText = self._label .. ": " .. formatValueText(self, self._value)
        gfx.setColour(0xffe2e8f0)
        gfx.setFont(11.0)
        gfx.drawText(valText, 8, 2, w - 16, 20, Justify.centred)
    end
end

function Slider:drawTrack(x, y, w, h, r)
    local activeMod, _, _, baseT, effectiveT = modulationState(self)
    gfx.setColour(self._bg)
    gfx.fillRoundedRect(x, y, w, h, r)

    gfx.setColour(self._colour)
    gfx.fillRoundedRect(x, y, w * baseT, h, r)

    if activeMod then
        local modX = x + math.min(baseT, effectiveT) * w
        local modW = math.max(2, math.abs(effectiveT - baseT) * w)
        local modY = y + 1
        local modH = math.max(2, h - 2)
        gfx.setColour(modulationToneColour(self))
        gfx.fillRoundedRect(modX, modY, modW, modH, math.max(1, r - 1))
    end
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
    if self._compact then
        self.node:setDisplayList(buildCompactDisplayList(self, w, h))
    else
        self.node:setDisplayList(buildHorizontalDisplayList(self, w, h))
    end
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

function Slider:setValueFormatter(formatter)
    self._valueFormatter = formatter
    if self._runtimeNodeOnly or not self.node or not self.node.setOnDraw then
        self:_syncRetained()
    end
    self.node:repaint()
end

function Slider:setLabel(label)
    local nextLabel = tostring(label or "")
    if self._label == nextLabel then
        return
    end
    self._label = nextLabel
    if self._runtimeNodeOnly or not self.node or not self.node.setOnDraw then
        self:_syncRetained()
    end
    self.node:repaint()
end

function Slider:getLabel()
    return self._label
end

function Slider:setModulationState(_baseValue, effectiveValue, options)
    options = options or {}
    local enabled = options.enabled == true
    local nextEffective = tonumber(effectiveValue)
    if enabled ~= true or nextEffective == nil then
        nextEffective = nil
        enabled = false
    else
        nextEffective = Utils.clamp(nextEffective, self._min, self._max)
    end

    local currentEffective = tonumber(self._modEffectiveValue)
    if self._modOverlayEnabled == enabled then
        if enabled ~= true and currentEffective == nil then
            return nil
        end
        if enabled == true and currentEffective ~= nil and math.abs(currentEffective - nextEffective) <= 0.0001 then
            return nil
        end
    end

    self._modOverlayEnabled = enabled
    self._modEffectiveValue = nextEffective
    if self.node then
        self:refreshRetained()
        if self.node.repaint then
            self.node:repaint()
        end
    end
    return nil
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
