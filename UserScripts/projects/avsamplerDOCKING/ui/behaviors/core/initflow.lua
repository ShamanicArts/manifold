local C = require("behaviors.core.constants")
local Midi = require("behaviors.core.midi")
local ML = require("behaviors.core.ml")
local Mapping = require("behaviors.core.mapping")
local Prof = require("behaviors.core.profiler")

local M = {}

function M.run(ctx, deps)
  for _, w in pairs(ctx.allWidgets or {}) do
    if type(w) == "table" then
      if type(w.config) == "table" and type(w.config.paramPath) == "string" then deps.bindParamWidget(w) end
    end
  end

  if ctx.widgets.embedHost then
    deps.setVisible(ctx.widgets.embedHost, false)
    if ctx.widgets.embedHost.node and ctx.widgets.embedHost.node.setInterceptsMouse then
      ctx.widgets.embedHost.node:setInterceptsMouse(false, false)
    end
  end

  deps.setDropdownOverlayRoot(ctx.widgets.deviceSelect, ctx.root)
  deps.setDropdownOverlayRoot(ctx.widgets.midiInput, ctx.widgets.transportEmbed)
  deps.setDropdownOverlayRoot(ctx.widgets.sourceSelect, ctx.widgets.sourceEmbed)
  deps.setDropdownOverlayRoot(ctx.widgets.aspectSelect, ctx.widgets.sourceEmbed)
  deps.setDropdownOverlayRoot(ctx.widgets.sourceDeviceSelect, ctx.widgets.sourceEmbed)
  deps.setDropdownOverlayRoot(ctx.widgets.shaderLayer, ctx.widgets.effectEmbed)
  deps.setDropdownOverlayRoot(ctx.widgets.effectSelect, ctx.widgets.effectEmbed)
  deps.setDropdownOverlayRoot(ctx.widgets.selectedSlice, ctx.widgets.sliceEmbed)
  deps.setDropdownOverlayRoot(ctx.widgets.compoColumn, ctx.widgets.compoLayerEmbed)
  deps.setDropdownOverlayRoot(ctx.widgets.compoTap, ctx.widgets.compoLayerEmbed)
  deps.setDropdownOverlayRoot(ctx.widgets.compoBlend, ctx.widgets.compoLayerEmbed)
  deps.anchorFxComponentDropdowns(ctx)
  for i = 1, C.MAX_MAPPINGS do
    deps.setDropdownOverlayRoot(ctx.widgets["mapping" .. i .. "Source"], ctx.widgets.mappingEmbed)
    deps.setDropdownOverlayRoot(ctx.widgets["mapping" .. i .. "Target"], ctx.widgets.mappingEmbed)
  end

  deps.refreshShaderLists(ctx)
  deps.syncShaderEditor(ctx)
  deps.syncShaderSourceParams(ctx)
  deps.updateOutputAspect(ctx)
  if ctx.widgets.aspectSelect then
    local aspectIdx = 2
    if ctx.aspectMode == "Native" then aspectIdx = 1
    elseif ctx.aspectMode == "16:9" then aspectIdx = 2
    elseif ctx.aspectMode == "4:3" then aspectIdx = 3
    elseif ctx.aspectMode == "1:1" then aspectIdx = 4 end
    deps.setSelectedSilently(ctx.widgets.aspectSelect, aspectIdx)
  end
  deps.updateShader(ctx)
  deps.refreshDevices(ctx)
  Midi.refresh(ctx)
  if Audio == nil or (Audio.isPlugin and not Audio.isPlugin()) then
    if not Midi.currentMidiLabel() then Midi.openPreferred(ctx) end
  end
  ML.loadModels(ctx)
  Prof.init(ctx)
  ML.bindInputSurfaces(ctx)
  ML.ensurePoseOverlay(ctx)
  deps.layoutToolbar(ctx)
  deps.syncParamsFromHost(ctx)
  deps.syncClipModel(ctx)

  ctx.widgets.refreshDevices._onClick = function() deps.refreshDevices(ctx) end
  if ctx.widgets.deviceSelect then
    ctx.widgets.deviceSelect._onSelect = function(idx)
      ctx.deviceSelectIndex = math.max(1, deps.round(idx))
      deps.setSelectedSilently(ctx.widgets.sourceDeviceSelect, ctx.deviceSelectIndex)
    end
  end
  if ctx.widgets.sourceDeviceSelect then
    ctx.widgets.sourceDeviceSelect._onSelect = function(idx)
      ctx.deviceSelectIndex = math.max(1, deps.round(idx))
      deps.setSelectedSilently(ctx.widgets.deviceSelect, ctx.deviceSelectIndex)
    end
  end
  ctx.widgets.openWebcam._onClick = function() deps.openWebcam(ctx) end
  ctx.widgets.closeWebcam._onClick = function() deps.closeWebcam(ctx) end
  if ctx.widgets.sourceRefreshDevices then ctx.widgets.sourceRefreshDevices._onClick = function() deps.refreshDevices(ctx) end end
  if ctx.widgets.sourceOpenWebcam then ctx.widgets.sourceOpenWebcam._onClick = function() deps.openWebcam(ctx) end end
  if ctx.widgets.sourceCloseWebcam then ctx.widgets.sourceCloseWebcam._onClick = function() deps.closeWebcam(ctx) end end
  ctx.widgets.loadModels._onClick = function() ML.loadModels(ctx) end
  ctx.widgets.captureNow._onClick = function() deps.onCaptureButton(ctx) end
  ctx.widgets.play._onClick = function() deps.bump(C.NS .. "/play_trigger") end
  ctx.widgets.stop._onClick = function() deps.bump(C.NS .. "/stop_trigger") end
  ctx.widgets.clear._onClick = function()
    if ctx.video then ctx.video:clear() end
    if ctx.videoCap then ctx.videoCap:clear() end
    deps.refreshWaveform(ctx)
    deps.updatePreviewSurface(ctx)
    deps.layoutOutputRow(ctx)
  end
  ctx.widgets.layoutDeck._onClick = function() deps.setLayoutPreset(ctx, "deck") end
  ctx.widgets.layoutStage._onClick = function() deps.setLayoutPreset(ctx, "stage") end
  ctx.widgets.layoutInspector._onClick = function() deps.setLayoutPreset(ctx, "inspector") end
  ctx.widgets.resetLayout._onClick = function() ctx._rebuildDockTree = true; deps.resetPanelDocks(ctx) end
  ctx.widgets.resizeMode._onChange = function(v) ctx._resizeMode = v == true; deps.syncToolbarButtons(ctx) end
  ctx.widgets.midiRefresh._onClick = function() Midi.refresh(ctx); if not Midi.currentMidiLabel() then Midi.openPreferred(ctx) end end
  ctx.widgets.midiInput._onSelect = function(idx)
    if idx <= 1 then
      if Midi and Midi.closeInput then Midi.closeInput() end
    else
      if Midi and Midi.openInput then Midi.openInput(idx - 2) end
    end
    Midi.refresh(ctx)
  end
  ctx.widgets.selectedSlice._onSelect = function(idx)
    ctx._selectedSlice = math.max(1, math.min(C.MAX, deps.round(idx)))
    deps.writeParam(C.NS .. "/selected_slice", ctx._selectedSlice)
    deps.refreshWaveform(ctx)
    deps.updatePreviewSurface(ctx)
  end
  ctx.widgets.auditionSelected._onClick = function()
    deps.writeParam(deps.velocityPathForSlice(ctx._selectedSlice), 127)
    deps.bump(deps.triggerPathForSlice(ctx._selectedSlice))
  end

  ctx.widgets.segGain._onChange = function(v) ctx.seg.gain = deps.clamp(v, 0.25, 4); deps.writeParam(C.NS .. "/seg/gain", ctx.seg.gain); ML.bindInputSurfaces(ctx) end
  ctx.widgets.segThreshold._onChange = function(v) ctx.seg.threshold = deps.clamp(v, 0, 1); deps.writeParam(C.NS .. "/seg/threshold", ctx.seg.threshold); ML.bindInputSurfaces(ctx) end
  ctx.widgets.segFeather._onChange = function(v) ctx.seg.feather = deps.clamp(v, 0, 1); deps.writeParam(C.NS .. "/seg/feather", ctx.seg.feather); ML.bindInputSurfaces(ctx) end
  ctx.widgets.segInvert._onChange = function(v) ctx.seg.invert = v == true; deps.writeParam(C.NS .. "/seg/invert", ctx.seg.invert and 1 or 0); ML.bindInputSurfaces(ctx) end
  ctx.widgets.poseConf._onChange = function(v) ctx.poseConf = deps.clamp(v, 0, 1); deps.writeParam(C.NS .. "/pose/confidence", ctx.poseConf) end
  ctx.widgets.showSkeleton._onChange = function(v) ctx.showSkeleton = v == true end
  ctx.widgets.mode._onChange = function(v)
    deps.writeParam(C.NS .. "/mode", v and 1 or 0)
    deps.syncModePanels(ctx)
    deps.refreshWaveform(ctx)
    deps.updatePreviewSurface(ctx)
    deps.layoutOutputRow(ctx)
  end
  ctx.widgets.captureMode._onChange = function(v)
    ctx.captureMode = v and 1 or 0
    deps.writeParam(C.NS .. "/capture_mode", ctx.captureMode)
    if ctx.captureMode ~= 1 then ctx.captureRecording = false end
    deps.setCaptureButtonAppearance(ctx)
  end

  ctx.widgets.sourceSelect._onSelect = function(idx)
    deps.applySourceSelection(ctx, idx)
  end
  ctx.widgets.aspectSelect._onSelect = function(idx)
    deps.applyAspectModeSelection(ctx, idx)
  end
  ctx.widgets.shaderLayer._onSelect = function(idx)
    deps.applyActiveLayerSelection(ctx, idx)
  end
  ctx.widgets.shaderEnabled._onChange = function(v)
    deps.applyShaderEnabledSelection(ctx, v == true)
  end
  ctx.widgets.effectSelect._onSelect = function(idx)
    deps.applyEffectSelection(ctx, idx)
  end
  for p = 1, 9 do
    ctx.widgets["shaderParam" .. p]._onChange = function(v)
      deps.applyShaderParamDisplay(ctx, p, v)
    end
  end
  for pi = 1, 4 do
    local sl = ctx.widgets["sourceParam" .. pi]
    if sl then
      sl._onChange = function(v)
        deps.applySourceParamDisplay(ctx, pi, v)
      end
    end
  end

  for t = 1, C.MAX_MAPPINGS do
    for _, id in ipairs({"mapping" .. t .. "Min", "mapping" .. t .. "Max"}) do
      ctx.widgets[id]._onChange = function(v)
        local track = tonumber(id:match("^mapping(%d+)")) or 1
        local key = id:match("Min$") and "min" or "max"
        ctx.mappings[track][key] = deps.clamp(tonumber(v) or 0, 0, 1)
        deps.writeParam(C.NS .. "/mapping/" .. track .. "/" .. key, ctx.mappings[track][key])
      end
    end
    ctx.widgets["mapping" .. t .. "Enable"]._onChange = function(v)
      ctx.mappings[t].enabled = v == true
      deps.writeParam(C.NS .. "/mapping/" .. t .. "/enabled", ctx.mappings[t].enabled and 1 or 0)
    end
    ctx.widgets["mapping" .. t .. "Source"]._onSelect = function(idx)
      ctx.mappings[t].source = deps.round(idx)
      deps.writeParam(C.NS .. "/mapping/" .. t .. "/source", ctx.mappings[t].source)
    end
    ctx.widgets["mapping" .. t .. "Target"]._onSelect = function(idx)
      local _, targetIndex = Mapping.targetSpec(idx)
      ctx.mappings[t].target = targetIndex
      deps.writeParam(C.NS .. "/mapping/" .. t .. "/target", ctx.mappings[t].target)
    end
    ctx.widgets["mapping" .. t .. "Invert"]._onChange = function(v)
      ctx.mappings[t].invert = v == true
      deps.writeParam(C.NS .. "/mapping/" .. t .. "/invert", ctx.mappings[t].invert and 1 or 0)
    end
  end

  local wf = ctx.widgets.waveform
  if wf then
    if wf.node and wf.node.setInterceptsMouse then wf.node:setInterceptsMouse(true, false) end
    wf._onScrubStart = function() ctx._scrubSlice = nil end
    wf._onScrubSnap = function(pos)
      local p = deps.clamp(pos, 0, 0.999)
      if not ctx._scrubSlice then
        ctx._scrubSlice = deps.nearestSlice(p)
        ctx._selectedSlice = ctx._scrubSlice
        deps.writeParam(C.NS .. "/selected_slice", ctx._selectedSlice)
      end
      deps.writeParam(deps.pathForSlice(ctx._scrubSlice), p)
      deps.refreshWaveform(ctx)
      deps.updatePreviewSurface(ctx)
    end
    wf._onScrubEnd = function() ctx._scrubSlice = nil end
  end
end

return M
