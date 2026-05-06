local C = require("behaviors.core.constants")
local U = require("behaviors.core.util")

local M = {}

function M.pathForSlice(i) return C.NS .. "/slice/" .. i .. "/start" end
function M.triggerPathForSlice(i) return C.NS .. "/slice/" .. i .. "/trigger" end
function M.velocityPathForSlice(i) return C.NS .. "/slice/" .. i .. "/velocity" end

M.POLY_PATHS, M.SLICE_PATHS = {}, {}
for i = 1, C.MAX do
  M.POLY_PATHS[i] = C.NS .. "/poly/voice/" .. i .. "/sample"
  M.SLICE_PATHS[i] = C.NS .. "/slice/" .. i .. "/sample"
end

function M.applyCaptureWindow(ctx)
  if not ctx.videoCap then return end
  local seconds = U.clamp(U.readParam(C.NS .. "/capture_seconds", 4), 0.25, C.MAX_CAPTURE_SECONDS)
  if ctx._lastCaptureSecondsApplied ~= seconds then
    ctx.videoCap:setCaptureSeconds(seconds)
    ctx._lastCaptureSecondsApplied = seconds
  end
end

function M.applyVideoWindow(ctx)
  if not ctx.video then return end
  ctx.video:setPlayStart(U.clamp(U.readParam(C.NS .. "/play_start", 0), 0, 1))
  ctx.video:setLoopStart(U.clamp(U.readParam(C.NS .. "/loop_start", 0), 0, 1))
  ctx.video:setLoopEnd(U.clamp(U.readParam(C.NS .. "/loop_end", 1), 0, 1))
  ctx.video:setCrossfade(U.clamp(U.readParam(C.NS .. "/crossfade", 0.03), 0, 0.5))
  ctx.video:setOneShot(U.readParam(C.NS .. "/one_shot", 0) > 0.5)
end

function M.doRetroCapture(ctx, secondsOverride)
  if not (ctx.videoCap and ctx.video) then return end
  local previousCaptureSeconds = U.readParam(C.NS .. "/capture_seconds", 4)
  local seconds = U.clamp(secondsOverride or previousCaptureSeconds, 0.25, C.MAX_CAPTURE_SECONDS)
  if secondsOverride ~= nil then U.writeParam(C.NS .. "/capture_seconds", seconds) end
  M.applyCaptureWindow(ctx)
  local clk = U.clockInfo()
  local sr = tonumber(clk.sampleRate) or 44100
  local samplesBack = math.max(1, math.floor(seconds * sr))
  U.bump(C.NS .. "/capture_trigger")
  local seams = ctx._testSeams or nil
  local okVideo = false
  if type(seams) == "table" and (type(seams.capture) == "table" or type(seams.sampler) == "table") then
    seams.capture = type(seams.capture) == "table" and seams.capture or {}
    seams.sampler = type(seams.sampler) == "table" and seams.sampler or {}
    seams.sampler.frameCount = math.max(0, U.round(seams.sampler.frameCount or seams.capture.frameCount or 0))
    seams.sampler.durationSeconds = seconds
    seams.sampler.position = 0
    seams.sampler.playing = false
    seams.sampler.playStart = U.clamp(U.readParam(C.NS .. "/play_start", 0), 0, 1)
    seams.sampler.loopStart = U.clamp(U.readParam(C.NS .. "/loop_start", 0), 0, 1)
    seams.sampler.loopEnd = U.clamp(U.readParam(C.NS .. "/loop_end", 1), 0, 1)
    seams.sampler.crossfade = U.clamp(U.readParam(C.NS .. "/crossfade", 0.03), 0, 0.5)
    seams.sampler.oneShot = U.readParam(C.NS .. "/one_shot", 0) > 0.5
    seams.capture.captureSeconds = seconds
    okVideo = true
  else
    okVideo = ctx.videoCap:copyRecentToSampler(ctx.video, samplesBack)
    ctx.video:seek(0)
    M.applyVideoWindow(ctx)
  end
  ctx._lastCapturedSeconds = seconds
  ctx._lastVideoCommitOk = okVideo == true
  M.refreshWaveform(ctx)
  M.updatePreviewSurface(ctx)
  if secondsOverride ~= nil then
    U.writeParam(C.NS .. "/capture_seconds", previousCaptureSeconds)
    ctx._lastCaptureSecondsApplied = nil
  end
end

function M.setCaptureButtonAppearance(ctx)
  local recording = ctx.captureMode == 1 and ctx.captureRecording == true
  U.setLabel(ctx.widgets.captureNow, recording and "STOP" or "Capture A/V")
  if ctx.widgets.captureNow and ctx.widgets.captureNow.setBg then
    ctx.widgets.captureNow:setBg(recording and 0xffdc2626 or 0xff22c55e)
  end
end

function M.onCaptureButton(ctx)
  ctx.captureMode = U.round(U.readParam(C.NS .. "/capture_mode", ctx.captureMode or 0))
  if ctx.captureMode == 1 then
    if ctx.captureRecording then
      local clk = U.clockInfo()
      local sr = tonumber(clk.sampleRate) or 44100
      local elapsed = math.max(0.25, ((tonumber(clk.playTimeSamples) or 0) - (ctx.freeStartSamples or 0)) / sr)
      ctx.captureRecording = false
      M.doRetroCapture(ctx, elapsed)
      M.setCaptureButtonAppearance(ctx)
    else
      local clk = U.clockInfo()
      ctx.freeStartSamples = tonumber(clk.playTimeSamples) or 0
      ctx.captureRecording = true
      M.setCaptureButtonAppearance(ctx)
    end
  else
    M.doRetroCapture(ctx)
  end
end

function M.samplePosition(path, fallback)
  local seam = _G.__avsdCtx and _G.__avsdCtx._testSeams and _G.__avsdCtx._testSeams.playback
  if type(seam) == "table" then
    local override = seam[path]
    if type(override) == "table" then
      return override.playing == true, U.clamp(override.pos or fallback or 0, 0, 1)
    end
  end
  local playing = false
  if type(isSampleRegionPlaybackPlaying) == "function" then
    local ok, v = pcall(isSampleRegionPlaybackPlaying, path)
    playing = ok and v == true
  end
  local pos = fallback or 0
  if playing and type(getSampleRegionPlaybackLoopAwarePosition) == "function" then
    local ok, v = pcall(getSampleRegionPlaybackLoopAwarePosition, path)
    if ok and tonumber(v) then pos = U.clamp(v, 0, 1) end
  end
  return playing, pos
end

local function setCellSurface(ctx, slot, pos, label)
  local cell = ctx.widgets["cell" .. slot]
  if cell and cell.node and cell.node.setCustomSurface and ctx.video then
    cell.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "sampler", samplerId = ctx.video:getId(), position = U.clamp(pos or 0, 0, 1) })
  end
  local lab = ctx.widgets["cellLabel" .. slot]
  U.setText(lab, label or "")
end

function M.layoutOutputRow(ctx)
  local host = ctx.widgets.outputViewport
  local surface = ctx.widgets.outputSurface
  local x0, y0 = 0, 0
  local w, h = 608, 342
  if surface and surface.node and surface.node.getBounds then
    local sx, sy, sw, sh = surface.node:getBounds()
    x0 = tonumber(sx) or 0
    y0 = tonumber(sy) or 0
    w = tonumber(sw) or w
    h = tonumber(sh) or h
  elseif host and host.node then
    if host.node.getWidth then w = tonumber(host.node:getWidth()) or w end
    if host.node.getHeight then h = tonumber(host.node:getHeight()) or h end
  end
  local frame = (capture and capture.getFrameInfo and capture.getFrameInfo()) or {}
  local ar = (tonumber(frame.width) or ctx._lockedW or 640) / math.max(1, (tonumber(frame.height) or ctx._lockedH or 480))
  local visible = {}
  local mode = U.round(U.readParam(C.NS .. "/mode", 0))
  if mode == 0 then
    for i = 1, C.MAX do if ctx._polyPlaying[i] then visible[#visible + 1] = { kind = "V", index = i, pos = ctx._polyPos[i] or 0 } end end
  else
    for i = 1, C.MAX do if ctx._slicePlaying[i] then visible[#visible + 1] = { kind = "S", index = i, pos = ctx._slicePos[i] or 0 } end end
  end
  ctx._visible = visible
  if #visible == 0 then
    for slot = 1, C.MAX do
      U.setBounds(ctx.widgets["cell" .. slot], 0, 0, 0, 0)
      U.setBounds(ctx.widgets["cellLabel" .. slot], 0, 0, 0, 0)
      U.setText(ctx.widgets["cellLabel" .. slot], "")
    end
    return
  end
  local count = #visible
  local cellW = math.floor(w / count)
  local cellH = math.floor(math.min(h, cellW / math.max(0.01, ar)))
  local y = math.floor(h - cellH)
  for slot = 1, C.MAX do
    local item = visible[slot]
    if item then
      local x = x0 + (slot - 1) * cellW
      local yy = y0 + y
      U.setBounds(ctx.widgets["cell" .. slot], x, yy, cellW, cellH)
      U.setBounds(ctx.widgets["cellLabel" .. slot], x + 8, yy + 8, math.max(1, cellW - 16), 18)
      setCellSurface(ctx, slot, item.pos, string.format("%s%d %.3f", item.kind, item.index, item.pos or 0))
    else
      U.setBounds(ctx.widgets["cell" .. slot], 0, 0, 0, 0)
      U.setBounds(ctx.widgets["cellLabel" .. slot], 0, 0, 0, 0)
      U.setText(ctx.widgets["cellLabel" .. slot], "")
    end
  end
end

function M.updatePreviewSurface(ctx)
  local preview = ctx.widgets.previewStage
  if not (preview and preview.node and preview.node.setCustomSurface and ctx.video) then return end
  local mode = U.round(U.readParam(C.NS .. "/mode", 0))
  local pos = 0
  if mode == 0 then
    for i = 1, C.MAX do
      if ctx._polyPlaying[i] then pos = ctx._polyPos[i] or 0 break end
    end
    if pos <= 0 then pos = U.clamp(U.readParam(C.NS .. "/play_start", 0), 0, 1) end
  else
    local sel = math.max(1, math.min(C.MAX, U.round(ctx._selectedSlice or 1)))
    pos = ctx._slicePos[sel] or U.clamp(U.readParam(M.pathForSlice(sel), (sel - 1) / C.MAX), 0, 0.999)
  end
  preview.node:setCustomSurface("video_input", { version = 2, fitMode = "contain", source = "sampler", samplerId = ctx.video:getId(), position = U.clamp(pos, 0, 1) })
end

function M.refreshWaveform(ctx)
  local wf = ctx.widgets and ctx.widgets.waveform
  if not wf then return end
  local mode = U.round(U.readParam(C.NS .. "/mode", 0))
  if wf.setSamplePath then wf:setSamplePath(mode == 0 and M.POLY_PATHS[1] or M.SLICE_PATHS[1]) end

  local playheads = {}
  if mode == 0 then
    local loopStart = U.clamp(U.readParam(C.NS .. "/loop_start", 0), 0, 0.999)
    local loopEnd = U.clamp(U.readParam(C.NS .. "/loop_end", 1), loopStart + 0.001, 1)
    local playStart = U.clamp(U.readParam(C.NS .. "/play_start", loopStart), loopStart, loopEnd)
    for i = 1, C.MAX do playheads[i] = (ctx._polyPlaying[i] and ctx._polyPos[i]) or -1 end
    if wf.setVoicePlayheads then wf:setVoicePlayheads(playheads) end
    if wf.setVoiceGrains then wf:setVoiceGrains({}) end
    if wf.setGrainPositions then wf:setGrainPositions({ loopStart, playStart, loopEnd }) end
    if wf.setGrainPosition then wf:setGrainPosition(-1) end
    if wf.setRegion then wf:setRegion(loopStart, loopEnd) end
    if wf.setPlayStart then wf:setPlayStart(playStart) end
    if wf.setCrossfade then wf:setCrossfade(U.clamp(U.readParam(C.NS .. "/crossfade", 0.03), 0, 0.5)) end
    local first = -1
    for i = 1, C.MAX do if playheads[i] and playheads[i] >= 0 then first = playheads[i] break end end
    if wf.setPlayheadPos then wf:setPlayheadPos(first >= 0 and first or playStart) end
    U.setText(ctx.widgets.waveformStatus, string.format("Poly: play %.3f | loop %.3f→%.3f | active voice playheads follow SampleRegionPlaybackNode positions", playStart, loopStart, loopEnd))
    return
  end

  local starts = {}
  for i = 1, C.MAX do starts[i] = U.clamp(U.readParam(M.pathForSlice(i), (i - 1) / C.MAX), 0, 0.999) end
  if wf.setGrainPositions then wf:setGrainPositions(starts) end
  if wf.setVoiceGrains then
    local g = {}
    for i = 1, C.MAX do g[i] = { starts[i] } end
    wf:setVoiceGrains(g)
  end
  for i = 1, C.MAX do playheads[i] = (ctx._slicePlaying[i] and ctx._slicePos[i]) or -1 end
  if wf.setVoicePlayheads then wf:setVoicePlayheads(playheads) end
  local sel = math.max(1, math.min(C.MAX, U.round(ctx._selectedSlice or 1)))
  local start = starts[sel] or 0
  local finish = 1.0
  for i = 1, C.MAX do if (starts[i] or 0) > start + 0.002 and starts[i] < finish then finish = starts[i] end end
  if wf.setRegion then wf:setRegion(start, finish) end
  if wf.setPlayStart then wf:setPlayStart(start) end
  if wf.setGrainPosition then wf:setGrainPosition(start) end
  if wf.setCrossfade then wf:setCrossfade(0.002) end
  if wf.setPlayheadPos then wf:setPlayheadPos(playheads[sel] ~= -1 and playheads[sel] or start) end
  U.setText(ctx.widgets.waveformStatus, string.format("Slice: selected S%d %.3f→%.3f | drag nearest marker to edit actual slice start", sel, start, finish))
end

function M.nearestSlice(pos)
  local best, dist = 1, 999
  for i = 1, C.MAX do
    local d = math.abs(U.readParam(M.pathForSlice(i), (i - 1) / C.MAX) - pos)
    if d < dist then best, dist = i, d end
  end
  return best
end

return M
