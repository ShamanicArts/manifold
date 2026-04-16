-- label.lua
-- Label widget

local BaseWidget = require("widgets.base")
local Utils = require("widgets.utils")
local Schema = require("widgets.schema")

local Label = BaseWidget:extend()

local function wrapText(text, maxWidth, fontSize)
    if maxWidth <= 0 then return { text } end
    
    local avgCharWidth = fontSize * 0.5
    local lines = {}
    local paragraphs = {}
    
    for paragraph in string.gmatch(text, "[^\n]+") do
        table.insert(paragraphs, paragraph)
    end
    if #paragraphs == 0 then paragraphs = { text } end
    
    for _, paragraph in ipairs(paragraphs) do
        local words = {}
        for word in string.gmatch(paragraph, "%S+") do
            table.insert(words, word)
        end
        
        if #words == 0 then
            table.insert(lines, "")
        else
            local currentLine = ""
            local currentWidth = 0
            
            for _, word in ipairs(words) do
                local wordWidth = #word * avgCharWidth
                
                if currentWidth == 0 then
                    currentLine = word
                    currentWidth = wordWidth
                elseif currentWidth + avgCharWidth + wordWidth <= maxWidth then
                    currentLine = currentLine .. " " .. word
                    currentWidth = currentWidth + avgCharWidth + wordWidth
                else
                    table.insert(lines, currentLine)
                    currentLine = word
                    currentWidth = wordWidth
                end
            end
            
            if #currentLine > 0 then
                table.insert(lines, currentLine)
            end
        end
    end
    
    return lines
end

function Label.new(parent, name, config)
    local self = setmetatable(BaseWidget.new(parent, name, config), Label)

    self._text = config.text or ""
    self._colour = Utils.colour(config.colour, 0xff9ca3af)
    self._fontSize = config.fontSize or 13.0
    self._fontName = config.fontName
    self._fontStyle = config.fontStyle or FontStyle.plain
    self._justification = config.justification or Justify.centredLeft
    self._wordWrap = config.wordWrap == true

    self.node:setInterceptsMouse(false, false)

    self:_storeEditorMeta("Label", {}, Schema.buildEditorSchema("Label", config))
    self:_syncRetained()

    return self
end

function Label:onDraw(w, h)
    gfx.setColour(self._colour)
    if self._fontName then
        gfx.setFont(self._fontName, self._fontSize, self._fontStyle)
    else
        gfx.setFont(self._fontSize)
    end
    
    if self._wordWrap and w > 0 then
        local lines = wrapText(self._text, w, self._fontSize)
        local lineHeight = self._fontSize * 1.3
        local y = 0
        
        for _, line in ipairs(lines) do
            gfx.drawText(line, 0, y, w, lineHeight, self._justification)
            y = y + lineHeight
        end
    else
        gfx.drawText(self._text, 0, 0, w, h, self._justification)
    end
end

function Label:_syncRetained(w, h)
    local _, _, bw, bh = self.node:getBounds()
    w = w or bw or 0
    h = h or bh or 0

    if w <= 0 or h <= 0 then
        self.node:setDisplayList({})
        return
    end

    local align = "left"
    if self._justification == Justify.centred or self._justification == Justify.horizontallyCentred then
        align = "center"
    elseif self._justification == Justify.centredRight
        or self._justification == Justify.right
        or self._justification == Justify.topRight
        or self._justification == Justify.bottomRight then
        align = "right"
    end

    local valign = "middle"
    if self._justification == Justify.top
        or self._justification == Justify.topLeft
        or self._justification == Justify.topRight
        or self._justification == Justify.centredTop then
        valign = "top"
    elseif self._justification == Justify.bottom
        or self._justification == Justify.bottomLeft
        or self._justification == Justify.bottomRight
        or self._justification == Justify.centredBottom then
        valign = "bottom"
    end

    if self._wordWrap then
        local lines = wrapText(self._text, w, self._fontSize)
        local lineHeight = self._fontSize * 1.3
        local cmds = {}
        local y = 0
        
        for _, line in ipairs(lines) do
            table.insert(cmds, {
                cmd = "drawText",
                x = 0,
                y = y,
                w = w,
                h = lineHeight,
                color = self._colour,
                text = line,
                fontSize = self._fontSize,
                align = align,
                valign = "top"
            })
            y = y + lineHeight
        end
        self.node:setDisplayList(cmds)
    else
        self.node:setDisplayList({ {
            cmd = "drawText",
            x = 0,
            y = 0,
            w = w,
            h = h,
            color = self._colour,
            text = self._text,
            fontSize = self._fontSize,
            align = align,
            valign = valign
        } })
    end
end

function Label:setText(text)
    local nextText = text or ""
    if self._text == nextText then
        return
    end
    self._text = nextText
    self:_syncRetained()
    self.node:repaint()
end

function Label:getText()
    return self._text
end

function Label:setColour(colour)
    if self._colour == colour then
        return
    end
    self._colour = colour
    self:_syncRetained()
    self.node:repaint()
end

return Label
