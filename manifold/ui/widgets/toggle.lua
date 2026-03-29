-- toggle.lua
-- Toggle button widget - button style with label inside

local BaseWidget = require("widgets.base")
local Utils = require("widgets.utils")
local Schema = require("widgets.schema")

local Toggle = BaseWidget:extend()

function Toggle.new(parent, name, config)
    local self = setmetatable(BaseWidget.new(parent, name, config), Toggle)

    self._value = config.value or false
    self._label = config.label or ""
    self._onLabel = config.onLabel or config.on_label or self._label
    self._offLabel = config.offLabel or config.off_label or self._label
    self._onColour = Utils.colour(config.onColour, 0xff0ea5e9)
    self._offColour = Utils.colour(config.offColour, 0xff475569)
    self._textColour = Utils.colour(config.textColour, 0xfff1f5f9)
    self._fontSize = config.fontSize or 11.0
    self._radius = config.radius or 4.0
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

function Toggle:_getCurrentLabel()
    return self._value and self._onLabel or self._offLabel
end

function Toggle:onDraw(w, h)
    -- Background fills the entire button area
    local bg = self._value and self._onColour or self._offColour
    
    if not self:isEnabled() then
        bg = Utils.darken(bg, 40)
    elseif self:isPressed() then
        bg = Utils.darken(bg, 20)
    elseif self:isHovered() then
        bg = Utils.brighten(bg, 25)
    end
    
    gfx.setColour(bg)
    gfx.fillRoundedRect(1, 1, w - 2, h - 2, self._radius)
    
    -- Border
    gfx.setColour(Utils.brighten(bg, 40))
    gfx.drawRoundedRect(1, 1, w - 2, h - 2, self._radius, 1.0)
    
    -- Label centered with shadow for readability
    local label = self:_getCurrentLabel()
    gfx.setFont(self._fontSize)
    
    -- Text shadow
    gfx.setColour(0xb0000000)
    gfx.drawText(label, 1, 1, w, h, Justify.centred)
    
    -- Main text
    gfx.setColour(self._textColour)
    gfx.drawText(label, 0, 0, w, h, Justify.centred)
end

function Toggle:_syncRetained(w, h)
    local _, _, bw, bh = self.node:getBounds()
    w = w or bw or 0
    h = h or bh or 0

    -- Background color based on state
    local bg = self._value and self._onColour or self._offColour
    if not self:isEnabled() then
        bg = Utils.darken(bg, 40)
    elseif self:isPressed() then
        bg = Utils.darken(bg, 20)
    elseif self:isHovered() then
        bg = Utils.brighten(bg, 25)
    end

    self.node:setStyle({
        bg = bg,
        border = Utils.brighten(bg, 40),
        borderWidth = 1.0,
        radius = self._radius,
        opacity = 1.0
    })

    local label = self:_getCurrentLabel()
    local textShadow = 0xb0000000

    self.node:setDisplayList({
        -- Text shadow for readability
        {
            cmd = "drawText",
            x = 1,
            y = 1,
            w = w,
            h = h,
            color = textShadow,
            text = label,
            fontSize = self._fontSize,
            align = "center",
            valign = "middle"
        },
        -- Main text
        {
            cmd = "drawText",
            x = 0,
            y = 0,
            w = w,
            h = h,
            color = self._textColour,
            text = label,
            fontSize = self._fontSize,
            align = "center",
            valign = "middle"
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

function Toggle:setLabel(label)
    local nextLabel = label or ""
    if self._label == nextLabel then
        return
    end
    self._label = nextLabel
    self:_syncRetained()
    self.node:repaint()
end

function Toggle:getLabel()
    return self._label
end

function Toggle:setOnLabel(label)
    local nextLabel = label or ""
    if self._onLabel == nextLabel then
        return
    end
    self._onLabel = nextLabel
    self:_syncRetained()
    self.node:repaint()
end

function Toggle:getOnLabel()
    return self._onLabel
end

function Toggle:setOffLabel(label)
    local nextLabel = label or ""
    if self._offLabel == nextLabel then
        return
    end
    self._offLabel = nextLabel
    self:_syncRetained()
    self.node:repaint()
end

function Toggle:getOffLabel()
    return self._offLabel
end

function Toggle:setOnColour(colour)
    local newColour = Utils.colour(colour, self._onColour)
    if self._onColour == newColour then
        return
    end
    self._onColour = newColour
    self:_syncRetained()
    self.node:repaint()
end

function Toggle:setOffColour(colour)
    local newColour = Utils.colour(colour, self._offColour)
    if self._offColour == newColour then
        return
    end
    self._offColour = newColour
    self:_syncRetained()
    self.node:repaint()
end

function Toggle:setTextColour(colour)
    local newColour = Utils.colour(colour, self._textColour)
    if self._textColour == newColour then
        return
    end
    self._textColour = newColour
    self:_syncRetained()
    self.node:repaint()
end

return Toggle
