-- looper_widgets.lua
-- Built-in widget library for the Looper plugin.
-- All widgets are pure Lua composing Canvas nodes.
-- Users can `require("looper_widgets")` and override anything.

local Widgets = {}

-- ============================================================================
-- Helpers
-- ============================================================================

local function colour(c, default) return c or default or 0xff333333 end

local function clamp(v, lo, hi) return math.max(lo, math.min(hi, v)) end

local function lerp(a, b, t) return a + (b - a) * t end

local function brighten(c, amount)
    local a = (c >> 24) & 0xff
    local r = math.min(255, ((c >> 16) & 0xff) + amount)
    local g = math.min(255, ((c >> 8) & 0xff) + amount)
    local b = math.min(255, (c & 0xff) + amount)
    return (a << 24) | (r << 16) | (g << 8) | b
end

local function darken(c, amount)
    local a = (c >> 24) & 0xff
    local r = math.max(0, ((c >> 16) & 0xff) - amount)
    local g = math.max(0, ((c >> 8) & 0xff) - amount)
    local b = math.max(0, (c & 0xff) - amount)
    return (a << 24) | (r << 16) | (g << 8) | b
end

local function snapToStep(value, step)
    if step and step > 0 then
        return math.floor(value / step + 0.5) * step
    end
    return value
end

-- ============================================================================
-- Button: clickable pill-shaped button with label and colour
-- ============================================================================

function Widgets.Button(parent, name, config)
    config = config or {}
    local node = parent:addChild(name)

    local _label = config.label or ""
    local _bg = colour(config.bg, 0xff374151)
    local _textColour = colour(config.textColour, 0xffffffff)
    local _fontSize = config.fontSize or 13.0

    if config.on_click then node:setOnClick(config.on_click) end

    node:setOnDraw(function(self)
        local w = self:getWidth()
        local h = self:getHeight()
        local r = 7.0
        local bg = self:isMouseOver() and brighten(_bg, 25) or _bg

        gfx.setColour(bg)
        gfx.fillRoundedRect(1, 1, w - 2, h - 2, r)
        gfx.setColour(brighten(bg, 40))
        gfx.drawRoundedRect(1, 1, w - 2, h - 2, r, 1.0)
        gfx.setColour(_textColour)
        gfx.setFont(_fontSize)
        gfx.drawText(_label, 0, 0, w, h, Justify.centred)
    end)

    return {
        node = node,
        setLabel = function(l) _label = l end,
        getLabel = function() return _label end,
        setBg = function(c) _bg = c end,
        setTextColour = function(c) _textColour = c end,
        setOnClick = function(fn) node:setOnClick(fn) end,
    }
end

-- ============================================================================
-- Label: non-interactive text display
-- ============================================================================

function Widgets.Label(parent, name, config)
    config = config or {}
    local node = parent:addChild(name)
    node:setInterceptsMouse(false, false)

    local _text = config.text or ""
    local _colour = colour(config.colour, 0xff9ca3af)
    local _fontSize = config.fontSize or 13.0
    local _fontName = config.fontName or nil
    local _fontStyle = config.fontStyle or FontStyle.plain
    local _justification = config.justification or Justify.centredLeft

    node:setOnDraw(function(self)
        gfx.setColour(_colour)
        if _fontName then
            gfx.setFont(_fontName, _fontSize, _fontStyle)
        else
            gfx.setFont(_fontSize)
        end
        gfx.drawText(_text, 0, 0, self:getWidth(), self:getHeight(), _justification)
    end)

    return {
        node = node,
        setText = function(t) _text = t end,
        getText = function() return _text end,
        setColour = function(c) _colour = c end,
    }
end

-- ============================================================================
-- Panel: styled container with background, border, radius
-- ============================================================================

function Widgets.Panel(parent, name, config)
    config = config or {}
    local node = parent:addChild(name)
    node:setStyle({
        bg = colour(config.bg, 0x00000000),
        border = colour(config.border, 0x00000000),
        borderWidth = config.borderWidth or 0,
        radius = config.radius or 0,
        opacity = config.opacity or 1.0,
    })

    if config.interceptsMouse ~= nil then
        node:setInterceptsMouse(config.interceptsMouse, true)
    end

    return {
        node = node,
        setStyle = function(s) node:setStyle(s) end,
    }
end

-- ============================================================================
-- Slider: horizontal drag control with value label
-- ============================================================================
-- Usage:
--   local s = Widgets.Slider(parent, "tempo", {
--       min = 40, max = 240, step = 1, value = 120,
--       label = "Tempo", suffix = " BPM",
--       colour = 0xff38bdf8,
--       on_change = function(v) command("TEMPO", tostring(v)) end,
--   })
--   s.setValue(130)

function Widgets.Slider(parent, name, config)
    config = config or {}
    local node = parent:addChild(name)

    local _min = config.min or 0
    local _max = config.max or 1
    local _step = config.step or 0
    local _value = clamp(config.value or _min, _min, _max)
    local _label = config.label or ""
    local _suffix = config.suffix or ""
    local _colour = colour(config.colour, 0xff38bdf8)
    local _bg = colour(config.bg, 0xff1e293b)
    local _on_change = config.on_change
    local _dragging = false
    local _dragStartValue = 0

    node:setOnMouseDown(function(mx, my)
        _dragging = true
        _dragStartValue = _value
    end)

    node:setOnMouseDrag(function(mx, my, dx, dy)
        if not _dragging then return end
        local w = node:getWidth()
        local range = _max - _min
        local delta = (dx / math.max(1, w - 20)) * range
        local newVal = clamp(snapToStep(_dragStartValue + delta, _step), _min, _max)
        if newVal ~= _value then
            _value = newVal
            if _on_change then _on_change(_value) end
        end
    end)

    node:setOnMouseUp(function(mx, my)
        _dragging = false
    end)

    node:setOnDraw(function(self)
        local w = self:getWidth()
        local h = self:getHeight()

        -- Track background
        local trackY = h * 0.5 - 3
        local trackH = 6
        local trackR = 3
        gfx.setColour(_bg)
        gfx.fillRoundedRect(4, trackY, w - 8, trackH, trackR)

        -- Filled portion
        local t = (_value - _min) / math.max(0.001, _max - _min)
        local filledW = t * (w - 8)
        gfx.setColour(_colour)
        gfx.fillRoundedRect(4, trackY, filledW, trackH, trackR)

        -- Thumb
        local thumbX = 4 + filledW - 6
        local thumbW = 12
        local thumbH = h * 0.7
        local thumbY = (h - thumbH) / 2
        local thumbBg = _dragging and brighten(_colour, 30) or (self:isMouseOver() and brighten(_colour, 15) or _colour)
        gfx.setColour(thumbBg)
        gfx.fillRoundedRect(thumbX, thumbY, thumbW, thumbH, 4)

        -- Label
        gfx.setColour(0xffe2e8f0)
        gfx.setFont(11.0)
        gfx.drawText(_label, 6, 1, w * 0.5, h * 0.35, Justify.centredLeft)

        -- Value
        local valText = string.format("%.2f", _value) .. _suffix
        if _step >= 1 then valText = string.format("%d", _value) .. _suffix end
        gfx.setColour(0xffcbd5e1)
        gfx.setFont(11.0)
        gfx.drawText(valText, w * 0.5, 1, w * 0.5 - 6, h * 0.35, Justify.centredRight)
    end)

    return {
        node = node,
        getValue = function() return _value end,
        setValue = function(v) _value = clamp(v, _min, _max) end,
        setOnChange = function(fn) _on_change = fn end,
    }
end

-- ============================================================================
-- Knob: rotary control via vertical drag
-- ============================================================================
-- Usage:
--   local k = Widgets.Knob(parent, "speed", {
--       min = 0.25, max = 4.0, value = 1.0,
--       label = "Speed", colour = 0xff22d3ee,
--       on_change = function(v) ... end,
--   })

function Widgets.Knob(parent, name, config)
    config = config or {}
    local node = parent:addChild(name)

    local _min = config.min or 0
    local _max = config.max or 1
    local _step = config.step or 0
    local _value = clamp(config.value or _min, _min, _max)
    local _label = config.label or ""
    local _colour = colour(config.colour, 0xff22d3ee)
    local _bg = colour(config.bg, 0xff1e293b)
    local _on_change = config.on_change
    local _dragging = false
    local _dragStartValue = 0

    -- Arc angles: -135° to +135° (270° total sweep)
    local startAngle = -135
    local endAngle = 135

    node:setOnMouseDown(function(mx, my)
        _dragging = true
        _dragStartValue = _value
    end)

    node:setOnMouseDrag(function(mx, my, dx, dy)
        if not _dragging then return end
        local range = _max - _min
        -- Vertical drag: up = increase, sensitivity based on range
        local delta = (-dy / 150.0) * range
        local newVal = clamp(snapToStep(_dragStartValue + delta, _step), _min, _max)
        if newVal ~= _value then
            _value = newVal
            if _on_change then _on_change(_value) end
        end
    end)

    node:setOnMouseUp(function(mx, my)
        _dragging = false
    end)

    node:setOnDraw(function(self)
        local w = self:getWidth()
        local h = self:getHeight()
        local cx = w / 2
        local cy = h * 0.42
        local radius = math.min(w, h) * 0.32

        -- Background circle
        gfx.setColour(_bg)
        gfx.fillRoundedRect(cx - radius, cy - radius, radius * 2, radius * 2, radius)

        -- Arc: draw filled arc as tick marks
        local t = (_value - _min) / math.max(0.001, _max - _min)
        local arcEnd = startAngle + t * (endAngle - startAngle)
        local numTicks = 32
        for i = 0, numTicks do
            local angle = startAngle + (i / numTicks) * (endAngle - startAngle)
            local rad = math.rad(angle - 90)  -- -90 to orient 0° at top
            local isFilled = angle <= arcEnd
            gfx.setColour(isFilled and _colour or darken(_bg, 10))
            local x1 = cx + math.cos(rad) * (radius * 0.7)
            local y1 = cy + math.sin(rad) * (radius * 0.7)
            local x2 = cx + math.cos(rad) * (radius * 0.92)
            local y2 = cy + math.sin(rad) * (radius * 0.92)
            -- Draw as small rectangles (JUCE drawLine not exposed, so use fillRect)
            gfx.fillRect(math.min(x1, x2), math.min(y1, y2),
                          math.max(2, math.abs(x2 - x1)),
                          math.max(2, math.abs(y2 - y1)))
        end

        -- Center dot
        gfx.setColour(brighten(_bg, 30))
        gfx.fillRoundedRect(cx - 4, cy - 4, 8, 8, 4)

        -- Pointer needle
        local pRad = math.rad(arcEnd - 90)
        local px = cx + math.cos(pRad) * (radius * 0.55)
        local py = cy + math.sin(pRad) * (radius * 0.55)
        gfx.setColour(0xffe2e8f0)
        gfx.fillRoundedRect(px - 2, py - 2, 4, 4, 2)

        -- Value text
        local valText
        if _step >= 1 then
            valText = string.format("%d", _value)
        else
            valText = string.format("%.2f", _value)
        end
        gfx.setColour(0xffcbd5e1)
        gfx.setFont(11.0)
        gfx.drawText(valText, 0, h * 0.72, w, h * 0.14, Justify.centred)

        -- Label
        gfx.setColour(0xff94a3b8)
        gfx.setFont(10.0)
        gfx.drawText(_label, 0, h * 0.86, w, h * 0.14, Justify.centred)
    end)

    return {
        node = node,
        getValue = function() return _value end,
        setValue = function(v) _value = clamp(v, _min, _max) end,
        setOnChange = function(fn) _on_change = fn end,
    }
end

-- ============================================================================
-- Toggle: on/off switch
-- ============================================================================
-- Usage:
--   local t = Widgets.Toggle(parent, "overdub", {
--       value = false, label = "Overdub",
--       on_change = function(on) command("OVERDUB", on and "1" or "0") end,
--   })

function Widgets.Toggle(parent, name, config)
    config = config or {}
    local node = parent:addChild(name)

    local _value = config.value or false
    local _label = config.label or ""
    local _onColour = colour(config.onColour, 0xff22c55e)
    local _offColour = colour(config.offColour, 0xff374151)
    local _on_change = config.on_change

    node:setOnClick(function()
        _value = not _value
        if _on_change then _on_change(_value) end
    end)

    node:setOnDraw(function(self)
        local w = self:getWidth()
        local h = self:getHeight()

        -- Track
        local trackW = math.min(38, w * 0.5)
        local trackH = 18
        local trackX = w - trackW - 6
        local trackY = (h - trackH) / 2
        local trackR = trackH / 2
        local trackCol = _value and _onColour or _offColour
        if self:isMouseOver() then trackCol = brighten(trackCol, 15) end

        gfx.setColour(trackCol)
        gfx.fillRoundedRect(trackX, trackY, trackW, trackH, trackR)

        -- Thumb
        local thumbR = trackH - 4
        local thumbX = _value and (trackX + trackW - thumbR - 2) or (trackX + 2)
        local thumbY = trackY + 2
        gfx.setColour(0xffe2e8f0)
        gfx.fillRoundedRect(thumbX, thumbY, thumbR, thumbR, thumbR / 2)

        -- Label
        gfx.setColour(_value and 0xffe2e8f0 or 0xff94a3b8)
        gfx.setFont(12.0)
        gfx.drawText(_label, 6, 0, trackX - 10, h, Justify.centredLeft)
    end)

    return {
        node = node,
        getValue = function() return _value end,
        setValue = function(v) _value = v end,
        setOnChange = function(fn) _on_change = fn end,
        setLabel = function(l) _label = l end,
    }
end

-- ============================================================================
-- Dropdown: click to show options list
-- ============================================================================
-- Usage:
--   local d = Widgets.Dropdown(parent, "mode", {
--       options = {"First Loop", "Free Mode", "Traditional"},
--       selected = 1,
--       on_select = function(idx, label) ... end,
--   })
--   d.setSelected(2)

function Widgets.Dropdown(parent, name, config)
    config = config or {}
    local node = parent:addChild(name)

    local _options = config.options or {}
    local _selected = config.selected or 1
    local _on_select = config.on_select
    local _bg = colour(config.bg, 0xff1e293b)
    local _colour = colour(config.colour, 0xff38bdf8)
    local _open = false
    local _overlay = nil

    local function getSelectedLabel()
        return _options[_selected] or "---"
    end

    local function closeDropdown()
        if _overlay then
            -- Remove overlay children
            _overlay:setOnDraw(nil)
            _overlay:setOnClick(nil)
            _overlay:setBounds(0, 0, 0, 0)
            _open = false
        end
    end

    local function openDropdown()
        if _open then closeDropdown(); return end
        _open = true
        -- Create overlay as child of the dropdown node
        if not _overlay then
            _overlay = node:addChild(name .. "_overlay")
        end
        local itemH = 28
        local overlayH = #_options * itemH + 4
        _overlay:setBounds(0, node:getHeight(), node:getWidth(), overlayH)

        _overlay:setOnDraw(function(self)
            local w = self:getWidth()
            local h = self:getHeight()
            gfx.setColour(0xff1e293b)
            gfx.fillRoundedRect(0, 0, w, h, 6)
            gfx.setColour(0xff334155)
            gfx.drawRoundedRect(0, 0, w, h, 6, 1)

            for i, opt in ipairs(_options) do
                local y = 2 + (i - 1) * itemH
                local isSel = (i == _selected)
                if isSel then
                    gfx.setColour(0xff334155)
                    gfx.fillRect(2, y, w - 4, itemH)
                end
                gfx.setColour(isSel and _colour or 0xffe2e8f0)
                gfx.setFont(12.0)
                gfx.drawText(opt, 10, y, w - 20, itemH, Justify.centredLeft)
            end
        end)

        _overlay:setOnClick(function()
            -- Approximate which option was clicked based on last mouse position
            -- Since we don't have mouse position in onClick, we'll use a simple approach
            -- Close and cycle to next for now — better approach would use onMouseDown
            closeDropdown()
        end)

        -- Use onMouseDown for precise item selection
        _overlay:setOnMouseDown(function(mx, my)
            local itemH2 = 28
            local idx = math.floor((my - 2) / itemH2) + 1
            if idx >= 1 and idx <= #_options then
                _selected = idx
                if _on_select then _on_select(_selected, _options[_selected]) end
            end
            closeDropdown()
        end)
    end

    node:setOnClick(function()
        openDropdown()
    end)

    node:setOnDraw(function(self)
        local w = self:getWidth()
        local h = self:getHeight()
        local bg = self:isMouseOver() and brighten(_bg, 15) or _bg

        gfx.setColour(bg)
        gfx.fillRoundedRect(1, 1, w - 2, h - 2, 6)
        gfx.setColour(brighten(bg, 30))
        gfx.drawRoundedRect(1, 1, w - 2, h - 2, 6, 1)

        -- Selected text
        gfx.setColour(0xffe2e8f0)
        gfx.setFont(12.0)
        gfx.drawText(getSelectedLabel(), 10, 0, w - 30, h, Justify.centredLeft)

        -- Arrow indicator
        gfx.setColour(0xff94a3b8)
        gfx.setFont(10.0)
        gfx.drawText(_open and "▲" or "▼", w - 22, 0, 16, h, Justify.centred)
    end)

    return {
        node = node,
        getSelected = function() return _selected end,
        getSelectedLabel = getSelectedLabel,
        setSelected = function(idx)
            _selected = clamp(idx, 1, #_options)
        end,
        setOptions = function(opts) _options = opts end,
        setOnSelect = function(fn) _on_select = fn end,
    }
end

-- ============================================================================
-- WaveformView: reusable peak data visualizer with playhead
-- ============================================================================
-- Usage:
--   local wv = Widgets.WaveformView(parent, "waveform", {
--       colour = 0xff22d3ee,
--       bg = 0xff0b1220,
--       mode = "layer",        -- "layer" or "capture"
--   })
--   -- In ui_update:
--   wv.setLayerIndex(0)
--   wv.setPlayheadPos(0.5)  -- 0..1

function Widgets.WaveformView(parent, name, config)
    config = config or {}
    local node = parent:addChild(name)
    node:setInterceptsMouse(false, false)

    local _colour = colour(config.colour, 0xff22d3ee)
    local _bg = colour(config.bg, 0xff0b1220)
    local _mode = config.mode or "layer"  -- "layer" or "capture"
    local _layerIdx = config.layerIndex or 0
    local _playheadPos = -1  -- -1 = no playhead
    local _captureStart = 0
    local _captureEnd = 0

    node:setOnDraw(function(self)
        local w = self:getWidth()
        local h = self:getHeight()
        if w < 4 or h < 4 then return end

        -- Background
        gfx.setColour(_bg)
        gfx.fillRoundedRect(0, 0, w, h, 4)
        gfx.setColour(0x30475569)
        gfx.drawRoundedRect(0, 0, w, h, 4, 1)

        -- Center line
        gfx.setColour(0x18ffffff)
        gfx.drawHorizontalLine(math.floor(h / 2), 2, w - 2)

        -- Peak data
        local numBuckets = math.min(w - 4, 200)
        local peaks = nil
        if _mode == "layer" then
            peaks = getLayerPeaks(_layerIdx, numBuckets)
        elseif _mode == "capture" and _captureEnd > _captureStart then
            peaks = getCapturePeaks(_captureStart, _captureEnd, numBuckets)
        end

        if peaks and #peaks > 0 then
            gfx.setColour(_colour)
            local centerY = h / 2
            local gain = h * 0.43
            for x = 1, #peaks do
                local peak = peaks[x]
                local ph = peak * gain
                local px = 2 + (x - 1) * ((w - 4) / #peaks)
                gfx.drawVerticalLine(math.floor(px), centerY - ph, centerY + ph)
            end
        end

        -- Playhead
        if _playheadPos >= 0 and _playheadPos <= 1 then
            local phX = 2 + math.floor(_playheadPos * (w - 4))
            gfx.setColour(0xffff4d4d)
            gfx.drawVerticalLine(phX, 1, h - 1)
        end
    end)

    return {
        node = node,
        setLayerIndex = function(idx) _layerIdx = idx; _mode = "layer" end,
        setCaptureRange = function(startAgo, endAgo)
            _captureStart = startAgo
            _captureEnd = endAgo
            _mode = "capture"
        end,
        setPlayheadPos = function(p) _playheadPos = p end,
        setColour = function(c) _colour = c end,
    }
end

return Widgets
