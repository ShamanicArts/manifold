-- manifold_settings_ui.lua
-- Multi-tab settings UI with scrollable content and user directory config

local W = require("ui_widgets")

-- ============================================================================
-- State
-- ============================================================================
local ui = {}
local uiState = {}
local statusMessage = "Ready"
local statusTime = 0
local currentTab = "osc"  -- osc, link, paths, midi
local scrollOffsets = { osc = 0, link = 0, paths = 0, midi = 0 }
local contentHeights = { osc = 0, link = 0, paths = 0, midi = 0 }

-- ============================================================================
-- Helpers
-- ============================================================================

local function showStatus(msg)
    statusMessage = msg
    statusTime = getTime()
end

local function isValidPort(port)
    return port and port >= 1024 and port <= 65535
end

local function getSettingsDir()
    -- Get the settings directory from the Settings class
    local home = os.getenv("HOME") or "/tmp"
    return home .. "/.config/Manifold"
end

-- ============================================================================
-- Tab Button Creation
-- ============================================================================

local function setWidgetBounds(widget, x, y, w, h)
    if widget == nil then
        return
    end
    if type(widget.setBounds) == "function" then
        widget:setBounds(x, y, w, h)
    elseif widget.node and type(widget.node.setBounds) == "function" then
        widget.node:setBounds(x, y, w, h)
    end
end

local function createTabButton(parent, id, label, x, y, w, h, onClick)
    local btn = W.Button.new(parent, id, {
        label = label,
        bg = (currentTab == id) and 0xff2563eb or 0xff1e293b,
        fontSize = 12.0,
        on_click = onClick,
    })
    setWidgetBounds(btn, x, y, w, h)
    return btn
end

local function syncTabButtonStyles()
    if ui.oscTabBtn then
        ui.oscTabBtn:setBg((currentTab == "osc") and 0xff2563eb or 0xff1e293b)
    end
    if ui.linkTabBtn then
        ui.linkTabBtn:setBg((currentTab == "link") and 0xff2563eb or 0xff1e293b)
    end
    if ui.midiTabBtn then
        ui.midiTabBtn:setBg((currentTab == "midi") and 0xff2563eb or 0xff1e293b)
    end
    if ui.pathsTabBtn then
        ui.pathsTabBtn:setBg((currentTab == "paths") and 0xff2563eb or 0xff1e293b)
    end
end

local function buildScrollBarDisplayList(viewH, contentH, scrollY)
    local display = {}
    if contentH <= viewH or viewH <= 0 then
        return display
    end

    display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = 0,
        y = 0,
        w = 8,
        h = viewH,
        radius = 4,
        color = 0xff1e293b,
    }

    local thumbH = math.max(30, viewH * (viewH / contentH))
    local maxScroll = math.max(0, contentH - viewH)
    local thumbY = 0
    if maxScroll > 0 then
        thumbY = (scrollY / maxScroll) * (viewH - thumbH)
    end
    thumbY = math.max(0, math.min(viewH - thumbH, thumbY))

    display[#display + 1] = {
        cmd = "fillRoundedRect",
        x = 0,
        y = math.floor(thumbY + 0.5),
        w = 8,
        h = math.max(1, math.floor(thumbH + 0.5)),
        radius = 4,
        color = 0xff475569,
    }

    return display
end

-- ============================================================================
-- Scrollable Panel Setup
-- ============================================================================

local function setupScrollableContent(contentNode, contentContainer, contentH)
    contentHeights[currentTab] = contentH

    local scrollBar = contentNode:addChild("scrollBar")
    scrollBar:setBounds(contentNode:getWidth() - 12, 0, 8, contentNode:getHeight())
    scrollBar:setInterceptsMouse(true, true)

    local function syncScrollBar()
        local h = contentNode:getHeight()
        local ch = contentHeights[currentTab] or h
        scrollBar:setBounds(contentNode:getWidth() - 12, 0, 8, h)
        scrollBar:setDisplayList(buildScrollBarDisplayList(h, ch, scrollOffsets[currentTab] or 0))
    end

    local function updateScroll()
        local h = contentNode:getHeight()
        local ch = contentHeights[currentTab] or h
        local maxScroll = math.max(0, ch - h)
        scrollOffsets[currentTab] = math.max(0, math.min(maxScroll, scrollOffsets[currentTab] or 0))
        contentContainer:setBounds(0, -math.floor(scrollOffsets[currentTab]), contentNode:getWidth(), math.max(ch, h))
        syncScrollBar()
    end

    scrollBar:setOnMouseDown(function(mx, my)
        local _ = mx
        local h = scrollBar:getHeight()
        local ch = contentHeights[currentTab] or h
        if ch <= h then return end

        local maxScroll = ch - h
        scrollOffsets[currentTab] = (my / h) * maxScroll
        updateScroll()
    end)

    scrollBar:setOnMouseWheel(function(mx, my, dy)
        local _ = mx
        _ = my
        local h = contentNode:getHeight()
        local ch = contentHeights[currentTab] or h
        if ch <= h then return end

        if dy > 0 then
            scrollOffsets[currentTab] = (scrollOffsets[currentTab] or 0) - 30
        elseif dy < 0 then
            scrollOffsets[currentTab] = (scrollOffsets[currentTab] or 0) + 30
        end
        updateScroll()
    end)

    contentNode:setOnMouseWheel(function(mx, my, dy)
        local _ = mx
        _ = my
        local h = contentNode:getHeight()
        local ch = contentHeights[currentTab] or h
        if ch <= h then return end

        if dy > 0 then
            scrollOffsets[currentTab] = (scrollOffsets[currentTab] or 0) - 30
        elseif dy < 0 then
            scrollOffsets[currentTab] = (scrollOffsets[currentTab] or 0) + 30
        end
        updateScroll()
    end)

    contentContainer:setOnMouseWheel(function(mx, my, dy)
        local _ = mx
        _ = my
        local h = contentNode:getHeight()
        local ch = contentHeights[currentTab] or h
        if ch <= h then return end

        if dy > 0 then
            scrollOffsets[currentTab] = (scrollOffsets[currentTab] or 0) - 30
        elseif dy < 0 then
            scrollOffsets[currentTab] = (scrollOffsets[currentTab] or 0) + 30
        end
        updateScroll()
    end)

    updateScroll()
end

-- ============================================================================
-- OSC Tab Content
-- ============================================================================

local function buildOscTab(parent, w, h)
    local y = 0
    local margin = 12
    local panelW = w - margin * 2 - 16  -- Account for scrollbar
    local rowH = 36
    local sectionSpacing = 16
    
    -- Status display (Casio LCD style)
    ui.statusPanel = W.Panel.new(parent, "statusPanel", {
        bg = 0xff1a2b1a,
        border = 0xff2d4a2d,
        borderWidth = 2,
    })
    setWidgetBounds(ui.statusPanel, margin, y, panelW, 48)
    
    ui.statusDisplay = W.Label.new(ui.statusPanel.node, "statusDisplay", {
        text = "Ready",
        colour = 0xff4ade80,
        fontSize = 14.0,
        fontStyle = FontStyle.bold,
    })
    setWidgetBounds(ui.statusDisplay, 12, 14, panelW - 24, 20)
    y = y + 48 + sectionSpacing
    
    -- OSC Settings
    ui.oscPanel = W.Panel.new(parent, "oscPanel", {
        bg = 0xff141a24,
        radius = 8,
    })
    setWidgetBounds(ui.oscPanel, margin, y, panelW, 80)
    
    ui.oscLabel = W.Label.new(ui.oscPanel.node, "oscLabel", {
        text = "OSC (UDP)",
        colour = 0xff94a3b8,
        fontSize = 12.0,
        fontStyle = FontStyle.bold,
    })
    setWidgetBounds(ui.oscLabel, 12, 8, 150, 18)
    
    ui.oscPortBox = W.NumberBox.new(ui.oscPanel.node, "oscPort", {
        min = 1024, max = 65535, step = 1, value = 9000,
        label = "Port", suffix = "",
        colour = 0xff38bdf8,
        format = "%d",
        on_change = function(v) end,
    })
    setWidgetBounds(ui.oscPortBox, 12, 36, 120, 32)
    
    ui.oscToggle = W.Toggle.new(ui.oscPanel.node, "oscToggle", {
        label = "Enabled",
        value = true,
        colour = 0xff34d399,
        bg = 0xff1e293b,
        on_change = function(v) end,
    })
    setWidgetBounds(ui.oscToggle, panelW - 100, 36, 88, 32)
    y = y + 80 + sectionSpacing
    
    -- OSCQuery Settings
    ui.queryPanel = W.Panel.new(parent, "queryPanel", {
        bg = 0xff141a24,
        radius = 8,
    })
    setWidgetBounds(ui.queryPanel, margin, y, panelW, 80)
    
    ui.queryLabel = W.Label.new(ui.queryPanel.node, "queryLabel", {
        text = "OSCQuery (HTTP)",
        colour = 0xff94a3b8,
        fontSize = 12.0,
        fontStyle = FontStyle.bold,
    })
    setWidgetBounds(ui.queryLabel, 12, 8, 150, 18)
    
    ui.queryPortBox = W.NumberBox.new(ui.queryPanel.node, "queryPort", {
        min = 1024, max = 65535, step = 1, value = 9001,
        label = "Port", suffix = "",
        colour = 0xff38bdf8,
        format = "%d",
        on_change = function(v) end,
    })
    setWidgetBounds(ui.queryPortBox, 12, 36, 120, 32)
    
    ui.queryToggle = W.Toggle.new(ui.queryPanel.node, "queryToggle", {
        label = "Enabled",
        value = true,
        colour = 0xff34d399,
        bg = 0xff1e293b,
        on_change = function(v) end,
    })
    setWidgetBounds(ui.queryToggle, panelW - 100, 36, 88, 32)
    y = y + 80 + sectionSpacing
    
    -- Broadcast Targets
    ui.targetsPanel = W.Panel.new(parent, "targetsPanel", {
        bg = 0xff141a24,
        radius = 8,
    })
    setWidgetBounds(ui.targetsPanel, margin, y, panelW, 140)
    
    ui.targetsLabel = W.Label.new(ui.targetsPanel.node, "targetsLabel", {
        text = "Broadcast Targets",
        colour = 0xff94a3b8,
        fontSize = 12.0,
        fontStyle = FontStyle.bold,
    })
    setWidgetBounds(ui.targetsLabel, 12, 8, 150, 18)
    
    ui.addTargetBtn = W.Button.new(ui.targetsPanel.node, "addTarget", {
        label = "+ Add Target",
        bg = 0xff1e7a3a,
        fontSize = 11.0,
        on_click = function()
            showStatus("Use osc.addTarget() in console")
        end,
    })
    setWidgetBounds(ui.addTargetBtn, 12, 36, 100, 28)
    
    ui.targetListOverlay = ui.targetsPanel.node:addChild("targetList")
    setupTargetList(panelW, 140)
    y = y + 140 + sectionSpacing
    
    -- Apply button
    ui.applyBtn = W.Button.new(parent, "apply", {
        label = "APPLY SETTINGS",
        bg = 0xff2563eb,
        fontSize = 14.0,
        on_click = function()
            local newSettings = {
                inputPort = math.floor(ui.oscPortBox:getValue()),
                queryPort = math.floor(ui.queryPortBox:getValue()),
                oscEnabled = ui.oscToggle:getValue(),
                oscQueryEnabled = ui.queryToggle:getValue(),
                outTargets = {}
            }
            
            if not isValidPort(newSettings.inputPort) then
                showStatus("ERR: OSC port must be 1024-65535")
                return
            end
            if not isValidPort(newSettings.queryPort) then
                showStatus("ERR: OSCQuery port must be 1024-65535")
                return
            end
            if newSettings.inputPort == newSettings.queryPort then
                showStatus("ERR: Ports must be different")
                return
            end
            
            if osc.setSettings(newSettings) then
                showStatus("Settings saved & applied")
            else
                showStatus("ERR: Failed to save settings")
            end
        end,
    })
    setWidgetBounds(ui.applyBtn, margin, y, panelW, 48)
    y = y + 48 + sectionSpacing
    
    return y
end

-- ============================================================================
-- Link Tab Content
-- ============================================================================

local function buildLinkTab(parent, w, h)
    local y = 0
    local margin = 12
    local panelW = w - margin * 2 - 16
    local sectionSpacing = 16
    
    -- Link Status Panel
    ui.linkStatusPanel = W.Panel.new(parent, "linkStatusPanel", {
        bg = 0xff141a24,
        radius = 8,
    })
    setWidgetBounds(ui.linkStatusPanel, margin, y, panelW, 60)
    
    ui.linkStatusLabel = W.Label.new(ui.linkStatusPanel.node, "linkStatus", {
        text = "Ableton Link",
        colour = 0xff94a3b8,
        fontSize = 14.0,
        fontStyle = FontStyle.bold,
    })
    setWidgetBounds(ui.linkStatusLabel, 12, 8, 150, 20)
    
    ui.linkPeersLabel = W.Label.new(ui.linkStatusPanel.node, "linkPeers", {
        text = "0 peers",
        colour = 0xff64748b,
        fontSize = 12.0,
    })
    setWidgetBounds(ui.linkPeersLabel, 12, 32, 150, 20)
    y = y + 60 + sectionSpacing
    
    -- Link Settings
    ui.linkPanel = W.Panel.new(parent, "linkPanel", {
        bg = 0xff141a24,
        radius = 8,
    })
    setWidgetBounds(ui.linkPanel, margin, y, panelW, 140)
    
    ui.linkLabel = W.Label.new(ui.linkPanel.node, "linkLabel", {
        text = "Link Settings",
        colour = 0xff94a3b8,
        fontSize = 12.0,
        fontStyle = FontStyle.bold,
    })
    setWidgetBounds(ui.linkLabel, 12, 8, 120, 18)
    
    ui.linkToggle = W.Toggle.new(ui.linkPanel.node, "linkToggle", {
        label = "Link Enabled",
        value = true,
        colour = 0xfff59e0b,
        bg = 0xff1e293b,
        on_change = function(v)
            if link then link.setEnabled(v) end
        end,
    })
    setWidgetBounds(ui.linkToggle, 12, 36, 140, 28)
    
    ui.linkTempoToggle = W.Toggle.new(ui.linkPanel.node, "linkTempo", {
        label = "Tempo Sync",
        value = true,
        colour = 0xff38bdf8,
        bg = 0xff1e293b,
        on_change = function(v)
            if link then link.setTempoSyncEnabled(v) end
        end,
    })
    setWidgetBounds(ui.linkTempoToggle, 12, 72, 140, 28)
    
    ui.linkStartStopToggle = W.Toggle.new(ui.linkPanel.node, "linkStartStop", {
        label = "Start/Stop Sync",
        value = true,
        colour = 0xffa78bfa,
        bg = 0xff1e293b,
        on_change = function(v)
            if link then link.setStartStopSyncEnabled(v) end
        end,
    })
    setWidgetBounds(ui.linkStartStopToggle, 160, 72, 150, 28)
    y = y + 140 + sectionSpacing
    
    -- Tempo Display
    ui.tempoPanel = W.Panel.new(parent, "tempoPanel", {
        bg = 0xff141a24,
        radius = 8,
    })
    setWidgetBounds(ui.tempoPanel, margin, y, panelW, 80)
    
    ui.tempoLabel = W.Label.new(ui.tempoPanel.node, "tempoLabel", {
        text = "Current Tempo",
        colour = 0xff94a3b8,
        fontSize = 12.0,
        fontStyle = FontStyle.bold,
    })
    setWidgetBounds(ui.tempoLabel, 12, 8, 120, 18)
    
    ui.tempoDisplay = W.Label.new(ui.tempoPanel.node, "tempoDisplay", {
        text = "120.0 BPM",
        colour = 0xff38bdf8,
        fontSize = 24.0,
        fontStyle = FontStyle.bold,
    })
    setWidgetBounds(ui.tempoDisplay, 12, 36, 200, 30)
    y = y + 80 + sectionSpacing
    
    return y
end

-- ============================================================================
-- Paths Tab Content
-- ============================================================================

local function buildPathsTab(parent, w, h)
    local y = 0
    local margin = 12
    local panelW = w - margin * 2 - 16
    local sectionSpacing = 16
    
    -- Get current settings values
    local userDir = ""
    local devDir = ""
    if settings then
        userDir = settings.getUserScriptsDir and settings.getUserScriptsDir() or ""
        devDir = settings.getDevScriptsDir and settings.getDevScriptsDir() or ""
    end
    
    -- User Scripts Directory
    ui.userDirPanel = W.Panel.new(parent, "userDirPanel", {
        bg = 0xff141a24,
        radius = 8,
    })
    setWidgetBounds(ui.userDirPanel, margin, y, panelW, 140)
    
    ui.userDirLabel = W.Label.new(ui.userDirPanel.node, "userDirLabel", {
        text = "User Scripts Directory",
        colour = 0xff94a3b8,
        fontSize = 12.0,
        fontStyle = FontStyle.bold,
    })
    setWidgetBounds(ui.userDirLabel, 12, 8, 200, 18)
    
    -- Display current path (or "Not set")
    local userDirDisplay = userDir ~= "" and userDir or "Not set (click Browse to configure)"
    ui.userDirPathLabel = W.Label.new(ui.userDirPanel.node, "userDirPath", {
        text = userDirDisplay,
        colour = userDir ~= "" and 0xff64748b or 0xff94a3b8,
        fontSize = 10.0,
    })
    setWidgetBounds(ui.userDirPathLabel, 12, 32, panelW - 24, 40)
    
    -- Browse button (opens native file chooser)
    ui.browseUserDirBtn = W.Button.new(ui.userDirPanel.node, "browseUserDir", {
        label = "Browse...",
        bg = 0xff2563eb,
        fontSize = 11.0,
        on_click = function()
            print("[SettingsUI] Browse button clicked")
            print("[SettingsUI] settings = " .. tostring(settings))
            print("[SettingsUI] type(settings) = " .. type(settings))
            if settings then
                print("[SettingsUI] settings table exists")
                -- Print all keys in settings
                local keys = {}
                for k, v in pairs(settings) do
                    table.insert(keys, k)
                end
                print("[SettingsUI] settings keys: " .. table.concat(keys, ", "))
                if settings.browseForUserScriptsDir then
                    print("[SettingsUI] browseForUserScriptsDir exists, calling...")
                    showStatus("Opening file chooser...")
                    settings.browseForUserScriptsDir(function(selectedPath)
                        print("[SettingsUI] Callback fired with path: " .. tostring(selectedPath))
                        if selectedPath and selectedPath ~= "" then
                            settings.setUserScriptsDir(selectedPath)
                            showStatus("User dir set to: " .. selectedPath)
                            -- Refresh display
                            ui.userDirPathLabel:setText(selectedPath)
                            ui.userDirPathLabel:setColour(0xff64748b)
                        else
                            showStatus("No directory selected")
                        end
                    end)
                    print("[SettingsUI] browseForUserScriptsDir returned")
                else
                    print("[SettingsUI] ERROR: browseForUserScriptsDir is nil")
                    showStatus("File chooser not available")
                end
            else
                print("[SettingsUI] ERROR: settings table is nil")
                showStatus("File chooser not available")
            end
        end,
    })
    setWidgetBounds(ui.browseUserDirBtn, 12, 95, 100, 28)
    
    ui.clearUserDirBtn = W.Button.new(ui.userDirPanel.node, "clearUserDir", {
        label = "Clear",
        bg = 0xff7f1d1d,
        fontSize = 11.0,
        on_click = function()
            if settings and settings.setUserScriptsDir then
                settings.setUserScriptsDir("")
                showStatus("User dir cleared - restart to apply")
                -- Refresh the display
                ui.userDirPathLabel:setText("Not set (click Browse to configure)")
                ui.userDirPathLabel:setColour(0xff94a3b8)
            end
        end,
    })
    setWidgetBounds(ui.clearUserDirBtn, panelW - 92, 95, 80, 28)
    y = y + 140 + sectionSpacing
    
    -- Dev Scripts Directory (read-only display)
    ui.devDirPanel = W.Panel.new(parent, "devDirPanel", {
        bg = 0xff141a24,
        radius = 8,
    })
    setWidgetBounds(ui.devDirPanel, margin, y, panelW, 80)
    
    ui.devDirLabel = W.Label.new(ui.devDirPanel.node, "devDirLabel", {
        text = "Development Scripts Directory",
        colour = 0xff94a3b8,
        fontSize = 12.0,
        fontStyle = FontStyle.bold,
    })
    setWidgetBounds(ui.devDirLabel, 12, 8, 250, 18)
    
    ui.devDirPathLabel = W.Label.new(ui.devDirPanel.node, "devDirPath", {
        text = devDir ~= "" and devDir or "Not configured",
        colour = 0xff64748b,
        fontSize = 10.0,
    })
    setWidgetBounds(ui.devDirPathLabel, 12, 32, panelW - 24, 40)
    y = y + 80 + sectionSpacing
    
    -- DSP Scripts Directory
    local dspDir = ""
    if settings and settings.getDspScriptsDir then
        dspDir = settings.getDspScriptsDir() or ""
    end
    
    ui.dspDirPanel = W.Panel.new(parent, "dspDirPanel", {
        bg = 0xff141a24,
        radius = 8,
    })
    setWidgetBounds(ui.dspDirPanel, margin, y, panelW, 140)
    
    ui.dspDirLabel = W.Label.new(ui.dspDirPanel.node, "dspDirLabel", {
        text = "DSP Scripts Directory",
        colour = 0xff94a3b8,
        fontSize = 12.0,
        fontStyle = FontStyle.bold,
    })
    setWidgetBounds(ui.dspDirLabel, 12, 8, 200, 18)
    
    local dspDirDisplay = dspDir ~= "" and dspDir or "Not set (click Browse to configure)"
    ui.dspDirPathLabel = W.Label.new(ui.dspDirPanel.node, "dspDirPath", {
        text = dspDirDisplay,
        colour = dspDir ~= "" and 0xff64748b or 0xff94a3b8,
        fontSize = 10.0,
    })
    setWidgetBounds(ui.dspDirPathLabel, 12, 32, panelW - 24, 40)
    
    ui.browseDspDirBtn = W.Button.new(ui.dspDirPanel.node, "browseDspDir", {
        label = "Browse...",
        bg = 0xff2563eb,
        fontSize = 11.0,
        on_click = function()
            if settings and settings.browseForDspScriptsDir then
                showStatus("Opening file chooser...")
                settings.browseForDspScriptsDir(function(selectedPath)
                    if selectedPath and selectedPath ~= "" then
                        settings.setDspScriptsDir(selectedPath)
                        showStatus("DSP dir set to: " .. selectedPath)
                        ui.dspDirPathLabel:setText(selectedPath)
                        ui.dspDirPathLabel:setColour(0xff64748b)
                    else
                        showStatus("No directory selected")
                    end
                end)
            else
                showStatus("File chooser not available")
            end
        end,
    })
    setWidgetBounds(ui.browseDspDirBtn, 12, 95, 100, 28)
    
    ui.clearDspDirBtn = W.Button.new(ui.dspDirPanel.node, "clearDspDir", {
        label = "Clear",
        bg = 0xff7f1d1d,
        fontSize = 11.0,
        on_click = function()
            if settings and settings.setDspScriptsDir then
                settings.setDspScriptsDir("")
                showStatus("DSP dir cleared - restart to apply")
                ui.dspDirPathLabel:setText("Not set (click Browse to configure)")
                ui.dspDirPathLabel:setColour(0xff94a3b8)
            end
        end,
    })
    setWidgetBounds(ui.clearDspDirBtn, panelW - 92, 95, 80, 28)
    y = y + 140 + sectionSpacing
    
    -- Available Scripts (taller for scrolling)
    ui.availablePanel = W.Panel.new(parent, "availablePanel", {
        bg = 0xff141a24,
        radius = 8,
    })
    setWidgetBounds(ui.availablePanel, margin, y, panelW, 280)
    
    ui.availableLabel = W.Label.new(ui.availablePanel.node, "availableLabel", {
        text = "Available UI Scripts (click to switch)",
        colour = 0xff94a3b8,
        fontSize = 12.0,
        fontStyle = FontStyle.bold,
    })
    setWidgetBounds(ui.availableLabel, 12, 8, panelW - 24, 18)
    
    -- List will be drawn dynamically with its own scroll
    ui.scriptListOverlay = ui.availablePanel.node:addChild("scriptList")
    setupScriptList(panelW, 280)
    y = y + 280 + sectionSpacing
    
    return y
end

-- ============================================================================
-- MIDI Tab Content
-- ============================================================================

-- Load the proper MIDI tab module
local MidiTab = require("midi_tab")

local function buildMidiTab(parent, w, h)
    return MidiTab.build(parent, w, h, showStatus, ui.rootPanel.node)
end

-- ============================================================================
-- Setup Functions for Dynamic Lists
-- ============================================================================

local function buildTargetListDisplay(targets, width, height)
    local display = {}
    local itemH = 28

    for i, target in ipairs(targets) do
        local y = (i - 1) * itemH
        if y >= -itemH and y < height then
            display[#display + 1] = {
                cmd = "drawText",
                x = 8,
                y = math.floor(y),
                w = math.max(1, width - 50),
                h = itemH - 4,
                color = 0xffe2e8f0,
                text = target,
                fontSize = 11.0,
                align = "left",
                valign = "middle",
            }
            display[#display + 1] = {
                cmd = "fillRoundedRect",
                x = math.floor(width - 40),
                y = math.floor(y + 2),
                w = 36,
                h = itemH - 4,
                radius = 4,
                color = 0xff7f1d1d,
            }
            display[#display + 1] = {
                cmd = "drawText",
                x = math.floor(width - 36),
                y = math.floor(y + 4),
                w = 28,
                h = itemH - 8,
                color = 0xffffffff,
                text = "×",
                fontSize = 10.0,
                align = "center",
                valign = "middle",
            }
        end
    end

    if #targets == 0 then
        display[#display + 1] = {
            cmd = "drawText",
            x = 8,
            y = 20,
            w = math.max(1, width - 16),
            h = 20,
            color = 0xff64748b,
            text = "No targets configured",
            fontSize = 11.0,
            align = "center",
            valign = "middle",
        }
    end

    return display
end

local function buildScriptListDisplay(scripts, width, height, currentPath)
    local display = {}
    local itemH = 28

    for i, script in ipairs(scripts) do
        local y = (i - 1) * itemH
        if y >= -itemH and y < height then
            local isCurrent = (script.path == currentPath)
            if isCurrent then
                display[#display + 1] = {
                    cmd = "fillRoundedRect",
                    x = 4,
                    y = math.floor(y),
                    w = math.max(1, width - 8),
                    h = itemH - 2,
                    radius = 4,
                    color = 0xff334155,
                }
            end

            display[#display + 1] = {
                cmd = "drawText",
                x = 12,
                y = math.floor(y),
                w = math.max(1, width - 60),
                h = math.floor(itemH - 2),
                color = isCurrent and 0xff38bdf8 or 0xffe2e8f0,
                text = script.name,
                fontSize = 11.0,
                align = "left",
                valign = "middle",
            }

            local sourceColor = 0xff64748b
            local sourceText = "B"
            if script.path:find("/dev/") or script.path:find("dev%-my%-plugin") then
                sourceColor = 0xfff59e0b
                sourceText = "D"
            elseif script.path:find("/.vst3/") or script.path:find("/VST3/") then
                sourceColor = 0xff34d399
                sourceText = "B"
            elseif script.path:find("/config/") or script.path:find("user") then
                sourceColor = 0xffa78bfa
                sourceText = "U"
            end

            display[#display + 1] = {
                cmd = "drawText",
                x = math.floor(width - 40),
                y = math.floor(y),
                w = 30,
                h = math.floor(itemH - 2),
                color = sourceColor,
                text = sourceText,
                fontSize = 9.0,
                align = "center",
                valign = "middle",
            }
        end
    end

    if #scripts == 0 then
        display[#display + 1] = {
            cmd = "drawText",
            x = 8,
            y = 20,
            w = math.max(1, width - 16),
            h = 20,
            color = 0xff64748b,
            text = "No UI scripts found",
            fontSize = 11.0,
            align = "center",
            valign = "middle",
        }
    end

    return display
end

function setupTargetList(panelW, height)
    local targets = {}
    local current = osc.getSettings()
    if current and current.outTargets then
        for i, t in ipairs(current.outTargets) do
            targets[i] = t
        end
    end

    ui.targetListOverlay:setBounds(12, 76, panelW - 24, height - 80)
    ui.targetListOverlay:setInterceptsMouse(true, true)
    ui.targetListOverlay:setDisplayList(buildTargetListDisplay(targets, ui.targetListOverlay:getWidth(), ui.targetListOverlay:getHeight()))

    ui.targetListOverlay:setOnMouseDown(function(mx, my)
        local w = ui.targetListOverlay:getWidth()
        local itemH = 28
        local idx = math.floor(my / itemH) + 1

        if mx > w - 40 and idx <= #targets then
            local target = targets[idx]
            if target then
                osc.removeTarget(target)
                showStatus("Removed: " .. target)
                setupTargetList(panelW, height)
            end
        end
    end)
end

function setupScriptList(panelW, height)
    local scripts = listUiScripts and listUiScripts() or {}
    local currentPath = getCurrentScriptPath and getCurrentScriptPath() or ""

    ui.scriptListOverlay:setBounds(12, 32, panelW - 24, height - 40)
    ui.scriptListOverlay:setInterceptsMouse(true, true)
    ui.scriptListOverlay:setDisplayList(buildScriptListDisplay(scripts, ui.scriptListOverlay:getWidth(), ui.scriptListOverlay:getHeight(), currentPath))

    ui.scriptListOverlay:setOnMouseDown(function(mx, my)
        local _ = mx
        local itemH = 28
        local idx = math.floor(my / itemH) + 1

        if idx >= 1 and idx <= #scripts then
            local script = scripts[idx]
            if script and switchUiScript then
                switchUiScript(script.path)
                showStatus("Switching to: " .. script.name)
            end
        end
    end)
end

-- ============================================================================
-- UI Initialization
-- ============================================================================

function ui_init(root)
    -- Root panel with dark background
    ui.rootPanel = W.Panel.new(root, "rootPanel", {
        bg = 0xff0a0f1a,
    })

    -- ==========================================================================
    -- Header
    -- ==========================================================================
    ui.headerPanel = W.Panel.new(ui.rootPanel.node, "header", {
        bg = 0xff111827,
        border = 0xff1f2937,
        borderWidth = 1,
    })

    ui.titleLabel = W.Label.new(ui.headerPanel.node, "title", {
        text = "SETTINGS",
        colour = 0xff7dd3fc,
        fontSize = 20.0,
        fontStyle = FontStyle.bold,
    })

    -- ==========================================================================
    -- Tab Bar
    -- ==========================================================================
    ui.tabPanel = W.Panel.new(ui.rootPanel.node, "tabPanel", {
        bg = 0xff0f172a,
    })
    
    ui.oscTabBtn = createTabButton(ui.tabPanel.node, "osc", "OSC", 0, 0, 0, 0, function() switchTab("osc") end)
    ui.linkTabBtn = createTabButton(ui.tabPanel.node, "link", "Link", 0, 0, 0, 0, function() switchTab("link") end)
    ui.midiTabBtn = createTabButton(ui.tabPanel.node, "midi", "MIDI", 0, 0, 0, 0, function() switchTab("midi") end)
    ui.pathsTabBtn = createTabButton(ui.tabPanel.node, "paths", "Paths", 0, 0, 0, 0, function() switchTab("paths") end)

    -- ==========================================================================
    -- Content Panel (scrollable)
    -- ==========================================================================
    ui.contentPanel = W.Panel.new(ui.rootPanel.node, "contentPanel", {
        bg = 0xff0a0f1a,
    })
    ui.contentNode = ui.contentPanel.node
    
    -- Build initial tab content
    rebuildTabContent()
    
    -- Load current settings
    local current = osc.getSettings()
    if current then
        if ui.oscPortBox then ui.oscPortBox:setValue(current.inputPort or 9000) end
        if ui.queryPortBox then ui.queryPortBox:setValue(current.queryPort or 9001) end
        if ui.oscToggle then ui.oscToggle:setValue(current.oscEnabled ~= false) end
        if ui.queryToggle then ui.queryToggle:setValue(current.oscQueryEnabled ~= false) end
    end
    
    -- Load Link settings
    if link and ui.linkToggle then
        ui.linkToggle:setValue(link.isEnabled())
        ui.linkTempoToggle:setValue(link.isTempoSyncEnabled())
        ui.linkStartStopToggle:setValue(link.isStartStopSyncEnabled())
    end
    
    ui_resized(root:getWidth(), root:getHeight())
end

-- ============================================================================
-- Tab Switching and Content Rebuilding
-- ============================================================================

function rebuildTabContent()
    -- Clear only the settings content subtree. Do NOT clear the shared shell's
    -- deferred refresh queue here — that was nuking pending retained updates
    -- for the shell chrome and causing the hover-heals-it bug.
    ui.contentNode:clearChildren()

    local w = ui.contentNode:getWidth()
    local h = ui.contentNode:getHeight()

    scrollOffsets[currentTab] = 0

    local contentContainer = ui.contentNode:addChild("contentContainer")
    contentContainer:setBounds(0, 0, w, h)

    local contentH = 0
    if currentTab == "osc" then
        contentH = buildOscTab(contentContainer, w, h)
    elseif currentTab == "link" then
        contentH = buildLinkTab(contentContainer, w, h)
    elseif currentTab == "paths" then
        contentH = buildPathsTab(contentContainer, w, h)
    elseif currentTab == "midi" then
        contentH = buildMidiTab(contentContainer, w, h)
    end

    setupScrollableContent(ui.contentNode, contentContainer, contentH)

    local shell = (type(_G) == "table") and _G.shell or nil
    if type(shell) == "table" and type(shell.flushDeferredRefreshes) == "function" then
        shell:flushDeferredRefreshes()
    end
end

function switchTab(tabId)
    if currentTab == tabId then return end
    currentTab = tabId
    syncTabButtonStyles()
    rebuildTabContent()
end

-- ============================================================================
-- Layout
-- ============================================================================

function ui_resized(w, h)
    local margin = 0
    local headerH = 44
    local tabH = 40
    
    -- Root fills entire area
    setWidgetBounds(ui.rootPanel, 0, 0, w, h)
    
    -- Header
    setWidgetBounds(ui.headerPanel, margin, margin, w - margin * 2, headerH)
    setWidgetBounds(ui.titleLabel, 12, 10, w - 24, 24)
    
    -- Tab bar
    local tabY = margin + headerH
    setWidgetBounds(ui.tabPanel, margin, tabY, w - margin * 2, tabH)
    
    -- Tab buttons
    local tabW = math.floor((w - margin * 2 - 12) / 4)
    setWidgetBounds(ui.oscTabBtn, 4, 4, tabW, tabH - 8)
    setWidgetBounds(ui.linkTabBtn, 8 + tabW, 4, tabW, tabH - 8)
    setWidgetBounds(ui.midiTabBtn, 12 + tabW * 2, 4, tabW, tabH - 8)
    setWidgetBounds(ui.pathsTabBtn, 16 + tabW * 3, 4, tabW, tabH - 8)

    syncTabButtonStyles()
    
    -- Content area (scrollable)
    local contentY = tabY + tabH + 4
    local contentH = h - contentY - margin
    setWidgetBounds(ui.contentPanel, margin, contentY, w - margin * 2, contentH)
    
    -- Rebuild content with new size
    rebuildTabContent()
end

-- ============================================================================
-- Update Loop
-- ============================================================================

function ui_update(state)
    -- Update status display (OSC tab)
    if ui.statusDisplay then
        if getTime() - statusTime < 3 then
            ui.statusDisplay:setText(statusMessage)
        else
            local srvStatus = osc.getStatus()
            if srvStatus == "running" and ui.oscPortBox then
                ui.statusDisplay:setText("OSC: Running | Ports: " .. ui.oscPortBox:getValue() .. "/" .. ui.queryPortBox:getValue())
            elseif ui.statusDisplay then
                ui.statusDisplay:setText("OSC: " .. srvStatus)
            end
        end
    end
    
    -- Update Link peers indicator (Link tab)
    if ui.linkPeersLabel and link then
        local peers = link.getNumPeers()
        if peers == 0 then
            ui.linkPeersLabel:setText("No peers")
        elseif peers == 1 then
            ui.linkPeersLabel:setText("1 peer")
        else
            ui.linkPeersLabel:setText(peers .. " peers")
        end
    end
    
    -- Update tempo display (Link tab)
    if ui.tempoDisplay and state and state.params then
        local tempo = state.params["/core/behavior/tempo"]
        if tempo then
            ui.tempoDisplay:setText(string.format("%.1f BPM", tempo))
        end
    end
    
    -- Refresh script list periodically (Paths tab)
    if ui.scriptListOverlay and getTime() % 2 < 0.03 then  -- Every ~2 seconds
        setupScriptList(ui.availablePanel.node:getWidth() - 36, 200)
    end
    
    -- Update MIDI voices display (MIDI tab)
    if ui.midiVoicesDisplay and Midi then
        local voices = Midi.getNumActiveVoices and Midi.getNumActiveVoices() or 0
        ui.midiVoicesDisplay:setText(tostring(voices))
    end

    if currentTab == "midi" and MidiTab and MidiTab.update then
        MidiTab.update()
    end
end
