-- xypad.lua
-- 2D control surface - clean base widget

local BaseWidget = require("widgets.base")
local Utils = require("widgets.utils")

local XYPadWidget = BaseWidget:extend()

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

function XYPadWidget.new(parent, name, config)
    local self = setmetatable(BaseWidget.new(parent, name, config), XYPadWidget)

    self._x = config.x or 0.5
    self._y = config.y or 0.5
    self._handleColour = Utils.colour(config.handleColour, 0xffff8800)
    self._bgColour = Utils.colour(config.bgColour, 0x00000000)
    self._gridColour = Utils.colour(config.gridColour, 0x00000000)
    self._onChange = config.on_change or config.onChange

    self:_storeEditorMeta("XYPadWidget", {
        on_change = self._onChange,
    }, {})

    self:exposeParams({
        { path = "handleColour", label = "Handle Colour", type = "color", group = "Style" },
        { path = "bgColour", label = "Background", type = "color", group = "Style" },
        { path = "gridColour", label = "Grid", type = "color", group = "Style" },
    })

    self:refreshRetained()

    return self
end

function XYPadWidget:onMouseDown(mx, my)
    self:_updateFromMouse(mx, my)
end

function XYPadWidget:onMouseDrag(mx, my, dx, dy)
    self:_updateFromMouse(mx, my)
end

function XYPadWidget:_updateFromMouse(mx, my)
    local w = self.node:getWidth()
    local h = self.node:getHeight()
    local margin = 20

    self._x = Utils.clamp((mx - margin) / (w - margin * 2), 0, 1)
    self._y = 1.0 - Utils.clamp((my - margin) / (h - margin * 2), 0, 1)

    self:refreshRetained(w, h)
    self.node:repaint()

    if self._onChange then
        self._onChange(self._x, self._y)
    end
end

function XYPadWidget:getValues()
    return self._x, self._y
end

function XYPadWidget:setValues(x, y)
    self._x = Utils.clamp(x or 0.5, 0, 1)
    self._y = Utils.clamp(y or 0.5, 0, 1)
    self:refreshRetained()
    self.node:repaint()
end

function XYPadWidget:onDraw(w, h)
    local margin = 20
    local drawW = w - margin * 2
    local drawH = h - margin * 2

    -- Background
    gfx.setColour(self._bgColour)
    gfx.fillRoundedRect(margin, margin, drawW, drawH, 8)

    -- Grid lines
    gfx.setColour(self._gridColour)
    for i = 1, 4 do
        local x = margin + (drawW / 5) * i
        local y = margin + (drawH / 5) * i
        gfx.drawVerticalLine(math.floor(x), margin, drawH)
        gfx.drawHorizontalLine(math.floor(y), margin, drawW)
    end

    -- Crosshair center
    local cx = margin + drawW / 2
    local cy = margin + drawH / 2
    gfx.setColour(Utils.brighten(self._gridColour, 20))
    gfx.drawVerticalLine(math.floor(cx), margin, drawH)
    gfx.drawHorizontalLine(math.floor(cy), margin, drawW)

    -- Current position
    local px = margin + self._x * drawW
    local py = margin + (1.0 - self._y) * drawH

    -- Glow
    for i = 3, 1, -1 do
        local glowSize = 8 + i * 4
        local alpha = 50 - i * 15
        gfx.setColour((alpha << 24) | 0xff4400)
        gfx.fillRoundedRect(math.floor(px - glowSize/2), math.floor(py - glowSize/2),
                           math.floor(glowSize), math.floor(glowSize), glowSize/2)
    end

    -- Handle
    gfx.setColour(self._handleColour)
    gfx.fillRoundedRect(math.floor(px - 6), math.floor(py - 6), 12, 12, 6)
    gfx.setColour(0xffffffff)
    gfx.fillRoundedRect(math.floor(px - 3), math.floor(py - 3), 6, 6, 3)

    -- Coordinates label
    gfx.setColour(0xffffffff)
    gfx.setFont(11.0)
    local label = string.format("X: %.2f  Y: %.2f", self._x, self._y)
    gfx.drawText(label, margin, h - 18, drawW, 16, Justify.centred)
end

function XYPadWidget:_syncRetained(w, h)
    local bw, bh = boundsSize(self.node)
    w = w or bw
    h = h or bh

    local margin = 20
    local drawW = math.max(1, w - margin * 2)
    local drawH = math.max(1, h - margin * 2)
    local cx = margin + drawW * 0.5
    local cy = margin + drawH * 0.5
    local px = margin + self._x * drawW
    local py = margin + (1.0 - self._y) * drawH
    local display = {
        {
            cmd = "fillRoundedRect",
            x = margin,
            y = margin,
            w = drawW,
            h = drawH,
            radius = 8,
            color = self._bgColour,
        }
    }

    for i = 1, 4 do
        local gx = math.floor(margin + (drawW / 5) * i + 0.5)
        local gy = math.floor(margin + (drawH / 5) * i + 0.5)
        display[#display + 1] = {
            cmd = "drawLine",
            x1 = gx,
            y1 = margin,
            x2 = gx,
            y2 = margin + drawH,
            thickness = 1,
            color = self._gridColour,
        }
        display[#display + 1] = {
            cmd = "drawLine",
            x1 = margin,
            y1 = gy,
            x2 = margin + drawW,
            y2 = gy,
            thickness = 1,
            color = self._gridColour,
        }
    end

    local crossColour = Utils.brighten(self._gridColour, 20)
    display[#display + 1] = {
        cmd = "drawLine",
        x1 = math.floor(cx + 0.5),
        y1 = margin,
        x2 = math.floor(cx + 0.5),
        y2 = margin + drawH,
        thickness = 1,
        color = crossColour,
    }
    display[#display + 1] = {
        cmd = "drawLine",
        x1 = margin,
        y1 = math.floor(cy + 0.5),
        x2 = margin + drawW,
        y2 = math.floor(cy + 0.5),
        thickness = 1,
        color = crossColour,
    }

    for i = 3, 1, -1 do
        local glowSize = 8 + i * 4
        local alpha = 50 - i * 15
        display[#display + 1] = {
            cmd = "fillRoundedRect",
            x = math.floor(px - glowSize / 2 + 0.5),
            y = math.floor(py - glowSize / 2 + 0.5),
            w = math.floor(glowSize + 0.5),
            h = math.floor(glowSize + 0.5),
            radius = glowSize / 2,
            color = (alpha << 24) | (self._handleColour & 0x00ffffff),
        }
    end

    display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = math.floor(px - 6 + 0.5),
        y = math.floor(py - 6 + 0.5),
        w = 12,
        h = 12,
        radius = 6,
        color = self._handleColour,
    }
    display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = math.floor(px - 3 + 0.5),
        y = math.floor(py - 3 + 0.5),
        w = 6,
        h = 6,
        radius = 3,
        color = 0xffffffff,
    }
    display[#display + 1] = {
        cmd = "drawText",
        x = margin,
        y = h - 18,
        w = drawW,
        h = 16,
        color = 0xffffffff,
        text = string.format("X: %.2f  Y: %.2f", self._x, self._y),
        fontSize = 11.0,
        align = "center",
        valign = "middle",
    }

    setTransparentStyle(self.node)
    self.node:setDisplayList(display)
end

return XYPadWidget
