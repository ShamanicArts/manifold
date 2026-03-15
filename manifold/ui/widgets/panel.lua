-- panel.lua
-- Panel container widget

local BaseWidget = require("widgets.base")
local Utils = require("widgets.utils")
local Schema = require("widgets.schema")

local Panel = BaseWidget:extend()

function Panel.new(parent, name, config)
    local self = setmetatable(BaseWidget.new(parent, name, config), Panel)

    self._bg = Utils.colour(config.bg, 0x00000000)
    self._border = Utils.colour(config.border, 0x00000000)
    self._borderWidth = config.borderWidth or 0
    self._radius = config.radius or 0
    self._opacity = config.opacity or 1.0

    if config.interceptsMouse ~= nil then
        self.node:setInterceptsMouse(config.interceptsMouse, true)
    end

    if config.on_wheel then
        self.node:setOnMouseWheel(function(x, y, deltaY)
            config.on_wheel(x, y, deltaY)
        end)
    end

    self:_storeEditorMeta("Panel", {
        on_wheel = config.on_wheel
    }, Schema.buildEditorSchema("Panel", config))

    self:_syncRetained()

    return self
end

function Panel:onDraw(w, h)
    -- Background
    if (self._bg >> 24) & 0xff > 0 then
        gfx.setColour(self._bg)
        gfx.fillRoundedRect(0, 0, w, h, self._radius)
    end
    
    -- Border
    if self._borderWidth > 0 and (self._border >> 24) & 0xff > 0 then
        gfx.setColour(self._border)
        gfx.drawRoundedRect(0, 0, w, h, self._radius, self._borderWidth)
    end
end

function Panel:_syncRetained()
    self.node:setStyle({
        bg = self._bg,
        border = self._border,
        borderWidth = self._borderWidth,
        radius = self._radius,
        opacity = self._opacity
    })
    -- Do NOT clearDisplayList here — a behavior's setOnDraw callback may have
    -- populated it via node:setDisplayList(). Panel background is rendered via
    -- setStyle(), not via the display list.
end

function Panel:setStyle(style)
    if style.bg then self._bg = style.bg end
    if style.border then self._border = style.border end
    if style.borderWidth then self._borderWidth = style.borderWidth end
    if style.radius then self._radius = style.radius end
    if style.opacity then self._opacity = style.opacity end
    self:_syncRetained()
    self.node:repaint()
end

return Panel
