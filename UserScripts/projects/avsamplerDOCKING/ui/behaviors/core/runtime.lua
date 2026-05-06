local C = require("behaviors.core.constants")
local U = require("behaviors.core.util")
local ML = require("behaviors.core.ml")
local Midi = require("behaviors.core.midi")
local Mapping = require("behaviors.core.mapping")
local Sampler = require("behaviors.core.sampler")

local M = {}

function M.syncModePanels(ctx)
  local isSlice = U.round(U.readParam(C.NS .. "/mode", 0)) == 1
  U.setVisible(ctx.widgets.polyEmbed, not isSlice)
  U.setVisible(ctx.widgets.sliceEmbed, isSlice)
  U.setVisible(ctx.widgets.pitchTracking, not isSlice)
  U.setVisible(ctx.widgets.voiceCount, not isSlice)
  U.setVisible(ctx.widgets.playStart, not isSlice)
  U.setVisible(ctx.widgets.loopStart, not isSlice)
  U.setVisible(ctx.widgets.loopEnd, not isSlice)
  U.setVisible(ctx.widgets.crossfade, not isSlice)
  U.setVisible(ctx.widgets.oneShot, not isSlice)
  U.setVisible(ctx.widgets.selectedSlice, isSlice)
  U.setVisible(ctx.widgets.auditionSelected, isSlice)
  U.setVisible(ctx.widgets.sliceHelp, isSlice)
end

function M.syncParamsFromHost(ctx, deps)
  deps.profileStart(ctx, "syncParamsFromHost")
  local changedShader = false
  local oldSeg = { ctx.seg.gain, ctx.seg.threshold, ctx.seg.feather, ctx.seg.invert }
  ctx.seg.gain = U.clamp(U.readParam(C.NS .. "/seg/gain", ctx.seg.gain), 0.25, 4)
  ctx.seg.threshold = U.clamp(U.readParam(C.NS .. "/seg/threshold", ctx.seg.threshold), 0, 1)
  ctx.seg.feather = U.clamp(U.readParam(C.NS .. "/seg/feather", ctx.seg.feather), 0, 1)
  ctx.seg.invert = U.readParam(C.NS .. "/seg/invert", ctx.seg.invert and 1 or 0) > 0.5
  ctx.poseConf = U.clamp(U.readParam(C.NS .. "/pose/confidence", ctx.poseConf), 0, 1)
  if oldSeg[1] ~= ctx.seg.gain or oldSeg[2] ~= ctx.seg.threshold or oldSeg[3] ~= ctx.seg.feather or oldSeg[4] ~= ctx.seg.invert then
    ML.bindInputSurfaces(ctx)
  end
  U.setValueSilently(ctx.widgets.segGain, ctx.seg.gain)
  U.setValueSilently(ctx.widgets.segThreshold, ctx.seg.threshold)
  U.setValueSilently(ctx.widgets.segFeather, ctx.seg.feather)
  U.setValueSilently(ctx.widgets.poseConf, ctx.poseConf)
  U.setValueSilently(ctx.widgets.segInvert, ctx.seg.invert)

  local mode = U.round(U.readParam(C.NS .. "/mode", 0))
  ctx.captureMode = U.round(U.readParam(C.NS .. "/capture_mode", ctx.captureMode or 0))
  ctx._selectedSlice = math.max(1, math.min(C.MAX, U.round(U.readParam(C.NS .. "/selected_slice", ctx._selectedSlice or 1))))
  U.setValueSilently(ctx.widgets.mode, mode > 0.5)
  U.setValueSilently(ctx.widgets.captureMode, ctx.captureMode > 0.5)
  U.setValueSilently(ctx.widgets.captureSeconds, U.clamp(U.readParam(C.NS .. "/capture_seconds", 4), 0.25, C.MAX_CAPTURE_SECONDS))
  U.setValueSilently(ctx.widgets.speed, U.clamp(U.readParam(C.NS .. "/speed", 1), -2, 4))
  U.setValueSilently(ctx.widgets.output, U.clamp(U.readParam(C.NS .. "/output", 0.8), 0, 2))
  U.setValueSilently(ctx.widgets.rootNote, U.clamp(U.readParam(C.NS .. "/root_note", 60), 0, 127))
  U.setValueSilently(ctx.widgets.pitchTracking, U.readParam(C.NS .. "/pitch_tracking", 1) > 0.5)
  U.setValueSilently(ctx.widgets.voiceCount, U.clamp(U.readParam(C.NS .. "/voice_count", C.MAX), 1, C.MAX))
  U.setValueSilently(ctx.widgets.playStart, U.clamp(U.readParam(C.NS .. "/play_start", 0), 0, 1))
  U.setValueSilently(ctx.widgets.loopStart, U.clamp(U.readParam(C.NS .. "/loop_start", 0), 0, 1))
  U.setValueSilently(ctx.widgets.loopEnd, U.clamp(U.readParam(C.NS .. "/loop_end", 1), 0, 1))
  U.setValueSilently(ctx.widgets.crossfade, U.clamp(U.readParam(C.NS .. "/crossfade", 0.03), 0, 0.5))
  U.setValueSilently(ctx.widgets.oneShot, U.readParam(C.NS .. "/one_shot", 0) > 0.5)
  U.setSelectedSilently(ctx.widgets.selectedSlice, ctx._selectedSlice)
  M.syncModePanels(ctx)
  if deps and deps.setCaptureButtonAppearance then
    deps.setCaptureButtonAppearance(ctx)
  else
    Sampler.setCaptureButtonAppearance(ctx)
  end

  local sourceIndex = math.max(1, math.min(#(ctx.sources or {}), U.round(U.readParam(C.NS .. "/shader/source", ctx.shader.sourceIndex))))
  if sourceIndex ~= ctx.shader.sourceIndex then
    ctx.shader.sourceIndex = sourceIndex
    U.setSelectedSilently(ctx.widgets.sourceSelect, sourceIndex)
    local col1spec = deps.currentCol1SourceSpec(ctx)
    if not col1spec or col1spec.kind == "webcam" or col1spec.kind == "generator" then
      ctx._col1SourceSpec = nil
      deps.currentCol1SourceSpec(ctx)
      changedShader = true
    end
    deps.syncShaderSourceParams(ctx)
    if ctx.selection and ctx.selection.col == 1 and ctx.selection.row == 1 then
      ctx.selection = { col = 1, row = 1 }
    end
  end

  local activeLayer = math.max(1, math.min(8, U.round(U.readParam(C.NS .. "/shader/active_layer", ctx.shader.activeLayer))))
  if activeLayer ~= ctx.shader.activeLayer then
    ctx.shader.activeLayer = activeLayer
    deps.syncShaderEditor(ctx)
    if ctx.selection and ctx.selection.col == 1 and ctx.selection.row > 1 then
      ctx.selection = { col = 1, row = 1 + activeLayer }
    end
  end

  for l = 1, 8 do
    local L = ctx.shader.layers[l]
    local en = U.readParam(C.NS .. "/shader/layer/" .. l .. "/enabled", L.enabled and 1 or 0) > 0.5
    local eff = math.max(1, math.min(#(ctx.effects or {}), U.round(U.readParam(C.NS .. "/shader/layer/" .. l .. "/effect", L.effectIndex))))
    if en ~= L.enabled or eff ~= L.effectIndex then L.enabled = en; L.effectIndex = eff; changedShader = true end
    for p = 1, 9 do
      local v = U.clamp(U.readParam(C.NS .. "/shader/layer/" .. l .. "/param/" .. p, L.params[p] or 0.5), 0, 1)
      if math.abs(v - (L.params[p] or 0)) > 0.0001 then L.params[p] = v; changedShader = true end
    end
  end
  if changedShader then deps.updateShader(ctx); deps.syncShaderEditor(ctx) end

  for t = 1, C.MAX_MAPPINGS do
    local m = ctx.mappings[t] or Mapping.defaultMapping(t)
    ctx.mappings[t] = m
    m.enabled = U.readParam(C.NS .. "/mapping/" .. t .. "/enabled", m.enabled and 1 or 0) > 0.5
    m.source = math.max(1, math.min(#ML.POSE_SOURCES, U.round(U.readParam(C.NS .. "/mapping/" .. t .. "/source", m.source or 1))))
    m.target = math.max(1, math.min(#Mapping.TARGETS, U.round(U.readParam(C.NS .. "/mapping/" .. t .. "/target", m.target or 1))))
    m.min = U.clamp(U.readParam(C.NS .. "/mapping/" .. t .. "/min", m.min or 0), 0, 1)
    m.max = U.clamp(U.readParam(C.NS .. "/mapping/" .. t .. "/max", m.max or 1), 0, 1)
    m.invert = U.readParam(C.NS .. "/mapping/" .. t .. "/invert", m.invert and 1 or 0) > 0.5
    U.setValueSilently(ctx.widgets["mapping" .. t .. "Enable"], m.enabled)
    U.setSelectedSilently(ctx.widgets["mapping" .. t .. "Source"], m.source)
    U.setSelectedSilently(ctx.widgets["mapping" .. t .. "Target"], m.target)
    U.setValueSilently(ctx.widgets["mapping" .. t .. "Min"], m.min)
    U.setValueSilently(ctx.widgets["mapping" .. t .. "Max"], m.max)
    U.setValueSilently(ctx.widgets["mapping" .. t .. "Invert"], m.invert)
  end

  ML.bindInputSurfaces(ctx)
  deps.profileEnd(ctx, "syncParamsFromHost")
end

function M.resized(ctx, deps)
  deps.layoutToolbar(ctx)
  ML.ensurePoseOverlay(ctx)
  deps.refreshWaveform(ctx)
  deps.updatePreviewSurface(ctx)
  deps.layoutOutputRow(ctx)
end

function M.update(ctx, deps)
  _G.__avsdCtx = ctx
  deps.profileStart(ctx, "applyCaptureWindow")
  deps.applyCaptureWindow(ctx)
  deps.profileEnd(ctx, "applyCaptureWindow")

  if U.shouldRunInterval(ctx, "paramSync", C.PARAM_SYNC_INTERVAL) then
    deps.syncParamsFromHost(ctx)
  end

  Midi.poll(ctx, { profileStart = deps.profileStart, profileEnd = deps.profileEnd })

  local seams = ctx._testSeams or nil
  local frame = (type(seams) == "table" and type(seams.frameInfo) == "table" and seams.frameInfo) or ((capture and capture.getFrameInfo and capture.getFrameInfo()) or { valid = false })
  local webcamOpen = (capture and capture.isOpen and capture.isOpen()) and true or false
  if type(seams) == "table" and seams.webcamOpen ~= nil then webcamOpen = seams.webcamOpen == true end

  if ctx.videoCap and webcamOpen and U.shouldRunInterval(ctx, "segmentIngest", C.SEGMENT_INGEST_INTERVAL) then
    deps.profileStart(ctx, "segmentIngest")
    local seq = tonumber(frame.sequence)
    if seq == nil or ctx._lastSegmentFrameSeq ~= seq then
      local ok = false
      if type(seams) == "table" and type(seams.capture) == "table" then
        seams.capture.frameCount = math.max(0, U.round(seams.capture.frameCount or 0)) + 1
        seams.capture.lockedWidth = U.round(frame.width or seams.capture.lockedWidth or 0)
        seams.capture.lockedHeight = U.round(frame.height or seams.capture.lockedHeight or 0)
        seams.capture.lastSequence = seq
        ok = true
      elseif ctx.videoCap.ingestSegmentedLatest and ctx._segPipeline then
        ok = ctx.videoCap:ingestSegmentedLatest(ctx._segPipeline, {
          gain = ctx.seg.gain,
          useSigmoid = ctx.seg.useSigmoid,
          threshold = ctx.seg.threshold,
          feather = ctx.seg.feather,
          invert = ctx.seg.invert,
          background = 0.0,
        })
      end
      if not ok and not (type(seams) == "table" and type(seams.capture) == "table") then ctx.videoCap:ingestLatest() end
      if seq ~= nil then ctx._lastSegmentFrameSeq = seq end
    end
    deps.profileEnd(ctx, "segmentIngest")
  end

  local poseUpdated = ML.runPose(ctx, frame)
  if poseUpdated or U.shouldRunInterval(ctx, "mapping", C.POSE_INTERVAL) then
    deps.applyMapping(ctx)
  end

  if U.shouldRunInterval(ctx, "playbackUi", C.PLAYBACK_UI_INTERVAL) then
    deps.profileStart(ctx, "playbackUi")
    ctx._selectedSlice = math.max(1, math.min(C.MAX, U.round(U.readParam(C.NS .. "/selected_slice", ctx._selectedSlice or 1))))
    for i = 1, C.MAX do
      ctx._polyPlaying[i], ctx._polyPos[i] = deps.samplePosition(deps.polyPaths[i], 0)
      ctx._slicePlaying[i], ctx._slicePos[i] = deps.samplePosition(deps.slicePaths[i], U.readParam(deps.pathForSlice(i), (i - 1) / C.MAX))
    end
    deps.layoutOutputRow(ctx)
    deps.updatePreviewSurface(ctx)
    deps.refreshWaveform(ctx)
    deps.profileEnd(ctx, "playbackUi")
  end

  if U.shouldRunInterval(ctx, "status", C.STATUS_INTERVAL) then
    deps.profileStart(ctx, "statusInterval")
    U.setText(ctx.widgets.webcamStatus, string.format("Webcam: %s frame=%s %dx%d seq=%s", webcamOpen and "open" or "closed", frame.valid and "yes" or "no", frame.width or 0, frame.height or 0, tostring(frame.sequence or "--")))
    local clk = (type(seams) == "table" and type(seams.clock) == "table" and seams.clock) or U.clockInfo()
    U.setText(ctx.widgets.clockStatus, string.format("Clock: sr=%.0f samples=%.0f tempo=%.1f", clk.sampleRate or 0, clk.playTimeSamples or 0, clk.tempo or 0))
    U.setText(ctx.widgets.rendererStatus, "Renderer: " .. ((type(getUIRendererMode) == "function" and getUIRendererMode()) or "canvas"))

    local capFrames = (type(seams) == "table" and type(seams.capture) == "table" and U.round(seams.capture.frameCount or 0)) or (ctx.videoCap and ctx.videoCap:getFrameCount() or 0)
    ctx._lockedW = (type(seams) == "table" and type(seams.capture) == "table" and U.round(seams.capture.lockedWidth or ctx._lockedW or 0)) or (ctx.videoCap and ctx.videoCap:getLockedWidth() or ctx._lockedW)
    ctx._lockedH = (type(seams) == "table" and type(seams.capture) == "table" and U.round(seams.capture.lockedHeight or ctx._lockedH or 0)) or (ctx.videoCap and ctx.videoCap:getLockedHeight() or ctx._lockedH)
    local capMB = ((type(seams) == "table" and type(seams.capture) == "table" and tonumber(seams.capture.estimatedBytes or 0)) or (ctx.videoCap and ctx.videoCap:getEstimatedBytes() or 0)) / (1024 * 1024)
    U.setText(ctx.widgets.captureStatus, string.format("Capture ring: %d segmented frames locked %dx%d %.1fMB", capFrames, ctx._lockedW or 0, ctx._lockedH or 0, capMB))
    local sampleFrames = (type(seams) == "table" and type(seams.sampler) == "table" and U.round(seams.sampler.frameCount or 0)) or (ctx.video and ctx.video:getFrameCount() or 0)
    local sampleDuration = (type(seams) == "table" and type(seams.sampler) == "table" and tonumber(seams.sampler.durationSeconds or 0)) or (ctx.video and ctx.video:getDurationSeconds() or 0)
    U.setText(ctx.widgets.samplerStatus, string.format("Sampler: %d frames %.2fs last commit %s visible=%d", sampleFrames, sampleDuration, ctx._lastVideoCommitOk and "OK" or "--", #(ctx._visible or {})))
    U.setText(ctx.widgets.midiStatus, string.format("MIDI: %s last=%s", Midi.currentMidiLabel() or "none", tostring(ctx._lastMidi or "--")))
    U.setText(ctx.widgets.fxStatus, string.format("FX%d type=%d mix=%.2f", ctx.fxSlot, U.round(U.readParam(deps.rackFxTypePath(ctx.fxSlot), 0)), U.readParam(deps.rackFxMixPath(ctx.fxSlot), 0)))
    deps.profileEnd(ctx, "statusInterval")
  end

  deps.updateCompositorThumbnails(ctx)
  deps.updateCompositorOutput(ctx)
end

function M.cleanup(ctx, deps)
  if _G.__avsdCtx == ctx then _G.__avsdCtx = nil end
  if ctx then
    if ctx.video then pcall(function() ctx.video:clear() end) end
    if ctx.videoCap then pcall(function() ctx.videoCap:clear() end) end
  end
  if capture and capture.close then pcall(capture.close) end
  if videoSampler then
    if videoSampler.remove then pcall(videoSampler.remove, deps.videoSamplerId) end
    if videoSampler.removeCapture then pcall(videoSampler.removeCapture, deps.videoCaptureId) end
  end
end

return M
