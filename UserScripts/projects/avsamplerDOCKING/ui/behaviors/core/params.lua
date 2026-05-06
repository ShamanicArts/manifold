local C = require("behaviors.core.constants")

local M = {}

function M.renderSourceInspectorWindow(ctx, deps)
  local sourceCol = tonumber(ctx.sourceSelectionCol) or 1
  local sourceSelected = true
  local label
  if sourceCol > 1 then
    local cd = ctx._colData and ctx._colData[sourceCol]
    if cd and cd.source then
      label = "Stack " .. tostring(sourceCol) .. ": " .. deps.colSourceLabel(ctx, sourceCol) .. " (grid)"
    else
      label = "Stack " .. tostring(sourceCol) .. ": (grid)"
    end
  else
    label = "Source (grid-selected)"
  end
  imguiTextColored(sourceSelected and 0xff22d3ee or 0xff94a3b8, label)

  local cd = ctx._colData and ctx._colData[sourceCol]
  if not cd or not cd.source then
    imguiTextColored(0xff94a3b8, "No source — select one to assign")
    imguiSpacing()
  end

  if imguiButton("Source: " .. deps.colSourceLabel(ctx, sourceCol)) then
    imguiOpenPopup("##srcInspectorPicker")
  end
  imguiSameLine()
  imguiText("Stack " .. tostring(sourceCol))

  if imguiBeginPopup("##srcInspectorPicker") then
    local targetCol = sourceCol
    if imguiMenuItem("Webcam") then
      deps.setSourceSpecForColumn(ctx, targetCol, { kind = "webcam", sourceIndex = 1 })
      imguiCloseCurrentPopup()
    end

    if imguiBeginMenu("Generators") then
      for i, g in ipairs(ctx.sources or {}) do
        if g.kind == "generator" then
          if imguiMenuItem(g.name or g.id) then
            local params = {}
            for _, pspec in ipairs(g.params or {}) do
              local pmin = tonumber(pspec.min) or 0
              local pmax = tonumber(pspec.max) or 1
              local defaultNorm = ((tonumber(pspec.default) or pmin) - pmin) / math.max(0.001, pmax - pmin)
              params[pspec.id] = deps.clamp(defaultNorm, 0, 1)
            end
            deps.setSourceSpecForColumn(ctx, targetCol, { kind = "generator", sourceIndex = i, sourceId = g.id, params = params })
            imguiCloseCurrentPopup()
          end
        end
      end
      imguiEndMenu()
    end

    if imguiBeginMenu("ML") then
      if imguiMenuItem("Segmented") then
        deps.setSourceSpecForColumn(ctx, targetCol, deps.defaultMLSourceSpec("segmented"))
        imguiCloseCurrentPopup()
      end
      if imguiMenuItem("Pose") then
        deps.setSourceSpecForColumn(ctx, targetCol, deps.defaultMLSourceSpec("pose"))
        imguiCloseCurrentPopup()
      end
      imguiEndMenu()
    end

    if imguiBeginMenu("From Column") then
      for colId, sourceCd in pairs(ctx._colData or {}) do
        if sourceCd and sourceCd.source and targetCol ~= colId then
          local clabel = "Stack " .. tostring(colId) .. " (" .. deps.colSourceLabel(ctx, colId) .. ")"
          if imguiMenuItem(clabel .. " / Raw (T0)") then
            deps.setSourceSpecForColumn(ctx, targetCol, { kind = "columntap", sourceCol = colId, tapIndex = 0 })
            imguiCloseCurrentPopup()
          end
          for ti = 1, math.min(#sourceCd.fx, 8) do
            if sourceCd.fx[ti] and sourceCd.fx[ti].enabled then
              local fxName = deps.colFxLabel(ctx, colId, ti)
              if imguiMenuItem(clabel .. " / " .. fxName .. " (T" .. ti .. ")") then
                deps.setSourceSpecForColumn(ctx, targetCol, { kind = "columntap", sourceCol = colId, tapIndex = ti })
                imguiCloseCurrentPopup()
              end
            end
          end
        end
      end
      imguiEndMenu()
    end

    imguiEndPopup()
  end

  imguiSeparator()
  local avail = imguiGetContentRegionAvail()
  deps.renderEmbeddedPanel(ctx, "sourceEmbed", deps.layoutSourceEmbed, math.max(120, math.floor(tonumber(avail.y) or 120) - 18))
end

function M.renderEffectInspectorWindow(ctx, deps)
  if ctx.selectedView == "compositor" then
    deps.renderCompositorLayerControls(ctx)
    return
  end

  local sel = ctx.selection
  local effectSelected = sel and sel.row and sel.row > 1
  local label
  if sel and sel.col and sel.col > 1 and sel.row > 1 then
    local cd = ctx._colData and ctx._colData[sel.col]
    local fxName = cd and cd.fx[sel.row - 1] and deps.colFxLabel(ctx, sel.col, sel.row - 1) or ""
    label = "Stack " .. tostring(sel.col) .. " FX" .. tostring(sel.row - 1) .. ": " .. fxName .. " (grid)"
  elseif effectSelected and sel and sel.col == 1 then
    label = "Effect (grid-selected)"
  else
    label = "Effect"
  end
  imguiTextColored(effectSelected and 0xff22d3ee or 0xff94a3b8, label)

  local isEmptyFx = sel and sel.col and sel.row and sel.row > 1 and
    ctx.clips and ctx.clips[sel.col] and ctx.clips[sel.col][sel.row] and
    ctx.clips[sel.col][sel.row].emptyFx
  if isEmptyFx then
    imguiTextColored(0xff94a3b8, "Select an effect to assign")
    imguiSpacing()
  end

  imguiSeparator()
  local avail = imguiGetContentRegionAvail()
  deps.renderEmbeddedPanel(ctx, "effectEmbed", deps.layoutEffectEmbed, math.max(180, math.floor(tonumber(avail.y) or 180) - 18))
  imguiSpacing()
  imguiTextColored(0xff64748b, "Pins for selected effect/source will land here later.")
end

function M.renderParamTransportWindow(ctx, deps)
  imguiSeparatorText("Transport / MIDI")
  deps.renderEmbeddedPanel(ctx, "transportEmbed", deps.layoutTransportEmbed, 98)
  imguiSpacing()
  if deps.round(deps.readParam(C.NS .. "/mode", 0)) == 1 then
    imguiSeparatorText("Slice Mode")
    deps.renderEmbeddedPanel(ctx, "sliceEmbed", deps.layoutSliceEmbed, 104)
  else
    imguiSeparatorText("Poly Voice Areas")
    deps.renderEmbeddedPanel(ctx, "polyEmbed", deps.layoutPolyEmbed, 104)
  end
end

function M.renderParamMappingWindow(ctx, deps)
  imguiSeparatorText("Pose / Seg / Mapping")
  local avail = imguiGetContentRegionAvail()
  deps.renderEmbeddedPanel(ctx, "mappingEmbed", deps.layoutMappingEmbed, math.max(200, math.floor(tonumber(avail.y) or 200)))
end

function M.renderParamFxWindow(ctx, deps)
  imguiSeparatorText("FX Rack")
  local avail = imguiGetContentRegionAvail()
  deps.renderEmbeddedPanel(ctx, "fxEmbed", deps.layoutFxEmbed, math.max(220, math.floor(tonumber(avail.y) or 220)))
end

function M.renderParametersPanel(ctx, deps)
  local dockspaceId = imguiGetID("AVSD_params_ds")

  if not ctx._panelDocks or not ctx._panelDocks.params then
    ctx._panelDocks = ctx._panelDocks or {}
    local avail = imguiGetContentRegionAvail()
    local pw = math.max(1, math.floor(tonumber(avail.x) or 360))
    local ph = math.max(1, math.floor(tonumber(avail.y) or 300))

    imguiDockBuilderRemoveNode(dockspaceId)
    imguiDockBuilderAddNode(dockspaceId, imguiDockNodeFlags_DockSpace)
    imguiDockBuilderSetNodeSize(dockspaceId, pw, ph)

    local topBand, lowerStack = deps.panelSplit{ node = dockspaceId, dir = imguiDir_Up, ratio = 0.24 }
    local sourceArea, effectArea = deps.panelSplit{ node = topBand, dir = imguiDir_Right, ratio = 0.50 }
    local transportArea, lowerTail = deps.panelSplit{ node = lowerStack, dir = imguiDir_Up, ratio = 0.22 }
    local mappingArea, fxArea = deps.panelSplit{ node = lowerTail, dir = imguiDir_Up, ratio = 0.56 }

    imguiDockBuilderDockWindow("Source###AVSD_param_source", sourceArea)
    imguiDockBuilderDockWindow("Effect###AVSD_param_effect", effectArea)
    imguiDockBuilderDockWindow("Transport###AVSD_param_transport", transportArea)
    imguiDockBuilderDockWindow("Mapping###AVSD_param_mapping", mappingArea)
    imguiDockBuilderDockWindow("FX Rack###AVSD_param_fx", fxArea)

    imguiDockBuilderFinish(dockspaceId)
    ctx._panelDocks.params = true
  end

  imguiDockSpace(dockspaceId, 0, 0, imguiDockNodeFlags_None)

  if imguiBegin("Source###AVSD_param_source", imguiWindowFlags_NoTitleBar) then
    M.renderSourceInspectorWindow(ctx, deps)
  end
  imguiEnd()

  if imguiBegin("Effect###AVSD_param_effect", imguiWindowFlags_NoTitleBar) then
    M.renderEffectInspectorWindow(ctx, deps)
  end
  imguiEnd()

  if imguiBegin("Transport###AVSD_param_transport", imguiWindowFlags_NoTitleBar) then
    M.renderParamTransportWindow(ctx, deps)
  end
  imguiEnd()

  if imguiBegin("Mapping###AVSD_param_mapping", imguiWindowFlags_NoTitleBar) then
    M.renderParamMappingWindow(ctx, deps)
  end
  imguiEnd()

  if imguiBegin("FX Rack###AVSD_param_fx", imguiWindowFlags_NoTitleBar) then
    M.renderParamFxWindow(ctx, deps)
  end
  imguiEnd()
end

return M
