local C = require("behaviors.core.constants")
local U = require("behaviors.core.util")
local ML = require("behaviors.core.ml")

local M = {}

function M.viewportSize(deps)
  if type(imguiGetMainViewport) == "function" then
    local vp = imguiGetMainViewport()
    if type(vp) == "table" then
      local w = deps.toNum(vp.w or vp.width or vp.sizeX or vp.size_x) or 0
      local h = deps.toNum(vp.h or vp.height or vp.sizeY or vp.size_y) or 0
      if w > 0 and h > 0 then return w, h end
    end
  end
  return 1280, 720
end

function M.projectContentBounds(ctx, deps)
  local totalW, totalH = M.viewportSize(deps)
  if type(shell) == "table" and type(shell.getContentBounds) == "function" then
    local ok, x, y, w, h = pcall(function() return shell:getContentBounds(totalW, totalH) end)
    if ok and deps.toNum(w) and deps.toNum(h) and w > 0 and h > 0 then
      return deps.toNum(x) or 0, deps.toNum(y) or 0, deps.toNum(w), deps.toNum(h)
    end
  end
  if ctx and ctx.root and ctx.root.node and ctx.root.node.getBounds then
    local ok, x, y, w, h = pcall(ctx.root.node.getBounds, ctx.root.node)
    if ok and deps.toNum(w) and deps.toNum(h) and w > 0 and h > 0 then
      return deps.toNum(x) or 0, deps.toNum(y) or 0, deps.toNum(w), deps.toNum(h)
    end
  end
  return 0, 0, totalW, totalH
end

function M.windowName(ctx, win)
  return win.title .. "###AVSD_" .. tostring(ctx._dockSuffix or "0") .. "_" .. win.key
end

function M.split(t)
  local r = imguiDockBuilderSplitNode(t.node, t.dir, t.ratio)
  if imguiDockBuilderSetNodeFlags then
    imguiDockBuilderSetNodeFlags(r.atDir, imguiDockNodeFlags_HiddenTabBar)
    imguiDockBuilderSetNodeFlags(r.opposite, imguiDockNodeFlags_HiddenTabBar)
  end
  return r.atDir, r.opposite
end

function M.buildDeckLayout(ctx, dockId)
  local params, leftCol = M.split{ node = dockId, dir = imguiDir_Right, ratio = 0.26 }
  local leftInner, center = M.split{ node = leftCol, dir = imguiDir_Left, ratio = 0.34 }
  local wave, deck = M.split{ node = center, dir = imguiDir_Down, ratio = 0.25 }
  local sources, stage = M.split{ node = leftInner, dir = imguiDir_Down, ratio = 0.64 }
  local grid, comp = M.split{ node = deck, dir = imguiDir_Down, ratio = 0.65 }
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[1]), grid)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[2]), stage)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[3]), sources)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[4]), wave)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[5]), params)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[6]), comp)
end

function M.buildStageLayout(ctx, dockId)
  local rightCol, leftCol = M.split{ node = dockId, dir = imguiDir_Right, ratio = 0.38 }
  local sources, params = M.split{ node = rightCol, dir = imguiDir_Down, ratio = 0.44 }
  local bottom, stage = M.split{ node = leftCol, dir = imguiDir_Down, ratio = 0.32 }
  local wave, deck = M.split{ node = bottom, dir = imguiDir_Down, ratio = 0.50 }
  local grid, comp = M.split{ node = deck, dir = imguiDir_Down, ratio = 0.65 }
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[1]), grid)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[2]), stage)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[3]), sources)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[4]), wave)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[5]), params)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[6]), comp)
end

function M.buildInspectorLayout(ctx, dockId)
  local params, leftCol = M.split{ node = dockId, dir = imguiDir_Right, ratio = 0.38 }
  local sources, topLeft = M.split{ node = leftCol, dir = imguiDir_Down, ratio = 0.30 }
  local bottom, stage = M.split{ node = topLeft, dir = imguiDir_Down, ratio = 0.38 }
  local wave, deck = M.split{ node = bottom, dir = imguiDir_Down, ratio = 0.50 }
  local grid, comp = M.split{ node = deck, dir = imguiDir_Down, ratio = 0.65 }
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[1]), grid)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[2]), stage)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[3]), sources)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[4]), wave)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[5]), params)
  imguiDockBuilderDockWindow(M.windowName(ctx, C.DOCK_WINDOWS[6]), comp)
end

function M.syncToolbarButtons(ctx, deps)
  local active = tostring(ctx._layoutPreset or "deck")
  local colours = { layoutDeck = active == "deck", layoutStage = active == "stage", layoutInspector = active == "inspector" }
  for id, on in pairs(colours) do
    local w = ctx.widgets and ctx.widgets[id]
    if w and w.setBg then w:setBg(on and 0xff22d3ee or 0xff1e293b) end
  end
  if ctx.widgets.resizeMode and ctx.widgets.resizeMode.setValue then deps.setValueSilently(ctx.widgets.resizeMode, ctx._resizeMode == true) end
  deps.setVisible(ctx.widgets.resizeHelp, ctx._resizeMode == true)
end

function M.defaultGridAlignment(preset)
  if preset == "stage" or preset == "inspector" then return "left-to-right" end
  return "bottom-up"
end

function M.resetPanelDocks(ctx)
  ctx._panelDocks = {}
end

function M.setLayoutPreset(ctx, preset, deps)
  ctx._layoutPreset = tostring(preset or "deck")
  ctx.gridAlignment = M.defaultGridAlignment(ctx._layoutPreset)
  ctx._rebuildDockTree = true
  M.resetPanelDocks(ctx)
  M.syncToolbarButtons(ctx, deps)
end

function M.layoutToolbar(ctx, deps)
  if ctx.widgets and ctx.widgets.toolbarPane and ctx.root and ctx.root.node and ctx.root.node.getBounds then
    local _, _, w = ctx.root.node:getBounds()
    deps.setBounds(ctx.widgets.toolbarPane, 0, 0, math.max(1280, math.floor(tonumber(w) or 1280)), C.TOOLBAR_H)
  end
  M.syncToolbarButtons(ctx, deps)
end

function M.panelSplit(t)
  local r = imguiDockBuilderSplitNode(t.node, t.dir, t.ratio)
  if imguiDockBuilderSetNodeFlags then
    imguiDockBuilderSetNodeFlags(r.atDir, imguiDockNodeFlags_HiddenTabBar)
    imguiDockBuilderSetNodeFlags(r.opposite, imguiDockNodeFlags_HiddenTabBar)
  end
  return r.atDir, r.opposite
end

function M.renderSourcesPanel(ctx, deps)
  local dockspaceId = imguiGetID("AVSD_sources_ds")
  if not ctx._panelDocks or not ctx._panelDocks.sources then
    ctx._panelDocks = ctx._panelDocks or {}
    local avail = imguiGetContentRegionAvail()
    local pw = math.max(1, math.floor(tonumber(avail.x) or 300))
    local ph = math.max(1, math.floor(tonumber(avail.y) or 200))
    imguiDockBuilderRemoveNode(dockspaceId)
    imguiDockBuilderAddNode(dockspaceId, imguiDockNodeFlags_DockSpace)
    imguiDockBuilderSetNodeSize(dockspaceId, pw, ph)
    local viewports, controls = M.panelSplit{ node = dockspaceId, dir = imguiDir_Down, ratio = 0.55 }
    local liveArea, rest = M.panelSplit{ node = viewports, dir = imguiDir_Left, ratio = 0.33 }
    local segArea, poseArea = M.panelSplit{ node = rest, dir = imguiDir_Left, ratio = 0.50 }
    imguiDockBuilderDockWindow("Live###AVSD_live", liveArea)
    imguiDockBuilderDockWindow("Segmented###AVSD_seg", segArea)
    imguiDockBuilderDockWindow("Pose###AVSD_pose", poseArea)
    imguiDockBuilderDockWindow("Controls###AVSD_src_ctrl", controls)
    imguiDockBuilderFinish(dockspaceId)
    ctx._panelDocks.sources = true
  end

  imguiDockSpace(dockspaceId, 0, 0, imguiDockNodeFlags_None)

  if imguiBegin("Live###AVSD_live", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      deps.setBounds(ctx.widgets.liveViewport, 0, 0, math.floor(av.x), math.floor(av.y))
      imguiRetainedPanel(ctx.widgets.liveViewport.node, math.floor(av.x), math.floor(av.y), true)
    end
  end
  imguiEnd()

  if imguiBegin("Segmented###AVSD_seg", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      deps.setBounds(ctx.widgets.segViewport, 0, 0, math.floor(av.x), math.floor(av.y))
      imguiRetainedPanel(ctx.widgets.segViewport.node, math.floor(av.x), math.floor(av.y), true)
    end
  end
  imguiEnd()

  if imguiBegin("Pose###AVSD_pose", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      deps.setBounds(ctx.widgets.poseViewport, 0, 0, math.floor(av.x), math.floor(av.y))
      ctx._poseVpW = math.floor(av.x)
      ctx._poseVpH = math.floor(av.y)
      ML.ensurePoseOverlay(ctx)
      if ctx._poseOverlay then ctx._poseOverlay:setBounds(0, 0, ctx._poseVpW, ctx._poseVpH) end
      imguiRetainedPanel(ctx.widgets.poseViewport.node, math.floor(av.x), math.floor(av.y), true)
    end
  end
  imguiEnd()

  if imguiBegin("Controls###AVSD_src_ctrl", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      deps.layoutInputsEmbed(ctx, math.floor(av.x), math.floor(av.y))
      imguiRetainedPanel(ctx.widgets.inputsEmbed.node, math.floor(av.x), math.floor(av.y), false)
    end
  end
  imguiEnd()
end

function M.renderStagePanel(ctx, deps)
  local dockspaceId = imguiGetID("AVSD_stage_ds")
  if not ctx._panelDocks or not ctx._panelDocks.stage then
    ctx._panelDocks = ctx._panelDocks or {}
    local avail = imguiGetContentRegionAvail()
    local pw = math.max(1, math.floor(tonumber(avail.x) or 500))
    local ph = math.max(1, math.floor(tonumber(avail.y) or 300))
    imguiDockBuilderRemoveNode(dockspaceId)
    imguiDockBuilderAddNode(dockspaceId, imguiDockNodeFlags_DockSpace)
    imguiDockBuilderSetNodeSize(dockspaceId, pw, ph)
    local outputArea, previewArea = M.panelSplit{ node = dockspaceId, dir = imguiDir_Right, ratio = 0.28 }
    imguiDockBuilderDockWindow("Output###AVSD_output", outputArea)
    imguiDockBuilderDockWindow("Preview###AVSD_preview", previewArea)
    imguiDockBuilderFinish(dockspaceId)
    ctx._panelDocks.stage = true
  end
  imguiDockSpace(dockspaceId, 0, 0, imguiDockNodeFlags_None)

  if imguiBegin("Output###AVSD_output", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      local rw, rh = math.floor(av.x), math.floor(av.y)
      deps.setBounds(ctx.widgets.outputViewport, 0, 0, rw, rh)
      if ctx.widgets.outputSurface then
        local cw, ch = deps.canonicalAspectSize(ctx)
        local ix, iy, iw, ih = deps.fitBox(rw, rh, cw, ch)
        deps.setBounds(ctx.widgets.outputSurface, ix, iy, iw, ih)
      end
      deps.layoutOutputRow(ctx)
      imguiRetainedPanel(ctx.widgets.outputViewport.node, rw, rh, true)
    end
  end
  imguiEnd()

  if imguiBegin("Preview###AVSD_preview", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      local rw, rh = math.floor(av.x), math.floor(av.y)
      deps.setBounds(ctx.widgets.previewStage, 0, 0, rw, rh)
      deps.setBounds(ctx.widgets.previewStageTag, 5, 4, math.max(1, rw - 10), 12)
      imguiRetainedPanel(ctx.widgets.previewStage.node, rw, rh, true)
    end
  end
  imguiEnd()
end

function M.renderWaveformPanel(ctx, deps)
  local dockspaceId = imguiGetID("AVSD_waveform_ds")
  if not ctx._panelDocks or not ctx._panelDocks.waveform then
    ctx._panelDocks = ctx._panelDocks or {}
    local avail = imguiGetContentRegionAvail()
    local pw = math.max(1, math.floor(tonumber(avail.x) or 500))
    local ph = math.max(1, math.floor(tonumber(avail.y) or 120))
    imguiDockBuilderRemoveNode(dockspaceId)
    imguiDockBuilderAddNode(dockspaceId, imguiDockNodeFlags_DockSpace)
    imguiDockBuilderSetNodeSize(dockspaceId, pw, ph)
    imguiDockBuilderDockWindow("Waveform###AVSD_waveform", dockspaceId)
    imguiDockBuilderFinish(dockspaceId)
    ctx._panelDocks.waveform = true
  end
  imguiDockSpace(dockspaceId, 0, 0, imguiDockNodeFlags_None)
  if imguiBegin("Waveform###AVSD_waveform", imguiWindowFlags_NoTitleBar) then
    local av = imguiGetContentRegionAvail()
    if av.x > 4 and av.y > 4 then
      deps.setBounds(ctx.widgets.waveform, 0, 0, math.floor(av.x), math.floor(av.y))
      imguiRetainedPanel(ctx.widgets.waveform.node, math.floor(av.x), math.floor(av.y), true)
    end
  end
  imguiEnd()
end

function M.renderPanel(ctx, win, deps)
  if imguiBegin(deps.windowName(ctx, win), imguiWindowFlags_NoCollapse) then
    if win.key == "sources" then
      M.renderSourcesPanel(ctx, deps)
    elseif win.key == "params" then
      deps.renderParametersPanel(ctx)
    elseif win.key == "stage" then
      M.renderStagePanel(ctx, deps)
    elseif win.key == "deck" then
      deps.renderDeckPanel(ctx)
    elseif win.key == "compositor" then
      deps.renderCompositorPanel(ctx)
    elseif win.key == "waveform" then
      M.renderWaveformPanel(ctx, deps)
    end
  end
  imguiEnd()
end

function M.renderFrame(ctx, deps)
  local x, y, w, h = M.projectContentBounds(ctx, deps)
  if w < 64 or h < 64 then return end

  local toolbarH = C.TOOLBAR_H
  local hostFlags = deps.bor(
    imguiWindowFlags_NoTitleBar,
    imguiWindowFlags_NoResize,
    imguiWindowFlags_NoMove,
    imguiWindowFlags_NoCollapse,
    imguiWindowFlags_NoSavedSettings,
    imguiWindowFlags_NoScrollbar
  )

  imguiSetNextWindowPos(x, y + toolbarH, imguiCond_Always)
  imguiSetNextWindowSize(w, math.max(1, h - toolbarH), imguiCond_Always)

  local hostName = "AVSampler Dockspace Host###AVSD_host_" .. tostring(ctx._dockSuffix or "0")
  local dockspaceId = imguiGetID("AVSamplerProjectDockspace_" .. tostring(ctx._dockSuffix or "0"))

  if imguiBegin(hostName, hostFlags) then
    imguiDockSpace(dockspaceId, 0, 0, imguiDockNodeFlags_None)
    if (ctx._rebuildDockTree or not ctx._dockTreeBuilt) and w > 200 and h > 160 then
      local preset = tostring(ctx._layoutPreset or "deck")
      imguiDockBuilderRemoveNode(dockspaceId)
      imguiDockBuilderAddNode(dockspaceId, imguiDockNodeFlags_DockSpace)
      imguiDockBuilderSetNodeSize(dockspaceId, w, math.max(1, h - toolbarH))
      if preset == "stage" then
        M.buildStageLayout(ctx, dockspaceId)
      elseif preset == "inspector" then
        M.buildInspectorLayout(ctx, dockspaceId)
      else
        M.buildDeckLayout(ctx, dockspaceId)
      end
      imguiDockBuilderFinish(dockspaceId)
      if imguiDockBuilderSetNodeFlags then imguiDockBuilderSetNodeFlags(dockspaceId, imguiDockNodeFlags_HiddenTabBar) end
      ctx._dockTreeBuilt = true
      ctx._rebuildDockTree = false
    end
  end
  imguiEnd()

  for _, win in ipairs(C.DOCK_WINDOWS) do M.renderPanel(ctx, win, deps) end
end

return M
