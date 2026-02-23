-- looper_ui_minimal.lua
-- Minimal alternative UI for the Looper plugin.
-- Shows transport controls + layer waveforms in a compact layout.
-- Demonstrates the UI switcher capability.

local W = require("looper_widgets")

local current_state = {}
local MAX_LAYERS = 4
local ui = {}

-- ============================================================================
-- ui_init
-- ============================================================================

function ui_init(root)
    -- Title + settings
    ui.title = W.Label(root, "title", {
        text = "LOOPER — Minimal",
        colour = 0xff34d399,
        fontSize = 22.0,
        fontName = "Avenir Next",
        fontStyle = FontStyle.bold,
        justification = Justify.centredLeft,
    })

    ui.settingsBtn = W.Button(root, "settings_btn", {
        label = "⚙", bg = 0xff1e293b, fontSize = 18.0,
        on_click = function()
            -- Simple: just list scripts and switch to first one that isn't us
            local scripts = listUiScripts()
            local current = getCurrentScriptPath()
            for _, s in ipairs(scripts) do
                if s.path ~= current then
                    switchUiScript(s.path)
                    return
                end
            end
        end,
    })

    -- Transport row
    ui.transportPanel = W.Panel(root, "transport", { bg = 0xff141a24, radius = 10 })
    local tp = ui.transportPanel.node

    ui.recBtn = W.Button(tp, "rec", {
        label = "⏺ REC", bg = 0xff7f1d1d,
        on_click = function()
            if current_state.isRecording then command("STOP")
            else command("REC") end
        end,
    })

    ui.stopBtn = W.Button(tp, "stop", {
        label = "⏹ STOP", bg = 0xff374151,
        on_click = function() command("STOP") end,
    })

    ui.overdubToggle = W.Toggle(tp, "overdub", {
        label = "Overdub", value = false,
        on_change = function(on) command("OVERDUB") end,
    })

    ui.modeBtn = W.Button(tp, "mode", {
        label = "Mode", bg = 0xff1f4a7a,
        on_click = function()
            command("MODE", tostring(((current_state.recordModeInt or 0) + 1) % 4))
        end,
    })

    ui.clearAllBtn = W.Button(tp, "clearall", {
        label = "Clear All", bg = 0xff111827,
        on_click = function() command("CLEARALL") end,
    })

    -- Master volume slider
    ui.masterVol = W.Slider(tp, "master_vol", {
        min = 0, max = 1, step = 0.01, value = 0.8,
        label = "Master Vol", colour = 0xffa78bfa,
        on_change = function(v) command("MASTERVOLUME", tostring(v)) end,
    })

    -- Layer waveform views
    ui.layerPanel = W.Panel(root, "layers", { bg = 0xff0f1622, radius = 10 })
    ui.layerViews = {}

    for i = 0, MAX_LAYERS - 1 do
        local layerIdx = i
        local row = ui.layerPanel.node:addChild("layer_" .. i)

        -- Select layer on click
        row:setOnClick(function() command("LAYER", tostring(layerIdx)) end)

        -- Label
        local label = W.Label(row, "label_" .. i, {
            text = "L" .. i,
            colour = 0xff94a3b8,
            fontSize = 14.0,
            fontName = "Avenir Next",
            fontStyle = FontStyle.bold,
        })

        -- Waveform
        local wf = W.WaveformView(row, "wf_" .. i, {
            colour = 0xff22d3ee,
            mode = "layer",
        })
        wf.setLayerIndex(i)

        -- State label
        local stateLabel = W.Label(row, "state_" .. i, {
            text = "Empty",
            colour = 0xff64748b,
            fontSize = 11.0,
        })

        table.insert(ui.layerViews, {
            node = row,
            label = label,
            wf = wf,
            stateLabel = stateLabel,
            layerIdx = layerIdx,
        })
    end

    -- Status bar
    ui.statusLabel = W.Label(root, "status", {
        text = "",
        colour = 0xff64748b,
        fontSize = 11.0,
        justification = Justify.centred,
    })
end

-- ============================================================================
-- ui_resized
-- ============================================================================

function ui_resized(w, h)
    if not ui.title then return end

    ui.title.node:setBounds(0, 0, w - 50, 36)
    ui.settingsBtn.node:setBounds(w - 44, 2, 40, 32)

    -- Transport row
    local tpY = 40
    local tpH = 50
    ui.transportPanel.node:setBounds(0, tpY, w, tpH)

    local pad = 8
    local gap = 6
    local itemW = math.floor((w - pad * 2 - gap * 5) / 6)
    local x = pad
    local items = {ui.recBtn, ui.stopBtn, ui.overdubToggle, ui.modeBtn, ui.clearAllBtn, ui.masterVol}
    for _, item in ipairs(items) do
        item.node:setBounds(x, pad, itemW, tpH - pad * 2)
        x = x + itemW + gap
    end

    -- Status
    local statusH = 24
    ui.statusLabel.node:setBounds(0, h - statusH, w, statusH)

    -- Layer panel fills rest
    local lpY = tpY + tpH + 8
    local lpH = h - lpY - statusH - 8
    ui.layerPanel.node:setBounds(0, lpY, w, lpH)

    local rowGap = 6
    local innerH = lpH - 12
    local rowH = math.floor((innerH - rowGap * (MAX_LAYERS - 1)) / MAX_LAYERS)
    local ry = 6

    for _, lv in ipairs(ui.layerViews) do
        lv.node:setBounds(6, ry, w - 12, rowH)
        lv.label.node:setBounds(4, 2, 30, rowH - 4)
        lv.wf.node:setBounds(36, 2, w - 12 - 36 - 80, rowH - 4)
        lv.stateLabel.node:setBounds(w - 12 - 76, 2, 72, rowH - 4)
        ry = ry + rowH + rowGap
    end
end

-- ============================================================================
-- ui_update
-- ============================================================================

function ui_update(s)
    current_state = s

    -- Transport state
    if ui.recBtn then
        if s.isRecording then
            ui.recBtn.setLabel("⏺ REC*")
            ui.recBtn.setBg(0xffdc2626)
        else
            ui.recBtn.setLabel("⏺ REC")
            ui.recBtn.setBg(0xff7f1d1d)
        end
    end

    if ui.overdubToggle then
        ui.overdubToggle.setValue(s.overdubEnabled or false)
    end

    if ui.masterVol then
        ui.masterVol.setValue(s.masterVolume or 0.8)
    end

    -- Mode label
    local modeNames = {"First Loop", "Free Mode", "Traditional", "Retrospective"}
    if ui.modeBtn then
        local idx = (s.recordModeInt or 0) + 1
        ui.modeBtn.setLabel(modeNames[idx] or "Mode")
    end

    -- Layer updates
    for _, lv in ipairs(ui.layerViews) do
        local layer = s.layers and s.layers[lv.layerIdx + 1] or {}
        local active = (s.activeLayer or 0) == lv.layerIdx

        -- Update waveform playhead
        local length = layer.length or 0
        if length > 0 then
            local pos = (layer.position or 0) / length
            lv.wf.setPlayheadPos(pos)
        else
            lv.wf.setPlayheadPos(-1)
        end

        -- Active colour
        lv.label.setColour(active and 0xff7dd3fc or 0xff94a3b8)

        -- State text
        local stateText = layer.state or "empty"
        if stateText == "empty" then stateText = "Empty"
        elseif stateText == "playing" then
            local secs = length / math.max(1, s.sampleRate or 44100)
            stateText = string.format("%.1fs", secs)
        elseif stateText == "recording" then stateText = "Recording"
        elseif stateText == "overdubbing" then stateText = "Overdub"
        elseif stateText == "muted" then stateText = "Muted"
        elseif stateText == "stopped" then stateText = "Stopped"
        end
        lv.stateLabel.setText(stateText)

        local stateColours = {
            empty = 0xff64748b, playing = 0xff34d399, recording = 0xffef4444,
            overdubbing = 0xfff59e0b, muted = 0xff94a3b8, stopped = 0xfffde047,
        }
        lv.stateLabel.setColour(stateColours[layer.state or "empty"] or 0xffffffff)
    end

    -- Status bar
    if ui.statusLabel then
        local sr = math.max(1, s.sampleRate or 44100)
        local spb = s.samplesPerBar or 88200
        ui.statusLabel.setText(string.format("%.1f BPM  |  %.2fs/bar  |  master %.0f%%",
            s.tempo or 120, spb / sr, (s.masterVolume or 1) * 100))
    end
end
