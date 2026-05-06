-- VideoSliceRackLab — audio authority for an 8-slice video drum rack.
--
-- This is NOT pitch-poly video playback. It is eight independent one-shot slice
-- lanes over the same committed capture. MIDI notes root..root+7 trigger slices
-- 1..8. Each lane has its own SampleRegionPlaybackNode so overlapping slice
-- one-shots are independent and the UI can render active cells from the exact
-- loop-aware audio position of the matching lane.

local NS = "/video_slice_rack_lab"
local MAX_SLICES = 8

local function clamp(v, lo, hi)
  local n = tonumber(v) or 0.0
  if n < lo then return lo end
  if n > hi then return hi end
  return n
end

local function round(v)
  return math.floor((tonumber(v) or 0) + 0.5)
end

local function velocityToGain(v)
  return clamp((tonumber(v) or 0) / 127.0, 0.0, 1.0)
end

local MAJOR_OFFSETS = { 0, 2, 4, 5, 7, 9, 11, 12 }

local function noteToSlice(note, rootNote)
  local n = round(note)
  local root = round(rootNote)
  for i = 1, #MAJOR_OFFSETS do
    if n == root + MAJOR_OFFSETS[i] then return i end
  end
  return nil
end

function buildPlugin(ctx)
  local params = {
    captureSeconds = 4.0,
    speed = 1.0,
    output = 0.8,
    rootNote = 60,
    selectedSlice = 1,
    crossfade = 0.002,
  }

  local sliceStarts = {}
  local sliceVelocity = {}
  for i = 1, MAX_SLICES do
    sliceStarts[i] = (i - 1) / MAX_SLICES
    sliceVelocity[i] = 127
  end

  local input = ctx.primitives.PassthroughNode.new(2)
  local capture = ctx.primitives.RetrospectiveCaptureNode.new(2)
  capture:setCaptureSeconds(30.0)

  local captureSink = ctx.primitives.GainNode.new(2)
  captureSink:setGain(0.0)

  local mixer = ctx.primitives.MixerNode.new()
  mixer:setInputCount(MAX_SLICES)

  local outputGain = ctx.primitives.GainNode.new(2)
  outputGain:setGain(params.output)

  ctx.graph.connect(input, capture)
  ctx.graph.connect(capture, captureSink)
  ctx.graph.connect(mixer, outputGain)

  if ctx.graph.markMonitor then ctx.graph.markMonitor(outputGain) end
  if ctx.graph.markOutput then ctx.graph.markOutput(outputGain) end

  local slices = {}
  for i = 1, MAX_SLICES do
    local sample = ctx.primitives.SampleRegionPlaybackNode.new(2)
    sample:setOneShot(true)
    sample:setSpeed(params.speed)
    sample:setCrossfade(params.crossfade)
    slices[i] = { sample = sample }
    mixer:setGain(i, 0.0)
    mixer:setPan(i, 0.0)
    ctx.graph.connect(sample, mixer, 0, (i - 1) * 2)
  end

  if ctx.graph.nameNode then
    ctx.graph.nameNode(input, NS .. "/input")
    ctx.graph.nameNode(capture, NS .. "/capture")
    ctx.graph.nameNode(captureSink, NS .. "/capture_sink")
    ctx.graph.nameNode(mixer, NS .. "/mixer")
    ctx.graph.nameNode(outputGain, NS .. "/output")
    for i = 1, MAX_SLICES do
      ctx.graph.nameNode(slices[i].sample, NS .. "/slice/" .. i .. "/sample")
    end
  end

  local function sliceEnd(index)
    local start = clamp(sliceStarts[index] or 0.0, 0.0, 0.999)
    local best = 1.0
    for i = 1, MAX_SLICES do
      local other = clamp(sliceStarts[i] or 0.0, 0.0, 1.0)
      if other > start + 0.002 and other < best then
        best = other
      end
    end
    return clamp(best, start + 0.002, 1.0)
  end

  local function applySliceWindow(index)
    local lane = slices[index]
    if not lane then return end
    local start = clamp(sliceStarts[index] or 0.0, 0.0, 0.999)
    local finish = sliceEnd(index)
    lane.sample:setLoopStart(start)
    lane.sample:setLoopEnd(finish)
    lane.sample:setCrossfade(params.crossfade)
    lane.sample:setOneShot(true)
    lane.sample:setSpeed(params.speed)
    if params.speed < 0.0 then
      lane.sample:setPlayStart(clamp(finish - 0.0001, start, finish))
    else
      lane.sample:setPlayStart(start)
    end
  end

  local function applyAllWindows()
    for i = 1, MAX_SLICES do applySliceWindow(i) end
  end

  local function seekSliceStart(index)
    local start = clamp(sliceStarts[index] or 0.0, 0.0, 0.999)
    if params.speed < 0.0 then
      slices[index].sample:seek(clamp(sliceEnd(index) - 0.0001, start, 1.0))
    else
      slices[index].sample:seek(start)
    end
  end

  local function triggerSlice(index, velocity)
    index = math.max(1, math.min(MAX_SLICES, round(index)))
    velocity = round(clamp(velocity or sliceVelocity[index] or 127, 1, 127))
    sliceVelocity[index] = velocity
    params.selectedSlice = index
    applySliceWindow(index)
    mixer:setGain(index, velocityToGain(velocity))
    seekSliceStart(index)
    slices[index].sample:trigger()
  end

  local function stopAll()
    for i = 1, MAX_SLICES do
      slices[i].sample:stop()
      mixer:setGain(i, 0.0)
    end
  end

  local function copyAudioCaptureToSlices()
    local sampleRate = (ctx.host and ctx.host.getSampleRate and tonumber(ctx.host.getSampleRate())) or 44100.0
    local samplesBack = math.max(1, math.floor(params.captureSeconds * sampleRate))
    local captureNode = capture.__node or capture
    local copied = false
    if captureNode and captureNode.copyRecentToLoop then
      for i = 1, MAX_SLICES do
        local sampleNode = slices[i].sample.__node or slices[i].sample
        local ok = captureNode:copyRecentToLoop(sampleNode, samplesBack, false)
        copied = copied or ok == true
      end
    end
    if copied then
      applyAllWindows()
      for i = 1, MAX_SLICES do seekSliceStart(i) end
    end
  end

  local regs = {
    { NS .. "/capture_seconds", 0.25, 6.0, params.captureSeconds },
    { NS .. "/capture_trigger", 0, 1000000, 0 },
    { NS .. "/stop_trigger", 0, 1000000, 0 },
    { NS .. "/speed", -2, 4, params.speed },
    { NS .. "/output", 0, 2, params.output },
    { NS .. "/root_note", 0, 127, params.rootNote },
    { NS .. "/selected_slice", 1, MAX_SLICES, params.selectedSlice },
    { NS .. "/crossfade", 0, 0.05, params.crossfade },
    { NS .. "/midi_note", 0, 127, params.rootNote },
    { NS .. "/midi_velocity", 0, 127, 100 },
    { NS .. "/midi_note_on_trigger", 0, 9000000, 0 },
  }
  for _, r in ipairs(regs) do
    ctx.params.register(r[1], { type = "f", min = r[2], max = r[3], default = r[4] })
  end
  for i = 1, MAX_SLICES do
    ctx.params.register(NS .. "/slice/" .. i .. "/start", { type = "f", min = 0, max = 0.999, default = sliceStarts[i] })
    ctx.params.register(NS .. "/slice/" .. i .. "/trigger", { type = "f", min = 0, max = 1000000, default = 0 })
    ctx.params.register(NS .. "/slice/" .. i .. "/velocity", { type = "f", min = 0, max = 127, default = 127 })
  end

  local captureCounter = 0
  local stopCounter = 0
  local noteTriggerCounter = 0
  local sliceTriggerCounters = {}
  for i = 1, MAX_SLICES do sliceTriggerCounters[i] = 0 end

  local function decodeMidiTrigger(value)
    local code = round(value)
    local payload = code % 16384
    local note = math.floor(payload / 128)
    local velocity = payload % 128
    return note, velocity, code
  end

  local function onParamChange(path, value)
    if path == NS .. "/capture_seconds" then
      params.captureSeconds = clamp(value, 0.25, 6.0)
    elseif path == NS .. "/capture_trigger" then
      local n = round(value)
      if n ~= captureCounter then
        captureCounter = n
        copyAudioCaptureToSlices()
      end
    elseif path == NS .. "/stop_trigger" then
      local n = round(value)
      if n ~= stopCounter then
        stopCounter = n
        stopAll()
      end
    elseif path == NS .. "/speed" then
      params.speed = clamp(value, -2.0, 4.0)
      applyAllWindows()
    elseif path == NS .. "/output" then
      params.output = clamp(value, 0.0, 2.0)
      outputGain:setGain(params.output)
    elseif path == NS .. "/root_note" then
      params.rootNote = round(clamp(value, 0, 127))
    elseif path == NS .. "/selected_slice" then
      params.selectedSlice = math.max(1, math.min(MAX_SLICES, round(value)))
    elseif path == NS .. "/crossfade" then
      params.crossfade = clamp(value, 0.0, 0.05)
      applyAllWindows()
    elseif path == NS .. "/midi_note" then
      -- UI/status mirror only.
    elseif path == NS .. "/midi_velocity" then
      -- UI/status mirror only.
    elseif path == NS .. "/midi_note_on_trigger" then
      local note, velocity, n = decodeMidiTrigger(value)
      if n ~= noteTriggerCounter then
        noteTriggerCounter = n
        local slice = noteToSlice(note, params.rootNote)
        if slice ~= nil then triggerSlice(slice, velocity) end
      end
    else
      for i = 1, MAX_SLICES do
        if path == NS .. "/slice/" .. i .. "/start" then
          sliceStarts[i] = clamp(value, 0.0, 0.999)
          applyAllWindows()
          return
        elseif path == NS .. "/slice/" .. i .. "/velocity" then
          sliceVelocity[i] = round(clamp(value, 0, 127))
          return
        elseif path == NS .. "/slice/" .. i .. "/trigger" then
          local n = round(value)
          if n ~= sliceTriggerCounters[i] then
            sliceTriggerCounters[i] = n
            triggerSlice(i, sliceVelocity[i])
          end
          return
        end
      end
    end
  end

  local function processMidi()
    if not (Midi and Midi.pollInputEvent) then return end
    local consumed = 0
    while consumed < 64 do
      local event = Midi.pollInputEvent()
      if event == nil then break end
      consumed = consumed + 1
      local eventType = tonumber(event.type or 0) or 0
      local note = tonumber(event.data1 or 0) or 0
      local velocity = tonumber(event.data2 or 0) or 0

      if Midi.NOTE_ON and eventType == Midi.NOTE_ON and velocity > 0 then
        local slice = noteToSlice(note, params.rootNote)
        if slice ~= nil then
          triggerSlice(slice, velocity)
        end
      elseif Midi.CONTROL_CHANGE and eventType == Midi.CONTROL_CHANGE and note == 123 then
        stopAll()
      end
    end
  end

  return {
    description = "VideoSliceRackLab DSP authority",
    output = outputGain,
    onParamChange = onParamChange,
    process = function()
      processMidi()
    end,
  }
end
