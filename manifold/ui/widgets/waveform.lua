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
    self._voicePlayheads = {}
    self._voiceGrains = {}
    self._voiceColours = config.voiceColours or { 0xffff5c8a, 0xff60a5fa, 0xff86efac, 0xffffcc66, 0xffc084fc, 0xff22d3ee, 0xfffb7185, 0xffa3e635 }
    self._regionStart = -1
    self._regionEnd = -1
    self._playStart = -1
    self._grainPosition = -1
    self._sprayAmount = 0
    self._grainPositions = {}
    self._crossfade = 0
    self._captureStart = config.captureStart or 0
    self._captureEnd = config.captureEnd or 0
    self._capturePath = config.capturePath
    self._samplePath = config.samplePath
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
    elseif self._mode == "capturePath" and self._capturePath and self._captureEnd > self._captureStart and type(getCapturePeaksAtPath) == "function" then
        peaks = getCapturePeaksAtPath(self._capturePath, math.floor(self._captureStart), math.floor(self._captureEnd), numBuckets)
    elseif self._mode == "samplePath" and self._samplePath and type(getSampleRegionPeaksAtPath) == "function" then
        peaks = getSampleRegionPeaksAtPath(self._samplePath, numBuckets)
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

    if self._regionStart >= 0 and self._regionEnd > self._regionStart then
        local x1 = 2 + math.floor(self._regionStart * (w - 4))
        local x2 = 2 + math.floor(self._regionEnd * (w - 4))
        gfx.setColour(0x2260a5fa)
        gfx.fillRect(x1, 1, math.max(1, x2 - x1), h - 2)
        gfx.setColour(0xff60a5fa)
        gfx.drawVerticalLine(x1, 1, h - 1)
        gfx.drawVerticalLine(x2, 1, h - 1)
    end

    if self._crossfade > 0 and self._regionStart >= 0 and self._regionEnd > self._regionStart then
        local len = self._regionEnd - self._regionStart
        local xf = math.min(len * 0.5, self._crossfade * len)
        local xs1 = 2 + math.floor(self._regionStart * (w - 4))
        local xe1 = 2 + math.floor((self._regionStart + xf) * (w - 4))
        local xs2 = 2 + math.floor((self._regionEnd - xf) * (w - 4))
        local xe2 = 2 + math.floor(self._regionEnd * (w - 4))
        gfx.setColour(0x33ffffff)
        gfx.fillRect(xs1, 1, math.max(1, xe1 - xs1), h - 2)
        gfx.fillRect(xs2, 1, math.max(1, xe2 - xs2), h - 2)
    end

    if self._playStart >= 0 and self._playStart <= 1 then
        local psX = 2 + math.floor(self._playStart * (w - 4))
        gfx.setColour(0xff86efac)
        gfx.drawVerticalLine(psX, 1, h - 1)
    end

    for voiceIndex, grains in ipairs(self._voiceGrains or {}) do
        local colour = self._voiceColours[((voiceIndex - 1) % #self._voiceColours) + 1] or 0x99ffcc66
        for i, p in ipairs(grains or {}) do
            if p >= 0 and p <= 1 then
                local gx = 2 + math.floor(p * (w - 4))
                local gy1 = 5 + (((voiceIndex * 13) + (i * 7)) % math.max(1, h - 14))
                gfx.setColour(colour)
                gfx.drawVerticalLine(gx, gy1, math.min(h - 4, gy1 + 7))
            end
        end
    end

    for i, p in ipairs(self._grainPositions or {}) do
        if p >= 0 and p <= 1 then
            local gx = 2 + math.floor(p * (w - 4))
            local gy1 = 5 + ((i * 7) % math.max(1, h - 14))
            gfx.setColour(0x99ffcc66)
            gfx.drawVerticalLine(gx, gy1, math.min(h - 4, gy1 + 6))
        end
    end

    if self._grainPosition >= 0 and self._grainPosition <= 1 then
        local gX = 2 + math.floor(self._grainPosition * (w - 4))
        gfx.setColour(0xffffcc66)
        gfx.drawVerticalLine(gX, 1, h - 1)
    end

    for i, p in ipairs(self._voicePlayheads or {}) do
        if p >= 0 and p <= 1 then
            local vX = 2 + math.floor(p * (w - 4))
            gfx.setColour(self._voiceColours[((i - 1) % #self._voiceColours) + 1] or (i == 1 and self._playheadColour or 0x99ff8888))
            gfx.drawVerticalLine(vX, 1, h - 1)
        end
    end

    if self._playheadPos >= 0 and self._playheadPos <= 1 and #(self._voicePlayheads or {}) == 0 then
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
    elseif self._mode == "capturePath" and self._capturePath and self._captureEnd > self._captureStart and type(getCapturePeaksAtPath) == "function" then
        peaks = getCapturePeaksAtPath(self._capturePath, math.floor(self._captureStart), math.floor(self._captureEnd), numBuckets)
    elseif self._mode == "samplePath" and self._samplePath and type(getSampleRegionPeaksAtPath) == "function" then
        peaks = getSampleRegionPeaksAtPath(self._samplePath, numBuckets)
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

    if self._regionStart >= 0 and self._regionEnd > self._regionStart then
        local x1 = 2 + math.floor(self._regionStart * (w - 4))
        local x2 = 2 + math.floor(self._regionEnd * (w - 4))
        display[#display + 1] = { cmd = "fillRect", x = x1, y = 1, w = math.max(1, x2 - x1), h = h - 2, color = 0x2260a5fa }
        pushLine(display, x1, 1, x1, h - 1, 0xff60a5fa, 1.0)
        pushLine(display, x2, 1, x2, h - 1, 0xff60a5fa, 1.0)
    end

    if self._crossfade > 0 and self._regionStart >= 0 and self._regionEnd > self._regionStart then
        local len = self._regionEnd - self._regionStart
        local xf = math.min(len * 0.5, self._crossfade * len)
        local xs1 = 2 + math.floor(self._regionStart * (w - 4))
        local xe1 = 2 + math.floor((self._regionStart + xf) * (w - 4))
        local xs2 = 2 + math.floor((self._regionEnd - xf) * (w - 4))
        local xe2 = 2 + math.floor(self._regionEnd * (w - 4))
        display[#display + 1] = { cmd = "fillRect", x = xs1, y = 1, w = math.max(1, xe1 - xs1), h = h - 2, color = 0x33ffffff }
        display[#display + 1] = { cmd = "fillRect", x = xs2, y = 1, w = math.max(1, xe2 - xs2), h = h - 2, color = 0x33ffffff }
    end

    if self._playStart >= 0 and self._playStart <= 1 then
        local psX = 2 + math.floor(self._playStart * (w - 4))
        pushLine(display, psX, 1, psX, h - 1, 0xff86efac, 1.0)
    end

    for voiceIndex, grains in ipairs(self._voiceGrains or {}) do
        local colour = self._voiceColours[((voiceIndex - 1) % #self._voiceColours) + 1] or 0x99ffcc66
        for i, p in ipairs(grains or {}) do
            if p >= 0 and p <= 1 then
                local gx = 2 + math.floor(p * (w - 4))
                local gy1 = 5 + (((voiceIndex * 13) + (i * 7)) % math.max(1, h - 14))
                pushLine(display, gx, gy1, gx, math.min(h - 4, gy1 + 7), colour, 1.0)
            end
        end
    end

    for i, p in ipairs(self._grainPositions or {}) do
        if p >= 0 and p <= 1 then
            local gx = 2 + math.floor(p * (w - 4))
            local gy1 = 5 + ((i * 7) % math.max(1, h - 14))
            pushLine(display, gx, gy1, gx, math.min(h - 4, gy1 + 6), 0x99ffcc66, 1.0)
        end
    end

    if self._grainPosition >= 0 and self._grainPosition <= 1 then
        local gX = 2 + math.floor(self._grainPosition * (w - 4))
        pushLine(display, gX, 1, gX, h - 1, 0xffffcc66, 1.0)
    end

    local voiceCount = #(self._voicePlayheads or {})
    for i, p in ipairs(self._voicePlayheads or {}) do
        if p >= 0 and p <= 1 then
            local vX = 2 + math.floor(p * (w - 4))
            pushLine(display, vX, 1, vX, h - 1, self._voiceColours[((i - 1) % #self._voiceColours) + 1] or (i == 1 and self._playheadColour or 0x99ff8888), 1.0)
        end
    end

    if self._playheadPos >= 0 and self._playheadPos <= 1 and voiceCount == 0 then
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

function WaveformView:setCapturePath(path, startAgo, endAgo)
    local nextPath = path
    local nextStart = startAgo or self._captureStart or 0
    local nextEnd = endAgo or self._captureEnd or 0
    if self._capturePath == nextPath and self._captureStart == nextStart and self._captureEnd == nextEnd and self._mode == "capturePath" then
        return
    end
    self._capturePath = nextPath
    self._captureStart = nextStart
    self._captureEnd = nextEnd
    self._mode = "capturePath"
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:setSamplePath(path)
    local nextPath = path
    if self._samplePath == nextPath and self._mode == "samplePath" then
        return
    end
    self._samplePath = nextPath
    self._mode = "samplePath"
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:setRegion(startPos, endPos)
    local s = math.max(0, math.min(1, startPos or -1))
    local e = math.max(0, math.min(1, endPos or -1))
    if self._regionStart == s and self._regionEnd == e then return end
    self._regionStart = s
    self._regionEnd = e
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:setPlayStart(pos)
    local nextPos = pos or -1
    if self._playStart == nextPos then return end
    self._playStart = nextPos
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:setGrainPosition(pos)
    local nextPos = pos or -1
    if self._grainPosition == nextPos then return end
    self._grainPosition = nextPos
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:setVoicePlayheads(positions)
    self._voicePlayheads = positions or {}
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:setVoiceGrains(groups)
    self._voiceGrains = groups or {}
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:setCrossfade(amount)
    local nextAmount = math.max(0, math.min(0.5, amount or 0))
    if self._crossfade == nextAmount then return end
    self._crossfade = nextAmount
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:setSpray(amount)
    local nextAmount = math.max(0, math.min(1, amount or 0))
    if self._sprayAmount == nextAmount then return end
    self._sprayAmount = nextAmount
    self:_syncRetained()
    self.node:repaint()
end

function WaveformView:setGrainPositions(positions)
    self._grainPositions = positions or {}
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
