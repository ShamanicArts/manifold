local C = require("behaviors.core.constants")

local M = {}

function M.layoutTransportEmbed(ctx, w, h, deps)
  deps.setBounds(ctx.widgets.transportEmbed, 0, 0, w, h)
  local pad, gap = 8, 6
  local sw = math.floor((w - pad * 2 - gap * 2) / 3)
  deps.setBounds(ctx.widgets.speed, pad, 25, sw, 17)
  deps.setBounds(ctx.widgets.output, pad + sw + gap, 25, sw, 17)
  deps.setBounds(ctx.widgets.rootNote, pad + (sw + gap) * 2, 25, math.max(1, w - pad * 2 - (sw + gap) * 2), 17)
  deps.setBounds(ctx.widgets.midiInput, pad, 50, math.max(80, w - pad * 2 - 54), 18)
  deps.setBounds(ctx.widgets.midiRefresh, w - pad - 48, 50, 48, 18)
  deps.setBounds(ctx.widgets.midiStatus, pad, math.max(73, h - 18), math.max(1, w - pad * 2), 13)
end

function M.layoutPolyEmbed(ctx, w, h, deps)
  deps.setBounds(ctx.widgets.polyEmbed, 0, 0, w, h)
  local pad, gap = 8, 6
  local row1Y, row2Y, row3Y = 25, 50, 74
  local sw = math.max(48, math.floor((w - pad * 2 - gap * 2) / 3))
  deps.setBounds(ctx.widgets.pitchTracking, pad, row1Y, math.max(56, sw - 8), 18)
  deps.setBounds(ctx.widgets.voiceCount, pad + sw + gap, row1Y, sw, 17)
  deps.setBounds(ctx.widgets.playStart, pad + (sw + gap) * 2, row1Y, math.max(72, w - pad - (pad + (sw + gap) * 2)), 17)
  local row2W = math.max(56, math.floor((w - pad * 2 - gap * 2) / 3))
  deps.setBounds(ctx.widgets.loopStart, pad, row2Y, row2W, 17)
  deps.setBounds(ctx.widgets.loopEnd, pad + row2W + gap, row2Y, row2W, 17)
  deps.setBounds(ctx.widgets.crossfade, pad + (row2W + gap) * 2, row2Y, math.max(62, w - pad - (pad + (row2W + gap) * 2)), 17)
  deps.setBounds(ctx.widgets.oneShot, pad, row3Y, 64, 18)
end

function M.layoutSliceEmbed(ctx, w, h, deps)
  deps.setBounds(ctx.widgets.sliceEmbed, 0, 0, w, h)
  local pad = 8
  deps.setBounds(ctx.widgets.selectedSlice, pad, 25, math.max(86, math.floor(w * 0.32)), 18)
  deps.setBounds(ctx.widgets.auditionSelected, pad + math.max(92, math.floor(w * 0.34)), 25, 72, 18)
  deps.setBounds(ctx.widgets.sliceHelp, pad, 50, math.max(1, w - pad * 2), math.max(42, h - 54))
end

function M.layoutSourceEmbed(ctx, w, h, deps)
  deps.setBounds(ctx.widgets.sourceEmbed, 0, 0, w, h)
  local pad, gap = 8, 4
  local topY = 25
  local sourceCol = tonumber(ctx.sourceSelectionCol) or 1
  local cd = ctx._colData and ctx._colData[sourceCol]
  local viewingCol2Plus = sourceCol > 1 and cd and cd.source

  if viewingCol2Plus then
    local src = cd.source
    local isParamSource = (src.kind == "generator" or src.kind == "ml")

    deps.setVisible(ctx.widgets.sourceSelect, false)
    deps.setVisible(ctx.widgets.aspectSelect, true)
    deps.setBounds(ctx.widgets.aspectSelect, pad, topY, math.max(96, math.floor((w - pad * 2) * 0.42)), 18)

    local showWebcamControls = (src.kind == "webcam")
    deps.setVisible(ctx.widgets.sourceDeviceSelect, showWebcamControls)
    deps.setVisible(ctx.widgets.sourceRefreshDevices, showWebcamControls)
    deps.setVisible(ctx.widgets.sourceOpenWebcam, showWebcamControls)
    deps.setVisible(ctx.widgets.sourceCloseWebcam, showWebcamControls)

    local srcRowY = showWebcamControls and 69 or 47
    if showWebcamControls then
      local deviceW = math.max(110, w - pad * 2 - 40 - 44 - 48 - gap * 3)
      deps.setBounds(ctx.widgets.sourceDeviceSelect, pad, 47, deviceW, 18)
      deps.setBounds(ctx.widgets.sourceRefreshDevices, pad + deviceW + gap, 47, 40, 18)
      deps.setBounds(ctx.widgets.sourceOpenWebcam, pad + deviceW + gap + 44, 47, 44, 18)
      deps.setBounds(ctx.widgets.sourceCloseWebcam, pad + deviceW + gap + 44 + 48, 47, 48, 18)
    else
      deps.setBounds(ctx.widgets.sourceDeviceSelect, 0, 0, 0, 0)
      deps.setBounds(ctx.widgets.sourceRefreshDevices, 0, 0, 0, 0)
      deps.setBounds(ctx.widgets.sourceOpenWebcam, 0, 0, 0, 0)
      deps.setBounds(ctx.widgets.sourceCloseWebcam, 0, 0, 0, 0)
    end

    if isParamSource then
      local srcCols = 2
      local srcColW = math.max(80, math.floor((w - pad * 2 - gap * (srcCols - 1)) / srcCols))
      for pi = 1, 4 do
        local col = (pi - 1) % srcCols
        local row = math.floor((pi - 1) / srcCols)
        deps.setBounds(ctx.widgets["sourceParam" .. pi], pad + col * (srcColW + gap), srcRowY + row * 22, math.max(1, srcColW - gap), 17)
      end
    else
      for pi = 1, 4 do deps.setBounds(ctx.widgets["sourceParam" .. pi], 0, 0, 0, 0) end
    end

    deps.setBounds(ctx.widgets.frameInfo, pad, math.max(srcRowY + 44, h - 18), math.max(1, w - pad * 2), 14)
    deps.syncShaderSourceParams(ctx)
    return
  end

  deps.setVisible(ctx.widgets.sourceSelect, false)
  deps.setVisible(ctx.widgets.aspectSelect, true)
  deps.setBounds(ctx.widgets.aspectSelect, pad, topY, math.max(96, math.floor((w - pad * 2) * 0.42)), 18)

  local srcSpec = deps.currentCol1SourceSpec(ctx)
  local isParamSource = srcSpec and (srcSpec.kind == "generator" or srcSpec.kind == "ml")
  local deviceY = 47
  if isParamSource then
    deps.setVisible(ctx.widgets.sourceDeviceSelect, false)
    deps.setVisible(ctx.widgets.sourceRefreshDevices, false)
    deps.setVisible(ctx.widgets.sourceOpenWebcam, false)
    deps.setVisible(ctx.widgets.sourceCloseWebcam, false)
    deps.setBounds(ctx.widgets.sourceDeviceSelect, 0, 0, 0, 0)
    deps.setBounds(ctx.widgets.sourceRefreshDevices, 0, 0, 0, 0)
    deps.setBounds(ctx.widgets.sourceOpenWebcam, 0, 0, 0, 0)
    deps.setBounds(ctx.widgets.sourceCloseWebcam, 0, 0, 0, 0)
  else
    deps.setVisible(ctx.widgets.sourceDeviceSelect, true)
    deps.setVisible(ctx.widgets.sourceRefreshDevices, true)
    deps.setVisible(ctx.widgets.sourceOpenWebcam, true)
    deps.setVisible(ctx.widgets.sourceCloseWebcam, true)
    local deviceW = math.max(110, w - pad * 2 - 40 - 44 - 48 - gap * 3)
    deps.setBounds(ctx.widgets.sourceDeviceSelect, pad, deviceY, deviceW, 18)
    deps.setBounds(ctx.widgets.sourceRefreshDevices, pad + deviceW + gap, deviceY, 40, 18)
    deps.setBounds(ctx.widgets.sourceOpenWebcam, pad + deviceW + gap + 44, deviceY, 44, 18)
    deps.setBounds(ctx.widgets.sourceCloseWebcam, pad + deviceW + gap + 44 + 48, deviceY, 48, 18)
  end

  local srcRowY = isParamSource and 47 or 69
  local srcCols = 2
  local srcColW = math.max(80, math.floor((w - pad * 2 - gap * (srcCols - 1)) / srcCols))
  for pi = 1, 4 do
    local col = (pi - 1) % srcCols
    local row = math.floor((pi - 1) / srcCols)
    deps.setBounds(ctx.widgets["sourceParam" .. pi], pad + col * (srcColW + gap), srcRowY + row * 22, math.max(1, srcColW - gap), 17)
  end
  deps.setBounds(ctx.widgets.frameInfo, pad, math.max(srcRowY + 44, h - 18), math.max(1, w - pad * 2), 14)
  deps.syncShaderSourceParams(ctx)
end

function M.layoutMappingEmbed(ctx, w, h, deps)
  deps.setBounds(ctx.widgets.mappingEmbed, 0, 0, w, h)
  local pad, gap = 8, 4
  deps.setBounds(ctx.widgets.mappingHelp, pad, 23, math.max(1, w - pad * 2), 14)
  local enableW, labelW = 42, 18
  local minW, maxW, invertW = 50, 50, 48
  local remaining = math.max(120, w - pad * 2 - labelW - enableW - minW - maxW - invertW - gap * 6)
  local sourceW = math.max(96, math.floor(remaining * 0.46))
  local targetW = math.max(96, remaining - sourceW)
  local xLabel = pad
  local xEnable = xLabel + labelW + gap
  local xSource = xEnable + enableW + gap
  local xTarget = xSource + sourceW + gap
  local xMin = xTarget + targetW + gap
  local xMax = xMin + minW + gap
  local xInvert = xMax + maxW + gap
  for i = 1, C.MAX_MAPPINGS do
    local y = 41 + (i - 1) * 22
    deps.setBounds(ctx.widgets["track" .. i .. "Label"], xLabel, y + 2, labelW, 14)
    deps.setBounds(ctx.widgets["mapping" .. i .. "Enable"], xEnable, y, enableW, 17)
    deps.setBounds(ctx.widgets["mapping" .. i .. "Source"], xSource, y, sourceW, 17)
    deps.setBounds(ctx.widgets["mapping" .. i .. "Target"], xTarget, y, targetW, 17)
    deps.setBounds(ctx.widgets["mapping" .. i .. "Min"], xMin, y, minW, 16)
    deps.setBounds(ctx.widgets["mapping" .. i .. "Max"], xMax, y, maxW, 16)
    deps.setBounds(ctx.widgets["mapping" .. i .. "Invert"], xInvert, y, math.max(40, w - pad - xInvert), 17)
  end
  deps.setBounds(ctx.widgets.mappingStatus, pad, math.max(222, h - 18), math.max(1, w - pad * 2), 14)
end

function M.setDropdownOverlayRoot(dropdown, rootWidget)
  if dropdown and dropdown.node and rootWidget and rootWidget.node then
    dropdown._rootNode = rootWidget.node
    dropdown._absX = nil
    dropdown._absY = nil
  end
end

function M.fxComponentWidget(ctx, localId)
  local widgets = ctx and ctx.allWidgets or nil
  if type(widgets) ~= "table" then return nil end
  return widgets["root.embedHost.fxEmbed.fx1.fx1Component." .. tostring(localId or "")]
end

function M.anchorFxComponentDropdowns(ctx)
  M.setDropdownOverlayRoot(M.fxComponentWidget(ctx, "type_dropdown"), ctx.widgets.fxEmbed)
  M.setDropdownOverlayRoot(M.fxComponentWidget(ctx, "xy_x_dropdown"), ctx.widgets.fxEmbed)
  M.setDropdownOverlayRoot(M.fxComponentWidget(ctx, "xy_y_dropdown"), ctx.widgets.fxEmbed)
end

function M.layoutFxEmbed(ctx, w, h, deps)
  deps.setBounds(ctx.widgets.fxEmbed, 0, 0, w, h)
  local shellH = math.max(120, h - 44)
  deps.setBounds(ctx.widgets.fx1, 0, 22, w, shellH)
  deps.relayoutManagedSubtree(ctx.widgets.fx1, w, shellH)
  if ctx.widgets.fx1Component then
    deps.relayoutManagedSubtree(ctx.widgets.fx1Component, w, math.max(1, shellH - 12))
  end
  M.anchorFxComponentDropdowns(ctx)
  deps.setBounds(ctx.widgets.fxStatus, 10, math.max(26, h - 18), math.max(1, w - 20), 16)
end

function M.layoutInputsEmbed(ctx, w, h, deps)
  deps.setBounds(ctx.widgets.inputsEmbed, 0, 0, w, h)
  local pad, gap = 6, 6
  local y = 8
  local swMax = math.max(52, math.floor((w - pad * 2 - gap * 6) / 7))
  local cy = y + 4
  deps.setBounds(ctx.widgets.segGain, pad, cy, swMax, 17)
  deps.setBounds(ctx.widgets.segThreshold, pad + (swMax + gap), cy, swMax, 17)
  deps.setBounds(ctx.widgets.segFeather, pad + (swMax + gap) * 2, cy, swMax, 17)
  deps.setBounds(ctx.widgets.segInvert, pad + (swMax + gap) * 3, cy, swMax, 18)
  deps.setBounds(ctx.widgets.poseConf, pad + (swMax + gap) * 4, cy, swMax, 17)
  deps.setBounds(ctx.widgets.showSkeleton, pad + (swMax + gap) * 5, cy, swMax, 18)
  deps.setBounds(ctx.widgets.loadModels, pad + (swMax + gap) * 6, cy, math.max(28, w - pad * 2 - (swMax + gap) * 6), 18)
  local titleY = cy + 22
  deps.setBounds(ctx.widgets.rawTitle, 10, titleY, 90, 12)
  deps.setBounds(ctx.widgets.segTitle, 146, titleY, 90, 12)
  deps.setBounds(ctx.widgets.poseTitle, 282, titleY, 90, 12)
  local statusY = titleY + 15
  deps.setBounds(ctx.widgets.poseStatus, pad, statusY, math.max(1, w - pad * 2), 13)
  deps.setBounds(ctx.widgets.captureStatus, pad, statusY + 14, math.max(1, w - pad * 2), 13)
  deps.setBounds(ctx.widgets.samplerStatus, pad, statusY + 28, math.max(1, w - pad * 2), 13)
  deps.setBounds(ctx.widgets.liveViewport, 0, 0, 0, 0)
  deps.setBounds(ctx.widgets.segViewport, 0, 0, 0, 0)
  deps.setBounds(ctx.widgets.poseViewport, 0, 0, 0, 0)
end

function M.layoutWaveformEmbed(ctx, w, h, deps)
  deps.setBounds(ctx.widgets.waveformEmbed, 0, 0, w, h)
  deps.setBounds(ctx.widgets.waveform, 0, 0, 0, 0)
  deps.setBounds(ctx.widgets.waveformStatus, 8, 8, math.max(1, w - 16), 14)
end

function M.layoutStageEmbed(ctx, w, h, deps)
  deps.setBounds(ctx.widgets.stageEmbed, 0, 0, w, h)
  deps.setBounds(ctx.widgets.outputViewport, 0, 0, w, h)
  deps.setBounds(ctx.widgets.previewStage, 0, 0, 0, 0)
  deps.layoutOutputRow(ctx)
  deps.updatePreviewSurface(ctx)
end

function M.layoutDeckEmbed(ctx, w, h, deps)
  deps.setBounds(ctx.widgets.deckEmbed, 0, 0, w, h)
  local x0, y0 = 8, 25
  local availW, availH = math.max(1, w - 16), math.max(1, h - 32)
  local gap = 4

  if w < 560 then
    for row = 1, 3 do
      deps.setVisible(ctx.widgets["deckLayer" .. row], false)
      deps.setVisible(ctx.widgets["deckLayer" .. row .. "A"], false)
      deps.setVisible(ctx.widgets["deckLayer" .. row .. "B"], false)
      deps.setVisible(ctx.widgets["deckBlend" .. row], false)
    end
    local cols = w < 320 and 2 or 4
    local rows = math.ceil(24 / cols)
    local cellW = math.max(48, math.floor((availW - gap * (cols - 1)) / cols))
    local rowH = math.max(38, math.floor((availH - gap * (rows - 1)) / rows))
    local idx = 1
    for row = 1, rows do
      for col = 1, cols do
        if idx <= 8 then
          local id = "deckCell" .. idx
          local cx = x0 + (col - 1) * (cellW + gap)
          local cy = y0 + (row - 1) * (rowH + gap)
          deps.setVisible(ctx.widgets[id], true)
          deps.setBounds(ctx.widgets[id], cx, cy, cellW, rowH)
        end
        idx = idx + 1
      end
    end
    for i = 9, 24 do
      local widget = ctx.widgets["deckCell" .. i]
      if widget then
        deps.setVisible(widget, false)
        deps.setBounds(widget, 0, 0, 0, 0)
      end
    end
    return
  end

  for i = 1, 24 do
    local widget = ctx.widgets["deckCell" .. i]
    if widget then deps.setVisible(widget, false) end
  end
  local topStripH = 72
  local bottomY = y0 + topStripH + gap
  local bottomH = math.max(80, availH - topStripH - gap)
  local bottomRowH = math.max(36, math.floor((bottomH - gap) / 2))
  local bottomCellW = math.max(52, math.floor((availW - gap * 3) / 4))
  for row = 1, 3 do
    deps.setVisible(ctx.widgets["deckLayer" .. row], true)
    deps.setVisible(ctx.widgets["deckLayer" .. row .. "A"], true)
    deps.setVisible(ctx.widgets["deckLayer" .. row .. "B"], true)
    deps.setVisible(ctx.widgets["deckBlend" .. row], true)
  end
  for row = 1, 3 do
    local y = y0 + (row - 1) * 24
    deps.setBounds(ctx.widgets["deckLayer" .. row], x0, y, 76, 18)
    deps.setBounds(ctx.widgets["deckLayer" .. row .. "A"], x0 + 82, y, 44, 18)
    deps.setBounds(ctx.widgets["deckLayer" .. row .. "B"], x0 + 130, y, 44, 18)
    deps.setBounds(ctx.widgets["deckBlend" .. row], x0 + 178, y, math.max(120, availW - 178), 18)
  end
  for i = 1, 8 do
    local idx = i - 1
    local row = math.floor(idx / 4)
    local col = idx % 4
    local id = "deckCell" .. i
    local cx = x0 + col * (bottomCellW + gap)
    local cy = bottomY + row * (bottomRowH + gap)
    deps.setVisible(ctx.widgets[id], true)
    deps.setBounds(ctx.widgets[id], cx, cy, bottomCellW, bottomRowH)
  end
end

function M.section(title, accent, lines)
  imguiTextColored(accent or 0xff94a3b8, title)
  imguiSeparator()
  for _, line in ipairs(lines or {}) do imguiText(line) end
  imguiSpacing()
end

function M.renderEmbeddedPanel(ctx, widgetId, layoutFn, forcedHeight, fitToView)
  local host = ctx.widgets and ctx.widgets[widgetId]
  if not (host and host.node and type(imguiRetainedPanel) == "function") then
    imguiText("Retained panel host unavailable")
    return
  end
  local avail = imguiGetContentRegionAvail()
  local w = math.max(1, math.floor(tonumber(avail.x) or 0))
  local rawH = forcedHeight ~= nil and forcedHeight or (tonumber(avail.y) or 0)
  local h = math.max(1, math.floor(math.min(rawH, tonumber(avail.y) or rawH)))
  layoutFn(ctx, w, h)
  imguiRetainedPanel(host.node, w, h, fitToView == true)
end

return M
