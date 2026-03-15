local W = require("ui_widgets")
local Base = require("shell.base_utils")
local nowSeconds = Base.nowSeconds

local Benchmark = {}
Benchmark.__index = Benchmark

function Benchmark.new()
    local self = setmetatable({}, Benchmark)
    self.root = nil
    self.panel = nil
    self.header = nil
    self.statsLabel = nil
    self.fpsLabel = nil
    self.animLabel = nil
    self.spawn1k = nil
    self.spawn5k = nil
    self.spawn10k = nil
    self.spawn50k = nil
    self.clearBtn = nil
    self.animBtn = nil
    self.viewport = nil
    self.entityLayer = nil

    self.count = 0
    self.frames = 0
    self.lastFps = 0
    self.lastFpsTime = nowSeconds()
    self.isAnimating = false
    self.lastSpawnMs = 0.0
    self.lastClearMs = 0.0
    self.lastAnimMs = 0.0
    self.animPhase = 0.0
    self.animNodes = {}
    return self
end

function Benchmark:ensureUi(parent)
    if self.panel ~= nil then
        return
    end

    self.root = parent

    self.panel = W.Panel.new(parent, "benchmarkPanel", {
        bg = 0xff111827,
        radius = 0,
    })

    self.header = W.Panel.new(self.panel.node, "benchmarkHeader", {
        bg = 0xff1f2937,
        radius = 0,
    })

    self.spawn1k = W.Button.new(self.header.node, "spawn1k", {
        label = "Spawn 1k",
        on_click = function() self:spawnNodes(1000) end,
    })

    self.spawn5k = W.Button.new(self.header.node, "spawn5k", {
        label = "Spawn 5k",
        on_click = function() self:spawnNodes(5000) end,
    })

    self.spawn10k = W.Button.new(self.header.node, "spawn10k", {
        label = "Spawn 10k",
        on_click = function() self:spawnNodes(10000) end,
    })

    self.spawn50k = W.Button.new(self.header.node, "spawn50k", {
        label = "Spawn 50k",
        on_click = function() self:spawnNodes(50000) end,
    })

    self.clearBtn = W.Button.new(self.header.node, "clear", {
        label = "Clear",
        on_click = function() self:clearNodes() end,
    })

    self.animBtn = W.Button.new(self.header.node, "animate", {
        label = "Anim: OFF",
        on_click = function()
            self.isAnimating = not self.isAnimating
            self.animBtn:setLabel(self.isAnimating and "Anim: ON" or "Anim: OFF")
            self:updateStatsLabel()
        end,
    })

    self.statsLabel = W.Label.new(self.header.node, "stats", {
        text = "Ready. 0 nodes.",
        colour = 0xffffffff,
        fontSize = 14,
        justification = Justify.centredLeft,
    })

    self.animLabel = W.Label.new(self.header.node, "animStats", {
        text = "Anim: 0.00 ms",
        colour = 0xff93c5fd,
        fontSize = 14,
        justification = Justify.centredLeft,
    })

    self.fpsLabel = W.Label.new(self.header.node, "fps", {
        text = "FPS: 0",
        colour = 0xff86efac,
        fontSize = 14,
        justification = Justify.centredRight,
    })

    self.viewport = W.Panel.new(self.panel.node, "benchmarkViewport", {
        bg = 0xff020617,
        border = 0xff334155,
        borderWidth = 1,
        radius = 0,
    })

    self.entityLayer = self.viewport.node:createChild("entityLayer")
    self.entityLayer:setBounds(0, 0, 0, 0)
    self:updateStatsLabel()
end

function Benchmark:updateStatsLabel()
    if self.statsLabel == nil then
        return
    end

    local status = string.format(
        "Nodes: %d  Spawn: %.2f ms  Clear: %.2f ms  Mode: %s",
        self.count,
        self.lastSpawnMs,
        self.lastClearMs,
        self.isAnimating and "animating" or "idle"
    )
    self.statsLabel:setText(status)

    if self.animLabel ~= nil then
        self.animLabel:setText(string.format("Anim: %.2f ms", self.lastAnimMs))
    end
end

function Benchmark:clearNodes()
    local start = nowSeconds()
    if self.entityLayer ~= nil then
        self.entityLayer:clearChildren()
    end
    self.animNodes = {}
    self.count = 0
    self.isAnimating = false
    self.lastClearMs = (nowSeconds() - start) * 1000.0
    self.lastAnimMs = 0.0
    if self.animBtn ~= nil then
        self.animBtn:setLabel("Anim: OFF")
    end
    self:updateStatsLabel()
end

function Benchmark:spawnNodes(num)
    self:clearNodes()

    local start = nowSeconds()
    local w = self.viewport.node:getWidth()
    local h = self.viewport.node:getHeight()
    if w <= 12 then w = 800 end
    if h <= 12 then h = 500 end

    for i = 1, num do
        local node = self.entityLayer:createChild("entity_" .. i)
        local bx = math.random(0, math.max(0, w - 10))
        local by = math.random(0, math.max(0, h - 10))
        local size = 8 + (i % 3)
        local colour = 0xff000000
            + ((37 * i) % 255) * 0x10000
            + ((71 * i) % 255) * 0x100
            + ((113 * i) % 255)

        node:setBounds(bx, by, size, size)
        node:setDisplayList({
            {
                cmd = "fillRect",
                x = 0,
                y = 0,
                w = size,
                h = size,
                color = colour,
            }
        })

        self.animNodes[i] = {
            node = node,
            bx = bx,
            by = by,
            size = size,
            phase = (i % 1024) * 0.013,
            radius = 6 + (i % 23),
        }
    end

    self.count = num
    self.lastSpawnMs = (nowSeconds() - start) * 1000.0
    self:updateStatsLabel()
end

function Benchmark:resized(w, h)
    self:ensureUi(self.root)
    if self.panel == nil then
        return
    end

    local width = math.max(1, math.floor(w or 0))
    local height = math.max(1, math.floor(h or 0))
    local headerH = 64

    self.panel:setBounds(0, 0, width, height)
    self.header:setBounds(0, 0, width, headerH)
    self.viewport:setBounds(0, headerH, width, math.max(0, height - headerH))
    self.entityLayer:setBounds(0, 0, self.viewport.node:getWidth(), self.viewport.node:getHeight())

    local x = 8
    local y = 8
    local buttonW = 86
    local buttonH = 22
    local gap = 6

    self.spawn1k:setBounds(x, y, buttonW, buttonH)
    x = x + buttonW + gap
    self.spawn5k:setBounds(x, y, buttonW, buttonH)
    x = x + buttonW + gap
    self.spawn10k:setBounds(x, y, buttonW, buttonH)
    x = x + buttonW + gap
    self.spawn50k:setBounds(x, y, buttonW, buttonH)
    x = x + buttonW + gap
    self.clearBtn:setBounds(x, y, 70, buttonH)
    x = x + 70 + gap
    self.animBtn:setBounds(x, y, 92, buttonH)

    self.statsLabel:setBounds(8, 34, math.max(120, width - 220), 20)
    self.animLabel:setBounds(math.max(8, width - 320), 34, 130, 20)
    self.fpsLabel:setBounds(math.max(8, width - 160), 8, 152, 20)
end

function Benchmark:update()
    self.frames = self.frames + 1
    local now = nowSeconds()

    if self.isAnimating and self.count > 0 then
        local start = nowSeconds()
        self.animPhase = self.animPhase + 0.055
        for i = 1, self.count do
            local item = self.animNodes[i]
            local px = item.bx + math.sin(self.animPhase + item.phase) * item.radius
            local py = item.by + math.cos(self.animPhase * 0.85 + item.phase) * item.radius
            item.node:setBounds(math.floor(px), math.floor(py), item.size, item.size)
        end
        self.lastAnimMs = (nowSeconds() - start) * 1000.0
    end

    if now - self.lastFpsTime >= 1.0 then
        self.lastFps = self.frames
        self.frames = 0
        self.lastFpsTime = now
        if self.fpsLabel ~= nil then
            self.fpsLabel:setText(string.format("FPS: %d", self.lastFps))
        end
        self:updateStatsLabel()
    end
end

function Benchmark:destroy()
    self:clearNodes()
end

local benchmark = Benchmark.new()
local usingShellPerformanceView = false

function ui_init(root)
    if shell and type(shell.registerPerformanceView) == "function" then
        usingShellPerformanceView = true
        shell:registerPerformanceView({
            init = function(contentRoot)
                benchmark.root = contentRoot
                benchmark:ensureUi(contentRoot)
            end,
            getLayoutInfo = function(fallbackW, fallbackH)
                return {
                    mode = "fill",
                    designW = fallbackW,
                    designH = fallbackH,
                }
            end,
            resized = function(x, y, w, h)
                local _ = x
                _ = y
                benchmark:resized(w, h)
            end,
            update = function(_changedPaths)
            end,
        })
        return
    end

    benchmark.root = root
    benchmark:ensureUi(root)
    benchmark:resized(root:getWidth(), root:getHeight())
end

function ui_resized(w, h)
    if usingShellPerformanceView then
        return
    end
    benchmark:resized(w, h)
end

function ui_update()
    benchmark:update()
end

function ui_cleanup()
    benchmark:destroy()
end
