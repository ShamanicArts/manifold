-- waveform.lua
-- Waveform view widget with scrubbing support

local BaseWidget = require("widgets.base")
local Utils = require("widgets.utils")
local Schema = require("widgets.schema")

local WaveformView = BaseWidget:extend()

local WAVEFORM_REDRAW_INTERVAL = 0.10
local WAVEFORM_MAX_BUCKETS = 96

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

local function waveformBucketCount(width)
    return math.min(math.max(1, width - 4), WAVEFORM_MAX_BUCKETS)
end

function WaveformView.new(parent, name, config)
    local self = setmetatable(BaseWidget.new(parent, name, config), WaveformView)

    self._colour = Utils.colour(config.colour, 0xff22d3ee)
    self._bg = Utils.colour(config.bg, 0xff0b1220)
    self._playheadColour = Utils.colour(config.playheadColour, 0xffff4d4d)
    self._mode = config.mode or "layer"
    self._layerIdx = config.layerIndex or 0
    self._playheadPos = -1
    self._captureStart = 0
    self._captureEnd = 0
    self._onScrubStart = config.on_scrub_start or config.onScrubStart
    self._onScrubSnap = config.on_scrub_snap or config.onScrubSnap
    self._onScrubSpeed = config.on_scrub_speed or config.onScrubSpeed
    self._onScrubEnd = config.on_scrub_end or config.onScrubEnd
    self._scrubbing = false
    self._lastScrubX = 0

    if self._onScrubStart or self._onScrubSnap then
        self.node:setInterceptsMouse(true, false)
    else
        self.node:setInterceptsMouse(false, false)
    end

    self:_storeEditorMeta("WaveformView", {
        on_scrub_start = self._onScrubStart,
        on_scrub_snap = self._onScrubSnap,
        on_scrub_speed = self._onScrubSpeed,
        on_scrub_end = self._onScrubEnd
    }, Schema.buildEditorSchema("WaveformView", config))

    local wfSelf = self
    self.node:setOnMouseDown(function(mx, my)
        if wfSelf._scrubbing then
            local w = wfSelf.node:getWidth()
            if w > 4 then
                local pos = math.max(0, math.min(1, (mx - 2) / (w - 4)))
                wfSelf._lastScrubPos = pos
                if wfSelf._onScrubSnap then
                    wfSelf._onScrubSnap(pos, 0)
                end
            end
            return
        end

        wfSelf._scrubbing = true
        wfSelf:_syncRetained()
        wfSelf.node:repaint()
        if wfSelf._onScrubStart then
            wfSelf._onScrubStart()
        end
        local w = wfSelf.node:getWidth()
        if w > 4 then
            local pos = math.max(0, math.min(1, (mx - 2) / (w - 4)))
            wfSelf._lastScrubPos = pos
            if wfSelf._onScrubSnap then
                wfSelf._onScrubSnap(pos, 0)
            end
        end
    end)

    self.node:setOnMouseDrag(function(mx, my, dx, dy)
        if not wfSelf._scrubbing then return end
        local w = wfSelf.node:getWidth()
        if w <= 4 then return end
        local pos = math.max(0, math.min(1, (mx - 2) / (w - 4)))
        local delta = 0
        if wfSelf._lastScrubPos then
            delta = pos - wfSelf._lastScrubPos
        end
        wfSelf._lastScrubPos = pos
        if wfSelf._onScrubSnap then
            wfSelf._onScrubSnap(pos, delta)
        end
    end)

    self.node:setOnMouseUp(function(mx, my)
        if wfSelf._scrubbing then
            wfSelf._scrubbing = false
            wfSelf._lastScrubPos = nil
            wfSelf:_syncRetained()
            wfSelf.node:repaint()
            if wfSelf._onScrubEnd then
                wfSelf._onScrubEnd()
            end
        end
    end)

    self:_syncRetained()

    local shell = (type(_G) == "table") and _G.shell or nil
    if type(shell) == "table" and type(shell.registerAnimatedWidget) == "function" then
        shell:registerAnimatedWidget(self)
    end

    return self
end

function WaveformView:onDraw(w, h)
    if w < 4 or h < 4 then return end

    gfx.setColour(self._bg)
    gfx.fillRoundedRect(0, 0, w, h, 4)
    gfx.setColour(self._scrubbing and 0x50475569 or 0x30475569)
    gfx.drawRoundedRect(0, 0, w, h, 4, self._scrubbing and 2 or 1)

    gfx.setColour(0x18ffffff)
    gfx.drawHorizontalLine(math.floor(h / 2), 2, w - 2)

    local numBuckets = waveformBucketCount(w)
    local peaks = nil

    if self._mode == "layer" then
        peaks = getLayerPeaks(self._layerIdx, numBuckets)
    elseif self._mode == "capture" and self._captureEnd > self._captureStart then
        peaks = getCapturePeaks(math.floor(self._captureStart), math.floor(self._captureEnd), numBuckets)
    end

    if peaks and #peaks > 0 then
        gfx.setColour(self._colour)
        local centerY = h / 2
        local gain = h * 0.43
        for x = 1, #peaks do
            local peak = peaks[x]
            local ph = peak * gain
            local px = 2 + (x - 1) * ((w - 4) / #peaks)
            gfx.drawVerticalLine(math.floor(px), centerY - ph, centerY + ph)
        end
    end

    if self._playheadPos >= 0 and self._playheadPos <= 1 then
        local phX = 2 + math.floor(self._playheadPos * (w - 4))
        gfx.setColour(self._scrubbing and 0xffffff00 or self._playheadColour)
        gfx.drawVerticalLine(phX, 1, h - 1)
    end
end

function WaveformView:tickRetained(dt)
    local _ = dt
    local now = getTime and getTime() or 0
    if not self._scrubbing and now - (self._lastRetainedSync or 0) < WAVEFORM_REDRAW_INTERVAL then
        return
    end
    self:_syncRetained()
end

function WaveformView:_syncRetained(w, h)
    self._lastRetainedSync = getTime and getTime() or self._lastRetainedSync or 0
    local _, _, bw, bh = self.node:getBounds()
    w = w or bw or 0
    h = h or bh or 0
    if w < 4 or h < 4 then
        self.node:clearDisplayList()
        return
    end

    local display = {
        {
            cmd = "fillRoundedRect",
            x = 0,
            y = 0,
            w = w,
            h = h,
            radius = 4,
            color = self._bg,
        },
        {
            cmd = "drawRoundedRect",
            x = 0,
            y = 0,
            w = w,
            h = h,
            radius = 4,
            thickness = self._scrubbing and 2 or 1,
            color = self._scrubbing and 0x50475569 or 0x30475569,
        },
        {
            cmd = "drawLine",
            x1 = 2,
            y1 = math.floor(h / 2),
            x2 = w - 2,
            y2 = math.floor(h / 2),
            thickness = 1,
            color = 0x18ffffff,
        }
    }

    local numBuckets = waveformBucketCount(w)
    local peaks = nil
    if self._mode == "layer" then
        peaks = getLayerPeaks(self._layerIdx, numBuckets)
    elseif self._mode == "capture" and self._captureEnd > self._captureStart then
        peaks = getCapturePeaks(math.floor(self._captureStart), math.floor(self._captureEnd), numBuckets)
    end

    if peaks and #peaks > 0 then
        local centerY = h / 2
        local gain = h * 0.43
        for x = 1, #peaks do
            local peak = peaks[x]
            local ph = peak * gain
            local px = 2 + (x - 1) * ((w - 4) / #peaks)
            pushLine(display, math.floor(px), centerY - ph, math.floor(px), centerY + ph, self._colour, 1.0)
        end
    end

    if self._playheadPos >= 0 and self._playheadPos <= 1 then
        local phX = 2 + math.floor(self._playheadPos * (w - 4))
        pushLine(display, phX, 1, phX, h - 1, self._scrubbing and 0xffffff00 or self._playheadColour, 1.0)
    end

    setTransparentStyle(self.node)
    self.node:setDisplayList(display)
end

function WaveformView:setLayerIndex(idx)
    local nextIdx = idx or 0
    if self._layerIdx == nextIdx and self._mode == "layer" then
        return
    end
    self._layerIdx = nextIdx
    self._mode = "layer"
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:setCaptureRange(startAgo, endAgo)
    local nextStart = startAgo or 0
    local nextEnd = endAgo or 0
    if self._captureStart == nextStart and self._captureEnd == nextEnd and self._mode == "capture" then
        return
    end
    self._captureStart = nextStart
    self._captureEnd = nextEnd
    self._mode = "capture"
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:setPlayheadPos(pos)
    local nextPos = pos
    if self._playheadPos == nextPos then
        return
    end
    self._playheadPos = nextPos
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:setColour(colour)
    if self._colour == colour then
        return
    end
    self._colour = colour
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:cleanup()
    local shell = (type(_G) == "table") and _G.shell or nil
    if type(shell) == "table" and type(shell.unregisterAnimatedWidget) == "function" then
        shell:unregisterAnimatedWidget(self)
    end
end

return WaveformView
