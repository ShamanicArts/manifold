-- wiring_demo.lua
-- DEPRECATED: legacy DSP graph showcase UI kept as fallback/reference.
-- Active DSP authoring/testing now lives in dsp_live_scripting.lua.

local W = require("looper_widgets")

local ui = {}

local state = {
    oscNode = nil,
    reverbNode = nil,
    filterNode = nil,
    distortionNode = nil,
    chainConnected = false,
    graphEnabled = false,
    chainOrderIndex = 1,
    sourceModeIndex = 1,
    scrollNorm = 0.0,
    patchDirty = true,
    needsRelayout = false,
    lastAction = "ready",
}

local osc = {
    frequency = 440.0,
    amplitude = 0.25,
    enabled = true,
    waveform = 0,
}

local oscWaveforms = {
    "Sine (smooth)",
    "Saw",
    "Square",
    "Triangle",
    "Sine + Saw",
}

local rev = {
    roomSize = 0.88,
    damping = 0.25,
    wet = 0.60,
    dry = 0.22,
    width = 1.00,
}

local filt = {
    cutoff = 650.0,
    resonance = 0.20,
    mix = 1.0,
}

local dist = {
    drive = 5.0,
    mix = 0.55,
    output = 0.85,
}

local chainOrders = {
    "Reverb -> Filter -> Dist",
    "Reverb -> Dist -> Filter",
    "Filter -> Reverb -> Dist",
    "Filter -> Dist -> Reverb",
    "Dist -> Reverb -> Filter",
    "Dist -> Filter -> Reverb",
}

local sourceModes = {
    "Oscillator source (internal tone)",
    "Input source (looper/audio in)",
}

-- Example DSP scripts for testing - copy one to the code box and click "Run DSP Script"
local exampleScripts = {
    [[
-- Example 1: Simple Osc -> Filter -> Dist chain
local osc = ctx.primitives.OscillatorNode.new()
local filt = ctx.primitives.FilterNode.new()
local dist = ctx.primitives.DistortionNode.new()

ctx.graph.connect(osc, filt)
ctx.graph.connect(filt, dist)

ctx.params.register("/test/freq", { type="f", min=40, max=2000, default=440, description="Test freq" })
ctx.params.register("/test/drive", { type="f", min=1, max=20, default=5, description="Test drive" })

ctx.params.bind("/test/freq", osc, "setFrequency")
-- ctx.params.register("/test/shape", { type="f", min=0, max=4, default=0 })
-- ctx.params.bind("/test/shape", osc, "setWaveform")
ctx.params.bind("/test/drive", dist, "setDrive")
]],
    [[
-- Example 2: Osc -> Reverb only
local osc = ctx.primitives.OscillatorNode.new()
local rev = ctx.primitives.ReverbNode.new()

ctx.graph.connect(osc, rev)

-- ctx.params.register("/test/shape", { type="f", min=0, max=4, default=0 })
-- ctx.params.bind("/test/shape", osc, "setWaveform")
ctx.params.register("/test/room", { type="f", min=0, max=1, default=0.5 })
ctx.params.bind("/test/room", rev, "setRoomSize")
]],
    [[
-- Example 3: Three band filter with distortion
local osc = ctx.primitives.OscillatorNode.new()
local filt1 = ctx.primitives.FilterNode.new()
local filt2 = ctx.primitives.FilterNode.new()
local dist = ctx.primitives.DistortionNode.new()

ctx.graph.connect(osc, filt1)
ctx.graph.connect(filt1, filt2)
ctx.graph.connect(filt2, dist)

-- ctx.params.register("/test/shape", { type="f", min=0, max=4, default=0 })
-- ctx.params.bind("/test/shape", osc, "setWaveform")
-- Note: Each node is independent, params need individual paths
ctx.params.register("/test/cutoff1", { type="f", min=80, max=2000, default=500 })
ctx.params.bind("/test/cutoff1", filt1, "setCutoff")
]],
}

local scriptNames = {}
local scriptPaths = {}
local currentCode = exampleScripts[1]

local function safeCall(fn, default)
    local ok, value = pcall(fn)
    if ok then
        return value
    end
    return default
end

local function setLastAction(text)
    state.lastAction = text
end

local function markPatchDirty(v)
    state.patchDirty = v
end

local function setGraphEnabled(v)
    local ok = safeCall(function()
        return setParam("/looper/graph/enabled", v and 1.0 or 0.0)
    end, false)
    if ok then
        state.graphEnabled = v
        if v then
            markPatchDirty(false)
        end
        setLastAction(v and "graph enabled" or "graph disabled")
    else
        setLastAction("graph endpoint missing")
    end
end

local function refreshGraphEnabledFromEngine()
    local enabled = safeCall(function()
        return getParam("/looper/graph/enabled") > 0.5
    end, state.graphEnabled)
    state.graphEnabled = enabled
    if ui.graphToggle then
        ui.graphToggle:setValue(enabled)
    end
end

local function resetGraphState(clearEngineGraph)
    if clearEngineGraph then
        safeCall(function()
            clearGraph()
        end, nil)
    end

    state.oscNode = nil
    state.reverbNode = nil
    state.filterNode = nil
    state.distortionNode = nil
    state.chainConnected = false
    markPatchDirty(true)

    if ui.graphToggle then
        ui.graphToggle:setValue(false)
    end
    setGraphEnabled(false)
end

local function rebuildGraphNodes()
    safeCall(function()
        clearGraph()
    end, nil)
    state.oscNode = nil
    state.reverbNode = nil
    state.filterNode = nil
    state.distortionNode = nil
    state.chainConnected = false
end

local function getOrderedEffectNodes()
    if state.chainOrderIndex == 1 then
        return { state.reverbNode, state.filterNode, state.distortionNode }
    elseif state.chainOrderIndex == 2 then
        return { state.reverbNode, state.distortionNode, state.filterNode }
    elseif state.chainOrderIndex == 3 then
        return { state.filterNode, state.reverbNode, state.distortionNode }
    elseif state.chainOrderIndex == 4 then
        return { state.filterNode, state.distortionNode, state.reverbNode }
    elseif state.chainOrderIndex == 5 then
        return { state.distortionNode, state.reverbNode, state.filterNode }
    end
    return { state.distortionNode, state.filterNode, state.reverbNode }
end

local function getOrderedEffectLabels()
    if state.chainOrderIndex == 1 then
        return { "Reverb", "Filter", "Dist" }
    elseif state.chainOrderIndex == 2 then
        return { "Reverb", "Dist", "Filter" }
    elseif state.chainOrderIndex == 3 then
        return { "Filter", "Reverb", "Dist" }
    elseif state.chainOrderIndex == 4 then
        return { "Filter", "Dist", "Reverb" }
    elseif state.chainOrderIndex == 5 then
        return { "Dist", "Reverb", "Filter" }
    end
    return { "Dist", "Filter", "Reverb" }
end

local function sourceUsesOscillator()
    return state.sourceModeIndex == 1
end

local function getExpectedTopology()
    if sourceUsesOscillator() then
        return 4, 3
    end
    return 3, 2
end

local function applyOscParams()
    if not state.oscNode then
        return false
    end
    safeCall(function() state.oscNode:setFrequency(osc.frequency) end, nil)
    safeCall(function() state.oscNode:setAmplitude(osc.amplitude) end, nil)
    safeCall(function() state.oscNode:setEnabled(osc.enabled) end, nil)
    safeCall(function() state.oscNode:setWaveform(osc.waveform) end, nil)
    return true
end

local function applyReverbParams()
    if not state.reverbNode then
        return false
    end
    safeCall(function() state.reverbNode:setRoomSize(rev.roomSize) end, nil)
    safeCall(function() state.reverbNode:setDamping(rev.damping) end, nil)
    safeCall(function() state.reverbNode:setWetLevel(rev.wet) end, nil)
    safeCall(function() state.reverbNode:setDryLevel(rev.dry) end, nil)
    safeCall(function() state.reverbNode:setWidth(rev.width) end, nil)
    return true
end

local function applyFilterParams()
    if not state.filterNode then
        return false
    end
    safeCall(function() state.filterNode:setCutoff(filt.cutoff) end, nil)
    safeCall(function() state.filterNode:setResonance(filt.resonance) end, nil)
    safeCall(function() state.filterNode:setMix(filt.mix) end, nil)
    return true
end

local function applyDistortionParams()
    if not state.distortionNode then
        return false
    end
    safeCall(function() state.distortionNode:setDrive(dist.drive) end, nil)
    safeCall(function() state.distortionNode:setMix(dist.mix) end, nil)
    safeCall(function() state.distortionNode:setOutput(dist.output) end, nil)
    return true
end

local function ensureOscNode()
    if state.oscNode then
        return true
    end
    if not Primitives or not Primitives.OscillatorNode then
        setLastAction("OscillatorNode API missing")
        return false
    end

    state.oscNode = safeCall(function()
        return Primitives.OscillatorNode.new()
    end, nil)

    if not state.oscNode then
        setLastAction("failed to create oscillator")
        return false
    end

    applyOscParams()
    setLastAction("oscillator created")
    return true
end

local function ensureReverbNode()
    if state.reverbNode then
        return true
    end
    if not Primitives or not Primitives.ReverbNode then
        setLastAction("ReverbNode API missing")
        return false
    end

    state.reverbNode = safeCall(function()
        return Primitives.ReverbNode.new()
    end, nil)

    if not state.reverbNode then
        setLastAction("failed to create reverb")
        return false
    end

    applyReverbParams()
    setLastAction("reverb created")
    return true
end

local function ensureFilterNode()
    if state.filterNode then
        return true
    end
    if not Primitives or not Primitives.FilterNode then
        setLastAction("FilterNode API missing")
        return false
    end

    state.filterNode = safeCall(function()
        return Primitives.FilterNode.new()
    end, nil)

    if not state.filterNode then
        setLastAction("failed to create filter")
        return false
    end

    applyFilterParams()
    setLastAction("filter created")
    return true
end

local function ensureDistortionNode()
    if state.distortionNode then
        return true
    end
    if not Primitives or not Primitives.DistortionNode then
        setLastAction("DistortionNode API missing")
        return false
    end

    state.distortionNode = safeCall(function()
        return Primitives.DistortionNode.new()
    end, nil)

    if not state.distortionNode then
        setLastAction("failed to create distortion")
        return false
    end

    applyDistortionParams()
    setLastAction("distortion created")
    return true
end

local function connectChain()
    rebuildGraphNodes()

    if not ensureReverbNode() then
        return false
    end
    if not ensureFilterNode() then
        return false
    end
    if not ensureDistortionNode() then
        return false
    end

    local ordered = getOrderedEffectNodes()
    local prev = nil
    local startIndex = 1
    local ok = true

    if sourceUsesOscillator() then
        if not ensureOscNode() then
            return false
        end
        prev = state.oscNode
    else
        prev = ordered[1]
        startIndex = 2
    end

    for i = startIndex, #ordered do
        local node = ordered[i]
        local linked = safeCall(function()
            return connectNodes(prev, node)
        end, false)
        if not linked then
            ok = false
            break
        end
        prev = node
    end

    state.chainConnected = ok and true or false
    if state.chainConnected then
        markPatchDirty(true)
        if sourceUsesOscillator() then
            setLastAction("connected osc chain")
        else
            setLastAction("connected input chain")
        end
    else
        setLastAction("connect failed")
    end
    return state.chainConnected
end

local function buildAndEnable()
    local ok = connectChain()
    if ok then
        setGraphEnabled(true)
        if state.graphEnabled then
            markPatchDirty(false)
            setLastAction("chain live")
        end
    end
end

local function applyAllParams()
    local ok = true
    if sourceUsesOscillator() then
        ok = applyOscParams() and ok
    end
    ok = applyReverbParams() and ok
    ok = applyFilterParams() and ok
    ok = applyDistortionParams() and ok

    if ok then
        markPatchDirty(true)
        setLastAction("params pushed")
    else
        setLastAction("params push failed")
    end
    return ok
end

local function runSmokeTest()
    local originalOrder = state.chainOrderIndex
    local originalSource = state.sourceModeIndex
    local wasEnabled = state.graphEnabled
    local failures = 0

    local testCases = {
        { source = 1, order = 1 },
        { source = 1, order = 4 },
        { source = 2, order = 2 },
        { source = 2, order = 6 },
    }

    for i = 1, #testCases do
        local t = testCases[i]
        state.sourceModeIndex = t.source
        state.chainOrderIndex = t.order

        if not connectChain() then
            failures = failures + 1
        else
            setGraphEnabled(true)

            local nodes = safeCall(getGraphNodeCount, -1)
            local conns = safeCall(getGraphConnectionCount, -1)
            local hasCycleNow = safeCall(hasGraphCycle, true)
            local expectedNodes = t.source == 1 and 4 or 3
            local expectedConns = t.source == 1 and 3 or 2

            if nodes ~= expectedNodes or conns ~= expectedConns or hasCycleNow then
                failures = failures + 1
            end
        end
    end

    state.sourceModeIndex = originalSource
    state.chainOrderIndex = originalOrder
    if ui.sourceModeDropdown then
        ui.sourceModeDropdown:setSelected(state.sourceModeIndex)
    end
    if ui.chainOrderDropdown then
        ui.chainOrderDropdown:setSelected(state.chainOrderIndex)
    end

    connectChain()
    if wasEnabled then
        setGraphEnabled(true)
        markPatchDirty(false)
    else
        setGraphEnabled(false)
        markPatchDirty(true)
    end

    if failures == 0 then
        setLastAction("smoke test PASS")
    else
        setLastAction("smoke test FAIL x" .. tostring(failures))
    end
end

local function loadScriptList()
    scriptNames = {}
    scriptPaths = {}

    local scripts = safeCall(listUiScripts, {})
    for i = 1, #scripts do
        local s = scripts[i]
        if s and s.name and s.path then
            scriptNames[#scriptNames + 1] = s.name
            scriptPaths[#scriptPaths + 1] = s.path
        end
    end

    if #scriptNames == 0 then
        scriptNames = { "wiring_demo" }
        scriptPaths = { safeCall(getCurrentScriptPath, "") }
    end
end

local function setScrollNorm(v)
    state.scrollNorm = math.max(0.0, math.min(1.0, v))
    if ui.scrollSlider then
        ui.scrollSlider:setValue(state.scrollNorm)
    end
    if ui.rootPanel and ui.rootPanel.node then
        ui_resized(ui.rootPanel.node:getWidth(), ui.rootPanel.node:getHeight())
    end
end

local function updateStatusText()
    if not ui.statusLabel then
        return
    end

    local nodes = safeCall(getGraphNodeCount, 0)
    local conns = safeCall(getGraphConnectionCount, 0)
    local cycle = safeCall(hasGraphCycle, false)
    local graph = state.graphEnabled and "ON" or "OFF"
    local patch = state.patchDirty and "PENDING" or "LIVE"
    local source = sourceUsesOscillator() and "OSC" or "INPUT"
    local expectedNodes, expectedConns = getExpectedTopology()
    local msg = string.format(
        "nodes:%d/%d  conns:%d/%d  cycle:%s  graph:%s  patch:%s  src:%s  action:%s",
        nodes,
        expectedNodes,
        conns,
        expectedConns,
        cycle and "YES" or "NO",
        graph,
        patch,
        source,
        state.lastAction
    )
    ui.statusLabel:setText(msg)

    if ui.patchHint then
        if state.patchDirty then
            ui.patchHint:setText("Patch not applied: click Build + Enable Graph")
            ui.patchHint:setColour(0xfffca5a5)
        else
            if sourceUsesOscillator() then
                ui.patchHint:setText("Patch is live (oscillator source). Tweak controls in real time.")
            else
                ui.patchHint:setText("Patch is live (input source). Process incoming looper audio.")
            end
            ui.patchHint:setColour(0xff86efac)
        end
    end

    if ui.graphHelp then
        local labels = getOrderedEffectLabels()
        local sourceName = sourceUsesOscillator() and "Osc" or "Input"
        ui.graphHelp:setText(sourceName .. " -> " .. labels[1] .. " -> " .. labels[2] .. " -> " .. labels[3] .. " -> Out")
    end
end

local function buildUI(root)
    ui.rootPanel = W.Panel.new(root, "rootPanel", {
        bg = 0xff0a0f1a,
    })

    ui.headerPanel = W.Panel.new(ui.rootPanel.node, "header", {
        bg = 0xff111827,
        border = 0xff1f2937,
        borderWidth = 1,
    })

    ui.titleLabel = W.Label.new(ui.headerPanel.node, "title", {
        text = "DSP WIRING DEMO",
        colour = 0xff7dd3fc,
        fontSize = 20.0,
        fontStyle = FontStyle.bold,
    })

    ui.statusLabel = W.Label.new(ui.headerPanel.node, "status", {
        text = "initializing...",
        colour = 0xff94a3b8,
        fontSize = 12.0,
    })

    ui.patchHint = W.Label.new(ui.headerPanel.node, "patchHint", {
        text = "Patch not applied: click Build + Enable Graph",
        colour = 0xfffca5a5,
        fontSize = 11.0,
    })

    loadScriptList()
    ui.scriptDropdown = W.Dropdown.new(ui.headerPanel.node, "scriptDropdown", {
        options = scriptNames,
        selected = 1,
        bg = 0xff1e293b,
        colour = 0xff7dd3fc,
        rootNode = root,
        on_select = function(idx)
            local p = scriptPaths[idx]
            if p and p ~= "" then
                switchUiScript(p)
            end
        end,
    })

    ui.leftPanel = W.Panel.new(ui.rootPanel.node, "leftPanel", {
        bg = 0xff141a24,
        radius = 8,
    })

    ui.rightPanel = W.Panel.new(ui.rootPanel.node, "rightPanel", {
        bg = 0xff101722,
        radius = 8,
        border = 0xff223043,
        borderWidth = 1,
    })

    ui.createBtn = W.Button.new(ui.leftPanel.node, "createBtn", {
        label = "Create Nodes",
        bg = 0xff2563eb,
        on_click = function()
            local a = ensureOscNode()
            local b = ensureReverbNode()
            local c = ensureFilterNode()
            local d = ensureDistortionNode()
            if a and b and c and d then
                setLastAction("nodes ready")
            end
            updateStatusText()
        end,
    })

    ui.resetBtn = W.Button.new(ui.leftPanel.node, "resetBtn", {
        label = "Reset Graph",
        bg = 0xff475569,
        on_click = function()
            resetGraphState(true)
            setLastAction("graph reset")
            updateStatusText()
        end,
    })

    ui.connectBtn = W.Button.new(ui.leftPanel.node, "connectBtn", {
        label = "Connect Osc -> Reverb",
        bg = 0xff059669,
        on_click = function()
            connectChain()
            updateStatusText()
        end,
    })

    ui.liveBtn = W.Button.new(ui.leftPanel.node, "liveBtn", {
        label = "Build + Enable Graph",
        bg = 0xff7c3aed,
        on_click = function()
            buildAndEnable()
            updateStatusText()
        end,
    })

    ui.applyParamsBtn = W.Button.new(ui.leftPanel.node, "applyParamsBtn", {
        label = "Apply Params",
        bg = 0xff0ea5e9,
        on_click = function()
            applyAllParams()
            updateStatusText()
        end,
    })

    ui.smokeBtn = W.Button.new(ui.leftPanel.node, "smokeBtn", {
        label = "Run Smoke Test",
        bg = 0xff9333ea,
        on_click = function()
            runSmokeTest()
            updateStatusText()
        end,
    })

    ui.graphToggle = W.Toggle.new(ui.leftPanel.node, "graphToggle", {
        label = "Graph Processing",
        value = false,
        on_change = function(v)
            setGraphEnabled(v)
            updateStatusText()
        end,
    })

    ui.oscEnableToggle = W.Toggle.new(ui.leftPanel.node, "oscEnable", {
        label = "Oscillator Enabled",
        value = osc.enabled,
        on_change = function(v)
            osc.enabled = v
            applyOscParams()
            setLastAction(v and "osc enabled" or "osc disabled")
            updateStatusText()
        end,
    })

    ui.oscShapeDropdown = W.Dropdown.new(ui.leftPanel.node, "oscShape", {
        options = oscWaveforms,
        selected = osc.waveform + 1,
        bg = 0xff1f2937,
        colour = 0xff7dd3fc,
        rootNode = root,
        on_select = function(idx)
            osc.waveform = idx - 1
            applyOscParams()
            setLastAction("osc waveform")
            updateStatusText()
        end,
    })

    ui.chainOrderDropdown = W.Dropdown.new(ui.leftPanel.node, "chainOrder", {
        options = chainOrders,
        selected = state.chainOrderIndex,
        bg = 0xff1f2937,
        colour = 0xff93c5fd,
        rootNode = root,
        on_select = function(idx)
            state.chainOrderIndex = idx
            markPatchDirty(true)
            setLastAction("chain order changed")
            state.needsRelayout = true
            updateStatusText()
        end,
    })

    ui.sourceModeDropdown = W.Dropdown.new(ui.leftPanel.node, "sourceMode", {
        options = sourceModes,
        selected = state.sourceModeIndex,
        bg = 0xff1f2937,
        colour = 0xff67e8f9,
        rootNode = root,
        on_select = function(idx)
            state.sourceModeIndex = idx
            markPatchDirty(true)
            setLastAction("source mode changed")
            state.needsRelayout = true
            updateStatusText()
        end,
    })

    -- Clipping container for scrollable parameters
    ui.paramPanel = W.Panel.new(ui.leftPanel.node, "paramPanel", {
        bg = 0x00000000,
        on_wheel = function(x, y, deltaY)
            local sensitivity = 0.5
            state.scrollNorm = math.max(0.0, math.min(1.0, state.scrollNorm - deltaY * sensitivity))
            ui.scrollSlider:setValue(1.0 - state.scrollNorm)
            state.needsScrollUpdate = true
        end,
    })

    ui.scrollSlider = W.VSlider.new(ui.leftPanel.node, "scroll", {
        min = 0.0,
        max = 1.0,
        step = 0.0,
        value = 1.0,
        colour = 0xff64748b,
        bg = 0xff1f2937,
        showValue = false,
        on_change = function(v)
            state.scrollNorm = 1.0 - v
            state.needsScrollUpdate = true
        end,
    })

    ui.fxLabelA = W.Label.new(ui.paramPanel.node, "fxLabelA", {
        text = "FX 1",
        colour = 0xffcbd5e1,
        fontSize = 12.0,
        fontStyle = FontStyle.bold,
    })
    ui.fxLabelB = W.Label.new(ui.paramPanel.node, "fxLabelB", {
        text = "FX 2",
        colour = 0xffcbd5e1,
        fontSize = 12.0,
        fontStyle = FontStyle.bold,
    })
    ui.fxLabelC = W.Label.new(ui.paramPanel.node, "fxLabelC", {
        text = "FX 3",
        colour = 0xffcbd5e1,
        fontSize = 12.0,
        fontStyle = FontStyle.bold,
    })

    ui.freqSlider = W.Slider.new(ui.paramPanel.node, "freq", {
        label = "Osc Frequency",
        min = 40.0,
        max = 1200.0,
        step = 1.0,
        value = osc.frequency,
        suffix = " Hz",
        colour = 0xff38bdf8,
        on_change = function(v)
            osc.frequency = v
            applyOscParams()
            setLastAction("osc freq")
            updateStatusText()
        end,
    })

    ui.ampSlider = W.Slider.new(ui.paramPanel.node, "amp", {
        label = "Osc Amplitude",
        min = 0.0,
        max = 0.7,
        step = 0.01,
        value = osc.amplitude,
        colour = 0xff06b6d4,
        on_change = function(v)
            osc.amplitude = v
            applyOscParams()
            setLastAction("osc amp")
            updateStatusText()
        end,
    })

    ui.roomSlider = W.Slider.new(ui.paramPanel.node, "room", {
        label = "Reverb Room",
        min = 0.0,
        max = 1.0,
        step = 0.01,
        value = rev.roomSize,
        colour = 0xffa78bfa,
        on_change = function(v)
            rev.roomSize = v
            applyReverbParams()
            setLastAction("reverb room")
            updateStatusText()
        end,
    })

    ui.dampingSlider = W.Slider.new(ui.paramPanel.node, "damping", {
        label = "Reverb Damping",
        min = 0.0,
        max = 1.0,
        step = 0.01,
        value = rev.damping,
        colour = 0xff8b5cf6,
        on_change = function(v)
            rev.damping = v
            applyReverbParams()
            setLastAction("reverb damping")
            updateStatusText()
        end,
    })

    ui.wetSlider = W.Slider.new(ui.paramPanel.node, "wet", {
        label = "Reverb Wet",
        min = 0.0,
        max = 1.0,
        step = 0.01,
        value = rev.wet,
        colour = 0xff7c3aed,
        on_change = function(v)
            rev.wet = v
            applyReverbParams()
            setLastAction("reverb wet")
            updateStatusText()
        end,
    })

    ui.drySlider = W.Slider.new(ui.paramPanel.node, "dry", {
        label = "Reverb Dry",
        min = 0.0,
        max = 1.0,
        step = 0.01,
        value = rev.dry,
        colour = 0xff6d28d9,
        on_change = function(v)
            rev.dry = v
            applyReverbParams()
            setLastAction("reverb dry")
            updateStatusText()
        end,
    })

    ui.widthSlider = W.Slider.new(ui.paramPanel.node, "width", {
        label = "Reverb Width",
        min = 0.0,
        max = 1.0,
        step = 0.01,
        value = rev.width,
        colour = 0xff5b21b6,
        on_change = function(v)
            rev.width = v
            applyReverbParams()
            setLastAction("reverb width")
            updateStatusText()
        end,
    })

    ui.cutoffSlider = W.Slider.new(ui.paramPanel.node, "cutoff", {
        label = "Filter Cutoff",
        min = 80.0,
        max = 12000.0,
        step = 1.0,
        value = filt.cutoff,
        suffix = " Hz",
        colour = 0xff22c55e,
        on_change = function(v)
            filt.cutoff = v
            applyFilterParams()
            setLastAction("filter cutoff")
            updateStatusText()
        end,
    })

    ui.filterMixSlider = W.Slider.new(ui.paramPanel.node, "filterMix", {
        label = "Filter Mix",
        min = 0.0,
        max = 1.0,
        step = 0.01,
        value = filt.mix,
        colour = 0xff16a34a,
        on_change = function(v)
            filt.mix = v
            applyFilterParams()
            setLastAction("filter mix")
            updateStatusText()
        end,
    })

    ui.driveSlider = W.Slider.new(ui.paramPanel.node, "drive", {
        label = "Distortion Drive",
        min = 1.0,
        max = 20.0,
        step = 0.1,
        value = dist.drive,
        colour = 0xfff59e0b,
        on_change = function(v)
            dist.drive = v
            applyDistortionParams()
            setLastAction("dist drive")
            updateStatusText()
        end,
    })

    ui.distMixSlider = W.Slider.new(ui.paramPanel.node, "distMix", {
        label = "Distortion Mix",
        min = 0.0,
        max = 1.0,
        step = 0.01,
        value = dist.mix,
        colour = 0xffd97706,
        on_change = function(v)
            dist.mix = v
            applyDistortionParams()
            setLastAction("dist mix")
            updateStatusText()
        end,
    })

    ui.outputSlider = W.Slider.new(ui.paramPanel.node, "distOut", {
        label = "Dist Output",
        min = 0.0,
        max = 1.2,
        step = 0.01,
        value = dist.output,
        colour = 0xffb45309,
        on_change = function(v)
            dist.output = v
            applyDistortionParams()
            setLastAction("dist output")
            updateStatusText()
        end,
    })

    ui.graphTitle = W.Label.new(ui.rightPanel.node, "graphTitle", {
        text = "Graph View",
        colour = 0xffcbd5e1,
        fontSize = 14.0,
        fontStyle = FontStyle.bold,
    })

    ui.graphHelp = W.Label.new(ui.rightPanel.node, "graphHelp", {
        text = "Visual chain rebuilds from Lua: Osc -> FX -> FX -> FX -> Out",
        colour = 0xff64748b,
        fontSize = 11.0,
    })

    ui.graphNode = ui.rightPanel.node:addChild("graphCanvas")
    ui.graphNode:setOnDraw(function(self)
        local w = self:getWidth()
        local h = self:getHeight()

        gfx.setColour(0xff0b1220)
        gfx.fillRoundedRect(0, 0, w, h, 10)
        gfx.setColour(0xff1f2a3a)
        gfx.drawRoundedRect(0, 0, w, h, 10, 1)

        local labels = getOrderedEffectLabels()
        local sourceIsOsc = sourceUsesOscillator()
        local nodesReady = {
            sourceIsOsc and state.oscNode ~= nil or true,
            labels[1] == "Reverb" and state.reverbNode ~= nil or (labels[1] == "Filter" and state.filterNode ~= nil or state.distortionNode ~= nil),
            labels[2] == "Reverb" and state.reverbNode ~= nil or (labels[2] == "Filter" and state.filterNode ~= nil or state.distortionNode ~= nil),
            labels[3] == "Reverb" and state.reverbNode ~= nil or (labels[3] == "Filter" and state.filterNode ~= nil or state.distortionNode ~= nil),
            state.graphEnabled,
        }

        local names = { sourceIsOsc and "Osc" or "Input", labels[1], labels[2], labels[3], "Out" }
        local colors = {
            0xff1d4ed8,
            0xff7c3aed,
            0xff22c55e,
            0xfff59e0b,
            0xff059669,
        }

        local boxW = math.floor((w - 72) / 5)
        local boxH = 46
        local y0 = math.floor(h * 0.38)

        for i = 1, 5 do
            local x0 = 16 + (i - 1) * (boxW + 10)
            local active = nodesReady[i]
            gfx.setColour(active and colors[i] or 0xff334155)
            gfx.fillRoundedRect(x0, y0, boxW, boxH, 8)
            gfx.setColour(0xffe2e8f0)
            gfx.setFont(11.0)
            gfx.drawText(names[i], x0, y0, boxW, boxH, Justify.centred)

            if i < 5 then
                gfx.setColour(state.chainConnected and 0xff22c55e or 0xff475569)
                gfx.fillRect(x0 + boxW + 2, y0 + math.floor(boxH / 2) - 1, 8, 3)
            end
        end

        -- Activity indicator
        local sourceReady = sourceIsOsc and state.oscNode ~= nil or true
        local activity = state.graphEnabled and state.chainConnected and sourceReady and state.reverbNode and state.filterNode and state.distortionNode
        gfx.setColour(activity and 0xff22c55e or 0xff64748b)
        gfx.setFont(11.0)
        gfx.drawText(activity and "Signal Path Active" or "Signal Path Inactive", 12, h - 24, w - 24, 16, Justify.centred)
    end)

    resetGraphState(true)
    refreshGraphEnabledFromEngine()
    updateStatusText()
end

function ui_init(root)
    buildUI(root)
    ui_resized(root:getWidth(), root:getHeight())
end

function ui_resized(w, h)
    if not ui.rootPanel then
        return
    end

    local pad = 10
    local headerH = 48
    local contentY = pad + headerH + 8
    local contentH = h - contentY - pad
    local leftW = math.floor((w - pad * 3) * 0.46)
    local rightW = w - pad * 3 - leftW

    ui.rootPanel:setBounds(0, 0, w, h)
    ui.headerPanel:setBounds(pad, pad, w - pad * 2, headerH)

    ui.titleLabel:setBounds(10, 0, 220, headerH)
    ui.statusLabel:setBounds(230, 0, math.max(160, w - 460), 24)
    ui.patchHint:setBounds(230, 22, math.max(160, w - 460), 22)
    ui.scriptDropdown:setBounds(w - pad * 2 - 190, 8, 180, headerH - 16)
    ui.scriptDropdown:setAbsolutePos(pad + (w - pad * 2 - 190), pad + 8)

    ui.leftPanel:setBounds(pad, contentY, leftW, contentH)
    ui.rightPanel:setBounds(pad * 2 + leftW, contentY, rightW, contentH)

    local x = 14
    local y = 14
    local contentTop = y
    local sliderW = leftW - 42
    local effectOrder = getOrderedEffectLabels()

    local function layoutReverb(y0)
        ui.roomSlider:setBounds(x, y0, sliderW, 30)
        y0 = y0 + 34
        ui.dampingSlider:setBounds(x, y0, sliderW, 30)
        y0 = y0 + 34
        ui.wetSlider:setBounds(x, y0, sliderW, 30)
        y0 = y0 + 34
        ui.drySlider:setBounds(x, y0, sliderW, 30)
        y0 = y0 + 34
        ui.widthSlider:setBounds(x, y0, sliderW, 30)
        return y0 + 40
    end

    local function layoutFilter(y0)
        ui.cutoffSlider:setBounds(x, y0, sliderW, 30)
        y0 = y0 + 34
        ui.filterMixSlider:setBounds(x, y0, sliderW, 30)
        return y0 + 40
    end

    local function layoutDist(y0)
        ui.driveSlider:setBounds(x, y0, sliderW, 30)
        y0 = y0 + 34
        ui.distMixSlider:setBounds(x, y0, sliderW, 30)
        y0 = y0 + 34
        ui.outputSlider:setBounds(x, y0, sliderW, 30)
        return y0 + 40
    end

    local function placeEffect(labelNode, effectName, y0)
        labelNode:setText(effectName)
        labelNode:setBounds(x, y0, sliderW, 20)
        y0 = y0 + 22
        if effectName == "Reverb" then
            return layoutReverb(y0)
        elseif effectName == "Filter" then
            return layoutFilter(y0)
        end
        return layoutDist(y0)
    end
    local btnW = math.max(130, math.floor((leftW - 44) / 2))
    ui.createBtn:setBounds(x, y, btnW, 34)
    ui.resetBtn:setBounds(x + btnW + 10, y, btnW, 34)
    y = y + 42
    ui.connectBtn:setBounds(x, y, leftW - 28, 34)
    y = y + 42
    ui.liveBtn:setBounds(x, y, leftW - 28, 34)
    y = y + 44
    ui.applyParamsBtn:setBounds(x, y, btnW, 30)
    ui.smokeBtn:setBounds(x + btnW + 10, y, btnW, 30)
    y = y + 38

    ui.graphToggle:setBounds(x, y, leftW - 28, 28)
    y = y + 32
    ui.oscEnableToggle:setBounds(x, y, leftW - 28, 28)
    y = y + 34
    ui.oscShapeDropdown:setBounds(x, y, sliderW, 28)
    ui.oscShapeDropdown:setAbsolutePos(pad + x, contentY + y)
    y = y + 34
    ui.chainOrderDropdown:setBounds(x, y, sliderW, 28)
    ui.chainOrderDropdown:setAbsolutePos(pad + x, contentY + y)
    y = y + 34
    ui.sourceModeDropdown:setBounds(x, y, sliderW, 28)
    ui.sourceModeDropdown:setAbsolutePos(pad + x, contentY + y)
    y = y + 34

    -- paramPanel is the clipping viewport for scrollable parameters
    local paramPanelY = y
    local paramPanelH = contentH - paramPanelY
    ui.paramPanel:setBounds(0, paramPanelY, leftW - 20, paramPanelH)

    -- Layout widgets inside paramPanel using local coords (relative to paramPanel)
    local py = 0
    ui.freqSlider:setBounds(x, py, sliderW, 30)
    py = py + 34
    ui.ampSlider:setBounds(x, py, sliderW, 30)
    py = py + 40
    py = placeEffect(ui.fxLabelA, effectOrder[1], py)
    py = placeEffect(ui.fxLabelB, effectOrder[2], py)
    py = placeEffect(ui.fxLabelC, effectOrder[3], py)

    -- Calculate overflow and scroll offset
    local totalParamH = py
    local overflow = math.max(0, totalParamH - paramPanelH)
    local offset = math.floor(overflow * state.scrollNorm)

    if overflow <= 0 then
        ui.scrollSlider:setBounds(leftW - 20, paramPanelY, 0, 0)
        offset = 0
    else
        ui.scrollSlider:setBounds(leftW - 20, paramPanelY, 12, math.max(40, paramPanelH))
    end

    -- Apply scroll offset to all paramPanel children
    local paramWidgets = {
        ui.freqSlider, ui.ampSlider,
        ui.fxLabelA, ui.fxLabelB, ui.fxLabelC,
        ui.roomSlider, ui.dampingSlider, ui.wetSlider, ui.drySlider, ui.widthSlider,
        ui.cutoffSlider, ui.filterMixSlider,
        ui.driveSlider, ui.distMixSlider, ui.outputSlider,
    }
    for i = 1, #paramWidgets do
        local pw = paramWidgets[i]
        local bx, by, bw, bh = pw.node:getBounds()
        pw:setBounds(bx, by - offset, bw, bh)
    end

    ui.graphTitle:setBounds(12, 10, rightW - 24, 20)
    ui.graphHelp:setBounds(12, 30, rightW - 24, 18)
    ui.graphNode:setBounds(12, 56, rightW - 24, contentH - 68)
end

function ui_update(stateFromEngine)
    -- Keep status text fresh; avoid forcing toggle state every frame.
    if state.needsRelayout and ui.rootPanel and ui.rootPanel.node then
        state.needsRelayout = false
        ui_resized(ui.rootPanel.node:getWidth(), ui.rootPanel.node:getHeight())
    end
    if state.needsScrollUpdate and ui.rootPanel and ui.rootPanel.node then
        state.needsScrollUpdate = false
        ui_resized(ui.rootPanel.node:getWidth(), ui.rootPanel.node:getHeight())
    end
    updateStatusText()
end
