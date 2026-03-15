-- toggle.lua
-- Toggle/Switch widget

local BaseWidget = require("widgets.base")
local Utils = require("widgets.utils")
local Schema = require("widgets.schema")

local Toggle = BaseWidget:extend()

function Toggle.new(parent, name, config)
    local self = setmetatable(BaseWidget.new(parent, name, config), Toggle)

    self._value = config.value or false
    self._label = config.label or ""
    self._onColour = Utils.colour(config.onColour, 0xff22c55e)
    self._offColour = Utils.colour(config.offColour, 0xff374151)
    self._onChange = config.on_change or config.onChange

    self:_storeEditorMeta("Toggle", {
        on_change = self._onChange
    }, Schema.buildEditorSchema("Toggle", config))

    self:_syncRetained()

    return self
end

function Toggle:onClick()
    self._value = not self._value
    self:_syncRetained()
    self.node:repaint()
    if self._onChange then
        self._onChange(self._value)
    end
end

function Toggle:onDraw(w, h)
    -- Track
    local trackW = math.floor(math.min(38, w * 0.5))
    local trackH = 18
    local trackX = math.floor(w - trackW - 6)
    local trackY = math.floor((h - trackH) / 2)
    local trackR = math.floor(trackH / 2)
    
    local trackCol = self._value and self._onColour or self._offColour
    if self:isHovered() then
        trackCol = Utils.brighten(trackCol, 15)
    end
    
    gfx.setColour(trackCol)
    gfx.fillRoundedRect(trackX, trackY, trackW, trackH, trackR)
    
    -- Thumb
    local thumbR = trackH - 4
    local thumbX = math.floor(self._value and (trackX + trackW - thumbR - 2) or (trackX + 2))
    local thumbY = math.floor(trackY + 2)
    gfx.setColour(0xffe2e8f0)
    gfx.fillRoundedRect(thumbX, thumbY, thumbR, thumbR, math.floor(thumbR / 2))
    
    -- Label
    gfx.setColour(self._value and 0xffe2e8f0 or 0xff94a3b8)
    gfx.setFont(12.0)
    gfx.drawText(self._label, 6, 0, math.floor(trackX - 10), h, Justify.centredLeft)
end

function Toggle:_syncRetained(w, h)
    local _, _, bw, bh = self.node:getBounds()
    w = w or bw or 0
    h = h or bh or 0

    local trackW = math.floor(math.min(38, w * 0.5))
    local trackH = 18
    local trackX = math.floor(w - trackW - 6)
    local trackY = math.floor((h - trackH) / 2)
    local trackR = math.floor(trackH / 2)
    local trackCol = self._value and self._onColour or self._offColour
    if self:isHovered() then
        trackCol = Utils.brighten(trackCol, 15)
    end

    local thumbR = trackH - 4
    local thumbX = math.floor(self._value and (trackX + trackW - thumbR - 2) or (trackX + 2))
    local thumbY = math.floor(trackY + 2)

    self.node:setStyle({
        bg = 0x00000000,
        border = 0x00000000,
        borderWidth = 0,
        radius = 0,
        opacity = 1.0
    })

    self.node:setDisplayList({
        {
            cmd = "fillRoundedRect",
            x = trackX,
            y = trackY,
            w = trackW,
            h = trackH,
            radius = trackR,
            color = trackCol,
        },
        {
            cmd = "fillRoundedRect",
            x = thumbX,
            y = thumbY,
            w = thumbR,
            h = thumbR,
            radius = math.floor(thumbR / 2),
            color = 0xffe2e8f0,
        },
        {
            cmd = "drawText",
            x = 6,
            y = 0,
            w = math.max(0, trackX - 10),
            h = h,
            color = self._value and 0xffe2e8f0 or 0xff94a3b8,
            text = self._label,
            fontSize = 12.0,
            align = "left",
            valign = "middle",
        }
    })
end

function Toggle:getValue()
    return self._value
end

function Toggle:setValue(v)
    local nextValue = v == true
    if self._value == nextValue then
        return
    end
    self._value = nextValue
    self:_syncRetained()
    self.node:repaint()
end

return Toggle
